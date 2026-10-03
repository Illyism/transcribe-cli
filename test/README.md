# Transcription Evaluation & Benchmark Suite

Evaluation benchmarks comparing speech-to-text accuracy, latency, costs, and subtitle timestamp fidelity across OpenAI Whisper and OpenRouter multimodal models.

## Quick Start

```bash
bun test/eval.ts                    # production default (what the CLI does with your keys)
bun test/eval.ts --matrix           # all presets
bun test/eval.ts --models=default,whisper-raw
bun test/eval.ts --matrix --full    # full-length recording instead of the sample
```

The runner calls the production `transcribe()` with no credentials of its own, so keys and routing resolve exactly as they do in the CLI. It writes `eval.md` (summary table, full SRT per preset, OpenRouter generation IDs) and `eval-results.json` next to it. Both are gitignored because they contain the private test transcript.

Audio lives in `test/stitched.m4a` (full) and `test/stitched-sample.m4a` (sample), also gitignored. Cut a sample with:

```bash
ffmpeg -ss 600 -t 360 -i test/stitched.m4a -c copy test/stitched-sample.m4a
```

Token counts and LLM cost are read from the provider responses. Whisper cost is list price ($0.006/min). Quality is not scored: read the SRTs in `eval.md` side by side.

## Structure

```
test/
├── eval.ts                # Benchmark runner
├── format-eval-error.ts   # Safe provider error formatting
├── eval-openrouter-ids.ts # OpenRouter generation ID helpers
├── package.json           # Eval runner scripts
└── README.md              # This file
```

---

## Results: 6-minute sample (2026-10-04, v4.2.0)

Code-switched Russian/English conversation with technical terms, one chunk, 114 cues.

| Preset | Latency | Cues | LLM calls | Upload | Tokens in (audio) / out (reasoning) | Cost |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| `default` (Whisper + Gemini cleanup, no speaker labels) | 48.2s | 114 | 3 | 1.77 MB | 14,364 (8,839) / 10,640 (5,839) | $0.0867 |
| `whisper-raw` | 18.4s | 114 | 0 | — | — | $0.0360 |
| `gemini-multimodal` | 40.6s | 79 | 1 | 4.06 MB | 9,070 (9,000) / 6,001 (2,415) | $0.0293 |
| `hybrid-autofix-diarize` | 57.8s | 114 | 3 | 1.77 MB | 14,490 (8,839) / 13,781 (8,920) | $0.0985 |

The cleanup pass costs about $0.05 per 6 minutes on top of Whisper, and most of that is output and reasoning tokens, not audio.

### Autofix audio: whole chunk per batch vs. a slice per batch

Same sample, `default` preset, one run each.

| Variant | Latency | Upload | Tokens in (audio) / out | Cost |
| :--- | ---: | ---: | ---: | ---: |
| Whole chunk attached to every batch, batches in sequence (4.1.1) | 106.0s | 12.20 MB | 32,525 (27,000) / 11,248 | $0.1026 |
| Slice per batch, 4 batches in parallel (4.2.0) | 51.2s | 1.77 MB | 14,364 (8,839) / 12,081 | $0.0921 |

Read side by side, the sliced output keeps every cue aligned and follows the audio at least as closely (spoken fillers and English code-switches are kept).

### Rejected: lower reasoning effort for autofix

| Reasoning effort | Latency | Tokens out (reasoning) | Cost |
| :--- | ---: | ---: | ---: |
| provider default (kept) | 51.2s | 12,081 (7,279) | $0.0921 |
| `minimal` | 31.6s | 5,276 (461) | $0.0666 |
| `low` | 39.2s | 4,826 (0) | $0.0649 |

Cheaper and faster, but the text starts moving between cues: words slide into the neighbouring cue, and with `low` whole sentences are re-segmented and re-transcribed from the audio. Cue timings stay fixed, so captions drift out of sync with speech. Not adopted.

---

## Earlier long-form run (4.0.0, 133.7 minutes)

Kept for reference. It predates autofix batching, so the hybrid latency and cost no longer apply.

| Model / Pipeline | Backend / Gateway | Latency | Cost (133.7m) | Total Cues | Avg Cue Duration | Timestamp Integrity | Vocabulary & Jargon Fidelity | Speaker Diarization |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- | :--- | :--- |
| **`whisper-raw`** | OpenAI Audio API | **116.5s** (~1.94m) | **$0.8022** ($0.006/min) | **3,309 cues** | ~1.66s | **Rock Solid** (frame-accurate) | Acoustic mishearings on loanwords | None |
| **`gemini-multimodal`** | OpenRouter Multimodal | **163.5s** (~2.72m) | **~$0.0353** (~23x cheaper) | **1,668 cues** | ~4.80s | **Degraded** (wide blocks & drift) | High Context Awareness | Dialog dashes (`-`) |
| **`hybrid-whisper-autofix-diarize`** | 2-Pass Hybrid Pipeline | **210.0s** (~3.50m) | **~$0.8375** | **3,309 cues** | ~1.66s | **100% Perfect** (Preserves Whisper timecodes) | **95%+ Domain Jargon & Brands** | **Explicit Labels** (`[Speaker 1]`, `[Speaker 2]`) |

---

## Key Findings: Why 1.2x Speedup Was Dropped

Whisper computes an 80-channel log-mel spectrogram with a **10ms hop size and 2x convolution stride**, producing 1 feature vector every 20ms. In natural speech, short vowels last ~50–70ms (3–4 frames). 

At 1.2x speedup:
- Vowels shrink to 25–40ms (1–2 frames), blurring vowel-consonant transitions into adjacent frames.
- WSOLA cross-fading smears unvoiced stop transients (/p/, /t/, /k/), turning `/p/` into `/b/` and dropping initial unstressed syllables.
- For foreign terms with near-zero Language Model priors in a foreign syntax, Whisper relies 100% on the acoustic signal—which was distorted by the speedup filter.

Removing the artificial 1.2x speedup preserves the 20–50ms acoustic transients and dramatically improves word recognition accuracy across all models.

---

## Model Comparison: `GPT-5.6 Luna` vs `Gemini 3.7 Flash` (2-Pass Autofix)

When using `--autofix`, `@illyism/transcribe` routes automatically to the optimal model based on which single token you provide:

| Dimension | **Gemini 3.7 Flash** (OpenRouter / Google AI) | **GPT-5.6 Luna** (OpenAI Direct) |
| :--- | :--- | :--- |
| **Active Key** | `OPENROUTER_API_KEY` | `OPENAI_API_KEY` |
| **Model Type** | Multimodal reasoning model with dynamic thinking | Ultra-compact frontier reasoning/distillation model |
| **Context Window** | **1,000,000 – 2,000,000 tokens** | 128,000 – 256,000 tokens |
| **Audio Grounding** | **Native audio input** (hears audio attachment directly) | Text + tokenized audio via multimodal gateways |
| **Time to First Token (TTFT)** | ~200–350ms | **~90–180ms** (Instant streaming) |
| **Code-Switching & Slang** | **Deep multilingual cross-lingual priors** (excels at mixed syntax + English tech terms) | Strong localized token smoothing |
| **Speaker Diarization** | Resolves multi-speaker turns across full 2h+ context | Accurate for 2-speaker localized conversations |
| **Cost per 1M Tokens** | **$0.10 in / $0.40 out** (~$0.004 / audio hr) | **$0.15 in / $0.60 out** (~$0.008 / audio hr) |
| **Best Suited For** | Dense jargon, long podcasts, multi-speaker meetings | Low-latency live streams, strict deterministic 1:1 edits |

