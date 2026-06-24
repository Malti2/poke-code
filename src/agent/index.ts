import { AnthropicProvider } from "./providers/anthropic";
import { OpenAiProvider } from "./providers/openai";
import type { LlmProvider } from "./provider";

export * from "./provider";
export { Agent } from "./Agent";
export type { AgentEvent, Approver } from "./Agent";
export { buildSystemPrompt } from "./prompt";
export { loadProjectContext, CONTEXT_FILENAMES } from "./context";
export type { ProjectContext } from "./context";
export { AnthropicProvider } from "./providers/anthropic";
export { OpenAiProvider } from "./providers/openai";
export { MockProvider } from "./providers/mock";

/**
 * Resolve the LLM provider from the environment. Set POKE_CODE_PROVIDER to
 * force a choice; otherwise Anthropic wins if its key is present, then OpenAI.
 */
export function createProvider(): LlmProvider {
  const forced = process.env.POKE_CODE_PROVIDER?.toLowerCase();

  if (forced === "anthropic") {
    const p = AnthropicProvider.fromEnv();
    if (p) return p;
    throw new Error("POKE_CODE_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
  }
  if (forced === "openai") {
    const p = OpenAiProvider.fromEnv();
    if (p) return p;
    throw new Error("POKE_CODE_PROVIDER=openai but OPENAI_API_KEY is not set.");
  }

  const anthropic = AnthropicProvider.fromEnv();
  if (anthropic) return anthropic;
  const openai = OpenAiProvider.fromEnv();
  if (openai) return openai;

  throw new Error(
    "No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY (optionally with " +
      "ANTHROPIC_MODEL / OPENAI_MODEL / OPENAI_BASE_URL) to use the agent."
  );
}
