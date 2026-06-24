import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer, type ActivityEvent } from "../src/mcp/server";
import { pokeTools } from "../src/tools";

let dir: string;
let server: McpServer;
let baseUrl: string;
const activity: ActivityEvent[] = [];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-mcp-"));
  writeFileSync(join(dir, "readme.md"), "# hello mcp\n");
  server = new McpServer({
    tools: pokeTools,
    cwd: dir,
    name: "poke-code-test",
    onActivity: (e) => activity.push(e),
  });
  const { url } = server.listen(0);
  baseUrl = url;
});

afterAll(() => {
  server.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function rpc(message: unknown) {
  return fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(message),
  });
}

test("initialize returns serverInfo and capabilities", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const json: any = await res.json();
  expect(json.result.serverInfo.name).toBe("poke-code-test");
  expect(json.result.capabilities.tools).toBeDefined();
});

test("tools/list exposes coding + comms tools", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const json: any = await res.json();
  const names = json.result.tools.map((t: any) => t.name);
  expect(names).toContain("read_file");
  expect(names).toContain("execute_bash");
  expect(names).toContain("send_answer");
  expect(names).toContain("remember");
  expect(names).toContain("update_plan");
  expect(json.result.tools.length).toBe(pokeTools.length);
});

test("tools/call executes a tool and emits activity", async () => {
  activity.length = 0;
  const res = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "read_file", arguments: { path: "readme.md" } },
  });
  const json: any = await res.json();
  expect(json.result.isError).toBe(false);
  expect(json.result.content[0].text).toContain("hello mcp");

  expect(activity.find((a) => a.phase === "start" && a.tool === "read_file")).toBeTruthy();
  const end = activity.find((a) => a.phase === "end" && a.tool === "read_file");
  expect(end).toBeTruthy();
});

test("send_answer activity carries the message and final flag", async () => {
  activity.length = 0;
  await rpc({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "send_answer", arguments: { message: "all done", final: true } },
  });
  const start = activity.find((a) => a.phase === "start" && a.tool === "send_answer") as any;
  expect(start.input.message).toBe("all done");
  expect(start.input.final).toBe(true);
});

test("notifications get a 202", async () => {
  const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  expect(res.status).toBe(202);
});

test("unknown method returns a JSON-RPC error", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 5, method: "bogus/method" });
  const json: any = await res.json();
  expect(json.error.code).toBe(-32601);
});
