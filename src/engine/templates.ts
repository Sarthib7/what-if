import { getLang, isLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { DEMO_KIEZ, LUNCH_VAT_BLENDED, MIN_WAGE_2026, VAT_DRINKS } from "./berlin.ts";
import { withLang } from "./lang.ts";
import { msg } from "./messages.ts";
import type { MsgKey } from "./messages.ts";
import type { DecisionTemplate, FieldSpec, TemplateId } from "./types.ts";

/**
 * Decision templates. Each one lists the few numbers the scenario needs,
 * the focused question to ask when one is missing, and why it matters.
 * The numbers live here; every word lives in the catalog (messages.ts), so
 * getTemplate(id, lang) returns the same template in German, English, Spanish or Polish.
 * The demo values describe a made-up café in Berlin-Neukölln and are labelled as demo data.
 */

/** A field without its words. `demoFallback`: the demo café leaves it blank, so the fallback (and its note) shows. */
type FieldBase = Omit<FieldSpec, "label" | "ask" | "why"> & { demoFallback?: true; exampleText?: true };

const LUNCH_FIELDS: FieldBase[] = [
  { key: "kiez", unit: "text", kind: "fact", required: false, example: DEMO_KIEZ },
  { key: "weekday_customers", unit: "customers/day", kind: "fact", required: true, min: 1, max: 5000, example: 140 },
  { key: "avg_spend", unit: "EUR", kind: "fact", required: true, min: 0.5, max: 200, example: 7.4 },
  { key: "variable_cost_share", unit: "share", kind: "fact", required: false, min: 0.05, max: 0.9, fallback: 0.3, example: 0.32 },
  { key: "monthly_fixed_costs", unit: "EUR/month", kind: "fact", required: false, min: 0, max: 1_000_000, example: 16_500 },
  { key: "lunch_customers", unit: "customers/day", kind: "fact", required: true, min: 0, max: 2000, example: 38 },
  { key: "lunch_spend", unit: "EUR", kind: "fact", required: false, min: 0.5, max: 200, example: 11.2 },
  { key: "cash_buffer", unit: "EUR", kind: "fact", required: false, min: 0, max: 10_000_000, example: 1500 },
  { key: "vat_rate", unit: "share", kind: "fact", required: false, min: 0, max: 0.19, fallback: LUNCH_VAT_BLENDED, example: LUNCH_VAT_BLENDED, demoFallback: true },
  { key: "offer_price", unit: "EUR", kind: "choice", required: true, min: 1, max: 100, example: 9.9 },
  { key: "offer_cost", unit: "EUR", kind: "fact", required: true, min: 0, max: 100, example: 3.6 },
  { key: "setup_cost", unit: "EUR", kind: "choice", required: false, min: 0, max: 100_000, fallback: 0, example: 180 },
  { key: "extra_staff_hours_per_day", unit: "hours/day", kind: "choice", required: false, min: 0, max: 24, fallback: 0, example: 1 },
  { key: "staff_hourly_cost", unit: "EUR", kind: "fact", required: false, min: 5, max: 200, fallback: MIN_WAGE_2026, example: 18 },
  { key: "marketing_per_week", unit: "EUR/week", kind: "choice", required: false, min: 0, max: 100_000, fallback: 0, example: 25 },
  { key: "test_days", unit: "days", kind: "choice", required: false, min: 3, max: 60, fallback: 10, example: 10 },
  { key: "extra_low", unit: "customers/day", kind: "assumption", required: false, min: 0, max: 2000, example: 3 },
  { key: "extra_likely", unit: "customers/day", kind: "assumption", required: true, min: 0, max: 2000, example: 8 },
  { key: "extra_high", unit: "customers/day", kind: "assumption", required: false, min: 0, max: 2000, example: 15 },
  { key: "switch_share", unit: "share", kind: "assumption", required: false, min: 0, max: 1, fallback: 0.3, example: 0.3 },
];

const PRICE_FIELDS: FieldBase[] = [
  { key: "kiez", unit: "text", kind: "fact", required: false, example: DEMO_KIEZ },
  { key: "item", unit: "text", kind: "choice", required: true, example: "flat white", exampleText: true },
  { key: "current_price", unit: "EUR", kind: "fact", required: true, min: 0.1, max: 1000, example: 3.9 },
  { key: "new_price", unit: "EUR", kind: "choice", required: true, min: 0.1, max: 1000, example: 4.2 },
  { key: "units_per_week", unit: "units/week", kind: "fact", required: true, min: 1, max: 1_000_000, example: 620 },
  { key: "unit_cost", unit: "EUR", kind: "fact", required: true, min: 0, max: 1000, example: 0.95 },
  { key: "vat_rate", unit: "share", kind: "fact", required: false, min: 0, max: 0.19, fallback: VAT_DRINKS, example: VAT_DRINKS, demoFallback: true },
  { key: "volume_low", unit: "share", kind: "assumption", required: false, min: -1, max: 1, example: -0.12 },
  { key: "volume_likely", unit: "share", kind: "assumption", required: true, min: -1, max: 1, example: -0.04 },
  { key: "volume_high", unit: "share", kind: "assumption", required: false, min: -1, max: 1, example: 0 },
  { key: "test_days", unit: "days", kind: "choice", required: false, min: 3, max: 60, fallback: 14, example: 14 },
  // Optional, no fallback: only when given does the analysis set the 1 Jan 2027 minimum-wage rise against the new price.
  { key: "minimum_wage_hours_per_week", unit: "hours/week", kind: "fact", required: false, min: 0, max: 2000, example: 60 },
];

const BASES: Record<TemplateId, { prefix: "lunch" | "price"; fields: FieldBase[] }> = {
  lunch_offer: { prefix: "lunch", fields: LUNCH_FIELDS },
  price_change: { prefix: "price", fields: PRICE_FIELDS },
};

const k = (s: string) => s as MsgKey;

function build(id: TemplateId, lang: Lang): DecisionTemplate {
  return withLang(lang, () => {
    const { prefix, fields } = BASES[id];
    return {
      id,
      title: msg(k(`tpl.${prefix}.title`)),
      exampleQuestion: msg(k(`tpl.${prefix}.question`)),
      summary: msg(k(`tpl.${prefix}.summary`)),
      fields: fields.map((b): FieldSpec => {
        const { demoFallback: _d, exampleText, ...spec } = b;
        return {
          ...spec,
          ...(exampleText ? { example: msg(k(`f.${prefix}.${b.key}.example`)) } : {}),
          label: msg(k(`f.${prefix}.${b.key}.label`)),
          ask: msg(k(`f.${prefix}.${b.key}.ask`)),
          why: msg(k(`f.${prefix}.${b.key}.why`)),
        };
      }),
    };
  });
}

const built = new Map<string, DecisionTemplate>();

/**
 * The template with its labels, questions and reasons in a language (default: the current one).
 * The same object is returned for the same template and language; do not mutate it.
 */
export function getTemplate(id: string, lang?: Lang): DecisionTemplate {
  const l = lang && isLang(lang) ? lang : getLang();
  if (!(id in BASES)) {
    throw new Error(msg("err.unknownTemplate", { id, list: Object.keys(BASES).join(", ") }, l));
  }
  const key = `${id}|${l}`;
  let t = built.get(key);
  if (!t) {
    t = build(id as TemplateId, l);
    built.set(key, t);
  }
  return t;
}

/** Fields the demo café leaves blank on purpose (VAT), so the report shows the fallback and its note. */
export function demoFallbackKeys(id: string): string[] {
  return (BASES[id as TemplateId]?.fields ?? []).filter((f) => f.demoFallback).map((f) => f.key);
}

/** The demo café's numbers (labelled as demo data). The VAT rate is left out on purpose: the fallback shows. */
export function demoInputs(id: string, lang?: Lang): Record<string, number | string> {
  const skip = new Set(demoFallbackKeys(id));
  return Object.fromEntries(getTemplate(id, lang).fields.filter((f) => !skip.has(f.key)).map((f) => [f.key, f.example]));
}

/** "Café Lindenblatt (demo café, Berlin-Neukölln)" in a language. */
export function demoBusiness(lang?: Lang): string {
  return msg("demo.business", {}, lang && isLang(lang) ? lang : getLang());
}

/** The demo café's name in English (kept for old call sites; use demoBusiness(lang)). */
export const DEMO_BUSINESS = "Café Lindenblatt (demo café, Berlin-Neukölln)";

/** Templates in the current language. Kept as an object for old call sites: TEMPLATES.lunch_offer, Object.values(TEMPLATES). */
export const TEMPLATES: Record<string, DecisionTemplate> = {} as Record<string, DecisionTemplate>;
for (const id of Object.keys(BASES)) Object.defineProperty(TEMPLATES, id, { enumerable: true, get: () => getTemplate(id) });

/** English templates as constants (old exports). */
export const LUNCH_OFFER: DecisionTemplate = getTemplate("lunch_offer", "en");
export const PRICE_CHANGE: DecisionTemplate = getTemplate("price_change", "en");
