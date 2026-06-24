import type { LlmProvider, CompletionRequest, CompletionResponse } from "../provider";

/**
 * A deterministic provider for tests and offline demos. You drive it with a
 * scripted list of responses (or a function), so the agent loop can be
 * exercised end-to-end without any network or API key.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock-1";
  readonly requests: CompletionRequest[] = [];
  private script: (req: CompletionRequest, turn: number) => CompletionResponse;
  private turn = 0;

  constructor(
    script:
      | CompletionResponse[]
      | ((req: CompletionRequest, turn: number) => CompletionResponse)
  ) {
    this.script = Array.isArray(script)
      ? (_req, turn) =>
          script[turn] ?? { content: [{ type: "text", text: "(no more script)" }], stopReason: "end_turn" }
      : script;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Snapshot the request so `requests` reflects the conversation as it was at
    // call time (the agent keeps mutating its live `messages` array afterwards).
    this.requests.push(structuredClone(req));
    return this.script(req, this.turn++);
  }
}
