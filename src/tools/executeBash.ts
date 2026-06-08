import { spawn } from "bun";

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Safely executes a bash command using Bun.spawn.
 */
export async function executeBash(command: string): Promise<BashResult> {
  try {
    const process = spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();
    const exitCode = await process.exited;

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}
