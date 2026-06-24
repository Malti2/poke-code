import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHeadless } from "../src/runHeadless";
import { MockProvider } from "../src/agent/providers/mock";
import type { CompletionResponse } from "../src/agent/provider";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-headless-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Run something while capturing what is written to stdout. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const orig = process.stdout.write.bind(process.stdout);
  let buf = "";
  (process.stdout as any).write = (chunk: any) => {
    buf += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return buf;
}

function script(): CompletionResponse[] {
  return [
    {
      content: [
        { type: "tool_use", id: "t1", name: "write_file", input: { path: "a.txt", content: "hi" } },
      ],
      stopReason: "tool_use",
    },
    { content: [{ type: "text", text: "All done." }], stopReason: "end_turn" },
  ];
}

test("json output prints a structured result", async () => {
  const provider = new MockProvider(script());
  let returned: any;
  const stdout = await captureStdout(async () => {
    returned = await runHeadless("make a file", { provider, format: "json", cwd: dir });
  });

  const parsed = JSON.parse(stdout);
  expect(parsed.result).toBe("All done.");
  expect(parsed.provider).toBe("mock");
  expect(parsed.isError).toBe(false);
  expect(parsed.numTurns).toBe(1);
  expect(parsed.toolCalls[0].name).toBe("write_file");
  expect(returned.result).toBe("All done.");
  expect(readFileSync(join(dir, "a.txt"), "utf-8")).toBe("hi");
});

test("text output streams the assistant prose to stdout", async () => {
  const provider = new MockProvider([
    { content: [{ type: "text", text: "Hello world" }], stopReason: "end_turn" },
  ]);
  const stdout = await captureStdout(async () => {
    await runHeadless("hi", { provider, format: "text", cwd: dir });
  });
  expect(stdout).toContain("Hello world");
  // text mode must not emit JSON
  expect(stdout.trim().startsWith("{")).toBe(false);
});
