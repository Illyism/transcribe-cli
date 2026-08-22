import { spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import type { TranscribeOptions, TranscribeResult } from './index'
import { optimizeAudio } from './optimize'
import {
  convertSegmentsToSRT,
  parseSRT,
  synthesizeSegmentsFromWords,
  toOriginalTimeline,
  transformSegments,
} from './srt'
import type { WhisperResponse, WhisperSegment } from './types'

const MAX_UPLOAD_MB = 24 // Keep under ~25MB Whisper API limit (with headroom)
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const AUTO_CHUNK_MINUTES = 20
const MAX_PARALLEL_CHUNK_TRANSCRIPTIONS = 8

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
  apiKey: string,
  options?: { baseURL?: string; autofixModel?: string; diarize?: boolean }
): Promise<WhisperSegment[]> {
  if (!rawSegments || rawSegments.length === 0) return rawSegments

  const { default: OpenAI } = await import('openai')
  const openrouterKey = process.env.OPENROUTER_API_KEY || (apiKey && apiKey.startsWith('sk-or-') ? apiKey : undefined)
  const openaiKey = process.env.OPENAI_API_KEY || (apiKey && !apiKey.startsWith('sk-or-') ? apiKey : undefined)

  // When both keys are available or openrouterKey exists, prefer Gemini 3.7 Flash for deep context & multimodal proofreading
  let fixModel = options?.autofixModel
  if (!fixModel) {
    if (openrouterKey) {
      fixModel = 'google/gemini-3.7-flash'
    } else {
      fixModel = 'gpt-5.6-luna'
    }
  }

  const isFixOpenRouter = fixModel.includes('/') || fixModel.startsWith('google/')
  let baseURL = options?.baseURL
  if (!baseURL && isFixOpenRouter) {
    baseURL = 'https://openrouter.ai/api/v1'
  }

  // Pick the appropriate key
  let effectiveApiKey = apiKey
  if (isFixOpenRouter && openrouterKey) {
    effectiveApiKey = openrouterKey
  } else if (!isFixOpenRouter && openaiKey) {
    effectiveApiKey = openaiKey
  }

  const openai = new OpenAI({
    apiKey: effectiveApiKey,
    ...(baseURL ? { baseURL } : {}),
  })

  // Check file size: if under 15MB, attach base64 audio directly for audio context
  // If larger (or text-only), LLM contextual correction runs on SRT text
  let audioDataUri: string | undefined
  try {
    const { statSync } = await import('fs')
    if (statSync(audioPath).size < 15 * 1024 * 1024) {
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
      const base64Audio = fileBuffer.toString('base64')
      audioDataUri = `data:${mimeType};base64,${base64Audio}`
    }
  } catch {}

  const inputSrt = convertSegmentsToSRT(rawSegments)

  const diarizationInstructions =
    options?.diarize === false
      ? ''
      : '- If multiple speakers are detected in the conversation, naturally label each speaker at speaker turns (e.g. [Speaker 1]: ..., [Speaker 2]: ... or by name if clearly addressed).\n'

  const prompt = `You are an expert audio transcription proofreader, domain terminology specialist, and speaker diarization assistant.
You are given a draft SRT subtitle transcript generated by an acoustic Speech-to-Text model with precise timestamps but containing phonetic mishearings, garbled business/tech jargon, brand names, and slang.

Instructions:
- Review the draft SRT and context.
- Fix all phonetic mishearings, domain terms, brands, tools, frameworks, and metrics (e.g. pull requests, Cursor, Neovim, Tailwind, GLP-1, Ahrefs, AdSpy, Substack, CPM numbers, conversion funnels).
${diarizationInstructions}- STRICTLY PRESERVE all original SRT cue indices and timestamp ranges (HH:MM:SS,mmm --> HH:MM:SS,mmm). Do not change, delete, or shift timestamps.
- Return ONLY the corrected SRT subtitle content without markdown code blocks, explanation, or extra commentary.

Draft SRT:
${inputSrt}
`

  try {
    const userContent: any[] = [{ type: 'text', text: prompt }]
    if (audioDataUri) {
      userContent.push({ type: 'image_url', image_url: { url: audioDataUri } })
    }

    const response = await openai.chat.completions.create({
      model: fixModel,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    })

    const rawContent = response.choices?.[0]?.message?.content || ''
    const cleanedSRT = rawContent
      .replace(/^```(?:srt)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    const refined = parseSRT(cleanedSRT)
    if (refined.length > 0) {
      // Map refined text back to the original Whisper timecodes by index so LLM hallucinations cannot corrupt the timeline
      if (refined.length === rawSegments.length) {
        return rawSegments.map((seg, idx) => ({
          ...seg,
          text: refined[idx].text,
        }))
      }
      return refined
    }
  } catch (err) {
    console.warn('⚠️ LLM autofix pass skipped due to error:', err instanceof Error ? err.message : String(err))
  }

  return rawSegments
}

async function transcribeWithWhisper(
  audioPath: string,
  apiKey: string,
  options?: {
    baseURL?: string
    model?: string
    autofixModel?: string
    diarize?: boolean
  }
): Promise<WhisperResponse> {
  const { default: OpenAI, toFile } = await import('openai')
  const model = options?.model || 'whisper-1'
  const baseURL = options?.baseURL

  // Read file as buffer
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

  // If using OpenRouter or standard LLM models (e.g. google/gemini, etc.) via chat completions with multimodal audio
  const isOpenRouterOrChatModel =
    model.includes('/') ||
    (baseURL && baseURL.includes('openrouter.ai')) ||
    model.startsWith('google/') ||
    model.startsWith('stealth/')

  if (isOpenRouterOrChatModel) {
    const openai = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://openrouter.ai/api/v1',
    })

    const base64Audio = fileBuffer.toString('base64')
    const audioDataUri = `data:${mimeType};base64,${base64Audio}`

    const chatResponse = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Transcribe all spoken dialogue in this audio verbatim. Output the transcription in standard SRT subtitle format with numeric cues and timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm). Return ONLY the raw SRT subtitle content without markdown code blocks, explanation, or commentary.',
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

    const rawContent = chatResponse.choices?.[0]?.message?.content || ''
    // Strip possible markdown code blocks if the model enclosed them
    const cleanedSRT = rawContent
      .replace(/^```(?:srt)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

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

  const openai = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  })

  // Use SDK's toFile helper to create a proper File object for audio/transcriptions endpoint
  const audioFile = await toFile(fileBuffer, fileName, { type: mimeType })

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

  // If 2-pass autofix refinement or speaker diarization is requested
  const fixModel = options?.autofixModel
  if (fixModel) {
    let segments = result.segments || []
    if (segments.length === 0 && result.words && result.words.length > 0) {
      segments = synthesizeSegmentsFromWords(result.words)
    }
    if (segments.length > 0) {
      const refinedSegments = await refineSegmentsWithLLM(audioPath, segments, apiKey, {
        baseURL: options?.baseURL,
        autofixModel: fixModel,
        diarize: options?.diarize,
      })
      result = {
        ...result,
        segments: refinedSegments,
        text: refinedSegments.map((s) => s.text).join('\n'),
      }
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
      optimize = true,
      offsetSeconds = 0,
      chunkMinutes,
    } = options

    const autofixModel =
      typeof autofix === 'string'
        ? autofix
        : autofix === true
          ? undefined // Auto-detected from available API key (gpt-5.6-luna on OpenAI or gemini-3.7-flash on OpenRouter)
          : refineModel
  
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }
  
    let resolvedApiKey =
      apiKey ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY

    let fileConfig: any = {}
    // Try reading from ~/.transcribe/config.json if not passed
    try {
      const { homedir } = require('os')
      const { join } = require('path')
      const configPath = join(homedir(), '.transcribe', 'config.json')
      if (existsSync(configPath)) {
        fileConfig = JSON.parse(require('fs').readFileSync(configPath, 'utf8'))
        if (!resolvedApiKey) {
          resolvedApiKey = fileConfig.openaiApiKey || fileConfig.openrouterApiKey || fileConfig.apiKey
        }
      }
    } catch {}

    if (!resolvedApiKey) {
      throw new Error(
        'API key is required. Provide it in options or set OPENAI_API_KEY / OPENROUTER_API_KEY environment variable.'
      )
    }

    // If both OpenAI and OpenRouter are available:
    // Whisper-1 uses OpenAI API key for acoustic alignment, and Autofix uses OpenRouter Gemini 3.7 Flash
    const openrouterKey = process.env.OPENROUTER_API_KEY || fileConfig.openrouterApiKey || (resolvedApiKey?.startsWith('sk-or-') ? resolvedApiKey : undefined)
    const openaiKey = process.env.OPENAI_API_KEY || fileConfig.openaiApiKey || (resolvedApiKey && !resolvedApiKey.startsWith('sk-or-') ? resolvedApiKey : undefined)

    if (openaiKey && openrouterKey && !autofixModel) {
      // Auto-mix! Whisper on OpenAI + Gemini on OpenRouter
      resolvedApiKey = openaiKey
    }

    const finalApiKey: string = resolvedApiKey as string

    // If using an OpenRouter key (sk-or-...) and no baseURL/model was explicitly set, auto-default to OpenRouter
    let resolvedBaseURL = baseURL || process.env.TRANSCRIBE_BASE_URL || process.env.OPENAI_BASE_URL
    let resolvedModel = model || process.env.TRANSCRIBE_MODEL

    if (finalApiKey.startsWith('sk-or-') && !resolvedBaseURL) {
      resolvedBaseURL = 'https://openrouter.ai/api/v1'
    }

    if (finalApiKey.startsWith('sk-or-') && !resolvedModel) {
      resolvedModel = 'google/gemini-3.7-flash'
    }

    const ext = inputPath.toLowerCase().split('.').pop()
    const supportedFormats = ['mp4', 'mp3', 'wav', 'm4a', 'webm', 'ogg', 'opus', 'mov', 'avi', 'mkv']

    if (!ext || !supportedFormats.includes(ext)) {
      throw new Error(`Unsupported format. Supported formats: ${supportedFormats.join(', ')}`)
    }
  
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
    audioPath = tempAudioPath
  }
  
  try {
    const initialDuration = await getMediaDurationSeconds(audioPath)

    // Speech audio stays at original 1.0x speed to preserve acoustic transients and loanword phonemes
    const durationOriginal = initialDuration

    if (offsetSeconds !== 0) {
      console.log(`🕒 Applying timestamp offset: ${offsetSeconds}s`)
    }

    let mergedSegments: WhisperSegment[] = []
    let mergedText = ''
    let language = 'unknown'
    let originalDurationSeconds = durationOriginal

    const chunkMinutesToUse = chunkMinutes ?? AUTO_CHUNK_MINUTES
    const chunkSecondsOriginal = Math.max(60, chunkMinutesToUse * 60)
    const chunkSecondsOptimized = chunkSecondsOriginal / speedFactor

    chunkPaths = await splitAudioIntoChunks(audioPath, chunkSecondsOptimized)

    if (chunkPaths.length > 1) {
      console.log(`🧩 Chunking for reliability: ~${chunkMinutesToUse} min chunks (${chunkSecondsOriginal}s)`)
      console.log(`✅ Created ${chunkPaths.length} chunks`)
    }

    const chunkDurations = await Promise.all(chunkPaths.map((chunkPath) => getMediaDurationSeconds(chunkPath)))
    let totalOptimizedSeconds = 0
    const chunkOffsets = chunkDurations.map((duration) => {
      const offset = totalOptimizedSeconds
      totalOptimizedSeconds += duration
      return offset
    })

    const chunkConcurrency = Math.min(MAX_PARALLEL_CHUNK_TRANSCRIPTIONS, chunkPaths.length)
    if (chunkPaths.length > 1) {
      console.log(`🎙️  Transcribing ${chunkPaths.length} chunks with up to ${chunkConcurrency} parallel requests...`)
    } else {
      console.log('🎙️  Transcribing...')
    }

    const chunkTranscriptions = await mapWithConcurrency(chunkPaths, chunkConcurrency, async (chunkPath, i) => {
      if (chunkPaths.length > 1) {
        console.log(`🎙️  Transcribing chunk ${i + 1}/${chunkPaths.length}...`)
      }
      return transcribeWithWhisper(chunkPath, finalApiKey, {
        baseURL: resolvedBaseURL,
        model: resolvedModel,
        autofixModel,
        diarize,
      })
    })

    for (let i = 0; i < chunkTranscriptions.length; i++) {
      const chunkTranscription = chunkTranscriptions[i]
      const offsetOptimizedSeconds = chunkOffsets[i]

      if (i === 0 && chunkTranscription.language) {
        language = chunkTranscription.language
      }

      if (chunkTranscription.text) {
        mergedText += chunkTranscription.text + '\n'
      }

      let rawSegments = chunkTranscription.segments
      if (!rawSegments || !Array.isArray(rawSegments)) {
        if (chunkTranscription.words && Array.isArray(chunkTranscription.words) && chunkTranscription.words.length > 0) {
          rawSegments = synthesizeSegmentsFromWords(chunkTranscription.words)
        } else if (chunkTranscription.text) {
          // If neither segments nor words were returned, create a single fallback segment spanning chunk duration
          const chunkDuration = chunkDurations[i] || durationOriginal
          rawSegments = [
            {
              id: 0,
              seek: 0,
              start: 0,
              end: chunkDuration,
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
        toOriginalTimeline({
          chunkOffsetSeconds: offsetOptimizedSeconds,
          speedFactor,
          offsetSeconds,
        })
      )

      mergedSegments.push(...transformed)
    }

    originalDurationSeconds = totalOptimizedSeconds * speedFactor

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
  }
}
