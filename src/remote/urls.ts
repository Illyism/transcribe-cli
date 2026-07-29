import {
  parseRemoteUrl,
  resolveProvider,
  type RemoteProvider,
} from "./providers";

export function isYouTubeUrl(input: string): boolean {
  return resolveProvider(input)?.id === "youtube";
}

export function isInstagramUrl(input: string): boolean {
  return resolveProvider(input)?.id === "instagram";
}

export function needsBrowserCookies(input: string): boolean {
  return resolveProvider(input)?.needsCookies ?? false;
}

export function isRemoteMediaUrl(input: string): boolean {
  return resolveProvider(input) !== null;
}

export function getRemoteProvider(input: string): RemoteProvider | null {
  return resolveProvider(input);
}

export function normalizeRemoteMediaUrl(input: string): string {
  const provider = resolveProvider(input);
  const url = parseRemoteUrl(input);
  if (!provider || !url) return input;
  return provider.normalize(url);
}

export function getVideoId(url: string): string | null {
  const slug = getRemoteMediaSlug(url);
  if (!slug.startsWith("youtube_")) return null;
  return slug.slice("youtube_".length);
}

export function getInstagramShortcode(input: string): string | null {
  const slug = getRemoteMediaSlug(input);
  if (!slug.startsWith("instagram_")) return null;
  return slug.slice("instagram_".length);
}

export function getRemoteMediaSlug(input: string): string {
  const provider = resolveProvider(input);
  const url = parseRemoteUrl(normalizeRemoteMediaUrl(input));
  if (!provider || !url) return "remote_media";

  return provider.slug(url) ?? "remote_media";
}
