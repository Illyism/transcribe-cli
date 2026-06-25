import { spawn } from 'child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'

interface ScreenStudioSession {
  durationMs: number
  outputFilename?: string
  processTimeStartMs: number
}

interface ScreenStudioRecorder {
  id: string
  type: string
  sessions?: ScreenStudioSession[]
}

interface ScreenStudioMetadata {
  recorders: ScreenStudioRecorder[]
  sessions?: ScreenStudioSession[]
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = ''
    const proc = spawn(command, args)
    proc.stderr.on('data', (data) => { stderr += data.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}${stderr ? `\n${stderr.trim()}` : ''}`))
    })
    proc.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error(`${command} is not installed`))
      } else {
        reject(err)
      }
    })
  })
}

function isZipFile(path: string): boolean {
  if (!existsSync(path) || statSync(path).isDirectory()) return false
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(4)
    readSync(fd, buf, 0, 4, 0)
    return buf[0] === 0x50 && buf[1] === 0x4b
  } finally {
    closeSync(fd)
  }
}

export function isScreenStudioInput(input: string): boolean {
  return input.toLowerCase().endsWith('.screenstudio')
}

export function getScreenStudioSlug(input: string): string {
  return basename(input).replace(/\.screenstudio$/i, '')
}

async function extractZipBundle(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  await runCommand('unzip', ['-q', zipPath, '-d', destDir])
}

function readMetadata(bundleRoot: string): ScreenStudioMetadata {
  const metadataPath = join(bundleRoot, 'recording', 'metadata.json')
  if (!existsSync(metadataPath)) {
    throw new Error(`Invalid Screen Studio project: missing recording/metadata.json`)
  }
  return JSON.parse(readFileSync(metadataPath, 'utf-8')) as ScreenStudioMetadata
}

function getMicrophonePlaylists(bundleRoot: string, metadata: ScreenStudioMetadata): string[] {
  const recorder = metadata.recorders.find((r) => r.type === 'microphone')
  if (!recorder?.sessions?.length) {
    throw new Error('No microphone audio found in Screen Studio recording')
  }

  const recordingDir = join(bundleRoot, 'recording')
  const playlists = recorder.sessions
    .slice()
    .sort((a, b) => a.processTimeStartMs - b.processTimeStartMs)
    .map((session) => {
      const base = session.outputFilename
        ? session.outputFilename.replace(/\.[^.]+$/, '')
        : null
      if (!base) {
        throw new Error('Screen Studio microphone session is missing outputFilename')
      }
      const m3u8Path = join(recordingDir, `${base}.m3u8`)
      if (!existsSync(m3u8Path)) {
        throw new Error(`Screen Studio audio playlist not found: ${m3u8Path}`)
      }
      return m3u8Path
    })

  return playlists
}

async function transcodePlaylistToMp3(playlistPath: string, outputPath: string): Promise<void> {
  await runCommand('ffmpeg', [
    '-i', playlistPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-q:a', '9',
    '-y',
    outputPath,
  ])
}

async function concatMp3Segments(segmentPaths: string[], outputPath: string): Promise<void> {
  const listPath = join(tmpdir(), `screenstudio_concat_${Date.now()}.txt`)
  const listBody = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
  writeFileSync(listPath, listBody, 'utf-8')

  try {
    await runCommand('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-y',
      outputPath,
    ])
  } finally {
    if (existsSync(listPath)) rmSync(listPath)
  }
}

export async function extractScreenStudioAudio(inputPath: string): Promise<string> {
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }

  let bundleRoot = inputPath
  let extractedDir: string | null = null

  try {
    if (isZipFile(inputPath)) {
      extractedDir = join(tmpdir(), `screenstudio_${Date.now()}`)
      await extractZipBundle(inputPath, extractedDir)
      bundleRoot = extractedDir
    } else if (!existsSync(join(inputPath, 'recording', 'metadata.json'))) {
      throw new Error(`Invalid Screen Studio project: ${inputPath}`)
    }

    const metadata = readMetadata(bundleRoot)
    const playlists = getMicrophonePlaylists(bundleRoot, metadata)
    const slug = getScreenStudioSlug(inputPath)
    const workDir = join(tmpdir(), `screenstudio_audio_${Date.now()}`)
    mkdirSync(workDir, { recursive: true })

    console.log(`🎙️  Extracting Screen Studio microphone audio (${playlists.length} session${playlists.length === 1 ? '' : 's'})...`)

    const segmentPaths: string[] = []
    for (let i = 0; i < playlists.length; i++) {
      const segmentPath = join(workDir, `${slug}_segment_${i}.mp3`)
      await transcodePlaylistToMp3(playlists[i], segmentPath)
      segmentPaths.push(segmentPath)
    }

    const outputPath = join(tmpdir(), `${slug}_${Date.now()}.mp3`)

    if (segmentPaths.length === 1) {
      renameSync(segmentPaths[0], outputPath)
    } else {
      await concatMp3Segments(segmentPaths, outputPath)
    }

    if (existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true })
    }

    console.log('✅ Screen Studio audio extraction complete!')
    return outputPath
  } finally {
    if (extractedDir && existsSync(extractedDir)) {
      rmSync(extractedDir, { recursive: true, force: true })
    }
  }
}
