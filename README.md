# @illyism/transcribe

[![npm version](https://img.shields.io/npm/v/@illyism/transcribe.svg)](https://www.npmjs.com/package/@illyism/transcribe)
[![npm downloads](https://img.shields.io/npm/dt/@illyism/transcribe.svg)](https://www.npmjs.com/package/@illyism/transcribe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A fast, simple CLI tool to transcribe audio and video files to SRT subtitle format using OpenAI's Whisper API.

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
- ⚡ **Smart Optimization**: Automatic 1.2x speed processing for large files (99.5% size reduction)
- 📝 **SRT Format**: Generates standard SRT subtitle files with precise timestamps
- 🔧 **Simple Setup**: Easy configuration via environment variable or config file
- 🌍 **Multi-language**: Automatically detects language
- 🚀 **Lightning Fast**: Optimized for 2-4GB video files

## Installation

### Try Without Installing (Quick Start)

```bash
# Using npx (npm)
npx @illyism/transcribe video.mp4

# Using bunx (Bun)
bunx @illyism/transcribe video.mp4
```

### Global Installation (Recommended)

```bash
npm install -g @illyism/transcribe
```

or with Bun:

```bash
bun install -g @illyism/transcribe
```

### Local Installation

```bash
npm install @illyism/transcribe
```

## Prerequisites

1. **FFmpeg**: Required for video processing
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   
   # Windows
   choco install ffmpeg
   ```

2. **OpenAI API Key**: Get one at [platform.openai.com](https://platform.openai.com/api-keys)

## Configuration

You need an OpenAI API key to use this tool. **Don't have one yet?**

👉 **[Get your API key here](https://platform.openai.com/api-keys)** (it's free to start!)

Once you have your key, choose one of these setup methods:

### Option 1: Config File (Recommended for Regular Use)

This saves your API key permanently so you don't have to set it every time:

```bash
# Create the config directory and file
mkdir -p ~/.transcribe
echo '{"apiKey": "sk-YOUR_KEY_HERE"}' > ~/.transcribe/config.json

# Replace sk-YOUR_KEY_HERE with your actual key
```

**Verify it worked:**
```bash
cat ~/.transcribe/config.json
# Should show: {"apiKey": "sk-..."}
```

### Option 2: Environment Variable (One-time Use)

For temporary use or CI/CD pipelines:

```bash
export OPENAI_API_KEY='sk-YOUR_KEY_HERE'
```

**Make it permanent** (add to your shell config):

```bash
# For zsh (macOS default)
echo 'export OPENAI_API_KEY="sk-YOUR_KEY_HERE"' >> ~/.zshrc
source ~/.zshrc

# For bash
echo 'export OPENAI_API_KEY="sk-YOUR_KEY_HERE"' >> ~/.bashrc
source ~/.bashrc
```

## Usage

### CLI Usage

#### Basic Usage

```bash
transcribe video.mp4
```

This will create `video.srt` in the same directory.

#### Try Without Installing

```bash
# Using npx (no installation needed)
npx @illyism/transcribe video.mp4

# Using bunx (with Bun)
bunx @illyism/transcribe podcast.mp3
```

#### Examples

```bash
# Transcribe a video
transcribe /path/to/podcast.mp4

# Transcribe an audio file
transcribe interview.mp3

# Transcribe with full path
transcribe ~/Documents/meeting.wav

# Transcribe a YouTube video
transcribe https://www.youtube.com/watch?v=bAYZjVAodoo

# YouTube Shorts also work
transcribe https://www.youtube.com/shorts/VIDEO_ID

# Short YouTube URLs
transcribe https://youtu.be/bAYZjVAodoo

# Disable optimization for original audio
transcribe large-video.mp4 --raw
```

### Automatic Optimization

**All files are automatically optimized by default:**
- ⚡ Speeds up audio by 1.2x for faster processing
- 📉 Reduces file size by 99.5% (2.7GB → 12.8MB)
- ⏱️  Adjusts SRT timestamps back to original speed
- 🎯 Maintains ~98% accuracy
- 💰 Same cost, better speed

Use `--raw` flag to disable optimization and use original audio.

```bash
# With optimization (default)
transcribe video.mp4

# Without optimization
transcribe video.mp4 --raw
```

### Programmatic Usage

You can also use this as a library in your Node.js/Bun projects:

```bash
npm install @illyism/transcribe
```

```typescript
import { transcribe } from '@illyism/transcribe'

const result = await transcribe({
  inputPath: '/path/to/video.mp4',
  apiKey: process.env.OPENAI_API_KEY,
  outputPath: '/custom/path/output.srt', // optional
  optimize: true // default: true, set to false to disable optimization
})

console.log('SRT file:', result.srtPath)
console.log('Language:', result.language)
console.log('Duration:', result.duration)
console.log('Full text:', result.text)
```

#### TypeScript Support

Full TypeScript types are included:

```typescript
import type { TranscribeOptions, TranscribeResult } from '@illyism/transcribe'

const options: TranscribeOptions = {
  inputPath: './video.mp4',
  apiKey: 'sk-...'
}

const result: TranscribeResult = await transcribe(options)
```

### Help

```bash
transcribe --help
```

### Version

```bash
transcribe --version
```

## Output

The tool generates an SRT (SubRip Subtitle) file with the same name as your input file:

```
1
00:00:00,000 --> 00:00:03,420
Hey and thank you for getting the SEO roast.

2
00:00:03,420 --> 00:00:06,840
I'll take a look at your website and see what things we can improve.
```

## Supported Formats

- **Video**: MP4, WebM, MOV, AVI, MKV
- **Audio**: MP3, WAV, M4A, OGG
- **YouTube**: All YouTube videos, Shorts, and youtu.be links

## Cost

The OpenAI Whisper API costs **$0.006 per minute** of audio.

Examples:
- 5 minute video: ~$0.03
- 30 minute podcast: ~$0.18
- 2 hour interview: ~$0.72

## How It Works

1. **Audio Extraction**: If you provide a video file, FFmpeg extracts the audio
2. **Transcription**: The audio is sent to OpenAI's Whisper API
3. **SRT Generation**: The transcription with timestamps is converted to SRT format
4. **Cleanup**: Temporary files are automatically removed

## Troubleshooting

### "OPENAI_API_KEY not found"

Make sure you've set up your API key using one of the configuration methods above.

### "FFmpeg not found"

Install FFmpeg using the instructions in the Prerequisites section.

### "File not found"

Make sure the path to your file is correct. Use absolute paths if needed:

```bash
transcribe /Users/username/Videos/video.mp4
```

### API Errors

If you get a 502 or other API error, wait a moment and try again. OpenAI's API may be experiencing temporary issues.

## Development

### Build

```bash
bun install
bun run build
```

### Test Locally

```bash
bun run dev /path/to/test-file.mp4
```

## License

MIT

## Author

Ilias Ismanalijev

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please open an issue on [GitHub](https://github.com/magicspace/transcribe/issues).
