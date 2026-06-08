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
      log("🔑 Using explicitly passed token.");
      this.saveState({ ...state, token: passedToken });
      return passedToken;
    }

    // 2. State-stored token
    if (state.token) {
      log("🔑 Using token from state.json.");
      return state.token;
    }

    // 3. Environment variable (standard pattern)
    if (process.env.POKE_API_KEY) {
      log("🔑 Using token from POKE_API_KEY environment variable.");
      return process.env.POKE_API_KEY;
    }

    // 4. SDK's internal login state
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        log("🔑 Using token from SDK login state.");
        this.saveState({ ...state, token });
        return token;
      }
    }

    // 5. Trigger browser login flow
    log("🔐 No authentication found. Triggering login...");
    
    // The SDK might be failing to detect interactivity correctly, 
    // so we'll force onCode to run and print immediately.
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        // This MUST print to the terminal
        process.stdout.write("\n" + "=".repeat(60) + "\n");
        process.stdout.write(" 🔑 POKE AUTHENTICATION REQUIRED\n");
        process.stdout.write("=".repeat(60) + "\n");
        process.stdout.write(`\n  1. Go to: ${loginUrl}\n`);
        process.stdout.write(`  2. Enter code: ${userCode}\n`);
        process.stdout.write("\n" + "=".repeat(60) + "\n\n");
        
        log("🌐 Opening browser (if supported)...");
      },
    });

    const token = getToken();
    if (!token) {
      throw new Error("Authentication failed: No token received after login flow.");
    }

    this.saveState({ ...state, token });
    return token;
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

    log(`🧹 Cleaning up ${ids.size} old connection(s)…`);

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

    this.saveState({ token: state.token });
  }

  async connect(passedToken?: string) {
    try {
      const token = await this.ensureAuth(passedToken);
      await this.cleanupStaleConnections(token);

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
        this.saveState({ ...state, connectionId: info.connectionId, connectionHistory: history.slice(-10) });
        log(`✅ Tunnel connection established. ID: ${info.connectionId}`);
      });

      this.tunnel.on("disconnected", () => log("🔌 Tunnel disconnected. Reconnecting..."));
      this.tunnel.on("error", (err) => log(`🚨 Tunnel error: ${err.message}`));
      this.tunnel.on("toolsSynced", ({ toolCount }) => log(`🔄 Synced ${toolCount} tools to Poke.`));

      this.tunnel.on("execute_tool", async ({ toolName, args }) => {
        return await handleRequest("call_tool", { name: toolName, arguments: args });
      });

      this.tunnel.on("query", async ({ prompt }) => {
        return await handleRequest("query", { prompt });
      });

      log("🌴 Starting Poke Tunnel...");
      await this.tunnel.start();
    } catch (error: any) {
      console.error("\n🚨 CRITICAL FAILURE during tunnel connection:");
      console.error(error.message || error);
      process.exit(1);
    }
  }
}
