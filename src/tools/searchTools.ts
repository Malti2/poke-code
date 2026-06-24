import { Glob } from "bun";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import type { ToolDefinition, ToolContext } from "./types";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
]);
const MAX_RESULTS = 200;

function isIgnored(relPath: string): boolean {
  return relPath.split("/").some((seg) => IGNORE_DIRS.has(seg));
}

async function collectFiles(root: string, pattern: string): Promise<string[]> {
  const glob = new Glob(pattern);
  const out: string[] = [];
  for await (const file of glob.scan({ cwd: root, dot: false, onlyFiles: true })) {
    if (isIgnored(file)) continue;
    out.push(file);
    if (out.length >= MAX_RESULTS * 5) break; // hard ceiling before filtering
  }
  return out;
}

export const globTool: ToolDefinition<{ pattern: string; path?: string }> = {
  name: "glob",
  description:
    "Find files by glob pattern (e.g. '**/*.ts', 'src/**/*.tsx'). Returns matching paths sorted " +
    "by most recently modified first. Ignores node_modules, .git, dist, etc.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern to match file paths against." },
      path: { type: "string", description: "Directory to search in (defaults to cwd)." },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  async run({ pattern, path }, ctx) {
    const root = resolve(ctx.cwd, path ?? ".");
    const files = await collectFiles(root, pattern);
    if (files.length === 0) return { output: `No files match '${pattern}'.` };

    const withTimes = await Promise.all(
      files.map(async (f) => {
        const s = await stat(resolve(root, f)).catch(() => null);
        return { f, mtime: s?.mtimeMs ?? 0 };
      })
    );
    withTimes.sort((a, b) => b.mtime - a.mtime);
    const shown = withTimes.slice(0, MAX_RESULTS).map((x) => x.f);
    const suffix =
      withTimes.length > MAX_RESULTS ? `\n… and ${withTimes.length - MAX_RESULTS} more` : "";
    return { output: shown.join("\n") + suffix };
  },
};

export const grepTool: ToolDefinition<{
  pattern: string;
  path?: string;
  glob?: string;
  ignore_case?: boolean;
}> = {
  name: "grep",
  description:
    "Search file contents with a regular expression. Returns matching lines as 'path:line: text'. " +
    "Optionally restrict the files searched with a `glob` (default '**/*').",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for." },
      path: { type: "string", description: "Directory to search in (defaults to cwd)." },
      glob: { type: "string", description: "Glob to restrict files (default '**/*')." },
      ignore_case: { type: "boolean", description: "Case-insensitive match (default false)." },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  async run({ pattern, path, glob, ignore_case }, ctx) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, ignore_case ? "i" : undefined);
    } catch (e) {
      return { output: `Invalid regex: ${(e as Error).message}`, isError: true };
    }

    const root = resolve(ctx.cwd, path ?? ".");
    const files = await collectFiles(root, glob ?? "**/*");
    const matches: string[] = [];

    for (const f of files) {
      const abs = resolve(root, f);
      const info = await stat(abs).catch(() => null);
      if (!info || info.size > 1024 * 1024) continue; // skip >1MiB
      let text: string;
      try {
        text = await readFile(abs, "utf-8");
      } catch {
        continue; // unreadable / binary
      }
      if (text.includes("\u0000")) continue; // binary heuristic
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const rel = relative(ctx.cwd, abs);
          matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
          if (matches.length >= MAX_RESULTS) break;
        }
      }
      if (matches.length >= MAX_RESULTS) break;
    }

    if (matches.length === 0) return { output: `No matches for /${pattern}/.` };
    const suffix = matches.length >= MAX_RESULTS ? `\n… (results capped at ${MAX_RESULTS})` : "";
    return { output: matches.join("\n") + suffix };
  },
};

export const searchTools = [globTool, grepTool];
