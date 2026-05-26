import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { SingleBar } from 'cli-progress'
import pc from 'picocolors'

function sanitizeSlug(value: string): string {
  return value
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'remote_media'
}

function parseSizeToBytes(input: string): number | null {
  const m = input.trim().match(/^([\d.]+)\s*(B|bytes|KiB|kB|KB|MiB|MB|GiB|GB)?$/i)
  if (!m) return null
  const num = parseFloat(m[1])
  if (!Number.isFinite(num)) return null
  const unit = (m[2] || 'B').toLowerCase()
  const map: Record<string, number> = {
    b: 1, bytes: 1,
    kib: 1024, kb: 1024,
    mib: 1024 * 1024, mb: 1024 * 1024,
    gib: 1024 * 1024 * 1024, gb: 1024 * 1024 * 1024,
  }
  const mult = map[unit] ?? 1
  return Math.floor(num * mult)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

export function isYouTubeUrl(input: string): boolean {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/
  return youtubeRegex.test(input)
}

export function isRemoteMediaUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
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

export function getRemoteMediaSlug(input: string): string {
  const videoId = getVideoId(input)
  if (videoId) {
    return `youtube_${videoId}`
  }

  try {
    const url = new URL(input)
    const statusMatch = url.pathname.match(/\/status(?:es)?\/([^/?#]+)/)
    if (statusMatch) {
      return sanitizeSlug(`${url.hostname.replace(/^www\./, '')}_${statusMatch[1]}`)
    }

    const pathPart = url.pathname.split('/').filter(Boolean).pop()
    const slugSource = pathPart || url.hostname
    return sanitizeSlug(`${url.hostname.replace(/^www\./, '')}_${slugSource}`)
  } catch {
    return 'remote_media'
  }
}

export async function downloadRemoteAudio(url: string): Promise<string> {
  if (!isRemoteMediaUrl(url) && !isYouTubeUrl(url)) {
    throw new Error('Invalid remote media URL')
  }

  const mediaSlug = getRemoteMediaSlug(url)

  console.log(isYouTubeUrl(url) ? '🎥 Downloading YouTube audio...' : '🎥 Downloading remote media audio...')

  const outputPath = join(tmpdir(), `${mediaSlug}_${Date.now()}.mp3`)

  // Probe for real total size so we can drive an honest progress bar.
  // This is fast (metadata only) and lets us use real data for sources like HLS broadcasts.
  let totalBytes: number | null = null
  try {
    const json = await new Promise<string>((resolve) => {
      let out = ''
      const probe = spawn('yt-dlp', ['-J', '--no-warnings', '--no-playlist', url])
      probe.stdout.on('data', (d) => { out += d.toString() })
      probe.on('close', () => resolve(out))
      probe.on('error', () => resolve(''))
    })
    if (json) {
      const info = JSON.parse(json)
      totalBytes = info?.filesize ?? info?.filesize_approx ?? null
    }
  } catch {
    // No total available — we will be honest and not show a fake percentage bar.
  }

  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '-x',                          // Extract audio (after downloading best available format)
      '--audio-format', 'mp3',       // Convert final result to MP3
      '--audio-quality', '9',        // Low quality MP3 is plenty for speech transcription
      '-o', outputPath,              // Output path
      '--no-playlist',               // Don't download playlists
      '--no-warnings',               // Suppress warnings
      '--newline',                   // One progress line per update (easier to parse)
      url
    ])

    let output = ''
    let barActive = false
    let liveActive = false
    let currentBytes = 0
    let lastSpeed = ''

    const progressBar = totalBytes
      ? new SingleBar({
          format: `   ${pc.cyan('{bar}')} {percentage}% | {value} / {total} | ETA: {eta_formatted}`,
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
          stopOnComplete: true,
        })
      : null

    // Honest live activity line (used when we have no total size to compute % against)
    const throbber = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let throbIdx = 0
    const renderLive = () => {
      if (!liveActive) return
      const char = throbber[throbIdx++ % throbber.length]
      const sizePart = currentBytes > 0 ? formatBytes(currentBytes) : '…'
      const speedPart = lastSpeed ? ` @ ${lastSpeed}` : ''
      process.stdout.write(`\r${char} Downloading ${sizePart}${speedPart}   `)
    }

    const startBarIfNeeded = () => {
      if (progressBar && !barActive) {
        progressBar.start(100, 0, {
          value: '0 B',
          total: totalBytes ? formatBytes(totalBytes) : '?',
        })
        barActive = true
      }
    }

    const updateFromClassicPercent = (percent: number) => {
      if (progressBar) {
        startBarIfNeeded()
        progressBar.update(percent)
      }
    }

    const updateFromRealBytes = (bytes: number) => {
      currentBytes = bytes
      if (progressBar && totalBytes && totalBytes > 0) {
        const pct = Math.min(99.5, (bytes / totalBytes) * 100) // leave headroom for final mux/extract
        startBarIfNeeded()
        progressBar.update(pct, {
          value: formatBytes(bytes),
          total: formatBytes(totalBytes),
        })
      } else if (!progressBar) {
        // No total → honest live stats line instead of a lying bar
        liveActive = true
        renderLive()
      }
    }

    const parseFfmpegStats = (line: string) => {
      // Real data from FFmpeg during HLS / external-downloader downloads, e.g.:
      // frame=  538 fps= 43 q=-1.0 size=    4864KiB time=00:00:17.88 bitrate=2227.6kbits/s speed=1.42x elapsed=9
      const sizeMatch = line.match(/size=\s*([\d.]+\s*(?:KiB|kB|MiB|MB)?)/i)
      if (sizeMatch) {
        const bytes = parseSizeToBytes(sizeMatch[1])
        if (bytes != null) updateFromRealBytes(bytes)
      }
      const speedMatch = line.match(/speed=\s*([\d.]+x)/i)
      if (speedMatch) lastSpeed = speedMatch[1]
    }

    ytdlp.stdout.on('data', (data) => {
      const text = data.toString()
      output += text

      for (const line of text.split('\n')) {
        // Classic yt-dlp percentage (real when the source provides it)
        const pct = line.match(/\[download\].*?([\d.]+)%/)
        if (pct) {
          updateFromClassicPercent(Math.min(100, Math.max(0, parseFloat(pct[1]))))
        }

        // Real byte progress from FFmpeg (the actual data for Twitter/X broadcasts etc.)
        parseFfmpegStats(line)
      }
    })

    ytdlp.stderr.on('data', (data) => {
      const text = data.toString()
      output += text

      for (const line of text.split('\n')) {
        // Some sources (HLS) emit the interesting progress on stderr
        const pct = line.match(/\[download\].*?([\d.]+)%/)
        if (pct) {
          updateFromClassicPercent(Math.min(100, Math.max(0, parseFloat(pct[1]))))
        }
        parseFfmpegStats(line)
      }
    })

    ytdlp.on('close', (code) => {
      if (barActive && progressBar) {
        if (totalBytes) progressBar.update(100)
        progressBar.stop()
      }
      if (liveActive) {
        process.stdout.write('\r' + ' '.repeat(80) + '\r') // clear the live line
        console.log(`✅ Download complete! (${currentBytes ? formatBytes(currentBytes) : 'done'})`)
      } else if (code === 0) {
        console.log('✅ Download complete!')
      }

      if (code === 0) {
        resolve(outputPath)
      } else {
        let errorMsg = `yt-dlp exited with code ${code}`

        if (output.includes('ERROR')) {
          const errorLines = output.split('\n').filter((l) => l.includes('ERROR'))
          errorMsg += '\n\n' + errorLines.join('\n')
        }

        if (code === 127 || output.includes('command not found')) {
          errorMsg =
            'yt-dlp is not installed. Please install it:\n' +
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
        reject(
          new Error(
            'yt-dlp is not installed. Please install it:\n' +
            '  macOS: brew install yt-dlp\n' +
            '  Ubuntu: sudo apt install yt-dlp\n' +
            '  Windows: winget install yt-dlp\n' +
            '  Or: pip install yt-dlp'
          )
        )
      } else {
        reject(err)
      }
    })
  })
}

export async function downloadYouTubeAudio(url: string): Promise<string> {
  if (!isYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL')
  }

  return downloadRemoteAudio(url)
}
