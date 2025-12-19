/**
 * Programmatic API for transcribe
 * Use this if you want to integrate transcription into your Node.js application
 */

export interface TranscribeOptions {
  apiKey?: string
  inputPath: string
  outputPath?: string
  optimize?: boolean
  /**
   * Shift all subtitle timestamps by this many seconds (useful for editor timecode offsets).
   * Example: 3600 = start captions at 01:00:00,000
   */
  offsetSeconds?: number
  /**
   * Chunk long media into N-minute pieces and merge results.
   * If omitted, chunking is automatically enabled for long/large inputs.
   */
  chunkMinutes?: number
}

export interface TranscribeResult {
  srtPath: string
  text: string
  language: string
  duration: number
}

export { transcribe } from './transcribe'
export * from './types'

