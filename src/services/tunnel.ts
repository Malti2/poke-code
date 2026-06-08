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
    if (passedToken) {
      this.saveConfig({ token: passedToken });
      return passedToken;
    }

    const config = this.loadConfig();
    if (config.token) {
      return config.token;
    }

    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        this.saveConfig({ token });
        return token;
      }
    }

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

    // Start a local HTTP server to satisfy the PokeTunnel's MCP requirements
    const server = Bun.serve({
      port: 0, // Use any available port
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404 });

        if (req.method === "POST") {
          try {
            const body = await req.json();
            const { method, params, id } = body;

            let result: any;

            switch (method) {
              case "list_tools":
                // Standard MCP tool discovery
                result = {
                  tools: [
                    { name: "read_file", description: "Read content from a file" },
                    { name: "write_file", description: "Write content to a file" },
                    { name: "list_files", description: "List files in a directory" },
                    { name: "search_files", description: "Search for files by pattern" },
                    { name: "execute_bash", description: "Execute a bash command" }
                  ]
                };
                break;

              case "call_tool":
                console.log(`📨 Executing tool: ${params.name}`);
                result = await this.toolManager.executeTool(params.name, params.arguments);
                break;

              case "query":
                console.log(`📨 Received query: ${params.prompt.substring(0, 50)}...`);
                const queryResults: any[] = [];
                for await (const step of this.queryEngine.processQuery(params.prompt)) {
                  queryResults.push(step);
                }
                result = queryResults;
                break;

              default:
                return new Response(JSON.stringify({
                  jsonrpc: "2.0",
                  id,
                  error: { code: -32601, message: "Method not found" }
                }), { headers: { "Content-Type": "application/json" } });
            }

            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              id,
              result
            }), { headers: { "Content-Type": "application/json" } });

          } catch (e: any) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: e.message }
            }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        return new Response("Method Not Allowed", { status: 405 });
      }
    });

    const localUrl = `http://127.0.0.1:${server.port}/mcp`;
    console.log(`📡 Local MCP server listening at ${localUrl}`);

    this.tunnel = new PokeTunnel({
      url: localUrl,
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

    console.log("🌴 Starting Poke Tunnel...");
    await this.tunnel.start();
  }
}
