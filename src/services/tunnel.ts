import { PokeTunnel } from "poke";
import { ToolManager } from "../tools/ToolManager";
import { QueryEngine } from "../QueryEngine";

export class TunnelService {
  private queryEngine: QueryEngine;
  private toolManager: ToolManager;
  private tunnel?: PokeTunnel;

  constructor() {
    this.toolManager = new ToolManager();
    this.queryEngine = new QueryEngine(this.toolManager);
  }

  /**
   * Cleans up any potentially stale connections for this user before starting a new one.
   * This ensures we don't hit limits or have ghost connections on the server.
   */
  private async cleanupStaleConnections(token: string) {
    const apiBase = "https://poke.com/api/v1";
    console.log("🧹 Cleaning up stale tunnel connections...");
    
    try {
      // First, fetch active connections to find ones matching our client name
      const response = await fetch(`${apiBase}/mcp/connections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      const connections = data.connections || [];
      
      for (const conn of connections) {
        // If we found a connection that seems to be from a previous run of 'poke-code'
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

  async connect(token: string) {
    // 1. Cleanup old connections
    await this.cleanupStaleConnections(token);

    // 2. Initialize the official Poke SDK Tunnel
    // The PokeTunnel requires a 'url' parameter. Since poke-code runs the agent
    // logic in-process, we use a special 'local://' URL which tells the SDK
    // to handle communication internally via event listeners rather than
    // proxying to an external HTTP server.
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
      console.log("🔌 Tunnel disconnected.");
    });

    this.tunnel.on("error", (err) => {
      console.error("🚨 Tunnel error:", err.message);
    });

    // Handle incoming tool executions via the tunnel
    this.tunnel.on("execute_tool", async ({ toolName, args }) => {
      console.log(`📨 Executing tool: ${toolName}`);
      try {
        const result = await this.toolManager.executeTool(toolName, args);
        return result;
      } catch (error: any) {
        throw new Error(error.message || "Internal tool error");
      }
    });

    // Handle incoming queries via the tunnel
    this.tunnel.on("query", async ({ prompt }) => {
      console.log(`📨 Received query: ${prompt.substring(0, 50)}...`);
      const results: any[] = [];
      // Note: processQuery was identified as the iterator method in earlier steps
      for await (const step of this.queryEngine.processQuery(prompt)) {
        results.push(step);
      }
      return results;
    });

    console.log("🌴 Starting Poke Tunnel...");
    await this.tunnel.start();
  }
}
