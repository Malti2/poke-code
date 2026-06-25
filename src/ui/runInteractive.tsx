import React from "react";
import { render } from "ink";
import { App } from "./App";
import { PokeCodeRunner } from "../runner";
import { loadProjectContext } from "../context";
import { loadMemory } from "../memory";

/** Launch the interactive terminal. Requires a TTY. */
export async function runInteractive(opts: { name?: string } = {}): Promise<void> {
  const cwd = process.cwd();
  const runner = new PokeCodeRunner({ cwd, name: opts.name }); // throws if not authenticated
  const context = loadProjectContext(cwd);
  const hasMemory = loadMemory(cwd) !== null;

  const { waitUntilExit } = render(
    <App runner={runner} cwd={cwd} contextFile={context?.filename ?? null} hasMemory={hasMemory} />
  );
  await waitUntilExit();
  await runner.stop();
}
