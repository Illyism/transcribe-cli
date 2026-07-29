---
name: format-converter
description: Convert SRT subtitle files into WebVTT (.vtt), plain text (.txt), JSON segment arrays (.json), or Markdown notes (.md). Use whenever the user asks to convert an SRT file to VTT, plain text, JSON, or Markdown.
---

# Subtitle & Transcript Format Converter

Convert `.srt` subtitle files into WebVTT (`.vtt`), plain text (`.txt`), JSON (`.json`), or Markdown (`.md`).

## Format Decision Procedure

Walk this procedure based on target format:

```
Which format is requested?
├── Plain Text (.txt)
│   └── Strip all sequence numbers and timestamps. Join continuous paragraphs with single blank lines.
├── WebVTT (.vtt)
│   └── Add "WEBVTT" header at line 1. Replace commas in timestamps with periods (00:00:01,000 → 00:00:01.000).
├── JSON Array (.json)
│   └── Parse into structured array:
│       [
│         { "id": 1, "start": 0.0, "end": 4.5, "text": "..." }
│       ]
└── Markdown Transcript (.md)
    └── Group text into time-stamped sections [MM:SS] with formatted headers and clean paragraphs.
```

## Quick CLI / Script One-Liners

For automated file conversions via Node/Bun or standard tools:

```bash
# Extract plain text from SRT using node/bun
node -e "
const fs = require('fs');
const text = fs.readFileSync('input.srt', 'utf8')
  .replace(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/g, '')
  .replace(/\r?\n\r?\n/g, ' ');
fs.writeFileSync('output.txt', text.trim());
"
```
