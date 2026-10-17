import { fill, pluralCategory } from "../i18n/index.ts";
import type { Lang, Msg, Params } from "../i18n/index.ts";
import { num } from "./format.ts";

export type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** A catalog message with plural forms chosen by p.n; {n} becomes the number written in the current language. */
export const P =
  (f: Forms): Msg =>
  (p: Params, lang: Lang) => {
    const x = Number(p.n);
    const cat = Number.isInteger(x) ? pluralCategory(x, lang) : "other";
    return fill(f[cat] ?? f.other, { ...p, n: Number.isFinite(x) ? num(x, 2) : String(p.n) });
  };

/** "flat white" → "flat whites", "sandwich" → "sandwiches", "pastry" → "pastries" (English only). */
export function pluralItem(item: string): string {
  if (/(s|x|z|ch|sh)$/i.test(item)) return `${item}es`;
  if (/[^aeiou]y$/i.test(item)) return `${item.slice(0, -1)}ies`;
  return `${item}s`;
}
