/**
 * Shared shapes for the What-IF engine.
 *
 * Every number the owner sees carries a `source`, so the report can show
 * where it came from: the owner's own figure, a guess, a calculation, an
 * imagined reaction from the rehearsal, or demo data. Keeping these apart
 * is the core of the product (see vision.md, "Evidence beside advice").
 */

export type Source = "owner" | "assumption" | "calculation" | "imagined" | "demo";

export const SOURCE_LABEL: Record<Source, string> = {
  owner: "Your number",
  assumption: "A guess",
  calculation: "Calculated",
  imagined: "Imagined",
  demo: "Demo data",
};

export type Unit =
  | "EUR"
  | "EUR/day"
  | "EUR/week"
  | "EUR/month"
  | "customers/day"
  | "units/week"
  | "share"
  | "days"
  | "text";

export type TemplateId = "lunch_offer" | "price_change";

export interface FieldSpec {
  key: string;
  label: string;
  unit: Unit;
  /** "fact": the owner can look it up. "assumption": nobody knows yet; it is a guess the test will check. */
  kind: "fact" | "assumption" | "choice";
  required: boolean;
  min?: number;
  max?: number;
  /** Used when the owner does not know. Always tagged as a guess. */
  fallback?: number | string;
  /** Value for the demo café. */
  example: number | string;
  /** The one focused follow-up question to ask when it is missing. */
  ask: string;
  /** Why the number matters, in plain words. Shown next to the question. */
  why: string;
}

export interface DecisionTemplate {
  id: TemplateId;
  title: string;
  exampleQuestion: string;
  summary: string;
  fields: FieldSpec[];
}

export type RawInputs = Record<string, number | string | undefined | null>;

export interface ResolvedInput {
  key: string;
  label: string;
  value: number | string;
  unit: Unit;
  source: Source;
  kind: FieldSpec["kind"];
  why: string;
  /** Set when the value is a fallback the owner did not give. */
  note?: string;
}

export interface MissingInput {
  key: string;
  label: string;
  ask: string;
  why: string;
  /** What What-IF will use if the owner does not know. */
  fallback?: number | string;
}

export interface InputCheck {
  template: TemplateId;
  ready: boolean;
  missing: MissingInput[];
  problems: string[];
  resolved: ResolvedInput[];
}

export interface Figure {
  id: string;
  label: string;
  value: number;
  unit: Unit;
  source: Source;
  /** The calculation written out with the owner's numbers ("show the maths"). */
  maths: string;
}

export interface Scenario {
  id: "cautious" | "expected" | "optimistic";
  label: string;
  assumptionLabel: string;
  assumptionValue: number;
  assumptionUnit: Unit;
  figures: Figure[];
  /** Result over the test period, after one-off costs. */
  netTest: number;
  /** Ongoing result per month, without one-off costs. */
  netMonth: number;
  plain: string;
}

export interface SensitivityPoint {
  x: number;
  netTest: number;
  netMonth: number;
  /** "Why this number": the calculation for this slider position, in words. */
  explanation: string;
}

export interface Analysis {
  id: string;
  template: TemplateId;
  createdAt: string;
  business: string;
  question: string;
  demo: boolean;
  currency: string;
  inputs: ResolvedInput[];
  current: Figure[];
  scenarios: Scenario[];
  breakEven: { value: number; unit: Unit; label: string; maths: string; plain: string; reachable: boolean };
  worstCase: { value: number; maths: string; plain: string; shareOfCash?: number };
  biggestUncertainty: { key: string; label: string; swing: number; plain: string; ranking: { key: string; label: string; swing: number }[] };
  sensitivity: { key: string; label: string; unit: Unit; current: number; breakEvenX: number | null; points: SensitivityPoint[] };
  lessons: string[];
  nextQuestions: string[];
  warnings: string[];
}

export interface TestPlan {
  analysisId: string;
  title: string;
  days: number;
  before: string[];
  during: string[];
  measure: { what: string; how: string }[];
  checkIns: { day: number; look: string }[];
  decisionRule: { keep: string; tweak: string; stop: string };
  costCap: string;
  plain: string;
}

/** "Why this changed": what the owner moved and what it did to the result. */
export interface ChangeExplanation {
  changes: { key: string; label: string; from: number | string; to: number | string; fromText: string; toText: string }[];
  effects: { id: string; label: string; from: number; to: number; fromText: string; toText: string }[];
  /** Plain-language sentences, most important first. */
  plain: string[];
}

export interface TestResult {
  analysisId: string;
  recordedAt: string;
  observed: Record<string, number>;
  actual: number;
  actualLabel: string;
  closestScenario: Scenario["id"] | "below_cautious" | "above_optimistic";
  verdict: "keep" | "tweak" | "stop";
  netTest: number;
  plain: string;
  learned: string[];
}
