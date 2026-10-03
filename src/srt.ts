/**
 * SRT formatting and timeline math.
 */

import type { WhisperSegment, WhisperWord } from './types'

export function formatTime(seconds: number): string {
  // SRT has no representation for negative time (reachable via a negative --offset)
  const clamped = Math.max(0, seconds)

  // Work in whole milliseconds: `3661.234 % 1` is 0.23399…, which truncates to 233ms
  const totalMs = Math.round(clamped * 1000)
  const hours = Math.floor(totalMs / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export function convertSegmentsToSRT(segments: Array<Pick<WhisperSegment, 'start' | 'end' | 'text'>>): string {
  let srt = ''

  segments.forEach((segment, index) => {
    srt += `${index + 1}\n`
    srt += `${formatTime(segment.start)} --> ${formatTime(segment.end)}\n`
    srt += `${segment.text.trim()}\n\n`
  })

  return srt
}

export function transformSegments(
  segments: WhisperSegment[],
  transform: (seconds: number) => number
): WhisperSegment[] {
  return segments.map((segment) => ({
    ...segment,
    start: transform(segment.start),
    end: transform(segment.end),
    words: segment.words?.map((word: WhisperWord) => ({
      ...word,
      start: transform(word.start),
      end: transform(word.end),
    })),
  }))
}

export function wordsFromTranscription(transcription: {
  words?: WhisperWord[]
  segments?: Array<{ words?: WhisperWord[] }>
}): WhisperWord[] {
  if (transcription.words && transcription.words.length > 0) {
    return transcription.words
  }

  return transcription.segments?.flatMap((segment) => segment.words ?? []) ?? []
}

function joinCaptionWords(words: WhisperWord[]): string {
  return words
    .map((item) => (item.word || '').trim())
    .filter(Boolean)
    .join(' ')
}

const HOST_TLDS = new Set(['com', 'co', 'io', 'ai', 'net', 'org', 'app', 'dev'])

function stripCuePunctuation(token: string): string {
  return token.replace(/^[.]+/, '').replace(/[.,!?…]+$/, '')
}

/** Keep "picspot" + "co" in one cue so autofix can write PicSpot.co. */
export function nextWordIsHostTld(currentWord: string, nextWord: string): boolean {
  const host = stripCuePunctuation(currentWord).toLowerCase()
  const tld = stripCuePunctuation(nextWord).toLowerCase()
  return HOST_TLDS.has(tld) && /^[a-z0-9][a-z0-9-]{1,62}$/.test(host)
}

/** Map LLM cue text onto Whisper timings. Null if the model dropped or invented cues. */
export function applyRefinedCueTexts(
  original: WhisperSegment[],
  refined: WhisperSegment[]
): WhisperSegment[] | null {
  if (refined.length !== original.length) return null
  return original.map((segment, index) => ({
    ...segment,
    text: refined[index].text,
  }))
}

/**
 * Group a word-level timing array into caption-length subtitle cues.
 * Defaults target ~8 words / ~3.5s so on-screen captions stay readable.
 */
export function synthesizeSegmentsFromWords(
  words: WhisperWord[],
  options?: {
    maxGapSeconds?: number
    maxDurationSeconds?: number
    maxWordsPerSegment?: number
  }
): WhisperSegment[] {
  if (!words || words.length === 0) {
    return []
  }

  const maxGap = options?.maxGapSeconds ?? 0.75
  const maxDuration = options?.maxDurationSeconds ?? 3.5
  const maxWords = options?.maxWordsPerSegment ?? 8

  const segments: WhisperSegment[] = []
  let currentWords: WhisperWord[] = []
  let segmentStart = words[0].start
  let segmentId = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    currentWords.push(w)

    const nextWord = words[i + 1]
    const gapToNext = nextWord ? nextWord.start - w.end : Infinity
    const currentDuration = w.end - segmentStart
    const trimmedWord = (w.word || '').trim()
    const endsWithTerminalPunctuation = /[.!?…]$/.test(trimmedWord)
    const endsWithClausePunctuation = /[,;:]$/.test(trimmedWord)

    const nextTrimmed = nextWord ? (nextWord.word || '').trim() : ''
    const keepHostWithTld =
      Boolean(nextWord) &&
      gapToNext < maxGap &&
      nextWordIsHostTld(trimmedWord, nextTrimmed)

    const shouldSplit =
      !keepHostWithTld &&
      (!nextWord ||
        gapToNext >= maxGap ||
        currentDuration >= maxDuration ||
        currentWords.length >= maxWords ||
        endsWithTerminalPunctuation ||
        (endsWithClausePunctuation && (currentWords.length >= 4 || currentDuration >= 2.0)))

    if (shouldSplit) {
      const text = joinCaptionWords(currentWords)
      segments.push({
        id: segmentId++,
        seek: Math.round(segmentStart * 100),
        start: segmentStart,
        end: w.end,
        text,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0,
        words: [...currentWords],
      })

      currentWords = []
      if (nextWord) {
        segmentStart = nextWord.start
      }
    }
  }

  return segments
}

export function parseSRT(srtContent: string): WhisperSegment[] {
  if (!srtContent || !srtContent.trim()) return []

  const clean = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const blocks = clean.split(/\n\s*\n/)
  const segments: WhisperSegment[] = []

  const parseTimestamp = (t: string): number => {
    const raw = t.trim().replace(',', '.')
    const parts = raw.split(':')
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
    }
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    }
    return parseFloat(raw) || 0
  }

  let idCounter = 0
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    let timeLineIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i
        break
      }
    }

    if (timeLineIdx === -1) continue

    const [startStr, endStr] = lines[timeLineIdx].split('-->')
    const start = parseTimestamp(startStr)
    const end = parseTimestamp(endStr)
    const textLines = lines.slice(timeLineIdx + 1)
    const text = textLines.join('\n').trim()

    if (text) {
      segments.push({
        id: idCounter++,
        seek: Math.round(start * 100),
        start,
        end,
        text,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0,
      })
    }
  }

  return segments
}

/**
 * Chunk timestamps are local to their chunk. Map them onto the recording's
 * timeline: shift by the chunk's position, then apply the user's offset.
 */
export function toOriginalTimeline(options: {
  chunkOffsetSeconds: number
  offsetSeconds: number
}): (seconds: number) => number {
  const { chunkOffsetSeconds, offsetSeconds } = options
  return (seconds) => seconds + chunkOffsetSeconds + offsetSeconds
}
