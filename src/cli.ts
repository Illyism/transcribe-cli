#!/usr/bin/env node

/**
 * Transcribe audio/video files to SRT format
 *
 * Usage: transcribe <path-to-file>
 *
 * Supports: .mp4, .mp3, .wav, .m4a, .webm, .ogg
 * Requires: OPENAI_API_KEY environment variable
 */

import {
  cancel,
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  select,
} from "@clack/prompts";
import { existsSync, statSync } from "fs";
import { basename } from "path";
import { HELP_TEXT, parseArgs } from "./args";
import { requireApiKey } from "./config";
import { listMediaFilesInDir, resolveInputKind } from "./input";
import { installMacQuickAction } from "./mac";
import {
  formatFileSize,
  outputPathForFile,
  transcribeInput,
  type RunOptions,
} from "./run";
import { nativePixelPath, shouldLaunchTui } from "./tui/can-launch";

function printResult(result: {
  srtPath: string;
  text: string;
  language: string;
  duration: number;
}) {
  console.log(`\n✅ SRT file saved to: ${result.srtPath}`);
  console.log(`\nTranscription preview:`);
  console.log("─".repeat(60));
  console.log(
    result.text.substring(0, 500) + (result.text.length > 500 ? "..." : "")
  );
  console.log("─".repeat(60));
  console.log(`\nLanguage: ${result.language}`);
  console.log(`Duration: ${result.duration.toFixed(2)}s`);
}

async function promptFolderSelection(files: string[]): Promise<string[]> {
  intro(
    `Found ${files.length} media file${files.length === 1 ? "" : "s"} in folder`
  );

  const mode = await select({
    message: "How do you want to select files?",
    options: [
      {
        value: "all",
        label: `Select all (${files.length})`,
        hint: "transcribe every file",
      },
      {
        value: "choose",
        label: "Choose individually",
        hint: "space to toggle, enter to confirm",
      },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (isCancel(mode) || mode === "cancel") {
    cancel("Cancelled.");
    process.exit(0);
  }

  if (mode === "all") {
    return files;
  }

  const options = files.map((filePath) => {
    const name = basename(filePath);
    let hint: string | undefined;
    try {
      const size = formatFileSize(statSync(filePath).size);
      const srtPath = filePath.replace(/\.[^.]+$/, "") + ".srt";
      hint = existsSync(srtPath) ? `${size} · has .srt` : size;
    } catch {
      hint = undefined;
    }
    return { value: filePath, label: name, hint };
  });

  const selected = await multiselect({
    message: "Select files to transcribe",
    options,
    initialValues: files,
    required: true,
  });

  if (isCancel(selected)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return selected as string[];
}

async function runPlain(inputs: string[], options: RunOptions) {
  const apiKey = requireApiKey();
  const run = { ...options, apiKey };

  if (inputs.length === 1 && resolveInputKind(inputs[0]) === "folder") {
    const mediaFiles = listMediaFilesInDir(inputs[0]);
    if (mediaFiles.length === 0) {
      console.error(`Error: No supported media files found in: ${inputs[0]}`);
      process.exit(1);
    }

    const selected = await promptFolderSelection(mediaFiles);
    if (selected.length === 0) {
      cancel("No files selected.");
      process.exit(0);
    }

    log.info(
      `Transcribing ${selected.length} file${selected.length === 1 ? "" : "s"}...`
    );

    let succeeded = 0;
    let failed = 0;
    const failures: Array<{ file: string; error: string }> = [];

    for (let i = 0; i < selected.length; i++) {
      const filePath = selected[i];
      const name = basename(filePath);
      console.log(`\n📦 [${i + 1}/${selected.length}] ${name}`);

      try {
        const result = await transcribeInput(
          filePath,
          run,
          outputPathForFile(filePath, options.outputArg)
        );
        console.log(
          `✅ Saved: ${result.srtPath} (${result.language}, ${result.duration.toFixed(2)}s)`
        );
        succeeded++;
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ file: name, error: message });
        console.error(`❌ Failed: ${name}\n   ${message}`);
      }
    }

    outro(`Done: ${succeeded} succeeded, ${failed} failed`);
    if (failures.length > 0) {
      console.log("\nFailures:");
      for (const failure of failures) {
        console.log(`  • ${failure.file}: ${failure.error}`);
      }
      process.exit(1);
    }
    return;
  }

  if (inputs.length > 1) {
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      console.log(`\n📦 [${i + 1}/${inputs.length}] ${basename(input)}`);
      try {
        const output =
          options.outputArg && !options.outputArg.toLowerCase().endsWith(".srt")
            ? outputPathForFile(input, options.outputArg)
            : undefined;
        const result = await transcribeInput(input, run, output);
        console.log(
          `✅ Saved: ${result.srtPath} (${result.language}, ${result.duration.toFixed(2)}s)`
        );
        succeeded++;
      } catch (error) {
        failed++;
        console.error(
          `❌ Failed: ${input}\n   ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    outro(`Done: ${succeeded} succeeded, ${failed} failed`);
    if (failed) process.exit(1);
    return;
  }

  const result = await transcribeInput(inputs[0], run);
  printResult(result);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
    return;
  }

  if (parsed.unknownOption) {
    console.error(
      `Error: Unknown option: ${parsed.unknownOption}\nRun: transcribe --help`
    );
    process.exit(1);
  }

  if (parsed.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (parsed.installMacAction) {
    installMacQuickAction();
    process.exit(0);
  }

  if (parsed.version) {
    const pkg = await import("../package.json");
    console.log(pkg.version);
    process.exit(0);
  }

  const options: RunOptions = {
    useRaw: parsed.useRaw,
    outputArg: parsed.outputArg,
    offsetSeconds: parsed.offsetSeconds,
    chunkMinutes: parsed.chunkMinutes,
    cookiesFromBrowser: parsed.cookiesFromBrowser,
  };

  const inputs = [parsed.input, ...parsed.extraInputs].filter(
    (value): value is string => Boolean(value)
  );

  if (shouldLaunchTui(parsed)) {
    const hadFolder = inputs.some((input) => resolveInputKind(input) === "folder");
    const boot = {
      inputs,
      run: options,
      autoStart: inputs.length > 0 && !hadFolder,
    };

    if (nativePixelPath()) {
      try {
        const { startTui } = await import("./tui/main");
        await startTui(boot);
        return;
      } catch {
        // Pixel engine can fail in a TTY that has no kitty graphics.
        // Fall through to the cell studio so Cursor / VS Code still get a UI.
      }
    }

    try {
      const { startAnsiTui } = await import("./tui/ansi");
      await startAnsiTui(boot);
      return;
    } catch (error) {
      if (parsed.forceTui) {
        console.error(
          "Error: studio TUI failed to start.\n",
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
      if (inputs.length === 0) {
        console.log(HELP_TEXT);
        return;
      }
      console.error("Studio TUI unavailable — using classic CLI.\n");
    }
  }

  if (inputs.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  try {
    await runPlain(inputs, options);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
