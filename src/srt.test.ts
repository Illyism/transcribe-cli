import { describe, expect, test } from "bun:test";
import {
  convertSegmentsToSRT,
  formatTime,
  applyRefinedCueTexts,
  nextWordIsHostTld,
  synthesizeSegmentsFromWords,
  toOriginalTimeline,
  transformSegments,
  wordsFromTranscription,
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

describe("synthesizeSegmentsFromWords", () => {
  test("returns empty array for empty or missing words", () => {
    expect(synthesizeSegmentsFromWords([])).toEqual([]);
    expect(synthesizeSegmentsFromWords(undefined as any)).toEqual([]);
  });

  test("groups words ending with terminal punctuation", () => {
    const words = [
      { word: "Hello", start: 0, end: 0.5 },
      { word: "world.", start: 0.5, end: 1.0 },
      { word: "How", start: 1.2, end: 1.5 },
      { word: "are", start: 1.5, end: 1.7 },
      { word: "you?", start: 1.7, end: 2.1 },
    ];

    const segments = synthesizeSegmentsFromWords(words);
    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe("Hello world.");
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBe(1.0);
    expect(segments[1].text).toBe("How are you?");
    expect(segments[1].start).toBe(1.2);
    expect(segments[1].end).toBe(2.1);
  });

  test("splits words on large silence gaps", () => {
    const words = [
      { word: "First", start: 0, end: 0.5 },
      { word: "phrase", start: 0.5, end: 1.0 },
      { word: "second", start: 3.5, end: 4.0 }, // gap of 2.5s > 1.2s default
      { word: "phrase", start: 4.0, end: 4.5 },
    ];

    const segments = synthesizeSegmentsFromWords(words);
    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe("First phrase");
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBe(1.0);
    expect(segments[1].text).toBe("second phrase");
    expect(segments[1].start).toBe(3.5);
    expect(segments[1].end).toBe(4.5);
  });

  test("prefers caption-length cues by default", () => {
    const words = [
      { word: " One", start: 0, end: 0.3 },
      { word: " two", start: 0.3, end: 0.6 },
      { word: " three", start: 0.6, end: 0.9 },
      { word: " four", start: 0.9, end: 1.2 },
      { word: " five", start: 1.2, end: 1.5 },
      { word: " six", start: 1.5, end: 1.8 },
      { word: " seven", start: 1.8, end: 2.1 },
      { word: " eight", start: 2.1, end: 2.4 },
      { word: " nine", start: 2.4, end: 2.7 },
      { word: " ten", start: 2.7, end: 3.0 },
    ];

    const segments = synthesizeSegmentsFromWords(words);
    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe("One two three four five six seven eight");
    expect(segments[1].text).toBe("nine ten");
  });

  test("splits on a comma once a clause is long enough", () => {
    const words = [
      { word: "They", start: 0, end: 0.2 },
      { word: "make", start: 0.2, end: 0.4 },
      { word: "professional", start: 0.4, end: 0.8 },
      { word: "galleries,", start: 0.8, end: 1.2 },
      { word: "then", start: 1.2, end: 1.4 },
      { word: "share", start: 1.4, end: 1.7 },
      { word: "them", start: 1.7, end: 1.9 },
    ];

    const segments = synthesizeSegmentsFromWords(words);
    expect(segments.map((segment) => segment.text)).toEqual([
      "They make professional galleries,",
      "then share them",
    ]);
  });

  test("splits words exceeding max duration", () => {
    const words = [
      { word: "One", start: 0, end: 2.0 },
      { word: "Two", start: 2.0, end: 4.0 },
      { word: "Three", start: 4.0, end: 7.0 }, // total > 6s
      { word: "Four", start: 7.0, end: 8.0 },
    ];

    const segments = synthesizeSegmentsFromWords(words, { maxDurationSeconds: 5.0 });
    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe("One Two Three");
    expect(segments[1].text).toBe("Four");
  });

  test("keeps a hostname and TLD in the same cue", () => {
    const words = [
      { word: "look", start: 0, end: 0.2 },
      { word: "at", start: 0.2, end: 0.4 },
      { word: "picspot", start: 0.4, end: 0.8 },
      { word: "co", start: 0.8, end: 1.0 },
      { word: "to", start: 1.0, end: 1.2 },
      { word: "see", start: 1.2, end: 1.4 },
    ];

    const segments = synthesizeSegmentsFromWords(words, { maxWordsPerSegment: 3 });
    expect(segments.map((item) => item.text)).toEqual(["look at picspot co", "to see"]);
  });
});

describe("nextWordIsHostTld", () => {
  test("matches common TLDs after a hostname", () => {
    expect(nextWordIsHostTld("picspot", "co")).toBe(true);
    expect(nextWordIsHostTld("Pixieset.", "com")).toBe(true);
    expect(nextWordIsHostTld("because", "they")).toBe(false);
    expect(nextWordIsHostTld("go", "to")).toBe(false);
  });
});

describe("applyRefinedCueTexts", () => {
  test("maps refined text onto original timings", () => {
    const original = [
      segment({ id: 0, start: 0, end: 1, text: "picspot co" }),
      segment({ id: 1, start: 1, end: 2, text: "looks good" }),
    ];
    const refined = [
      segment({ id: 0, start: 99, end: 100, text: "PicSpot.co" }),
      segment({ id: 1, start: 101, end: 102, text: "Looks good." }),
    ];

    expect(applyRefinedCueTexts(original, refined)).toEqual([
      { ...original[0], text: "PicSpot.co" },
      { ...original[1], text: "Looks good." },
    ]);
  });

  test("returns null when the model drops or invents cues", () => {
    const original = [segment({ text: "one" }), segment({ text: "two" })];
    expect(applyRefinedCueTexts(original, [segment({ text: "one" })])).toBeNull();
  });
});

describe("wordsFromTranscription", () => {
  test("prefers top-level words, then nested segment words", () => {
    expect(
      wordsFromTranscription({
        words: [{ word: "hi", start: 0, end: 1 }],
        segments: [{ words: [{ word: "nope", start: 2, end: 3 }] }],
      })
    ).toEqual([{ word: "hi", start: 0, end: 1 }]);

    expect(
      wordsFromTranscription({
        segments: [
          { words: [{ word: "a", start: 0, end: 0.5 }] },
          { words: [{ word: "b", start: 0.5, end: 1 }] },
        ],
      })
    ).toEqual([
      { word: "a", start: 0, end: 0.5 },
      { word: "b", start: 0.5, end: 1 },
    ]);
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
  test("is the identity for unchunked, unshifted audio", () => {
    const map = toOriginalTimeline({ chunkOffsetSeconds: 0, offsetSeconds: 0 });
    expect(map(0)).toBe(0);
    expect(map(42.5)).toBe(42.5);
  });

  test("places a later chunk after the ones before it", () => {
    const map = toOriginalTimeline({ chunkOffsetSeconds: 1000, offsetSeconds: 0 });
    expect(map(0)).toBe(1000);
    expect(map(10)).toBe(1010);
  });

  test("applies the user offset", () => {
    const map = toOriginalTimeline({ chunkOffsetSeconds: 0, offsetSeconds: 3600 });
    expect(map(0)).toBe(3600);
    expect(map(10)).toBe(3610);
  });

  test("chunk boundaries stay continuous", () => {
    const chunkDuration = 1000;
    const endOfFirst = toOriginalTimeline({ chunkOffsetSeconds: 0, offsetSeconds: 0 })(chunkDuration);
    const startOfSecond = toOriginalTimeline({ chunkOffsetSeconds: chunkDuration, offsetSeconds: 0 })(0);
    expect(startOfSecond).toBe(endOfFirst);
  });
});

describe("chunked transcription end to end", () => {
  test("maps two chunks onto one offset SRT timeline", () => {
    const offsetSeconds = 3600;
    const chunkOffsets = [0, 600];

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
        toOriginalTimeline({ chunkOffsetSeconds: chunkOffsets[index], offsetSeconds })
      )
    );

    expect(convertSegmentsToSRT(merged)).toBe(
      [
        "1",
        "01:00:00,000 --> 01:00:02,500",
        "first chunk",
        "",
        "2",
        "01:00:02,500 --> 01:00:05,000",
        "still first",
        "",
        "3",
        "01:10:00,000 --> 01:10:02,500",
        "second chunk",
        "",
        "",
      ].join("\n")
    );
  });
});
