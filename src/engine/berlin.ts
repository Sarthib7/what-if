/**
 * Berlin closed beta: the public facts the maths relies on, and the Kieze.
 *
 * Every fact has a source, a URL and the date it took effect. Never add one without them.
 * Labels are translated through the engine catalog (src/engine/messages.ts).
 */
import type { Lang } from "../i18n/index.ts";
import { getLang } from "../i18n/index.ts";
import { msg } from "./messages.ts";
import type { PublicFact } from "./types.ts";

/** VAT on food in restaurants and cafés (eat-in and take-away) since 1 Jan 2026. */
export const VAT_FOOD = 0.07;
/** VAT on drinks (milk drinks with at least 75% milk: 7%). */
export const VAT_DRINKS = 0.19;
/** Share of drinks assumed in a lunch deal when the owner does not know the split. */
export const LUNCH_DRINKS_SHARE = 0.3;
/** Blended VAT for a lunch deal: 70% food at 7% + 30% drinks at 19% = 10.6%. */
export const LUNCH_VAT_BLENDED = 0.106;
/** Statutory minimum wage per hour since 1 Jan 2026. */
export const MIN_WAGE_2026 = 13.9;
/** Statutory minimum wage per hour from 1 Jan 2027. */
export const MIN_WAGE_2027 = 14.6;

export type FactId = "vat_food_7" | "vat_drinks_19" | "min_wage_2026" | "min_wage_2027";

const VAT_SOURCE = "Steueränderungsgesetz 2025, §12 Abs. 2 Nr. 15 UStG";
const VAT_URL = "https://www.bundesfinanzministerium.de";
const WAGE_SOURCE = "Fünfte Mindestlohnanpassungsverordnung";
const WAGE_URL = "https://www.bundesregierung.de";

const FACT_BASE: Record<FactId, Omit<PublicFact, "label" | "value"> & { value: (lang: Lang) => string }> = {
  vat_food_7: { id: "vat_food_7", source: VAT_SOURCE, url: VAT_URL, asOf: "2026-01-01", value: (l) => msg("fact.vat_food_7.value", {}, l) },
  vat_drinks_19: { id: "vat_drinks_19", source: VAT_SOURCE, url: VAT_URL, asOf: "2026-01-01", value: (l) => msg("fact.vat_drinks_19.value", {}, l) },
  min_wage_2026: { id: "min_wage_2026", source: WAGE_SOURCE, url: WAGE_URL, asOf: "2026-01-01", value: (l) => msg("fact.min_wage_2026.value", {}, l) },
  min_wage_2027: { id: "min_wage_2027", source: WAGE_SOURCE, url: WAGE_URL, asOf: "2027-01-01", value: (l) => msg("fact.min_wage_2027.value", {}, l) },
};

export const FACT_IDS: readonly FactId[] = ["vat_food_7", "vat_drinks_19", "min_wage_2026", "min_wage_2027"];

/** One public fact with its label and value in a language (default: the current one). */
export function berlinFact(id: FactId, lang: Lang = getLang()): PublicFact {
  const b = FACT_BASE[id];
  return { id: b.id, label: msg(`fact.${id}.label`, {}, lang), value: b.value(lang), source: b.source, url: b.url, asOf: b.asOf };
}

/** All Berlin facts in a language. */
export function berlinFacts(lang: Lang = getLang()): PublicFact[] {
  return FACT_IDS.map((id) => berlinFact(id, lang));
}

/** The Berlin facts in English (labels follow the language at import time: English). Use berlinFacts(lang) for others. */
export const BERLIN_FACTS: PublicFact[] = berlinFacts("en");

/** Berlin Kieze the rehearsal knows, plus "other". Proper names: not translated. */
export const BERLIN_KIEZE = [
  "Neukölln",
  "Kreuzberg",
  "Friedrichshain",
  "Prenzlauer Berg",
  "Mitte",
  "Wedding",
  "Moabit",
  "Schöneberg",
  "Charlottenburg",
  "Friedenau",
  "Pankow",
  "Lichtenberg",
  "Treptow",
  "Tempelhof",
  "Steglitz",
  "Köpenick",
  "Spandau",
  "Weißensee",
] as const;

export type Kiez = (typeof BERLIN_KIEZE)[number];
export const KIEZ_OTHER = "other";
export const DEMO_KIEZ: Kiez = "Neukölln";

const fold = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");

const KIEZ_BY_FOLD = new Map<string, Kiez>(BERLIN_KIEZE.map((k) => [fold(k), k]));
for (const k of BERLIN_KIEZE) KIEZ_BY_FOLD.set(fold(k.replace(/ö/g, "o").replace(/ü/g, "u").replace(/ä/g, "a").replace(/ß/g, "ss")), k);
KIEZ_BY_FOLD.set("prenzlberg", "Prenzlauer Berg");
KIEZ_BY_FOLD.set("xberg", "Kreuzberg");
KIEZ_BY_FOLD.set("fhain", "Friedrichshain");

/**
 * "neukoelln", "Neukolln", "  NEUKÖLLN " → "Neukölln"; "other", "andere", "otro", "inny" → "other";
 * anything else is kept as the owner wrote it (trimmed).
 */
export function normaliseKiez(s: string): string {
  const f = fold(s);
  if (!f) return "";
  const known = KIEZ_BY_FOLD.get(f) ?? KIEZ_BY_FOLD.get(f.replace(/^berlin/, ""));
  if (known) return known;
  if (["other", "andere", "anderer", "sonstige", "otro", "otra", "inny", "inna"].includes(f)) return KIEZ_OTHER;
  return s.trim();
}

/** True when the Kiez is one of BERLIN_KIEZE. */
export function isBerlinKiez(s: string): s is Kiez {
  return (BERLIN_KIEZE as readonly string[]).includes(s);
}
