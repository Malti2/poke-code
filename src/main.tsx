import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { App } from "./components/App";
import { TunnelService } from "./services/tunnel.ts";

const program = new Command();

program
  .name("poke-code")
  .description("The sleekest AI code agent for your terminal")
  .version("0.1.0");

program
  .command("chat")
  .description("Start an interactive chat session")
  .action(() => {
    render(<App />);
  });

program
  .command("tunnel")
  .description("Connect poke-code to the Poke cloud tunnel")
  .argument("<token>", "Your Poke auth token")
  .action(async (token) => {
    const tunnel = new TunnelService();
    await tunnel.connect(token);
  });

program.parse();
