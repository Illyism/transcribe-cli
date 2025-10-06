import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import { tmpdir } from 'os'

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
  const ytdl = (await import('@distube/ytdl-core')).default
  
  const videoId = getVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  
  console.log('🎥 Fetching YouTube video info...')
  
  const info = await ytdl.getInfo(url)
  const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')
  
  console.log(`📹 Downloading: ${info.videoDetails.title}`)
  console.log(`⏱️  Duration: ${Math.floor(parseInt(info.videoDetails.lengthSeconds) / 60)} minutes`)
  
  // Download audio only
  const audioStream = ytdl(url, {
    quality: 'highestaudio',
    filter: 'audioonly'
  })
  
  const outputPath = join(tmpdir(), `${title}_${Date.now()}.mp3`)
  const writeStream = createWriteStream(outputPath)
  
  await pipeline(audioStream, writeStream)
  
  console.log('✅ Download complete!')
  
  return outputPath
}
