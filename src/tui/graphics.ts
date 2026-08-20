import { writeSync } from "fs";

export type GraphicsSupport = "supported" | "unsupported" | "unknown";

const PROBE_ID = 4207;
const PROBE_TIMEOUT_MS = 400;

export function looksLikeKittyHost(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const term = env.TERM ?? "";
  const program = env.TERM_PROGRAM ?? "";
  return Boolean(
    env.KITTY_WINDOW_ID ||
      env.GHOSTTY_RESOURCES_DIR ||
      env.GHOSTTY_BIN ||
      env.WEZTERM_EXECUTABLE ||
      env.CURSOR_TRACE_ID ||
      program === "ghostty" ||
      program === "WezTerm" ||
      program === "vscode" ||
      program === "cursor" ||
      term.includes("kitty") ||
      term.includes("ghostty") ||
      term.includes("wezterm")
  );
}

export function graphicsReply(buffer: string): boolean | null {
  const needle = `Gi=${PROBE_ID};`;
  const at = buffer.indexOf(needle);
  if (at < 0) return null;
  const rest = buffer.slice(at + needle.length);
  if (rest.length < 2) return null;
  return rest.startsWith("OK");
}

/** Ask the terminal if it can draw kitty images. */
export function probeGraphics(): Promise<GraphicsSupport> {
  const stdin = process.stdin;
  if (!stdin.isTTY || !process.stdout.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.resolve("unknown");
  }
  if (process.env.TERMINAL_BROWSER_SKIP_GRAPHICS_CHECK === "1") {
    return Promise.resolve("unknown");
  }

  const wasRaw = stdin.isRaw;
  const query = `\x1b_Gi=${PROBE_ID},a=q,t=d,f=24,s=1,v=1;AAAA\x1b\\\x1b[c`;

  return new Promise((resolve) => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const finish = (graphics: GraphicsSupport) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      stdin.off("data", onData);
      try {
        if (!wasRaw) stdin.setRawMode(false);
      } catch {
        // ignore
      }
      if (!stdin.isPaused()) stdin.pause();
      resolve(graphics);
    };

    const onData = (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("binary");
      const reply = graphicsReply(buffer);
      if (reply !== null) {
        finish(reply ? "supported" : "unsupported");
        return;
      }
      if (buffer.length > 2048) finish("unknown");
    };

    try {
      stdin.setRawMode(true);
    } catch {
      finish("unknown");
      return;
    }
    stdin.resume();
    stdin.on("data", onData);
    timer = setTimeout(() => finish("unknown"), PROBE_TIMEOUT_MS);
    try {
      writeSync(1, query);
    } catch {
      finish("unknown");
    }
  });
}
