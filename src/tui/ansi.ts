import { spawn } from "child_process";
import pc from "picocolors";
import { formatCost, formatDuration, formatPercent, formatTimecode } from "./format";
import { idlePeaks } from "./media";
import { playhead, queueCost, store, type Job, type TuiBoot } from "./store";

const WAVE = "▁▂▃▄▅▆▇█";

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function clip(s: string, cols: number): string {
  if (cols <= 0) return "";
  const plain = strip(s);
  if (plain.length <= cols) return s + " ".repeat(cols - plain.length);
  let out = "";
  let n = 0;
  const re = /(\x1b\[[0-9;]*m)|([^\x1b])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1]) {
      out += m[1];
      continue;
    }
    if (n >= cols) break;
    out += m[2];
    n++;
  }
  return out;
}

function line(cols: number, ...parts: string[]): string {
  return clip(parts.join(""), cols);
}

function bar(pct: number, width: number, on = "━", off = "─"): string {
  const w = Math.max(1, width);
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * w);
  return pc.magenta(on.repeat(filled)) + pc.dim(off.repeat(Math.max(0, w - filled)));
}

function wave(job: Job | null, frame: number, width: number): string {
  const n = Math.max(8, width);
  const peaks = job && job.peaks.length ? job.peaks : idlePeaks(n, frame);
  const head = playhead(job);
  const step = peaks.length / n;
  let out = "";
  for (let i = 0; i < n; i++) {
    const p = peaks[Math.min(peaks.length - 1, Math.floor(i * step))] ?? 0.1;
    const ch = WAVE[Math.min(WAVE.length - 1, Math.max(0, Math.round(p * (WAVE.length - 1))))];
    out += i / n <= head ? pc.magenta(ch) : pc.dim(ch);
  }
  return out;
}

function statusDot(job: Job): string {
  if (job.status === "running") return pc.magenta("●");
  if (job.status === "done") return pc.green("●");
  if (job.status === "error") return pc.red("●");
  if (job.status === "queued") return pc.yellow("●");
  return pc.dim("○");
}

