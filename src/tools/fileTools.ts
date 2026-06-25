import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { dirname, resolve, relative, join } from "node:path";
import type { ToolDefinition, ToolContext } from "./types";

const MAX_READ_BYTES = 256 * 1024; // 256 KiB safety cap
const MAX_LINE_LENGTH = 2000;

function resolvePath(ctx: ToolContext, path: string): string {
  return resolve(ctx.cwd, path);
}

/** Render file content with `cat -n` style line numbers, like Claude Code's Read. */
function numberLines(content: string, startLine: number): string {
  const lines = content.split("\n");
  return lines
    .map((line, i) => {
      const truncated =
        line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + "… [truncated]" : line;
      const n = String(startLine + i).padStart(6, " ");
      return `${n}\t${truncated}`;
    })
    .join("\n");
}

export const readFileTool: ToolDefinition<{ path: string; offset?: number; limit?: number }> = {
  name: "read_file",
  description:
    "Read a text file from the local filesystem and return its contents with line numbers. " +
    "Use `offset` (1-based start line) and `limit` (number of lines) for large files.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (absolute or relative to cwd)." },
      offset: { type: "number", description: "1-based line number to start reading from." },
      limit: { type: "number", description: "Maximum number of lines to read." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async run({ path, offset, limit }, ctx) {
    const abs = resolvePath(ctx, path);
    const info = await stat(abs).catch(() => null);
    if (!info) return { output: `File not found: ${path}`, isError: true };
    if (info.isDirectory()) return { output: `${path} is a directory, not a file.`, isError: true };
    if (info.size > MAX_READ_BYTES) {
      return {
        output: `File is too large to read at once (${info.size} bytes). Use offset/limit to page through it.`,
        isError: true,
      };
    }

    const raw = await readFile(abs, "utf-8");
    if (raw.length === 0) return { output: "(file is empty)" };

    const allLines = raw.split("\n");
    const start = Math.max(1, offset ?? 1);
    const end = limit ? start - 1 + limit : allLines.length;
    const slice = allLines.slice(start - 1, end).join("\n");
    return { output: numberLines(slice, start) };
  },
};

export const writeFileTool: ToolDefinition<{ path: string; content: string }> = {
  name: "write_file",
  description:
    "Write content to a file, creating it (and any parent directories) if needed. " +
    "Overwrites the entire file — use edit_file for targeted changes.",
  mutating: true,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to write." },
      content: { type: "string", description: "Full content to write to the file." },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  async run({ path, content }, ctx) {
    const abs = resolvePath(ctx, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
    const lines = content.split("\n").length;
    return { output: `Wrote ${content.length} bytes (${lines} lines) to ${path}.` };
  },
};

export const editFileTool: ToolDefinition<{
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}> = {
  name: "edit_file",
  description:
    "Replace an exact string in a file. `old_string` must match the file content exactly " +
    "(including whitespace). Fails if `old_string` is missing or, unless `replace_all` is true, " +
    "appears more than once.",
  mutating: true,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to edit." },
      old_string: { type: "string", description: "Exact text to find and replace." },
      new_string: { type: "string", description: "Replacement text." },
      replace_all: { type: "boolean", description: "Replace every occurrence (default false)." },
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false,
  },
  async run({ path, old_string, new_string, replace_all }, ctx) {
    const abs = resolvePath(ctx, path);
    const info = await stat(abs).catch(() => null);
    if (!info) return { output: `File not found: ${path}`, isError: true };
    if (old_string === new_string)
      return { output: "old_string and new_string are identical; nothing to do.", isError: true };

    const content = await readFile(abs, "utf-8");
    const count = content.split(old_string).length - 1;
    if (count === 0)
      return { output: `old_string not found in ${path}. Read the file first.`, isError: true };
    if (count > 1 && !replace_all)
      return {
        output: `old_string appears ${count} times in ${path}. Provide a larger, unique snippet or set replace_all=true.`,
        isError: true,
      };

    const updated = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);
    await writeFile(abs, updated, "utf-8");
    return { output: `Edited ${path} (${replace_all ? count : 1} replacement(s)).` };
  },
};

export const listFilesTool: ToolDefinition<{ path?: string }> = {
  name: "list_files",
  description: "List the entries of a directory. Directories are suffixed with '/'.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path (defaults to cwd)." },
    },
    additionalProperties: false,
  },
  async run({ path }, ctx) {
    const abs = resolvePath(ctx, path ?? ".");
    const info = await stat(abs).catch(() => null);
    if (!info) return { output: `Directory not found: ${path ?? "."}`, isError: true };
    if (!info.isDirectory()) return { output: `${path} is not a directory.`, isError: true };

    const entries = await readdir(abs, { withFileTypes: true });
    if (entries.length === 0) return { output: "(empty directory)" };
    const rel = relative(ctx.cwd, abs) || ".";
    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return { output: `${rel}/\n` + lines.map((l) => `  ${l}`).join("\n") };
  },
};

export const fileTools = [readFileTool, writeFileTool, editFileTool, listFilesTool];
