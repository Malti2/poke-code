#!/usr/bin/env bun
import { Command } from "commander";
import { login, logout, isLoggedIn } from "poke";
import { palette } from "./ui/theme";

const program = new Command();

program
  .name("poke-code")
  .version("0.1.0")
  .description("Your Poke agent, coding in your terminal — everything runs through the Poke tunnel.");

// ── Default: interactive task loop, or headless with -p ────────────────────
program
  .option("-p, --print <task>", "run a single task headlessly and stream the result")
  .option("--output-format <format>", "headless output format: text or json", "text")
  .option("-n, --name <name>", "connection name shown in Poke", "poke-code")
  .action(async (opts: { print?: string; outputFormat?: string; name?: string }) => {
    try {
      if (opts.print) {
        const { runTask } = await import("./runTask");
        await runTask(opts.print, {
          format: opts.outputFormat === "json" ? "json" : "text",
          name: opts.name,
        });
        process.exit(0);
      } else {
        const { runInteractive } = await import("./ui/runInteractive");
        await runInteractive({ name: opts.name });
      }
    } catch (e) {
      console.error(palette.err((e as Error).message));
      process.exit(1);
    }
  });

// ── run: alias for headless task ───────────────────────────────────────────
program
  .command("run <task...>")
  .description("run a single task headlessly (same as -p)")
  .option("--output-format <format>", "output format: text or json", "text")
  .option("-n, --name <name>", "connection name shown in Poke", "poke-code")
  .action(async (task: string[], opts: { outputFormat?: string; name?: string }) => {
    try {
      const { runTask } = await import("./runTask");
      await runTask(task.join(" "), {
        format: opts.outputFormat === "json" ? "json" : "text",
        name: opts.name,
      });
      process.exit(0);
    } catch (e) {
      console.error(palette.err((e as Error).message));
      process.exit(1);
    }
  });

// ── tunnel: expose tools to Poke without the task loop ─────────────────────
program
  .command("tunnel")
  .description("expose poke-code's tools to your Poke agent over a secure tunnel")
  .option("-n, --name <name>", "display name shown in Poke", "poke-code")
  .option("--port <port>", "local MCP server port (default: random free port)", (v) => parseInt(v, 10))
  .argument("[token]", "explicit Poke token (otherwise uses login / POKE_API_KEY)")
  .action(async (token: string | undefined, opts: { name: string; port?: number }) => {
    try {
      const { TunnelService } = await import("./tunnel/TunnelService");
      const service = new TunnelService({ name: opts.name, token, port: opts.port });
      const shutdown = async () => {
        await service.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      await service.connect();
      console.log(palette.dim("Tools available to your Poke agent. Press Ctrl+C to stop."));
    } catch (e) {
      console.error(palette.err(`Tunnel failed: ${(e as Error).message}`));
      process.exit(1);
    }
  });

// ── serve: run just the local MCP server ───────────────────────────────────
program
  .command("serve")
  .description("run the local MCP server only (for debugging)")
  .option("--port <port>", "port to listen on (default: random free port)", (v) => parseInt(v, 10))
  .action(async (opts: { port?: number }) => {
    const { McpServer } = await import("./mcp/server");
    const { pokeTools } = await import("./tools");
    const server = new McpServer({ tools: pokeTools, cwd: process.cwd(), name: "poke-code" });
    const { url } = server.listen(opts.port ?? 0);
    console.log(palette.brand(`poke-code MCP server listening at ${url}`));
    console.log(palette.dim(`${pokeTools.length} tools available. Press Ctrl+C to stop.`));
    process.on("SIGINT", () => {
      server.stop();
      process.exit(0);
    });
  });

// ── auth helpers ───────────────────────────────────────────────────────────
program
  .command("login")
  .description("authenticate with Poke")
  .action(async () => {
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.log(`\nOpen ${palette.info(loginUrl)} and enter code ${palette.brand(userCode)}\n`);
      },
    });
    console.log(palette.ok("Logged in."));
  });

program
  .command("logout")
  .description("clear stored Poke credentials")
  .action(async () => {
    await logout();
    console.log(palette.ok("Logged out."));
  });

program
  .command("whoami")
  .description("show whether you are authenticated with Poke")
  .action(() => {
    console.log(isLoggedIn() ? palette.ok("Logged in to Poke.") : palette.warn("Not logged in."));
  });

program.parseAsync(process.argv);
