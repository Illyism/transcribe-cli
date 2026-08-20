import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { configPath, loadConfig, saveConfig, transcribeHome } from "./config";

const originalHome = process.env.TRANSCRIBE_HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.TRANSCRIBE_HOME;
  else process.env.TRANSCRIBE_HOME = originalHome;
});

describe("config", () => {
  test("round-trips a config file under TRANSCRIBE_HOME", () => {
    const dir = mkdtempSync(join(tmpdir(), "transcribe-config-"));
    process.env.TRANSCRIBE_HOME = dir;
    try {
      expect(transcribeHome()).toBe(dir);
      expect(loadConfig()).toEqual({});
      saveConfig({ apiKey: "sk-test", raw: true, chunkMinutes: 15 });
      expect(loadConfig()).toEqual({
        apiKey: "sk-test",
        raw: true,
        chunkMinutes: 15,
      });
      expect(configPath()).toBe(join(dir, "config.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
