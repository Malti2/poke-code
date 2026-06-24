/**
 * Provider abstraction for the agent's "brain".
 *
 * The message/content-block shapes intentionally mirror the Anthropic Messages
 * API, because that maps cleanly onto a tool-using agent loop. Other providers
 * (OpenAI-compatible, a local model, a deterministic mock for tests) just have
 * to translate to and from these shapes.
 */

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AssistantBlock = TextBlock | ToolUseBlock;

export type Message =
  | { role: "user"; content: string | Array<TextBlock | ToolResultBlock> }
  | { role: "assistant"; content: AssistantBlock[] };

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: object;
}

export interface CompletionRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
}

export interface CompletionResponse {
  content: AssistantBlock[];
  stopReason: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
