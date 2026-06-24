import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
} from "../src/tools/fileTools";
import { globTool, grepTool } from "../src/tools/searchTools";
import { bashTool } from "../src/tools/bashTool";
import type { ToolContext } from "../src/tools/types";

let dir: string;
let ctx: ToolContext;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-test-"));
  ctx = { cwd: dir };
  writeFileSync(join(dir, "hello.txt"), "line one\nline two\nline three\n");
  writeFileSync(join(dir, "code.ts"), "export const answer = 42;\nconsole.log(answer);\n");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("read_file returns numbered lines", async () => {
  const res = await readFileTool.run({ path: "hello.txt" }, ctx);
  expect(res.isError).toBeFalsy();
  expect(res.output).toContain("1\tline one");
  expect(res.output).toContain("3\tline three");
});

test("read_file honours offset and limit", async () => {
  const res = await readFileTool.run({ path: "hello.txt", offset: 2, limit: 1 }, ctx);
  expect(res.output).toContain("2\tline two");
  expect(res.output).not.toContain("line three");
});

test("read_file reports missing files", async () => {
  const res = await readFileTool.run({ path: "nope.txt" }, ctx);
  expect(res.isError).toBe(true);
});

test("write_file creates nested files", async () => {
  const res = await writeFileTool.run({ path: "nested/new.txt", content: "hi\n" }, ctx);
  expect(res.isError).toBeFalsy();
  expect(readFileSync(join(dir, "nested/new.txt"), "utf-8")).toBe("hi\n");
});

test("edit_file replaces a unique string", async () => {
  await writeFileTool.run({ path: "edit.txt", content: "alpha beta gamma" }, ctx);
  const res = await editFileTool.run(
    { path: "edit.txt", old_string: "beta", new_string: "BETA" },
    ctx
  );
  expect(res.isError).toBeFalsy();
  expect(readFileSync(join(dir, "edit.txt"), "utf-8")).toBe("alpha BETA gamma");
});

test("edit_file refuses ambiguous matches without replace_all", async () => {
  await writeFileTool.run({ path: "dup.txt", content: "x x x" }, ctx);
  const res = await editFileTool.run({ path: "dup.txt", old_string: "x", new_string: "y" }, ctx);
  expect(res.isError).toBe(true);
  const ok = await editFileTool.run(
    { path: "dup.txt", old_string: "x", new_string: "y", replace_all: true },
    ctx
  );
  expect(ok.isError).toBeFalsy();
  expect(readFileSync(join(dir, "dup.txt"), "utf-8")).toBe("y y y");
});

test("list_files lists directory entries", async () => {
  const res = await listFilesTool.run({ path: "." }, ctx);
  expect(res.output).toContain("hello.txt");
  expect(res.output).toContain("nested/");
});

test("glob finds files by pattern", async () => {
  const res = await globTool.run({ pattern: "**/*.ts" }, ctx);
  expect(res.output).toContain("code.ts");
});

test("grep finds matching lines", async () => {
  const res = await grepTool.run({ pattern: "answer", glob: "**/*.ts" }, ctx);
  expect(res.output).toContain("code.ts:1");
});

test("execute_bash runs commands in cwd", async () => {
  const res = await bashTool.run({ command: "echo hello && pwd" }, ctx);
  expect(res.output).toContain("hello");
  expect(res.output).toContain(dir);
  expect(res.output).toContain("[exit code: 0]");
});

test("execute_bash reports non-zero exit", async () => {
  const res = await bashTool.run({ command: "exit 3" }, ctx);
  expect(res.isError).toBe(true);
  expect(res.output).toContain("[exit code: 3]");
});
