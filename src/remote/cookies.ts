import type { RemoteProvider } from './providers'
import { probeInfo, type YtDlpProbeResult } from './ytdlp'

const COOKIE_BROWSERS = ['chrome', 'safari', 'firefox', 'brave', 'edge', 'chromium', 'arc'] as const

export function createCookieAuthError(providerLabel: string, detail?: string): Error {
  return new Error(
    `${providerLabel} requires login cookies to download media.\n\n` +
    (detail ? `${detail}\n\n` : '') +
    `Try one of these:\n` +
    `  1. Log into ${providerLabel} in Chrome/Safari, then re-run\n` +
    `  2. transcribe <url> --cookies-from-browser chrome\n` +
    `  3. Export cookies and use: yt-dlp --cookies cookies.txt <url>\n\n` +
    `Docs: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp`
  )
}

export type ResolvedCookies = {
  browser?: string
  cookieArgs: string[]
  /** Successful probe from cookie/metadata resolution (reuse — avoid a second -J) */
  probe: (YtDlpProbeResult & { ok: true }) | null
}

/**
 * Resolve browser cookies when needed. Returns a successful probe so the
 * caller can reuse metadata (filesize) without probing again.
 */
export async function resolveCookiesFromBrowser(
  url: string,
  provider: RemoteProvider,
  preferred?: string
): Promise<ResolvedCookies> {
  if (preferred) {
    const result = await probeInfo(url, ['--cookies-from-browser', preferred])
    if (result.ok) {
      return {
        browser: preferred,
        cookieArgs: ['--cookies-from-browser', preferred],
        probe: result,
      }
    }
    throw createCookieAuthError(
      provider.label,
      `Could not read cookies from "${preferred}". Make sure that browser is installed and you're logged into ${provider.label}.`
    )
  }

  if (!provider.needsCookies) {
    const bare = await probeInfo(url)
    return {
      cookieArgs: [],
      probe: bare.ok ? bare : null,
    }
  }

  for (const browser of COOKIE_BROWSERS) {
    const result = await probeInfo(url, ['--cookies-from-browser', browser])
    if (result.ok) {
      console.log(`🍪 Using ${browser} cookies for ${provider.label}...`)
      return {
        browser,
        cookieArgs: ['--cookies-from-browser', browser],
        probe: result,
      }
    }
  }

  // Last chance: unauthenticated (works for some public posts)
  const bare = await probeInfo(url)
  if (bare.ok) {
    return { cookieArgs: [], probe: bare }
  }

  throw createCookieAuthError(provider.label, bare.error.split('\n').slice(0, 3).join('\n'))
}
