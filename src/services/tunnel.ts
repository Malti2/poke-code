import { PokeTunnel, login, isLoggedIn, getToken } from "poke";
import { ToolManager } from "../tools/manager";
import type { ToolDefinition } from "../tools/types";
import { startMcpServer, type McpServerHandle } from "../mcp/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, permissionModeOf, type PermissionMode } from "../config";

interface State {
  connectionId?: string;
  connectionHistory?: string[];
  token?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "poke-code");
const STATE_PATH = join(CONFIG_DIR, "state.json");

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export interface ToolCallEvent {
  type: "tool-start" | "tool-end";
  name: string;
  args: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  ms?: number;
}

export interface PermissionRequest {
  tool: ToolDefinition;
  args: Record<string, unknown>;
}

export type PermissionDecision = "allow" | "deny" | "allow-session";

/**
 * Manages the Poke tunnel connection and is the single entry point for
 * incoming tool calls from Poke's assistant.
 *
 * - `list_tools` is served from the ToolManager registry (single source of truth).
 * - `handleToolCall` executes a tool locally with permission checks and emits
 *   tool-start/tool-end events so the TUI can render live ToolCards.
 * - `reply_to_terminal` is registered like any other tool; its handler
 *   resolves the pending `ask()` promise in AgentSession.
 */
export class TunnelService {
  private toolManager: ToolManager;
  private tunnel?: PokeTunnel;
  private mcp?: McpServerHandle;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private toolListeners = new Set<(e: ToolCallEvent) => void>();
  private permissionHandler: ((req: PermissionRequest) => Promise<PermissionDecision>) | null = null;
  private permissionMode: PermissionMode;
  private sessionAllowedTools = new Set<string>();
  private onReplyToTerminal: ((answer: string) => void) | null = null;

  constructor(opts: { permissionMode?: PermissionMode } = {}) {
    this.permissionMode = opts.permissionMode ?? permissionModeOf(loadConfig());
    this.toolManager = new ToolManager({
      onReplyToTerminal: (answer) => this.onReplyToTerminal?.(answer),
    });
  }

  // ------------------------------------------------------------------ wiring

  /** Live tool-call events for the TUI. */
  onToolEvent(listener: (e: ToolCallEvent) => void): () => void {
    this.toolListeners.add(listener);
    return () => this.toolListeners.delete(listener);
  }

  private emitToolEvent(e: ToolCallEvent): void {
    for (const l of this.toolListeners) {
      try {
        l(e);
      } catch {
        // Listener errors must not break tool execution.
      }
    }
  }

  /** Set by the TUI (or headless callers) to approve write/bash tool calls. */
  setPermissionHandler(handler: (req: PermissionRequest) => Promise<PermissionDecision>): void {
    this.permissionHandler = handler;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  /** Called by AgentSession: resolves the pending ask() with Poke's answer. */
  setReplyHandler(handler: (answer: string) => void): void {
    this.onReplyToTerminal = handler;
  }

  clearSessionPermissions(): void {
    this.sessionAllowedTools.clear();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** The advertised tool registry (single source of truth). */
  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return this.toolManager.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  // ------------------------------------------------------- tool execution

  /**
   * Execute one tool call from Poke's assistant: permission check, run,
   * events. This is the seam the (mocked or live) transport invokes.
   */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ output: string; isError: boolean }> {
    const tool = this.toolManager.get(toolName);
    if (!tool) {
      const output = `Error: unknown tool "${toolName}".`;
      this.emitToolEvent({ type: "tool-start", name: toolName, args });
      this.emitToolEvent({ type: "tool-end", name: toolName, args, output, isError: true, ms: 0 });
      return { output, isError: true };
    }

    const decision = await this.checkPermission(tool, args);
    this.emitToolEvent({ type: "tool-start", name: toolName, args });
    const started = Date.now();

    let output: string;
    let isError = false;
    if (decision === "deny") {
      output = `Error: permission denied by user for tool "${toolName}". Ask the user or proceed without it.`;
      isError = true;
    } else {
      const result = await this.toolManager.execute(toolName, args, { cwd: process.cwd() });
      output = result.output;
      isError = result.isError ?? false;
    }

    const ms = Date.now() - started;
    this.emitToolEvent({ type: "tool-end", name: toolName, args, output, isError, ms });
    return { output, isError };
  }

  private async checkPermission(
    tool: ToolDefinition,
    args: Record<string, unknown>,
  ): Promise<PermissionDecision> {
    if (tool.permission === "read") return "allow";
    if (this.permissionMode === "readonly") return "deny";
    if (this.permissionMode === "auto") return "allow";
    if (this.sessionAllowedTools.has(tool.name)) return "allow";
    if (!this.permissionHandler) return "allow"; // non-interactive default
    const decision = await this.permissionHandler({ tool, args });
    if (decision === "allow-session") {
      this.sessionAllowedTools.add(tool.name);
      return "allow";
    }
    return decision;
  }

  // ------------------------------------------------------- connection

  private loadState(): State {
    try {
      if (existsSync(STATE_PATH)) {
        return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      }
    } catch {
      // ignore
    }
    return {};
  }

  private saveState(state: State) {
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error("Error saving state:", e);
    }
  }

