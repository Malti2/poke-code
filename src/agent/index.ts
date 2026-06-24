import { PokeProvider } from "./providers/poke";
import type { LlmProvider } from "./provider";

export * from "./provider";
export { Agent } from "./Agent";
export type { AgentEvent, Approver } from "./Agent";
export { buildSystemPrompt } from "./prompt";
export { loadProjectContext, CONTEXT_FILENAMES } from "./context";
export type { ProjectContext } from "./context";
export { SessionStore } from "./session";
export type { Session } from "./session";
export { PokeProvider } from "./providers/poke";
export { MockProvider } from "./providers/mock";

/**
 * The agent's brain is your Poke agent (poke.com). Authentication is handled by
 * the Poke SDK via `poke-code login` or the POKE_API_KEY environment variable.
 */
export function createProvider(): LlmProvider {
  return PokeProvider.fromEnv();
}
