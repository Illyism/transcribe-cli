# I Built a YouTube Transcription Tool Because Uploading 4GB Videos Was Killing Me

## The Problem I Kept Running Into

I record a lot of long-form content. 30 to 60-minute videos that end up being 2 to 4 gigabytes. 

Every time I wanted to transcribe them, I'd open Descript or another tool, click "upload," and then... wait. And wait. And wait some more.

Twenty minutes later, I'd still be staring at a progress bar.

The issue? These tools upload the **entire video file** just to extract the audio and transcribe it. That's like shipping an entire car across the country when you only need the engine.

## The Lightbulb Moment

I was using OpenAI's Whisper API for transcription already. It's fast, accurate, and costs just $0.006 per minute of audio.

But here's the thing: Whisper only needs the **audio**, not the video. And a 4GB video typically has only about 20-40MB of audio.

So I asked myself: What if I extracted the audio locally first, then uploaded just that?

The math was simple:
- **Old way**: Upload 4GB → wait 20+ minutes → transcribe
- **New way**: Extract audio (30 seconds) → upload 30MB → transcribe (same speed)

That's when I built `@illyism/transcribe`.

## How It Works (The Simple Version)

```bash
npx @illyism/transcribe video.mp4
```

That's it. One command.

Behind the scenes:
1. FFmpeg extracts the audio locally (takes seconds)
2. Audio is automatically optimized (sped up 1.2x for even faster uploads)
3. Uploads just 10-15MB to OpenAI's Whisper API
4. Generates perfect SRT subtitle files
5. Timestamps are automatically adjusted back to match your original video

## The A/B Test Results

I'm a numbers person, so I tested three approaches on a 2.7GB, 22-minute video:

| Method | File Size | Processing Time | Result |
|--------|-----------|-----------------|--------|
| Baseline (original audio) | 2767 MB | 72s | Standard |
| **Speed (1.2x)** | **12.8 MB** | **65.4s** | **Winner** ✅ |
| Opus compression | 14.3 MB | 86.8s | Good but slower |

The speed optimization won. It's 9% faster, uses 99.5% less bandwidth, and maintains ~98% accuracy. 

Same cost, better speed, no downsides.

So I made it the default.

## YouTube Videos? Even Better.

Want to transcribe a YouTube video? Just paste the URL:

```bash
npx @illyism/transcribe https://www.youtube.com/watch?v=VIDEO_ID
```

The tool:
1. Downloads just the audio (not the video)
2. Optimizes it automatically
3. Transcribes it
4. Gives you a perfect SRT file

I tested it with a 45-minute tech talk. The original video would've been huge to download, but the tool grabbed just the audio (66MB), compressed it to 22MB, and transcribed it perfectly.

## Who This Is For

You'll find this useful if you:
- Record podcasts or long-form videos
- Need accurate subtitles fast
- Work with large video files regularly
- Want to transcribe YouTube content
- Are tired of waiting for uploads

Content creators, developers, podcasters - you get the idea.

## The Tech Behind It

If you're curious about the implementation:

- **Language**: TypeScript + Node.js/Bun
- **Audio Processing**: FFmpeg for extraction and optimization
- **YouTube**: yt-dlp for reliable downloads
- **Transcription**: OpenAI Whisper API
- **Optimization**: 1.2x speed + Opus compression (if needed)
- **Package Size**: 312KB compressed

The whole thing is open source: [github.com/Illyism/transcribe-cli](https://github.com/Illyism/transcribe-cli)

## Getting Started

**Install it:**
```bash
npm install -g @illyism/transcribe
```

**Or just try it without installing:**
```bash
npx @illyism/transcribe video.mp4
```

**You'll need:**
1. An OpenAI API key ([get one here](https://platform.openai.com/api-keys) - free to start)
2. FFmpeg installed (`brew install ffmpeg` on Mac)
3. For YouTube: yt-dlp installed (`brew install yt-dlp`)

**Configure your API key:**
```bash
mkdir -p ~/.transcribe
echo '{"apiKey": "sk-YOUR_KEY_HERE"}' > ~/.transcribe/config.json
```

## The Bottom Line

I built this because I was tired of waiting. 

If you've ever uploaded a 4GB video and watched a progress bar for 20 minutes, you know exactly what I mean.

Now my workflow is:
1. Export video
2. Run one command
3. Get subtitles in under 2 minutes

The tool is free, open source, and on NPM. If it saves you 20 minutes today, that's a win.

Try it out: [npmjs.com/package/@illyism/transcribe](https://www.npmjs.com/package/@illyism/transcribe)

---

*If you found this useful, give it a star on [GitHub](https://github.com/Illyism/transcribe-cli) or share it with someone who needs it.*

*Questions? Issues? Open an issue on GitHub or reach out - I'm [@illyism](https://twitter.com/illyism) on Twitter.*

---

## Technical Deep Dive (For the Curious)

### Why 1.2x Speed?

I ran comprehensive A/B tests. Here's what I found:

- **1.2x is the sweet spot**: Any faster and accuracy drops noticeably
- **Timestamps still work**: The tool automatically divides all timestamps by 1.2 to match your original video
- **Whisper handles it well**: The AI model doesn't struggle with slightly sped-up speech
- **Cost is the same**: Whisper charges per original minute, not processed time

### The 25MB Challenge

OpenAI's Whisper API has a 25MB file size limit. For most videos, the 1.2x speed optimization is enough.

But for long YouTube videos or high-bitrate audio, you might still exceed 25MB. That's when the two-stage optimization kicks in:

1. **Stage 1**: Speed up by 1.2x (usually enough)
2. **Stage 2**: If still >24MB, apply Opus compression with calculated bitrate

The bitrate calculation ensures you stay under 24MB while maintaining the best possible quality.

### Why yt-dlp Instead of ytdl-core?

YouTube actively works to break downloading tools. ytdl-core (an npm package) frequently breaks because it's harder to update quickly.

yt-dlp is:
- Command-line based (easier to update)
- Actively maintained by a huge community
- Works with hundreds of sites, not just YouTube
- Already installed by most developers

Using the system's yt-dlp instead of bundling a library also keeps the package size small (0.77MB vs 2MB+).

### Open Source, By Design

The entire source code is on GitHub with an MIT license. 

Why? Because tools like this should be simple, transparent, and improvable by anyone who needs them.

If you want to add a feature, fix a bug, or just see how it works - it's all there.

---

*Built with: TypeScript, Node.js, FFmpeg, yt-dlp, OpenAI Whisper API*
