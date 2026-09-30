import { bashTool } from "./bash";
import { editTool } from "./edit";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { listTool } from "./list";
import { readTool } from "./read";
import { createReplyTool } from "./reply";
import { createTodoTools, TodoStore } from "./todo";
import { webfetchTool } from "./webfetch";
import { writeTool } from "./write";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";

export interface ToolManagerOptions {
  todoStore?: TodoStore;
  /** Called when Poke invokes `reply_to_terminal` with its answer. */
  onReplyToTerminal?: (answer: string) => void;
}

/**
 * Single source of truth for the local tool registry.
 * The tunnel advertises these tools to Poke and executes them locally.
 */
export class ToolManager {
  private readonly tools = new Map<string, ToolDefinition>();
  readonly todoStore: TodoStore;

  constructor(opts: ToolManagerOptions = {}) {
    this.todoStore = opts.todoStore ?? new TodoStore();
    const defs: ToolDefinition[] = [
      readTool,
      writeTool,
      editTool,
      listTool,
      globTool,
      grepTool,
      bashTool,
      webfetchTool,
      ...createTodoTools(this.todoStore),
    ];
    if (opts.onReplyToTerminal) {
      defs.push(createReplyTool(opts.onReplyToTerminal));
    }
    for (const d of defs) this.tools.set(d.name, d);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: `Error: unknown tool "${name}".`, isError: true };
    }
    try {
      return await tool.handler(args, ctx);
    } catch (e) {
      return { output: `Error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }

  /**
   * Execute a tool in the current working directory and return its output.
   * Used by the Poke tunnel service for incoming tool calls.
   */
  async executeTool(toolName: string, args: unknown): Promise<string> {
    const safeArgs =
      typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
    const result = await this.execute(toolName, safeArgs, { cwd: process.cwd() });
    return result.output;
  }
}
