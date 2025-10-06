import { spawn } from 'child_process'
import { statSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'

const SPEED_FACTOR = 1.2
const MAX_FILE_SIZE_MB = 24 // Keep under 25MB API limit
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export async function optimizeAudio(inputPath: string): Promise<{ path: string; speedFactor: number }> {
  const fileSize = statSync(inputPath).size
  const fileSizeMB = fileSize / 1024 / 1024
  
  console.log(`📊 File size: ${fileSizeMB.toFixed(2)} MB`)
  
  // Always optimize with speed first (best results from A/B testing)
  console.log(`⚡ Optimizing: Speeding up audio by ${SPEED_FACTOR}x for faster processing...`)
  
  const dir = dirname(inputPath)
  const speedOptimizedPath = join(dir, `optimized_speed_${Date.now()}.mp3`)
  
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-filter:a', `atempo=${SPEED_FACTOR}`,
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      '-y',
      speedOptimizedPath
    ])
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const optimizedSize = statSync(speedOptimizedPath).size
        const optimizedSizeMB = optimizedSize / 1024 / 1024
        const reduction = ((1 - optimizedSize / fileSize) * 100).toFixed(1)
        console.log(`✅ Speed optimization complete: ${fileSizeMB.toFixed(2)} MB → ${optimizedSizeMB.toFixed(2)} MB (${reduction}% reduction)`)
        resolve()
      } else {
        reject(new Error(`FFmpeg optimization failed with code ${code}`))
      }
    })
    
    ffmpeg.on('error', reject)
  })
  
  // Check if we need additional compression (must be <25MB for Whisper API)
  const speedOptimizedSize = statSync(speedOptimizedPath).size
  const speedOptimizedSizeMB = speedOptimizedSize / 1024 / 1024
  
  if (speedOptimizedSize > MAX_FILE_SIZE_BYTES) {
    console.log(`⚠️  File still too large (${speedOptimizedSizeMB.toFixed(2)} MB > 24 MB), applying additional compression...`)
    
    const finalPath = join(dir, `optimized_final_${Date.now()}.ogg`)
    
    // Calculate bitrate needed to stay under 24MB
    const durationSeconds = fileSizeMB / (128 / 8) // Rough estimate: original bitrate ~128kbps
    const targetBitrate = Math.floor((MAX_FILE_SIZE_BYTES / durationSeconds) * 8 / 1000) - 5 // -5k for safety
    const safeBitrate = Math.max(24, Math.min(targetBitrate, 64)) // Clamp between 24-64kbps
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', speedOptimizedPath,
        '-acodec', 'libopus',
        '-b:a', `${safeBitrate}k`,
        '-ac', '1', // Mono
        '-f', 'ogg',
        '-y',
        finalPath
      ])
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          const finalSize = statSync(finalPath).size
          const finalSizeMB = finalSize / 1024 / 1024
          console.log(`✅ Additional compression complete: ${speedOptimizedSizeMB.toFixed(2)} MB → ${finalSizeMB.toFixed(2)} MB (${safeBitrate}k bitrate)`)
          resolve()
        } else {
          reject(new Error(`FFmpeg compression failed with code ${code}`))
        }
      })
      
      ffmpeg.on('error', reject)
    })
    
    // Clean up intermediate file
    unlinkSync(speedOptimizedPath)
    
    return { path: finalPath, speedFactor: SPEED_FACTOR }
  }
  
  return { path: speedOptimizedPath, speedFactor: SPEED_FACTOR }
}

export function adjustSRTTimestamps(srtContent: string, speedFactor: number): string {
  if (speedFactor === 1.0) return srtContent
  
  // SRT timestamp format: HH:MM:SS,mmm --> HH:MM:SS,mmm
  const timestampRegex = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g
  
  return srtContent.replace(timestampRegex, (_match, start, end) => {
    const adjustTimestamp = (timestamp: string) => {
      const [time, ms] = timestamp.split(',')
      const [hours, minutes, seconds] = time.split(':').map(Number)
      
      const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + parseInt(ms)
      const adjustedMs = Math.round(totalMs / speedFactor)
      
      const adjHours = Math.floor(adjustedMs / 3600000)
      const adjMinutes = Math.floor((adjustedMs % 3600000) / 60000)
      const adjSeconds = Math.floor((adjustedMs % 60000) / 1000)
      const adjMs = adjustedMs % 1000
      
      return `${String(adjHours).padStart(2, '0')}:${String(adjMinutes).padStart(2, '0')}:${String(adjSeconds).padStart(2, '0')},${String(adjMs).padStart(3, '0')}`
    }
    
    return `${adjustTimestamp(start)} --> ${adjustTimestamp(end)}`
  })
}
