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

/**
 * Chunk timestamps are local to a chunk of sped-up audio. Map them back onto the
 * original recording's timeline: shift by the chunk's position, undo the speed-up,
 * then apply the user's offset.
 */
export function toOriginalTimeline(options: {
  chunkOffsetSeconds: number
  speedFactor: number
  offsetSeconds: number
}): (seconds: number) => number {
  const { chunkOffsetSeconds, speedFactor, offsetSeconds } = options
  return (seconds) => (seconds + chunkOffsetSeconds) * speedFactor + offsetSeconds
}
