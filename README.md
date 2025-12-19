# @illyism/transcribe

[![npm version](https://img.shields.io/npm/v/@illyism/transcribe.svg)](https://www.npmjs.com/package/@illyism/transcribe)
[![npm downloads](https://img.shields.io/npm/dt/@illyism/transcribe.svg)](https://www.npmjs.com/package/@illyism/transcribe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Transcribe audio/video files to SRT subtitles in one command. Optimized for large files, long movies, and video editing workflows.

## Quick Start

```bash
# 1. Try it instantly (no install needed)
npx @illyism/transcribe video.mp4

# 2. Set your OpenAI API key (one-time setup)
export OPENAI_API_KEY=sk-...

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
- 🎥 **YouTube Support**: Download and transcribe YouTube videos directly
- 🎯 **High Accuracy**: Powered by OpenAI's Whisper API
- ⚡ **Smart Optimization**: Automatic 1.2x speed processing + mono/16kHz extraction (optimized for dialogue)
- 📝 **SRT Format**: Generates standard SRT subtitle files with precise timestamps
- 🎞️ **Long Movies**: Automatic chunking for feature-length content (45+ minutes)
- 🎬 **Editor-Friendly**: Timecode offset, custom output paths, chunk size control
- 🔧 **Simple Setup**: Easy configuration via environment variable or config file
- 🌍 **Multi-language**: Automatically detects language
- 🚀 **Lightning Fast**: Optimized for 2-4GB+ video files

## Installation & Setup

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
<summary><b>🎥 Install yt-dlp</b> (optional, for YouTube)</summary>

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

**One-time setup** - Choose your preferred method:

### Method 1: Config File (Recommended)

```bash
mkdir -p ~/.transcribe && echo '{"apiKey": "sk-YOUR_KEY"}' > ~/.transcribe/config.json
```

### Method 2: Environment Variable  

```bash
export OPENAI_API_KEY=sk-YOUR_KEY
```

**Don't have a key?** [Get one free here](https://platform.openai.com/api-keys) (takes 1 minute)

## Usage Examples

```bash
# Local video file
transcribe video.mp4

# YouTube video
transcribe https://www.youtube.com/watch?v=VIDEO_ID

# Audio file
transcribe podcast.mp3

# Disable optimization (use original audio)
transcribe video.mp4 --raw
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

**Why chunking?** Movies 45+ minutes are automatically split into ~20-minute chunks for reliability. Each chunk is transcribed separately, then merged seamlessly with correct timestamps.

### What Happens Automatically

By default, the tool optimizes large files:

```
2.7GB video → Extract audio (mono, 16kHz) → Speed up 1.2x → Chunk if >45min → Upload chunks → Transcribe → Merge & adjust timestamps
```

**For long movies (45+ minutes):**
- Automatically splits into ~20-minute chunks
- Transcribes each chunk separately
- Merges results with correct timestamps
- Handles 2+ hour movies reliably

**Result:** 
- ⚡ 99.5% smaller uploads (2.7GB → 12.8MB)
- 🚀 10-100x faster than uploading full video  
- 🎯 ~98% accuracy maintained
- 💰 Same cost ($0.006/min)

**Want original audio?** Add `--raw` flag.

### Use as a Library

```bash
npm install @illyism/transcribe
```

```typescript
import { transcribe } from '@illyism/transcribe'

const result = await transcribe({
  inputPath: 'video.mp4',
  apiKey: process.env.OPENAI_API_KEY,
  optimize: true // default, set false to disable
})

console.log(result.srtPath)  // Path to generated SRT file
console.log(result.text)     // Full transcription text
```

<details>
<summary>Full API reference</summary>

```typescript
interface TranscribeOptions {
  inputPath: string        // Path to video/audio file
  apiKey?: string         // OpenAI API key (or use env var)
  outputPath?: string     // Custom output path (optional)
  optimize?: boolean      // Enable optimization (default: true)
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

1. Extract audio from video (mono, 16kHz - optimized for speech)
2. Optimize: 1.2x speed + compression if >24MB
3. Auto-chunk if >45 minutes (for reliability)
4. Upload chunks to Whisper API (or single file)
5. Generate SRT with timestamps
6. Merge chunks (if needed) and adjust timestamps to match original
7. Apply timecode offset (if specified)
8. Clean up temp files
</details>

<details>
<summary><b>📄 SRT Output Example</b></summary>

```srt
1
00:00:00,000 --> 00:00:03,420
Hey and thank you for getting the SEO roast.

2
00:00:03,420 --> 00:00:06,840
I'll take a look at your website and see what things we can improve.
```
</details>

## Troubleshooting

<details>
<summary><b>"OPENAI_API_KEY not found"</b></summary>

Set up your API key using one of the methods in [API Key Setup](#api-key-setup-30-seconds).
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
