export type ChunkStatus = "pending" | "running" | "done" | "error";

export type TranscribePhase =
  | "extracting"
  | "optimizing"
  | "compressing"
  | "chunking"
  | "transcribing"
  | "writing"
  | "done";

export type JobPhase =
  | "queued"
  | "resolving"
  | "downloading"
  | "extracting-session"
  | TranscribePhase
  | "error";

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeProgress {
  phase: TranscribePhase;
  message: string;
  percent: number;
  chunkIndex?: number;
  chunkTotal?: number;
  chunks?: ChunkStatus[];
  language?: string;
  duration?: number;
  cues?: CaptionCue[];
}

export interface JobProgress {
  phase: JobPhase;
  message: string;
  percent: number;
  chunkIndex?: number;
  chunkTotal?: number;
  chunks?: ChunkStatus[];
  language?: string;
  duration?: number;
  cues?: CaptionCue[];
  bytes?: number;
  totalBytes?: number;
}

const PHASE_PERCENT: Record<JobPhase, number> = {
  queued: 0,
  resolving: 2,
  downloading: 8,
  "extracting-session": 16,
  extracting: 22,
  optimizing: 32,
  compressing: 38,
  chunking: 44,
  transcribing: 50,
  writing: 94,
  done: 100,
  error: 0,
};

export function phasePercent(
  phase: JobPhase,
  extra?: { done: number; total: number }
): number {
  if (extra && extra.total > 0) {
    if (phase === "transcribing") {
      return 50 + (extra.done / extra.total) * 42;
    }
    if (phase === "downloading") {
      return 4 + (extra.done / extra.total) * 16;
    }
  }
  return PHASE_PERCENT[phase];
}

export function whisperCostUsd(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return (durationSeconds / 60) * 0.006;
}

export function parseDownloadPercent(line: string): number | null {
  const match = line.match(/\[download\].*?([\d.]+)%/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}
