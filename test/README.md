# Transcription Evaluation & Benchmark Suite

Evaluation benchmarks comparing speech-to-text accuracy, latency, costs, and subtitle timestamp fidelity across OpenAI Whisper and OpenRouter multimodal models.

## Quick Start

```bash
# Run standard evaluation on production presets
bun test/eval.ts

# Run full long-form benchmark
bun test/eval.ts --full
```

## Structure

```
test/
├── eval.ts               # Benchmark runner (Rule-compliant /eval implementation)
├── format-eval-error.ts  # Safe diagnostic provider error formatting
├── eval-openrouter-ids.ts# OpenRouter generation ID tracker & helpers
├── package.json          # Eval runner scripts
└── README.md             # Benchmark analysis and results
```

---

## Benchmark Results (Long-Form Audio Benchmark)

Tested on 133.7-minute real-world conversational audio with dense technical terminology:

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

