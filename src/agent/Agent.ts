import type { LlmProvider, Message, ToolResultBlock } from "./provider";
import type { ToolDefinition, ToolContext } from "../tools/types";

/** Events streamed out of the agent loop so a UI can render progress live. */
export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; output: string; isError: boolean }
  | { type: "tool_denied"; id: string; name: string }
  | { type: "turn_complete"; text: string }
  | { type: "error"; message: string };

/** Asked before a mutating tool runs. Return false to skip it. */
export type Approver = (call: {
  name: string;
  input: Record<string, unknown>;
}) => Promise<boolean> | boolean;

export interface AgentOptions {
  provider: LlmProvider;
  tools: ToolDefinition[];
  system: string;
  cwd: string;
  maxSteps?: number;
  approver?: Approver;
}

export class Agent {
  private readonly provider: LlmProvider;
  private readonly tools: ToolDefinition[];
  private readonly system: string;
  private readonly ctx: ToolContext;
  private readonly maxSteps: number;
  private readonly approver?: Approver;
  /** Full conversation, preserved across turns so the agent has memory. */
  readonly messages: Message[] = [];

  constructor(opts: AgentOptions) {
    this.provider = opts.provider;
    this.tools = opts.tools;
    this.system = opts.system;
    this.ctx = { cwd: opts.cwd };
    this.maxSteps = opts.maxSteps ?? 25;
    this.approver = opts.approver;
  }

  private toolSpecs() {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Run one user turn to completion. The agent may call tools multiple times;
   * each call/result is yielded so the caller can render it. The turn ends
   * when the model stops requesting tools (or the step budget is exhausted).
   */
  async *run(userInput: string): AsyncGenerator<AgentEvent> {
    this.messages.push({ role: "user", content: userInput });

    for (let step = 0; step < this.maxSteps; step++) {
      let response;
      try {
        response = await this.provider.complete({
          system: this.system,
          messages: this.messages,
          tools: this.toolSpecs(),
        });
      } catch (e) {
        yield { type: "error", message: (e as Error).message };
        return;
      }

      this.messages.push({ role: "assistant", content: response.content });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) yield { type: "assistant_text", text };

      const toolUses = response.content.filter(
        (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
          b.type === "tool_use"
      );

      if (toolUses.length === 0) {
        yield { type: "turn_complete", text };
        return;
      }

      // Execute each requested tool and feed the results back to the model.
      const results: ToolResultBlock[] = [];
      for (const call of toolUses) {
        yield { type: "tool_call", id: call.id, name: call.name, input: call.input };

        const tool = this.tools.find((t) => t.name === call.name);
        if (!tool) {
          results.push({
            tool_use_id: call.id,
            type: "tool_result",
            content: `Unknown tool: ${call.name}`,
            is_error: true,
          });
          yield {
            type: "tool_result",
            id: call.id,
            name: call.name,
            output: `Unknown tool: ${call.name}`,
            isError: true,
          };
          continue;
        }

        if (tool.mutating && this.approver) {
          const ok = await this.approver({ name: call.name, input: call.input });
          if (!ok) {
            results.push({
              tool_use_id: call.id,
              type: "tool_result",
              content: "The user denied permission to run this tool.",
              is_error: true,
            });
            yield { type: "tool_denied", id: call.id, name: call.name };
            continue;
          }
        }

        let output: string;
        let isError: boolean;
        try {
          const result = await tool.run(call.input, this.ctx);
          output = result.output;
          isError = result.isError ?? false;
        } catch (e) {
          output = `Tool threw: ${(e as Error).message}`;
          isError = true;
        }

        results.push({
          tool_use_id: call.id,
          type: "tool_result",
          content: output,
          is_error: isError,
        });
        yield { type: "tool_result", id: call.id, name: call.name, output, isError };
      }

      this.messages.push({ role: "user", content: results });
    }

    yield {
      type: "error",
      message: `Reached the ${this.maxSteps}-step limit without completing the task.`,
    };
  }
}
