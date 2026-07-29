---
name: transcribe
description: Transcribe any video, audio file, folder, YouTube video, Instagram Reel, Screen Studio recording, or remote URL into SRT subtitles using @illyism/transcribe. Use whenever the user asks to transcribe, generate subtitles, extract captions, or get text from media.
---

# Transcribing Media with `@illyism/transcribe`

Use `npx @illyism/transcribe <input>` to convert any media source into ready-to-use `.srt` subtitles.

## Input Routing Decision Tree

Walk this decision procedure to determine the exact command for any request:

```
What is the input?
├── Local video or audio file (.mp4, .mov, .mkv, .mp3, .wav, etc.)
│   └── Run: npx @illyism/transcribe /path/to/media.mp4
├── Folder of media files
│   └── Run: npx @illyism/transcribe /path/to/folder/
│       (Presents an interactive picker; outputs .srt next to each selected file)
├── YouTube URL (watch, shorts, or youtu.be)
│   └── Run: npx @illyism/transcribe "https://www.youtube.com/watch?v=VIDEO_ID"
├── Instagram Reel / Post / IGTV (instagram.com/reel/, /p/)
│   ├── Default: npx @illyism/transcribe "https://www.instagram.com/reel/SHORTCODE/"
│   └── If auth fails or browser specified:
│       └── npx @illyism/transcribe "https://www.instagram.com/reel/SHORTCODE/" --cookies-from-browser chrome
├── Screen Studio recording (.screenstudio bundle or zip)
│   └── Run: npx @illyism/transcribe /path/to/recording.screenstudio
└── Any other remote URL (X/Twitter, TikTok, Vimeo, etc.)
    └── Run: npx @illyism/transcribe "https://x.com/user/status/123"
```

## Options & Flags

Apply flags based on specific requirements:

- **Custom output location**: `-o /path/to/output.srt` (for single files) or `-o /path/to/dir/` (for folders)
- **Force original audio (disable 1.2x speedup)**: `--raw`
  *Note*: Files under 5 minutes use raw audio automatically. Use `--raw` only when 100% original audio speed is required on files >= 5 minutes.
- **Timecode offset**: `--offset 01:00:00.000` or `--offset 3600`
  *Note*: Shifts subtitle start timestamps to align with NLE video editor timelines (e.g. Premiere, Final Cut, Resolve).
- **Custom chunk size**: `--chunk-minutes 10`
  *Note*: Media is automatically split into ~20-minute chunks for Whisper API upload reliability. Use smaller chunks if a file exceeds Whisper's 25MB limit.

## Troubleshooting Decision Tree

When an error occurs during execution, walk this recovery tree:

```
What is the error message?
├── "OPENAI_API_KEY not found"
│   └── Set env var: export OPENAI_API_KEY=sk-... (or create ~/.transcribe/config.json)
├── "FFmpeg is not installed"
│   └── Install FFmpeg: brew install ffmpeg (macOS), sudo apt install ffmpeg (Linux)
├── "yt-dlp is not installed"
│   └── Install yt-dlp: brew install yt-dlp (macOS), sudo apt install yt-dlp (Linux)
└── "Instagram requires login cookies" / empty media response
    └── Instagram blocks unauthenticated scrapers. Ensure you are logged into Instagram in a desktop browser, then run:
        npx @illyism/transcribe "<url>" --cookies-from-browser <browser_name>
```
