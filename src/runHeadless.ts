import { Agent } from "./agent/Agent";
import { buildSystemPrompt, createProvider, loadProjectContext } from "./agent";
import { allTools } from "./tools";
import { formatToolCall, previewOutput } from "./ui/format";
import { palette } from "./ui/theme";

/**
 * Run a single prompt to completion and print the result, à la `claude -p`.
 * The model's prose goes to stdout (so it can be piped); tool activity goes to
 * stderr so it doesn't pollute the piped output.
 */
export async function runHeadless(prompt: string): Promise<string> {
  const provider = createProvider();
  const cwd = process.cwd();
  const context = loadProjectContext(cwd);
  if (context) process.stderr.write(palette.dim(`(using ${context.filename} for context)`) + "\n");

  const agent = new Agent({
    provider,
    tools: allTools,
    system: buildSystemPrompt(cwd, context),
    cwd,
  });

  let finalText = "";
  for await (const ev of agent.run(prompt)) {
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
      case "turn_complete":
        finalText = ev.text;
        break;
      case "error":
        process.stderr.write(palette.err(`✗ ${ev.message}`) + "\n");
        process.exitCode = 1;
        break;
    }
  }
  return finalText;
}
