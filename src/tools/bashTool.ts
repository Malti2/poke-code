import type { ToolDefinition } from "./types";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 30_000;

function clip(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const head = text.slice(0, MAX_OUTPUT_CHARS);
  return `${head}\n… [output truncated, ${text.length - MAX_OUTPUT_CHARS} more chars]`;
}

export const bashTool: ToolDefinition<{ command: string; timeout_ms?: number }> = {
  name: "execute_bash",
  description:
    "Run a shell command with `bash -c` and return its combined stdout/stderr and exit code. " +
    "Commands run in the current working directory. Long-running commands are killed after the timeout.",
  mutating: true,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute." },
      timeout_ms: {
        type: "number",
        description: `Timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  async run({ command, timeout_ms }, ctx) {
    const timeout = Math.min(timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: ctx.cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const timer = setTimeout(() => proc.kill(), timeout);
    let timedOut = false;
    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      clearTimeout(timer);
      if (proc.killed && exitCode !== 0) timedOut = exitCode === 143 || exitCode === 137;

      const parts: string[] = [];
      if (stdout.trim()) parts.push(stdout.trimEnd());
      if (stderr.trim()) parts.push(`[stderr]\n${stderr.trimEnd()}`);
      if (timedOut) parts.push(`[killed after ${timeout}ms timeout]`);
      parts.push(`[exit code: ${exitCode}]`);

      return { output: clip(parts.join("\n")), isError: exitCode !== 0 };
    } catch (error) {
      clearTimeout(timer);
      return { output: `Failed to run command: ${(error as Error).message}`, isError: true };
    }
  },
};
