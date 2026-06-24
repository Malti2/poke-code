import type {
  LlmProvider,
  CompletionRequest,
  CompletionResponse,
  AssistantBlock,
} from "../provider";

/**
 * Talks to the Anthropic Messages API. Our internal message shapes already
 * match Anthropic's, so this provider is mostly a thin HTTP wrapper.
 *
 * Configure via environment:
 *   ANTHROPIC_API_KEY   (required)
 *   ANTHROPIC_MODEL     (optional, default below)
 *   ANTHROPIC_BASE_URL  (optional, for proxies / compatible gateways)
 */

const DEFAULT_MODEL = "claude-sonnet-4-5";
const API_VERSION = "2023-06-01";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;

  constructor(opts: { apiKey: string; model?: string; baseUrl?: string; maxTokens?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.baseUrl =
      opts.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
    this.maxTokens = opts.maxTokens ?? 8192;
  }

  static fromEnv(): AnthropicProvider | null {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return new AnthropicProvider({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: req.system,
      messages: req.messages,
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    };

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 500)}`);
    }

    const json: any = await res.json();
    const content: AssistantBlock[] = (json.content ?? [])
      .map((block: any): AssistantBlock | null => {
        if (block.type === "text") return { type: "text", text: block.text };
        if (block.type === "tool_use")
          return { type: "tool_use", id: block.id, name: block.name, input: block.input ?? {} };
        return null;
      })
      .filter((b: AssistantBlock | null): b is AssistantBlock => b !== null);

    return { content, stopReason: json.stop_reason ?? "end_turn" };
  }
}
