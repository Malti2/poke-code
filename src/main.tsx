import { Command } from "commander";
import { TunnelService } from "./services/tunnel";

const program = new Command();

program
  .name("poke-code")
  .version("0.1.0")
  .description("The sleekest AI code agent for your terminal");

program
  .command("tunnel")
  .description("Connect to the Poke tunnel for remote orchestration")
  .argument("[token]", "Authentication token for tunnel.poke.com")
  .action(async (token: string | undefined) => {
    console.log("🌴 Connecting to Poke tunnel...");
    const service = new TunnelService();
    await service.connect(token);
  });

program.parse(process.argv);
