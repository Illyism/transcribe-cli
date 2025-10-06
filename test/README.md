# Transcription Optimization Tests

A/B testing different optimization strategies to improve transcription speed, cost, and accuracy.

## Test Strategies

### 1. Speed Up Audio (1.2x)
**Hypothesis**: Speeding up audio reduces transcription time and cost without significant accuracy loss.

**Benefits**:
- ⏱️ Faster processing (20% time reduction)
- 💰 Lower cost (20% reduction: $0.006 → $0.005 per original minute)
- 📦 Smaller file size

**Potential Issues**:
- Accuracy might decrease
- Timestamps need adjustment (divide by 1.2)
- Voice quality degradation

### 2. Opus Compression (<25MB)
**Hypothesis**: Using Opus codec with optimized bitrate maintains quality while reducing file size.

**Benefits**:
- 🚀 Faster uploads (smaller files)
- 💾 Optimized for voice (better than MP3 for speech)
- 📊 Consistent file sizes under 25MB

**Potential Issues**:
- Compression artifacts
- Need to find optimal bitrate
- Accuracy impact unknown

## Running Tests

### Setup
```bash
cd test
bun install
```

### Run Individual Tests

```bash
# Test baseline (original audio)
bun test-baseline.ts <video-file>

# Test 1.2x speed
bun test-speed.ts <video-file>

# Test Opus compression
bun test-opus.ts <video-file>

# Run all tests and compare
bun compare.ts <video-file>
```

## Test Output

Each test generates:
- Processed audio file
- SRT subtitle file
- Metrics JSON file with:
  - File size (original vs processed)
  - Processing time
  - Transcription time
  - Cost estimate
  - Accuracy metrics (if reference available)

## Comparison Metrics

The `compare.ts` script generates a comparison table:

| Method | File Size | Upload Time | Processing | Cost | Accuracy | Total Time |
|--------|-----------|-------------|------------|------|----------|------------|
| Baseline | 45MB | 30s | 120s | $0.72 | 100% | 150s |
| 1.2x Speed | 38MB | 25s | 100s | $0.60 | 98% | 125s |
| Opus | 18MB | 12s | 120s | $0.72 | 99% | 132s |

## Expected Results

### Speed Test (1.2x)
- **Best for**: Cost optimization, faster results
- **Accuracy**: Expected 95-99% of baseline
- **Cost savings**: 20%
- **Speed improvement**: 20%

### Opus Compression
- **Best for**: Large files, slow connections
- **Accuracy**: Expected 98-100% of baseline
- **File size**: 50-70% reduction
- **Upload speed**: 2-3x faster

## Recommendations

Based on file size:

- **< 25MB**: Use baseline (no optimization needed)
- **25-50MB**: Use Opus compression
- **50-100MB**: Consider 1.2x speed + Opus
- **> 100MB**: Use 1.2x speed for cost savings

## Contributing

Add new optimization strategies in this format:
1. Create `test-<strategy>.ts`
2. Update `compare.ts` to include new strategy
3. Document hypothesis and expected results
4. Run tests with various file types

## Notes

- All timestamps in SRT files are adjusted automatically
- Original files are never modified
- Test files are saved in `test/output/`
- Requires OpenAI API key in config
