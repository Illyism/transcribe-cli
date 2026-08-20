import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface TranscribeConfig {
  apiKey?: string;
  raw?: boolean;
  chunkMinutes?: number;
}

export function transcribeHome(): string {
  return process.env.TRANSCRIBE_HOME || join(homedir(), ".transcribe");
}

export function configPath(): string {
  return join(transcribeHome(), "config.json");
}

export function historyPath(): string {
  return join(transcribeHome(), "history.json");
}

export function loadConfig(): TranscribeConfig {
  try {
    if (!existsSync(configPath())) return {};
    const parsed = JSON.parse(readFileSync(configPath(), "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as TranscribeConfig;
  } catch {
    return {};
  }
}

export function saveConfig(patch: TranscribeConfig): TranscribeConfig {
  const next = { ...loadConfig(), ...patch };
  mkdirSync(transcribeHome(), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function resolveApiKey(): string | null {
  const env = process.env.OPENAI_API_KEY;
  if (env && env.trim()) return env.trim();
  const fromFile = loadConfig().apiKey;
  if (fromFile && fromFile.trim()) return fromFile.trim();
  return null;
}

export const API_KEY_HELP = `OPENAI_API_KEY not found.

🔑 Get your API key: https://platform.openai.com/api-keys

Then set it using ONE of these methods:

1️⃣  Environment variable (recommended for one-time use):
   export OPENAI_API_KEY=sk-...

2️⃣  Config file (recommended for permanent setup):
   mkdir -p ~/.transcribe
   echo '{"apiKey": "sk-..."}' > ~/.transcribe/config.json

3️⃣  Studio TUI: run \`transcribe\` and paste the key on the setup screen.

📚 Full setup guide: https://github.com/Illyism/transcribe-cli#configuration`;

export function requireApiKey(): string {
  const key = resolveApiKey();
  if (key) return key;
  throw new Error(API_KEY_HELP);
}
