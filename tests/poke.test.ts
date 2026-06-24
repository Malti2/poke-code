import { test, expect } from "bun:test";
import { buildPokePrompt, parsePokeResponse } from "../src/agent/providers/poke";
import type { CompletionRequest } from "../src/agent/provider";

const baseReq: CompletionRequest = {
  system: "SYSTEM-PROMPT-MARKER",
  messages: [
    { role: "user", content: "read the readme" },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "t1", name: "read_file", input: { path: "README.md" } }],
    },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "# Title" }],
    },
  ],
  tools: [{ name: "read_file", description: "Read a file", inputSchema: { type: "object" } }],
};

test("buildPokePrompt includes system, tools, transcript and protocol", () => {
  const prompt = buildPokePrompt(baseReq);
  expect(prompt).toContain("SYSTEM-PROMPT-MARKER");
  expect(prompt).toContain("read_file: Read a file");
  expect(prompt).toContain('"type":"object"');
  expect(prompt).toContain("USER: read the readme");
  expect(prompt).toContain("ASSISTANT called read_file");
  expect(prompt).toContain("TOOL RESULT (t1)");
  expect(prompt).toContain('"tool_calls"');
  expect(prompt).toContain('"response"');
});

test("parsePokeResponse parses tool calls", () => {
  const res = parsePokeResponse(
    '{"tool_calls":[{"name":"read_file","input":{"path":"a.ts"}}]}'
  );
  expect(res.stopReason).toBe("tool_use");
  const call = res.content[0];
  expect(call.type).toBe("tool_use");
  if (call.type === "tool_use") {
    expect(call.name).toBe("read_file");
    expect(call.input).toEqual({ path: "a.ts" });
    expect(call.id).toBeTruthy();
  }
});

test("parsePokeResponse keeps thoughts as a text block before tool calls", () => {
  const res = parsePokeResponse(
    '{"thoughts":"let me look","tool_calls":[{"name":"list_files","input":{}}]}'
  );
  expect(res.content[0]).toEqual({ type: "text", text: "let me look" });
  expect(res.content[1].type).toBe("tool_use");
});

test("parsePokeResponse parses a final response", () => {
  const res = parsePokeResponse('{"response":"All done."}');
  expect(res.stopReason).toBe("end_turn");
  expect(res.content[0]).toEqual({ type: "text", text: "All done." });
});

test("parsePokeResponse handles ```json fenced output", () => {
  const res = parsePokeResponse('```json\n{"response":"hi"}\n```');
  expect(res.content[0]).toEqual({ type: "text", text: "hi" });
});

test("parsePokeResponse extracts JSON embedded in prose", () => {
  const res = parsePokeResponse('Sure! {"tool_calls":[{"name":"glob","input":{"pattern":"*.ts"}}]} ok');
  expect(res.stopReason).toBe("tool_use");
  expect(res.content[0].type).toBe("tool_use");
});

test("parsePokeResponse falls back to prose as a final answer", () => {
  const res = parsePokeResponse("I think the bug is in foo.ts.");
  expect(res.stopReason).toBe("end_turn");
  expect(res.content[0]).toEqual({ type: "text", text: "I think the bug is in foo.ts." });
});

test("parsePokeResponse ignores malformed tool calls and uses response", () => {
  const res = parsePokeResponse('{"tool_calls":[{"oops":true}],"response":"fallback"}');
  expect(res.stopReason).toBe("end_turn");
  expect(res.content[0]).toEqual({ type: "text", text: "fallback" });
});
