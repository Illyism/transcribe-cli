#!/usr/bin/env node

// Transcribe audio/video files, folders and URLs to SRT. See --help for usage.

import {
  cancel,
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  select,
} from "@clack/prompts";
import { existsSync, statSync, unlinkSync } from "fs";
import { basename, extname, join, resolve } from "path";
import {
  listMediaFilesInDir,
  parseTimeToSeconds,
  resolveInputKind,
} from "./input";
import {
  downloadRemoteAudio,
  getRemoteMediaSlug,
} from "./remote";
import {
  extractScreenStudioAudio,
  getScreenStudioSlug,
} from "./screenstudio";
import { installMacQuickAction } from "./mac";
import { MissingKeyError, resolveSettings } from "./config";
import { runDoctor, runSetup } from "./setup";
import { transcribe } from "./transcribe";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
      const srtPath = join(
        filePath,
        "..",
        `${basename(filePath, extname(filePath))}.srt`
      );
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

interface CliOptions {
  outputArg: string | null;
  offsetSeconds?: number;
  chunkMinutes?: number;
  cookiesFromBrowser?: string;
  model?: string;
  baseURL?: string;
  autofix?: boolean | string;
  diarize?: boolean;
}

async function transcribeOne(
  input: string,
  options: CliOptions,
  outputOverride?: string
): Promise<{
  srtPath: string;
  text: string;
  language: string;
  duration: number;
}> {
  let inputPath = input;
  let downloadedFile: string | null = null;
  let remoteMediaSlug: string | null = null;
  let screenStudioSlug: string | null = null;
  let outputPath: string | undefined = outputOverride;

  const inputKind = resolveInputKind(input);

  try {
    if (inputKind === "remote") {
      remoteMediaSlug = getRemoteMediaSlug(input);
      downloadedFile = await downloadRemoteAudio(input, {
        cookiesFromBrowser: options.cookiesFromBrowser,
      });
      inputPath = downloadedFile;
      if (!options.outputArg && !outputOverride && remoteMediaSlug) {
        outputPath = join(process.cwd(), `${remoteMediaSlug}.srt`);
      }
    } else if (inputKind === "screenstudio") {
      screenStudioSlug = getScreenStudioSlug(input);
      downloadedFile = await extractScreenStudioAudio(input);
      inputPath = downloadedFile;
      if (!options.outputArg && !outputOverride) {
        outputPath = join(process.cwd(), `${screenStudioSlug}.srt`);
      }
    } else if (inputKind === "missing") {
      throw new Error(`File not found: ${resolve(inputPath)}`);
    }

    if (options.outputArg && !outputOverride) {
      if (options.outputArg.toLowerCase().endsWith(".srt")) {
        outputPath = options.outputArg;
      } else {
        const base =
          remoteMediaSlug ||
          screenStudioSlug ||
          basename(input, extname(input));
        outputPath = join(options.outputArg, `${base}.srt`);
      }
    }

    return await transcribe({
      inputPath,
      baseURL: options.baseURL,
      model: options.model,
      autofix: options.autofix,
      diarize: options.diarize,
      outputPath,
      offsetSeconds: options.offsetSeconds,
      chunkMinutes: options.chunkMinutes,
    });
  } finally {
    if (downloadedFile && existsSync(downloadedFile)) {
      unlinkSync(downloadedFile);
    }
  }
}

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

