import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Like Claude Code's CLAUDE.md, poke-code reads a project context file from the
 * working directory and folds it into the system prompt. This is where a repo
 * records conventions, build commands, and gotchas the agent should know.
 *
 * The first existing file (in priority order) wins.
 */
export const CONTEXT_FILENAMES = ["POKE.md", "AGENTS.md", "CLAUDE.md", ".pokecode.md"];

const MAX_CONTEXT_BYTES = 32 * 1024;

export interface ProjectContext {
  filename: string;
  content: string;
}

/** Read the project context file from `cwd`, if one exists. */
export function loadProjectContext(cwd: string): ProjectContext | null {
  for (const filename of CONTEXT_FILENAMES) {
    const path = join(cwd, filename);
    if (!existsSync(path)) continue;
    try {
      let content = readFileSync(path, "utf-8").trim();
      if (!content) continue;
      if (content.length > MAX_CONTEXT_BYTES) {
        content = content.slice(0, MAX_CONTEXT_BYTES) + "\n… [context truncated]";
      }
      return { filename, content };
    } catch {
      // unreadable — try the next candidate
    }
  }
  return null;
}
