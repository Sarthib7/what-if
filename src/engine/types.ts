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
  | "hours/day"
  | "hours/week"
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
  /** Set when the value is a fallback the owner did not give, or when What-IF read the owner's text in a particular way ("1.500" as 1500). */
  note?: string;
  /** Set when What-IF filled the value in: a fallback, derived from another answer, or read from an older link's key. */
  filledBy?: "fallback" | "derived" | "alias";
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
  /** The guess as a short phrase that reads naturally: "3 extra lunch customers a day", "sales 12% lower". */
  assumptionText?: string;
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
  /** Result over the test compared with the owner's likely guess (netTest here − netTest at the guess). */
  vsGuess?: number;
}

/** A dated, sourced public fact the maths uses (Berlin/Germany), shown in the report's "facts used" card. */
export interface PublicFact {
  id: string;
  label: string;
  value: string;
  source: string;
  url: string;
  /** When the rule took effect or the source was checked, ISO date. */
  asOf: string;
}

/**
 * Price change: does the new price pay for the minimum-wage rise on 1 Jan 2027?
 * Set when the owner gave minimum_wage_hours_per_week (staff hours a week paid at or near the minimum wage).
 * All amounts are euros a week; the cost is the wage alone (employer contributions come on top).
 */
export interface WageRiseCheck {
  hoursPerWeek: number;
  /** €14.60 − €13.90 = €0.70 more per hour from 1 Jan 2027. */
  risePerHour: number;
  /** hours × €0.70 (the wage alone). */
  wageWeek?: number;
  /** Employer contributions on top, as a share of the wage: a labelled guess (about 21%). */
  employerShare?: number;
  /** What the rise costs the owner a week: wage × (1 + employerShare). */
  costWeek: number;
  /** What the new price brings a week at the owner's likely guess (delta_week at volume_likely). */
  gainWeek: number;
  /** gainWeek − costWeek: what is left (≥ 0) or still missing (< 0) after the rise. */
  leftWeek: number;
  /** true when the new price's expected weekly gain covers the rise. */
  covers: boolean;
  /** The two sums written out ("show the maths"), with the owner's numbers. */
  maths: string;
  /** One plain sentence: what the cents bring a week, what the rise costs a week, and whether one covers the other. */
  plain: string;
}

export interface Analysis {
  id: string;
  template: TemplateId;
  /** Language every string in this analysis is written in. */
  lang: import("../i18n/index.ts").Lang;
  /** Public facts (VAT rates, minimum wage) the numbers rely on, with sources. */
  facts: PublicFact[];
  createdAt: string;
  business: string;
  question: string;
  demo: boolean;
  currency: string;
  inputs: ResolvedInput[];
  current: Figure[];
  scenarios: Scenario[];
  breakEven: {
    value: number;
    unit: Unit;
    label: string;
    maths: string;
    plain: string;
    reachable: boolean;
    /** Lunch offer: the second number, for deciding after the test (setup already spent): extra customers a day for the deal to pay its way. */
    ongoing?: { value: number; unit: Unit; label: string; maths: string; plain: string };
  };
  worstCase: {
    value: number;
    maths: string;
    plain: string;
    shareOfCash?: number;
    /** The cash part of the worst case: money the owner sees going out (setup, staff, promotion), over the whole test. */
    cashOut?: number;
    /** Lunch offer: the same "nobody new comes" result if every lunch regular switched to the deal (the worst case rests on the switching guess). */
    ifAllSwitch?: number;
  };
  biggestUncertainty: { key: string; label: string; swing: number; plain: string; ranking: { key: string; label: string; swing: number }[] };
  sensitivity: {
    key: string;
    label: string;
    unit: Unit;
    current: number;
    breakEvenX: number | null;
    /** Lunch offer: where each day pays its way (setup already paid); the slider can draw it as a second marker. */
    ongoingX?: number | null;
    points: SensitivityPoint[];
    /** The mechanism: what one more step of the guess (one extra customer a day, one percentage point of sales) is worth. */
    perStep?: { netTest: number; netMonth: number; plain: string };
  };
  lessons: string[];
  nextQuestions: string[];
  warnings: string[];
  /** Price change only, when the owner gave the staff hours paid at or near the minimum wage: the 2027 wage rise against the new price. */
  wageRise?: WageRiseCheck;
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
  /** The decision rule as numbers; compareResult uses exactly these, so the verdict always matches the card. */
  rule?: DecisionThresholds;
  costCap: string;
  plain: string;
}

/**
 * Keep / tweak / stop lines, in the unit the test measures (extra lunch customers a day, or sales a week).
 * keep when measured >= keepFrom; tweak when measured >= tweakFrom; otherwise stop.
 */
export interface DecisionThresholds {
  unit: Unit;
  keepFrom: number;
  tweakFrom: number;
  /** Lunch offer: from here the test also paid back its setup (shown on the card, not used for the verdict). */
  payBackFrom?: number;
  /** false when the card says "do not test as it stands" (the verdict is then "stop" unless the result reaches keepFrom). */
  testable: boolean;
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
