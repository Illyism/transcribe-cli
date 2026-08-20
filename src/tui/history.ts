import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { historyPath } from "../config";

export interface HistoryEntry {
  input: string;
  displayName: string;
  srtPath?: string;
  language?: string;
  duration?: number;
  at: number;
}

const MAX = 30;

export function loadHistory(): HistoryEntry[] {
  try {
    if (!existsSync(historyPath())) return [];
    const parsed = JSON.parse(readFileSync(historyPath(), "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row.input === "string") as HistoryEntry[];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory().filter((row) => row.input !== entry.input)].slice(0, MAX);
  const path = historyPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
