import { fileTools } from "./fileTools";
import { searchTools } from "./searchTools";
import { bashTool } from "./bashTool";
import type { ToolDefinition } from "./types";

export * from "./types";
export { fileTools } from "./fileTools";
export { searchTools } from "./searchTools";
export { bashTool } from "./bashTool";

/** The default set of coding tools exposed by poke-code. */
export const allTools: ToolDefinition[] = [...fileTools, ...searchTools, bashTool];

export function findTool(name: string): ToolDefinition | undefined {
  return allTools.find((t) => t.name === name);
}
