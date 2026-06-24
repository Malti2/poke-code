import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "../src/mcp/server";
import { allTools } from "../src/tools";

let dir: string;
let server: McpServer;
let baseUrl: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-mcp-"));
  writeFileSync(join(dir, "readme.md"), "# hello mcp\n");
  server = new McpServer({ tools: allTools, cwd: dir, name: "poke-code-test" });
  const { url } = server.listen(0);
  baseUrl = url;
});

afterAll(() => {
  server.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function rpc(message: unknown) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(message),
  });
  return res;
}

test("initialize returns serverInfo and capabilities", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const json: any = await res.json();
  expect(json.id).toBe(1);
  expect(json.result.serverInfo.name).toBe("poke-code-test");
  expect(json.result.capabilities.tools).toBeDefined();
});

test("notifications get a 202 with no body", async () => {
  const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  expect(res.status).toBe(202);
});

test("tools/list returns all registered tools with schemas", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const json: any = await res.json();
  const names = json.result.tools.map((t: any) => t.name);
  expect(names).toContain("read_file");
  expect(names).toContain("execute_bash");
  expect(json.result.tools.length).toBe(allTools.length);
  for (const t of json.result.tools) {
    expect(t.inputSchema.type).toBe("object");
  }
});

test("tools/call executes a tool", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "read_file", arguments: { path: "readme.md" } },
  });
  const json: any = await res.json();
  expect(json.result.isError).toBe(false);
  expect(json.result.content[0].text).toContain("hello mcp");
});

test("tools/call on unknown tool returns isError", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "does_not_exist", arguments: {} },
  });
  const json: any = await res.json();
  expect(json.result.isError).toBe(true);
});

test("unknown method returns a JSON-RPC error", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 5, method: "bogus/method" });
  const json: any = await res.json();
  expect(json.error.code).toBe(-32601);
});

test("GET is not allowed (no SSE stream offered)", async () => {
  const res = await fetch(baseUrl, { method: "GET" });
  expect(res.status).toBe(405);
});

test("batched requests return an array of responses", async () => {
  const res = await rpc([
    { jsonrpc: "2.0", id: 10, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 11, method: "tools/list" },
  ]);
  const json: any = await res.json();
  expect(Array.isArray(json)).toBe(true);
  // notification produces no response, so 2 responses for 3 messages
  expect(json.length).toBe(2);
});
