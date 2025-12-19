#!/usr/bin/env node

/**
 * Transcribe audio/video files to SRT format
 * 
 * Usage: transcribe <path-to-file>
 * 
 * Supports: .mp4, .mp3, .wav, .m4a, .webm, .ogg
 * Requires: OPENAI_API_KEY environment variable
 */

import { existsSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, join } from 'path'
import { transcribe } from './transcribe'
import { downloadYouTubeAudio, getVideoId, isYouTubeUrl } from './youtube'

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

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Transcribe - Audio/Video to SRT

Usage: transcribe <path-to-file-or-youtube-url> [options]

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
  transcribe https://www.youtube.com/watch?v=VIDEO_ID
  transcribe large-video.mp4 --raw
  transcribe movie.mkv --offset 01:00:00.000
  transcribe movie.mkv --output ./subs
  transcribe long_movie.mkv --chunk-minutes 15

Optimizations (enabled by default):
  • 1.2x speed: Faster processing, 99.5% size reduction
  • Automatic timestamp adjustment to original speed
  • Use --raw to disable and use original audio

Long movies:
  • Chunking is automatically enabled for long inputs to improve reliability.
  • Use --chunk-minutes to override.

Supported formats: mp4, mp3, wav, m4a, webm, ogg, opus, mov, avi, mkv
YouTube: youtube.com, youtu.be, youtube.com/shorts

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
    console.error('Error: Missing input file or YouTube URL\nRun: transcribe --help')
    process.exit(1)
  }
  
  let inputPath = input
  let downloadedFile: string | null = null
  let youtubeVideoId: string | null = null
  let outputPath: string | undefined
  
  try {
    const apiKey = getApiKey()
    
    // Check if input is a YouTube URL
    if (isYouTubeUrl(input)) {
      youtubeVideoId = getVideoId(input)
      downloadedFile = await downloadYouTubeAudio(input)
      inputPath = downloadedFile
      // Default YouTube output to current working directory (temp downloads are cleaned up)
      if (!outputArg && youtubeVideoId) {
        outputPath = join(process.cwd(), `youtube_${youtubeVideoId}.srt`)
      }
    } else if (!existsSync(inputPath)) {
      console.error(`Error: File not found: ${inputPath}`)
      process.exit(1)
    }

    // Resolve output argument:
    // - if ends with .srt, treat as file path
    // - otherwise treat as directory and write <inputBase>.srt inside it
    if (outputArg) {
      if (outputArg.toLowerCase().endsWith('.srt')) {
        outputPath = outputArg
      } else {
        const base = youtubeVideoId ? `youtube_${youtubeVideoId}` : basename(input, extname(input))
        outputPath = join(outputArg, `${base}.srt`)
      }
    }
    
    const result = await transcribe({ 
      inputPath, 
      apiKey,
      optimize: !useRaw,
      outputPath,
      offsetSeconds,
      chunkMinutes,
    })
    
    console.log(`\n✅ SRT file saved to: ${result.srtPath}`)
    console.log(`\nTranscription preview:`)
    console.log('─'.repeat(60))
    console.log(result.text.substring(0, 500) + (result.text.length > 500 ? '...' : ''))
    console.log('─'.repeat(60))
    console.log(`\nLanguage: ${result.language}`)
    console.log(`Duration: ${result.duration.toFixed(2)}s`)
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  } finally {
    // Clean up downloaded YouTube file
    if (downloadedFile && existsSync(downloadedFile)) {
      unlinkSync(downloadedFile)
      console.log('🧹 Cleaned up downloaded file')
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
