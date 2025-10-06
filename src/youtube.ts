import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

export function isYouTubeUrl(input: string): boolean {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/
  return youtubeRegex.test(input)
}

export function getVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  
  return null
}

export async function downloadYouTubeAudio(url: string): Promise<string> {
  const videoId = getVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  
  console.log('🎥 Downloading YouTube audio...')
  
  const outputPath = join(tmpdir(), `youtube_${videoId}_${Date.now()}.mp3`)
  
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '-x',                          // Extract audio
      '--audio-format', 'mp3',       // Convert to MP3
      '--audio-quality', '0',        // Best quality
      '-o', outputPath,              // Output path
      '--no-playlist',               // Don't download playlists
      '--no-warnings',               // Suppress warnings
      '--progress',                  // Show progress
      url
    ])
    
    let output = ''
    
    ytdlp.stdout.on('data', (data) => {
      const line = data.toString()
      output += line
      // Show download progress
      if (line.includes('[download]')) {
        process.stdout.write('\r' + line.trim())
      }
    })
    
    ytdlp.stderr.on('data', (data) => {
      output += data.toString()
    })
    
    ytdlp.on('close', (code) => {
      process.stdout.write('\n')
      
      if (code === 0) {
        console.log('✅ Download complete!')
        resolve(outputPath)
      } else {
        let errorMsg = `yt-dlp exited with code ${code}`
        
        if (output.includes('ERROR')) {
          const errorLines = output.split('\n').filter(line => line.includes('ERROR'))
          errorMsg += '\n\n' + errorLines.join('\n')
        }
        
        if (code === 127 || output.includes('command not found')) {
          errorMsg = 'yt-dlp is not installed. Please install it:\n' +
            '  macOS: brew install yt-dlp\n' +
            '  Ubuntu: sudo apt install yt-dlp\n' +
            '  Windows: winget install yt-dlp\n' +
            '  Or: pip install yt-dlp'
        }
        
        reject(new Error(errorMsg))
      }
    })
    
    ytdlp.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error(
          'yt-dlp is not installed. Please install it:\n' +
          '  macOS: brew install yt-dlp\n' +
          '  Ubuntu: sudo apt install yt-dlp\n' +
          '  Windows: winget install yt-dlp\n' +
          '  Or: pip install yt-dlp'
        ))
      } else {
        reject(err)
      }
    })
  })
}
