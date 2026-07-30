/**
 * Deciding what to transcribe: classifying CLI input and discovering media.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { extname, join } from "path";
import { isRemoteMediaUrl } from "./remote";
import { isScreenStudioInput } from "./screenstudio";

export const SUPPORTED_EXTENSIONS = new Set([
  ".mp4",
  ".mp3",
  ".wav",
  ".m4a",
  ".webm",
  ".ogg",
  ".opus",
  ".mov",
  ".avi",
  ".mkv",
  ".screenstudio",
]);

export type InputKind =
  | "screenstudio"
  | "folder"
  | "file"
  | "remote"
  | "missing";

/**
 * Anything on disk wins over URL detection: a path that exists is never a
 * download target, no matter how domain-like its name looks.
 */
export function resolveInputKind(input: string): InputKind {
  if (existsSync(input)) {
    if (isScreenStudioInput(input)) return "screenstudio";
    return statSync(input).isDirectory() ? "folder" : "file";
  }

  if (isRemoteMediaUrl(input)) return "remote";

  return "missing";
}

export function parseTimeToSeconds(input: string): number {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Invalid time format: empty value");
  }

  // Seconds (supports negatives and decimals)
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw);
  }

  // HH:MM:SS(.mmm) or MM:SS(.mmm)
  const normalized = raw.replace(",", ".");
  const parts = normalized.split(":");

  const parsePart = (value: string) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) throw new Error(`Invalid time format: ${input}`);
    return n;
  };

  if (parts.length === 2) {
    const mm = parsePart(parts[0]);
    const ss = parsePart(parts[1]);
    return mm * 60 + ss;
  }

  if (parts.length === 3) {
    const hh = parsePart(parts[0]);
    const mm = parsePart(parts[1]);
    const ss = parsePart(parts[2]);
    return hh * 3600 + mm * 60 + ss;
  }

  throw new Error(
    `Invalid time format: ${input}\nUse seconds (123.45) or HH:MM:SS(.mmm)`
  );
}

export function listMediaFilesInDir(dirPath: string): string[] {
  return readdirSync(dirPath)
    .filter((name) => {
      const fullPath = join(dirPath, name);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          return name.toLowerCase().endsWith(".screenstudio");
        }
        return SUPPORTED_EXTENSIONS.has(extname(name).toLowerCase());
      } catch {
        return false;
      }
    })
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    )
    .map((name) => join(dirPath, name));
}
