---
name: transcribe
description: Transcribe any video, audio file, folder, YouTube video, Instagram Reel, Screen Studio recording, or remote URL into SRT subtitles using @illyism/transcribe. Use whenever the user asks to transcribe, generate subtitles, extract captions, or get text from media.
---

# Transcribing Media with `@illyism/transcribe`

Use `npx @illyism/transcribe <input>` to convert any media source into a ready-to-use `.srt`.

Cues are caption-length by default (~8 words / ~3.5 seconds) rebuilt from Whisper word timestamps. Re-run transcribe to replace an older long-segment `.srt`. **Do not split or rechunk cues at read, parse, or display time.**

Need unpublished CLI fixes (4.1.1+: batched autofix, hostname+TLD in one cue)? Run from the local checkout instead of npm:

```bash
bun src/cli.ts /path/to/media.mp4 -o /path/to/out.srt --autofix --no-diarize
```

(from `~/Products/transcribe-cli` or the repo you have.)

## On-screen captions vs podcast transcript

```
What is the SRT for?
├── Player captions / roast page / YouTube-style CC
│   └── Always: --autofix --no-diarize
│       Fixes brands and punctuation. No [Speaker N]: labels on screen.
└── Multi-speaker interview / podcast notes
    └── --autofix  (diarization on by default)
```

Autofix proofreads in batches of 40 cues and **keeps the original text** when the model returns a different cue count. Never ship an autofix result that dropped minutes, inverted timestamps, or split `PicSpot.co` into `Picspot.` / `co`. If that happens, you are on a CLI older than 4.1.1 — re-run from the local checkout.

Whisper often hears `bigspot co` / `pixyset`. Autofix writes `PicSpot.co` / `Pixieset.com`. Hostname + TLD word pairs stay in one cue so that rewrite is possible.

Transcribe the **local media file**, not an HLS URL.

## Input Routing Decision Tree

```
What is the input?
├── Local video or audio file (.mp4, .mov, .mkv, .mp3, .wav, etc.)
│   └── npx @illyism/transcribe /path/to/media.mp4
├── Folder of media files
│   └── npx @illyism/transcribe /path/to/folder/
│       (Interactive picker; writes .srt next to each selected file)
├── YouTube URL (watch, shorts, or youtu.be)
│   └── npx @illyism/transcribe "https://www.youtube.com/watch?v=VIDEO_ID"
├── Instagram Reel / Post / IGTV (instagram.com/reel/, /p/)
│   ├── Default: npx @illyism/transcribe "https://www.instagram.com/reel/SHORTCODE/"
│   └── If auth fails or browser specified:
│       └── npx @illyism/transcribe "https://www.instagram.com/reel/SHORTCODE/" --cookies-from-browser chrome
├── Screen Studio recording (.screenstudio bundle or zip)
│   └── npx @illyism/transcribe /path/to/recording.screenstudio
└── Any other remote URL (X/Twitter, TikTok, Vimeo, etc.)
    └── npx @illyism/transcribe "https://x.com/user/status/123"
```

## Options & Flags

- **2-Pass AI Autofix**: `--autofix` or `--autofix <model>` (e.g. `google/gemini-3.7-flash`). Fixes phonetic mishearings, brands, tools, metrics. Diarization is **on** unless you pass `--no-diarize`. With both an OpenAI and an OpenRouter key, a text-only cleanup pass (no speaker labels) runs by default; `--no-autofix` skips it.
- **Captions (no speaker labels)**: `--autofix --no-diarize`
- **Custom model**: `-m` / `--model` (`whisper`, `gemini`, or any id). Models with a slash (`google/gemini-3.7-flash`) go to OpenRouter with the OpenRouter key; no base URL needed
- **Custom base URL**: `--base-url` only for other OpenAI-compatible endpoints (Groq, LiteLLM)
- **Output**: `-o /path/to/output.srt` or `-o /path/to/dir/`
- **Timecode offset**: `--offset 01:00:00.000` or `--offset 3600` (NLE timelines)
- **macOS Finder Quick Action**: `--install-mac-action`

## After a run

Spot-check before calling it done:

- Cue count is in the ballpark of `duration / 3s` (a 22 min roast is ~400–500 cues, not ~200)
- No inverted or jumping timestamps
- Opening brands are spelled as the product spells them (`PicSpot.co`, not `bigspot co`)
- Captions have no `[Speaker 1]:` unless the user asked for diarization

## Troubleshooting

```
What is the error or symptom?
├── "No API key found" / 401 / wrong model used
│   └── transcribe doctor (shows keys + routing). Fix with: transcribe setup, or export OPENAI_API_KEY / OPENROUTER_API_KEY
├── "FFmpeg is not installed"
│   └── brew install ffmpeg  (or sudo apt install ffmpeg)
├── "yt-dlp is not installed"
│   └── brew install yt-dlp
├── Instagram requires login / empty media
│   └── npx @illyism/transcribe "<url>" --cookies-from-browser chrome
├── Long 6–10s cues / old Whisper segments
│   └── Re-run transcribe and overwrite the .srt. Do not split at read time.
└── Autofix dropped cues or split a domain across lines
    └── CLI < 4.1.1. Re-run from the local checkout with --autofix --no-diarize.
```
