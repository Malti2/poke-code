import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { TunnelService } from "./services/tunnel";
import { AgentSession, DEFAULT_REPLY_TIMEOUT_MS } from "./agent/session";
import { PokeClient } from "./poke/client";
import { App } from "./tui/App";
import {
  getConfigValue,
  loadConfig,
  permissionModeOf,
  redactConfig,
  setConfigValue,
} from "./config";

const program = new Command();

program
  .name("poke-code")
  .version("0.1.0")
  .description("Terminal coding assistant powered by Poke")
  .option("-p, --print <query>", "Non-interactive: send one query, print the answer, exit");

program
  .command("tunnel")
  .description("Start the Poke tunnel standalone (exposes local tools to Poke)")
  .argument("[token]", "Authentication token (falls back to POKE_API_KEY / config / login)")
  .action(async (token: string | undefined) => {
    const tunnel = new TunnelService();
    // Non-interactive: approve tool calls automatically, but say so loudly.
    tunnel.setPermissionHandler(async ({ tool }) => {
      console.error(`[tunnel] auto-allowing ${tool.name} (non-interactive mode)`);
      return "allow";
    });
    await tunnel.connect(token);
    console.log("Tunnel connected. Press Ctrl+C to stop.");
    await new Promise(() => {});
  });

const configCmd = program.command("config").description("Manage poke-code configuration");

configCmd
  .command("set <key> <value>")
  .description("Set a config value (keys: apiKey, baseUrl, permissionMode)")
  .action((key: string, value: string) => {
    try {
      setConfigValue(key, value);
      console.log(`Set ${key}.`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

configCmd
  .command("get <key>")
  .description("Get a config value")
  .action((key: string) => {
    try {
      const v = getConfigValue(key);
      console.log(v ?? "");
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

configCmd
  .command("list")
  .description("List config values (apiKey is redacted)")
  .action(() => {
    const cfg = redactConfig(loadConfig());
    for (const [k, v] of Object.entries(cfg)) {
      console.log(`${k}=${v}`);
    }
  });

program.action(async () => {
  const opts = program.opts<{ print?: string }>();

  if (opts.print) {
    await runPrint(opts.print);
    return;
  }

  // TUI mode: require a key up front (env or config). The login device flow
  // prints to the console, which would corrupt the Ink UI, so we guide the
  // user to set the key first instead.
  const client = new PokeClient();
  if (!client.hasApiKey()) {
    console.error("No Poke API key found.");
    console.error("");
    console.error("Get a V2 API key at https://poke.com/kitchen/api-keys, then run:");
    console.error("  poke-code config set apiKey <your-key>");
    console.error("or export POKE_API_KEY=<your-key>");
    process.exit(1);
  }
  render(<App />);
});

async function runPrint(query: string): Promise<void> {
  const tunnel = new TunnelService();
  const mode = permissionModeOf(loadConfig());
  tunnel.setPermissionHandler(async ({ tool }) => {
    if (mode === "readonly") {
      console.error(`[print] denying ${tool.name} (readonly mode)`);
      return "deny";
    }
    console.error(`[print] auto-allowing ${tool.name} (non-interactive --print)`);
    return "allow";
  });
  tunnel.onToolEvent((ev) => {
    if (ev.type === "tool-start") {
      console.error(`[tool] ${ev.name} …`);
    } else {
      console.error(`[tool] ${ev.name} ${ev.isError ? "✗" : "✓"} (${((ev.ms ?? 0) / 1000).toFixed(1)}s)`);
    }
  });

  const session = new AgentSession(tunnel, new PokeClient());
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  try {
    const answer = await session.ask(query, {
      signal: controller.signal,
      timeoutMs: DEFAULT_REPLY_TIMEOUT_MS,
    });
    console.log(answer);
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  } finally {
    await tunnel.stop();
  }
}

program.parseAsync(process.argv);
