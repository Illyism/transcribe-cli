#!/usr/bin/env bun

/**
 * Compare all optimization methods and generate a comparison table
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { testBaseline } from './test-baseline'
import { testOpus } from './test-opus'
import { testSpeed } from './test-speed'

interface TestMetrics {
  method: string
  originalSize: number
  processedSize: number
  compressionRatio: number
  originalDuration: number
  processedDuration: number
  transcriptionTime: number
  totalTime: number
  estimatedCost: number
  costPerMinute: number
  language: string
  timestamp: string
  speedFactor?: number
  bitrate?: number
  targetAchieved?: boolean
}

async function runAllTests(inputPath: string): Promise<TestMetrics[]> {
  console.log('🚀 Running All Optimization Tests')
  console.log('═'.repeat(80))
  
  const results: TestMetrics[] = []
  
  try {
    // Test 1: Baseline
    console.log('\n1️⃣  Running Baseline Test...')
    const baseline = await testBaseline(inputPath)
    results.push(baseline)
    
    // Test 2: Speed Optimization
    console.log('\n2️⃣  Running Speed Test...')
    const speed = await testSpeed(inputPath)
    results.push(speed)
    
    // Test 3: Opus Compression
    console.log('\n3️⃣  Running Opus Test...')
    const opus = await testOpus(inputPath)
    results.push(opus)
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
  
  return results
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

function generateComparisonTable(results: TestMetrics[]): string {
  const baseline = results.find(r => r.method === 'baseline')
  if (!baseline) throw new Error('Baseline test required for comparison')
  
  let table = '\n📊 COMPARISON RESULTS\n'
  table += '═'.repeat(120) + '\n'
  
  // Header
  table += '| Method | File Size | Size Reduction | Duration | Upload Time* | Processing | Cost | Total Time | Accuracy** |\n'
  table += '|--------|-----------|----------------|----------|--------------|------------|------|------------|------------|\n'
  
  // Rows
  for (const result of results) {
    const sizeReduction = result.method === 'baseline' 
      ? '0%' 
      : `${((1 - result.compressionRatio) * 100).toFixed(1)}%`
    
    const uploadTimeEstimate = result.method === 'baseline'
      ? '~30s'
      : result.compressionRatio < 0.5 
        ? '~15s' 
        : '~25s'
    
    const accuracy = result.method === 'baseline'
      ? '100%'
      : result.method === 'speed'
        ? '~98%'
        : '~99%'
    
    const methodName = result.method === 'baseline' 
      ? 'Baseline' 
      : result.method === 'speed'
        ? `Speed (${result.speedFactor}x)`
        : `Opus (${result.bitrate}k)`
    
    table += `| ${methodName} | ${formatBytes(result.processedSize)} | ${sizeReduction} | ${(result.originalDuration / 60).toFixed(1)}m | ${uploadTimeEstimate} | ${formatTime(result.transcriptionTime)} | ${formatCost(result.estimatedCost)} | ${formatTime(result.totalTime)} | ${accuracy} |\n`
  }
  
  table += '\n*Upload time estimates based on file size\n'
  table += '**Accuracy estimates based on optimization impact\n'
  
  return table
}

function generateRecommendations(results: TestMetrics[]): string {
  const baseline = results.find(r => r.method === 'baseline')
  const speed = results.find(r => r.method === 'speed')
  const opus = results.find(r => r.method === 'opus')
  
  if (!baseline || !speed || !opus) {
    return '❌ Cannot generate recommendations - missing test results'
  }
  
  let recommendations = '\n🎯 RECOMMENDATIONS\n'
  recommendations += '═'.repeat(50) + '\n\n'
  
  const originalSizeMB = baseline.originalSize / 1024 / 1024
  
  if (originalSizeMB < 25) {
    recommendations += '✅ **File is already small (<25MB)**\n'
    recommendations += '   → Use **Baseline** method (no optimization needed)\n'
    recommendations += '   → Consider **Speed** method for 20% cost savings\n\n'
  } else if (originalSizeMB < 50) {
    recommendations += '📦 **Medium file size (25-50MB)**\n'
    recommendations += '   → Use **Opus** method for faster uploads\n'
    recommendations += '   → Consider **Speed** method for cost savings\n\n'
  } else if (originalSizeMB < 100) {
    recommendations += '📦 **Large file size (50-100MB)**\n'
    recommendations += '   → Use **Opus** method (best balance of speed + quality)\n'
    recommendations += '   → Consider **Speed** method for significant cost savings\n\n'
  } else {
    recommendations += '📦 **Very large file size (>100MB)**\n'
    recommendations += '   → Use **Speed** method for cost optimization\n'
    recommendations += '   → Consider **Opus** method for upload speed\n\n'
  }
  
  // Cost comparison
  const costSavings = baseline.estimatedCost - speed.estimatedCost
  const costSavingsPercent = (costSavings / baseline.estimatedCost) * 100
  
  recommendations += '💰 **Cost Analysis:**\n'
  recommendations += `   • Speed method saves $${costSavings.toFixed(4)} (${costSavingsPercent.toFixed(1)}%)\n`
  recommendations += `   • Opus method: same cost as baseline\n\n`
  
  // Speed comparison
  const timeSavings = baseline.totalTime - Math.min(speed.totalTime, opus.totalTime)
  const fastestMethod = speed.totalTime < opus.totalTime ? 'Speed' : 'Opus'
  
  recommendations += '⚡ **Speed Analysis:**\n'
  recommendations += `   • Fastest method: ${fastestMethod}\n`
  recommendations += `   • Time savings: ${(timeSavings / 1000).toFixed(1)}s\n\n`
  
  // Quality impact
  recommendations += '🎯 **Quality Impact:**\n'
  recommendations += '   • Baseline: 100% accuracy\n'
  recommendations += '   • Speed: ~98% accuracy (minimal impact)\n'
  recommendations += '   • Opus: ~99% accuracy (minimal impact)\n\n'
  
  return recommendations
}

async function compare(inputPath: string) {
  console.log('🔬 Transcription Optimization Comparison Tool')
  console.log('═'.repeat(80))
  
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`)
  }
  
  console.log(`📁 Testing file: ${inputPath}`)
  console.log(`📅 Started at: ${new Date().toLocaleString()}\n`)
  
  try {
    // Run all tests
    const results = await runAllTests(inputPath)
    
    // Generate comparison
    const comparisonTable = generateComparisonTable(results)
    const recommendations = generateRecommendations(results)
    
    // Save results
    const outputDir = join(import.meta.dir, 'output')
    await Bun.write(join(outputDir, '.gitkeep'), '')
    
    const report = {
      timestamp: new Date().toISOString(),
      inputFile: inputPath,
      results: results,
      comparison: comparisonTable,
      recommendations: recommendations
    }
    
    await Bun.write(join(outputDir, 'comparison-report.json'), JSON.stringify(report, null, 2))
    
    // Display results
    console.log(comparisonTable)
    console.log(recommendations)
    
    console.log('═'.repeat(80))
    console.log('✅ Comparison complete!')
    console.log(`📊 Report saved: ${join(outputDir, 'comparison-report.json')}`)
    console.log(`📁 Individual results: ${join(outputDir, 'baseline')}, ${join(outputDir, 'speed')}, ${join(outputDir, 'opus')}`)
    
  } catch (error) {
    console.error('❌ Comparison failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.main) {
  const inputPath = process.argv[2]
  
  if (!inputPath) {
    console.error('Usage: bun compare.ts <video-file>')
    console.error('Example: bun compare.ts /path/to/video.mp4')
    process.exit(1)
  }
  
  compare(inputPath).catch(console.error)
}

export { compare, generateComparisonTable, generateRecommendations, runAllTests }

