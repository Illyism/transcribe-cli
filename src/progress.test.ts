import { describe, expect, test } from "bun:test";
import {
  parseDownloadPercent,
  phasePercent,
  whisperCostUsd,
} from "./progress";

describe("phasePercent", () => {
  test("maps phases onto a 0-100 timeline", () => {
    expect(phasePercent("queued")).toBe(0);
    expect(phasePercent("done")).toBe(100);
    expect(phasePercent("transcribing")).toBe(50);
  });

  test("fills transcribing by chunk completion", () => {
    expect(phasePercent("transcribing", { done: 0, total: 4 })).toBe(50);
    expect(phasePercent("transcribing", { done: 4, total: 4 })).toBe(92);
  });
});

describe("whisperCostUsd", () => {
  test("is $0.006 per minute", () => {
    expect(whisperCostUsd(60)).toBeCloseTo(0.006);
    expect(whisperCostUsd(120)).toBeCloseTo(0.012);
    expect(whisperCostUsd(0)).toBe(0);
  });
});

describe("parseDownloadPercent", () => {
  test("reads yt-dlp percent lines", () => {
    expect(parseDownloadPercent("[download]  42.5% of 10.00MiB")).toBe(42.5);
    expect(parseDownloadPercent("size=  1234KiB")).toBeNull();
  });
});
