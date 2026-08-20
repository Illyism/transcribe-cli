import { existsSync, unlinkSync } from "fs";
import { basename, extname, join, resolve } from "path";
import { requireApiKey } from "./config";
import { listMediaFilesInDir, resolveInputKind } from "./input";
import {
  downloadRemoteAudio,
  getRemoteMediaSlug,
} from "./remote";
import type { JobProgress, TranscribeProgress } from "./progress";
import { phasePercent } from "./progress";
import {
  extractScreenStudioAudio,
  getScreenStudioSlug,
} from "./screenstudio";
import { transcribe } from "./transcribe";
import type { TranscribeResult } from "./index";

export interface RunOptions {
  useRaw: boolean;
  outputArg: string | null;
  offsetSeconds?: number;
  chunkMinutes?: number;
  cookiesFromBrowser?: string;
  quiet?: boolean;
  onProgress?: (event: JobProgress) => void;
  apiKey?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fromTranscribe(event: TranscribeProgress): JobProgress {
  return { ...event };
}

export async function transcribeInput(
  input: string,
  options: RunOptions,
  outputOverride?: string
): Promise<TranscribeResult> {
  const apiKey = options.apiKey ?? requireApiKey();
  let inputPath = input;
  let downloadedFile: string | null = null;
  let remoteMediaSlug: string | null = null;
  let screenStudioSlug: string | null = null;
  let isScreenStudio = false;
  let outputPath: string | undefined = outputOverride;

  const inputKind = resolveInputKind(input);
  const emit = (event: JobProgress) => options.onProgress?.(event);

  try {
    if (inputKind === "remote") {
      remoteMediaSlug = getRemoteMediaSlug(input);
      downloadedFile = await downloadRemoteAudio(input, {
        cookiesFromBrowser: options.cookiesFromBrowser,
        quiet: options.quiet,
        onProgress: (event) =>
          emit({
            phase: "downloading",
            message: event.message,
            percent: event.percent,
            bytes: event.bytes,
          }),
      });
      inputPath = downloadedFile;
      if (!options.outputArg && !outputOverride && remoteMediaSlug) {
        outputPath = join(process.cwd(), `${remoteMediaSlug}.srt`);
      }
    } else if (inputKind === "screenstudio") {
      isScreenStudio = true;
      screenStudioSlug = getScreenStudioSlug(input);
      emit({
        phase: "extracting-session",
        message: "🎬 Extracting Screen Studio audio...",
        percent: phasePercent("extracting-session"),
      });
      downloadedFile = await extractScreenStudioAudio(input);
      inputPath = downloadedFile;
      if (!options.outputArg && !outputOverride) {
        outputPath = join(process.cwd(), `${screenStudioSlug}.srt`);
      }
    } else if (inputKind === "missing") {
      throw new Error(`File not found: ${resolve(inputPath)}`);
    } else if (inputKind === "folder") {
      throw new Error("Folder input must be expanded into files before transcribeInput");
    }

    if (options.outputArg && !outputOverride) {
      if (options.outputArg.toLowerCase().endsWith(".srt")) {
        outputPath = options.outputArg;
      } else {
        const base =
          remoteMediaSlug ||
          screenStudioSlug ||
          basename(input, extname(input));
        outputPath = join(options.outputArg, `${base}.srt`);
      }
    }

    return await transcribe({
      inputPath,
      apiKey,
      optimize: isScreenStudio ? false : !options.useRaw,
      outputPath,
      offsetSeconds: options.offsetSeconds,
      chunkMinutes: options.chunkMinutes,
      quiet: options.quiet,
      onProgress: (event) => emit(fromTranscribe(event)),
    });
  } finally {
    if (downloadedFile && existsSync(downloadedFile)) {
      unlinkSync(downloadedFile);
    }
  }
}

export function expandInputs(inputs: string[]): string[] {
  const expanded: string[] = [];
  for (const input of inputs) {
    const kind = resolveInputKind(input);
    if (kind === "folder") {
      const media = listMediaFilesInDir(resolve(input));
      if (media.length === 0) {
        throw new Error(`No supported media files found in: ${resolve(input)}`);
      }
      expanded.push(...media);
    } else {
      expanded.push(input);
    }
  }
  return expanded;
}

export function outputPathForFile(
  filePath: string,
  outputArg: string | null
): string | undefined {
  if (!outputArg) {
    return join(filePath, "..", `${basename(filePath, extname(filePath))}.srt`);
  }
  if (outputArg.toLowerCase().endsWith(".srt")) {
    throw new Error(
      "For folder/multi-file input, --output must be a directory (not a .srt file)"
    );
  }
  return join(outputArg, `${basename(filePath, extname(filePath))}.srt`);
}
