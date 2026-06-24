import { test, expect } from "bun:test";
import {
  toOpenAiMessages,
  buildOpenAiBody,
  parseOpenAiResponse,
} from "../src/agent/providers/openai";
import type { CompletionRequest, Message } from "../src/agent/provider";

test("toOpenAiMessages prepends the system message", () => {
  const out = toOpenAiMessages("sys", [{ role: "user", content: "hi" }]);
  expect(out[0]).toEqual({ role: "system", content: "sys" });
  expect(out[1]).toEqual({ role: "user", content: "hi" });
});

test("toOpenAiMessages maps assistant tool_use to tool_calls", () => {
  const messages: Message[] = [
    { role: "user", content: "make a file" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "ok" },
        { type: "tool_use", id: "t1", name: "write_file", input: { path: "a.txt", content: "x" } },
      ],
    },
  ];
  const out = toOpenAiMessages("sys", messages);
  const assistant = out[2];
  expect(assistant.role).toBe("assistant");
  expect(assistant.content).toBe("ok");
  expect(assistant.tool_calls?.[0].function.name).toBe("write_file");
  expect(JSON.parse(assistant.tool_calls![0].function.arguments)).toEqual({
    path: "a.txt",
    content: "x",
  });
});

test("toOpenAiMessages maps tool_result blocks to tool role messages", () => {
  const messages: Message[] = [
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "wrote 1 byte" }],
    },
  ];
  const out = toOpenAiMessages("sys", messages);
  expect(out[1]).toEqual({ role: "tool", tool_call_id: "t1", content: "wrote 1 byte" });
});

test("tool_result errors are flagged in the content", () => {
  const messages: Message[] = [
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "nope", is_error: true }],
    },
  ];
  const out = toOpenAiMessages("sys", messages);
  expect(out[1].content).toContain("ERROR: nope");
});

test("buildOpenAiBody exposes tools as functions", () => {
  const req: CompletionRequest = {
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    tools: [{ name: "read_file", description: "read", inputSchema: { type: "object" } }],
  };
  const body = buildOpenAiBody("gpt-4o", req, 1024);
  expect(body.model).toBe("gpt-4o");
  expect(body.tools[0]).toEqual({
    type: "function",
    function: { name: "read_file", description: "read", parameters: { type: "object" } },
  });
});

test("parseOpenAiResponse extracts text and tool calls", () => {
  const json = {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: "thinking",
          tool_calls: [
            { id: "c1", type: "function", function: { name: "grep", arguments: '{"pattern":"foo"}' } },
          ],
        },
      },
    ],
  };
  const res = parseOpenAiResponse(json);
  expect(res.stopReason).toBe("tool_calls");
  expect(res.content[0]).toEqual({ type: "text", text: "thinking" });
  expect(res.content[1]).toEqual({
    type: "tool_use",
    id: "c1",
    name: "grep",
    input: { pattern: "foo" },
  });
});

test("parseOpenAiResponse tolerates malformed tool arguments", () => {
  const json = {
    choices: [
      {
        finish_reason: "tool_calls",
        message: { content: null, tool_calls: [{ id: "c1", function: { name: "x", arguments: "{bad" } }] },
      },
    ],
  };
  const res = parseOpenAiResponse(json);
  expect(res.content[0]).toEqual({ type: "tool_use", id: "c1", name: "x", input: {} });
});
