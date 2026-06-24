import type {
  LlmProvider,
  CompletionRequest,
  CompletionResponse,
  AssistantBlock,
  Message,
} from "../provider";

/**
 * Talks to any OpenAI Chat Completions compatible endpoint. This covers
 * OpenAI itself and local servers (Ollama, LM Studio, vLLM, …), which makes
 * poke-code usable without an Anthropic key.
 *
 * Configure via environment:
 *   OPENAI_API_KEY   (required; any non-empty value for local servers)
 *   OPENAI_MODEL     (optional, default below)
 *   OPENAI_BASE_URL  (optional, e.g. http://localhost:11434/v1 for Ollama)
 */

const DEFAULT_MODEL = "gpt-4o";

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

/** Translate our internal (Anthropic-shaped) messages into OpenAI's format. */
export function toOpenAiMessages(system: string, messages: Message[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        out.push({ role: "user", content: msg.content });
        continue;
      }
      // An array mixes plain text and tool results. Tool results become
      // dedicated `tool` messages; free text becomes a user message.
      const texts: string[] = [];
      for (const block of msg.content) {
        if (block.type === "text") texts.push(block.text);
        else if (block.type === "tool_result")
          out.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: block.is_error ? `ERROR: ${block.content}` : block.content,
          });
      }
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
    } else {
      // assistant: text + tool_use blocks
      const text = msg.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const toolCalls = msg.content
        .filter(
          (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
            b.type === "tool_use"
        )
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    }
  }
  return out;
}

/** Build the request body sent to /chat/completions. */
export function buildOpenAiBody(model: string, req: CompletionRequest, maxTokens: number) {
  return {
    model,
    max_tokens: maxTokens,
    messages: toOpenAiMessages(req.system, req.messages),
    tools: req.tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    })),
    tool_choice: "auto" as const,
  };
}

/** Translate an OpenAI response back into our internal blocks. */
export function parseOpenAiResponse(json: any): CompletionResponse {
  const choice = json?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const content: AssistantBlock[] = [];

  if (message.content) content.push({ type: "text", text: String(message.content) });
  for (const call of message.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: call.id, name: call.function?.name, input });
  }

  return { content, stopReason: choice.finish_reason ?? "stop" };
}

export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;

  constructor(opts: { apiKey: string; model?: string; baseUrl?: string; maxTokens?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
    this.maxTokens = opts.maxTokens ?? 8192;
  }

  static fromEnv(): OpenAiProvider | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAiProvider({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(buildOpenAiBody(this.model, req, this.maxTokens)),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${detail.slice(0, 500)}`);
    }
    return parseOpenAiResponse(await res.json());
  }
}
