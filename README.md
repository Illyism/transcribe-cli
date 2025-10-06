# @illyism/transcribe

A fast, simple CLI tool to transcribe audio and video files to SRT subtitle format using OpenAI's Whisper API.

## Features

- 🎬 **Video & Audio Support**: Works with MP4, MP3, WAV, M4A, WebM, OGG, MOV, AVI, and MKV
- 🎯 **High Accuracy**: Powered by OpenAI's Whisper API
- ⚡ **Fast Processing**: Efficient audio extraction with FFmpeg
- 📝 **SRT Format**: Generates standard SRT subtitle files with precise timestamps
- 🔧 **Simple Setup**: Easy configuration via environment variable or config file
- 🌍 **Multi-language**: Automatically detects language

## Installation

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

### Option 1: Environment Variable (Recommended)

```bash
export OPENAI_API_KEY='sk-...'
```

Add to your `~/.zshrc` or `~/.bashrc` to make it permanent:

```bash
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.zshrc
source ~/.zshrc
```

### Option 2: Config File

Create a config file at `~/.transcribe/config.json`:

```bash
mkdir -p ~/.transcribe
cat > ~/.transcribe/config.json << EOF
{
  "apiKey": "sk-..."
}
EOF
```

## Usage

### CLI Usage

#### Basic Usage

```bash
transcribe video.mp4
```

This will create `video.srt` in the same directory.

#### Examples

```bash
# Transcribe a video
transcribe /path/to/podcast.mp4

# Transcribe an audio file
transcribe interview.mp3

# Transcribe with full path
transcribe ~/Documents/meeting.wav
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
  outputPath: '/custom/path/output.srt' // optional
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
