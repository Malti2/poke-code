import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ToolManager } from "../src/tools/manager";
import { startMcpServer } from "../src/mcp/server";

describe("local MCP server", () => {
  test("advertises tools and executes calls end to end", async () => {
    const box: { value: string | null } = { value: null };
    const tools = new ToolManager({
      onReplyToTerminal: (answer) => {
        box.value = answer;
      },
    });

    const permissionLog: string[] = [];
    const handle = await startMcpServer({
      tools,
      onCallTool: async (name, args) => {
        permissionLog.push(name);
        const result = await tools.execute(name, args, { cwd: process.cwd() });
        return { output: result.output, isError: result.isError ?? false };
      },
    });

    try {
      const client = new Client({ name: "poke-code-test", version: "0.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(handle.url));
      await client.connect(transport);

      const { tools: listed } = await client.listTools();
      const names = listed.map((t) => t.name);
      for (const expected of ["read", "write", "edit", "bash", "reply_to_terminal"]) {
        expect(names).toContain(expected);
      }

      // Read-only tool call through MCP.
      const listRes = await client.callTool({ name: "list", arguments: { path: "." } });
      expect(listRes.isError).toBeFalsy();
      const listText = (listRes.content as Array<{ text: string }>)
        .map((c) => c.text)
        .join("\n");
      expect(listText).toContain("package.json");

      // reply_to_terminal delivers the answer to the local callback.
      await client.callTool({
        name: "reply_to_terminal",
        arguments: { answer: "done via MCP" },
      });
      expect(box.value).toBe("done via MCP");

      // Unknown tool -> MCP-level error result, not a transport failure.
      const badRes = await client.callTool({ name: "nope", arguments: {} });
      expect(badRes.isError).toBe(true);

      expect(permissionLog).toEqual(["list", "reply_to_terminal", "nope"]);

      await client.close();
    } finally {
      await handle.stop();
    }
  });
});
