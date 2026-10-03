import { spawn } from 'child_process'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { describeSettings, isChatModel, resolveSettings, type Route } from './config'
import type { TranscribeOptions, TranscribeResult } from './index'
import {
  applyRefinedCueTexts,
  convertSegmentsToSRT,
  parseSRT,
  synthesizeSegmentsFromWords,
  toOriginalTimeline,
  transformSegments,
  wordsFromTranscription,
} from './srt'
import type { WhisperResponse, WhisperSegment } from './types'

const MAX_UPLOAD_MB = 24 // Keep under ~25MB Whisper API limit (with headroom)
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const AUTO_CHUNK_MINUTES = 20
const MAX_PARALLEL_CHUNK_TRANSCRIPTIONS = 8
const AUTOFIX_CUE_BATCH_SIZE = 40
const MAX_PARALLEL_AUTOFIX_BATCHES = 4
const AUTOFIX_AUDIO_PADDING_SECONDS = 1

const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
}

function audioMimeType(audioPath: string): string {
  const ext = audioPath.toLowerCase().split('.').pop()
  return (ext && AUDIO_MIME_TYPES[ext]) || 'application/octet-stream'
}

function toAudioDataUri(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

/** Cut [startSeconds, endSeconds] out of an audio file as a small mono MP3, in memory. */
async function sliceAudio(audioPath: string, startSeconds: number, endSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const ffmpeg = spawn('ffmpeg', [
      '-v', 'error',
      '-ss', String(Math.max(0, startSeconds)),
      '-t', String(endSeconds - Math.max(0, startSeconds)),
      '-i', audioPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-acodec', 'libmp3lame',
      '-q:a', '5',
      '-f', 'mp3',
      'pipe:1',
    ])

    ffmpeg.stdout.on('data', (data) => chunks.push(data))
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`FFmpeg slice exited with code ${code}`))
    })
  })
}

async function createClient(route: Route) {
  const { default: OpenAI } = await import('openai')
  return new OpenAI({
    apiKey: route.apiKey,
    ...(route.baseURL ? { baseURL: route.baseURL } : {}),
  })
}

