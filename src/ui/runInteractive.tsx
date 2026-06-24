import React from "react";
import { render } from "ink";
import { App } from "./App";
import { agentTools } from "../tools";
import { createProvider, loadProjectContext } from "../agent";
import { SessionStore, type Session } from "../agent/session";

/** Launch the interactive terminal agent. Requires a TTY. */
export async function runInteractive(opts: {
  confirm: boolean;
  continueSession?: boolean;
}): Promise<void> {
  const provider = createProvider(); // throws with a helpful message if unconfigured
  const cwd = process.cwd();
  const context = loadProjectContext(cwd);

  const store = new SessionStore();
  let session: Session | null = opts.continueSession ? store.loadLatest(cwd) : null;

  const { waitUntilExit } = render(
    <App
      provider={provider}
      tools={agentTools}
      cwd={cwd}
      confirm={opts.confirm}
      context={context}
      initialMessages={session?.messages}
      onPersist={(messages) => {
        session = session ?? store.newSession(cwd, provider.name, provider.model);
        session.messages = messages;
        store.save(session);
      }}
    />
  );
  await waitUntilExit();
}
