import { PokeTunnel, login, isLoggedIn, getToken } from "poke";
import { ToolManager } from "../tools/ToolManager";
import { QueryEngine } from "../QueryEngine";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

export class TunnelService {
  private queryEngine: QueryEngine;
  private toolManager: ToolManager;
  private tunnel?: PokeTunnel;

  constructor() {
    this.toolManager = new ToolManager();
    this.queryEngine = new QueryEngine();
  }

  private loadState(): State {
    try {
      if (existsSync(STATE_PATH)) {
        return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      }
    } catch (e) {
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
      console.error("🚨 Error saving state:", e);
    }
  }

  private async ensureAuth(passedToken?: string): Promise<string> {
    const state = this.loadState();
    
    // 1. Explicitly passed token
    if (passedToken) {
      this.saveState({ ...state, token: passedToken });
      return passedToken;
    }

    // 2. State-stored token
    if (state.token) {
      return state.token;
    }

    // 3. Environment variable (standard pattern)
    if (process.env.POKE_API_KEY) {
      return process.env.POKE_API_KEY;
    }

    // 4. SDK's internal login state
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        this.saveState({ ...state, token });
        return token;
      }
    }

    // 5. Trigger browser login flow
    log("🔐 No authentication found. Opening browser for Poke login...");
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.log(`\n  If the browser didn't open, go to: ${loginUrl}`);
        console.log(`  And enter code: ${userCode}\n`);
      },
    });

    const token = getToken();
    if (!token) {
      throw new Error("Authentication failed: No token received after login.");
    }

    this.saveState({ ...state, token });
    return token;
  }

  /**
   * Cleans up stale connections matching the poke-gate pattern.
   */
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

    log(`🧹 Cleaning up ${ids.size} old connection(s)…`);

    for (const id of ids) {
      try {
        await fetch(`${base}/mcp/connections/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore cleanup errors
      }
    }

    // After cleanup, we keep the token but clear the stale IDs
    this.saveState({ token: state.token });
  }

  async connect(passedToken?: string) {
    const token = await this.ensureAuth(passedToken);
    await this.cleanupStaleConnections(token);

    // In-process handling logic
    const handleRequest = async (method: string, params: any) => {
      switch (method) {
        case "list_tools":
          return {
            tools: [
              { name: "read_file", description: "Read content from a file" },
              { name: "write_file", description: "Write content to a file" },
              { name: "list_files", description: "List files in a directory" },
              { name: "search_files", description: "Search for files by pattern" },
              { name: "execute_bash", description: "Execute a bash command" }
            ]
          };

        case "call_tool":
          log(`📨 Executing tool: ${params.name}`);
          return await this.toolManager.executeTool(params.name, params.arguments);

        case "query":
          log(`📨 Received query: ${params.prompt.substring(0, 50)}...`);
          const queryResults: any[] = [];
          for await (const step of this.queryEngine.processQuery(params.prompt)) {
            queryResults.push(step);
          }
          return queryResults;

        default:
          throw new Error(`Method ${method} not found`);
      }
    };

    this.tunnel = new PokeTunnel({
      url: "local://",
      token,
      name: "poke-code",
      cleanupOnStop: true,
    });

    this.tunnel.on("connected", (info) => {
      const state = this.loadState();
      const history = state.connectionHistory || [];
      if (info.connectionId) history.push(info.connectionId);
      
      this.saveState({
        ...state,
        connectionId: info.connectionId,
        connectionHistory: history.slice(-10),
      });
      
      log(`✅ Tunnel connection established. ID: ${info.connectionId}`);
    });

    this.tunnel.on("disconnected", () => log("🔌 Tunnel disconnected. Reconnecting..."));
    this.tunnel.on("error", (err) => log(`🚨 Tunnel error: ${err.message}`));
    this.tunnel.on("toolsSynced", ({ toolCount }) => log(`🔄 Synced ${toolCount} tools to Poke.`));

    // SDK natively supports local:// via these handlers when no HTTP server is present
    this.tunnel.on("execute_tool", async ({ toolName, args }) => {
      return await handleRequest("call_tool", { name: toolName, arguments: args });
    });

    this.tunnel.on("query", async ({ prompt }) => {
      return await handleRequest("query", { prompt });
    });

    log("🌴 Starting Poke Tunnel...");
    await this.tunnel.start();
  }
}
