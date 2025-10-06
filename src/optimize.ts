import { spawn } from 'child_process'
import { statSync } from 'fs'
import { dirname, join } from 'path'

const SPEED_FACTOR = 1.2

export async function optimizeAudio(inputPath: string): Promise<{ path: string; speedFactor: number }> {
  const fileSize = statSync(inputPath).size
  const fileSizeMB = fileSize / 1024 / 1024
  
  console.log(`📊 File size: ${fileSizeMB.toFixed(2)} MB`)
  
  // Always optimize with speed (best results from A/B testing)
  console.log(`⚡ Optimizing: Speeding up audio by ${SPEED_FACTOR}x for faster processing...`)
  
  const dir = dirname(inputPath)
  const outputPath = join(dir, `optimized_${Date.now()}.mp3`)
  
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-filter:a', `atempo=${SPEED_FACTOR}`,
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      '-y',
      outputPath
    ])
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const optimizedSize = statSync(outputPath).size
        const optimizedSizeMB = optimizedSize / 1024 / 1024
        const reduction = ((1 - optimizedSize / fileSize) * 100).toFixed(1)
        console.log(`✅ Optimization complete: ${fileSizeMB.toFixed(2)} MB → ${optimizedSizeMB.toFixed(2)} MB (${reduction}% reduction)`)
        resolve()
      } else {
        reject(new Error(`FFmpeg optimization failed with code ${code}`))
      }
    })
    
    ffmpeg.on('error', reject)
  })
  
  return { path: outputPath, speedFactor: SPEED_FACTOR }
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