/** Models sometimes wrap SRT output in a markdown code fence */
function stripCodeFence(content: string): string {
  return content
    .replace(/^```(?:srt)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()
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

async function refineSegmentsWithLLM(
  audioPath: string,
  rawSegments: WhisperSegment[],
  route: Route,
  diarize?: boolean
): Promise<WhisperSegment[]> {
  if (!rawSegments || rawSegments.length === 0) return rawSegments

  const openai = await createClient(route)

  const diarizationInstructions =
    diarize === false
      ? ''
      : '- If multiple speakers are detected in the conversation, naturally label each speaker at speaker turns (e.g. [Speaker 1]: ..., [Speaker 2]: ... or by name if clearly addressed).\n'

  const batches: WhisperSegment[][] = []
  for (let i = 0; i < rawSegments.length; i += AUTOFIX_CUE_BATCH_SIZE) {
    batches.push(rawSegments.slice(i, i + AUTOFIX_CUE_BATCH_SIZE))
  }

  console.log(
    batches.length > 1
      ? `✨ Autofix pass (${route.model}, ${rawSegments.length} cues in ${batches.length} batches)...`
      : `✨ Autofix pass (${route.model})...`
  )

  // Each batch is independent: it hears only its own stretch of audio, and a
  // failed batch keeps its original text without affecting the others.
  const corrected = await mapWithConcurrency(batches, MAX_PARALLEL_AUTOFIX_BATCHES, async (batch, batchIndex) => {
    const label = `Autofix batch ${batchIndex + 1}/${batches.length}`
    const prompt = `You are an expert audio transcription proofreader, domain terminology specialist, and speaker diarization assistant.
You are given a draft SRT subtitle transcript generated by an acoustic Speech-to-Text model with precise timestamps but containing phonetic mishearings, garbled business/tech jargon, brand names, and slang.

Instructions:
- Review the draft SRT and context.
- Fix all phonetic mishearings, domain terms, brands, tools, frameworks, and metrics (e.g. pull requests, Cursor, Neovim, Tailwind, GLP-1, Ahrefs, AdSpy, Substack, CPM numbers, conversion funnels).
- Correct brand and product spelling in place (e.g. PicSpot, PicSpot.co, Pixieset, Pic-Time, SmugMug, Pic-Flow, ShootProof, Ahrefs). If a cue has a hostname and TLD as separate words (picspot co), write them as one domain (PicSpot.co).
- Do not add a period between a brand and its TLD. Never turn "PicSpot.co" into "Picspot." / "co".
${diarizationInstructions}- You MUST return exactly ${batch.length} cues. Do not add, delete, merge, or split cues.
- STRICTLY PRESERVE all original SRT cue indices and timestamp ranges (HH:MM:SS,mmm --> HH:MM:SS,mmm). Do not change, delete, or shift timestamps.
- Return ONLY the corrected SRT subtitle content without markdown code blocks, explanation, or extra commentary.

Draft SRT:
${convertSegmentsToSRT(batch)}
`

    const userContent: ChatCompletionContentPart[] = [{ type: 'text', text: prompt }]
    try {
      const audio = await sliceAudio(
        audioPath,
        batch[0].start - AUTOFIX_AUDIO_PADDING_SECONDS,
        batch[batch.length - 1].end + AUTOFIX_AUDIO_PADDING_SECONDS
      )
      userContent.push({ type: 'image_url', image_url: { url: toAudioDataUri('audio/mpeg', audio) } })
    } catch {
      // No audio context for this batch; proofread from the text alone
    }

    try {
      const response = await openai.chat.completions.create({
        model: route.model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: userContent }],
      })

      const refined = parseSRT(stripCodeFence(response.choices?.[0]?.message?.content || ''))
      const mapped = applyRefinedCueTexts(batch, refined)
      if (mapped) return mapped

      console.warn(`⚠️ ${label} kept original text (${refined.length} cues returned, expected ${batch.length})`)
    } catch (err) {
      console.warn(`⚠️ ${label} kept original text:`, err instanceof Error ? err.message : String(err))
    }
    return batch
  })

  return corrected.flat()
}

async function transcribeWithWhisper(audioPath: string, route: Route): Promise<WhisperResponse> {
  const { model } = route
  const openai = await createClient(route)
  const fileBuffer = await readFile(audioPath)

  // Chat models (OpenRouter Gemini etc.) take the audio as multimodal input
  if (isChatModel(model)) {
    const audioDataUri = toAudioDataUri(audioMimeType(audioPath), fileBuffer)

    const chatResponse = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Transcribe all spoken dialogue in this audio verbatim. Output standard SRT subtitles (HH:MM:SS,mmm --> HH:MM:SS,mmm). Keep each cue short for on-screen captions: one clause or about 8 words, typically 2-4 seconds. Return ONLY the raw SRT content without markdown, explanation, or commentary.',
            },
            {
              type: 'image_url',
              image_url: {
                url: audioDataUri,
              },
            },
          ],
        },
      ],
    })

    const cleanedSRT = stripCodeFence(chatResponse.choices?.[0]?.message?.content || '')

    const parsedSegments = parseSRT(cleanedSRT)
    const combinedText = parsedSegments.map((s) => s.text).join('\n') || cleanedSRT

    return {
      task: 'transcribe',
      language: 'unknown',
      duration: 0,
      text: combinedText,
      segments: parsedSegments,
    }
  }

  // Use SDK's toFile helper to create a proper File object for audio/transcriptions endpoint
  const { toFile } = await import('openai')
  const audioFile = await toFile(fileBuffer, basename(audioPath), { type: audioMimeType(audioPath) })

  let transcription: any
  try {
    transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment', 'word'],
    })
  } catch (err: any) {
    const errorMsg = String(err?.message || '')
    const isVerboseOrGranularityError =
      errorMsg.includes('verbose_json') ||
      errorMsg.includes('timestamp_granularities') ||
      errorMsg.includes('response_format')

    if (isVerboseOrGranularityError) {
      try {
        transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model,
          response_format: 'verbose_json',
        })
      } catch (innerErr: any) {
        transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model,
          response_format: 'json',
        })
      }
    } else {
      throw err
    }
  }

  let result = transcription as WhisperResponse

  const captionWords = wordsFromTranscription(result)
  if (captionWords.length > 0) {
    result = {
      ...result,
      segments: synthesizeSegmentsFromWords(captionWords),
    }
  }

  return result
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
  const {
    inputPath,
    apiKey,
    baseURL,
    model,
    autofix,
    refineModel,
    diarize,
    outputPath,
    offsetSeconds = 0,
    chunkMinutes,
  } = options

  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }

  const settings = resolveSettings({ apiKey, baseURL, model, autofix, refineModel, diarize })

  const ext = inputPath.toLowerCase().split('.').pop()
  const supportedFormats = ['mp4', 'mp3', 'wav', 'm4a', 'webm', 'ogg', 'opus', 'mov', 'avi', 'mkv']

  if (!ext || !supportedFormats.includes(ext)) {
    throw new Error(`Unsupported format. Supported formats: ${supportedFormats.join(', ')}`)
  }

  let audioPath = inputPath
  let tempAudioPath: string | null = null
  let chunkPaths: string[] = []
  
  // Extract audio if it's a video file
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    console.log('🎬 Extracting audio from video...')
    const dir = dirname(inputPath)
    const baseName = basename(inputPath, extname(inputPath))
    tempAudioPath = join(dir, `${baseName}_temp.mp3`)
    
    await extractAudio(inputPath, tempAudioPath)
    audioPath = tempAudioPath
  }
  
  try {
    if (offsetSeconds !== 0) {
      console.log(`🕒 Applying timestamp offset: ${offsetSeconds}s`)
    }

    let mergedSegments: WhisperSegment[] = []
    let mergedText = ''
    let language = 'unknown'

    const chunkMinutesToUse = chunkMinutes ?? AUTO_CHUNK_MINUTES
    const chunkSeconds = Math.max(60, chunkMinutesToUse * 60)

    chunkPaths = await splitAudioIntoChunks(audioPath, chunkSeconds)

    if (chunkPaths.length > 1) {
      console.log(`🧩 Chunking for reliability: ~${chunkMinutesToUse} min chunks (${chunkSeconds}s)`)
      console.log(`✅ Created ${chunkPaths.length} chunks`)
    }

    const chunkDurations = await Promise.all(chunkPaths.map((chunkPath) => getMediaDurationSeconds(chunkPath)))
    let totalSeconds = 0
    const chunkOffsets = chunkDurations.map((duration) => {
      const offset = totalSeconds
      totalSeconds += duration
      return offset
    })

    const chunkConcurrency = Math.min(MAX_PARALLEL_CHUNK_TRANSCRIPTIONS, chunkPaths.length)
    console.log(`🧭 ${describeSettings(settings)}`)
    if (settings.autofixSkipped) {
      console.warn(`⚠️ Autofix skipped: ${settings.autofixSkipped}`)
    }
    if (chunkPaths.length > 1) {
      console.log(`🎙️  Transcribing ${chunkPaths.length} chunks with up to ${chunkConcurrency} parallel requests...`)
    } else {
      console.log('🎙️  Transcribing...')
    }

    const chunkTranscriptions = await mapWithConcurrency(chunkPaths, chunkConcurrency, async (chunkPath, i) => {
      if (chunkPaths.length > 1) {
        console.log(`🎙️  Transcribing chunk ${i + 1}/${chunkPaths.length}...`)
      }
      const result = await transcribeWithWhisper(chunkPath, settings.transcribe)
      if (!settings.autofix || !result.segments?.length) return result

      const refined = await refineSegmentsWithLLM(chunkPath, result.segments, settings.autofix, settings.diarize)
      return { ...result, segments: refined, text: refined.map((s) => s.text).join('\n') }
    })

    for (let i = 0; i < chunkTranscriptions.length; i++) {
      const chunkTranscription = chunkTranscriptions[i]

      if (i === 0 && chunkTranscription.language) {
        language = chunkTranscription.language
      }

      if (chunkTranscription.text) {
        mergedText += chunkTranscription.text + '\n'
      }

      let rawSegments = chunkTranscription.segments
      if (!rawSegments || !Array.isArray(rawSegments)) {
        if (chunkTranscription.text) {
          // No segments returned: create a single fallback segment spanning chunk duration
          rawSegments = [
            {
              id: 0,
              seek: 0,
              start: 0,
              end: chunkDurations[i],
              text: chunkTranscription.text,
              tokens: [],
              temperature: 0,
              avg_logprob: 0,
              compression_ratio: 1,
              no_speech_prob: 0,
            },
          ]
        } else {
          const keys = Object.keys(chunkTranscription).join(', ')
          throw new Error(
            `Provider returned no segments or text; got keys: [${keys}]. ` +
            `Ensure response_format is verbose_json and the endpoint supports speech transcription.`
          )
        }
      }

      const transformed = transformSegments(
        rawSegments,
        toOriginalTimeline({ chunkOffsetSeconds: chunkOffsets[i], offsetSeconds })
      )

      mergedSegments.push(...transformed)
    }

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
      duration: totalSeconds,
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
  }
}
