# @illyism/transcribe

[![npm version](https://img.shields.io/npm/v/@illyism/transcribe.svg)](https://www.npmjs.com/package/@illyism/transcribe)
[![npm downloads](https://img.shields.io/npm/dt/@illyism/transcribe.svg)](https://www.npmjs.com/package/@illyism/transcribe)
[![skills.sh](https://skills.sh/b/Illyism/transcribe-cli)](https://skills.sh/Illyism/transcribe-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Transcribe audio/video files to SRT subtitles in one command. Optimized for large files, long movies, and video editing workflows.

## Quick Start

```bash
# 1. Try it instantly (no install needed)
npx @illyism/transcribe video.mp4

# 2. Paste your OpenAI or OpenRouter key (one-time setup)
npx @illyism/transcribe setup

# 3. Transcribe anything
npx @illyism/transcribe video.mp4
npx @illyism/transcribe https://www.youtube.com/watch?v=VIDEO_ID
```

**That's it!** Get your [free API key here](https://platform.openai.com/api-keys) and start transcribing.

---

## Why Use This Instead of Whisper CLI?

While OpenAI's Whisper has multiple ways to use it, this tool provides a **simpler, more convenient** experience:

| Feature | @illyism/transcribe | Official Whisper CLI | Local Whisper (whisper.cpp) |
|---------|---------------------|---------------------|----------------------------|
| **Setup** | Zero setup with `npx`/`bunx` | Install Python package | Download models (~1-5GB) |
| **Video Support** | ✅ Automatic with FFmpeg | ❌ Audio only | ❌ Audio only |
| **YouTube Support** | ✅ Built-in | ❌ Manual download | ❌ Manual download |
| **SRT Output** | ✅ Built-in | ❌ Manual formatting | ✅ Available |
| **Processing** | ☁️ Cloud (fast) | ☁️ Cloud (fast) | 💻 Local (slower) |
| **Cost** | $0.006/min | $0.006/min | Free (after setup) |
| **Internet Required** | ✅ Yes | ✅ Yes | ❌ No |
| **Best For** | Quick tasks, videos, YouTube | API integration | Privacy, offline use |

### Key Advantages

- 🎬 **Handles videos directly** - No need to manually extract audio
- 🎥 **YouTube support** - Transcribe YouTube videos with just the URL
- 📝 **SRT format ready** - Generates subtitles automatically
- 🚀 **Zero installation** - Just run `npx @illyism/transcribe video.mp4`
- 🔧 **Simple config** - One-time API key setup
- 🌐 **Cross-platform** - Works on macOS, Linux, Windows

**Perfect for**: Content creators, podcasters, and developers who need quick, accurate transcriptions with minimal setup.

### Real-World Use Case

Got a 30-60 minute video that's 2-4GB? Other tools like Descript upload the **entire video** file, which takes forever and costs more.

This tool:
1. 🎬 Extracts only the audio locally (takes seconds with FFmpeg)
2. ☁️ Uploads only ~20-40MB of audio to Whisper
3. 📝 Generates SRT subtitles

**Result**: 10-100x faster than uploading multi-GB video files. Same quality, fraction of the time and bandwidth.

## Features

- 🎬 **Video & Audio Support**: Works with MP4, MP3, WAV, M4A, WebM, OGG, MOV, AVI, and MKV
- 🎥 **YouTube & Social Video**: Download and transcribe YouTube, Instagram Reels, and X/Twitter videos directly
- 🎯 **High Accuracy**: Powered by OpenAI's Whisper API + optional 2-Pass AI Autofix (`--autofix`)
- 👥 **Speaker Diarization**: Automatically labels speaker turns (`[Speaker 1]: ...`, `[Speaker 2]: ...`)
- 📝 **SRT Format**: Caption-length cues (~8 words / 2–4 seconds) with frame-accurate word timestamps
- 🎞️ **Long Movies**: Automatic chunking for feature-length content (45+ minutes), transcribed in parallel
- 🎬 **Editor-Friendly**: Timecode offset, custom output paths, chunk size control
- 🌐 **OpenAI-Compatible Gateways**: Connect to OpenRouter, LiteLLM, Groq, or self-hosted models
- 🔧 **Simple Setup**: Easy configuration via environment variable or config file

## Installation & Setup

### 🍏 macOS & Automation Integrations

Make transcribing effortless on macOS with right-click Quick Actions, Apple Shortcuts, Raycast, or Drop Zone folders:

<details open>
<summary><b>🖱️ Right-Click Finder Quick Action (Easiest)</b></summary>

Install the native Finder Quick Action in one second:

```bash
npx @illyism/transcribe --install-mac-action
```

**Usage:** Right-click any video or audio file in Finder → **Quick Actions** → **Transcribe Subtitles**. Runs in the background and sends a Mac System Notification when the `.srt` is ready next to your media file.
</details>

<details>
<summary><b>⚡ Apple Shortcuts (Menu Bar / Hotkey)</b></summary>

1. Open **Shortcuts.app** on Mac → Create a new Shortcut.
2. Enable **Use as Quick Action** in shortcut settings.
3. Add action: **Run Shell Script** (`/bin/zsh`):
   ```bash
   export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
   npx @illyism/transcribe "$1"
   ```
4. Pin it to your **Mac Menu Bar** or assign a global keyboard shortcut (e.g. `Cmd + Opt + T`) to transcribe selected files or copied URLs!
</details>

<details>
<summary><b>🚀 Raycast / Alfred Script Command</b></summary>

Create a Raycast Script Command (`transcribe.sh`):

```bash
#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Transcribe File or URL
# @raycast.mode compact
# @raycast.argument1 { "type": "text", "placeholder": "File path or YouTube/Reel URL" }

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
npx @illyism/transcribe "$1"
```

Trigger with `Cmd + Space` → `Transcribe` → paste any URL or file path!
</details>

<details>
<summary><b>📁 Drop Zone Folder (Automator Folder Action)</b></summary>

1. Create a folder on your Desktop: `~/Desktop/Transcribe Drop Zone`
2. Open **Automator.app** → New Document → **Folder Action** → choose `~/Desktop/Transcribe Drop Zone`.
3. Add action: **Run Shell Script**:
   ```bash
   export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
   for f in "$@"; do
     npx @illyism/transcribe "$f"
   done
   ```
Whenever you drop video or audio files into `~/Desktop/Transcribe Drop Zone`, subtitles are generated automatically in the background.
</details>

### Agent Skills (skills.sh)

Install AI agent skills directly via [skills.sh](https://skills.sh/Illyism/transcribe-cli):

```bash
npx skills add Illyism/transcribe-cli
```

Includes `transcribe`, `summarize-transcript`, `video-to-social`, `youtube-chapters`, and `format-converter`. See [skills/](skills/README.md) for details.

### Option 1: Use Instantly (No Install)

```bash
npx @illyism/transcribe video.mp4
```

### Option 2: Install Globally

```bash
npm install -g @illyism/transcribe
# or: bun install -g @illyism/transcribe
```

### Prerequisites

<details>
<summary><b>📦 Install FFmpeg</b> (required)</summary>

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
choco install ffmpeg
```
</details>

<details>
<summary><b>🎥 Install yt-dlp</b> (optional, for YouTube / Instagram / remote URLs)</summary>

```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
sudo apt install yt-dlp

# Windows
winget install yt-dlp

# Or with pip
pip install yt-dlp
```
</details>

<details>
<summary><b>🔑 Get OpenAI API Key</b> (required)</summary>

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy it and set it up below ⬇️
</details>

## API Key Setup (30 seconds)

```bash
transcribe setup
```

Paste one key. The provider is detected from the key, checked against the API, and saved to `~/.transcribe/config.json`. Running `transcribe video.mp4` without a key starts the same prompt.

Prefer environment variables? Either one is enough:

```bash
export OPENAI_API_KEY=sk-YOUR_KEY          # Whisper
export OPENROUTER_API_KEY=sk-or-YOUR_KEY   # Gemini
```

| Keys you have | `transcribe video.mp4` | `--autofix` |
| :--- | :--- | :--- |
| OpenAI | `whisper-1` | `gpt-5.6-luna` |
| OpenRouter | `google/gemini-3.7-flash` | `google/gemini-3.7-flash` |
| Both | `whisper-1` (OpenAI), then Gemini cleanup | `google/gemini-3.7-flash` (OpenRouter) |

With both keys the cleanup pass runs on every transcript (text fixes only, no speaker labels). Add `--autofix` for speaker labels, or `--no-autofix` to skip it.

Each model goes to its own provider with the matching key. A model with a slash (`google/gemini-3.7-flash`) is an OpenRouter model, anything else is an OpenAI model. There is no base URL to set for either.

```bash
transcribe doctor   # shows your keys, tools, and which model each pass will use
```

**Don't have a key?** [Get an OpenAI key](https://platform.openai.com/api-keys) or [OpenRouter key](https://openrouter.ai/keys).

## Usage Examples

```bash
# Local video file
transcribe video.mp4

# 2-Pass Hybrid Pipeline: Frame-perfect Whisper timestamps + automatic AI cleanup & speaker diarization
# Works with your single OPENAI_API_KEY (uses gpt-5.6-luna) or OPENROUTER_API_KEY (uses gemini-3.7-flash)
transcribe podcast.mp3 --autofix

# Optionally specify a custom model for autofix
transcribe podcast.mp3 --autofix google/gemini-3.7-flash
transcribe podcast.mp3 --autofix gpt-5.6-luna

# Disable automatic speaker labels
transcribe podcast.mp3 --autofix --no-diarize

# Transcribe with Gemini instead of Whisper (needs an OpenRouter key)
transcribe video.mp4 --model gemini

# Other OpenAI-compatible endpoints (Groq, LiteLLM, self-hosted)
transcribe video.mp4 --model whisper-large-v3 --base-url https://api.groq.com/openai/v1

# YouTube video
transcribe https://www.youtube.com/watch?v=VIDEO_ID

# Instagram Reel (uses your browser login cookies automatically)
transcribe https://www.instagram.com/reel/SHORTCODE/
transcribe https://www.instagram.com/reel/SHORTCODE/ --cookies-from-browser chrome

# Audio file
transcribe podcast.mp3
```

**Outputs:** Creates `video.srt` in the same directory.

### Editor-Friendly Features

Perfect for video editing workflows:

```bash
# Custom output path (file or directory)
transcribe movie.mkv --output ./subtitles
transcribe movie.mkv --output ./subtitles/movie.srt

# Timecode offset (for editorial timelines)
transcribe movie.mkv --offset 01:00:00.000  # Start at 1 hour
transcribe movie.mkv --offset 3600         # Same, in seconds

# Force chunking for very long movies
transcribe long_movie.mkv --chunk-minutes 15
```

**Why chunking?** Movies 45+ minutes are automatically split into ~20-minute chunks for reliability. Chunks are transcribed in parallel with up to 8 concurrent requests, then merged seamlessly with correct timestamps.

### What Happens Automatically

Audio is always transcribed at its original speed:

```
2.7GB video → Extract speech audio (mono, 16kHz) → Auto-chunk if >45min → Transcribe chunks in parallel → Merge & adjust timestamps
```

**For long media (45+ minutes):**
- Automatically splits into ~20-minute chunks
- Transcribes chunks in parallel with up to 8 concurrent requests
- Merges results with frame-accurate timestamps
- Handles 2+ hour movies reliably

**2-Pass Hybrid Pipeline (`--autofix`):**
- **Pass 1**: Whisper-1 word timestamps, rebuilt into caption-length cues (~8 words / ~3.5s). Hostname + TLD stay in one cue (`picspot co` → autofix can write `PicSpot.co`).
- **Pass 2**: Gemini Flash (or the model you pass) proofreads brands and punctuation in batches of 40 cues, up to 4 at a time. Each batch is sent only its own stretch of audio. If a batch returns the wrong cue count, that batch keeps the original text — timings are never replaced. Speaker labels are on by default; pass `--no-diarize` for on-screen captions.

**Result:** 
- ⚡ 99.5% smaller uploads (2.7GB → ~20MB audio)
- 🚀 10-100x faster than uploading full video  
- 🎯 Frame-accurate timecode synchronization
- 💰 Low cost ($0.006/min)

### Use as a Library

```bash
npm install @illyism/transcribe
```

```typescript
import { transcribe } from '@illyism/transcribe'

const result = await transcribe({
  inputPath: 'video.mp4',
  // Keys come from OPENAI_API_KEY / OPENROUTER_API_KEY or ~/.transcribe/config.json
})

console.log(result.srtPath)  // Path to generated SRT file
console.log(result.text)     // Full transcription text
```

<details>
<summary>Full API reference</summary>

```typescript
interface TranscribeOptions {
  inputPath: string        // Path to video/audio file
  apiKey?: string         // OpenAI / OpenRouter API key (or use env var)
  baseURL?: string        // Custom base URL for OpenAI-compatible endpoints
  model?: string          // Model name (default: "whisper-1")
  autofix?: boolean | string // LLM cleanup pass (default: on when both keys are set)
  diarize?: boolean       // Speaker labels during autofix
  outputPath?: string     // Custom output path (optional)
  offsetSeconds?: number  // Shift timestamps by N seconds
  chunkMinutes?: number   // Chunk size in minutes (default: 20)
}

interface TranscribeResult {
  srtPath: string         // Path to generated SRT file
  text: string           // Full transcription text
  language: string       // Detected language
  duration: number       // Duration in seconds
}
```
</details>

---

## Details

<details>
<summary><b>📋 Supported Formats</b></summary>

- **Video**: MP4, WebM, MOV, AVI, MKV
- **Audio**: MP3, WAV, M4A, OGG, Opus
- **YouTube**: All videos, Shorts, youtu.be links
- **Instagram**: Reels, posts, and IGTV (requires a logged-in browser for cookies)
</details>

<details>
<summary><b>💰 Cost</b></summary>

OpenAI Whisper API: **$0.006 per minute**

Examples:
- 5 min: $0.03
- 30 min: $0.18
- 2 hours: $0.72
</details>

<details>
<summary><b>⚙️ How It Works</b></summary>

1. Extract audio from video (mono, 16kHz - speech optimized)
2. Auto-chunk if >45 minutes (for parallel processing and reliability)
3. Upload chunks to Whisper API (or OpenAI-compatible gateway)
4. Rebuild caption-length SRT cues from word timestamps (~8 words / ~3.5s)
5. Optional 2-pass AI Autofix (`--autofix`): batched brand/punctuation fix; `--no-diarize` for captions
6. Merge chunks and apply timecode offsets (if specified)
7. Clean up temporary files
</details>

<details>
<summary><b>📄 SRT Output Example</b></summary>

```srt
1
00:00:00,000 --> 00:00:02,500
Hey everyone, welcome to another SEO roast. Today

2
00:00:02,500 --> 00:00:04,180
I'm going to take a look at PicSpot.co
```
</details>

## Troubleshooting

<details>
<summary><b>"No API key found" / 401 errors</b></summary>

Run `transcribe setup` to save a key, then `transcribe doctor` to check that each key is valid and see which model each pass will use.
</details>

<details>
<summary><b>"FFmpeg not found"</b></summary>

Install FFmpeg:
```bash
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu
choco install ffmpeg  # Windows
```
</details>

<details>
<summary><b>"yt-dlp not found" (YouTube only)</b></summary>

Install yt-dlp:
```bash
brew install yt-dlp  # macOS
sudo apt install yt-dlp  # Ubuntu
pip install yt-dlp  # Any platform
```
</details>

<details>
<summary><b>File not found error</b></summary>

Use absolute paths:
```bash
transcribe /full/path/to/video.mp4
```
</details>

<details>
<summary><b>API errors (502, timeout, etc.)</b></summary>

OpenAI API may be temporarily down. Wait 30 seconds and try again.
</details>

<details>
<summary><b>"Could not parse multipart form" error</b></summary>

If you're using Bun runtime, switch to Node.js:

```bash
# Use Node.js instead of Bun
node dist/cli.js video.mp4

# Or install globally and use the transcribe command
npm install -g @illyism/transcribe
transcribe video.mp4
```

The CLI works best with Node.js 18+ due to OpenAI SDK compatibility.
</details>

---

## Links

- 📦 [NPM Package](https://www.npmjs.com/package/@illyism/transcribe)
- 🐙 [GitHub Repo](https://github.com/Illyism/transcribe-cli)
- 📚 [Full Changelog](https://github.com/Illyism/transcribe-cli/blob/main/CHANGELOG.md)
- 🧪 [A/B Test Results](https://github.com/Illyism/transcribe-cli/tree/main/test)
- 🐛 [Report Issues](https://github.com/Illyism/transcribe-cli/issues)

## Contributing

Pull requests welcome! See [GitHub repo](https://github.com/Illyism/transcribe-cli).

## License

MIT © [Ilias Ismanalijev](https://github.com/Illyism)
