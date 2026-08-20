import { describe, expect, test } from "bun:test";
import { nativePixelPath, shouldLaunchTui, terminalCanPaint } from "./can-launch";

describe("shouldLaunchTui", () => {
  test("plain/help/version/mac-action never launch the studio", () => {
    const base = {
      forceTui: false,
      plain: false,
      help: false,
      version: false,
      installMacAction: false,
    };
    expect(shouldLaunchTui({ ...base, plain: true })).toBe(false);
    expect(shouldLaunchTui({ ...base, help: true })).toBe(false);
    expect(shouldLaunchTui({ ...base, version: true })).toBe(false);
    expect(shouldLaunchTui({ ...base, installMacAction: true })).toBe(false);
  });

  test("native pixel.node is on disk after tui:engine", () => {
    expect(nativePixelPath()).toBeTruthy();
  });

  test("this harness is not an interactive TTY so the studio stays off", () => {
    const base = {
      forceTui: false,
      plain: false,
      help: false,
      version: false,
      installMacAction: false,
    };
    expect(shouldLaunchTui(base)).toBe(false);
  });
});

describe("terminalCanPaint", () => {
  test("this harness is not an interactive TTY", () => {
    expect(terminalCanPaint()).toBe(false);
  });
});
