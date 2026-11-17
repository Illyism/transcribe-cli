#!/usr/bin/env bun
/**
 * Husky pre-commit step: run the typecheck only when a staged change can alter its result
 * (TypeScript sources, package.json, a tsconfig, the lockfile). Deleted files count: an import may now be dangling.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPED_SOURCE = /\.(?:ts|tsx|mts|cts)$/u;
const TOOLCHAIN = /^(?:package\.json|bun\.lockb?|tsconfig[^/]*\.json)$/u;

const diff = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (diff.status !== 0) {
  console.error("Failed to read staged files");
  process.exit(diff.status ?? 1);
}

const staged = diff.stdout.split("\n").filter(Boolean);
if (!staged.some((file) => TYPED_SOURCE.test(file) || TOOLCHAIN.test(path.basename(file)))) {
  process.exit(0);
}

console.log("Running TypeScript check...");
const { status } = spawnSync("bun", ["run", "typecheck"], { cwd: ROOT, stdio: "inherit" });
if (status !== 0) {
  process.exit(status ?? 1);
}
console.log("✅ Typecheck passed");
