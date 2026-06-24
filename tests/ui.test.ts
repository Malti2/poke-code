import { test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../src/ui/App";
import { MockProvider } from "../src/agent/providers/mock";
import { allTools } from "../src/tools";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("App renders the banner and prompt", () => {
  const provider = new MockProvider([
    { content: [{ type: "text", text: "hi" }], stopReason: "end_turn" },
  ]);
  const { lastFrame, unmount } = render(
    React.createElement(App, { provider, tools: allTools, cwd: process.cwd(), confirm: false })
  );
  const frame = lastFrame() ?? "";
  expect(frame).toContain("by Interaction Company");
  expect(frame).toContain("❯");
  unmount();
});

test("submitting a prompt renders the assistant reply", async () => {
  const provider = new MockProvider([
    { content: [{ type: "text", text: "Hello from poke-code!" }], stopReason: "end_turn" },
  ]);
  const { lastFrame, stdin, unmount } = render(
    React.createElement(App, { provider, tools: allTools, cwd: process.cwd(), confirm: false })
  );

  stdin.write("say hi");
  await delay(20);
  stdin.write("\r"); // Enter
  await delay(80);

  const frame = lastFrame() ?? "";
  expect(frame).toContain("say hi");
  expect(frame).toContain("Hello from poke-code!");
  unmount();
});
