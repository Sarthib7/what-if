import { getLang, isLang, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";

/** Runs fn with the language set to lang, then puts the previous language back. */
export function withLang<T>(lang: Lang | undefined, fn: () => T): T {
  if (!lang || !isLang(lang) || lang === getLang()) return fn();
  const prev = getLang();
  setLang(lang);
  try {
    return fn();
  } finally {
    setLang(prev);
  }
}

/** The language an analysis was written in; old analyses without one are English. */
export function langOf(a: { lang?: unknown }): Lang {
  return isLang(a.lang) ? a.lang : "en";
}
