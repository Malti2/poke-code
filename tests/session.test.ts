import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/agent/session";
import { runHeadless } from "../src/runHeadless";
import { MockProvider } from "../src/agent/providers/mock";
import type { CompletionResponse } from "../src/agent/provider";

let sessionDir: string;
let workDir: string;

beforeEach(() => {
  sessionDir = mkdtempSync(join(tmpdir(), "poke-code-sessions-"));
  workDir = mkdtempSync(join(tmpdir(), "poke-code-work-"));
});
afterEach(() => {
  rmSync(sessionDir, { recursive: true, force: true });
  rmSync(workDir, { recursive: true, force: true });
});

test("loadLatest returns null when there are no sessions", () => {
  const store = new SessionStore(sessionDir);
  expect(store.loadLatest("/anywhere")).toBeNull();
});

test("save then loadLatest round-trips by cwd", () => {
  const store = new SessionStore(sessionDir);
  const s = store.newSession("/repo/a", "mock", "mock-1");
  s.messages = [{ role: "user", content: "hello" }];
  store.save(s);

  const loaded = store.loadLatest("/repo/a");
  expect(loaded?.messages[0]).toEqual({ role: "user", content: "hello" });
  // different cwd should not match
  expect(store.loadLatest("/repo/b")).toBeNull();
});

test("loadLatest picks the most recently updated session", () => {
  const store = new SessionStore(sessionDir);
  const fs = require("node:fs");

  // Write an older session by hand with a past timestamp.
  const older = store.newSession("/repo", "mock", "mock-1");
  fs.writeFileSync(
    join(sessionDir, `${older.id}.json`),
    JSON.stringify({
      ...older,
      updatedAt: "2020-01-01T00:00:00.000Z",
      messages: [{ role: "user", content: "old" }],
    })
  );

  // Save a newer one (save() stamps updatedAt to now).
  const newer = store.newSession("/repo", "mock", "mock-1");
  newer.messages = [{ role: "user", content: "new" }];
  store.save(newer);

  expect(store.loadLatest("/repo")?.messages[0]).toEqual({ role: "user", content: "new" });
});

test("runHeadless persists, and --continue resumes the prior conversation", async () => {
  const store = new SessionStore(sessionDir);

  // First run establishes a session.
  const first: CompletionResponse[] = [
    { content: [{ type: "text", text: "Hi, I'm here." }], stopReason: "end_turn" },
  ];
  await runHeadless("remember the number 7", {
    provider: new MockProvider(first),
    format: "json",
    cwd: workDir,
    store,
  });

  // Second run continues; the provider should see the prior messages.
  const resumeProvider = new MockProvider([
    { content: [{ type: "text", text: "It was 7." }], stopReason: "end_turn" },
  ]);
  await runHeadless("what number?", {
    provider: resumeProvider,
    format: "json",
    cwd: workDir,
    store,
    continueSession: true,
  });

  const seen = resumeProvider.requests[0].messages.map((m) =>
    typeof m.content === "string" ? m.content : ""
  );
  expect(seen).toContain("remember the number 7");
  expect(seen).toContain("what number?");
});

test("captures and persists session JSON on disk", async () => {
  const store = new SessionStore(sessionDir);
  await runHeadless("hello", {
    provider: new MockProvider([{ content: [{ type: "text", text: "hey" }], stopReason: "end_turn" }]),
    format: "json",
    cwd: workDir,
    store,
  });
  const loaded = store.loadLatest(workDir);
  expect(loaded).not.toBeNull();
  expect(loaded!.messages.length).toBeGreaterThan(0);
  // sanity: file is valid JSON
  const file = join(sessionDir, `${loaded!.id}.json`);
  expect(() => JSON.parse(readFileSync(file, "utf-8"))).not.toThrow();
});
