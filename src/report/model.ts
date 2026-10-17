import type { Analysis, TestPlan, TestResult } from "../engine/types.ts";
import type { RehearsalSummary } from "../sim/types.ts";

export interface ReportInput {
  analysis: Analysis;
  plan?: TestPlan;
  rehearsal?: RehearsalSummary;
  result?: TestResult;
  /** "running" while the coach is still filling the report in (e.g. a rehearsal round in progress). */
  status?: "running" | "final";
}

export type StepState = "complete" | "current" | "upcoming" | "optional";

export interface StepDef {
  n: number;
  id: string;
  title: string;
  short: string;
  lede: string;
}

export const STEPS: StepDef[] = [
  { n: 1, id: "wi-step-1", title: "Your question", short: "Question", lede: "Every good decision starts with one clear question, compared with carrying on as now." },
  { n: 2, id: "wi-step-2", title: "Your numbers", short: "Numbers", lede: "Before any maths: what do we actually know, and what are we only guessing?" },
  {
    n: 3,
    id: "wi-step-3",
    title: "Possible outcomes",
    short: "Outcomes",
    lede: "Nobody knows exactly how many people will come, so What-IF works out three versions: a slow start, your likely guess, and a strong one.",
  },
  {
    n: 4,
    id: "wi-step-4",
    title: "The one number to remember",
    short: "Break-even",
    lede: "Break-even is the point where the change stops costing you and starts paying. Know it, and you can judge any guess on the spot.",
  },
  {
    n: 5,
    id: "wi-step-5",
    title: "Rehearsal with imagined customers",
    short: "Rehearsal",
    lede: "A few imagined customers react, round by round, so you can spot questions before real people do. A rehearsal, not a forecast.",
  },
  { n: 6, id: "wi-step-6", title: "Your test", short: "Test", lede: "A small, cheap, reversible test turns your most important guess into a fact." },
];

/** True while a rehearsal round (or the report) is still being filled in. */
export function isRunning(input: ReportInput): boolean {
  return input.status === "running" || input.rehearsal?.status === "running";
}

export function stepStates(input: ReportInput): StepState[] {
  const states: StepState[] = ["complete", "complete", "complete", "complete", "upcoming", "upcoming"];
  const reh = input.rehearsal;
  if (reh) states[4] = reh.status === "running" || input.status === "running" ? "current" : "complete";
  else states[4] = "optional";
  if (input.result) states[5] = "complete";
  else if (states[4] !== "current") states[5] = "current";
  return states;
}

/** Length of the test in days, from the inputs or the plan. */
export function testDays(input: ReportInput): number | undefined {
  const v = input.analysis.inputs.find((i) => i.key === "test_days")?.value;
  if (typeof v === "number") return v;
  return input.plan?.days;
}
