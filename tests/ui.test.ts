import { test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../src/ui/App";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for PokeCodeRunner that lets the test drive events. */
class FakeRunner {
  cwd = "/tmp/project";
  connectionId?: string;
  sent: string[] = [];
  private listeners = new Set<(e: any) => void>();
  on(l: (e: any) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(e: any) {
    for (const l of this.listeners) l(e);
  }
  async start() {
    this.connectionId = "abc123";
    this.emit({ type: "connected", connectionId: "abc123" });
  }
  submitTask(t: string) {
    this.sent.push(t);
  }
  async stop() {}
}

test("App renders the banner and connects", async () => {
  const runner = new FakeRunner();
  const { lastFrame, unmount } = render(
    React.createElement(App, { runner: runner as any, cwd: runner.cwd })
  );
  await delay(30);
  const frame = lastFrame() ?? "";
  expect(frame).toContain("poke · /tmp/project");
  expect(frame).toContain("Connected to Poke (id abc123)");
  unmount();
});

test("submitting a task forwards it to the runner and shows answers", async () => {
  const runner = new FakeRunner();
  const { lastFrame, stdin, unmount } = render(
    React.createElement(App, { runner: runner as any, cwd: runner.cwd })
  );
  await delay(30); // let it connect

  stdin.write("refactor the parser");
  await delay(20);
  stdin.write("\r");
  await delay(20);

  expect(runner.sent).toContain("refactor the parser");
  expect(lastFrame()).toContain("refactor the parser");

  // Poke streams a tool call and a final answer.
  runner.emit({ type: "activity", event: { phase: "start", tool: "read_file", input: { path: "p.ts" } } });
  runner.emit({ type: "answer", message: "Refactored the parser.", final: true });
  await delay(30);

  const frame = lastFrame() ?? "";
  expect(frame).toContain("read_file");
  expect(frame).toContain("Refactored the parser.");
  unmount();
});
