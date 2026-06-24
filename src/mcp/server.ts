import type { ToolDefinition, ToolContext } from "../tools/types";

/**
 * A minimal Model Context Protocol (MCP) server speaking JSON-RPC 2.0 over the
 * "Streamable HTTP" transport.
 *
 * This is the piece that makes `poke tunnel` actually work: the Poke cloud
 * agent connects through the tunnel to this local HTTP server and calls
 * `tools/list` / `tools/call` over standard MCP. The tunnel only forwards
 * bytes — it does not understand tools — so the protocol has to live here.
 *
 * Spec reference: https://modelcontextprotocol.io (2025-06-18 revision).
 */

const PROTOCOL_VERSION = "2025-06-18";

/** Emitted for every tool the remote (Poke) invokes, so a UI can render it. */
export type ActivityEvent =
  | { phase: "start"; tool: string; input: Record<string, unknown> }
  | { phase: "end"; tool: string; input: Record<string, unknown>; output: string; isError: boolean };

export interface McpServerOptions {
  tools: ToolDefinition[];
  cwd: string;
  name?: string;
  version?: string;
  /** Called when the remote invokes a tool (before and after it runs). */
  onActivity?: (event: ActivityEvent) => void;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpServer {
  private server?: ReturnType<typeof Bun.serve>;
  private readonly name: string;
  private readonly version: string;

  constructor(private readonly opts: McpServerOptions) {
    this.name = opts.name ?? "poke-code";
    this.version = opts.version ?? "0.1.0";
  }

  private get ctx(): ToolContext {
    return { cwd: this.opts.cwd };
  }

  private toolSchemas() {
    return this.opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  private async callTool(params: any) {
    const name = params?.name;
    const tool = this.opts.tools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    const input = params?.arguments ?? {};
    this.opts.onActivity?.({ phase: "start", tool: name, input });
    try {
      const result = await tool.run(input, this.ctx);
      const isError = result.isError ?? false;
      this.opts.onActivity?.({ phase: "end", tool: name, input, output: result.output, isError });
      return {
        content: [{ type: "text", text: result.output }],
        isError,
      };
    } catch (e) {
      const msg = `Tool '${name}' threw: ${(e as Error).message}`;
      this.opts.onActivity?.({ phase: "end", tool: name, input, output: msg, isError: true });
      return {
        content: [{ type: "text", text: msg }],
        isError: true,
      };
    }
  }

  /**
   * Dispatch a single JSON-RPC message. Returns a response object for
   * requests, or `null` for notifications (which expect no reply).
   */
  async handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = !("id" in msg) || msg.id === undefined;
    const id = msg.id ?? null;
    const reply = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
    const fail = (code: number, message: string): JsonRpcResponse | null =>
      isNotification ? null : { jsonrpc: "2.0", id, error: { code, message } };

    if (typeof msg.method !== "string") return fail(-32600, "Invalid Request");

    switch (msg.method) {
      case "initialize":
        return reply({
          protocolVersion:
            typeof msg.params?.protocolVersion === "string"
              ? msg.params.protocolVersion
              : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.name, version: this.version },
        });

      case "notifications/initialized":
      case "notifications/cancelled":
        return null; // notifications: no response

      case "ping":
        return reply({});

      case "tools/list":
        return reply({ tools: this.toolSchemas() });

      case "tools/call":
        return reply(await this.callTool(msg.params));

      default:
        return fail(-32601, `Method not found: ${msg.method}`);
    }
  }

  /** Handle one HTTP request of the Streamable HTTP transport. */
  async handleHttp(req: Request): Promise<Response> {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    };

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET")
      // We don't push server-initiated messages, so no SSE stream is offered.
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    if (req.method === "DELETE") return new Response(null, { status: 200, headers: cors });
    if (req.method !== "POST")
      return new Response("Method Not Allowed", { status: 405, headers: cors });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        { status: 400, headers: cors }
      );
    }

    const messages = Array.isArray(body) ? body : [body];
    const responses: JsonRpcResponse[] = [];
    for (const m of messages) {
      const res = await this.handleMessage(m as JsonRpcRequest);
      if (res) responses.push(res);
    }

    // All notifications/responses → 202 Accepted with no body.
    if (responses.length === 0) return new Response(null, { status: 202, headers: cors });

    const payload = Array.isArray(body) ? responses : responses[0];
    return Response.json(payload, { headers: cors });
  }

  /** Start the HTTP listener. Returns the chosen port. */
  listen(port = 0, hostname = "127.0.0.1"): { port: number; url: string } {
    this.server = Bun.serve({
      port,
      hostname,
      fetch: (req) => this.handleHttp(req),
    });
    const chosen = this.server.port ?? port;
    return { port: chosen, url: `http://${hostname}:${chosen}/mcp` };
  }

  stop(): void {
    this.server?.stop(true);
    this.server = undefined;
  }
}
