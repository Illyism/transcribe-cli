import { describe, expect, test } from "bun:test";
import {
  convertSegmentsToSRT,
  formatTime,
  toOriginalTimeline,
  transformSegments,
} from "./srt";
import type { WhisperSegment } from "./types";

function segment(overrides: Partial<WhisperSegment>): WhisperSegment {
  return {
    id: 0,
    seek: 0,
    start: 0,
    end: 1,
    text: "hello",
    tokens: [],
    temperature: 0,
    avg_logprob: -0.1,
    compression_ratio: 1,
    no_speech_prob: 0,
    ...overrides,
  };
}

describe("formatTime", () => {
  const cases: Array<[number, string]> = [
    [0, "00:00:00,000"],
    [1.5, "00:00:01,500"],
    [59.999, "00:00:59,999"],
    [60, "00:01:00,000"],
    [3599.25, "00:59:59,250"],
    [3661.234, "01:01:01,234"],
    [86400, "24:00:00,000"],
  ];

  test.each(cases)("%p seconds -> %s", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected);
  });

  test("clamps negative time, which SRT cannot express", () => {
    expect(formatTime(-1)).toBe("00:00:00,000");
    expect(formatTime(-0.001)).toBe("00:00:00,000");
  });

  test("always pads to the SRT field widths", () => {
    expect(formatTime(1.05)).toMatch(/^\d{2}:\d{2}:\d{2},\d{3}$/);
  });
});

describe("convertSegmentsToSRT", () => {
  test("numbers cues from 1 and trims text", () => {
    const srt = convertSegmentsToSRT([
      { start: 0, end: 1.5, text: "  Hello there  " },
      { start: 1.5, end: 3.25, text: "General Kenobi" },
    ]);

    expect(srt).toBe(
      [
        "1",
        "00:00:00,000 --> 00:00:01,500",
        "Hello there",
        "",
        "2",
        "00:00:01,500 --> 00:00:03,250",
        "General Kenobi",
        "",
        "",
      ].join("\n")
    );
  });

  test("no segments produces an empty file rather than a stray cue", () => {
    expect(convertSegmentsToSRT([])).toBe("");
  });

  test("keeps multi-line cue text intact", () => {
    const srt = convertSegmentsToSRT([
      { start: 0, end: 1, text: "line one\nline two" },
    ]);
    expect(srt).toContain("line one\nline two\n\n");
  });
});

describe("transformSegments", () => {
  test("shifts segment and word timings, preserving everything else", () => {
    const [result] = transformSegments(
      [
        segment({
          id: 7,
          start: 1,
          end: 2,
          text: "hi",
          words: [{ word: "hi", start: 1, end: 2 }],
        }),
      ],
      (seconds) => seconds + 10
    );

    expect(result.start).toBe(11);
    expect(result.end).toBe(12);
    expect(result.words).toEqual([{ word: "hi", start: 11, end: 12 }]);
    expect(result.id).toBe(7);
    expect(result.text).toBe("hi");
  });

  test("leaves word-level timings absent when Whisper returned none", () => {
    const [result] = transformSegments([segment({})], (seconds) => seconds);
    expect(result.words).toBeUndefined();
  });

  test("does not mutate the input", () => {
    const input = segment({ start: 1, end: 2 });
    transformSegments([input], (seconds) => seconds * 100);
    expect(input.start).toBe(1);
    expect(input.end).toBe(2);
  });
});

describe("toOriginalTimeline", () => {
  test("is the identity for unoptimized, unchunked, unshifted audio", () => {
    const map = toOriginalTimeline({
      chunkOffsetSeconds: 0,
      speedFactor: 1,
      offsetSeconds: 0,
    });
    expect(map(0)).toBe(0);
    expect(map(42.5)).toBe(42.5);
  });

  test("undoes the 1.2x speed-up", () => {
    const map = toOriginalTimeline({
      chunkOffsetSeconds: 0,
      speedFactor: 1.2,
      offsetSeconds: 0,
    });
    // 60s of sped-up audio covers 72s of the original recording
    expect(map(60)).toBeCloseTo(72, 6);
  });

  test("places a later chunk after the ones before it", () => {
    const map = toOriginalTimeline({
      chunkOffsetSeconds: 1000,
      speedFactor: 1.2,
      offsetSeconds: 0,
    });
    expect(map(0)).toBeCloseTo(1200, 6);
    expect(map(10)).toBeCloseTo(1212, 6);
  });

  test("applies the user offset in original time, not sped-up time", () => {
    const map = toOriginalTimeline({
      chunkOffsetSeconds: 0,
      speedFactor: 1.2,
      offsetSeconds: 3600,
    });
    expect(map(0)).toBeCloseTo(3600, 6);
    expect(map(10)).toBeCloseTo(3612, 6);
  });

  test("chunk boundaries stay continuous on the original timeline", () => {
    const speedFactor = 1.2;
    const chunkDuration = 1000;
    const endOfFirst = toOriginalTimeline({
      chunkOffsetSeconds: 0,
      speedFactor,
      offsetSeconds: 0,
    })(chunkDuration);
    const startOfSecond = toOriginalTimeline({
      chunkOffsetSeconds: chunkDuration,
      speedFactor,
      offsetSeconds: 0,
    })(0);

    expect(startOfSecond).toBeCloseTo(endOfFirst, 6);
  });
});

describe("chunked transcription end to end", () => {
  test("maps two sped-up chunks onto one offset SRT timeline", () => {
    const speedFactor = 1.2;
    const offsetSeconds = 3600;
    const chunkDurations = [0, 500];

    const chunks: WhisperSegment[][] = [
      [
        segment({ start: 0, end: 2.5, text: "first chunk" }),
        segment({ start: 2.5, end: 5, text: "still first" }),
      ],
      [segment({ start: 0, end: 2.5, text: "second chunk" })],
    ];

    const merged = chunks.flatMap((segments, index) =>
      transformSegments(
        segments,
        toOriginalTimeline({
          chunkOffsetSeconds: chunkDurations[index],
          speedFactor,
          offsetSeconds,
        })
      )
    );

    expect(convertSegmentsToSRT(merged)).toBe(
      [
        "1",
        "01:00:00,000 --> 01:00:03,000",
        "first chunk",
        "",
        "2",
        "01:00:03,000 --> 01:00:06,000",
        "still first",
        "",
        "3",
        "01:10:00,000 --> 01:10:03,000",
        "second chunk",
        "",
        "",
      ].join("\n")
    );
  });
});
