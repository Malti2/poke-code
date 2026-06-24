#!/usr/bin/env bun
import { Command } from "commander";
import { login, logout, isLoggedIn } from "poke";
import { palette } from "./ui/theme";

const program = new Command();

program
  .name("poke-code")
  .version("0.1.0")
  .description("The electric terminal coding companion — an AI coding agent in your terminal.");

// ── Default: interactive agent, or headless with -p ────────────────────────
program
  .option("-p, --print <prompt>", "run a single prompt headlessly and print the result")
  .option("--no-confirm", "do not ask for confirmation before running mutating tools")
  .action(async (opts: { print?: string; confirm: boolean }) => {
    try {
      if (opts.print) {
        const { runHeadless } = await import("./runHeadless");
        await runHeadless(opts.print);
      } else {
        const { runInteractive } = await import("./ui/runInteractive");
        await runInteractive({ confirm: opts.confirm });
      }
    } catch (e) {
      console.error(palette.err((e as Error).message));
      process.exit(1);
    }
  });

// ── run: alias for headless prompt ─────────────────────────────────────────
program
  .command("run <prompt...>")
  .description("run a single prompt headlessly (same as -p)")
  .action(async (prompt: string[]) => {
    try {
      const { runHeadless } = await import("./runHeadless");
      await runHeadless(prompt.join(" "));
    } catch (e) {
      console.error(palette.err((e as Error).message));
      process.exit(1);
    }
  });

// ── tunnel: expose local tools to your Poke agent ──────────────────────────
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
      await service.connect();
    } catch (e) {
      console.error(palette.err(`Tunnel failed: ${(e as Error).message}`));
      process.exit(1);
    }
  });

// ── serve: run just the local MCP server ───────────────────────────────────
program
  .command("serve")
  .description("run the local MCP server only (point `poke tunnel <url>` at it, or debug)")
  .option("--port <port>", "port to listen on (default: random free port)", (v) => parseInt(v, 10))
  .action(async (opts: { port?: number }) => {
    const { McpServer } = await import("./mcp/server");
    const { allTools } = await import("./tools");
    const server = new McpServer({ tools: allTools, cwd: process.cwd(), name: "poke-code" });
    const { url } = server.listen(opts.port ?? 0);
    console.log(palette.brand(`poke-code MCP server listening at ${url}`));
    console.log(palette.dim(`${allTools.length} tools available. Press Ctrl+C to stop.`));
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
