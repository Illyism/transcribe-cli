/**
 * Programmatic API for transcribe
 * Use this if you want to integrate transcription into your Node.js application
 */

import type { TranscribeProgress } from "./progress";

export interface TranscribeOptions {
  apiKey?: string;
  inputPath: string;
  outputPath?: string;
  optimize?: boolean;
  /**
   * Shift all subtitle timestamps by this many seconds (useful for editor timecode offsets).
   * Example: 3600 = start captions at 01:00:00,000
   */
  offsetSeconds?: number;
  /**
   * Chunk media into N-minute pieces and merge results.
   * Defaults to 20 minutes. Chunking is always enabled.
   */
  chunkMinutes?: number;
  /** Skip console logs (studio TUI / library callers that render their own UI). */
  quiet?: boolean;
  onProgress?: (event: TranscribeProgress) => void;
}

export interface TranscribeResult {
  srtPath: string;
  text: string;
  language: string;
  duration: number;
}

export { transcribe } from "./transcribe";
export * from "./types";
export type {
  CaptionCue,
  ChunkStatus,
  JobPhase,
  JobProgress,
  TranscribePhase,
  TranscribeProgress,
} from "./progress";
export { phasePercent, whisperCostUsd } from "./progress";

