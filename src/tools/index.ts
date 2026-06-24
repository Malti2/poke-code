import { fileTools } from "./fileTools";
import { searchTools } from "./searchTools";
import { bashTool } from "./bashTool";
import { updatePlanTool } from "./planTool";
import { commsTools } from "./commsTools";
import type { ToolDefinition } from "./types";

export * from "./types";
export { fileTools } from "./fileTools";
export { searchTools } from "./searchTools";
export { bashTool } from "./bashTool";
export { updatePlanTool, renderPlan } from "./planTool";
export { commsTools, sendAnswerTool, rememberTool } from "./commsTools";

/** The file/shell tools Poke uses to actually code. */
export const codingTools: ToolDefinition[] = [...fileTools, ...searchTools, bashTool];

/**
 * The full toolset exposed to Poke over the MCP tunnel: the coding tools, a
 * planning tool, and the communication tools (send_answer, remember).
 */
export const pokeTools: ToolDefinition[] = [...codingTools, updatePlanTool, ...commsTools];

export function findTool(name: string): ToolDefinition | undefined {
  return pokeTools.find((t) => t.name === name);
}
