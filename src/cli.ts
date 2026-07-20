#!/usr/bin/env node

/**
 * Transcribe audio/video files to SRT format
 * 
 * Usage: transcribe <path-to-file>
 * 
 * Supports: .mp4, .mp3, .wav, .m4a, .webm, .ogg
 * Requires: OPENAI_API_KEY environment variable
 */

import { cancel, intro, isCancel, log, multiselect, outro, select } from '@clack/prompts'
import { existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, join, resolve } from 'path'
import { extractScreenStudioAudio, getScreenStudioSlug, isScreenStudioInput } from './screenstudio'
import { transcribe } from './transcribe'
import { downloadRemoteAudio, getRemoteMediaSlug, isRemoteMediaUrl, isYouTubeUrl } from './youtube'

const SUPPORTED_EXTENSIONS = new Set([
  '.mp4', '.mp3', '.wav', '.m4a', '.webm', '.ogg', '.opus', '.mov', '.avi', '.mkv', '.screenstudio',
])

function parseTimeToSeconds(input: string): number {
  const raw = input.trim()
  if (!raw) {
    throw new Error('Invalid time format: empty value')
  }

  // Seconds (supports negatives and decimals)
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw)
  }

  // HH:MM:SS(.mmm) or MM:SS(.mmm)
  const normalized = raw.replace(',', '.')
  const parts = normalized.split(':')

  const parsePart = (value: string) => {
    const n = parseFloat(value)
    if (!Number.isFinite(n)) throw new Error(`Invalid time format: ${input}`)
    return n
  }

  if (parts.length === 2) {
    const mm = parsePart(parts[0])
    const ss = parsePart(parts[1])
    return mm * 60 + ss
  }

  if (parts.length === 3) {
    const hh = parsePart(parts[0])
    const mm = parsePart(parts[1])
    const ss = parsePart(parts[2])
    return hh * 3600 + mm * 60 + ss
  }

  throw new Error(`Invalid time format: ${input}\nUse seconds (123.45) or HH:MM:SS(.mmm)`)
}

function getApiKey(): string {
  // Try environment variable first
  let apiKey = process.env.OPENAI_API_KEY
  
  if (!apiKey) {
    // Try reading from config file in home directory
    try {
      const configPath = join(homedir(), '.transcribe', 'config.json')
      if (existsSync(configPath)) {
        const config = require(configPath)
        apiKey = config.apiKey
      }
    } catch (error) {
      // Config file doesn't exist or is invalid
    }
  }
  
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY not found.\n\n' +
      '🔑 Get your API key: https://platform.openai.com/api-keys\n\n' +
      'Then set it using ONE of these methods:\n\n' +
      '1️⃣  Environment variable (recommended for one-time use):\n' +
      '   export OPENAI_API_KEY=sk-...\n\n' +
      '2️⃣  Config file (recommended for permanent setup):\n' +
      '   mkdir -p ~/.transcribe\n' +
      '   echo \'{"apiKey": "sk-..."}\' > ~/.transcribe/config.json\n\n' +
      '📚 Full setup guide: https://github.com/Illyism/transcribe-cli#configuration'
    )
  }
  
  return apiKey
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function listMediaFilesInDir(dirPath: string): string[] {
  return readdirSync(dirPath)
    .filter((name) => {
      const fullPath = join(dirPath, name)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          return name.toLowerCase().endsWith('.screenstudio')
        }
        return SUPPORTED_EXTENSIONS.has(extname(name).toLowerCase())
      } catch {
        return false
      }
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => join(dirPath, name))
}

async function promptFolderSelection(files: string[]): Promise<string[]> {
  intro(`Found ${files.length} media file${files.length === 1 ? '' : 's'} in folder`)

  const mode = await select({
    message: 'How do you want to select files?',
    options: [
      { value: 'all', label: `Select all (${files.length})`, hint: 'transcribe every file' },
      { value: 'choose', label: 'Choose individually', hint: 'space to toggle, enter to confirm' },
      { value: 'cancel', label: 'Cancel' },
    ],
  })

  if (isCancel(mode) || mode === 'cancel') {
    cancel('Cancelled.')
    process.exit(0)
  }

  if (mode === 'all') {
    return files
  }

  const options = files.map((filePath) => {
    const name = basename(filePath)
    let hint: string | undefined
    try {
      const size = formatFileSize(statSync(filePath).size)
      const srtPath = join(filePath, '..', `${basename(filePath, extname(filePath))}.srt`)
      hint = existsSync(srtPath) ? `${size} · has .srt` : size
    } catch {
      hint = undefined
    }
    return { value: filePath, label: name, hint }
  })

  const selected = await multiselect({
    message: 'Select files to transcribe',
    options,
    initialValues: files,
    required: true,
  })

  if (isCancel(selected)) {
    cancel('Cancelled.')
    process.exit(0)
  }

  return selected as string[]
}

