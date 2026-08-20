import type { EngineInfo, Rgba } from "pixel-react";

export interface Theme {
  bg: Rgba;
  bgAlt: Rgba;
  fg: Rgba;
  muted: Rgba;
  accent: Rgba;
  accentDim: Rgba;
  green: Rgba;
  red: Rgba;
  yellow: Rgba;
  magenta: Rgba;
  cyan: Rgba;
  chipBg: Rgba;
  hairline: Rgba;
  selection: Rgba;
  sidebarBg: Rgba;
  itemHover: Rgba;
  itemActive: Rgba;
  overlay: Rgba;
  dangerBg: Rgba;
  okBg: Rgba;
  waveOn: Rgba;
  waveOff: Rgba;
}

export function mix(base: Rgba, toward: Rgba, t: number): Rgba {
  const channel = (b: number, w: number) => Math.round(b + (w - b) * t);
  return [
    channel(base[0], toward[0]),
    channel(base[1], toward[1]),
    channel(base[2], toward[2]),
    255,
  ];
}

export function withAlpha(color: Rgba, alpha: number): Rgba {
  return [color[0], color[1], color[2], alpha];
}

export function makeTheme(colors: EngineInfo["colors"]): Theme {
  const bg = colors.background ?? [14, 15, 18, 255];
  const fg = colors.foreground ?? [232, 234, 240, 255];
  const accent = colors.palette[13] ?? colors.palette[12] ?? [168, 130, 255, 255];
  const cyan = colors.palette[14] ?? colors.palette[6] ?? [94, 201, 227, 255];
  const red = colors.palette[9] ?? colors.palette[1] ?? [229, 72, 77, 255];
  const green = colors.palette[10] ?? colors.palette[2] ?? [48, 164, 108, 255];
  return {
    bg,
    bgAlt: mix(bg, fg, 0.05),
    fg,
    muted: mix(fg, bg, 0.42),
    accent,
    accentDim: mix(bg, accent, 0.35),
    green,
    red,
    yellow: colors.palette[11] ?? colors.palette[3] ?? [245, 165, 36, 255],
    magenta: accent,
    cyan,
    chipBg: mix(bg, fg, 0.09),
    hairline: mix(bg, fg, 0.14),
    selection: mix(bg, accent, 0.35),
    sidebarBg: mix(bg, fg, 0.04),
    itemHover: mix(bg, fg, 0.1),
    itemActive: mix(bg, accent, 0.28),
    overlay: [bg[0], bg[1], bg[2], 210],
    dangerBg: mix(bg, red, 0.22),
    okBg: mix(bg, green, 0.18),
    waveOn: accent,
    waveOff: mix(bg, fg, 0.22),
  };
}
