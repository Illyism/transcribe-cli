import { spawn } from 'child_process'

export type YtDlpProbeResult =
  | { ok: true; info: Record<string, unknown>; json: string }
  | { ok: false; error: string }

export function ytDlpNotInstalledError(): Error {
  return new Error(
    'yt-dlp is not installed. Please install it:\n' +
    '  macOS: brew install yt-dlp\n' +
    '  Ubuntu: sudo apt install yt-dlp\n' +
    '  Windows: winget install yt-dlp\n' +
    '  Or: pip install yt-dlp'
  )
}

export async function probeInfo(url: string, extraArgs: string[] = []): Promise<YtDlpProbeResult> {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    const probe = spawn('yt-dlp', ['-J', '--no-warnings', '--no-playlist', ...extraArgs, url])

    probe.stdout.on('data', (d) => { out += d.toString() })
    probe.stderr.on('data', (d) => { err += d.toString() })

    probe.on('close', (code) => {
      if (code === 0 && out.trim()) {
        try {
          const info = JSON.parse(out) as Record<string, unknown>
          resolve({ ok: true, info, json: out })
        } catch {
          resolve({ ok: false, error: 'yt-dlp returned invalid JSON metadata' })
        }
      } else {
        resolve({ ok: false, error: (err || out).trim() })
      }
    })

    probe.on('error', (e) => {
      if (e.message.includes('ENOENT')) {
        resolve({ ok: false, error: ytDlpNotInstalledError().message })
      } else {
        resolve({ ok: false, error: e.message })
      }
    })
  })
}

export type ExtractAudioHandlers = {
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
}

export type ExtractAudioResult = {
  code: number | null
  output: string
}

/**
 * Spawn yt-dlp to extract audio to MP3. Resolves when the process exits
 * (caller decides success/failure from code + output).
 */
export function extractAudio(
  url: string,
  outputPath: string,
  extraArgs: string[] = [],
  handlers: ExtractAudioHandlers = {}
): Promise<ExtractAudioResult> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '9',
      '-o', outputPath,
      '--no-playlist',
      '--no-warnings',
      '--newline',
      ...extraArgs,
      url,
    ])

    let output = ''

    const handleChunk = (data: Buffer, which: 'stdout' | 'stderr') => {
      const text = data.toString()
      output += text
      for (const line of text.split('\n')) {
        if (!line) continue
        if (which === 'stdout') handlers.onStdoutLine?.(line)
        else handlers.onStderrLine?.(line)
      }
    }

    ytdlp.stdout.on('data', (data) => handleChunk(data, 'stdout'))
    ytdlp.stderr.on('data', (data) => handleChunk(data, 'stderr'))

    ytdlp.on('close', (code) => {
      resolve({ code, output })
    })

    ytdlp.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(ytDlpNotInstalledError())
      } else {
        reject(err)
      }
    })
  })
}

export function filesizeFromProbeInfo(info: Record<string, unknown>): number | null {
  const size = info.filesize ?? info.filesize_approx
  return typeof size === 'number' && Number.isFinite(size) ? size : null
}