interface CliOptions {
  useRaw: boolean
  outputArg: string | null
  offsetSeconds?: number
  chunkMinutes?: number
}

async function transcribeOne(
  input: string,
  apiKey: string,
  options: CliOptions,
  outputOverride?: string,
): Promise<{ srtPath: string; text: string; language: string; duration: number }> {
  let inputPath = input
  let downloadedFile: string | null = null
  let remoteMediaSlug: string | null = null
  let screenStudioSlug: string | null = null
  let isScreenStudio = false
  let outputPath: string | undefined = outputOverride

  try {
    if (isRemoteMediaUrl(input) || isYouTubeUrl(input)) {
      remoteMediaSlug = getRemoteMediaSlug(input)
      downloadedFile = await downloadRemoteAudio(input)
      inputPath = downloadedFile
      if (!options.outputArg && !outputOverride && remoteMediaSlug) {
        outputPath = join(process.cwd(), `${remoteMediaSlug}.srt`)
      }
    } else if (isScreenStudioInput(input)) {
      isScreenStudio = true
      screenStudioSlug = getScreenStudioSlug(input)
      downloadedFile = await extractScreenStudioAudio(input)
      inputPath = downloadedFile
      if (!options.outputArg && !outputOverride) {
        outputPath = join(process.cwd(), `${screenStudioSlug}.srt`)
      }
    } else if (!existsSync(inputPath)) {
      throw new Error(`File not found: ${inputPath}`)
    }

    if (options.outputArg && !outputOverride) {
      if (options.outputArg.toLowerCase().endsWith('.srt')) {
        outputPath = options.outputArg
      } else {
        const base = remoteMediaSlug || screenStudioSlug || basename(input, extname(input))
        outputPath = join(options.outputArg, `${base}.srt`)
      }
    }

    return await transcribe({
      inputPath,
      apiKey,
      optimize: isScreenStudio ? false : !options.useRaw,
      outputPath,
      offsetSeconds: options.offsetSeconds,
      chunkMinutes: options.chunkMinutes,
    })
  } finally {
    if (downloadedFile && existsSync(downloadedFile)) {
      unlinkSync(downloadedFile)
      console.log('🧹 Cleaned up downloaded file')
    }
  }
}