function layout(cols: number, rows: number): string[] {
  const snap = store.snapshot();
  const job = store.active();
  const lines: string[] = [];
  const live = snap.jobs.some((row) => row.status === "running");

  lines.push(
    line(
      cols,
      pc.bold(" transcribe"),
      pc.dim("  studio  "),
      live ? pc.red("REC") : pc.cyan("IDLE"),
      "  ",
      pc.yellow(formatCost(queueCost())),
      snap.toast ? pc.magenta(`  ${snap.toast}`) : ""
    )
  );
  lines.push(line(cols, pc.dim("─".repeat(cols))));

  if (snap.mode === "setup") {
    lines.push(line(cols, ""));
    lines.push(line(cols, pc.bold(" unlock whisper")));
    lines.push(
      line(cols, pc.dim(" paste an OpenAI API key. stored in ~/.transcribe/config.json"))
    );
    lines.push(line(cols, ""));
    lines.push(line(cols, pc.magenta(" sk-"), snap.composer, pc.inverse(" ")));
    lines.push(line(cols, pc.dim(" enter saves · get a key at platform.openai.com/api-keys")));
    while (lines.length < Math.max(0, rows - 2)) lines.push(line(cols, ""));
    lines.push(line(cols, pc.dim(" ctrl+q quit")));
    return lines.slice(0, rows);
  }

  if (snap.mode === "palette") {
    lines.push(line(cols, pc.magenta(" / "), snap.paletteQuery, pc.inverse(" ")));
    lines.push(line(cols, pc.dim("─".repeat(cols))));
    const cmds = store.filteredCommands();
    for (const [i, cmd] of cmds.entries()) {
      const mark = i === snap.paletteIndex ? pc.bgMagenta(pc.white(" > ")) : "   ";
      lines.push(
        line(cols, mark, " ", cmd.label, cmd.hint ? pc.dim(`  ${cmd.hint}`) : "")
      );
    }
    if (cmds.length === 0) lines.push(line(cols, pc.dim(" no matches")));
    while (lines.length < Math.max(0, rows - 2)) lines.push(line(cols, ""));
    lines.push(line(cols, pc.dim(" enter run · esc close · ↑↓ move")));
    return lines.slice(0, rows);
  }

  if (snap.mode === "settings") {
    lines.push(line(cols, pc.bold(" settings")));
    lines.push(
      line(
        cols,
        " audio     ",
        pc.magenta(snap.run.useRaw ? "raw" : "optimized 1.2x"),
        pc.dim("   (t to toggle)")
      )
    );
    lines.push(
      line(
        cols,
        " chunks    ",
        pc.magenta(`${snap.run.chunkMinutes ?? 20} min`),
        pc.dim("   (c to cycle)")
      )
    );
    lines.push(line(cols, pc.dim(" esc close")));
    while (lines.length < rows) lines.push(line(cols, ""));
    return lines.slice(0, rows);
  }

  const queueWidth = cols >= 90 ? Math.min(28, Math.floor(cols * 0.28)) : 0;
  const stageWidth = cols - (queueWidth ? queueWidth + 1 : 0);
  const bodyRows = Math.max(4, rows - 5);
  const queueLines: string[] = [];
  const stageLines: string[] = [];

  if (queueWidth) {
    queueLines.push(clip(pc.dim(" queue"), queueWidth));
    if (snap.jobs.length === 0) {
      queueLines.push(clip(pc.dim(" drop a path"), queueWidth));
      queueLines.push(clip(pc.dim(" or paste a url"), queueWidth));
    }
    for (const row of snap.jobs) {
      const active = snap.activeId === row.id;
      const label = `${statusDot(row)} ${row.displayName}`;
      queueLines.push(clip(active ? pc.bold(label) : label, queueWidth));
      queueLines.push(
        clip(`  ${bar(row.percent / 100, Math.max(6, queueWidth - 8))} ${formatPercent(row.percent)}`, queueWidth)
      );
    }
    if (snap.history.length) {
      queueLines.push(clip(pc.dim(" recent"), queueWidth));
      for (const entry of snap.history.slice(0, 6)) {
        queueLines.push(clip(pc.dim(` ${entry.displayName}`), queueWidth));
      }
    }
  }

  const title = job ? job.displayName : "awaiting input";
  const meta = `${formatDuration(job?.duration)} · ${formatPercent(playhead(job) * 100)}`;
  stageLines.push(
    clip(` ${pc.bold(title)}${" ".repeat(Math.max(1, stageWidth - strip(title).length - strip(meta).length - 2))}${pc.dim(meta)}`, stageWidth)
  );
  stageLines.push(clip(` ${wave(job, snap.frame, Math.max(8, stageWidth - 2))}`, stageWidth));

  if (job && job.chunks.length > 1) {
    const cells = job.chunks
      .map((status, i) => {
        const n = String(i + 1).padStart(2, "0");
        if (status === "running") return pc.magenta(`[${n}]`);
        if (status === "done") return pc.green(`[${n}]`);
        if (status === "error") return pc.red(`[${n}]`);
        return pc.dim(`[${n}]`);
      })
      .join(" ");
    stageLines.push(clip(` ${cells}`, stageWidth));
  }

  stageLines.push(clip(pc.dim("─".repeat(stageWidth)), stageWidth));
  const cues = job?.cues ?? [];
  const current = cues.length ? cues[cues.length - 1] : null;
  stageLines.push(
    clip(
      ` ${current ? pc.bold(current.text) : pc.dim("captions land here as whisper returns chunks")}`,
      stageWidth
    )
  );
  const cueRoom = Math.max(0, bodyRows - stageLines.length);
  const shown = cues.slice(-cueRoom);
  for (const cue of shown) {
    stageLines.push(
      clip(` ${pc.cyan(formatTimecode(cue.start))}  ${cue.text}`, stageWidth)
    );
  }

  for (let i = 0; i < bodyRows; i++) {
    const q = queueLines[i] ?? clip("", queueWidth);
    const s = stageLines[i] ?? clip("", stageWidth);
    if (queueWidth) lines.push(q + pc.dim("│") + s);
    else lines.push(s);
  }

  lines.push(line(cols, pc.dim("─".repeat(cols))));
  const prompt =
    snap.mode === "studio"
      ? `${pc.magenta(" ❯ ")} ${snap.composer}${pc.inverse(" ")}`
      : "";
  lines.push(line(cols, prompt));
  const jobMsg = job?.message && job.status !== "idle" ? pc.dim(` ${job.message}`) : "";
  lines.push(
    line(
      cols,
      pc.dim(" ctrl+k palette · enter go · ↑↓ queue · c copy · o open · ctrl+q quit"),
      jobMsg
    )
  );

  while (lines.length < rows) lines.push(line(cols, ""));
  return lines.slice(0, rows);
}

function draw() {
  const cols = Math.max(40, process.stdout.columns || 80);
  const rows = Math.max(12, process.stdout.rows || 24);
  const lines = layout(cols, rows);
  let out = "\x1b[?25l\x1b[H";
  for (let i = 0; i < rows; i++) {
    out += `\x1b[2K${lines[i] ?? ""}`;
    if (i < rows - 1) out += "\r\n";
  }
  process.stdout.write(out);
}

