import WebSocket from "ws";
import { ToolManager } from "../tools/ToolManager";
import { QueryEngine } from "../QueryEngine";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class TunnelService {
  private queryEngine: QueryEngine;
  private toolManager: ToolManager;

  constructor() {
    this.toolManager = new ToolManager();
    this.queryEngine = new QueryEngine(this.toolManager);
  }

  async connect(token: string) {
    const url = "wss://tunnel.poke.com/v1/connect";
    
    console.log(`🌴 Connecting to Poke Tunnel at ${url}...`);

    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    socket.on("open", () => {
      console.log("✅ Tunnel connection established and authenticated.");
    });

    socket.on("message", async (data) => {
      try {
        const request: JsonRpcRequest = JSON.parse(data.toString());
        console.log(`📨 Received request: ${request.method}`);
        const response = await this.processRequest(request);
        socket.send(JSON.stringify(response));
      } catch (e) {
        console.error("🚨 Error processing message:", e);
      }
    });

    socket.on("error", (error) => {
      console.error("🚨 Tunnel error:", error);
    });

    socket.on("close", () => {
      console.log("🔌 Tunnel disconnected. Retrying in 5s...");
      setTimeout(() => this.connect(token), 5000);
    });
  }

  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: request.id };
    try {
      response.result = await this.handleRequest(request);
    } catch (e: any) {
      response.error = { code: -32603, message: e.message || "Internal error" };
    }
    return response;
  }

  private async handleRequest(request: JsonRpcRequest): Promise<any> {
    switch (request.method) {
      case "execute_tool":
        const { toolName, args } = request.params;
        return await this.toolManager.executeTool(toolName, args);
      case "query":
        const { prompt } = request.params;
        const results: any[] = [];
        for await (const step of this.queryEngine.process(prompt)) {
          results.push(step);
        }
        return results;
      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }
}
