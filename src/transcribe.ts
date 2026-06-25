import { spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import type { TranscribeOptions, TranscribeResult } from './index'
import { optimizeAudio } from './optimize'
import type { WhisperResponse, WhisperSegment, WhisperWord } from './types'

const MAX_UPLOAD_MB = 24 // Keep under ~25MB Whisper API limit (with headroom)
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const AUTO_CHUNK_MINUTES = 20
const MAX_PARALLEL_CHUNK_TRANSCRIPTIONS = 8

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const millis = Math.floor((seconds % 1) * 1000)
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

function convertSegmentsToSRT(segments: Array<Pick<WhisperSegment, 'start' | 'end' | 'text'>>): string {
  let srt = ''
  
  segments.forEach((segment, index) => {
    srt += `${index + 1}\n`
    srt += `${formatTime(segment.start)} --> ${formatTime(segment.end)}\n`
    srt += `${segment.text.trim()}\n\n`
  })
  
  return srt
}

function transformSegments(
  segments: WhisperSegment[],
  transform: (seconds: number) => number
): WhisperSegment[] {
  return segments.map((segment) => ({
    ...segment,
    start: transform(segment.start),
    end: transform(segment.end),
    words: segment.words?.map((word: WhisperWord) => ({
      ...word,
      start: transform(word.start),
      end: transform(word.end),
    })),
  }))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex++
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))

  return results
}

async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let errorOutput = ''
    
    // Optimize for speech transcription: mono, 16kHz sample rate (Whisper's native)
    // This reduces file size significantly for movies while maintaining dialogue clarity
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-vn',                    // No video
      '-ac', '1',               // Mono (dialogue-focused)
      '-ar', '16000',           // 16kHz sample rate (optimal for speech, reduces size)
      '-acodec', 'libmp3lame',
      '-q:a', '2',              // High quality MP3
      '-y',
      outputPath
    ])
    
    // Capture stderr for error messages
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        // Provide more helpful error messages
        let errorMsg = `FFmpeg exited with code ${code}`
        
        if (errorOutput.includes('Permission denied')) {
          errorMsg += '\nPermission denied. Check file/folder permissions.'
        } else if (errorOutput.includes('No such file or directory')) {
          errorMsg += '\nInput file not found or output directory does not exist.'
        } else if (errorOutput.includes('Invalid data found')) {
          errorMsg += '\nInvalid or corrupted video file.'
        } else if (errorOutput.includes('does not contain any stream')) {
          errorMsg += '\nVideo file does not contain a valid audio or video stream.'
        } else {
          // Show last few lines of FFmpeg output for debugging
          const lines = errorOutput.trim().split('\n')
          const relevantLines = lines.slice(-5).join('\n')
          if (relevantLines) {
            errorMsg += '\n\nFFmpeg output:\n' + relevantLines
          } else {
            errorMsg += '\nFFmpeg conversion failed. Make sure FFmpeg is installed and the video file is valid.'
          }
        }
        
        reject(new Error(errorMsg))
      }
    })
    
    ffmpeg.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error('FFmpeg is not installed. Please install FFmpeg:\n  macOS: brew install ffmpeg\n  Ubuntu: sudo apt-get install ffmpeg\n  Windows: choco install ffmpeg'))
      } else {
        reject(err)
      }
    })
  })
}

async function getMediaDurationSeconds(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ])

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim())
        if (!Number.isFinite(duration)) {
          reject(new Error(`FFprobe returned invalid duration for: ${inputPath}`))
          return
        }
        resolve(duration)
      } else {
        reject(new Error(`FFprobe failed with code ${code}${stderr ? `\n\nFFprobe output:\n${stderr.trim()}` : ''}`))
      }
    })

    ffprobe.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error('FFprobe is not installed. Please install FFmpeg (includes ffprobe):\n  macOS: brew install ffmpeg\n  Ubuntu: sudo apt-get install ffmpeg\n  Windows: choco install ffmpeg'))
      } else {
        reject(err)
      }
    })
  })
}

