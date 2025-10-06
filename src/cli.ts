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
import { join } from 'path'
import { transcribe } from './transcribe'
import { downloadYouTubeAudio, isYouTubeUrl } from './youtube'

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

Examples:
  transcribe video.mp4
  transcribe audio.mp3
  transcribe /path/to/podcast.wav
  transcribe https://www.youtube.com/watch?v=VIDEO_ID
  transcribe large-video.mp4 --raw

Optimizations (enabled by default):
  • 1.2x speed: Faster processing, 99.5% size reduction
  • Automatic timestamp adjustment to original speed
  • Use --raw to disable and use original audio

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
  
  const input = args.find(arg => !arg.startsWith('--')) || args[0]
  const useRaw = args.includes('--raw')
  
  let inputPath = input
  let downloadedFile: string | null = null
  
  try {
    const apiKey = getApiKey()
    
    // Check if input is a YouTube URL
    if (isYouTubeUrl(input)) {
      downloadedFile = await downloadYouTubeAudio(input)
      inputPath = downloadedFile
    } else if (!existsSync(inputPath)) {
      console.error(`Error: File not found: ${inputPath}`)
      process.exit(1)
    }
    
    const result = await transcribe({ 
      inputPath, 
      apiKey,
      optimize: !useRaw 
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
