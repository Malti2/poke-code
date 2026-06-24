import React from "react";
import { render } from "ink";
import { App } from "./App";
import { agentTools } from "../tools";
import { createProvider, loadProjectContext } from "../agent";

/** Launch the interactive terminal agent. Requires a TTY. */
export async function runInteractive(opts: { confirm: boolean }): Promise<void> {
  const provider = createProvider(); // throws with a helpful message if unconfigured
  const cwd = process.cwd();
  const context = loadProjectContext(cwd);
  const { waitUntilExit } = render(
    <App
      provider={provider}
      tools={agentTools}
      cwd={cwd}
      confirm={opts.confirm}
      context={context}
    />
  );
  await waitUntilExit();
}
