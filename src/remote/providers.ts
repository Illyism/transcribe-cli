export type RemoteProviderId = 'youtube' | 'instagram' | 'generic'

export type RemoteProvider = {
  id: RemoteProviderId
  match: (input: string) => boolean
  normalize: (url: URL) => string
  slug: (url: URL) => string | null
  needsCookies: boolean
  label: string
}

function sanitizeSlug(value: string): string {
  return value
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'remote_media'
}

function hostWithoutWww(hostname: string): string {
  return hostname.replace(/^www\./, '')
}

function ensureUrl(input: string): URL | null {
  const withProtocol = /^(https?:\/\/)/i.test(input) ? input : `https://${input}`
  try {
    return new URL(withProtocol)
  } catch {
    return null
  }
}

const youtubeProvider: RemoteProvider = {
  id: 'youtube',
  label: 'YouTube',
  needsCookies: false,
  match: (input) =>
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i.test(input),
  normalize: (url) => url.toString(),
  slug: (url) => {
    const href = url.toString()
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
    ]
    for (const pattern of patterns) {
      const match = href.match(pattern)
      if (match) return `youtube_${match[1]}`
    }
    return null
  },
}

const instagramProvider: RemoteProvider = {
  id: 'instagram',
  label: 'Instagram',
  needsCookies: true,
  match: (input) =>
    /^(https?:\/\/)?(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]+/i.test(input),
  normalize: (url) => {
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.origin}${path}/`
  },
  slug: (url) => {
    const match = url.pathname.match(/\/(?:reel|reels|p|tv)\/([\w-]+)/i)
    return match ? `instagram_${match[1]}` : null
  },
}

const genericProvider: RemoteProvider = {
  id: 'generic',
  label: 'remote media',
  needsCookies: false,
  match: (input) => {
    const url = ensureUrl(input)
    if (!url) return false
    return url.protocol === 'http:' || url.protocol === 'https:'
  },
  normalize: (url) => url.toString(),
  slug: (url) => {
    const statusMatch = url.pathname.match(/\/status(?:es)?\/([^/?#]+)/)
    if (statusMatch) {
      return sanitizeSlug(`${hostWithoutWww(url.hostname)}_${statusMatch[1]}`)
    }

    const pathPart = url.pathname.split('/').filter(Boolean).pop()
    const slugSource = pathPart || url.hostname
    return sanitizeSlug(`${hostWithoutWww(url.hostname)}_${slugSource}`)
  },
}

/** Ordered: specific providers before generic catch-all */
export const REMOTE_PROVIDERS: RemoteProvider[] = [
  youtubeProvider,
  instagramProvider,
  genericProvider,
]

export function resolveProvider(input: string): RemoteProvider | null {
  for (const provider of REMOTE_PROVIDERS) {
    if (provider.match(input)) return provider
  }
  return null
}

export function parseRemoteUrl(input: string): URL | null {
  return ensureUrl(input)
}