function printResult(result: { srtPath: string; text: string; language: string; duration: number }) {
  console.log(`\n✅ SRT file saved to: ${result.srtPath}`)
  console.log(`\nTranscription preview:`)
  console.log('─'.repeat(60))
  console.log(result.text.substring(0, 500) + (result.text.length > 500 ? '...' : ''))
  console.log('─'.repeat(60))
  console.log(`\nLanguage: ${result.language}`)
  console.log(`Duration: ${result.duration.toFixed(2)}s`)
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Transcribe - Audio/Video to SRT

Usage: transcribe <path-to-file-url-or-folder> [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version
  --raw          Disable optimizations (use original audio)
  -o, --output   Output .srt path (file) OR output directory (folder)
  --offset       Shift subtitle timestamps (seconds or HH:MM:SS.mmm)
  --chunk-minutes  Force chunking into N-minute pieces (helps long movies)

Examples:
  transcribe video.mp4
  transcribe audio.mp3
  transcribe /path/to/podcast.wav
  transcribe ./day-9
  transcribe https://www.youtube.com/watch?v=VIDEO_ID
  transcribe https://x.com/MTSlive/status/2059310566783467782
  transcribe recording.screenstudio
  transcribe large-video.mp4 --raw
  transcribe movie.mkv --offset 01:00:00.000
  transcribe movie.mkv --output ./subs
  transcribe long_movie.mkv --chunk-minutes 15

Folders:
  • Pass a folder to bulk-transcribe media inside it
  • Interactive prompt: select all, or choose files individually
  • Each .srt is written next to its source file (or into -o)

Optimizations (enabled by default, except Screen Studio):
  • 1.2x speed: Faster processing, 99.5% size reduction
  • Automatic timestamp adjustment to original speed
  • Use --raw to disable and use original audio
  • Screen Studio recordings always use original audio

Chunking (always enabled):
  • Media is split into ~20 minute chunks by default for reliability
  • Use --chunk-minutes to override chunk size

Supported formats: mp4, mp3, wav, m4a, webm, ogg, opus, mov, avi, mkv, screenstudio
Remote URLs: YouTube, X/Twitter, and other sites supported by yt-dlp

Configuration:
  Set OPENAI_API_KEY environment variable or create ~/.transcribe/config.json
    `)
    process.exit(0)
  }
  
  if (args.includes('--version') || args.includes('-v')) {
    const pkg = require('../package.json')
    console.log(pkg.version)
    process.exit(0)
  }
  
  let input: string | null = null
  let useRaw = false
  let outputArg: string | null = null
  let offsetSeconds: number | undefined
  let chunkMinutes: number | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--raw') {
      useRaw = true
      continue
    }

    if (arg === '--output' || arg === '-o') {
      outputArg = args[i + 1] || null
      i++
      continue
    }

    if (arg === '--offset') {
      const raw = args[i + 1]
      if (!raw) {
        console.error('Error: --offset requires a value (seconds or HH:MM:SS.mmm)')
        process.exit(1)
      }
      offsetSeconds = parseTimeToSeconds(raw)
      i++
      continue
    }

    if (arg === '--chunk-minutes') {
      const raw = args[i + 1]
      if (!raw) {
        console.error('Error: --chunk-minutes requires a number')
        process.exit(1)
      }
      const n = parseFloat(raw)
      if (!Number.isFinite(n) || n <= 0) {
        console.error('Error: --chunk-minutes must be a positive number')
        process.exit(1)
      }
      chunkMinutes = n
      i++
      continue
    }

    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option: ${arg}\nRun: transcribe --help`)
      process.exit(1)
    }

    if (!input) {
      input = arg
      continue
    }
  }

  if (!input) {
    console.error('Error: Missing input file, folder, or URL\nRun: transcribe --help')
    process.exit(1)
  }

  const options: CliOptions = { useRaw, outputArg, offsetSeconds, chunkMinutes }
  
  try {
    const apiKey = getApiKey()
    const resolvedInput = resolve(input)

    // Folder bulk mode (not a Screen Studio bundle)
    if (
      existsSync(resolvedInput) &&
      statSync(resolvedInput).isDirectory() &&
      !isScreenStudioInput(resolvedInput)
    ) {
      const mediaFiles = listMediaFilesInDir(resolvedInput)
      if (mediaFiles.length === 0) {
        console.error(`Error: No supported media files found in: ${resolvedInput}`)
        process.exit(1)
      }

      const selected = await promptFolderSelection(mediaFiles)
      if (selected.length === 0) {
        cancel('No files selected.')
        process.exit(0)
      }

      log.info(`Transcribing ${selected.length} file${selected.length === 1 ? '' : 's'}...`)

      let succeeded = 0
      let failed = 0
      const failures: Array<{ file: string; error: string }> = []

      for (let i = 0; i < selected.length; i++) {
        const filePath = selected[i]
        const name = basename(filePath)
        console.log(`\n📦 [${i + 1}/${selected.length}] ${name}`)

        try {
          let outputPath: string | undefined
          if (outputArg) {
            if (outputArg.toLowerCase().endsWith('.srt')) {
              console.error('Error: For folder input, --output must be a directory (not a .srt file)')
              process.exit(1)
            }
            outputPath = join(outputArg, `${basename(filePath, extname(filePath))}.srt`)
          } else {
            // Default: write .srt next to each source file
            outputPath = join(filePath, '..', `${basename(filePath, extname(filePath))}.srt`)
          }

          const result = await transcribeOne(filePath, apiKey, options, outputPath)
          console.log(`✅ Saved: ${result.srtPath}`)
          succeeded++
        } catch (error) {
          failed++
          const message = error instanceof Error ? error.message : String(error)
          failures.push({ file: name, error: message })
          console.error(`❌ Failed: ${name}\n   ${message}`)
        }
      }

      outro(`Done: ${succeeded} succeeded, ${failed} failed`)
      if (failures.length > 0) {
        console.log('\nFailures:')
        for (const f of failures) {
          console.log(`  • ${f.file}: ${f.error}`)
        }
        process.exit(1)
      }
      return
    }

    const result = await transcribeOne(input, apiKey, options)
    printResult(result)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
