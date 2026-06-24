import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentEvent } from "../src/agent/Agent";
import { MockProvider } from "../src/agent/providers/mock";
import { allTools } from "../src/tools";
import type { CompletionResponse } from "../src/agent/provider";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-agent-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

test("agent runs a tool then finishes", async () => {
  // Turn 1: model asks to write a file. Turn 2: model summarises and stops.
  const script: CompletionResponse[] = [
    {
      content: [
        { type: "text", text: "Creating the file." },
        {
          type: "tool_use",
          id: "t1",
          name: "write_file",
          input: { path: "out.txt", content: "from agent\n" },
        },
      ],
      stopReason: "tool_use",
    },
    { content: [{ type: "text", text: "Done — wrote out.txt." }], stopReason: "end_turn" },
  ];
  const provider = new MockProvider(script);
  const agent = new Agent({ provider, tools: allTools, system: "test", cwd: dir });

  const events = await collect(agent.run("make a file"));
  const types = events.map((e) => e.type);

  expect(types).toContain("tool_call");
  expect(types).toContain("tool_result");
  expect(types).toContain("turn_complete");
  expect(readFileSync(join(dir, "out.txt"), "utf-8")).toBe("from agent\n");

  // The tool result was fed back to the provider for the second turn.
  expect(provider.requests.length).toBe(2);
  const secondTurn = provider.requests[1];
  const lastMsg = secondTurn.messages[secondTurn.messages.length - 1];
  expect(lastMsg.role).toBe("user");
});

test("approver can deny a mutating tool", async () => {
  const provider = new MockProvider([
    {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "write_file",
          input: { path: "blocked.txt", content: "nope" },
        },
      ],
      stopReason: "tool_use",
    },
    { content: [{ type: "text", text: "Understood, skipped it." }], stopReason: "end_turn" },
  ]);
  const agent = new Agent({
    provider,
    tools: allTools,
    system: "test",
    cwd: dir,
    approver: () => false,
  });

  const events = await collect(agent.run("write a file"));
  expect(events.some((e) => e.type === "tool_denied")).toBe(true);
  // File must not have been created.
  expect(() => readFileSync(join(dir, "blocked.txt"), "utf-8")).toThrow();
});

test("agent surfaces provider errors", async () => {
  const provider = new MockProvider(() => {
    throw new Error("boom");
  });
  const agent = new Agent({ provider, tools: allTools, system: "test", cwd: dir });
  const events = await collect(agent.run("hi"));
  expect(events[0]).toEqual({ type: "error", message: "boom" });
});

test("unknown tool requested by the model is reported back, not fatal", async () => {
  const provider = new MockProvider([
    {
      content: [{ type: "tool_use", id: "t1", name: "ghost_tool", input: {} }],
      stopReason: "tool_use",
    },
    { content: [{ type: "text", text: "ok" }], stopReason: "end_turn" },
  ]);
  const agent = new Agent({ provider, tools: allTools, system: "test", cwd: dir });
  const events = await collect(agent.run("do magic"));
  const result = events.find((e) => e.type === "tool_result") as Extract<
    AgentEvent,
    { type: "tool_result" }
  >;
  expect(result.isError).toBe(true);
  expect(result.output).toContain("Unknown tool");
});
