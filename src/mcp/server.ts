import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolManager } from "../tools/manager";

export interface McpServerHandle {
  /** Public URL of the MCP endpoint, e.g. http://127.0.0.1:PORT/mcp */
  url: string;
  stop(): Promise<void>;
}

/**
 * Expose the ToolManager registry as a real local MCP server (Streamable HTTP).
 *
 * This is the piece that makes Poke's assistant able to call local tools:
 * PokeTunnel opens a reverse tunnel to the URL we hand it, Poke's server
 * speaks MCP through that tunnel, and every tool call lands in `onCallTool`.
 *
 * Runs in stateless mode (no session IDs): every HTTP request gets a fresh
 * transport + server instance, so it also works through proxies that don't
 * preserve MCP session headers, and concurrent tool calls can't interfere.
 */
export async function startMcpServer(opts: {
  tools: ToolManager;
  /**
   * Called for every incoming tools/call. TunnelService passes its
   * handleToolCall here so permission checks and TUI events stay in one place.
   */
  onCallTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ output: string; isError: boolean }>;
  /** Port to listen on. Defaults to 0 (ephemeral). */
  port?: number;
}): Promise<McpServerHandle> {
  const createServer = () => {
    const server = new Server(
      { name: "poke-code", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: opts.tools.list().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const rawArgs = request.params.arguments;
      const args =
        typeof rawArgs === "object" && rawArgs !== null
          ? (rawArgs as Record<string, unknown>)
          : {};
      const result = await opts.onCallTool(name, args);
      return {
        content: [{ type: "text" as const, text: result.output }],
        isError: result.isError,
      };
    });

    return server;
  };

  const bunServer = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    fetch: async (req) => {
      if (new URL(req.url).pathname !== "/mcp") {
        return new Response("Not found", { status: 404 });
      }
      // Stateless: fresh transport + server per request.
      const server = createServer();
      const transport = new WebStandardStreamableHTTPServerTransport();
      await server.connect(transport);
      const response = await transport.handleRequest(req);
      const body = response.body;
      if (!body) {
        await transport.close().catch(() => undefined);
        return response;
      }
      // handleRequest() resolves once the Response exists, not once its
      // stream is consumed. Drain a tee'd branch in the background and only
      // close the transport afterwards — closing earlier would truncate the
      // SSE stream before the server writes the response into it.
      const [serveBranch, drainBranch] = body.tee();
      void (async () => {
        try {
          const reader = drainBranch.getReader();
          for (;;) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch {
          // Client went away; still clean up.
        } finally {
          await transport.close().catch(() => undefined);
        }
      })();
      return new Response(serveBranch, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });

  const url = `http://127.0.0.1:${bunServer.port}/mcp`;
  return {
    url,
    stop: async () => {
      bunServer.stop();
    },
  };
}
