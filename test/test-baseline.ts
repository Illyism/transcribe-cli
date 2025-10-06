#!/usr/bin/env bun

/**
 * Baseline Test - Original audio without optimization
 */

import { existsSync, statSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(import.meta.dir, 'output', 'baseline')

async function testBaseline(inputPath: string) {
  const startTime = Date.now()
  
  console.log('🧪 Running Baseline Test (No Optimization)')
  console.log('─'.repeat(60))
  
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }
  
  const originalSize = statSync(inputPath).size
  console.log(`📁 Original file size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
  
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
  
  console.log('🎙️  Transcribing with baseline (original audio)...')
  const transcribeStart = Date.now()
  
  const result = await transcribe({
    inputPath,
    apiKey,
  })
  
  const transcribeTime = Date.now() - transcribeStart
  const totalTime = Date.now() - startTime
  
  // Calculate cost ($0.006 per minute)
  const costPerMinute = 0.006
  const durationMinutes = result.duration / 60
  const estimatedCost = durationMinutes * costPerMinute
  
  // Save metrics
  const metrics = {
    method: 'baseline',
    originalSize: originalSize,
    processedSize: originalSize,
    compressionRatio: 1.0,
    originalDuration: result.duration,
    processedDuration: result.duration,
    transcriptionTime: transcribeTime,
    totalTime: totalTime,
    estimatedCost: estimatedCost,
    costPerMinute: costPerMinute,
    language: result.language,
    timestamp: new Date().toISOString()
  }
  
  // Create output directory
  await Bun.write(join(OUTPUT_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2))
  
  console.log('─'.repeat(60))
  console.log('✅ Baseline Test Complete')
  console.log(`📊 Metrics:`)
  console.log(`   File Size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`   Duration: ${(result.duration / 60).toFixed(2)} minutes`)
  console.log(`   Transcription Time: ${(transcribeTime / 1000).toFixed(1)}s`)
  console.log(`   Total Time: ${(totalTime / 1000).toFixed(1)}s`)
  console.log(`   Estimated Cost: $${estimatedCost.toFixed(4)}`)
  console.log(`   Language: ${result.language}`)
  console.log(`   SRT saved: ${result.srtPath}`)
  
  return metrics
}

// Run if called directly
if (import.meta.main) {
  const inputPath = process.argv[2]
  
  if (!inputPath) {
    console.error('Usage: bun test-baseline.ts <video-file>')
    process.exit(1)
  }
  
  testBaseline(inputPath).catch(console.error)
}

export { testBaseline }
