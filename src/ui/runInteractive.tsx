import React from "react";
import { render } from "ink";
import { App } from "./App";
import { allTools } from "../tools";
import { createProvider } from "../agent";

/** Launch the interactive terminal agent. Requires a TTY. */
export async function runInteractive(opts: { confirm: boolean }): Promise<void> {
  const provider = createProvider(); // throws with a helpful message if unconfigured
  const { waitUntilExit } = render(
    <App provider={provider} tools={allTools} cwd={process.cwd()} confirm={opts.confirm} />
  );
  await waitUntilExit();
}
