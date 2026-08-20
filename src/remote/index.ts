import { tmpdir } from 'os'
import { join } from 'path'
import { parseDownloadPercent, phasePercent } from '../progress'
import { createCookieAuthError, resolveCookiesFromBrowser } from './cookies'
import { DownloadProgress } from './progress'
import { resolveProvider } from './providers'
import {
  getRemoteMediaSlug,
  isYouTubeUrl,
  normalizeRemoteMediaUrl,
} from './urls'
import { extractAudio, filesizeFromProbeInfo, ytDlpNotInstalledError } from './ytdlp'

export type { RemoteProvider, RemoteProviderId } from './providers'
export { resolveProvider } from './providers'
export {
  getInstagramShortcode,
  getRemoteMediaSlug,
  getRemoteProvider,
  getVideoId,
  isInstagramUrl,
  isRemoteMediaUrl,
  isYouTubeUrl,
  needsBrowserCookies,
  normalizeRemoteMediaUrl,
} from './urls'

export interface DownloadRemoteAudioOptions {
  /** Browser name for yt-dlp --cookies-from-browser (chrome, safari, firefox, ...) */
  cookiesFromBrowser?: string
  quiet?: boolean
  onProgress?: (event: { percent: number; message: string; bytes?: number }) => void
}

export async function downloadRemoteAudio(
  url: string,
  options: DownloadRemoteAudioOptions = {}
): Promise<string> {
  const provider = resolveProvider(url)
  if (!provider) {
    throw new Error('Invalid remote media URL')
  }

  const normalizedUrl = normalizeRemoteMediaUrl(url)
  const mediaSlug = getRemoteMediaSlug(normalizedUrl)

  const emoji = provider.id === 'instagram' ? '📸' : '🎥'
  const startMessage = `${emoji} Downloading ${provider.label} audio...`
  if (!options.quiet) {
    console.log(startMessage)
  }
  options.onProgress?.({
    percent: phasePercent('downloading'),
    message: startMessage,
  })

  const { cookieArgs, probe } = await resolveCookiesFromBrowser(
    normalizedUrl,
    provider,
    options.cookiesFromBrowser
  )

  const totalBytes = probe ? filesizeFromProbeInfo(probe.info) : null
  const outputPath = join(tmpdir(), `${mediaSlug}_${Date.now()}.mp3`)
  const progress = options.quiet ? null : new DownloadProgress(totalBytes)

  const reportLine = (line: string) => {
    progress?.handleLine(line)
    const pct = parseDownloadPercent(line)
    if (pct != null) {
      options.onProgress?.({
        percent: phasePercent('downloading', { done: pct, total: 100 }),
        message: `Downloading ${provider.label} ${pct.toFixed(0)}%`,
      })
    }
  }

  const { code, output } = await extractAudio(
    normalizedUrl,
    outputPath,
    cookieArgs,
    {
      onStdoutLine: reportLine,
      onStderrLine: reportLine,
    }
  )

  const success = code === 0
  progress?.finish(success)

  if (success) {
    return outputPath
  }

  let errorMsg = `yt-dlp exited with code ${code}`

  if (output.includes('ERROR')) {
    const errorLines = output.split('\n').filter((l) => l.includes('ERROR'))
    errorMsg += '\n\n' + errorLines.join('\n')
  }

  if (
    provider.needsCookies &&
    (output.includes('empty media response') || output.includes('cookies'))
  ) {
    throw createCookieAuthError(provider.label, errorMsg)
  }

  if (code === 127 || output.includes('command not found')) {
    throw ytDlpNotInstalledError()
  }

  throw new Error(errorMsg)
}

export async function downloadYouTubeAudio(url: string): Promise<string> {
  if (!isYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL')
  }
  return downloadRemoteAudio(url)
}
