#!/usr/bin/env bun

/**
 * Speed Test - Audio sped up by 1.2x for faster processing
 */

import { spawn } from 'child_process'
import { existsSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(import.meta.dir, 'output', 'speed')
const SPEED_FACTOR = 1.2

async function speedUpAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`⚡ Speeding up audio by ${SPEED_FACTOR}x...`)
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-vn', // No video
      '-filter:a', `atempo=${SPEED_FACTOR}`, // Speed up audio
      '-acodec', 'libmp3lame',
      '-q:a', '2', // High quality
      '-y', // Overwrite output
      outputPath
    ])
    
    let errorOutput = ''
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Audio speed adjustment complete!')
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`))
      }
    })
    
    ffmpeg.on('error', (err) => {
      reject(err)
    })
  })
}

function adjustSRTTimestamps(srtContent: string, speedFactor: number): string {
  // SRT timestamp format: HH:MM:SS,mmm --> HH:MM:SS,mmm
  const timestampRegex = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g
  
  return srtContent.replace(timestampRegex, (match, start, end) => {
    const adjustTimestamp = (timestamp: string) => {
      const [time, ms] = timestamp.split(',')
      const [hours, minutes, seconds] = time.split(':').map(Number)
      
      const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + parseInt(ms)
      const adjustedMs = Math.round(totalMs * speedFactor)
      
      const adjHours = Math.floor(adjustedMs / 3600000)
      const adjMinutes = Math.floor((adjustedMs % 3600000) / 60000)
      const adjSeconds = Math.floor((adjustedMs % 60000) / 1000)
      const adjMs = adjustedMs % 1000
      
      return `${String(adjHours).padStart(2, '0')}:${String(adjMinutes).padStart(2, '0')}:${String(adjSeconds).padStart(2, '0')},${String(adjMs).padStart(3, '0')}`
    }
    
    return `${adjustTimestamp(start)} --> ${adjustTimestamp(end)}`
  })
}

async function testSpeed(inputPath: string) {
  const startTime = Date.now()
  
  console.log('🧪 Running Speed Test (1.2x Audio Speed)')
  console.log('─'.repeat(60))
  
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }
  
  const originalSize = statSync(inputPath).size
  console.log(`📁 Original file size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
  
  // Create output directory
  await Bun.write(join(OUTPUT_DIR, '.gitkeep'), '')
  
  // Extract audio and speed it up
  const tempAudioPath = join(OUTPUT_DIR, `temp_audio_${Date.now()}.mp3`)
  const spedUpAudioPath = join(OUTPUT_DIR, `sped_up_${Date.now()}.mp3`)
  
  try {
    // First extract audio
    console.log('🎬 Extracting audio from video...')
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-vn',
        '-acodec', 'libmp3lame',
        '-q:a', '2',
        '-y',
        tempAudioPath
      ])
      
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Audio extraction failed with code ${code}`))
      })
      
      ffmpeg.on('error', reject)
    })
    
    // Then speed it up
    await speedUpAudio(tempAudioPath, spedUpAudioPath)
    
    const processedSize = statSync(spedUpAudioPath).size
    console.log(`📁 Processed file size: ${(processedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`📊 Size reduction: ${((1 - processedSize / originalSize) * 100).toFixed(1)}%`)
    
    // Import transcribe dynamically
    const { transcribe } = await import('../src/transcribe')
    const { homedir } = await import('os')
    const configPath = join(homedir(), '.transcribe', 'config.json')
    
    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey && existsSync(configPath)) {
      const config = JSON.parse(await Bun.file(configPath).text())
      apiKey = config.apiKey
    }
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found')
    }
    
    console.log('🎙️  Transcribing sped-up audio...')
    const transcribeStart = Date.now()
    
    const result = await transcribe({
      inputPath: spedUpAudioPath,
      apiKey,
    })
    
    const transcribeTime = Date.now() - transcribeStart
    const totalTime = Date.now() - startTime
    
    // Adjust SRT timestamps back to original speed
    const originalSRT = await Bun.file(result.srtPath).text()
    const adjustedSRT = adjustSRTTimestamps(originalSRT, SPEED_FACTOR)
    
    // Save adjusted SRT
    const adjustedSRTPath = join(OUTPUT_DIR, `sped_up_${Date.now()}.srt`)
    await Bun.write(adjustedSRTPath, adjustedSRT)
    
    // Calculate metrics
    const originalDuration = result.duration * SPEED_FACTOR // Adjust back to original duration
    const durationMinutes = originalDuration / 60
    const costPerMinute = 0.006
    const estimatedCost = durationMinutes * costPerMinute
    
    const metrics = {
      method: 'speed',
      speedFactor: SPEED_FACTOR,
      originalSize: originalSize,
      processedSize: processedSize,
      compressionRatio: processedSize / originalSize,
      originalDuration: originalDuration,
      processedDuration: result.duration,
      transcriptionTime: transcribeTime,
      totalTime: totalTime,
      estimatedCost: estimatedCost,
      costPerMinute: costPerMinute,
      language: result.language,
      timestamp: new Date().toISOString()
    }
    
    // Save metrics
    await Bun.write(join(OUTPUT_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2))
    
    console.log('─'.repeat(60))
    console.log('✅ Speed Test Complete')
    console.log(`📊 Metrics:`)
    console.log(`   Speed Factor: ${SPEED_FACTOR}x`)
    console.log(`   Original Size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Processed Size: ${(processedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Size Reduction: ${((1 - processedSize / originalSize) * 100).toFixed(1)}%`)
    console.log(`   Original Duration: ${(originalDuration / 60).toFixed(2)} minutes`)
    console.log(`   Transcription Time: ${(transcribeTime / 1000).toFixed(1)}s`)
    console.log(`   Total Time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`   Estimated Cost: $${estimatedCost.toFixed(4)}`)
    console.log(`   Language: ${result.language}`)
    console.log(`   Adjusted SRT saved: ${adjustedSRTPath}`)
    
    return metrics
    
  } finally {
    // Clean up temporary files
    if (existsSync(tempAudioPath)) unlinkSync(tempAudioPath)
    if (existsSync(spedUpAudioPath)) unlinkSync(spedUpAudioPath)
  }
}

// Run if called directly
if (import.meta.main) {
  const inputPath = process.argv[2]
  
  if (!inputPath) {
    console.error('Usage: bun test-speed.ts <video-file>')
    process.exit(1)
  }
  
  testSpeed(inputPath).catch(console.error)
}

export { testSpeed }
