import { setCurrency } from "../engine/format.ts";
import type { Analysis, SensitivityPoint, TestPlan, TestResult, Unit } from "../engine/types.ts";
import { isLang, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import type { RehearsalSummary } from "../sim/types.ts";
import { t } from "./messages.ts";
import type { MsgKey } from "./messages.ts";

export interface ReportInput {
  analysis: Analysis;
  plan?: TestPlan;
  rehearsal?: RehearsalSummary;
  result?: TestResult;
  /** "running" while the coach is still filling the report in (e.g. a rehearsal round in progress). */
  status?: "running" | "final";
  /**
   * Who made this report, for the "Who did what" card. "coach": an AI app with What-IF connected asked the
   * questions. "try": the owner typed the numbers into the /try form (no AI). "demo": the site's demo.
   * Optional: a demo analysis counts as "demo", anything else as "coach".
   */
  madeBy?: "coach" | "try" | "demo";
  /** Called when the owner picks another language in the report header. The page re-renders the same link in it. */
  onLanguage?: (lang: Lang) => void;
}

export type StepState = "complete" | "current" | "upcoming" | "optional";

export interface StepDef {
  n: number;
  id: string;
  /** In the report's current language. */
  readonly title: string;
  readonly short: string;
  readonly lede: string;
}

function stepDef(n: number): StepDef {
  return {
    n,
    id: `wi-step-${n}`,
    get title() {
      return t(`step${n}.title` as MsgKey);
    },
    get short() {
      return t(`step${n}.short` as MsgKey);
    },
    get lede() {
      return t(`step${n}.lede` as MsgKey);
    },
  };
}

/** The six steps. Titles read the current language (renderReport sets it from the analysis). */
export const STEPS: StepDef[] = [1, 2, 3, 4, 5, 6].map(stepDef);

/** The language the report is drawn in: the analysis language, English for older analyses without one. */
export function reportLang(a: Analysis): Lang {
  return isLang(a.lang) ? a.lang : "en";
}

/** Sets the language and currency the formatters use for this analysis. Returns the language. */
export function useReport(a: Analysis): Lang {
  const lang = reportLang(a);
  setLang(lang);
  setCurrency(a.currency || "EUR");
  return lang;
}

export function madeBy(input: ReportInput): "coach" | "try" | "demo" {
  if (input.madeBy) return input.madeBy;
  return input.analysis.demo ? "demo" : "coach";
}

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

/** Where a line through the points crosses zero (linear between points), or null. */
export function zeroCrossing(points: SensitivityPoint[], field: "netTest" | "netMonth"): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const ya = a[field];
    const yb = b[field];
    if (ya === 0) return a.x;
    if ((ya < 0 && yb >= 0) || (ya > 0 && yb <= 0)) {
      if (yb === ya) return b.x;
      return a.x + ((0 - ya) / (yb - ya)) * (b.x - a.x);
    }
  }
  return null;
}

/**
 * The ongoing break-even: from where the change "pays its way" each day, once one-off setup costs are paid.
 * Uses the engine's breakEven.ongoing (or sensitivity.ongoingX); older analyses: where the monthly line crosses zero.
 * Returns null when it is the same as the test break-even (no setup cost), or unknown.
 */
export function ongoingBreakEven(a: Analysis): { value: number; unit: Unit; label?: string; maths?: string; plain?: string } | null {
  const s = a.sensitivity;
  const given = a.breakEven.ongoing;
  let out: { value: number; unit: Unit; label?: string; maths?: string; plain?: string } | null = null;
  if (given && Number.isFinite(given.value)) out = { ...given };
  else if (typeof s.ongoingX === "number" && Number.isFinite(s.ongoingX)) out = { value: s.ongoingX, unit: s.unit };
  else if (s.ongoingX === undefined) {
    const x = zeroCrossing(s.points, "netMonth");
    if (x !== null) out = { value: isCountUnit(s.unit) ? Math.ceil(x - 1e-9) : x, unit: s.unit };
  }
  if (!out) return null;
  const be = a.breakEven.unit === out.unit ? a.breakEven.value : s.breakEvenX;
  if (be === null || be === undefined) return out;
  const close = out.unit === "share" ? Math.abs(out.value - be) < 0.002 : Math.abs(out.value - be) < 0.5;
  return close ? null : out;
}

/** The ongoing break-even on the slider's axis, for the chart's second marker. */
export function ongoingX(a: Analysis): number | null {
  const o = ongoingBreakEven(a);
  if (!o) return null;
  if (typeof a.sensitivity.ongoingX === "number") return a.sensitivity.ongoingX;
  return o.unit === a.sensitivity.unit ? o.value : null;
}

/** True when an AI (not the fixed rules) played at least some of the imagined customers. */
export function aiPlayed(reh: RehearsalSummary | undefined): boolean {
  return !!reh && reh.method !== "rule-based";
}

/** Who played the imagined customers, in one sentence that matches the run's method. Used everywhere the report says it. */
export function whoPlayed(reh: RehearsalSummary): string {
  const m = (["subagent", "in-context", "rule-based", "mixed"] as const).includes(reh.method) ? reh.method : "mixed";
  return t(`who.long.${m}` as MsgKey);
}

export function whoPlayedShort(reh: RehearsalSummary): string {
  const m = (["subagent", "in-context", "rule-based", "mixed"] as const).includes(reh.method) ? reh.method : "mixed";
  return t(`who.short.${m}` as MsgKey);
}

export function isCountUnit(u: Unit): boolean {
  return u === "customers/day" || u === "units/week";
}
