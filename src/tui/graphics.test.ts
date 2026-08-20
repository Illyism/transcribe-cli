import { describe, expect, test } from "bun:test";
import { graphicsReply, looksLikeKittyHost } from "./graphics";

describe("graphicsReply", () => {
  test("reads a kitty OK for our probe id", () => {
    expect(graphicsReply("junk\x1b_Gi=4207;OK\x1b\\")).toBe(true);
  });

  test("reads a kitty error as unsupported", () => {
    expect(graphicsReply("Gi=4207;ENOTSUP")).toBe(false);
  });

  test("waits until the reply is complete", () => {
    expect(graphicsReply("Gi=4207;")).toBeNull();
    expect(graphicsReply("nope")).toBeNull();
  });
});

describe("looksLikeKittyHost", () => {
  test("treats vscode/cursor as a studio host", () => {
    expect(looksLikeKittyHost({ TERM: "xterm-256color", TERM_PROGRAM: "vscode" })).toBe(
      true
    );
    expect(looksLikeKittyHost({ TERM: "dumb" })).toBe(false);
    expect(looksLikeKittyHost({ TERM: "xterm-ghostty" })).toBe(true);
  });
});
