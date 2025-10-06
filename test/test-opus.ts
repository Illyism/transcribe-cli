#!/usr/bin/env bun

/**
 * Opus Test - Compress audio using Opus codec optimized for voice
 */

import { spawn } from 'child_process'
import { existsSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(import.meta.dir, 'output', 'opus')
const TARGET_SIZE_MB = 25
const TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024

async function compressWithOpus(inputPath: string, outputPath: string, targetBitrate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🎵 Compressing with Opus at ${targetBitrate}k bitrate...`)
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-vn', // No video
      '-acodec', 'libopus',
      '-b:a', `${targetBitrate}k`,
      '-ac', '1', // Mono for voice (can reduce size further)
      '-f', 'ogg', // Use OGG container (supported by Whisper API)
      '-y', // Overwrite output
      outputPath
    ])
    
    let errorOutput = ''
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Opus compression complete!')
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

async function findOptimalBitrate(inputPath: string): Promise<number> {
  console.log('🔍 Finding optimal bitrate for <25MB target...')
  
  // Start with a reasonable bitrate and adjust
  let bitrate = 64 // Start with 64kbps
  let lastValidBitrate = bitrate
  
  for (let attempt = 0; attempt < 5; attempt++) {
    const testPath = join(OUTPUT_DIR, `test_${bitrate}k_${Date.now()}.ogg`)
    
    try {
      await compressWithOpus(inputPath, testPath, bitrate)
      const size = statSync(testPath).size
      
      console.log(`   ${bitrate}k bitrate → ${(size / 1024 / 1024).toFixed(2)} MB`)
      
      if (size <= TARGET_SIZE_BYTES) {
        unlinkSync(testPath)
        console.log(`✅ Found optimal bitrate: ${bitrate}k`)
        return bitrate
      } else {
        // File too big, reduce bitrate
        lastValidBitrate = bitrate
        bitrate = Math.floor(bitrate * 0.8) // Reduce by 20%
        unlinkSync(testPath)
      }
    } catch (error) {
      console.log(`   ${bitrate}k bitrate failed, trying lower...`)
      bitrate = Math.floor(bitrate * 0.8)
    }
  }
  
  console.log(`⚠️  Could not achieve <25MB, using ${lastValidBitrate}k bitrate`)
  return lastValidBitrate
}

async function testOpus(inputPath: string) {
  const startTime = Date.now()
  
  console.log('🧪 Running Opus Compression Test')
  console.log('─'.repeat(60))
  
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }
  
  const originalSize = statSync(inputPath).size
  console.log(`📁 Original file size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
  
  // Create output directory
  await Bun.write(join(OUTPUT_DIR, '.gitkeep'), '')
  
  // Extract audio first
  const tempAudioPath = join(OUTPUT_DIR, `temp_audio_${Date.now()}.mp3`)
  const opusAudioPath = join(OUTPUT_DIR, `opus_${Date.now()}.ogg`)
  
  try {
    // Extract audio
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
    
    // Find optimal bitrate
    const optimalBitrate = await findOptimalBitrate(tempAudioPath)
    
    // Compress with optimal bitrate
    await compressWithOpus(tempAudioPath, opusAudioPath, optimalBitrate)
    
    const processedSize = statSync(opusAudioPath).size
    console.log(`📁 Processed file size: ${(processedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`📊 Size reduction: ${((1 - processedSize / originalSize) * 100).toFixed(1)}%`)
    console.log(`🎯 Target achieved: ${processedSize <= TARGET_SIZE_BYTES ? '✅' : '❌'} (<25MB)`)
    
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
    
    console.log('🎙️  Transcribing Opus-compressed audio...')
    const transcribeStart = Date.now()
    
    const result = await transcribe({
      inputPath: opusAudioPath,
      apiKey,
    })
    
    const transcribeTime = Date.now() - transcribeStart
    const totalTime = Date.now() - startTime
    
    // Calculate metrics
    const durationMinutes = result.duration / 60
    const costPerMinute = 0.006
    const estimatedCost = durationMinutes * costPerMinute
    
    const metrics = {
      method: 'opus',
      codec: 'libopus',
      bitrate: optimalBitrate,
      targetSizeMB: TARGET_SIZE_MB,
      originalSize: originalSize,
      processedSize: processedSize,
      compressionRatio: processedSize / originalSize,
      originalDuration: result.duration,
      processedDuration: result.duration,
      transcriptionTime: transcribeTime,
      totalTime: totalTime,
      estimatedCost: estimatedCost,
      costPerMinute: costPerMinute,
      language: result.language,
      targetAchieved: processedSize <= TARGET_SIZE_BYTES,
      timestamp: new Date().toISOString()
    }
    
    // Save metrics
    await Bun.write(join(OUTPUT_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2))
    
    console.log('─'.repeat(60))
    console.log('✅ Opus Test Complete')
    console.log(`📊 Metrics:`)
    console.log(`   Codec: Opus`)
    console.log(`   Bitrate: ${optimalBitrate}k`)
    console.log(`   Original Size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Processed Size: ${(processedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Size Reduction: ${((1 - processedSize / originalSize) * 100).toFixed(1)}%`)
    console.log(`   Target (<25MB): ${processedSize <= TARGET_SIZE_BYTES ? '✅' : '❌'}`)
    console.log(`   Duration: ${(result.duration / 60).toFixed(2)} minutes`)
    console.log(`   Transcription Time: ${(transcribeTime / 1000).toFixed(1)}s`)
    console.log(`   Total Time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log(`   Estimated Cost: $${estimatedCost.toFixed(4)}`)
    console.log(`   Language: ${result.language}`)
    console.log(`   SRT saved: ${result.srtPath}`)
    
    return metrics
    
  } finally {
    // Clean up temporary files
    if (existsSync(tempAudioPath)) unlinkSync(tempAudioPath)
    if (existsSync(opusAudioPath)) unlinkSync(opusAudioPath)
  }
}

// Run if called directly
if (import.meta.main) {
  const inputPath = process.argv[2]
  
  if (!inputPath) {
    console.error('Usage: bun test-opus.ts <video-file>')
    process.exit(1)
  }
  
  testOpus(inputPath).catch(console.error)
}

export { testOpus }