async function main() {
  const args = process.argv.slice(2);

  // Subcommands, unless a file or folder with that name exists
  const subcommand = args[0];
  if (subcommand && !existsSync(subcommand)) {
    if (subcommand === "setup") {
      process.exit((await runSetup()) ? 0 : 1);
    }
    if (subcommand === "doctor" || subcommand === "config") {
      process.exit((await runDoctor()) ? 0 : 1);
    }
  }

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Transcribe - Audio/Video to SRT

Usage: transcribe <path-to-file-url-or-folder> [options]
       transcribe setup     Save your API key (one paste, provider auto-detected)
       transcribe doctor    Show which keys, tools and models will be used

Options:
  -h, --help              Show this help message
  -v, --version           Show version
  -m, --model <model>     whisper (default with an OpenAI key), gemini, or any model id
                          Models with a slash (google/gemini-3.7-flash) go to OpenRouter
  --autofix [model]       2-Pass LLM cleanup & diarization (Gemini with an OpenRouter key,
                          gpt-5.6-luna otherwise). Cleanup runs by default when both
                          an OpenAI and an OpenRouter key are set
  --no-autofix            Skip the cleanup pass
  --diarize               Add speaker labels (on by default with an explicit --autofix)
  --no-diarize            Disable automatic speaker diarization during autofix
  --base-url <url>        Other OpenAI-compatible endpoint (Groq, LiteLLM, self-hosted)
  -o, --output <path>     Output .srt path (file) OR output directory (folder)
  --offset <time>         Shift subtitle timestamps (seconds or HH:MM:SS.mmm)
  --chunk-minutes <min>   Force chunking into N-minute pieces (helps long movies)
  --cookies-from-browser <bws> Browser for yt-dlp cookies (chrome, safari, firefox, ...)
                          Auto-detected for Instagram when omitted
  --install-mac-action    Install macOS Finder right-click Quick Action

Examples:
  transcribe video.mp4
  transcribe audio.mp3 --autofix
  transcribe audio.mp3 --model gemini
  transcribe audio.mp3 --autofix google/gemini-3.7-flash
  transcribe podcast.mp3 --autofix --no-diarize
  transcribe /path/to/podcast.wav
  transcribe ./day-9
  transcribe https://www.youtube.com/watch?v=VIDEO_ID
  transcribe https://www.instagram.com/reel/SHORTCODE/
  transcribe https://x.com/MTSlive/status/2059310566783467782
  transcribe recording.screenstudio
  transcribe movie.mkv --offset 01:00:00.000
  transcribe movie.mkv --output ./subs
  transcribe long_movie.mkv --chunk-minutes 15
  transcribe audio.mp3 --model whisper-large-v3 --base-url https://api.groq.com/openai/v1
  transcribe https://www.instagram.com/reel/SHORTCODE/ --cookies-from-browser chrome

Folders:
  • Pass a folder to bulk-transcribe media inside it
  • Interactive prompt: select all, or choose files individually
  • Each .srt is written next to its source file (or into -o)

Chunking (always enabled):
  • Media is split into ~20 minute chunks by default for reliability
  • Use --chunk-minutes to override chunk size

Supported formats: mp4, mp3, wav, m4a, webm, ogg, opus, mov, avi, mkv, screenstudio
Remote URLs: YouTube, Instagram Reels/posts, X/Twitter, and other yt-dlp sites
  • Instagram usually needs a logged-in browser (cookies auto-detected)

Configuration:
  Run: transcribe setup   (or export OPENAI_API_KEY / OPENROUTER_API_KEY)
  One key is enough. With both, Whisper handles timing and Gemini cleans up the text.
  Each model is sent to its own provider with the matching key; no base URL needed.
    `);
    process.exit(0);
  }

  if (args.includes("--install-mac-action")) {
    installMacQuickAction();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    const pkg = require("../package.json");
    console.log(pkg.version);
    process.exit(0);
  }

  let input: string | null = null;
  let outputArg: string | null = null;
  let offsetSeconds: number | undefined;
  let chunkMinutes: number | undefined;
  let cookiesFromBrowser: string | undefined;
  let cliModel: string | undefined;
  let cliBaseUrl: string | undefined;
  let autofix: boolean | string | undefined;
  let diarize: boolean | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Accepted for old scripts; audio is always transcribed at original speed
    if (arg === "--raw") continue;

    if (arg === "--diarize") {
      diarize = true;
      continue;
    }

    if (arg === "--no-diarize" || arg === "--noDiarize") {
      diarize = false;
      continue;
    }

    if (arg === "--no-autofix") {
      autofix = false;
      continue;
    }

    if (arg === "--autofix" || arg === "--refine") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        autofix = next;
        i++;
      } else {
        autofix = true;
      }
      continue;
    }

    if (arg.startsWith("--autofix=")) {
      autofix = arg.split("=")[1];
      continue;
    }

    if (arg === "--model" || arg === "-m") {
      const raw = args[i + 1];
      if (!raw || raw.startsWith("-")) {
        console.error("Error: --model requires a model name (e.g. whisper-1, nova-3, google/gemini-2.5-flash)");
        process.exit(1);
      }
      cliModel = raw;
      i++;
      continue;
    }

    if (arg === "--base-url" || arg === "--baseUrl") {
      const raw = args[i + 1];
      if (!raw || raw.startsWith("-")) {
        console.error("Error: --base-url requires a URL");
        process.exit(1);
      }
      cliBaseUrl = raw;
      i++;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      outputArg = args[i + 1] || null;
      i++;
      continue;
    }

    if (arg === "--offset") {
      const raw = args[i + 1];
      if (!raw) {
        console.error(
          "Error: --offset requires a value (seconds or HH:MM:SS.mmm)"
        );
        process.exit(1);
      }
      offsetSeconds = parseTimeToSeconds(raw);
      i++;
      continue;
    }

    if (arg === "--chunk-minutes") {
      const raw = args[i + 1];
      if (!raw) {
        console.error("Error: --chunk-minutes requires a number");
        process.exit(1);
      }
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) {
        console.error("Error: --chunk-minutes must be a positive number");
        process.exit(1);
      }
      chunkMinutes = n;
      i++;
      continue;
    }

    if (arg === "--cookies-from-browser") {
      const raw = args[i + 1];
      if (!raw) {
        console.error(
          "Error: --cookies-from-browser requires a browser name (chrome, safari, firefox, ...)"
        );
        process.exit(1);
      }
      cookiesFromBrowser = raw;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      console.error(`Error: Unknown option: ${arg}\nRun: transcribe --help`);
      process.exit(1);
    }

    if (!input) {
      input = arg;
      continue;
    }
  }

  if (!input) {
    console.error(
      "Error: Missing input file, folder, or URL\nRun: transcribe --help"
    );
    process.exit(1);
  }

  // Fail (or onboard) before downloading or extracting anything
  const settingsInput = { model: cliModel, baseURL: cliBaseUrl, autofix, diarize };
  try {
    resolveSettings(settingsInput);
  } catch (error) {
    const interactive = process.stdin.isTTY && process.stdout.isTTY;
    if (error instanceof MissingKeyError && interactive) {
      if (!(await runSetup())) process.exit(1);
      resolveSettings(settingsInput);
    } else {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  }

  const options: CliOptions = {
    outputArg,
    offsetSeconds,
    chunkMinutes,
    cookiesFromBrowser,
    ...settingsInput,
  };

  try {
    const resolvedInput = resolve(input);

    // Folder bulk mode (a Screen Studio bundle is a directory, but not a folder of media)
    if (resolveInputKind(resolvedInput) === "folder") {
      const mediaFiles = listMediaFilesInDir(resolvedInput);
      if (mediaFiles.length === 0) {
        console.error(
          `Error: No supported media files found in: ${resolvedInput}`
        );
        process.exit(1);
      }

      const selected = await promptFolderSelection(mediaFiles);
      if (selected.length === 0) {
        cancel("No files selected.");
        process.exit(0);
      }

      log.info(
        `Transcribing ${selected.length} file${
          selected.length === 1 ? "" : "s"
        }...`
      );

      let succeeded = 0;
      let failed = 0;
      const failures: Array<{ file: string; error: string }> = [];

      for (let i = 0; i < selected.length; i++) {
        const filePath = selected[i];
        const name = basename(filePath);
        console.log(`\n📦 [${i + 1}/${selected.length}] ${name}`);

        try {
          let outputPath: string | undefined;
          if (outputArg) {
            if (outputArg.toLowerCase().endsWith(".srt")) {
              console.error(
                "Error: For folder input, --output must be a directory (not a .srt file)"
              );
              process.exit(1);
            }
            outputPath = join(
              outputArg,
              `${basename(filePath, extname(filePath))}.srt`
            );
          } else {
            // Default: write .srt next to each source file
            outputPath = join(
              filePath,
              "..",
              `${basename(filePath, extname(filePath))}.srt`
            );
          }

          const result = await transcribeOne(
            filePath,
            options,
            outputPath
          );
          console.log(
            `✅ Saved: ${result.srtPath} (${
              result.language
            }, ${result.duration.toFixed(2)}s)`
          );
          succeeded++;
        } catch (error) {
          failed++;
          const message =
            error instanceof Error ? error.message : String(error);
          failures.push({ file: name, error: message });
          console.error(`❌ Failed: ${name}\n   ${message}`);
        }
      }

      outro(`Done: ${succeeded} succeeded, ${failed} failed`);
      if (failures.length > 0) {
        console.log("\nFailures:");
        for (const f of failures) {
          console.log(`  • ${f.file}: ${f.error}`);
        }
        process.exit(1);
      }
      return;
    }

    const result = await transcribeOne(input, options);
    printResult(result);
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
