import { PokeTunnel, login, getToken, isLoggedIn } from "poke";
import { McpServer } from "../mcp/server";
import { allTools } from "../tools";
import { loadState, saveState } from "../config";

/**
 * Connects poke-code's local tools to your Poke agent.
 *
 * The mechanics (discovered from the real `poke` SDK) are:
 *   1. Start a local HTTP MCP server exposing our coding tools.
 *   2. Open a PokeTunnel pointed at that server's URL. The tunnel forwards raw
 *      streams from Poke to `new URL(url).host` — it does not understand tools.
 *   3. Poke's cloud agent then speaks MCP (tools/list, tools/call) over the
 *      tunnel, so it can read/write files and run commands on this machine.
 *
 * The previous implementation invented tunnel events like `query` /
 * `execute_tool` and used `url: "local://"`; neither exists in the SDK, which
 * is why connections never worked.
 */

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export interface TunnelServiceOptions {
  /** Display name shown in Poke for this connection. */
  name?: string;
  /** Explicit token; otherwise resolved from env / SDK credentials / login. */
  token?: string;
  /** Bind port for the local MCP server (0 = random free port). */
  port?: number;
  /** Working directory the tools operate in. */
  cwd?: string;
}

export class TunnelService {
  private mcp?: McpServer;
  private tunnel?: PokeTunnel;

  constructor(private readonly opts: TunnelServiceOptions = {}) {}

  /** Resolve an auth token, triggering the device-code login flow if needed. */
  private async ensureToken(): Promise<string> {
    if (this.opts.token) return this.opts.token;
    if (process.env.POKE_API_KEY) {
      log("Using token from POKE_API_KEY.");
      return process.env.POKE_API_KEY;
    }
    if (isLoggedIn()) {
      const t = getToken();
      if (t) {
        log("Using stored Poke credentials.");
        return t;
      }
    }

    log("Not logged in — starting Poke login flow.");
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.log("\n────────────────────────────────────────────");
        console.log("  Poke login required");
        console.log(`  1. Open: ${loginUrl}`);
        console.log(`  2. Enter code: ${userCode}`);
        console.log("────────────────────────────────────────────\n");
      },
    });
    const t = getToken();
    if (!t) throw new Error("Login finished but no token was returned.");
    return t;
  }

  /** Best-effort cleanup of a connection left over from a previous run. */
  private async cleanupStaleConnection(token: string) {
    const { connectionId } = loadState();
    if (!connectionId) return;
    const base = process.env.POKE_API ?? "https://poke.com/api/v1";
    try {
      await fetch(`${base}/mcp/connections/${connectionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      log(`Cleaned up stale connection ${connectionId}.`);
    } catch {
      // non-fatal
    }
    saveState({ connectionId: undefined });
  }

  async connect(): Promise<void> {
    const cwd = this.opts.cwd ?? process.cwd();
    const token = await this.ensureToken();
    await this.cleanupStaleConnection(token);

    // 1. Local MCP server.
    this.mcp = new McpServer({ tools: allTools, cwd, name: "poke-code" });
    const { url } = this.mcp.listen(this.opts.port ?? 0);
    log(`Local MCP server listening at ${url} (${allTools.length} tools).`);

    // 2. Tunnel pointed at the local server.
    this.tunnel = new PokeTunnel({
      url,
      token,
      name: this.opts.name ?? "poke-code",
      cleanupOnStop: true,
    });

    this.tunnel.on("connected", (info) => {
      saveState({ connectionId: info.connectionId });
      log(`Connected to Poke. Connection id: ${info.connectionId}`);
      log("Your tools are now available to your Poke agent. Press Ctrl+C to stop.");
    });
    this.tunnel.on("toolsSynced", ({ toolCount }) => log(`Synced ${toolCount} tools to Poke.`));
    this.tunnel.on("oauthRequired", ({ authUrl }) =>
      log(`Poke needs authorization. Open: ${authUrl}`)
    );
    this.tunnel.on("disconnected", () => log("Tunnel disconnected; the SDK will retry."));
    this.tunnel.on("error", (err) => log(`Tunnel error: ${err.message}`));

    const shutdown = async () => {
      log("Shutting down…");
      await this.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    log("Starting Poke tunnel…");
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
