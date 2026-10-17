/**
 * The change as customers see it, and the rounds of the rehearsal.
 *
 * Each round is a concrete, sensory moment ("Tuesday of the first week, 12:30…")
 * with a small menu of café-specific actions, always including "not around".
 * Public actions (telling a friend, a review, grumbling out loud) go into the
 * neighbourhood feed that later rounds see. Positive actions count toward
 * "engaged with the change": for a lunch offer, noticing or using the deal (not
 * carrying on as usual); for a price change, knowingly buying at the new price.
 *
 * Every word is in src/sim/messages.ts, in the rehearsal's language.
 */
import type { Analysis, TemplateId } from "../engine/types.ts";
import { LOCALE, type Lang } from "../i18n/index.ts";
import type { ActionKind, FeedItem, RoundAction, RoundSpec } from "./types.ts";
import { normaliseKiez, type SimKiez } from "./berlin.ts";
import { ACTION_LABELS, CHANGE_TEXT, LUNCH_PROMO, LUNCH_ROUNDS, PRICE_ROUNDS, centsWord, fillText, testLengthAdjective, testPhrase, type Tx } from "./messages.ts";

export type { ActionText, Cond, Line } from "./messages.ts";
export { ACTION_TEXT, AWAY, FRIEND, QUESTIONS } from "./messages.ts";

// ---------------------------------------------------------------- text helpers

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " };
const KNOWN_CURRENCIES = new Set(["EUR", "USD", "GBP", "CHF"]);

