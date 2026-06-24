import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { CONFIG_DIR } from "./config";

/**
 * Durable, per-project memory. Poke writes notes here (via the `remember`
 * tool) and they are folded into the task message on future runs, so the agent
 * remembers decisions and facts across sessions.
 *
 * Memory lives under the config dir (keyed by a hash of the working directory)
 * rather than inside the repo, so it never clutters the user's project.
 */

const MAX_MEMORY_BYTES = 16 * 1024;

function memoryDir(): string {
  return join(process.env.POKE_CODE_CONFIG_DIR ?? CONFIG_DIR, "memory");
}

function memoryPath(cwd: string): string {
  const key = createHash("sha1").update(cwd).digest("hex").slice(0, 16);
  return join(memoryDir(), `${key}.md`);
}

export function loadMemory(cwd: string): string | null {
  const path = memoryPath(cwd);
  if (!existsSync(path)) return null;
  try {
    let content = readFileSync(path, "utf-8").trim();
    if (!content) return null;
    if (content.length > MAX_MEMORY_BYTES)
      content = content.slice(content.length - MAX_MEMORY_BYTES); // keep the most recent
    return content;
  } catch {
    return null;
  }
}

export function appendMemory(cwd: string, note: string): void {
  const trimmed = note.trim();
  if (!trimmed) return;
  const path = memoryPath(cwd);
  mkdirSync(memoryDir(), { recursive: true });
  const line = `- [${new Date().toISOString().slice(0, 10)}] ${trimmed.replace(/\n+/g, " ")}\n`;
  appendFileSync(path, line, "utf-8");
}
