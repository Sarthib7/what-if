/**
 * The What-IF scenario engine: deterministic, browser-safe maths.
 * Every number the owner sees is computed here, never by the model.
 */
import { getCurrency, setCurrency } from "./format.ts";
import { checkInputs } from "./inputs.ts";
import { analyzeLunch } from "./lunch-offer.ts";
import { analyzePrice } from "./price-change.ts";
import { DEMO_BUSINESS, getTemplate } from "./templates.ts";
import type { Analysis, DecisionTemplate, InputCheck, RawInputs, ResolvedInput, TemplateId } from "./types.ts";

export { checkInputs, show } from "./inputs.ts";
export { TEMPLATES, getTemplate, demoInputs, DEMO_BUSINESS } from "./templates.ts";
export { planTest } from "./experiment.ts";
export { compareResult, whatChanged, OBSERVED_FIELDS } from "./compare.ts";
export { WEEKDAYS_PER_MONTH } from "./lunch-offer.ts";
export { WEEKS_PER_MONTH } from "./price-change.ts";
export { money, price, pct, num, signed, signedPct, setCurrency } from "./format.ts";
export * from "./types.ts";

export interface AnalyzeOptions {
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
  /** Fixes the id; by default it is a hash of the template and the inputs. */
  id?: string;
  /** Fixes the timestamp (tests, replays); by default the current time. */
  createdAt?: string;
}

/** 32-bit FNV-1a over the string's UTF-16 code units, as 8 hex digits. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Same template and same (resolved) inputs → same id, however the owner typed them ("30", "30%", 0.3). */
export function analysisId(template: TemplateId, inputs: ResolvedInput[]): string {
  const body = [...inputs]
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .map((i) => `${i.key}=${typeof i.value === "number" ? String(Math.round(i.value * 1e6) / 1e6) : i.value}`)
    .join("&");
  return `a-${fnv1a(`${template}|${body}`)}`;
}

function notReadyMessage(t: DecisionTemplate, check: InputCheck): string {
  const lines = [`What-IF needs a little more before it can run the numbers for "${t.title}".`];
  if (check.missing.length) {
    lines.push("Still needed:");
    for (const m of check.missing) lines.push(`- ${m.label}: ${m.ask}`);
  }
  if (check.problems.length) {
    lines.push("Please check:");
    for (const p of check.problems) lines.push(`- ${p}`);
  }
  return lines.join("\n");
}

/**
 * Runs the scenarios for one decision. Throws a plain-language Error listing
 * the missing questions and problems when the inputs are not ready.
 */
export function analyze(template: TemplateId, raw: RawInputs, opts: AnalyzeOptions = {}): Analysis {
  const t = getTemplate(template);
  setCurrency((opts.currency ?? "EUR").toUpperCase());
  const demo = opts.demo === true;
  const check = checkInputs(t.id, raw ?? {}, { demo });
  if (!check.ready) throw new Error(notReadyMessage(t, check));
  const body = t.id === "lunch_offer" ? analyzeLunch(check.resolved, demo) : analyzePrice(check.resolved, demo);
  return {
    id: opts.id ?? analysisId(t.id, check.resolved),
    template: t.id,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    business: opts.business?.trim() || (demo ? DEMO_BUSINESS : "Your café"),
    question: opts.question?.trim() || t.exampleQuestion,
    demo,
    currency: getCurrency(),
    inputs: check.resolved,
    ...body,
  };
}
