import { getToken, isLoggedIn, login } from "poke";
import { baseUrlOf, loadConfig, saveConfig, type PokeCodeConfig } from "../config";

/**
 * Every outbound message is prefixed with this instruction so Poke's
 * assistant knows the user sits at a terminal: it must not reply via
 * iMessage/SMS/Telegram and must deliver its answer through the
 * `reply_to_terminal` tool instead.
 */
export const TERMINAL_INSTRUCTION = [
  "User is in a terminal-only session.",
  "Do NOT reply via iMessage/SMS/Telegram.",
  "Write NOTHING in the chat message (leave it empty).",
  "Your ONLY action is to call the `reply_to_terminal` tool with your full answer.",
].join(" ");

export function buildTerminalMessage(prompt: string): string {
  return `${TERMINAL_INSTRUCTION}\n\n${prompt}`;
}

export class PokeError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "server" | "aborted" | "timeout" | "unknown",
  ) {
    super(message);
    this.name = "PokeError";
  }
}

export interface SendMessageResult {
  success: boolean;
  message: string;
}

/** Minimal contract AgentSession needs: deliver a message, get a confirmation. */
export interface MessageSender {
  sendMessage(text: string, opts?: { timeoutMs?: number }): Promise<SendMessageResult>;
}

/**
 * Thin client around Poke's inbound API.
 * `sendMessage` only confirms delivery ({success, message}) — the actual
 * answer arrives later via the `reply_to_terminal` tool call on the tunnel.
 */
export class PokeClient implements MessageSender {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(cfg: PokeCodeConfig = loadConfig()) {
    this.baseUrl = baseUrlOf(cfg);
  }

  /**
   * Resolve the V2 API key: 1) POKE_API_KEY env, 2) config file,
   * 3) interactive login() device flow (console-based; not for the TUI).
   */
  async resolveApiKey(): Promise<string> {
    if (process.env.POKE_API_KEY) {
      this.apiKey = process.env.POKE_API_KEY;
      return this.apiKey;
    }
    const cfg = loadConfig();
    if (cfg.apiKey) {
      this.apiKey = cfg.apiKey;
      return this.apiKey;
    }
    if (isLoggedIn()) {
      const token = getToken();
      if (token) {
        this.apiKey = token;
        return token;
      }
    }
    // Device flow: prints a code + URL, waits for the user on the web.
    await login({
      openBrowser: true,
      onCode: ({ userCode, loginUrl }) => {
        console.error("\n================ POKE AUTHENTICATION ================");
        console.error(`  1. Go to: ${loginUrl}`);
        console.error(`  2. Enter code: ${userCode}`);
        console.error("=====================================================\n");
      },
    });
    const token = getToken();
    if (!token) throw new PokeError("Login completed but no token was found.", "auth");
    const updated = loadConfig();
    saveConfig({ ...updated, apiKey: token });
    this.apiKey = token;
    return token;
  }

  /** Synchronous check (env + config only, no login flow). */
  hasApiKey(): boolean {
    if (process.env.POKE_API_KEY) return true;
    return Boolean(loadConfig().apiKey);
  }

  /** POST the message; resolves with the delivery confirmation. */
  async sendMessage(text: string, opts: { timeoutMs?: number } = {}): Promise<SendMessageResult> {
    const apiKey = this.apiKey ?? (await this.resolveApiKey());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/inbound/api-message`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new PokeError("sendMessage timed out.", "timeout");
      }
      throw new PokeError(
        `Network error sending message: ${e instanceof Error ? e.message : String(e)}`,
        "network",
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new PokeError(
        `Poke authentication failed (${res.status}). Check your V2 API key — get one at https://poke.com/kitchen/api-keys, then run \`poke-code config set apiKey <key>\`.`,
        "auth",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new PokeError(`Poke API error (${res.status}): ${body.slice(0, 200)}`, "server");
    }

    const data = (await res.json().catch(() => ({}))) as Partial<SendMessageResult>;
    return { success: data.success ?? true, message: data.message ?? "" };
  }
}
