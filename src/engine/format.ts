import { getLang, LOCALE, pluralCategory, fill } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";

/**
 * Number formatting in the current language: "€9.90" in English, "9,90 €" in German,
 * Spanish and Polish. Negative numbers use a real minus sign (−).
 *
 * Also the small helpers every engine file shares (n, has, ceilUp, pc, eur, seur),
 * so one formula and one rounding rule live in one place.
 */

const KNOWN = new Set(["EUR", "USD", "GBP", "CHF"]);

let currency = "EUR";

/** The engine formats money in one currency per analysis. */
export function setCurrency(code: string): void {
  currency = KNOWN.has(code) ? code : "EUR";
}

/** The currency code money is currently formatted in ("EUR" when an unknown code was set). */
export function getCurrency(): string {
  return currency;
}

export function locale(): string {
  return LOCALE[getLang()];
}

/** Intl formatters are slow to build; keep one per locale and options. */
const cache = new Map<string, Intl.NumberFormat>();
function nf(kind: "money" | "percent" | "number", digits: number): Intl.NumberFormat {
  const loc = locale();
  const key = `${loc}|${kind}|${digits}|${kind === "money" ? currency : ""}`;
  let f = cache.get(key);
  if (!f) {
    f =
      kind === "money"
        ? new Intl.NumberFormat(loc, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
        : kind === "percent"
          ? new Intl.NumberFormat(loc, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits })
          : new Intl.NumberFormat(loc, { maximumFractionDigits: digits });
    cache.set(key, f);
  }
  return f;
}

export function sym(): string {
  const part = nf("money", 2).formatToParts(0).find((p) => p.type === "currency");
  return part?.value ?? "€";
}

const minus = (s: string) => s.replace(/^-/, "−").replace(/−?-(?=\S)/, "−");

/** Money for totals: no cents from 100 up. */
export function money(n: number, cents = Math.abs(n) < 100): string {
  const digits = cents ? 2 : 0;
  const v = cents ? Math.round(n * 100) / 100 : Math.round(n);
  const f = nf("money", digits);
  const s = f.format(Math.abs(v));
  return v < 0 && s !== f.format(0) ? `−${s}` : s;
}

/** Money per item, and every amount inside a "show the maths" line: always with cents. */
export function price(n: number): string {
  return money(n, true);
}

export function pct(share: number, digits = 0): string {
  return minus(nf("percent", digits).format(share));
}

export function num(n: number, digits = 1): string {
  return minus(nf("number", Number.isInteger(n) ? 0 : digits).format(n));
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((n + Math.sign(n) * 1e-9) * f) / f;
}

/** Rounds to the cent: every building block of the maths is a cent amount, as on a receipt. */
export const r2 = (n: number): number => round(n, 2);
/** Rounds to one decimal (average customers a day: 11.4). */
export const r1 = (n: number): number => round(n, 1);

export function signed(n: number): string {
  return n > 0 ? `+${money(n)}` : money(n);
}

/** Signed money with cents, for maths lines. */
export function signedPrice(n: number): string {
  return n > 0 ? `+${price(n)}` : price(n);
}

/** A share as a percentage with its sign: +4%, −12%, 0%. One decimal only when needed (−9.2%). */
export function signedPct(share: number, digits?: number): string {
  const d = digits ?? (Number.isInteger(Math.round(share * 1e6) / 1e4) ? 0 : 1);
  const body = pct(Math.abs(share), d);
  if (body === pct(0, d)) return body;
  return `${share > 0 ? "+" : "−"}${body}`;
}

/** English-only helper kept for old call sites; translated text should use plural forms from the catalog. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${Math.abs(n) === 1 ? one : many}`;
}

/** Picks a plural form for n in the current language and fills {n} with the formatted number. */
export function forms(n: number, f: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, lang: Lang = getLang()): string {
  const cat = Number.isInteger(n) ? pluralCategory(n, lang) : "other";
  return fill(f[cat] ?? f.other, { n: num(n) });
}

// ---------------------------------------------------------------------------
// Shared helpers for the engine files
// ---------------------------------------------------------------------------

export const EPS = 1e-9;
export type Values = Record<string, number | string>;

/** A number from the values, or the default. */
export const n = (v: Values, k: string, d = 0): number => {
  const x = v[k];
  return typeof x === "number" && Number.isFinite(x) ? x : d;
};
export const has = (v: Values, k: string): boolean => typeof v[k] === "number";
/** Whole customers or items, rounded up, never below zero (float-safe: 7.0000000001 stays 7). */
export const ceilUp = (q: number): number => Math.max(0, Math.ceil(q - EPS));
/** 32%, or 32.5% when the share needs a decimal. */
export const pc = (s: number): string => pct(s, Number.isInteger(Math.round(s * 1e6) / 1e4) ? 0 : 1);
/** Totals in plain sentences: whole euros from €10 up ("about €56 down"); maths lines keep the cents. */
export const eur = (x: number): string => money(x, Math.abs(x) < 10 && Math.abs(x) >= 0.005);
export const seur = (x: number): string => (x > 0 ? `+${eur(x)}` : eur(x));
/** "a, b and c" in the current language ("a, b und c", "a, b y c", "a, b i c"). */
export function list(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}
