import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMemory, appendMemory } from "../src/memory";
import { rememberTool } from "../src/tools/commsTools";

let configDir: string;
const cwd = "/some/project";

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "poke-code-cfg-"));
  process.env.POKE_CODE_CONFIG_DIR = configDir;
});
afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  delete process.env.POKE_CODE_CONFIG_DIR;
});

test("loadMemory returns null when there is nothing remembered", () => {
  expect(loadMemory(cwd)).toBeNull();
});

test("appendMemory then loadMemory round-trips", () => {
  appendMemory(cwd, "the tests are run with bun test");
  const mem = loadMemory(cwd);
  expect(mem).toContain("the tests are run with bun test");
});

test("memory is keyed per working directory", () => {
  appendMemory(cwd, "note for project A");
  expect(loadMemory("/different/project")).toBeNull();
});

test("the remember tool writes to memory", async () => {
  const res = await rememberTool.run({ note: "deploys happen via CI" }, { cwd });
  expect(res.isError).toBeFalsy();
  expect(loadMemory(cwd)).toContain("deploys happen via CI");
});

test("the remember tool rejects empty notes", async () => {
  const res = await rememberTool.run({ note: "   " }, { cwd });
  expect(res.isError).toBe(true);
});
