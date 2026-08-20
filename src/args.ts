import { parseTimeToSeconds } from "./input";

export interface ParsedCli {
  input: string | null;
  extraInputs: string[];
  useRaw: boolean;
  outputArg: string | null;
  offsetSeconds?: number;
  chunkMinutes?: number;
  cookiesFromBrowser?: string;
  help: boolean;
  version: boolean;
  installMacAction: boolean;
  plain: boolean;
  forceTui: boolean;
  unknownOption: string | null;
}

function takeValue(
  args: string[],
  i: number,
  flag: string
): { value: string; next: number } {
  const value = args[i + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return { value, next: i + 1 };
}

export function parseArgs(argv: string[]): ParsedCli {
  const parsed: ParsedCli = {
    input: null,
    extraInputs: [],
    useRaw: false,
    outputArg: null,
    help: false,
    version: false,
    installMacAction: false,
    plain: false,
    forceTui: false,
    unknownOption: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      parsed.version = true;
      continue;
    }
    if (arg === "--install-mac-action") {
      parsed.installMacAction = true;
      continue;
    }
    if (arg === "--raw") {
      parsed.useRaw = true;
      continue;
    }
    if (arg === "--plain") {
      parsed.plain = true;
      continue;
    }
    if (arg === "--tui") {
      parsed.forceTui = true;
      continue;
    }
    if (arg === "--output" || arg === "-o") {
      const taken = takeValue(argv, i, "--output");
      parsed.outputArg = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--offset") {
      const taken = takeValue(argv, i, "--offset");
      parsed.offsetSeconds = parseTimeToSeconds(taken.value);
      i = taken.next;
      continue;
    }
    if (arg === "--chunk-minutes") {
      const taken = takeValue(argv, i, "--chunk-minutes");
      const n = parseFloat(taken.value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error("--chunk-minutes must be a positive number");
      }
      parsed.chunkMinutes = n;
      i = taken.next;
      continue;
    }
    if (arg === "--cookies-from-browser") {
      const taken = takeValue(argv, i, "--cookies-from-browser");
      parsed.cookiesFromBrowser = taken.value;
      i = taken.next;
      continue;
    }
    if (arg.startsWith("-")) {
      parsed.unknownOption = arg;
      return parsed;
    }
    if (!parsed.input) {
      parsed.input = arg;
    } else {
      parsed.extraInputs.push(arg);
    }
  }

  return parsed;
}

export const HELP_TEXT = `
Transcribe - Audio/Video to SRT

Usage: transcribe [path-or-url...] [options]

  transcribe                 Launch the studio TUI (default)
  transcribe <file>          Queue a file in the studio
  transcribe <url>           Download + transcribe YouTube / Instagram / X / yt-dlp URLs
  transcribe <folder>        Queue every media file in a folder

Options:
  -h, --help                 Show this help message
  -v, --version              Show version
  --tui                      Studio TUI (default on a TTY)
  --plain                    Classic CLI instead of the studio
  --raw                      Disable optimizations (use original audio)
  -o, --output               Output .srt path (file) OR output directory (folder)
  --offset                   Shift subtitle timestamps (seconds or HH:MM:SS.mmm)
  --chunk-minutes            Force chunking into N-minute pieces (helps long movies)
  --cookies-from-browser     Browser for yt-dlp cookies (chrome, safari, firefox, ...)
                             Auto-detected for Instagram when omitted
  --install-mac-action       Install macOS Finder right-click Quick Action

Examples:
  transcribe
  transcribe video.mp4
  transcribe audio.mp3 ./b-roll.mov
  transcribe https://www.youtube.com/watch?v=VIDEO_ID
  transcribe https://www.instagram.com/reel/SHORTCODE/
  transcribe recording.screenstudio
  transcribe movie.mkv --offset 01:00:00.000 --plain

Folders:
  • Pass a folder to bulk-transcribe media inside it
  • Studio: every file lands in the queue, enter starts
  • Classic (--plain): select all, or choose files individually
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
  Set OPENAI_API_KEY or create ~/.transcribe/config.json
  The studio can also save a key on first launch
`;
