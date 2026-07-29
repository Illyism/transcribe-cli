# `@illyism/transcribe` User Skills

[![skills.sh](https://skills.sh/b/Illyism/transcribe-cli)](https://skills.sh/Illyism/transcribe-cli)

A collection of user-focused [Agent Skills](https://agentskills.io) for [`@illyism/transcribe`](https://www.npmjs.com/package/@illyism/transcribe) and post-transcription workflows.

## Install via `skills` CLI (skills.sh)

Install all skills into your AI agent (Cursor, Claude Code, Windsurf, etc.) with one command:

```bash
npx skills add Illyism/transcribe-cli
```

Or install a specific skill:

```bash
npx skills add Illyism/transcribe-cli@transcribe
```

## Core Transcription Skill

- **[transcribe](./transcribe/SKILL.md)** — Decision tree and command guide for transcribing any media input (local files, directories, YouTube, Instagram Reels, Screen Studio, remote URLs) with flags for output paths, raw audio, timecode offsets, and cookies.

## Post-Transcription Skills

Skills that transform raw transcription `.srt` files into final end-deliverables:

| Skill | Final Output Deliverable | Link |
|-------|--------------------------|------|
| **summarize-transcript** | Executive summaries, meeting notes, action items, key takeaways | [summarize-transcript](./summarize-transcript/SKILL.md) |
| **video-to-social** | Published X/Twitter threads, LinkedIn posts, newsletter drafts | [video-to-social](./video-to-social/SKILL.md) |
| **youtube-chapters** | Formatted YouTube description chapter timestamps (`00:00 - Intro`) | [youtube-chapters](./youtube-chapters/SKILL.md) |
| **format-converter** | Plain text (`.txt`), WebVTT (`.vtt`), JSON arrays (`.json`), or Markdown (`.md`) | [format-converter](./format-converter/SKILL.md) |

## How to Use These Skills with AI Agents

Copy any skill folder (or the entire `skills/` directory) into your AI agent's skill path:
- Cursor: `.cursor/skills/`
- Claude / Codex / Custom Agents: `.claude/skills/` or equivalent

AI agents will automatically walk these decision trees when you ask to transcribe videos, summarize meetings, create tweets/threads, or format captions.
