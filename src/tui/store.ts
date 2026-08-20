import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname } from "path";
import { loadConfig, resolveApiKey, saveConfig, type TranscribeConfig } from "../config";
import { resolveInputKind } from "../input";
import type { CaptionCue, ChunkStatus, JobPhase, JobProgress } from "../progress";
import { whisperCostUsd } from "../progress";
import { expandInputs, transcribeInput, type RunOptions } from "../run";
import { shortName } from "./format";
import { loadHistory, pushHistory, type HistoryEntry } from "./history";
import { extractPeaks, extractPoster } from "./media";

export type Mode = "studio" | "palette" | "settings" | "setup";

export interface Job {
  id: string;
  input: string;
  displayName: string;
  status: "idle" | "queued" | "running" | "done" | "error";
  selected: boolean;
  percent: number;
  phase: JobPhase;
  message: string;
  chunks: ChunkStatus[];
  cues: CaptionCue[];
  peaks: number[];
  poster?: string;
  duration?: number;
  language?: string;
  srtPath?: string;
  text?: string;
  error?: string;
  costUsd?: number;
}

export interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export interface TuiBoot {
  inputs: string[];
  run: RunOptions;
  autoStart: boolean;
}

let seq = 1;
let pumping = false;
let clipboard = (text: string) => {
  void text;
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function makeJob(input: string): Job {
  return {
    id: `job_${Date.now()}_${seq++}`,
    input,
    displayName: shortName(input),
    status: "idle",
    selected: true,
    percent: 0,
    phase: "queued",
    message: "ready",
    chunks: [],
    cues: [],
    peaks: [],
  };
}

interface State {
  jobs: Job[];
  activeId: string | null;
  mode: Mode;
  composer: string;
  paletteQuery: string;
  paletteIndex: number;
  toast: string | null;
  frame: number;
  apiKeyPresent: boolean;
  history: HistoryEntry[];
  run: RunOptions;
  settingsDraft: string;
}

const config = loadConfig();

const state: State = {
  jobs: [],
  activeId: null,
  mode: resolveApiKey() ? "studio" : "setup",
  composer: "",
  paletteQuery: "",
  paletteIndex: 0,
  toast: null,
  frame: 0,
  apiKeyPresent: Boolean(resolveApiKey()),
  history: loadHistory(),
  run: {
    useRaw: Boolean(config.raw),
    outputArg: null,
    chunkMinutes: config.chunkMinutes,
    quiet: true,
  },
  settingsDraft: "",
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function toast(message: string) {
  state.toast = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    emit();
  }, 2200);
  emit();
}

function jobById(id: string): Job | undefined {
  return state.jobs.find((job) => job.id === id);
}

function patchJob(id: string, patch: Partial<Job>) {
  const job = jobById(id);
  if (!job) return;
  Object.assign(job, patch);
  emit();
}

function applyProgress(id: string, event: JobProgress) {
  const job = jobById(id);
  if (!job) return;
  job.phase = event.phase;
  job.message = event.message;
  job.percent = event.percent;
  if (event.chunks) job.chunks = event.chunks;
  if (event.cues) job.cues = event.cues;
  if (event.language) job.language = event.language;
  if (event.duration) {
    job.duration = event.duration;
    job.costUsd = whisperCostUsd(event.duration);
  }
  emit();
}

async function hydrateMedia(job: Job) {
  if (!existsSync(job.input)) return;
  const [peaks, poster] = await Promise.all([
    extractPeaks(job.input),
    extractPoster(job.input),
  ]);
  if (jobById(job.id)) {
    patchJob(job.id, { peaks, poster: poster ?? undefined });
  }
}

async function runJob(job: Job) {
  job.status = "running";
  job.phase = "resolving";
  job.message = "starting...";
  job.error = undefined;
  emit();

  try {
    const result = await transcribeInput(job.input, {
      ...state.run,
      quiet: true,
      onProgress: (event) => applyProgress(job.id, event),
    });

    job.status = "done";
    job.phase = "done";
    job.percent = 100;
    job.srtPath = result.srtPath;
    job.text = result.text;
    job.language = result.language;
    job.duration = result.duration;
    job.costUsd = whisperCostUsd(result.duration);
    job.message = `saved ${shortName(result.srtPath)}`;
    state.history = pushHistory({
      input: job.input,
      displayName: job.displayName,
      srtPath: result.srtPath,
      language: result.language,
      duration: result.duration,
      at: Date.now(),
    });
    toast(`saved ${shortName(result.srtPath)}`);
    emit();
  } catch (error) {
    job.status = "error";
    job.phase = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = job.error.split("\n")[0] ?? "failed";
    toast(job.message);
    emit();
  }
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (true) {
      const next = state.jobs.find((job) => job.status === "queued");
      if (!next) break;
      state.activeId = next.id;
      await runJob(next);
    }
  } finally {
    pumping = false;
  }
}

