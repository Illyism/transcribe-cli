import { spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { extname, join } from "path";

const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

export function isVideoFile(path: string): boolean {
  return VIDEO_EXT.has(extname(path).toLowerCase());
}

export function idlePeaks(bars: number, frame: number): number[] {
  const peaks: number[] = [];
  const t = frame / 18;
  for (let i = 0; i < bars; i++) {
    const a = Math.abs(Math.sin(t * 0.9 + i * 0.19));
    const b = Math.abs(Math.sin(t * 0.33 + i * 0.07));
    peaks.push(0.08 + 0.22 * a * (0.45 + 0.55 * b));
  }
  return peaks;
}

export async function extractPeaks(
  inputPath: string,
  bars = 96
): Promise<number[]> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-nostdin",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-filter:a",
      "aresample=4000",
      "-map",
      "0:a:0?",
      "-c:a",
      "pcm_s16le",
      "-f",
      "s16le",
      "-v",
      "error",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 4000 * 2 * 60 * 20;

    ff.stdout.on("data", (data: Buffer) => {
      if (total >= maxBytes) return;
      const slice = total + data.length > maxBytes ? data.subarray(0, maxBytes - total) : data;
      chunks.push(slice);
      total += slice.length;
    });

    const fail = () => resolve(Array.from({ length: bars }, () => 0.12));

    ff.on("error", fail);
    ff.on("close", (code) => {
      if (code !== 0 || total < 4) {
        fail();
        return;
      }
      const buf = Buffer.concat(chunks, total);
      const samples = Math.floor(buf.length / 2);
      const step = Math.max(1, Math.floor(samples / bars));
      const peaks: number[] = [];
      for (let i = 0; i < bars; i++) {
        let max = 0;
        const start = i * step;
        const end = Math.min(samples, start + step);
        for (let s = start; s < end; s++) {
          const v = Math.abs(buf.readInt16LE(s * 2)) / 32768;
          if (v > max) max = v;
        }
        peaks.push(Math.min(1, max * 1.4));
      }
      resolve(peaks);
    });
  });
}

export async function extractPoster(inputPath: string): Promise<string | null> {
  if (!isVideoFile(inputPath) || !existsSync(inputPath)) return null;

  const dir = join(tmpdir(), "transcribe-tui");
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(`poster-v2:${inputPath}`).digest("hex").slice(0, 12);
  const out = join(dir, `${hash}.jpg`);
  if (existsSync(out)) return out;

  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-nostdin",
      "-ss",
      "1",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(640,iw)':-2,setsar=1",
      "-q:v",
      "4",
      "-y",
      out,
    ]);
    ff.on("error", () => resolve(null));
    ff.on("close", (code) => {
      resolve(code === 0 && existsSync(out) ? out : null);
    });
  });
}
