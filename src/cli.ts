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
import { existsSync, statSync, unlinkSync } from "fs";
import { homedir } from "os";
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
import { transcribe } from "./transcribe";

interface ResolvedConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

function getConfig(cliModel?: string, cliBaseUrl?: string): ResolvedConfig {
  let fileConfig: {
    apiKey?: string;
    openaiApiKey?: string;
    openrouterApiKey?: string;
    baseURL?: string;
    model?: string;
  } = {};

  try {
    const configPath = join(homedir(), ".transcribe", "config.json");
    if (existsSync(configPath)) {
      fileConfig = require(configPath);
    }
  } catch (error) {
    // Config file doesn't exist or is invalid
  }

  // If both keys exist:
  // Primary transcription defaults to OpenAI Whisper-1 (via OPENAI_API_KEY)
  // Autofix / Refinement will automatically use OpenRouter Gemini-3.7-flash (via OPENROUTER_API_KEY)
  const openaiKey = process.env.OPENAI_API_KEY || fileConfig.openaiApiKey || (fileConfig.apiKey && !fileConfig.apiKey.startsWith('sk-or-') ? fileConfig.apiKey : undefined);
  const openrouterKey = process.env.OPENROUTER_API_KEY || fileConfig.openrouterApiKey || (fileConfig.apiKey && fileConfig.apiKey.startsWith('sk-or-') ? fileConfig.apiKey : undefined);

  const apiKey = openaiKey || openrouterKey || fileConfig.apiKey;

  const baseURL =
    cliBaseUrl ||
    process.env.TRANSCRIBE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    fileConfig.baseURL ||
    undefined;

  const model =
    cliModel ||
    process.env.TRANSCRIBE_MODEL ||
    fileConfig.model ||
    (openaiKey ? "whisper-1" : "google/gemini-3.7-flash");

  if (!apiKey) {
    throw new Error(
      "API key not found.\n\n" +
        "🔑 Get your API key:\n" +
        "   • OpenAI: https://platform.openai.com/api-keys\n" +
        "   • OpenRouter: https://openrouter.ai/keys\n\n" +
        "Then set it using ONE of these methods:\n\n" +
        "1️⃣  Environment variable:\n" +
        "   export OPENAI_API_KEY=sk-...\n" +
        "   # Or for OpenRouter:\n" +
        "   export OPENROUTER_API_KEY=sk-or-...\n" +
        "   export OPENAI_BASE_URL=https://openrouter.ai/api/v1\n\n" +
        "2️⃣  Config file (recommended for permanent setup):\n" +
        "   mkdir -p ~/.transcribe\n" +
        '   echo \'{"apiKey": "sk-..."}\' > ~/.transcribe/config.json\n\n' +
        "💡 Tip: If you set both OPENAI_API_KEY and OPENROUTER_API_KEY, transcribe automatically mixes them (Whisper-1 for frame-accurate timing + Gemini 3.7 Flash for deep context autofix & diarization)!\n\n" +
        "📚 Full setup guide: https://github.com/Illyism/transcribe-cli#configuration"
    );
  }

  return { apiKey, baseURL, model };
}

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
  useRaw: boolean;
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
  apiKey: string,
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
  let isScreenStudio = false;
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
      isScreenStudio = true;
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
      apiKey,
      baseURL: options.baseURL,
      model: options.model,
      autofix: options.autofix,
      diarize: options.diarize,
      optimize: isScreenStudio ? false : !options.useRaw,
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

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Transcribe - Audio/Video to SRT

Usage: transcribe <path-to-file-url-or-folder> [options]

Options:
  -h, --help              Show this help message
  -v, --version           Show version
  -m, --model <model>     Model name (default: whisper-1, or TRANSCRIBE_MODEL)
  --base-url <url>        Base URL for OpenAI-compatible API (e.g. OpenRouter, LiteLLM)
  --autofix [model]       2-Pass LLM cleanup & diarization (auto: gpt-5.6-luna on OpenAI, gemini on OpenRouter)
  --no-diarize            Disable automatic speaker diarization during autofix
  --raw                   Disable optimizations (use original audio)
  -o, --output <path>     Output .srt path (file) OR output directory (folder)
  --offset <time>         Shift subtitle timestamps (seconds or HH:MM:SS.mmm)
  --chunk-minutes <min>   Force chunking into N-minute pieces (helps long movies)
  --cookies-from-browser <bws> Browser for yt-dlp cookies (chrome, safari, firefox, ...)
                          Auto-detected for Instagram when omitted
  --install-mac-action    Install macOS Finder right-click Quick Action

Examples:
  transcribe video.mp4
  transcribe audio.mp3 --autofix
  transcribe audio.mp3 --autofix google/gemini-3.7-flash
  transcribe podcast.mp3 --autofix --no-diarize
  transcribe /path/to/podcast.wav
  transcribe ./day-9
  transcribe https://www.youtube.com/watch?v=VIDEO_ID
  transcribe https://www.instagram.com/reel/SHORTCODE/
  transcribe https://x.com/MTSlive/status/2059310566783467782
  transcribe recording.screenstudio
  transcribe large-video.mp4 --raw
  transcribe movie.mkv --offset 01:00:00.000
  transcribe movie.mkv --output ./subs
  transcribe long_movie.mkv --chunk-minutes 15
  transcribe audio.mp3 --model whisper-large-v3 --base-url https://api.groq.com/openai/v1
  transcribe audio.mp3 --model google/gemini-2.5-flash --base-url https://openrouter.ai/api/v1
  transcribe https://www.instagram.com/reel/SHORTCODE/ --cookies-from-browser chrome

Folders:
  • Pass a folder to bulk-transcribe media inside it
  • Interactive prompt: select all, or choose files individually
  • Each .srt is written next to its source file (or into -o)

Optimizations (enabled by default for files >= 5 minutes, except Screen Studio):
  • 1.2x speed: Faster processing for files 5 minutes or longer
  • Files under 5 minutes use original (raw) audio automatically
  • Automatic timestamp adjustment to original speed
  • Use --raw to force original audio on all files
  • Screen Studio recordings always use original audio

Chunking (always enabled):
  • Media is split into ~20 minute chunks by default for reliability
  • Use --chunk-minutes to override chunk size

Supported formats: mp4, mp3, wav, m4a, webm, ogg, opus, mov, avi, mkv, screenstudio
Remote URLs: YouTube, Instagram Reels/posts, X/Twitter, and other yt-dlp sites
  • Instagram usually needs a logged-in browser (cookies auto-detected)

Configuration:
  Set OPENAI_API_KEY / OPENROUTER_API_KEY environment variable or create ~/.transcribe/config.json
  Optionally set OPENAI_BASE_URL / TRANSCRIBE_BASE_URL and TRANSCRIBE_MODEL
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
  let useRaw = false;
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

    if (arg === "--raw") {
      useRaw = true;
      continue;
    }

    if (arg === "--diarize") {
      diarize = true;
      continue;
    }

    if (arg === "--no-diarize" || arg === "--noDiarize") {
      diarize = false;
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

  const { apiKey, baseURL, model } = getConfig(cliModel, cliBaseUrl);

  const options: CliOptions = {
    useRaw,
    outputArg,
    offsetSeconds,
    chunkMinutes,
    cookiesFromBrowser,
    model,
    baseURL,
    autofix,
    diarize,
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
            apiKey,
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

    const result = await transcribeOne(input, apiKey, options);
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
