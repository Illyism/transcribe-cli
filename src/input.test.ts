import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  listMediaFilesInDir,
  parseTimeToSeconds,
  resolveInputKind,
} from "./input";

let root: string;

const file = (...segments: string[]) => join(root, ...segments);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "transcribe-input-"));

  mkdirSync(file("media"), { recursive: true });
  mkdirSync(file("media", "artwork"), { recursive: true });
  mkdirSync(file("media", "session.screenstudio"), { recursive: true });
  mkdirSync(file("recording.screenstudio"), { recursive: true });
  mkdirSync(file("Recording.ScreenStudio"), { recursive: true });
  mkdirSync(file("example.com"), { recursive: true });

  for (const path of [
    ["clip.mp4"],
    ["notes.txt"],
    ["bundle.screenstudio"],
    ["example.com", "clip.mp4"],
    ["media", "clip2.mp4"],
    ["media", "clip10.mp4"],
    ["media", "interview.MP4"],
    ["media", "podcast.wav"],
    ["media", "readme.md"],
    ["media", ".DS_Store"],
  ]) {
    writeFileSync(file(...path), "");
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("resolveInputKind", () => {
  test("classifies files, folders and Screen Studio bundles on disk", () => {
    expect(resolveInputKind(file("clip.mp4"))).toBe("file");
    expect(resolveInputKind(file("notes.txt"))).toBe("file");
    expect(resolveInputKind(file("media"))).toBe("folder");
    expect(resolveInputKind(file("recording.screenstudio"))).toBe(
      "screenstudio"
    );
    expect(resolveInputKind(file("Recording.ScreenStudio"))).toBe(
      "screenstudio"
    );
  });

  test("a zipped Screen Studio bundle is a bundle, not a plain file", () => {
    expect(resolveInputKind(file("bundle.screenstudio"))).toBe("screenstudio");
  });

  test("classifies remote URLs", () => {
    expect(resolveInputKind("https://youtu.be/dQw4w9WgXcQ")).toBe("remote");
    expect(resolveInputKind("youtu.be/dQw4w9WgXcQ")).toBe("remote");
    expect(
      resolveInputKind("https://www.instagram.com/reel/ABC123/")
    ).toBe("remote");
  });

  test("reports missing inputs instead of guessing", () => {
    expect(resolveInputKind(file("nope.mp4"))).toBe("missing");
    expect(resolveInputKind(file("nope.screenstudio"))).toBe("missing");
    expect(resolveInputKind("/definitely/not/here.mp4")).toBe("missing");
  });

  // The regression: `https://` + an absolute path parses as a URL with host `users`,
  // so local files were handed to yt-dlp and failed DNS resolution.
  test("an absolute local path is never treated as remote", () => {
    expect(resolveInputKind("/Users/someone/audits/forminit.mp4")).toBe(
      "missing"
    );
    expect(resolveInputKind(file("clip.mp4"))).toBe("file");
    expect(resolveInputKind(file("audits", "forminit.mp4"))).toBe("missing");
  });

  test("a path that exists on disk wins over URL detection", () => {
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      // Looks exactly like a scheme-less URL, but it is a real directory here.
      expect(resolveInputKind("example.com/clip.mp4")).toBe("file");
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe("listMediaFilesInDir", () => {
  test("returns only media, including Screen Studio bundle directories", () => {
    const found = listMediaFilesInDir(file("media")).map((path) =>
      path.slice(file("media").length + 1)
    );

    expect(found).toEqual([
      "clip2.mp4",
      "clip10.mp4",
      "interview.MP4",
      "podcast.wav",
      "session.screenstudio",
    ]);
  });

  test("returns absolute paths", () => {
    for (const path of listMediaFilesInDir(file("media"))) {
      expect(path.startsWith(file("media"))).toBe(true);
    }
  });

  test("an empty folder yields nothing", () => {
    expect(listMediaFilesInDir(file("media", "artwork"))).toEqual([]);
  });
});

describe("parseTimeToSeconds", () => {
  const cases: Array<[string, number]> = [
    ["0", 0],
    ["42", 42],
    ["12.5", 12.5],
    ["-3", -3],
    [" 90 ", 90],
    ["01:30", 90],
    ["00:01:30", 90],
    ["01:00:00", 3600],
    ["01:00:00.000", 3600],
    ["00:01:30.500", 90.5],
    ["00:01:30,500", 90.5],
    ["1:2:3", 3723],
  ];

  test.each(cases)("parses %j as %p seconds", (input, expected) => {
    expect(parseTimeToSeconds(input)).toBeCloseTo(expected, 6);
  });

  const invalid = ["", "   ", "abc", "1:abc", "00:00:00:00", "12:", "::"];

  test.each(invalid)("rejects %j", (input) => {
    expect(() => parseTimeToSeconds(input)).toThrow(/Invalid time format/);
  });
});
