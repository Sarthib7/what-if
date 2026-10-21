/**
 * The What-IF scenario engine: deterministic, browser-safe maths.
 * Every number the owner sees is computed here, never by the model.
 * Every word the owner sees comes from the catalog in messages.ts (de, en, es, pl).
 */
import { isLang, normaliseLang, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { berlinFact, MIN_WAGE_2026 } from "./berlin.ts";
import type { FactId } from "./berlin.ts";
import { getCurrency, setCurrency } from "./format.ts";
import { checkInputs } from "./inputs.ts";
import { analyzeLunch } from "./lunch-offer.ts";
import { msg } from "./messages.ts";
import { analyzePrice, priceWageRise } from "./price-change.ts";
import { demoBusiness, getTemplate } from "./templates.ts";
import { valuesOf } from "./figures.ts";
import { langOf, withLang } from "./lang.ts";
import type { Analysis, DecisionTemplate, InputCheck, PublicFact, RawInputs, ResolvedInput, Source, TemplateId, WageRiseCheck } from "./types.ts";

export { checkInputs, parseNumber, show } from "./inputs.ts";
export type { ParsedNumber } from "./inputs.ts";
export { TEMPLATES, getTemplate, demoInputs, demoBusiness, demoFallbackKeys, DEMO_BUSINESS, LUNCH_OFFER, PRICE_CHANGE } from "./templates.ts";
export { planTest } from "./experiment.ts";
export { compareResult, whatChanged, OBSERVED_FIELDS, observedFields } from "./compare.ts";
export { lunchThresholds, priceThresholds, verdictFor } from "./decision.ts";
export type { Verdict } from "./decision.ts";
export { WEEKDAYS_PER_MONTH } from "./lunch-offer.ts";
export { WEEKS_PER_MONTH } from "./price-change.ts";
export { money, price, pct, num, signed, signedPct, setCurrency } from "./format.ts";
export { priceWageRise } from "./price-change.ts";
export {
  BERLIN_FACTS,
  BERLIN_KIEZE,
  KIEZ_OTHER,
  DEMO_KIEZ,
  berlinFact,
  berlinFacts,
  normaliseKiez,
  isBerlinKiez,
  VAT_FOOD,
  VAT_DRINKS,
  LUNCH_VAT_BLENDED,
  LUNCH_DRINKS_SHARE,
  MIN_WAGE_2026,
  MIN_WAGE_2027,
  MIN_WAGE_RISE_2027,
  FACT_IDS,
} from "./berlin.ts";
export type { FactId, Kiez } from "./berlin.ts";
export { engineMessage, sourceLabel, ENGINE_MESSAGES } from "./messages.ts";
export * from "./types.ts";

export interface AnalyzeOptions {
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
  /** Language of every string in the analysis (default "en" for old call sites; the product passes "de"). */
  lang?: Lang | string;
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
  const lines = [msg("err.notReady", { title: t.title })];
  if (check.missing.length) {
    lines.push(msg("err.stillNeeded"));
    for (const m of check.missing) lines.push(`- ${m.label}: ${m.ask}`);
  }
  if (check.problems.length) {
    lines.push(msg("err.pleaseCheck"));
    for (const p of check.problems) lines.push(`- ${p}`);
  }
  return lines.join("\n");
}

/**
 * The public facts the numbers relied on: the VAT rates behind a VAT fallback (and, for the lunch blend,
 * the BMF letter behind its 30% drinks share), and the minimum wage wherever the maths or a warning uses it.
 */
export function factsUsed(template: TemplateId, inputs: ResolvedInput[], lang: Lang): PublicFact[] {
  const ids: FactId[] = [];
  const input = (k: string) => inputs.find((i) => i.key === k);
  const fell = (k: string) => input(k)?.filledBy === "fallback";
  const num = (k: string) => (typeof input(k)?.value === "number" ? (input(k)!.value as number) : undefined);
  if (fell("vat_rate"))
    ids.push(...(template === "lunch_offer" ? (["vat_food_7", "vat_drinks_19", "bmf_drinks_share_30"] as const) : (["vat_drinks_19", "vat_milk_takeaway_7", "vat_food_7"] as const)));
  if (template === "lunch_offer") {
    const hours = num("extra_staff_hours_per_day") ?? 0;
    const rate = num("staff_hourly_cost");
    const belowMin = rate !== undefined && rate < MIN_WAGE_2026 - 1e-9 && input("staff_hourly_cost")?.filledBy !== "alias";
    // The minimum wage is used when it fills in the cost of the extra hours, and cited when the owner's own cost is below it.
    if ((hours > 0 && fell("staff_hourly_cost")) || belowMin) ids.push("min_wage_2026", "min_wage_2027");
  }
  if (template === "price_change" && (num("minimum_wage_hours_per_week") ?? 0) > 0) ids.push("min_wage_2026", "min_wage_2027");
  return ids.map((id) => berlinFact(id, lang));
}

/**
 * Price change: the minimum-wage rise on 1 Jan 2027 set against the new price, in the analysis's language.
 * Undefined unless the owner gave the staff hours a week paid at or near the minimum wage (more than 0).
 * Same as analysis.wageRise; recomputed from the inputs for analyses saved before that field existed.
 */
export function wageRiseCheck(a: Analysis): WageRiseCheck | undefined {
  if (a.template !== "price_change") return undefined;
  if (a.wageRise) return a.wageRise;
  const prev = getCurrency();
  setCurrency(a.currency);
  try {
    return withLang(langOf(a), () => priceWageRise(valuesOf(a.inputs)));
  } finally {
    setCurrency(prev);
  }
}

/**
 * Runs the scenarios for one decision. Throws a plain-language Error listing
 * the missing questions and problems when the inputs are not ready.
 */
export function analyze(template: TemplateId, raw: RawInputs, opts: AnalyzeOptions = {}): Analysis {
  const lang: Lang = opts.lang === undefined ? "en" : isLang(opts.lang) ? opts.lang : normaliseLang(opts.lang, "en");
  setLang(lang);
  const t = getTemplate(template, lang);
  setCurrency((opts.currency ?? "EUR").toUpperCase());
  const demo = opts.demo === true;
  const check = checkInputs(t.id, raw ?? {}, { demo, lang });
  if (!check.ready) throw new Error(notReadyMessage(t, check));
  const body = t.id === "lunch_offer" ? analyzeLunch(check.resolved, demo) : analyzePrice(check.resolved, demo);
  return {
    id: opts.id ?? analysisId(t.id, check.resolved),
    template: t.id,
    lang,
    facts: factsUsed(t.id, check.resolved, lang),
    createdAt: opts.createdAt ?? new Date().toISOString(),
    business: opts.business?.trim() || (demo ? demoBusiness(lang) : msg("demo.yourCafe")),
    question: opts.question?.trim() || t.exampleQuestion,
    demo,
    currency: getCurrency(),
    inputs: check.resolved,
    ...body,
  };
}

/** The source tag's words in a language ("Ihre Zahl", "Eine Schätzung"…). */
export type { Source };
