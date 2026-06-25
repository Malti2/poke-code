import { loadProjectContext } from "./context";
import { loadMemory } from "./memory";

/**
 * Build the message that kicks Poke off on a task.
 *
 * poke-code does NOT run an LLM itself. Instead it hands the task to your Poke
 * agent, which does all the work by calling poke-code's tools over the MCP
 * tunnel. The only way Poke shows anything in the terminal is by calling the
 * `send_answer` tool, so the instructions make that explicit.
 */
export function buildTaskMessage(task: string, cwd: string): string {
  const context = loadProjectContext(cwd);
  const memory = loadMemory(cwd);

  const sections: string[] = [
    `You are the coding agent behind "poke-code", working on a project on the user's machine. You have a connected MCP toolset (connection name "poke-code") with these tools: read_file, write_file, edit_file, list_files, glob, grep, execute_bash, update_plan, remember, and send_answer.

Work on the task below autonomously and to completion using ONLY these tools:
- Investigate first (read_file, grep, glob) before changing anything.
- Make the smallest correct change; match the existing code style.
- Verify your work with execute_bash (tests, typecheck, build) when relevant.
- Use update_plan for multi-step tasks so the user can follow along.
- The user sees NOTHING except what you send via send_answer — narrate key progress and give the result there.
- When the task is finished, call send_answer with final=true and a concise summary.
- Save anything worth remembering for next time with the remember tool.
- Do not stop to ask for confirmation; keep going until the task is done.

Working directory: ${cwd}`,
  ];

  if (context)
    sections.push(`# Project context (${context.filename})\n${context.content}`);
  if (memory) sections.push(`# Memory from earlier sessions\n${memory}`);

  sections.push(`# Task\n${task}`);

  return sections.join("\n\n");
}
