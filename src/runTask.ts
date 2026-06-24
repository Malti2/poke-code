import { PokeCodeRunner } from "./runner";
import { formatToolCall, previewOutput } from "./ui/format";
import { palette } from "./ui/theme";

export type OutputFormat = "text" | "json";

export interface RunTaskOptions {
  format?: OutputFormat;
  cwd?: string;
  name?: string;
}

/**
 * Headless: hand one task to Poke and stream what comes back over the tunnel,
 * finishing when Poke calls send_answer with final=true (or on Ctrl+C).
 *
 * In "text" mode, Poke's answers go to stdout and tool activity to stderr. In
 * "json" mode a single structured object is printed at the end.
 */
export async function runTask(task: string, opts: RunTaskOptions = {}): Promise<void> {
  const format = opts.format ?? "text";
  const runner = new PokeCodeRunner({ cwd: opts.cwd, name: opts.name });

  const answers: Array<{ message: string; final: boolean }> = [];
  const toolCalls: Array<{ tool: string; input: Record<string, unknown> }> = [];
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  runner.on((e) => {
    switch (e.type) {
      case "tunnel":
        if (format === "text" && e.event.kind === "info")
          process.stderr.write(palette.dim(e.event.message) + "\n");
        break;
      case "connected":
        if (format === "text")
          process.stderr.write(palette.ok(`Connected to Poke (id ${e.connectionId}).`) + "\n");
        break;
      case "status":
        if (format === "text") process.stderr.write(palette.dim(e.message) + "\n");
        break;
      case "activity":
        if (e.event.phase === "start") {
          toolCalls.push({ tool: e.event.tool, input: e.event.input });
          if (format === "text")
            process.stderr.write(palette.info(`● ${formatToolCall(e.event.tool, e.event.input)}`) + "\n");
        } else if (format === "text") {
          process.stderr.write(palette.dim(previewOutput(e.event.output, 3)) + "\n");
        }
        break;
      case "answer":
        answers.push({ message: e.message, final: e.final });
        if (format === "text") process.stdout.write(e.message + "\n");
        if (e.final) resolveDone();
        break;
      case "error":
        if (format === "text") process.stderr.write(palette.err(`✗ ${e.message}`) + "\n");
        break;
    }
  });

  await runner.start();
  await runner.sendTask(task);

  const onSig = () => resolveDone();
  process.once("SIGINT", onSig);
  await done;
  process.off("SIGINT", onSig);
  await runner.stop();

  if (format === "json")
    process.stdout.write(
      JSON.stringify({ connectionId: runner.connectionId, answers, toolCalls }, null, 2) + "\n"
    );
}
