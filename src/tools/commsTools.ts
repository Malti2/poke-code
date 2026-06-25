import type { ToolDefinition } from "./types";
import { appendMemory } from "../memory";

/**
 * Communication tools that Poke calls over the tunnel to talk to the user's
 * terminal. They have no LLM behind them — poke-code surfaces them in the UI.
 */

export const sendAnswerTool: ToolDefinition<{ message: string; final?: boolean }> = {
  name: "send_answer",
  description:
    "Show a message to the user in their poke-code terminal. This is the ONLY way the user sees " +
    "your output — use it to narrate progress and to deliver the result. Set final=true when the " +
    "task is complete.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", description: "The text to show the user." },
      final: { type: "boolean", description: "True when this is the final answer for the task." },
    },
    required: ["message"],
    additionalProperties: false,
  },
  async run({ message }) {
    // The terminal renders this via the MCP server's activity stream; the tool
    // result just acknowledges receipt back to Poke.
    return { output: message ? "delivered" : "empty message ignored" };
  },
};

export const rememberTool: ToolDefinition<{ note: string }> = {
  name: "remember",
  description:
    "Save a durable note to project memory so you recall it in future poke-code sessions " +
    "(e.g. architecture decisions, where things live, how to run tests).",
  inputSchema: {
    type: "object",
    properties: {
      note: { type: "string", description: "A concise fact worth remembering." },
    },
    required: ["note"],
    additionalProperties: false,
  },
  async run({ note }, ctx) {
    if (!note || !note.trim()) return { output: "Nothing to remember.", isError: true };
    appendMemory(ctx.cwd, note);
    return { output: "Saved to memory." };
  },
};

export const commsTools = [sendAnswerTool, rememberTool];
