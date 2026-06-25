import type { ToolDefinition } from "./types";

type StepStatus = "pending" | "in_progress" | "completed";

interface PlanStep {
  step: string;
  status: StepStatus;
}

const MARK: Record<StepStatus, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
};

/** Render a plan as a checklist. Exported so the UI can format it identically. */
export function renderPlan(steps: PlanStep[]): string {
  return steps.map((s) => `  ${MARK[s.status] ?? "[ ]"} ${s.step}`).join("\n");
}

/**
 * A lightweight planning tool, in the spirit of Claude Code's TodoWrite. The
 * agent re-sends the entire plan each time (the conversation holds the
 * canonical copy), so the tool itself stays stateless: it validates and renders.
 */
export const updatePlanTool: ToolDefinition<{ steps: PlanStep[] }> = {
  name: "update_plan",
  description:
    "Record or update a short, step-by-step plan for a multi-step task. Send the FULL list every " +
    "time. Mark exactly one step as 'in_progress' while you work on it, and 'completed' when done. " +
    "Use this to keep the user oriented during longer tasks.",
  inputSchema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "The full ordered list of plan steps.",
        items: {
          type: "object",
          properties: {
            step: { type: "string", description: "Short description of the step." },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "Current status of the step.",
            },
          },
          required: ["step", "status"],
        },
      },
    },
    required: ["steps"],
    additionalProperties: false,
  },
  async run({ steps }) {
    if (!Array.isArray(steps) || steps.length === 0)
      return { output: "A plan needs at least one step.", isError: true };

    const valid: StepStatus[] = ["pending", "in_progress", "completed"];
    for (const s of steps) {
      if (!s || typeof s.step !== "string" || !valid.includes(s.status))
        return {
          output: "Each step needs a 'step' string and a status of pending|in_progress|completed.",
          isError: true,
        };
    }
    const inProgress = steps.filter((s) => s.status === "in_progress").length;
    const note = inProgress > 1 ? "\n(note: keep only one step in_progress at a time)" : "";
    return { output: `Plan updated:\n${renderPlan(steps)}${note}` };
  },
};
