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
  private ws: any;
  private queryEngine: QueryEngine;
  private toolManager: ToolManager;

  constructor() {
    this.toolManager = new ToolManager();
    this.queryEngine = new QueryEngine(this.toolManager);
  }

  async connect(token: string) {
    const url = "wss://tunnel.poke.com/v1/connect";
    
    console.log(`🌴 Connecting to Poke Tunnel at ${url}...`);

    this.ws = Bun.serve({
      fetch(req, server) {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
      websocket: {
        open(ws) {
          console.log("✅ Tunnel connection established.");
        },
        async message(ws, message) {
          let request: JsonRpcRequest;
          try {
            request = JSON.parse(message.toString());
          } catch (e) {
            return;
          }

          console.log(`📨 Received request: ${request.method}`);

          let response: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: request.id,
          };

          try {
            const result = await this.handleRequest(request);
            response.result = result;
          } catch (error: any) {
            response.error = {
              code: -32603,
              message: error.message || "Internal error",
            };
          }

          ws.send(JSON.stringify(response));
        },
        close(ws) {
          console.log("❌ Tunnel connection closed.");
        },
      },
    });

    // In a real implementation with Bun.connect or similar WebSocket client:
    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    socket.onopen = () => {
      console.log("✅ WebSocket Authenticated & Connected.");
    };

    socket.onmessage = async (event) => {
      const request: JsonRpcRequest = JSON.parse(event.data.toString());
      const response = await this.processRequest(request);
      socket.send(JSON.stringify(response));
    };

    socket.onerror = (error) => {
      console.error("🚨 Tunnel error:", error);
    };

    socket.onclose = () => {
      console.log("🔌 Tunnel disconnected. Retrying in 5s...");
      setTimeout(() => this.connect(token), 5000);
    };
  }

  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: request.id };
    try {
      response.result = await this.handleRequest(request);
    } catch (e: any) {
      response.error = { code: -32603, message: e.message };
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
        // In a headless tunnel mode, we collect logs/outputs and return them
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
