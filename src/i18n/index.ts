/**
 * Languages for the Berlin closed beta: German first, then English, Spanish, Polish.
 *
 * Each module keeps its own message catalog ({ en: {...}, de: {...}, es: {...}, pl: {...} })
 * and gets a translator from makeT(). English is complete and is the fallback for
 * any key a language has not translated yet. Browser-safe: no Node APIs.
 */

export type Lang = "de" | "en" | "es" | "pl";

export const LANGS: readonly Lang[] = ["de", "en", "es", "pl"];

/** The product default for Berlin. Library calls default to English until setLang() is called. */
export const DEFAULT_LANG: Lang = "de";

export const LANG_NAMES: Record<Lang, string> = { de: "Deutsch", en: "English", es: "Español", pl: "Polski" };

export const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-GB", es: "es-ES", pl: "pl-PL" };

let current: Lang = "en";

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

const ALIASES: Record<string, Lang> = {
  de: "de", deu: "de", ger: "de", german: "de", deutsch: "de",
  en: "en", eng: "en", english: "en", englisch: "en",
  es: "es", spa: "es", spanish: "es", "español": "es", espanol: "es", spanisch: "es",
  pl: "pl", pol: "pl", polish: "pl", polski: "pl", polnisch: "pl",
};

/** Accepts "de", "de-DE", "German", "Deutsch", "polski"…; anything else gives the fallback. */
export function normaliseLang(x: unknown, fallback: Lang = DEFAULT_LANG): Lang {
  if (typeof x !== "string") return fallback;
  const s = x.trim().toLowerCase();
  return ALIASES[s] ?? ALIASES[s.split(/[-_]/)[0] ?? ""] ?? fallback;
}

export type Params = Record<string, string | number>;
/** A message is a template with {name} placeholders, or a function for grammar a template cannot do. */
export type Msg = string | ((p: Params, lang: Lang) => string);
export type Catalog<K extends string> = { en: Record<K, Msg> } & Partial<Record<Exclude<Lang, "en">, Partial<Record<K, Msg>>>>;

export function fill(template: string, p: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
}

/** Returns t(key, params) bound to the current language, falling back to English per key. */
export function makeT<K extends string>(catalog: Catalog<K>) {
  return (key: K, params: Params = {}, lang: Lang = current): string => {
    const msg = (lang === "en" ? undefined : catalog[lang]?.[key]) ?? catalog.en[key];
    if (msg === undefined) return key;
    return typeof msg === "function" ? msg(params, lang) : fill(msg, params);
  };
}

/** Plural category for a count in a language ("one", "few", "many", "other"); Polish needs few/many. */
export function pluralCategory(n: number, lang: Lang = current): Intl.LDMLPluralRule {
  return new Intl.PluralRules(LOCALE[lang]).select(n);
}

/** Picks a plural form: plural(3, { one: "{n} Kunde", other: "{n} Kunden" }). Missing forms fall back to other. */
export function plural(n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, lang: Lang = current): string {
  const form = forms[pluralCategory(n, lang)] ?? forms.other;
  return fill(form, { n });
}
