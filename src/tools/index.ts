import { fileTools } from "./fileTools";
import { searchTools } from "./searchTools";
import { bashTool } from "./bashTool";
import { updatePlanTool } from "./planTool";
import type { ToolDefinition } from "./types";

export * from "./types";
export { fileTools } from "./fileTools";
export { searchTools } from "./searchTools";
export { bashTool } from "./bashTool";
export { updatePlanTool, renderPlan } from "./planTool";

/**
 * Coding tools exposed to external MCP clients (i.e. Poke over the tunnel).
 * Planning lives on the client's side there, so it is not included here.
 */
export const allTools: ToolDefinition[] = [...fileTools, ...searchTools, bashTool];

/** Tools for the local agent loop: the coding tools plus a planning tool. */
export const agentTools: ToolDefinition[] = [...allTools, updatePlanTool];

export function findTool(name: string): ToolDefinition | undefined {
  return agentTools.find((t) => t.name === name);
}
