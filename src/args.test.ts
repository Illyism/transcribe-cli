import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  test("empty argv is a studio launch", () => {
    const parsed = parseArgs([]);
    expect(parsed.input).toBeNull();
    expect(parsed.plain).toBe(false);
    expect(parsed.forceTui).toBe(false);
  });

  test("collects extra inputs", () => {
    const parsed = parseArgs(["a.mp4", "b.mov", "https://youtu.be/x"]);
    expect(parsed.input).toBe("a.mp4");
    expect(parsed.extraInputs).toEqual(["b.mov", "https://youtu.be/x"]);
  });

  test("parses flags", () => {
    const parsed = parseArgs([
      "movie.mkv",
      "--raw",
      "--plain",
      "--chunk-minutes",
      "10",
      "--offset",
      "01:00:00.000",
      "-o",
      "./subs",
      "--cookies-from-browser",
      "chrome",
    ]);
    expect(parsed.useRaw).toBe(true);
    expect(parsed.plain).toBe(true);
    expect(parsed.chunkMinutes).toBe(10);
    expect(parsed.offsetSeconds).toBe(3600);
    expect(parsed.outputArg).toBe("./subs");
    expect(parsed.cookiesFromBrowser).toBe("chrome");
  });

  test("unknown option is captured", () => {
    const parsed = parseArgs(["--nope"]);
    expect(parsed.unknownOption).toBe("--nope");
  });

  test("rejects bad chunk minutes", () => {
    expect(() => parseArgs(["--chunk-minutes", "0"])).toThrow();
  });
});
