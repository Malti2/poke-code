import { fileTools } from "./fileTools";
import { executeBash } from "./executeBash";

export class ToolManager {
  private tools: Map<string, any> = new Map();

  constructor() {
    this.registerTools();
  }

  private registerTools() {
    // Register File Tools
    this.tools.set("read_file", { run: (args: { path: string }) => fileTools.read(args.path) });
    this.tools.set("write_file", { run: (args: { path: string; content: string }) => fileTools.write(args.path, args.content) });
    this.tools.set("list_files", { run: (args: { path?: string }) => fileTools.list(args.path) });
    this.tools.set("search_files", { run: (args: { query: string; root?: string }) => fileTools.search(args.query, args.root) });
    
    // Register Shell Tools
    this.tools.set("execute_bash", { run: (args: { command: string }) => executeBash(args.command) });
  }

  async executeTool(toolName: string, args: any) {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found`);
    return await tool.run(args);
  }
}
