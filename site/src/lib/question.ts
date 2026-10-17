/**
 * The "What if…?" sentence /try writes for the owner, in a language. The report
 * page uses it too: when a link still carries the sentence /try generated, a
 * language switch rewrites it; a question the owner typed stays as it was.
 */
import { price } from "../../../src/engine/index.ts";
import type { RawInputs, TemplateId } from "../../../src/engine/types.ts";
import { getLang, setLang } from "../../../src/i18n/index.ts";
import type { Lang } from "../../../src/i18n/index.ts";
import { st } from "../messages.ts";

const num = (raw: RawInputs, k: string): number | undefined => (typeof raw[k] === "number" ? (raw[k] as number) : undefined);

/** The generated question, or null when the inputs do not have what it needs. */
export function generatedQuestion(template: TemplateId, raw: RawInputs, lang: Lang): string | null {
  const prev = getLang();
  setLang(lang);
  try {
    if (template === "lunch_offer") {
      const p = num(raw, "offer_price");
      return p !== undefined ? st("t.q_lunch", { price: price(p) }, lang) : null;
    }
    const from = num(raw, "current_price"), to = num(raw, "new_price");
    if (from === undefined || to === undefined) return null;
    const item = typeof raw.item === "string" ? raw.item.trim() : "";
    return item ? st("t.q_price", { item, from: price(from), to: price(to) }, lang) : st("t.q_price_noitem", { from: price(from), to: price(to) }, lang);
  } finally {
    setLang(prev);
  }
}