/** A price with cents in the analysis currency: "€9.90" in English, "9,90 €" in German, Spanish and Polish. */
export function money(n: number, currency = "EUR", lang: Lang = "en"): string {
  const v = Math.abs(n);
  if (lang === "en" || !KNOWN_CURRENCIES.has(currency)) return `${SYMBOL[currency] ?? "€"}${v.toFixed(2)}`;
  return new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

/** A small difference in words ("30 cents", "30 Cent"), or money when it is a unit or more. */
export function difference(n: number, currency = "EUR", lang: Lang = "en"): string {
  const abs = Math.abs(n);
  if (abs >= 1 - 1e-9) return money(abs, currency, lang);
  return centsWord(Math.round(abs * 100), lang, currency);
}

/** Replaces {name} placeholders; unknown ones are left as they are. */
export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

export function tr(t: Tx, lang: Lang): string {
  return t[lang] ?? t.en;
}

// ---------------------------------------------------------------- owner input, capped

/** Owner text is capped before any processing, so no pattern ever runs on a long string. */
export const OWNER_TEXT_CAPS = { business: 200, cafe: 60, contents: 80, item: 40, kiez: 60 } as const;

function inputNum(a: Analysis, key: string): number | undefined {
  const v = a.inputs.find((i) => i.key === key)?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function inputStr(a: Analysis, key: string, cap: number): string | undefined {
  const v = a.inputs.find((i) => i.key === key)?.value;
  if (typeof v !== "string") return undefined;
  const s = v.slice(0, cap * 2).replace(/\s+/g, " ").trim().slice(0, cap).trim();
  return s || undefined;
}

/**
 * "Café Lindenblatt (demo café, Berlin-Neukölln)" → "Café Lindenblatt".
 * Linear time on any input: the name is cut to 200 characters first and the
 * trailing "(…)" is found with indexOf, not a backtracking pattern.
 */
export function cafeName(business: string, lang: Lang = "en"): string {
  let s = (typeof business === "string" ? business : "").slice(0, OWNER_TEXT_CAPS.business).trim();
  if (s.endsWith(")")) {
    const open = s.lastIndexOf("(");
    if (open >= 0 && s.indexOf(")", open) === s.length - 1) s = s.slice(0, open).trim();
  }
  s = s.replace(/\s+/g, " ").slice(0, OWNER_TEXT_CAPS.cafe).trim();
  return s || tr(CHANGE_TEXT.cafeFallback, lang);
}

// ---------------------------------------------------------------- the change

export interface ChangeContext {
  template: TemplateId;
  lang: Lang;
  /** The Kiez the café is in, when the owner gave one. */
  kiez?: SimKiez;
  /** The café's name as customers know it. */
  cafe: string;
  currency: string;
  /** Exactly what the sign says. */
  board: string;
  /** One line for the report ("Lunch deal: soup, sandwich and a drink for €9.90, weekdays 11:30–14:30"). */
  change: string;
  /** The café's own post at the top of the neighbourhood feed. */
  announcement: string;
  /** The owner is paying to promote it (only whether, never how much). */
  promoted: boolean;
  /** "two-week": the test length as an English adjective (kept for RehearsalScene). */
  testLength: string;
  /** The test as a noun phrase in the rehearsal language ("two-week test", "zweiwöchigen Tests"). */
  testPhrase: string;
  offerPrice: number;
  contents: string;
  hours: string;
  item: string;
  oldPrice: number;
  newPrice: number;
  /** What personas' usual spend is scaled from: the lunch spend, or the item's current price. */
  baseSpend: number;
}

/** Language of an analysis (older analyses without one: English). */
export function langOf(a: { lang?: unknown }): Lang {
  const l = a.lang;
  return l === "de" || l === "en" || l === "es" || l === "pl" ? l : "en";
}

/** The Kiez in the analysis inputs, if it is one the rehearsal knows. */
export function kiezOf(a: Analysis): SimKiez | undefined {
  return normaliseKiez(inputStr(a, "kiez", OWNER_TEXT_CAPS.kiez));
}

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Reads the change from the analysis inputs. Uses only what a customer could see; never costs. */
export function changeContext(a: Analysis, langOverride?: Lang): ChangeContext {
  const lang = langOverride ?? langOf(a);
  const cafe = cafeName(a.business, lang);
  const currency = (a.currency || "EUR").slice(0, 3);
  const m = (n: number) => money(n, currency, lang);
  const promoted = (inputNum(a, "marketing_per_week") ?? 0) > 0;
  const hours = "11:30–14:30";
  const kiez = kiezOf(a);
  const t = (tx: Tx, vars: Record<string, string>) => fillText(tr(tx, lang), vars);
  if (a.template === "price_change") {
    const item = inputStr(a, "item", OWNER_TEXT_CAPS.item) ?? tr(CHANGE_TEXT.defaultItem, lang);
    const Item = ucFirst(item);
    const oldPrice = inputNum(a, "current_price") ?? 3.9;
    const newPrice = inputNum(a, "new_price") ?? oldPrice;
    const cut = newPrice < oldPrice;
    const vars = { item, Item, price: m(newPrice), old: m(oldPrice), el_item: `${esArticle(item)} ${item}` };
    const days = inputNum(a, "test_days") ?? 14;
    return {
      template: a.template,
      lang,
      ...(kiez ? { kiez } : {}),
      cafe,
      currency,
      board: t(cut ? CHANGE_TEXT.priceBoardCut : CHANGE_TEXT.priceBoard, vars),
      change: t(CHANGE_TEXT.priceChange, vars),
      announcement: t(cut ? CHANGE_TEXT.priceAnnounceCut : CHANGE_TEXT.priceAnnounce, vars),
      promoted,
      testLength: testLengthAdjective(days, 7),
      testPhrase: testPhrase(days, 7, lang),
      offerPrice: newPrice,
      contents: item,
      hours,
      item,
      oldPrice,
      newPrice,
      baseSpend: oldPrice,
    };
  }
  const offerPrice = inputNum(a, "offer_price") ?? 9.9;
  const contents =
    inputStr(a, "offer_description", OWNER_TEXT_CAPS.contents) ??
    inputStr(a, "offer_contents", OWNER_TEXT_CAPS.contents) ??
    inputStr(a, "offer_items", OWNER_TEXT_CAPS.contents) ??
    tr(CHANGE_TEXT.defaultContents, lang);
  const vars = { contents, price: m(offerPrice), hours };
  const baseSpend = inputNum(a, "lunch_spend") ?? inputNum(a, "avg_spend") ?? 10;
  const days = inputNum(a, "test_days") ?? 10;
  return {
    template: a.template,
    lang,
    ...(kiez ? { kiez } : {}),
    cafe,
    currency,
    board: t(CHANGE_TEXT.lunchBoard, vars),
    change: t(CHANGE_TEXT.lunchChange, vars),
    announcement: t(promoted ? CHANGE_TEXT.lunchPromoted : CHANGE_TEXT.lunchAnnounce, vars),
    promoted,
    testLength: testLengthAdjective(days, 5),
    testPhrase: testPhrase(days, 5, lang),
    offerPrice,
    contents,
    hours,
    item: "lunch",
    oldPrice: offerPrice,
    newPrice: offerPrice,
    baseSpend,
  };
}

// ---------------------------------------------------------------- articles for an owner-typed item

const DE_NEUTER = /(croissant|brötchen|broetchen|sandwich|stück|stueck|wasser|bier|frühstück|fruehstueck|müsli|muesli|getränk|getraenk|törtchen|gebäck|baguette|eis)$/i;
const DE_FEMININE = /(e|schorle|limo|limonade|brezel|waffel|quiche|tarte|milch|suppe|bowl)$/i;
const DE_MASC_E = /(kaffee|tee|käse|kaese|latte|white)$/i;

/** German articles for an item typed by the owner (a best guess: most coffee drinks are masculine). */
export function deArticles(item: string): { einen: string; der: string } {
  const w = item.trim().split(/\s+/).pop() ?? "";
  if (DE_NEUTER.test(w)) return { einen: "ein", der: "das" };
  if (DE_FEMININE.test(w) && !DE_MASC_E.test(w)) return { einen: "eine", der: "die" };
  return { einen: "einen", der: "der" };
}

/** Spanish definite article for an item (feminine for words ending in -a, else masculine). */
export function esArticle(item: string): "el" | "la" {
  const w = (item.trim().split(/\s+/)[0] ?? "").toLowerCase();
  return /a$/.test(w) && !/^(café|cafe)$/.test(w) ? "la" : "el";
}

export function withArticle(item: string): string {
  return /^[aeiou]/i.test(item.trim()) ? `an ${item}` : `a ${item}`;
}

/** Item placeholders for every language: {a_item} {einen_item} {der_item} {un_item} {el_item} {item} {Item}. */
export function itemVars(item: string): Record<string, string> {
  const de = deArticles(item);
  const es = esArticle(item);
  return {
    item,
    Item: ucFirst(item),
    a_item: withArticle(item),
    einen_item: `${de.einen} ${item}`,
    der_item: `${de.der} ${item}`,
    un_item: `${es === "la" ? "una" : "un"} ${item}`,
    el_item: `${es} ${item}`,
  };
}

// ---------------------------------------------------------------- actions

function act(id: string, flags: { public?: boolean; positive?: boolean; kind?: ActionKind } = {}): RoundAction {
  const kind: ActionKind = flags.kind ?? (id === "not_around" ? "away" : flags.positive ? "engaged" : "neutral");
  return { id, label: ACTION_LABELS[id]!.en, public: !!flags.public, positive: !!flags.positive, kind };
}

const ELSEWHERE: ActionKind = "elsewhere";

/** Every action any round can offer (English labels; rounds carry labels in the rehearsal language). */
export const ACTIONS: Record<string, RoundAction> = Object.fromEntries(
  [
    act("not_around"),
    // lunch offer
    act("notices_offer", { positive: true }),
    act("ignores"),
    act("tries_deal", { positive: true }),
    act("tries_and_tells", { public: true, positive: true }),
    act("usual_order"),
    act("eats_elsewhere", { kind: ELSEWHERE }),
    act("skips_lunch_out"),
    act("comes_back_for_deal", { positive: true }),
    act("back_to_usual"),
    act("tells_a_friend", { public: true, positive: true }),
    act("keeps_coming", { positive: true }),
    act("posts_review", { public: true, positive: true }),
    act("complains", { public: true }),
    act("forgets_about_it"),
    act("still_comes_for_lunch", { positive: true }),
    act("comes_now_and_then", { positive: true }),
    act("back_to_old_habits"),
    act("recommends_it", { public: true, positive: true }),
    // price change
    act("accepts", { positive: true }),
    act("grumbles", { public: true }),
    act("does_not_notice"),
    act("buys_as_usual", { positive: true }),
    act("buys_less_often"),
    act("switches_to_cheaper_item"),
    act("goes_elsewhere", { kind: ELSEWHERE }),
    act("keeps_buying", { positive: true }),
    act("tells_friend_it_is_pricey", { public: true }),
    act("forgot_about_it"),
    act("stays_away", { kind: ELSEWHERE }),
    act("stays_a_customer", { positive: true }),
    act("buys_less_than_before"),
    act("recommends_cafe_anyway", { public: true, positive: true }),
    act("mentions_price_in_review", { public: true }),
    act("still_buys_regularly", { positive: true }),
    act("buys_now_and_then"),
    act("found_somewhere_cheaper", { kind: ELSEWHERE }),
    act("recommends_cafe", { public: true, positive: true }),
  ].map((a) => [a.id, a]),
);

/** How the report should draw an action: "away" is only not_around; going to another place is "elsewhere". */
export function actionKind(id: string): ActionKind {
  return ACTIONS[id]?.kind ?? (id === "not_around" ? "away" : "neutral");
}

/** An action's label in a language. */
export function actionLabel(id: string, lang: Lang): string {
  const t = ACTION_LABELS[id];
  return t ? tr(t, lang) : id;
}

/** Where a public action shows up in the neighbourhood feed. */
export const FEED_KIND: Record<string, FeedItem["kind"]> = {
  tries_and_tells: "word_of_mouth",
  tells_a_friend: "word_of_mouth",
  posts_review: "review",
  complains: "word_of_mouth",
  recommends_it: "word_of_mouth",
  grumbles: "word_of_mouth",
  tells_friend_it_is_pricey: "word_of_mouth",
  recommends_cafe_anyway: "word_of_mouth",
  mentions_price_in_review: "review",
  recommends_cafe: "word_of_mouth",
};

/** Action groups the summary counts with (descriptive only). */
export const GROUPS = {
  /** Lunch offer: did something that clearly shows they took in the deal (not just carrying on as usual). */
  lunchNoticed: new Set([
    "notices_offer", "tries_deal", "tries_and_tells", "comes_back_for_deal", "tells_a_friend", "posts_review", "complains", "keeps_coming",
    "still_comes_for_lunch", "comes_now_and_then", "recommends_it",
  ]),
  lunchTried: new Set(["tries_deal", "tries_and_tells", "comes_back_for_deal"]),
  /** Had the deal: a first try, or coming for the deal (someone who starts on it late, e.g. after hearing about it). */
  lunchUsed: new Set(["tries_deal", "tries_and_tells", "comes_back_for_deal", "keeps_coming", "still_comes_for_lunch", "comes_now_and_then"]),
  /** Counts as coming back only when it follows a first try in an earlier round. */
  lunchReturn: new Set(["tries_deal", "tries_and_tells", "comes_back_for_deal", "keeps_coming", "still_comes_for_lunch", "comes_now_and_then"]),
  priceNoticed: new Set([
    "accepts", "grumbles", "buys_less_often", "switches_to_cheaper_item", "goes_elsewhere", "tells_friend_it_is_pricey", "stays_away",
    "buys_less_than_before", "recommends_cafe_anyway", "mentions_price_in_review", "found_somewhere_cheaper", "buys_now_and_then", "forgot_about_it",
  ]),
  priceReduced: new Set(["buys_less_often", "switches_to_cheaper_item", "goes_elsewhere", "stays_away", "buys_less_than_before", "buys_now_and_then", "found_somewhere_cheaper"]),
  priceElsewhere: new Set(["goes_elsewhere", "stays_away", "found_somewhere_cheaper"]),
  lunchElsewhere: new Set(["eats_elsewhere", "back_to_old_habits"]),
  /** Turning away from the café or the change (for "who told whom" links of the negative kind). */
  negative: new Set([
    "eats_elsewhere", "complains", "back_to_old_habits", "grumbles", "buys_less_often", "switches_to_cheaper_item", "goes_elsewhere",
    "tells_friend_it_is_pricey", "stays_away", "buys_less_than_before", "mentions_price_in_review", "buys_now_and_then", "found_somewhere_cheaper",
  ]),
  /** Positive actions that are only noticing, not acting (do not count as being won over by word of mouth). */
  noticeOnly: new Set(["notices_offer", "accepts"]),
} as const;

// ---------------------------------------------------------------- rounds

function acts(lang: Lang, ...ids: string[]): RoundAction[] {
  return ids.map((id) => {
    const a = ACTIONS[id];
    if (!a) throw new Error(`Unknown action ${id}`);
    return { ...a, label: actionLabel(id, lang) };
  });
}

type Draft = Omit<RoundSpec, "n">;

function roundVars(c: ChangeContext): Record<string, string> {
  return {
    cafe: c.cafe,
    board: c.board,
    test: c.testPhrase,
    old: money(c.oldPrice, c.currency, c.lang),
    kiez: c.kiez ? fillText(tr(CHANGE_TEXT.inKiez, c.lang), { kiez: c.kiez }) : "",
    promo: tr(c.promoted ? LUNCH_PROMO.promoted : LUNCH_PROMO.plain, c.lang),
  };
}

function draft(c: ChangeContext, text: { title: Tx; situation: Tx }, ids: string[]): Draft {
  const vars = roundVars(c);
  return { title: tr(text.title, c.lang), situation: fillText(tr(text.situation, c.lang), vars), actions: acts(c.lang, ...ids) };
}

function lunchRounds(c: ChangeContext, count: number): Draft[] {
  const r = LUNCH_ROUNDS;
  const r1 = draft(c, r.r1, ["notices_offer", "ignores", "not_around"]);
  const r2 = draft(c, r.r2, ["tries_deal", "tries_and_tells", "usual_order", "eats_elsewhere", "skips_lunch_out", "not_around"]);
  if (count <= 3) return [r1, r2, draft(c, r.end3, ["tries_deal", "comes_back_for_deal", "usual_order", "tells_a_friend", "complains", "eats_elsewhere", "not_around"])];
  const r3 = draft(c, r.r3, ["tries_deal", "comes_back_for_deal", "usual_order", "tells_a_friend", "eats_elsewhere", "not_around"]);
  const r4 = draft(c, r.r4, ["keeps_coming", "usual_order", "posts_review", "complains", "eats_elsewhere", "forgets_about_it", "not_around"]);
  if (count === 4) return [r1, r2, r3, r4];
  return [r1, r2, r3, r4, draft(c, r.r5, ["still_comes_for_lunch", "comes_now_and_then", "usual_order", "back_to_old_habits", "recommends_it", "not_around"])];
}

function priceRounds(c: ChangeContext, count: number): Draft[] {
  const r = PRICE_ROUNDS;
  const r1 = draft(c, r.r1, ["accepts", "grumbles", "does_not_notice", "not_around"]);
  const r2 = draft(c, r.r2, ["buys_as_usual", "buys_less_often", "switches_to_cheaper_item", "goes_elsewhere", "not_around"]);
  if (count <= 3) return [r1, r2, draft(c, r.end3, ["keeps_buying", "buys_less_often", "tells_friend_it_is_pricey", "recommends_cafe_anyway", "stays_away", "not_around"])];
  const r3 = draft(c, r.r3, ["keeps_buying", "buys_less_often", "tells_friend_it_is_pricey", "recommends_cafe_anyway", "stays_away", "not_around"]);
  const r4 = draft(c, r.r4, ["stays_a_customer", "buys_less_than_before", "recommends_cafe_anyway", "mentions_price_in_review", "found_somewhere_cheaper", "not_around"]);
  if (count === 4) return [r1, r2, r3, r4];
  return [r1, r2, r3, r4, draft(c, r.r5, ["still_buys_regularly", "buys_now_and_then", "found_somewhere_cheaper", "recommends_cafe", "not_around"])];
}

/** The rounds for this change: 3–5 (default 4), in the change's language. */
export function buildRounds(c: ChangeContext, count: number): RoundSpec[] {
  const n = Math.min(5, Math.max(3, Math.round(count)));
  const ctx: ChangeContext = { ...c, lang: c.lang ?? "en", testPhrase: c.testPhrase ?? testPhrase(14, 7, c.lang ?? "en") };
  const drafts = ctx.template === "price_change" ? priceRounds(ctx, n) : lunchRounds(ctx, n);
  return drafts.map((d, i) => ({ n: i + 1, ...d }));
}
