import { Poke, isLoggedIn } from "poke";
import type {
  LlmProvider,
  CompletionRequest,
  CompletionResponse,
  AssistantBlock,
  Message,
} from "../provider";

/**
 * Uses your Poke agent (poke.com) as the brain of the coding loop instead of a
 * raw LLM API.
 *
 * The catch: the Poke SDK only offers `sendMessage(text) -> { message }`, a
 * single plain-text reply. It has no native tool-calling. So we render the
 * whole agent state (system prompt, tools, transcript) into one message and
 * ask Poke to answer in a strict JSON "tool protocol", which we parse back into
 * the structured tool calls the agent loop expects.
 *
 * Auth is handled by the SDK: `poke login` credentials or POKE_API_KEY.
 */

const PROTOCOL = `You are the decision-making engine of a terminal coding agent. Work ONLY through the tools listed below; do not claim to have done something you did not do via a tool.

Reply with EXACTLY ONE JSON object and nothing else (no prose, no markdown fences). Use one of these two shapes:

1. To run one or more tools:
{"tool_calls": [{"name": "<tool name>", "input": { ...arguments... }}]}

2. To give your final answer to the user (only when the task is complete or no tool is needed):
{"response": "<your message to the user>"}

Rules:
- Inspect the transcript: tool results are already included, so do not repeat a call you have already made.
- Prefer the smallest set of tool calls needed for the next step.
- "input" must match the tool's JSON schema.`;

/** Render the agent state into a single prompt string. Pure, for testing. */
export function buildPokePrompt(req: CompletionRequest): string {
  const tools = req.tools
    .map((t) => `- ${t.name}: ${t.description}\n  schema: ${JSON.stringify(t.inputSchema)}`)
    .join("\n");

  const transcript = req.messages.map(renderMessage).join("\n");

  return `${req.system}

${PROTOCOL}

# Available tools
${tools}

# Conversation so far
${transcript}

# Your turn
Respond with a single JSON object per the protocol above.`;
}

function renderMessage(msg: Message): string {
  if (msg.role === "user") {
    if (typeof msg.content === "string") return `USER: ${msg.content}`;
    const parts: string[] = [];
    for (const block of msg.content) {
      if (block.type === "text") parts.push(`USER: ${block.text}`);
      else if (block.type === "tool_result")
        parts.push(
          `TOOL RESULT (${block.tool_use_id})${block.is_error ? " [error]" : ""}: ${block.content}`
        );
    }
    return parts.join("\n");
  }
  // assistant
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") parts.push(`ASSISTANT: ${block.text}`);
    else if (block.type === "tool_use")
      parts.push(`ASSISTANT called ${block.name}(${JSON.stringify(block.input)}) [${block.id}]`);
  }
  return parts.join("\n");
}

let toolCallSeq = 0;

/** Parse Poke's text reply into structured content. Pure, for testing. */
export function parsePokeResponse(text: string): CompletionResponse {
  const json = extractJson(text);

  if (json && Array.isArray(json.tool_calls) && json.tool_calls.length > 0) {
    const content: AssistantBlock[] = [];
    if (typeof json.thoughts === "string" && json.thoughts.trim())
      content.push({ type: "text", text: json.thoughts.trim() });
    for (const call of json.tool_calls) {
      if (!call || typeof call.name !== "string") continue;
      content.push({
        type: "tool_use",
        id: `poke_${Date.now().toString(36)}_${toolCallSeq++}`,
        name: call.name,
        input: call.input && typeof call.input === "object" ? call.input : {},
      });
    }
    if (content.some((b) => b.type === "tool_use"))
      return { content, stopReason: "tool_use" };
  }

  if (json && typeof json.response === "string")
    return { content: [{ type: "text", text: json.response }], stopReason: "end_turn" };

  // Fallback: Poke replied in prose — treat the whole thing as the final answer.
  return { content: [{ type: "text", text: text.trim() }], stopReason: "end_turn" };
}

/** Best-effort extraction of the first JSON object in a string. */
function extractJson(text: string): any | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

export class PokeProvider implements LlmProvider {
  readonly name = "poke";
  readonly model: string;
  private readonly client: Poke;

  constructor(opts: { apiKey?: string; baseUrl?: string; model?: string } = {}) {
    this.client = new Poke({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });
    this.model = opts.model ?? process.env.POKE_MODEL ?? "poke-agent";
  }

  static fromEnv(): PokeProvider {
    if (!process.env.POKE_API_KEY && !isLoggedIn())
      throw new Error("Not authenticated with Poke. Run `poke-code login` or set POKE_API_KEY.");
    return new PokeProvider();
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const { message } = await this.client.sendMessage(buildPokePrompt(req));
    if (typeof message !== "string")
      throw new Error("Poke returned no message. The agent may be replying asynchronously.");
    return parsePokeResponse(message);
  }
}
