import { test, expect } from "bun:test";
import { updatePlanTool, renderPlan } from "../src/tools/planTool";

const ctx = { cwd: process.cwd() };

test("renderPlan marks each status", () => {
  const out = renderPlan([
    { step: "done", status: "completed" },
    { step: "now", status: "in_progress" },
    { step: "later", status: "pending" },
  ]);
  expect(out).toContain("[x] done");
  expect(out).toContain("[~] now");
  expect(out).toContain("[ ] later");
});

test("update_plan renders a valid plan", async () => {
  const res = await updatePlanTool.run(
    { steps: [{ step: "read code", status: "in_progress" }] },
    ctx
  );
  expect(res.isError).toBeFalsy();
  expect(res.output).toContain("Plan updated:");
  expect(res.output).toContain("[~] read code");
});

test("update_plan rejects an empty plan", async () => {
  const res = await updatePlanTool.run({ steps: [] }, ctx);
  expect(res.isError).toBe(true);
});

test("update_plan rejects an invalid status", async () => {
  const res = await updatePlanTool.run(
    { steps: [{ step: "x", status: "doing" as any }] },
    ctx
  );
  expect(res.isError).toBe(true);
});

test("update_plan warns about multiple in_progress steps", async () => {
  const res = await updatePlanTool.run(
    {
      steps: [
        { step: "a", status: "in_progress" },
        { step: "b", status: "in_progress" },
      ],
    },
    ctx
  );
  expect(res.output).toContain("one step in_progress");
});
