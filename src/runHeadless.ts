import { Agent, type AgentEvent } from "./agent/Agent";
import { buildSystemPrompt, createProvider, loadProjectContext } from "./agent";
import type { LlmProvider } from "./agent/provider";
import { agentTools } from "./tools";
import { formatToolCall, previewOutput } from "./ui/format";
import { palette } from "./ui/theme";

export type OutputFormat = "text" | "json";

export interface HeadlessOptions {
  /** Override the provider (used by tests); defaults to the env-resolved one. */
  provider?: LlmProvider;
  /** "text" streams to stdout; "json" prints one structured object at the end. */
  format?: OutputFormat;
  cwd?: string;
}

export interface HeadlessResult {
  result: string;
  isError: boolean;
  numTurns: number;
  provider: string;
  model: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * Run a single prompt to completion, à la `claude -p`.
 *
 * In "text" mode the model's prose streams to stdout (pipeable) while tool
 * activity goes to stderr. In "json" mode nothing is streamed; a single
 * structured `HeadlessResult` is printed to stdout at the end.
 */
export async function runHeadless(prompt: string, opts: HeadlessOptions = {}): Promise<HeadlessResult> {
  const provider = opts.provider ?? createProvider();
  const format = opts.format ?? "text";
  const cwd = opts.cwd ?? process.cwd();
  const context = loadProjectContext(cwd);
  if (context && format === "text")
    process.stderr.write(palette.dim(`(using ${context.filename} for context)`) + "\n");

  const agent = new Agent({ provider, tools: agentTools, system: buildSystemPrompt(cwd, context), cwd });

  const toolCalls: HeadlessResult["toolCalls"] = [];
  let result = "";
  let isError = false;
  let numTurns = 0;

  for await (const ev of agent.run(prompt)) {
    if (format === "text") streamText(ev);
    switch (ev.type) {
      case "tool_call":
        toolCalls.push({ name: ev.name, input: ev.input });
        break;
      case "turn_complete":
        result = ev.text;
        numTurns++;
        break;
      case "error":
        isError = true;
        break;
    }
  }

  const out: HeadlessResult = {
    result,
    isError,
    numTurns,
    provider: provider.name,
    model: provider.model,
    toolCalls,
  };

  if (format === "json") process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  if (isError) process.exitCode = 1;
  return out;
}

function streamText(ev: AgentEvent): void {
  switch (ev.type) {
    case "assistant_text":
      process.stdout.write(ev.text + "\n");
      break;
    case "tool_call":
      process.stderr.write(palette.info(`● ${formatToolCall(ev.name, ev.input)}`) + "\n");
      break;
    case "tool_result":
      process.stderr.write(palette.dim(previewOutput(ev.output, 3)) + "\n");
      break;
    case "tool_denied":
      process.stderr.write(palette.warn(`✗ skipped ${ev.name}`) + "\n");
      break;
    case "error":
      process.stderr.write(palette.err(`✗ ${ev.message}`) + "\n");
      break;
  }
}
