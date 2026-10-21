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

/** VAT on food in restaurants and cafés (eat-in and take-away) since 1 Jan 2026 (§ 12 Abs. 2 Nr. 15 UStG). */
export const VAT_FOOD = 0.07;
/**
 * VAT on drinks: 19%, milk drinks drunk in the café included (§ 12 Abs. 2 Nr. 15 UStG leaves drinks out of the 7% rate).
 * Only milk drinks sold to take away with at least 75% milk are 7% (§ 12 Abs. 2 Nr. 1 with Anlage 2 Nr. 35, an older rule).
 */
export const VAT_DRINKS = 0.19;
/** Share of drinks assumed in a lunch deal when the owner does not know the split: the flat 30% the BMF letter of 22 Dec 2025 accepts for combined offers. */
export const LUNCH_DRINKS_SHARE = 0.3;
/** Blended VAT for a lunch deal: 70% food at 7% + 30% drinks at 19% = 10.6%. The rates are law; the 70/30 split is the guess. */
export const LUNCH_VAT_BLENDED = 0.106;
/** Statutory minimum wage per hour since 1 Jan 2026 (MiLoV5). */
export const MIN_WAGE_2026 = 13.9;
/** Statutory minimum wage per hour from 1 Jan 2027 (MiLoV5). */
export const MIN_WAGE_2027 = 14.6;
/** The rise on 1 Jan 2027: €14.60 − €13.90 = €0.70 more per hour. */
export const MIN_WAGE_RISE_2027 = 0.7;
/** Employer contributions on top of a wage, as a share of it: a rough guess (about 21% for employees; Minijobs cost more). Not a public fact. */
export const EMPLOYER_SHARE_GUESS = 0.21;

export type FactId = "vat_food_7" | "vat_drinks_19" | "vat_milk_takeaway_7" | "bmf_drinks_share_30" | "min_wage_2026" | "min_wage_2027";

/** § 12 UStG (rates) and Anlage 2 UStG (goods at 7%) on gesetze-im-internet.de, the federal law text. */
const USTG_12_URL = "https://www.gesetze-im-internet.de/ustg_1980/__12.html";
const USTG_ANLAGE2_URL = "https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html";
/** The Fünfte Mindestlohnanpassungsverordnung (MiLoV5): €13.90 from 1 Jan 2026, €14.60 from 1 Jan 2027. */
const MILOV5_URL = "https://www.gesetze-im-internet.de/milov5/BJNR10C0A0025.html";
/** BMF letter of 22 Dec 2025 (III C 2 - S 7220/00023/014/027): a flat 30% drinks share for combined offers. */
const BMF_2025_12_22_URL =
  "https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-12-22-verpflegungsdienstleistungen.pdf?__blob=publicationFile&v=6";
const WAGE_SOURCE = "Fünfte Mindestlohnanpassungsverordnung (MiLoV5)";

const FACT_BASE: Record<FactId, Omit<PublicFact, "label" | "value"> & { value: (lang: Lang) => string }> = {
  vat_food_7: { id: "vat_food_7", source: "Steueränderungsgesetz 2025, § 12 Abs. 2 Nr. 15 UStG", url: USTG_12_URL, asOf: "2026-01-01", value: (l) => msg("fact.vat_food_7.value", {}, l) },
  vat_drinks_19: { id: "vat_drinks_19", source: "§ 12 Abs. 1 und Abs. 2 Nr. 15 UStG", url: USTG_12_URL, asOf: "2026-01-01", value: (l) => msg("fact.vat_drinks_19.value", {}, l) },
  vat_milk_takeaway_7: {
    id: "vat_milk_takeaway_7",
    source: "§ 12 Abs. 2 Nr. 1 UStG mit Anlage 2 Nr. 35",
    url: USTG_ANLAGE2_URL,
    asOf: "2026-01-01",
    value: (l) => msg("fact.vat_milk_takeaway_7.value", {}, l),
  },
  bmf_drinks_share_30: {
    id: "bmf_drinks_share_30",
    source: "Bundesministerium der Finanzen, BMF-Schreiben vom 22.12.2025",
    url: BMF_2025_12_22_URL,
    asOf: "2025-12-22",
    value: (l) => msg("fact.bmf_drinks_share_30.value", {}, l),
  },
  min_wage_2026: { id: "min_wage_2026", source: WAGE_SOURCE, url: MILOV5_URL, asOf: "2026-01-01", value: (l) => msg("fact.min_wage_2026.value", {}, l) },
  min_wage_2027: { id: "min_wage_2027", source: WAGE_SOURCE, url: MILOV5_URL, asOf: "2027-01-01", value: (l) => msg("fact.min_wage_2027.value", {}, l) },
};

export const FACT_IDS: readonly FactId[] = ["vat_food_7", "vat_drinks_19", "vat_milk_takeaway_7", "bmf_drinks_share_30", "min_wage_2026", "min_wage_2027"];

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
