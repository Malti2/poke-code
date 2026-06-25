import type { ToolDefinition } from "./types";
import type { TaskInbox } from "../inbox";
import { buildTaskMessage } from "../task";

const POLL_TIMEOUT_MS = 25_000;

/**
 * The tool Poke calls over the tunnel to receive the user's next coding request.
 * This replaces any outbound message API: the task flows IN to Poke as the
 * result of a tool call, so poke-code needs nothing but the tunnel.
 *
 * It long-polls: if the user hasn't typed anything yet it waits briefly and
 * then returns a "nothing yet" note, so Poke can simply call it again.
 */
export function createUserMessageTool(inbox: TaskInbox, cwd: string): ToolDefinition {
  return {
    name: "get_user_message",
    description:
      "Receive the next coding request the user typed in their poke-code terminal. Call this to " +
      "get work to do; it returns the request plus project context and instructions. If nothing " +
      "is pending it waits briefly and returns a 'no request yet' note — keep calling it to wait. " +
      "After you finish a task (send_answer with final=true), call this again for the next one.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const task = await inbox.next(POLL_TIMEOUT_MS);
      if (task === null)
        return { output: "No new request from the user yet. Call get_user_message again to keep waiting." };
      return { output: buildTaskMessage(task, cwd) };
    },
  };
}