  private clearToken() {
    const state = this.loadState();
    delete state.token;
    this.saveState(state);
  }

  private async triggerManualLogin(): Promise<string> {
    log("Triggering Poke login flow...");

    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.error("\n============================================================");
        console.error(" POKE AUTHENTICATION REQUIRED");
        console.error("============================================================");
        console.error(`\n  1. Go to: ${loginUrl}`);
        console.error(`  2. Enter code: ${userCode}`);
        console.error("\n============================================================\n");

        log("Opening browser (if supported)...");
      },
    });

    const token = getToken();
    if (token) {
      const state = this.loadState();
      this.saveState({ ...state, token });
      return token;
    } else {
      throw new Error("Login completed but no token was found.");
    }
  }

  private async ensureAuth(passedToken?: string): Promise<string> {
    const state = this.loadState();

    // 1. Explicitly passed token
    if (passedToken) {
      log("Using explicitly passed token.");
      this.saveState({ ...state, token: passedToken });
      return passedToken;
    }

    // 2. V2 API key from env or config (preferred for the tunnel too)
    if (process.env.POKE_API_KEY) {
      log("Using token from POKE_API_KEY environment variable.");
      return process.env.POKE_API_KEY;
    }
    const apiKey = loadConfig().apiKey;
    if (apiKey) {
      log("Using token from config file.");
      return apiKey;
    }

    // 3. State-stored token
    if (state.token) {
      log("Using token from state.json.");
      return state.token;
    }

    // 4. SDK's internal login state
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        log("Using token from SDK login state.");
        this.saveState({ ...state, token });
        return token;
      }
    }

    // 5. Trigger login
    return await this.triggerManualLogin();
  }

  private async cleanupStaleConnections(token: string) {
    if (!token) return;
    const base = process.env.POKE_API ?? "https://poke.com/api/v1";
    const state = this.loadState();

    const ids = new Set<string>();
    if (state.connectionId) ids.add(state.connectionId);
    if (Array.isArray(state.connectionHistory)) {
      for (const id of state.connectionHistory) ids.add(id);
    }

    if (ids.size === 0) return;

    log(`Cleaning up ${ids.size} old connection(s)…`);

    for (const id of ids) {
      try {
        await fetch(`${base}/mcp/connections/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore cleanup
      }
    }

    this.saveState({ ...state, connectionId: undefined, connectionHistory: [] });
  }

  /**
   * Ensure the tunnel is connected, starting it once and reusing it.
   * Concurrent callers share the same in-flight attempt.
   */
  ensureConnected(passedToken?: string): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (!this.connecting) {
      this.connecting = this.connect(passedToken).finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  async connect(passedToken?: string) {    let currentToken = await this.ensureAuth(passedToken);
    let connectionAttempts = 0;
    const MAX_AUTH_RETRIES = 1;

    const startTunnel = async (token: string): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        let isResolved = false;
        let isAuthFailure = false;

        await this.cleanupStaleConnections(token);

        // Start the local MCP server first. Poke's server reaches our tools
        // through the reverse tunnel pointed at this URL — this is what lets
        // Poke's assistant actually call tools on this machine.
        if (!this.mcp) {
          this.mcp = await startMcpServer({
            tools: this.toolManager,
            onCallTool: (name, args) => this.handleToolCall(name, args),
          });
          log(`Local MCP server listening at ${this.mcp.url}`);
        }

        this.tunnel = new PokeTunnel({
          url: this.mcp.url,
          token,
          name: "poke-code",
          cleanupOnStop: true,
        });

        // Set up a "canary" to detect immediate auth failures
        const connectionStartTime = Date.now();

        this.tunnel.on("connected", (info) => {
          const state = this.loadState();
          const history = state.connectionHistory || [];
          if (info.connectionId) history.push(info.connectionId);
          this.saveState({ ...state, connectionId: info.connectionId, connectionHistory: history.slice(-10) });
          log(`Tunnel connection established. ID: ${info.connectionId}`);
          this.connected = true;
          isResolved = true;
          resolve();
        });

        this.tunnel.on("disconnected", () => {
          this.connected = false;
          if (isAuthFailure) return;
          log("Tunnel disconnected.");
          const duration = Date.now() - connectionStartTime;

          // If we disconnect instantly (< 3s) AND haven't established connection yet, it's likely an auth issue
          if (!isResolved && duration < 3000) {
            log("Immediate disconnect detected. Current token may be invalid.");
            isAuthFailure = true;
            this.tunnel?.stop();
            reject(new Error("AUTH_INVALID"));
          }
        });

        this.tunnel.on("error", (err) => {
          if (isAuthFailure) return;
          log(`Tunnel error: ${err.message}`);
          const msg = err.message.toLowerCase();
          if (
            msg.includes("401") ||
            msg.includes("403") ||
            msg.includes("auth") ||
            msg.includes("forbidden")
          ) {
            isAuthFailure = true;
            this.tunnel?.stop();
            reject(new Error("AUTH_INVALID"));
          }
        });

        this.tunnel.on("toolsSynced", ({ toolCount }) =>
          log(`Synced ${toolCount} tools to Poke.`),
        );

        log("Starting Poke Tunnel...");
        try {
          await this.tunnel.start();
        } catch (e: unknown) {
          if (isResolved || isAuthFailure) return;
          // The SDK throws plain errors like "Failed to create tunnel: HTTP 403"
          // — map auth failures onto the AUTH_INVALID path.
          const m = e instanceof Error ? e.message : String(e);
          if (/\b401\b|\b403\b/i.test(m) || m.toLowerCase().includes("auth")) {
            isAuthFailure = true;
            reject(new Error("AUTH_INVALID"));
          } else {
            reject(e);
          }
        }
      });
    };

    while (connectionAttempts <= MAX_AUTH_RETRIES) {
      try {
        await startTunnel(currentToken);
        // If we reach here, it connected successfully
        break;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "AUTH_INVALID" && connectionAttempts < MAX_AUTH_RETRIES) {
          // With a user-provided API key (env/config), the console device
          // flow would corrupt the TUI — fail with actionable guidance
          // instead so the user can fix the key.
          if (process.env.POKE_API_KEY || loadConfig().apiKey) {
            throw new Error(
              "Poke rejected your API key (HTTP 401/403).\n" +
                "Make sure you pasted a V2 Kitchen key from https://poke.com/kitchen/api-keys,\n" +
                "then replace it with:\n" +
                "  poke-code config set apiKey <your-key>",
            );
          }
          log("Clearing invalid token and re-authenticating...");
          this.clearToken();
          connectionAttempts++;
          currentToken = await this.triggerManualLogin();
          // The loop will continue and try to startTunnel again with the new currentToken
        } else {
          // Let the caller handle it: the TUI shows it as an error entry,
          // --print prints it, the standalone tunnel command exits(1).
          throw error instanceof Error ? error : new Error(String(error));
        }
      }
    }
  }

  async stop(): Promise<void> {
    try {
      await this.tunnel?.stop();
    } catch {
      // ignore
    }
    try {
      await this.mcp?.stop();
    } catch {
      // ignore
    }
    this.mcp = undefined;
    this.connected = false;
  }
}
