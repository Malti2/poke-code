import { PokeTunnel, login, isLoggedIn, getToken } from "poke";
import { ToolManager } from "../tools/ToolManager";
import { QueryEngine } from "../QueryEngine";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface Config {
  token?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "poke-code");
const CONFIG_FILE = join(CONFIG_DIR, "state.json");

export class TunnelService {
  private queryEngine: QueryEngine;
  private toolManager: ToolManager;
  private tunnel?: PokeTunnel;

  constructor() {
    this.toolManager = new ToolManager();
    this.queryEngine = new QueryEngine();
  }

  private loadConfig(): Config {
    try {
      if (existsSync(CONFIG_FILE)) {
        return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      }
    } catch (e) {
      console.error("🚨 Error reading config:", e);
    }
    return {};
  }

  private saveConfig(config: Config) {
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (e) {
      console.error("🚨 Error saving config:", e);
    }
  }

  private async ensureAuth(passedToken?: string): Promise<string> {
    // 1. Try passed token
    if (passedToken) {
      this.saveConfig({ token: passedToken });
      return passedToken;
    }

    // 2. Try saved token
    const config = this.loadConfig();
    if (config.token) {
      return config.token;
    }

    // 3. Try SDK's internal state
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        this.saveConfig({ token });
        return token;
      }
    }

    // 4. Trigger browser login
    console.log("🔐 No authentication found. Opening browser for Poke login...");
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

    this.saveConfig({ token });
    return token;
  }

  private async cleanupStaleConnections(token: string) {
    const apiBase = "https://poke.com/api/v1";
    console.log("🧹 Cleaning up stale tunnel connections...");
    
    try {
      const response = await fetch(`${apiBase}/mcp/connections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      const connections = data.connections || [];
      
      for (const conn of connections) {
        if (conn.name === "poke-code") {
          console.log(`🗑️  Removing stale connection: ${conn.id}`);
          await fetch(`${apiBase}/mcp/connections/${conn.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }
    } catch (error) {
      console.warn("⚠️  Note: Could not complete stale connection cleanup.", error);
    }
  }

  async connect(passedToken?: string) {
    const token = await this.ensureAuth(passedToken);
    
    await this.cleanupStaleConnections(token);

    this.tunnel = new PokeTunnel({
      url: "local://",
      token,
      name: "poke-code",
      cleanupOnStop: true,
    });

    this.tunnel.on("connected", (info) => {
      console.log(`✅ Tunnel connection established. ID: ${info.connectionId}`);
    });

    this.tunnel.on("disconnected", () => {
      console.log("🔌 Tunnel disconnected. Reconnecting...");
    });

    this.tunnel.on("error", (err) => {
      console.error("🚨 Tunnel error:", err.message);
    });

    this.tunnel.on("execute_tool", async ({ toolName, args }) => {
      console.log(`📨 Executing tool: ${toolName}`);
      try {
        return await this.toolManager.executeTool(toolName, args);
      } catch (error: any) {
        throw new Error(error.message || "Internal tool error");
      }
    });

    this.tunnel.on("query", async ({ prompt }) => {
      console.log(`📨 Received query: ${prompt.substring(0, 50)}...`);
      const results: any[] = [];
      for await (const step of this.queryEngine.processQuery(prompt)) {
        results.push(step);
      }
      return results;
    });

    console.log("🌴 Starting Poke Tunnel...");
    await this.tunnel.start();
  }
}
