/**
 * Programmatic API for transcribe
 * Use this if you want to integrate transcription into your Node.js application
 */

export interface TranscribeOptions {
  apiKey?: string
  inputPath: string
  outputPath?: string
  optimize?: boolean
}

export interface TranscribeResult {
  srtPath: string
  text: string
  language: string
  duration: number
}

export { transcribe } from './transcribe'
export * from './types'

