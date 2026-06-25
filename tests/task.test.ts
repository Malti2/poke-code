import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTaskMessage } from "../src/task";
import { appendMemory } from "../src/memory";
import { sendAnswerTool } from "../src/tools/commsTools";

let dir: string;
let configDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-task-"));
  configDir = mkdtempSync(join(tmpdir(), "poke-code-cfg-"));
  process.env.POKE_CODE_CONFIG_DIR = configDir;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
  delete process.env.POKE_CODE_CONFIG_DIR;
});

test("buildTaskMessage embeds the task, cwd and tool instructions", () => {
  const msg = buildTaskMessage("fix the failing test", dir);
  expect(msg).toContain("fix the failing test");
  expect(msg).toContain(dir);
  expect(msg).toContain("send_answer");
  expect(msg).toContain("final=true");
  expect(msg).toContain("execute_bash");
});

test("buildTaskMessage includes project context when present", () => {
  writeFileSync(join(dir, "POKE.md"), "Always run `bun run typecheck`.");
  const msg = buildTaskMessage("do a thing", dir);
  expect(msg).toContain("Project context (POKE.md)");
  expect(msg).toContain("Always run `bun run typecheck`.");
});

test("buildTaskMessage includes memory when present", () => {
  appendMemory(dir, "the API base url lives in src/config.ts");
  const msg = buildTaskMessage("do a thing", dir);
  expect(msg).toContain("Memory from earlier sessions");
  expect(msg).toContain("the API base url lives in src/config.ts");
});

test("send_answer acknowledges receipt", async () => {
  const res = await sendAnswerTool.run({ message: "hi", final: true }, { cwd: dir });
  expect(res.isError).toBeFalsy();
  expect(res.output).toBe("delivered");
});
