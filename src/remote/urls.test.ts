import { describe, expect, test } from "bun:test";
import { resolveProvider } from "./providers";
import {
  getInstagramShortcode,
  getRemoteMediaSlug,
  getRemoteProvider,
  getVideoId,
  isInstagramUrl,
  isRemoteMediaUrl,
  isYouTubeUrl,
  needsBrowserCookies,
  normalizeRemoteMediaUrl,
} from "./urls";

describe("isRemoteMediaUrl", () => {
  const localPaths = [
    "/Users/illyism/audits/forminit.mp4",
    "/Users/illyism/Movies/My Recording.mov",
    "/tmp/clip.wav",
    "./forminit.mp4",
    "../clips/a.mov",
    "~/Movies/b.mkv",
    "forminit.mp4",
    "recording.mov",
    "recording.screenstudio",
    "clip.opus",
    "videos/clip.mov",
    "day-9",
    "2026.07.30 standup.mov",
    "C:\\videos\\x.mkv",
    "",
    "   ",
  ];

  // A path that parses as a URL once a scheme is bolted on is the regression that
  // sent local files to yt-dlp: `https:///Users/me/clip.mp4` resolves to host `users`.
  test.each(localPaths)("treats %j as a local path", (path) => {
    expect(isRemoteMediaUrl(path)).toBe(false);
    expect(resolveProvider(path)).toBeNull();
  });

  const remoteUrls = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "youtu.be/dQw4w9WgXcQ",
    "https://www.instagram.com/reel/ABC123xyz/",
    "instagram.com/reel/ABC123xyz/",
    "https://x.com/MTSlive/status/2059310566783467782",
    "x.com/MTSlive/status/2059310566783467782",
    "http://example.com/media/talk.mp4",
    "https://vimeo.com/123456789",
    "https://example.com:8443/media/talk.mp4",
  ];

  test.each(remoteUrls)("treats %j as remote", (url) => {
    expect(isRemoteMediaUrl(url)).toBe(true);
  });

  test("a bare domain with no path is not a media URL", () => {
    expect(isRemoteMediaUrl("example.com")).toBe(false);
    expect(isRemoteMediaUrl("https://example.com")).toBe(true);
  });

  test("non-http schemes are rejected", () => {
    expect(isRemoteMediaUrl("file:///Users/illyism/clip.mp4")).toBe(false);
    expect(isRemoteMediaUrl("ftp://example.com/clip.mp4")).toBe(false);
  });
});

describe("provider routing", () => {
  const cases: Array<[string, string]> = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtube.com/shorts/abc123", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://www.instagram.com/reel/ABC123xyz/", "instagram"],
    ["https://www.instagram.com/p/ABC123xyz/", "instagram"],
    ["https://www.instagram.com/tv/ABC123xyz/", "instagram"],
    ["https://x.com/MTSlive/status/2059310566783467782", "generic"],
    ["https://example.com/media/talk.mp4", "generic"],
  ];

  test.each(cases)("%s resolves to the %s provider", (url, providerId) => {
    expect(getRemoteProvider(url)?.id).toBe(providerId as never);
  });

  test("only Instagram needs browser cookies", () => {
    expect(needsBrowserCookies("https://www.instagram.com/reel/ABC/")).toBe(
      true
    );
    expect(needsBrowserCookies("https://youtu.be/dQw4w9WgXcQ")).toBe(false);
    expect(needsBrowserCookies("https://example.com/talk.mp4")).toBe(false);
    expect(needsBrowserCookies("/Users/illyism/clip.mp4")).toBe(false);
  });

  test("site predicates do not match look-alike hosts", () => {
    expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeUrl("https://notyoutube.com/watch?v=abc")).toBe(false);
    expect(isYouTubeUrl("/Users/illyism/youtube.com/watch?v=abc.mp4")).toBe(
      false
    );

    expect(isInstagramUrl("https://www.instagram.com/reel/ABC/")).toBe(true);
    expect(isInstagramUrl("https://instagram.com.evil.test/reel/ABC/")).toBe(
      false
    );
    expect(isInstagramUrl("https://www.instagram.com/illyism")).toBe(false);
  });
});

describe("getRemoteMediaSlug", () => {
  const cases: Array<[string, string]> = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube_dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube_dQw4w9WgXcQ"],
    ["youtu.be/dQw4w9WgXcQ", "youtube_dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/abc123", "youtube_abc123"],
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42",
      "youtube_dQw4w9WgXcQ",
    ],
    ["https://www.instagram.com/reel/ABC123xyz/", "instagram_ABC123xyz"],
    ["https://www.instagram.com/p/ABC123xyz/?igsh=tracking", "instagram_ABC123xyz"],
    [
      "https://x.com/MTSlive/status/2059310566783467782",
      "x_com_2059310566783467782",
    ],
    ["https://example.com/media/talk.mp4", "example_com_talk_mp4"],
  ];

  test.each(cases)("%s -> %s", (url, slug) => {
    expect(getRemoteMediaSlug(url)).toBe(slug);
  });

  test("falls back for inputs with no provider", () => {
    expect(getRemoteMediaSlug("/Users/illyism/clip.mp4")).toBe("remote_media");
  });

  test("slugs stay filename-safe and bounded", () => {
    const slug = getRemoteMediaSlug(
      `https://example.com/${"a".repeat(200)}/clip name (final).mp4`
    );
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^[\w-]+$/);
  });
});

describe("normalizeRemoteMediaUrl", () => {
  test("Instagram URLs drop tracking params and keep a trailing slash", () => {
    expect(
      normalizeRemoteMediaUrl("https://www.instagram.com/reel/ABC123xyz?igsh=x")
    ).toBe("https://www.instagram.com/reel/ABC123xyz/");
    expect(
      normalizeRemoteMediaUrl("https://www.instagram.com/reel/ABC123xyz///")
    ).toBe("https://www.instagram.com/reel/ABC123xyz/");
  });

  test("scheme-less URLs gain https", () => {
    expect(normalizeRemoteMediaUrl("youtu.be/dQw4w9WgXcQ")).toBe(
      "https://youtu.be/dQw4w9WgXcQ"
    );
  });

  test("non-URLs pass through untouched", () => {
    expect(normalizeRemoteMediaUrl("/Users/illyism/clip.mp4")).toBe(
      "/Users/illyism/clip.mp4"
    );
  });
});

describe("id extraction", () => {
  test("getVideoId only answers for YouTube", () => {
    expect(getVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(getVideoId("https://www.instagram.com/reel/ABC/")).toBeNull();
    expect(getVideoId("/Users/illyism/clip.mp4")).toBeNull();
  });

  test("getInstagramShortcode only answers for Instagram", () => {
    expect(getInstagramShortcode("https://www.instagram.com/reel/ABC123/")).toBe(
      "ABC123"
    );
    expect(getInstagramShortcode("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(getInstagramShortcode("/Users/illyism/clip.mp4")).toBeNull();
  });
});