async function splitAudioIntoChunks(inputPath: string, chunkSeconds: number): Promise<string[]> {
  if (!Number.isFinite(chunkSeconds) || chunkSeconds <= 0) {
    throw new Error(`Invalid chunkSeconds: ${chunkSeconds}`)
  }

  const ext = inputPath.toLowerCase().split('.').pop() || 'mp3'
  const dir = dirname(inputPath)
  const prefix = `chunks_${Date.now()}`
  const outputPattern = join(dir, `${prefix}_%03d.${ext}`)

  await new Promise<void>((resolve, reject) => {
    let stderr = ''

    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-f', 'segment',
      '-segment_time', String(chunkSeconds),
      '-reset_timestamps', '1',
      '-c', 'copy',
      '-y',
      outputPattern,
    ])

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg chunking failed with code ${code}${stderr ? `\n\nFFmpeg output:\n${stderr.trim().split('\n').slice(-8).join('\n')}` : ''}`))
      }
    })

    ffmpeg.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error('FFmpeg is not installed. Please install FFmpeg:\n  macOS: brew install ffmpeg\n  Ubuntu: sudo apt-get install ffmpeg\n  Windows: choco install ffmpeg'))
      } else {
        reject(err)
      }
    })
  })

  const created = readdirSync(dir)
    .filter((name) => name.startsWith(`${prefix}_`) && name.toLowerCase().endsWith(`.${ext}`))
    .sort()
    .map((name) => join(dir, name))

  if (created.length === 0) {
    throw new Error('Chunking produced no output files. Please try again.')
  }

  // Sanity check: if any chunk is still too large, give actionable guidance
  const tooLarge = created.find((p) => statSync(p).size > MAX_UPLOAD_BYTES)
  if (tooLarge) {
    throw new Error(
      `Audio chunk is still too large for Whisper API (~${MAX_UPLOAD_MB}MB).\n\n` +
      `Chunk: ${tooLarge}\n\n` +
      `Try:\n` +
      `- removing --raw (use default optimization)\n` +
      `- or using a smaller chunk size (e.g. --chunk-minutes 10)\n`
    )
  }

  return created
}

async function transcribeWithWhisper(audioPath: string, apiKey: string): Promise<WhisperResponse> {
  const { default: OpenAI, toFile } = await import('openai')
  const openai = new OpenAI({ apiKey })
  
  // Read file as buffer and use SDK's toFile helper to create proper File object
  const fs = await import('fs/promises')
  const { basename } = await import('path')
  const fileBuffer = await fs.readFile(audioPath)
  const fileName = basename(audioPath)
  
  const ext = fileName.toLowerCase().split('.').pop()
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
  }
  const mimeType = (ext && mimeTypes[ext]) || 'application/octet-stream'

  // Use SDK's toFile helper to create a proper File object
  const audioFile = await toFile(fileBuffer, fileName, { type: mimeType })
  
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment']
  })
  
  return transcription as WhisperResponse
}

/**
 * Transcribe an audio or video file to SRT format
 * 
 * @param options - Transcription options
 * @returns Transcription result with path to SRT file and transcription details
 * 
 * @example
 * ```typescript
 * import { transcribe } from '@magicspace/transcribe'
 * 
 * const result = await transcribe({
 *   inputPath: '/path/to/video.mp4',
 *   apiKey: 'sk-...'
 * })
 * 
 * console.log('SRT saved to:', result.srtPath)
 * console.log('Language:', result.language)
 * console.log('Duration:', result.duration)
 * ```
 */
export async function transcribe(options: TranscribeOptions): Promise<TranscribeResult> {
  const { inputPath, apiKey, outputPath, optimize = true, offsetSeconds = 0, chunkMinutes } = options
  
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }
  
  if (!apiKey) {
    throw new Error('API key is required. Provide it in options or set OPENAI_API_KEY environment variable.')
  }
  
  const ext = inputPath.toLowerCase().split('.').pop()
  const supportedFormats = ['mp4', 'mp3', 'wav', 'm4a', 'webm', 'ogg', 'opus', 'mov', 'avi', 'mkv']
  
  if (!ext || !supportedFormats.includes(ext)) {
    throw new Error(`Unsupported format. Supported formats: ${supportedFormats.join(', ')}`)
  }
  
  let audioPath = inputPath
  let tempAudioPath: string | null = null
  let optimizedPath: string | null = null
  let chunkPaths: string[] = []
  let speedFactor = 1.0
  
  // Extract audio if it's a video file
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    console.log('🎬 Extracting audio from video...')
    const dir = dirname(inputPath)
    const baseName = basename(inputPath, extname(inputPath))
    tempAudioPath = join(dir, `${baseName}_temp.mp3`)
    
    await extractAudio(inputPath, tempAudioPath)
    console.log('✅ Audio extraction complete!')
    audioPath = tempAudioPath
  }
  
  try {
    // Optimize audio if enabled
    if (optimize) {
      const optimized = await optimizeAudio(audioPath)
      if (optimized.path !== audioPath) {
        optimizedPath = optimized.path
        audioPath = optimized.path
      }
      speedFactor = optimized.speedFactor
    }

    const chunkMinutesToUse = chunkMinutes ?? AUTO_CHUNK_MINUTES
    const durationOptimized = await getMediaDurationSeconds(audioPath)
    const durationOriginal = durationOptimized * speedFactor

    if (offsetSeconds !== 0) {
      console.log(`🕒 Applying timestamp offset: ${offsetSeconds}s`)
    }

    let mergedSegments: WhisperSegment[] = []
    let mergedText = ''
    let language = 'unknown'
    let originalDurationSeconds = durationOriginal

    const chunkSecondsOriginal = Math.max(60, chunkMinutesToUse * 60)
    const chunkSecondsOptimized = chunkSecondsOriginal / speedFactor

    console.log(`🧩 Chunking for reliability: ~${chunkMinutesToUse} min chunks (${chunkSecondsOriginal}s)`)
    chunkPaths = await splitAudioIntoChunks(audioPath, chunkSecondsOptimized)
    console.log(`✅ Created ${chunkPaths.length} chunks`)

    const chunkDurations = await Promise.all(chunkPaths.map((chunkPath) => getMediaDurationSeconds(chunkPath)))
    let totalOptimizedSeconds = 0
    const chunkOffsets = chunkDurations.map((duration) => {
      const offset = totalOptimizedSeconds
      totalOptimizedSeconds += duration
      return offset
    })

    const chunkConcurrency = Math.min(MAX_PARALLEL_CHUNK_TRANSCRIPTIONS, chunkPaths.length)
    console.log(`🎙️  Transcribing ${chunkPaths.length} chunks with up to ${chunkConcurrency} parallel requests...`)

    const chunkTranscriptions = await mapWithConcurrency(chunkPaths, chunkConcurrency, async (chunkPath, i) => {
      console.log(`🎙️  Transcribing chunk ${i + 1}/${chunkPaths.length}...`)
      return transcribeWithWhisper(chunkPath, apiKey)
    })

    for (let i = 0; i < chunkTranscriptions.length; i++) {
      const chunkTranscription = chunkTranscriptions[i]
      const offsetOptimizedSeconds = chunkOffsets[i]

      if (i === 0) {
        language = chunkTranscription.language
      }

      mergedText += chunkTranscription.text + '\n'

      const transformed = transformSegments(chunkTranscription.segments, (t) => {
        // chunk audio timestamps are in optimized time; map to global original timeline:
        // (localChunkTime + chunkOffsetOptimized) * speedFactor + userOffsetSeconds
        return (t + offsetOptimizedSeconds) * speedFactor + offsetSeconds
      })

      mergedSegments.push(...transformed)
    }

    originalDurationSeconds = totalOptimizedSeconds * speedFactor
    console.log(`✅ Transcription complete! Language: ${language}, Duration: ${originalDurationSeconds.toFixed(2)}s`)

    // Sort segments by start time (important for chunked transcriptions)
    mergedSegments.sort((a, b) => a.start - b.start)

    // Convert to SRT format
    const srt = convertSegmentsToSRT(mergedSegments)

    // Save SRT file (ensure directory exists)
    const defaultSrtPath = join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.srt`)
    const srtPath = outputPath || defaultSrtPath
    mkdirSync(dirname(srtPath), { recursive: true })
    await writeFile(srtPath, srt, 'utf-8')

    return {
      srtPath,
      text: mergedText.trim(),
      language,
      duration: originalDurationSeconds
    }
  } finally {
    // Clean up temporary files
    for (const chunkPath of chunkPaths) {
      if (chunkPath && existsSync(chunkPath)) {
        unlinkSync(chunkPath)
      }
    }
    if (tempAudioPath && existsSync(tempAudioPath)) {
      unlinkSync(tempAudioPath)
    }
    if (optimizedPath && existsSync(optimizedPath)) {
      unlinkSync(optimizedPath)
    }
    if (chunkPaths.length || tempAudioPath || optimizedPath) {
      console.log('🧹 Cleaned up temporary files')
    }
  }
}