function enqueueInputs(inputs: string[], start: boolean) {
  const created: Job[] = [];
  for (const input of inputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;
    const job = makeJob(trimmed);
    state.jobs.push(job);
    created.push(job);
    void hydrateMedia(job);
  }
  if (created.length) state.activeId = created[0].id;
  emit();
  if (start) {
    for (const job of created) job.status = "queued";
    emit();
    void pump();
  }
}

function reveal(path: string) {
  if (process.platform === "darwin") spawn("open", ["-R", path], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [dirname(path)], { detached: true, stdio: "ignore" }).unref();
}

function openPath(path: string) {
  const bin = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(bin, [path], { detached: true, stdio: "ignore" }).unref();
}

function copy(text: string, label: string) {
  if (!text) {
    toast("nothing to copy");
    return;
  }
  clipboard(text);
  toast(`copied ${label}`);
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot(): State {
    return state;
  },
  bindClipboard(fn: (text: string) => void) {
    clipboard = fn;
  },
  boot(boot: TuiBoot) {
    state.run = { ...state.run, ...boot.run, quiet: true };
    if (boot.inputs.length) {
      try {
        enqueueInputs(expandInputs(boot.inputs), boot.autoStart);
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
      }
    }
  },
  tick() {
    state.frame += 1;
    emit();
  },
  setComposer(text: string) {
    state.composer = text;
    emit();
  },
  setPaletteQuery(text: string) {
    state.paletteQuery = text;
    state.paletteIndex = 0;
    emit();
  },
  setMode(mode: Mode) {
    state.mode = mode;
    if (mode === "palette") {
      state.paletteQuery = "";
      state.paletteIndex = 0;
    }
    emit();
  },
  closeOverlay() {
    if (state.mode === "setup" && !state.apiKeyPresent) return;
    state.mode = "studio";
    emit();
  },
  saveApiKey(key: string) {
    const trimmed = key.trim();
    if (!trimmed) {
      toast("paste an API key first");
      return;
    }
    saveConfig({ apiKey: trimmed });
    process.env.OPENAI_API_KEY = trimmed;
    state.apiKeyPresent = true;
    state.mode = "studio";
    toast("API key saved to ~/.transcribe");
    emit();
  },
  submitComposer() {
    const text = state.composer.trim();
    if (!text) return;
    state.composer = "";
    try {
      const inputs = expandInputs([text]);
      const folder = resolveInputKind(text) === "folder";
      enqueueInputs(inputs, !folder);
      if (folder) toast(`${inputs.length} files queued — enter to start`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  },
  paste(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (state.mode === "setup") {
      this.saveApiKey(trimmed);
      return;
    }
    if (state.mode === "palette") {
      state.paletteQuery += trimmed;
      emit();
      return;
    }
    state.composer = trimmed;
    emit();
    if (/^https?:\/\//i.test(trimmed) || existsSync(trimmed)) {
      this.submitComposer();
    }
  },
  startSelected() {
    const selected = state.jobs.filter((job) => job.selected && (job.status === "idle" || job.status === "error"));
    if (selected.length === 0) {
      const active = this.active();
      if (active && (active.status === "idle" || active.status === "error")) {
        active.status = "queued";
        emit();
        void pump();
        return;
      }
      toast("nothing to start");
      return;
    }
    for (const job of selected) job.status = "queued";
    emit();
    void pump();
  },
  retryActive() {
    const job = this.active();
    if (!job) return;
    job.status = "queued";
    job.error = undefined;
    job.percent = 0;
    job.cues = [];
    emit();
    void pump();
  },
  select(id: string) {
    state.activeId = id;
    emit();
  },
  selectDelta(delta: number) {
    if (state.jobs.length === 0) return;
    const index = Math.max(0, state.jobs.findIndex((job) => job.id === state.activeId));
    const next = (index + delta + state.jobs.length) % state.jobs.length;
    state.activeId = state.jobs[next].id;
    emit();
  },
  toggleSelected(id?: string) {
    const job = id ? jobById(id) : this.active();
    if (!job) return;
    job.selected = !job.selected;
    emit();
  },
  removeActive() {
    const job = this.active();
    if (!job || job.status === "running") {
      toast("can't remove a running job");
      return;
    }
    state.jobs = state.jobs.filter((row) => row.id !== job.id);
    state.activeId = state.jobs[0]?.id ?? null;
    emit();
  },
  enqueueRecent(entry: HistoryEntry) {
    enqueueInputs([entry.input], false);
  },
  active(): Job | null {
    return (state.activeId ? jobById(state.activeId) : state.jobs[0]) ?? null;
  },
  commands(): Command[] {
    const job = this.active();
    return [
      { id: "start", label: "Start selected jobs", hint: "enter", run: () => this.startSelected() },
      { id: "retry", label: "Retry active job", hint: "r", run: () => this.retryActive() },
      { id: "copy", label: "Copy transcript", hint: "c", run: () => copy(job?.text ?? "", "transcript") },
      {
        id: "copy-srt",
        label: "Copy SRT",
        hint: "shift+c",
        run: () => {
          if (!job?.srtPath || !existsSync(job.srtPath)) {
            toast("no SRT yet");
            return;
          }
          copy(readFileSync(job.srtPath, "utf-8"), "srt");
        },
      },
      {
        id: "open",
        label: "Open SRT",
        hint: "o",
        run: () => {
          if (!job?.srtPath) {
            toast("no SRT yet");
            return;
          }
          openPath(job.srtPath);
        },
      },
      {
        id: "reveal",
        label: "Reveal SRT",
        hint: "shift+o",
        run: () => {
          if (!job?.srtPath) {
            toast("no SRT yet");
            return;
          }
          reveal(job.srtPath);
        },
      },
      {
        id: "raw",
        label: state.run.useRaw ? "Use optimized audio" : "Use raw audio",
        hint: "",
        run: () => this.toggleRaw(),
      },
      { id: "settings", label: "Settings", hint: ",", run: () => this.setMode("settings") },
      { id: "quit", label: "Quit", hint: "ctrl+q", run: () => process.exit(0) },
    ];
  },
  filteredCommands(): Command[] {
    const q = state.paletteQuery.trim().toLowerCase();
    const all = this.commands();
    if (!q) return all;
    return all.filter((cmd) => `${cmd.label} ${cmd.id}`.toLowerCase().includes(q));
  },
  paletteMove(delta: number) {
    const cmds = this.filteredCommands();
    if (cmds.length === 0) return;
    state.paletteIndex = (state.paletteIndex + delta + cmds.length) % cmds.length;
    emit();
  },
  runPalette() {
    const cmds = this.filteredCommands();
    const cmd = cmds[state.paletteIndex] ?? cmds[0];
    state.mode = "studio";
    emit();
    cmd?.run();
  },
  palettePick(index: number) {
    state.paletteIndex = index;
    this.runPalette();
  },
  toggleRaw() {
    state.run.useRaw = !state.run.useRaw;
    saveConfig({ raw: state.run.useRaw } satisfies TranscribeConfig);
    toast(state.run.useRaw ? "raw audio on" : "optimization on");
    emit();
  },
  cycleChunks() {
    const options = [10, 15, 20, 30];
    const current = state.run.chunkMinutes ?? 20;
    const next = options[(options.indexOf(current) + 1) % options.length] ?? 20;
    state.run.chunkMinutes = next;
    saveConfig({ chunkMinutes: next });
    toast(`chunks: ${next} min`);
    emit();
  },
  setCookies(value: string) {
    state.run.cookiesFromBrowser = value.trim() || undefined;
    emit();
  },
};

export function playhead(job: Job | null): number {
  if (!job) return 0;
  if (job.status === "done") return 1;
  if (job.duration && job.cues.length > 0) {
    return Math.min(1, job.cues[job.cues.length - 1].end / job.duration);
  }
  return Math.max(0, Math.min(1, job.percent / 100));
}

export function queueCost(): number {
  return state.jobs.reduce((sum, job) => sum + (job.costUsd ?? 0), 0);
}
