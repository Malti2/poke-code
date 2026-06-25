import { isLoggedIn } from "poke";
import { TunnelService, type TunnelEvent } from "./tunnel/TunnelService";
import type { ActivityEvent } from "./mcp/server";
import { pokeTools } from "./tools";
import { createUserMessageTool } from "./tools/userMessageTool";
import { TaskInbox } from "./inbox";

/**
 * Orchestrates a poke-code session. It runs the MCP server + tunnel and nothing
 * else: the user's tasks flow to Poke when Poke calls the `get_user_message`
 * tool over the tunnel, and Poke talks back by calling `send_answer`. There is
 * no outbound message API and no separate API key — just the tunnel.
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
  private readonly tunnel: TunnelService;
  private readonly inbox = new TaskInbox();
  private readonly listeners = new Set<Listener>();
  connectionId?: string;

  constructor(opts: RunnerOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    // The only credential needed is the one the tunnel uses (poke login token
    // or POKE_API_KEY). No separate outbound-message key.
    if (!opts.token && !process.env.POKE_API_KEY && !isLoggedIn())
      throw new Error("Not authenticated with Poke. Run `poke-code login` first.");

    const tools = [...pokeTools, createUserMessageTool(this.inbox, this.cwd)];
    this.tunnel = new TunnelService({
      cwd: this.cwd,
      name: opts.name,
      token: opts.token,
      port: opts.port,
      tools,
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
      if (event.phase === "start")
        this.emit({
          type: "answer",
          message: String((event.input as any)?.message ?? ""),
          final: (event.input as any)?.final === true,
        });
      return;
    }
    if (event.tool === "get_user_message") {
      // Poll plumbing — only surface the moment Poke actually takes a task.
      if (event.phase === "end" && !event.output.startsWith("No new request"))
        this.emit({ type: "status", message: "Poke picked up your task." });
      return;
    }
    this.emit({ type: "activity", event });
  }

  /** Start the MCP server + tunnel and return once connected. */
  async start(): Promise<void> {
    await this.tunnel.connect();
  }

  /** Queue a task; Poke picks it up via get_user_message over the tunnel. */
  submitTask(task: string): void {
    this.inbox.push(task);
  }

  async stop(): Promise<void> {
    await this.tunnel.stop();
  }
}
