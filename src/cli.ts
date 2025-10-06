#!/usr/bin/env node

/**
 * Transcribe audio/video files to SRT format
 * 
 * Usage: transcribe <path-to-file>
 * 
 * Supports: .mp4, .mp3, .wav, .m4a, .webm, .ogg
 * Requires: OPENAI_API_KEY environment variable
 */

import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { transcribe } from './transcribe'

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
      'OPENAI_API_KEY not found. Please set it as an environment variable:\n' +
      '  export OPENAI_API_KEY=sk-...\n\n' +
      'Or create a config file at ~/.transcribe/config.json:\n' +
      '  {\n' +
      '    "apiKey": "sk-..."\n' +
      '  }'
    )
  }
  
  return apiKey
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Transcribe - Audio/Video to SRT

Usage: transcribe <path-to-file> [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version

Examples:
  transcribe video.mp4
  transcribe audio.mp3
  transcribe /path/to/podcast.wav

Supported formats: mp4, mp3, wav, m4a, webm, ogg, mov, avi, mkv

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
  
  const inputPath = args[0]
  
  if (!existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`)
    process.exit(1)
  }
  
  try {
    const apiKey = getApiKey()
    const result = await transcribe({ inputPath, apiKey })
    
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
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
