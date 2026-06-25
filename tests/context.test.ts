import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectContext } from "../src/context";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-ctx-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("returns null when no context file exists", () => {
  expect(loadProjectContext(dir)).toBeNull();
});

test("loads AGENTS.md when present", () => {
  writeFileSync(join(dir, "AGENTS.md"), "Use tabs. Run `bun test`.\n");
  const ctx = loadProjectContext(dir);
  expect(ctx?.filename).toBe("AGENTS.md");
  expect(ctx?.content).toContain("Use tabs");
});

test("POKE.md takes priority over AGENTS.md and CLAUDE.md", () => {
  writeFileSync(join(dir, "CLAUDE.md"), "claude rules");
  writeFileSync(join(dir, "AGENTS.md"), "agents rules");
  writeFileSync(join(dir, "POKE.md"), "poke rules");
  expect(loadProjectContext(dir)?.filename).toBe("POKE.md");
});

test("empty context files are skipped", () => {
  writeFileSync(join(dir, "POKE.md"), "   \n  ");
  writeFileSync(join(dir, "AGENTS.md"), "real content");
  expect(loadProjectContext(dir)?.filename).toBe("AGENTS.md");
});
