import { spawn } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { TranscribeOptions, TranscribeResult } from './index'
import { adjustSRTTimestamps, optimizeAudio } from './optimize'
import type { WhisperResponse } from './types'

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const millis = Math.floor((seconds % 1) * 1000)
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

function convertToSRT(response: WhisperResponse): string {
  let srt = ''
  
  response.segments.forEach((segment, index) => {
    srt += `${index + 1}\n`
    srt += `${formatTime(segment.start)} --> ${formatTime(segment.end)}\n`
    srt += `${segment.text.trim()}\n\n`
  })
  
  return srt
}

async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let errorOutput = ''
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
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

async function transcribeWithWhisper(audioPath: string, apiKey: string): Promise<WhisperResponse> {
  const { default: OpenAI, toFile } = await import('openai')
  const openai = new OpenAI({ apiKey })
  
  // Read file as buffer and use SDK's toFile helper to create proper File object
  const fs = await import('fs/promises')
  const { basename } = await import('path')
  const fileBuffer = await fs.readFile(audioPath)
  const fileName = basename(audioPath)
  
  // Use SDK's toFile helper to create a proper File object
  const audioFile = await toFile(fileBuffer, fileName, { type: 'audio/mpeg' })
  
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
  const { inputPath, apiKey, outputPath, optimize = true } = options
  
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
  let speedFactor = 1.0
  
  // Extract audio if it's a video file
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    console.log('🎬 Extracting audio from video...')
    const dir = inputPath.substring(0, inputPath.lastIndexOf('/'))
    const baseName = inputPath.substring(inputPath.lastIndexOf('/') + 1, inputPath.lastIndexOf('.'))
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
    
    // Transcribe with Whisper
    console.log('🎙️  Transcribing with OpenAI Whisper API...')
    const transcription = await transcribeWithWhisper(audioPath, apiKey)
    console.log(`✅ Transcription complete! Language: ${transcription.language}, Duration: ${transcription.duration.toFixed(2)}s`)
    
    // Convert to SRT format
    let srt = convertToSRT(transcription)
    
    // Adjust timestamps if audio was sped up
    if (speedFactor !== 1.0) {
      console.log(`⏱️  Adjusting timestamps back to original speed...`)
      srt = adjustSRTTimestamps(srt, speedFactor)
    }
    
    // Save SRT file
    const srtPath = outputPath || inputPath.substring(0, inputPath.lastIndexOf('.')) + '.srt'
    await writeFile(srtPath, srt, 'utf-8')
    
    // Calculate original duration if sped up
    const originalDuration = transcription.duration * speedFactor
    
    return {
      srtPath,
      text: transcription.text,
      language: transcription.language,
      duration: originalDuration
    }
  } finally {
    // Clean up temporary files
    if (tempAudioPath && existsSync(tempAudioPath)) {
      unlinkSync(tempAudioPath)
    }
    if (optimizedPath && existsSync(optimizedPath)) {
      unlinkSync(optimizedPath)
    }
    if (tempAudioPath || optimizedPath) {
      console.log('🧹 Cleaned up temporary files')
    }
  }
}
