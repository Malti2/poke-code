import { Poke, isLoggedIn } from "poke";
import { TunnelService, type TunnelEvent } from "./tunnel/TunnelService";
import type { ActivityEvent } from "./mcp/server";
import { pokeTools } from "./tools";
import { buildTaskMessage } from "./task";

/**
 * Orchestrates a poke-code session: it runs the MCP server + tunnel and hands
 * tasks to your Poke agent via `sendMessage`. The work then comes back as tool
 * calls over the tunnel (which we re-emit as `activity`), and Poke talks to the
 * user by calling `send_answer` (which we re-emit as `answer`).
 */

export type RunnerEvent =
  | { type: "status"; message: string }
  | { type: "connected"; connectionId: string }
  | { type: "tunnel"; event: TunnelEvent }
  | { type: "activity"; event: ActivityEvent }
  | { type: "answer"; message: string; final: boolean }
  | { type: "error"; message: string };

type Listener = (event: RunnerEvent) => void;

export interface RunnerOptions {
  cwd?: string;
  name?: string;
  token?: string;
  port?: number;
}

export class PokeCodeRunner {
  readonly cwd: string;
  private readonly poke: Poke;
  private readonly tunnel: TunnelService;
  private readonly listeners = new Set<Listener>();
  connectionId?: string;

  constructor(opts: RunnerOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    if (!opts.token && !process.env.POKE_API_KEY && !isLoggedIn())
      throw new Error("Not authenticated with Poke. Run `poke-code login` or set POKE_API_KEY.");

    this.poke = new Poke({ apiKey: opts.token });
    this.tunnel = new TunnelService({
      cwd: this.cwd,
      name: opts.name,
      token: opts.token,
      port: opts.port,
      tools: pokeTools,
      onActivity: (event) => this.handleActivity(event),
      onEvent: (event) => this.handleTunnelEvent(event),
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RunnerEvent) {
    for (const l of this.listeners) l(event);
  }

  private handleTunnelEvent(event: TunnelEvent) {
    if (event.kind === "connected") this.connectionId = event.connectionId;
    this.emit({ type: "tunnel", event });
    if (event.kind === "connected") this.emit({ type: "connected", connectionId: event.connectionId });
  }

  private handleActivity(event: ActivityEvent) {
    if (event.tool === "send_answer") {
      // Render the answer once (on the call), ignore the ack.
      if (event.phase === "start") {
        this.emit({
          type: "answer",
          message: String((event.input as any)?.message ?? ""),
          final: (event.input as any)?.final === true,
        });
      }
      return;
    }
    this.emit({ type: "activity", event });
  }

  /** Start the MCP server + tunnel and return once connected. */
  async start(): Promise<void> {
    await this.tunnel.connect();
  }

  /** Hand a task to Poke. The work arrives asynchronously as tool calls. */
  async sendTask(task: string): Promise<void> {
    this.emit({ type: "status", message: "Sending task to Poke…" });
    try {
      const res = await this.poke.sendMessage(buildTaskMessage(task, this.cwd));
      if (res?.message) this.emit({ type: "status", message: res.message });
    } catch (e) {
      this.emit({ type: "error", message: (e as Error).message });
    }
  }

  async stop(): Promise<void> {
    await this.tunnel.stop();
  }
}
