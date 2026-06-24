/**
 * Shared tool layer.
 *
 * A `ToolDefinition` is the single source of truth for a capability that
 * `poke-code` can perform. The exact same definitions are exposed two ways:
 *
 *   1. To a local LLM agent loop (see `src/agent/Agent.ts`), and
 *   2. To the Poke cloud agent via the MCP server (see `src/mcp/server.ts`).
 *
 * Because the JSON schema and handler live together, both consumers stay in
 * sync automatically.
 */

/** A minimal JSON-Schema object describing a tool's arguments. */
export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Execution context handed to every tool. */
export interface ToolContext {
  /** Directory that relative paths are resolved against. */
  cwd: string;
}

/** Result of running a tool. `output` is always a human/LLM readable string. */
export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface ToolDefinition<Args = Record<string, any>> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /**
   * Whether the tool can change the world (write files, run commands). The
   * interactive UI asks for confirmation before running mutating tools.
   */
  mutating?: boolean;
  run(args: Args, ctx: ToolContext): Promise<ToolResult>;
}
