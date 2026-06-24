import { AnthropicProvider } from "./providers/anthropic";
import type { LlmProvider } from "./provider";

export * from "./provider";
export { Agent } from "./Agent";
export type { AgentEvent, Approver } from "./Agent";
export { buildSystemPrompt } from "./prompt";
export { AnthropicProvider } from "./providers/anthropic";
export { MockProvider } from "./providers/mock";

/**
 * Resolve the LLM provider from the environment. Today only Anthropic is
 * wired up; the abstraction makes adding more (OpenAI-compatible, local
 * models) a matter of adding another branch here.
 */
export function createProvider(): LlmProvider {
  const anthropic = AnthropicProvider.fromEnv();
  if (anthropic) return anthropic;
  throw new Error(
    "No LLM provider configured. Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) to use the interactive agent."
  );
}