function copyText(text: string) {
  process.stdout.write(`\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`);
  if (process.platform === "darwin") {
    const child = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.end(text);
  }
}

function restore() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {
    // ignore
  }
  process.stdout.write("\x1b[?25h\x1b[?1049l\x1b[?2004l");
}

function handleByte(key: string) {
  const snap = store.snapshot();

  if (key === "\x03" || key === "\x11") {
    restore();
    process.exit(0);
  }

  if (snap.mode === "setup") {
    if (key === "\r") {
      store.saveApiKey(snap.composer);
      return;
    }
    if (key === "\x7f" || key === "\x08") {
      store.setComposer(snap.composer.slice(0, -1));
      return;
    }
    if (key.length === 1 && key >= " ") store.setComposer(snap.composer + key);
    return;
  }

  if (key === "\x0b" || key === "\x10") {
    store.setMode(snap.mode === "palette" ? "studio" : "palette");
    return;
  }

  if (snap.mode === "palette") {
    if (key === "\x1b") {
      store.closeOverlay();
      return;
    }
    if (key === "\r") {
      store.runPalette();
      return;
    }
    if (key === "\x1b[A") {
      store.paletteMove(-1);
      return;
    }
    if (key === "\x1b[B") {
      store.paletteMove(1);
      return;
    }
    if (key === "\x7f" || key === "\x08") {
      store.setPaletteQuery(snap.paletteQuery.slice(0, -1));
      return;
    }
    if (key.length === 1 && key >= " ") store.setPaletteQuery(snap.paletteQuery + key);
    return;
  }

  if (snap.mode === "settings") {
    if (key === "\x1b") store.closeOverlay();
    else if (key === "t") store.toggleRaw();
    else if (key === "c") store.cycleChunks();
    return;
  }

  if (key === "\x1b") {
    store.closeOverlay();
    return;
  }
  if (key === ",") {
    store.setMode("settings");
    return;
  }
  if (key === "\r") {
    if (snap.composer.trim()) store.submitComposer();
    else store.startSelected();
    return;
  }
  if (key === "\x7f" || key === "\x08") {
    store.setComposer(snap.composer.slice(0, -1));
    return;
  }
  if (key === "\x1b[A" || key === "k") {
    if (snap.composer) {
      if (key === "k") store.setComposer(snap.composer + "k");
      else store.selectDelta(-1);
      return;
    }
    store.selectDelta(-1);
    return;
  }
  if (key === "\x1b[B" || key === "j") {
    if (snap.composer) {
      if (key === "j") store.setComposer(snap.composer + "j");
      else store.selectDelta(1);
      return;
    }
    store.selectDelta(1);
    return;
  }
  if (key === "c" && !snap.composer) {
    store.commands().find((cmd) => cmd.id === "copy")?.run();
    return;
  }
  if (key === "o" && !snap.composer) {
    store.commands().find((cmd) => cmd.id === "open")?.run();
    return;
  }
  if (key === "r" && !snap.composer) {
    store.retryActive();
    return;
  }
  if (key.length === 1 && key >= " ") store.setComposer(snap.composer + key);
}

function consumeKeys(buf: string): string {
  let rest = buf;
  while (rest.length) {
    if (rest.startsWith("\x1b[200~")) {
      const end = rest.indexOf("\x1b[201~");
      if (end < 0) break;
      store.paste(rest.slice(6, end));
      rest = rest.slice(end + 6);
      continue;
    }
    if (rest.startsWith("\x1b[")) {
      const seq = rest.match(/^\x1b\[[0-9;]*[A-Za-z~]/);
      if (!seq) {
        if (rest.length > 8) {
          rest = rest.slice(1);
          continue;
        }
        break;
      }
      handleByte(seq[0]);
      rest = rest.slice(seq[0].length);
      continue;
    }
    if (rest === "\x1b") {
      handleByte("\x1b");
      rest = "";
      continue;
    }
    handleByte(rest[0]);
    rest = rest.slice(1);
  }
  return rest;
}

export async function startAnsiTui(boot: TuiBoot): Promise<void> {
  store.bindClipboard(copyText);
  store.boot(boot);

  process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[?2004h");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  let pending = "";
  process.stdin.on("data", (chunk: string | Buffer) => {
    pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    pending = consumeKeys(pending);
  });

  const onResize = () => draw();
  process.stdout.on("resize", onResize);

  const stop = () => {
    process.stdout.off("resize", onResize);
    restore();
  };
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });

  store.subscribe(draw);
  draw();
  setInterval(() => store.tick(), 120);

  await new Promise<void>(() => {});
}
