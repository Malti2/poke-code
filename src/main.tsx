import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "./components/App";
import { TunnelService } from "./services/tunnel";

const program = new Command();

program
  .name("poke-code")
  .version("0.1.0")
  .description("The sleekest AI code agent for your terminal");

program
  .command("chat")
  .description("Start an interactive chat session")
  .action(() => {
    render(<App />);
  });

program
  .command("tunnel")
  .description("Connect to the Poke tunnel for remote orchestration")
  .argument("<token>", "Authentication token for tunnel.poke.com")
  .action(async (token: string) => {
    console.log("🌴 Connecting to Poke tunnel...");
    const tunnel = new TunnelService(token);
    await tunnel.connect();
  });

program.parse();
