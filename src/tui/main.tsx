import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRoot, type EngineKeyEvent, type PixelRoot } from "pixel-react";
import { App } from "./App";
import { store, type TuiBoot } from "./store";

const FONT_UI = 0;
const FONT_MONO = 1;

function moduleDir(): string {
  const meta = import.meta as ImportMeta & { dir?: string; dirname?: string };
  if (typeof meta.dirname === "string") return meta.dirname;
  if (typeof meta.dir === "string") return meta.dir;
  if (typeof meta.url === "string") return dirname(fileURLToPath(meta.url));
  return process.cwd();
}

function fontFile(name: string): string | null {
  const candidates = [
    join(moduleDir(), "../../ref/terminal-browser/engine/assets/fonts", name),
    join(process.cwd(), "ref/terminal-browser/engine/assets/fonts", name),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function handleKey(event: EngineKeyEvent, root: PixelRoot) {
  if (event.kind === "release") return;

  const snap = store.snapshot();
  const superOrCtrl = event.mods.super || event.mods.ctrl;

  if (event.mods.ctrl && event.key === "q") {
    root.stop();
    process.exit(0);
  }

  if (superOrCtrl && (event.key === "k" || event.key === "p")) {
    store.setMode(snap.mode === "palette" ? "studio" : "palette");
    return;
  }

  if (snap.mode === "setup") return;

  if (snap.mode === "palette") {
    if (event.key === "escape") store.closeOverlay();
    if (event.key === "arrowdown") store.paletteMove(1);
    if (event.key === "arrowup") store.paletteMove(-1);
    return;
  }

  if (snap.mode === "settings") {
    if (event.key === "escape") store.closeOverlay();
    return;
  }

  if (event.key === "escape") {
    store.closeOverlay();
    return;
  }

  if (event.key === "," && !snap.composer) {
    store.setMode("settings");
    return;
  }

  const empty = snap.composer.trim() === "";
  if (!empty) return;

  if (event.key === "j" || event.key === "arrowdown") store.selectDelta(1);
  if (event.key === "k" || event.key === "arrowup") store.selectDelta(-1);
  if (event.key === "enter") store.startSelected();
  if (event.key === "r") store.retryActive();
  if (event.key === " ") store.toggleSelected();
  if (event.key === "backspace" || event.key === "delete") store.removeActive();
  if (event.key === "c" && event.mods.shift) {
    store.commands().find((cmd) => cmd.id === "copy-srt")?.run();
  } else if (event.key === "c") {
    store.commands().find((cmd) => cmd.id === "copy")?.run();
  }
  if (event.key === "o" && event.mods.shift) {
    store.commands().find((cmd) => cmd.id === "reveal")?.run();
  } else if (event.key === "o") {
    store.commands().find((cmd) => cmd.id === "open")?.run();
  }
}

export async function startTui(boot: TuiBoot): Promise<void> {
  let root: PixelRoot | undefined;
  const exit = new Promise<void>((resolve, reject) => {
    root = createRoot({
      devtools: process.env.TRANSCRIBE_DEVTOOLS === "1",
      keyEventTypes: true,
      onKey: (event) => handleKey(event, root!),
      onPaste: (text) => store.paste(text),
      onResize: () => render(),
      onColors: () => render(),
      onEngineExit: (error) => {
        if (error) reject(new Error(error));
        else resolve();
      },
    });
  });

  let fonts = { ui: FONT_UI, mono: FONT_MONO };

  function render() {
    root!.render(<App info={{ ...root!.info }} fonts={fonts} />);
  }

  try {
    store.bindClipboard((text) => root!.setClipboard(text));
    store.boot(boot);
    store.subscribe(render);
    render();
    setInterval(() => store.tick(), 90);

    const monoFile = fontFile("JetBrainsMono-Regular.ttf");
    if (monoFile) {
      void root!
        .registerFont(monoFile)
        .then((mono) => {
          fonts = { ui: FONT_UI, mono };
          render();
        })
        .catch(() => {});
    }

    await exit;
  } catch (error) {
    try {
      root?.stop();
    } catch {
      // engine already gone
    }
    throw error;
  }
}
