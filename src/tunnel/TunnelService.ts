import { PokeTunnel, login, getToken, isLoggedIn } from "poke";
import { McpServer, type ActivityEvent } from "../mcp/server";
import { pokeTools } from "../tools";
import type { ToolDefinition } from "../tools/types";
import { loadState, saveState } from "../config";

/**
 * Connects poke-code's local tools to your Poke agent.
 *
 *   1. Start a local HTTP MCP server exposing the tools.
 *   2. Open a PokeTunnel pointed at that server's URL. The tunnel forwards raw
 *      streams from Poke to `new URL(url).host` — it does not understand tools.
 *   3. Poke's agent then speaks MCP (tools/list, tools/call) over the tunnel,
 *      so it can read/write files, run commands, and talk back (send_answer).
 */

export type TunnelEvent =
  | { kind: "info"; message: string }
  | { kind: "connected"; connectionId: string }
  | { kind: "toolsSynced"; toolCount: number }
  | { kind: "oauthRequired"; authUrl: string }
  | { kind: "disconnected" }
  | { kind: "error"; message: string };

export interface TunnelServiceOptions {
  name?: string;
  token?: string;
  port?: number;
  cwd?: string;
  tools?: ToolDefinition[];
  /** Tool activity from Poke (so a UI can render it). */
  onActivity?: (event: ActivityEvent) => void;
  /** Status updates. Defaults to console logging when omitted. */
  onEvent?: (event: TunnelEvent) => void;
}

export class TunnelService {
  private mcp?: McpServer;
  private tunnel?: PokeTunnel;

  constructor(private readonly opts: TunnelServiceOptions = {}) {}

  private emit(event: TunnelEvent) {
    if (this.opts.onEvent) return this.opts.onEvent(event);
    const ts = new Date().toISOString().slice(11, 19);
    const text =
      event.kind === "info"
        ? event.message
        : event.kind === "connected"
          ? `Connected to Poke. Connection id: ${event.connectionId}`
          : event.kind === "toolsSynced"
            ? `Synced ${event.toolCount} tools to Poke.`
            : event.kind === "oauthRequired"
              ? `Poke needs authorization. Open: ${event.authUrl}`
              : event.kind === "disconnected"
                ? "Tunnel disconnected; the SDK will retry."
                : `Tunnel error: ${event.message}`;
    console.log(`[${ts}] ${text}`);
  }

  private async ensureToken(): Promise<string> {
    if (this.opts.token) return this.opts.token;
    if (process.env.POKE_API_KEY) return process.env.POKE_API_KEY;
    if (isLoggedIn()) {
      const t = getToken();
      if (t) return t;
    }
    this.emit({ kind: "info", message: "Not logged in — starting Poke login flow." });
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.log(`\nOpen ${loginUrl} and enter code ${userCode}\n`);
      },
    });
    const t = getToken();
    if (!t) throw new Error("Login finished but no token was returned.");
    return t;
  }

  private async cleanupStaleConnection(token: string) {
    const { connectionId } = loadState();
    if (!connectionId) return;
    const base = process.env.POKE_API ?? "https://poke.com/api/v1";
    // Best-effort, and never allowed to block startup: hard 4s timeout.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(`${base}/mcp/connections/${connectionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
    } catch {
      // non-fatal (including the abort)
    } finally {
      clearTimeout(timer);
    }
    saveState({ connectionId: undefined });
  }

  /** Connect the tunnel and return once it is live. */
  async connect(): Promise<void> {
    const cwd = this.opts.cwd ?? process.cwd();
    const token = await this.ensureToken();
    await this.cleanupStaleConnection(token);

    const tools = this.opts.tools ?? pokeTools;
    this.mcp = new McpServer({ tools, cwd, name: "poke-code", onActivity: this.opts.onActivity });
    const { url } = this.mcp.listen(this.opts.port ?? 0);
    this.emit({ kind: "info", message: `Local MCP server at ${url} (${tools.length} tools).` });

    this.tunnel = new PokeTunnel({
      url,
      token,
      name: this.opts.name ?? "poke-code",
      cleanupOnStop: true,
    });

    this.tunnel.on("connected", (info) => {
      saveState({ connectionId: info.connectionId });
      this.emit({ kind: "connected", connectionId: info.connectionId });
    });
    this.tunnel.on("toolsSynced", ({ toolCount }) => this.emit({ kind: "toolsSynced", toolCount }));
    this.tunnel.on("oauthRequired", ({ authUrl }) => this.emit({ kind: "oauthRequired", authUrl }));
    this.tunnel.on("disconnected", () => this.emit({ kind: "disconnected" }));
    this.tunnel.on("error", (err) => this.emit({ kind: "error", message: err.message }));

    this.emit({ kind: "info", message: "Starting Poke tunnel…" });
    await this.tunnel.start();
  }

  async stop(): Promise<void> {
    try {
      await this.tunnel?.stop();
    } catch {
      // ignore
    }
    this.mcp?.stop();
  }
}
