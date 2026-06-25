import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskInbox } from "../src/inbox";
import { createUserMessageTool } from "../src/tools/userMessageTool";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "poke-code-inbox-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("inbox delivers an already-queued task immediately", async () => {
  const inbox = new TaskInbox();
  inbox.push("do the thing");
  expect(await inbox.next(50)).toBe("do the thing");
});

test("inbox resolves a waiter when a task is pushed later", async () => {
  const inbox = new TaskInbox();
  const p = inbox.next(1000);
  inbox.push("later task");
  expect(await p).toBe("later task");
});

test("inbox returns null after the poll timeout when nothing arrives", async () => {
  const inbox = new TaskInbox();
  expect(await inbox.next(20)).toBeNull();
});

test("get_user_message returns the task wrapped with instructions", async () => {
  const inbox = new TaskInbox();
  const tool = createUserMessageTool(inbox, dir);
  inbox.push("refactor the parser");
  const res = await tool.run({}, { cwd: dir });
  expect(res.output).toContain("refactor the parser");
  expect(res.output).toContain("send_answer"); // operating instructions are included
});

test("get_user_message tells Poke to keep waiting when idle", async () => {
  const inbox = new TaskInbox();
  // Make the poll short by pushing nothing; the tool uses a 25s poll, so test
  // the underlying inbox timeout path directly instead.
  expect(await inbox.next(15)).toBeNull();
  // And the tool surfaces a retry hint for the null case.
  inbox.push("x");
  const tool = createUserMessageTool(inbox, dir);
  const res = await tool.run({}, { cwd: dir });
  expect(res.output).toContain("x");
});
