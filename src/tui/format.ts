import { basename } from "path";

export function formatDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00.0";
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

export function shortName(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const tail = url.pathname.split("/").filter(Boolean).slice(-2).join("/");
      return tail ? `${url.hostname}/${tail}` : url.hostname;
    } catch {
      return trimmed;
    }
  }
  return basename(trimmed) || trimmed;
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}
