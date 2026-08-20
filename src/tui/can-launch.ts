import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

export function nativePixelPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve("pixel-react");
    const candidates = [
      join(dirname(resolved), "../native/pixel.node"),
      join(dirname(resolved), "../../native/pixel.node"),
      join(
        process.cwd(),
        "ref/terminal-browser/engine/packages/pixel-react/native/pixel.node"
      ),
    ];
    return candidates.find((path) => existsSync(path)) ?? null;
  } catch {
    return null;
  }
}

export function terminalCanPaint(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  if (process.env.TRANSCRIBE_PLAIN === "1") return false;
  return true;
}

export function shouldLaunchTui(opts: {
  forceTui: boolean;
  plain: boolean;
  help: boolean;
  version: boolean;
  installMacAction: boolean;
}): boolean {
  if (opts.plain || opts.help || opts.version || opts.installMacAction) return false;
  if (opts.forceTui) return true;
  if (process.env.CI) return false;
  if (process.env.TRANSCRIBE_PLAIN === "1") return false;
  if (!process.stdout.isTTY) return false;
  return true;
}
