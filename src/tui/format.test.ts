import { describe, expect, test } from "bun:test";
import { formatCost, formatDuration, formatTimecode, shortName } from "./format";

describe("formatDuration", () => {
  test("renders clocks", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("formatCost", () => {
  test("keeps tiny whisper bills readable", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.006)).toBe("$0.006");
    expect(formatCost(0.18)).toBe("$0.18");
  });
});

describe("formatTimecode", () => {
  test("is a compact caption clock", () => {
    expect(formatTimecode(0)).toBe("00:00.0");
    expect(formatTimecode(75.2)).toBe("01:15.2");
  });
});

describe("shortName", () => {
  test("prefers basename and url tails", () => {
    expect(shortName("/tmp/talk.mp4")).toBe("talk.mp4");
    expect(shortName("https://www.youtube.com/watch?v=abc")).toBe(
      "www.youtube.com/watch"
    );
  });
});
