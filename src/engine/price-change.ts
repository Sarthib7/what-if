/**
 * Price change on one item: the deterministic maths.
 *
 * The guess that drives the result is v, the change in weekly sales (a share: −0.04 = 4% fewer).
 *
 *   margin now          m_old = current_price − unit_cost
 *   margin at new price m_new = new_price − unit_cost
 *   weekly, old         units × m_old
 *   weekly, new(v)      units × (1 + v) × m_new
 *   delta_week(v)  = new(v) − old ;  delta_month = × 4.33 ;  delta over test = delta_week × test_days / 7
 *   break-even v   = m_old / m_new − 1  (the change in sales at which you make exactly what you make now)
 */
import { money, num, pct, price, round, signed, signedPct } from "./format.ts";
import type { Analysis, Figure, ResolvedInput, Scenario, SensitivityPoint, Source, Unit } from "./types.ts";

export const WEEKS_PER_MONTH = 4.33;
const EPS = 1e-9;

type Values = Record<string, number | string>;
type Body = Pick<
  Analysis,
  "current" | "scenarios" | "breakEven" | "worstCase" | "biggestUncertainty" | "sensitivity" | "lessons" | "nextQuestions" | "warnings"
>;

const n = (v: Values, k: string, d = 0): number => {
  const x = v[k];
  return typeof x === "number" && Number.isFinite(x) ? x : d;
};
const pc = (s: number): string => pct(s, Number.isInteger(Math.round(s * 1e6) / 1e4) ? 0 : 1);
const spc = (s: number): string => signedPct(s);
/** Totals in plain sentences: whole euros from €10 up; the maths strings keep the cents. */
const eur = (x: number): string => money(x, Math.abs(x) < 10 && Math.abs(x) >= 0.005);
const seur = (x: number): string => (x > 0 ? `+${eur(x)}` : eur(x));

function fig(id: string, label: string, value: number, unit: Unit, source: Source, maths: string): Figure {
  return { id, label, value: unit === "share" ? round(value, 4) : round(value, 2), unit, source, maths };
}

function fromSources(src: Record<string, Source>, keys: string[]): Source {
  const s = keys.map((k) => src[k]);
  if (s.includes("demo")) return "demo";
  if (s.includes("assumption")) return "assumption";
  return "calculation";
}

/** "flat white" → "flat whites", "sandwich" → "sandwiches", "pastry" → "pastries". */
export function pluralItem(item: string): string {
  if (/(s|x|z|ch|sh)$/i.test(item)) return `${item}es`;
  if (/[^aeiou]y$/i.test(item)) return `${item.slice(0, -1)}ies`;
  return `${item}s`;
}

export interface PriceModel {
  item: string;
  items: string;
  oldPrice: number;
  newPrice: number;
  unitCost: number;
  units: number;
  days: number;
  mOld: number;
  mNew: number;
  rise: boolean;
  weekOld: number;
  reachable: boolean;
  /** The change in sales (share) at which you make exactly what you make now. */
  beV: number | null;
  /** Sales a week you can lose (price rise) or must gain (price cut) at break-even, in whole items. */
  beUnits: number | null;
  unitsAt(v: number): number;
  weekNew(v: number): number;
  deltaWeek(v: number): number;
  deltaMonth(v: number): number;
  deltaTest(v: number): number;
}

export function priceModel(v: Values): PriceModel {
  const item = typeof v.item === "string" && v.item.trim() ? v.item.trim() : "item";
  const oldPrice = n(v, "current_price"), newPrice = n(v, "new_price"), unitCost = n(v, "unit_cost");
  const units = n(v, "units_per_week"), days = Math.max(1, n(v, "test_days", 14));
  const mOld = oldPrice - unitCost, mNew = newPrice - unitCost;
  const weekOld = units * mOld;
  const reachable = mNew > EPS;
  const beV = reachable ? mOld / mNew - 1 : null;
  let beUnits: number | null = null;
  if (beV !== null) beUnits = beV <= 0 ? Math.max(0, Math.floor(units * -beV + EPS)) : Math.ceil(units * beV - EPS);
  const weekNew = (x: number) => units * (1 + x) * mNew;
  const deltaWeek = (x: number) => weekNew(x) - weekOld;
  return {
    item, items: pluralItem(item), oldPrice, newPrice, unitCost, units, days, mOld, mNew, rise: newPrice >= oldPrice, weekOld, reachable, beV, beUnits,
    unitsAt: (x) => units * (1 + x),
    weekNew,
    deltaWeek,
    deltaMonth: (x) => deltaWeek(x) * WEEKS_PER_MONTH,
    deltaTest: (x) => (deltaWeek(x) * days) / 7,
  };
}

export function priceHeadline(v: Values) {
  const m = priceModel(v);
  const likely = n(v, "volume_likely"), low = n(v, "volume_low");
  const wl = m.deltaTest(low);
  return {
    breakEven: m.beV === null ? null : round(m.beV, 4),
    breakEvenText: m.beV === null ? "out of reach" : spc(m.beV),
    netTestExpected: round(m.deltaTest(likely)),
    netMonthExpected: round(m.deltaMonth(likely)),
    worstCase: round(wl < 0 ? wl : 0),
  };
}

/** "you can lose up to 57 sales a week (9.2%)" / "you need 64 more sales a week (10.3%)". */
function beWords(m: PriceModel): string {
  if (m.beV === null || m.beUnits === null) return "no change in sales can make up for it, because each sale leaves nothing after ingredients";
  return m.beV <= 0
    ? `you can sell up to ${num(m.beUnits)} fewer a week (${pc(-m.beV)} of ${num(m.units)}) and still make as much as now`
    : `you need to sell at least ${num(m.beUnits)} more a week (${pc(m.beV)} more than ${num(m.units)}) just to make as much as now`;
}

export function analyzePrice(inputs: ResolvedInput[], demo: boolean): Body {
  const v = Object.fromEntries(inputs.map((i) => [i.key, i.value])) as Values;
  const src = Object.fromEntries(inputs.map((i) => [i.key, i.source])) as Record<string, Source>;
  const m = priceModel(v);
  const low = n(v, "volume_low"), likely = n(v, "volume_likely"), high = n(v, "volume_high");
  const { item, items, days } = m;
  const change = m.newPrice - m.oldPrice;

  // ---- Current path ------------------------------------------------------
  const current: Figure[] = [
    fig("units_per_week", "Sales per week now", m.units, "units/week", src.units_per_week ?? "owner", `${num(m.units)} ${items} a week`),
    fig("margin_now", "What each sale leaves you now, after ingredients", m.mOld, "EUR", fromSources(src, ["current_price", "unit_cost"]),
      `${price(m.oldPrice)} − ${price(m.unitCost)} ingredients = ${price(m.mOld)} per ${item}`),
    fig("margin_new", "What each sale would leave at the new price", m.mNew, "EUR", fromSources(src, ["new_price", "unit_cost"]),
      `${price(m.newPrice)} − ${price(m.unitCost)} ingredients = ${price(m.mNew)} per ${item}`),
    fig("left_week_now", "Left after ingredients per week, now", m.weekOld, "EUR/week", fromSources(src, ["units_per_week", "current_price", "unit_cost"]),
      `${num(m.units)} × ${price(m.mOld)} = ${money(m.weekOld)} a week`),
    fig("left_month_now", "Left after ingredients per month, now", m.weekOld * WEEKS_PER_MONTH, "EUR/month",
      fromSources(src, ["units_per_week", "current_price", "unit_cost"]),
      `${money(m.weekOld)} × ${WEEKS_PER_MONTH} weeks = ${money(m.weekOld * WEEKS_PER_MONTH)} a month`),
  ];

  // ---- Scenarios ---------------------------------------------------------
  const scenario = (id: Scenario["id"], label: string, guessName: string, key: string, x: number): Scenario => {
    const u = m.unitsAt(x), wn = m.weekNew(x), dw = m.deltaWeek(x), dt = m.deltaTest(x), dm = m.deltaMonth(x);
    const figures: Figure[] = [
      fig("volume_change", "Change in sales", x, "share", src[key] ?? "assumption", `${guessName}: sales change by ${spc(x)}. Nobody knows this yet; the test measures it.`),
      fig("units_week", "Sales per week at the new price", u, "units/week", "calculation",
        `${num(m.units)} × (100% ${x < 0 ? "−" : "+"} ${pc(Math.abs(x))}) = ${num(round(u, 1))} a week`),
      fig("left_week", "Left after ingredients per week, new price", wn, "EUR/week", "calculation", `${num(round(u, 1))} × ${price(m.mNew)} = ${money(wn)} a week`),
      fig("delta_week", "Difference per week", dw, "EUR/week", "calculation", `${money(wn)} − ${money(m.weekOld)} now = ${signed(dw)} a week`),
      fig("delta_test", `Difference over the test (${num(days)} days)`, dt, "EUR", "calculation", `${signed(dw)} × ${num(days)} ÷ 7 days = ${signed(dt)}`),
      fig("delta_month", "Difference per month if you keep it", dm, "EUR/month", "calculation", `${signed(dw)} × ${WEEKS_PER_MONTH} weeks = ${signed(dm)} a month`),
    ];
    const about = `If sales change by ${spc(x)} (about ${num(Math.round(u))} a week)`;
    const plain =
      dw >= 0
        ? `${about}, you make ${eur(dw)} more a week than now: ${eur(dt)} over the ${num(days)}-day test and about ${eur(dm)} a month.`
        : `${about}, you make ${eur(-dw)} less a week than now: ${eur(-dt)} less over the ${num(days)}-day test and about ${eur(-dm)} a month.`;
    return { id, label, assumptionLabel: "Change in sales", assumptionValue: x, assumptionUnit: "share", figures, netTest: round(dt), netMonth: round(dm), plain };
  };
  const scenarios: Scenario[] = [
    scenario("cautious", "Cautious", "Your cautious guess", "volume_low", low),
    scenario("expected", "Expected", "Your likely guess", "volume_likely", likely),
    scenario("optimistic", "Optimistic", "Your optimistic guess", "volume_high", high),
  ];

  // ---- Break-even --------------------------------------------------------
  const breakEven: Body["breakEven"] = {
    value: m.beV === null ? 0 : round(m.beV, 4),
    unit: "share",
    label: m.rise ? "Drop in sales you can absorb before you are worse off" : "Rise in sales you need to be better off",
    maths:
      m.beV === null || m.beUnits === null
        ? `${price(m.newPrice)} − ${price(m.unitCost)} = ${price(m.mNew)} per ${item}: nothing left after ingredients.`
        : `${price(m.mOld)} now ÷ ${price(m.mNew)} at the new price − 1 = ${spc(m.beV)}. ${pc(Math.abs(m.beV))} of ${num(m.units)} a week = ${num(m.beUnits)} ${items}.`,
    plain:
      m.beV === null
        ? `At ${price(m.newPrice)} each ${item} leaves nothing after ingredients, so ${beWords(m)}.`
        : `At ${price(m.newPrice)} each ${item} leaves ${price(m.mNew)} instead of ${price(m.mOld)}, so ${beWords(m)}. ${m.beV <= 0 ? "Lose more than that and you are worse off." : "Sell fewer than that and you are worse off."}`,
    reachable: m.reachable,
  };

  // ---- Worst case --------------------------------------------------------
  const wl = m.deltaTest(low);
  const worstCase: Body["worstCase"] = {
    value: round(wl < 0 ? wl : 0),
    maths: `(${num(round(m.unitsAt(low), 1))} × ${price(m.mNew)} − ${num(m.units)} × ${price(m.mOld)}) × ${num(days)} ÷ 7 days = ${signed(wl)}`,
    plain:
      wl < 0
        ? `If sales ${low < 0 ? `fell by ${pc(-low)}` : `changed by ${spc(low)}`} (your cautious guess), the ${num(days)}-day test would leave you ${eur(-wl)} worse off than keeping the old price. You can change the price back at any time, so that is the most at stake.`
        : `Even at your cautious guess (${spc(low)} sales), the new price earns at least as much as today, so the test has no downside in money. The real risk is how regulars feel, which the test also shows.`,
  };

  // ---- Biggest uncertainty (tornado) ------------------------------------
  const at = (patch: Values) => priceModel({ ...v, ...patch }).deltaTest(likely);
  const c = m.unitCost;
  const tornado = [
    { key: "volume_likely", label: `Change in sales (${spc(low)} to ${spc(high)})`, swing: Math.abs(m.deltaTest(high) - m.deltaTest(low)) },
    { key: "unit_cost", label: `Ingredients per ${item} (${price(c * 0.85)} to ${price(c * 1.15)})`, swing: Math.abs(at({ unit_cost: c * 1.15 }) - at({ unit_cost: c * 0.85 })) },
  ]
    .map((t) => ({ ...t, swing: round(t.swing) }))
    .sort((a, b) => b.swing - a.swing);
  const top = tornado[0]!;
  const biggestUncertainty: Body["biggestUncertainty"] = {
    key: top.key,
    label: top.label,
    swing: top.swing,
    plain:
      top.key === "volume_likely"
        ? `Whether sales change by ${spc(low)} or ${spc(high)} changes the test result by ${eur(top.swing)} — more than anything else. That is what your test should measure: count the ${items} you sell each week.`
        : `What each ${item} really costs you to make (${price(c * 0.85)} to ${price(c * 1.15)}) changes the test result by ${eur(top.swing)} — more than how customers react. Cost one ${item} carefully from your supplier invoices before you start.`,
    ranking: tornado,
  };

  // ---- Sensitivity (the slider) -----------------------------------------
  const lo = Math.max(-1, Math.min(-0.3, Math.floor((Math.min(low, m.beV ?? 0) - 0.02) * 100) / 100));
  const hi = Math.max(0.05, Math.ceil((Math.max(high, m.beV ?? 0) + 0.02) * 100) / 100);
  const kLo = Math.round(lo * 100), kHi = Math.round(hi * 100);
  const stepK = kHi - kLo > 120 ? Math.ceil((kHi - kLo) / 120) : 1;
  const points: SensitivityPoint[] = [];
  for (let k = kLo; k <= kHi; k += stepK) {
    const x = k / 100;
    points.push({ x, netTest: round(m.deltaTest(x)), netMonth: round(m.deltaMonth(x)), explanation: explainVolume(m, x) });
  }
  const sensitivity: Body["sensitivity"] = {
    key: "volume_likely",
    label: "Change in sales",
    unit: "share",
    current: likely,
    breakEvenX: m.beV === null ? null : round(m.beV, 4),
    points,
  };

  // ---- Lessons -----------------------------------------------------------
  const lessons: string[] = [];
  const cents = `${Math.round(Math.abs(change) * 100)}-cent`;
  if (m.reachable && m.mOld > 0) {
    const rel = m.mNew / m.mOld - 1;
    lessons.push(
      m.rise
        ? `A ${cents} rise looks small, but ingredients cost the same, so all of it is extra margin: each ${item} leaves ${price(m.mNew)} instead of ${price(m.mOld)}, ${pc(rel)} more per sale.`
        : `A ${cents} cut takes ${pc(-rel)} off what each ${item} leaves you (${price(m.mOld)} → ${price(m.mNew)}), because ingredients cost the same. You need more sales just to stand still.`,
    );
  }
  if (m.beV !== null && m.beUnits !== null) {
    if (m.beV <= 0)
      lessons.push(
        likely >= m.beV
          ? `Break-even is the number to beat: you can lose up to ${num(m.beUnits)} sales a week (${pc(-m.beV)}) before you are worse off. Your likely guess is ${likely === 0 ? "no change" : `${spc(likely)} (about ${num(Math.round(m.units * Math.abs(likely)))} ${likely < 0 ? "fewer" : "more"})`}, inside that. The test checks the guess.`
          : `You can lose up to ${num(m.beUnits)} sales a week (${pc(-m.beV)}) before you are worse off, but your likely guess is a bigger drop (${spc(likely)}). On your own numbers the new price earns less than today.`,
      );
    else
      lessons.push(
        likely >= m.beV
          ? `To make up for the lower price you need ${num(m.beUnits)} more sales a week (${spc(m.beV)}). Your likely guess (${spc(likely)}) gets there, if it is right. The test checks the guess.`
          : `To make up for the lower price you need ${num(m.beUnits)} more sales a week (${spc(m.beV)}), but your likely guess is ${spc(likely)}. On your own numbers the cut earns less than today.`,
      );
  }
  if (wl < 0)
    lessons.push(`At your cautious guess (${spc(low)}) the ${num(days)}-day test costs about ${eur(-wl)}. A price can be changed back the next morning, which makes this one of the cheapest things to test.`);
  lessons.push(`The number that matters most: ${biggestUncertainty.plain.charAt(0).toLowerCase()}${biggestUncertainty.plain.slice(1)}`);
  lessons.push("This method works for any decision: write down your numbers, work out the break-even, then run a small test with a limit to check the one guess that matters most.");

  // ---- Next questions ----------------------------------------------------
  const guessed = (k: string) => src[k] === "assumption" && inputs.find((i) => i.key === k)?.note !== undefined;
  const nextQuestions: string[] = [];
  if (demo) nextQuestions.push(`These are demo numbers for a made-up café. Which ones are furthest from yours? Start with how many ${items} you sell a week and what they cost to make.`);
  if (guessed("volume_low") || guessed("volume_high"))
    nextQuestions.push(`What would "customers really disliked it" and "nobody minded" look like for you? Give your own guesses instead of What-IF's ${spc(low)} and ${spc(high)}.`);
  if (guessed("test_days")) nextQuestions.push(`How many days could you try the new price before deciding? What-IF assumed ${num(days)}.`);
  nextQuestions.push(`Look at the last 4 weeks in your till's item report: is ${num(m.units)} a week steady, or does it swing? A steady baseline makes the test easier to read.`);
  nextQuestions.push(`What would regulars buy instead? If a cheaper drink's sales rise during the test, people are trading down rather than leaving.`);

  // ---- Warnings ----------------------------------------------------------
  const warnings: string[] = [];
  if (!m.reachable) warnings.push(`At ${price(m.newPrice)} each ${item} leaves nothing after ingredients (${price(m.unitCost)}).`);
  else if (m.beV !== null) {
    if (likely < m.beV) warnings.push(`Your likely guess (${spc(likely)}) is below break-even (${spc(m.beV)}): on your own numbers the new price earns less than today.`);
    else if (low < m.beV) warnings.push(`At your cautious guess (${spc(low)}) the new price earns less than today (break-even is ${spc(m.beV)}). That is the risk the test checks.`);
    if (m.beV > 0.5) warnings.push(`You would need ${pc(m.beV)} more sales to make up for the cut. That is a lot to ask of one price change.`);
  }
  if (m.oldPrice > 0 && Math.abs(change) / m.oldPrice > 0.2)
    warnings.push(`A change of ${pc(Math.abs(change) / m.oldPrice)} at once is very noticeable. A smaller step is easier to test and to undo.`);
  if (m.mOld <= 0) warnings.push(`At today's price each ${item} already leaves nothing after ingredients (${price(m.oldPrice)} − ${price(m.unitCost)}).`);

  return { current, scenarios, breakEven, worstCase, biggestUncertainty, sensitivity, lessons, nextQuestions, warnings };
}

/** "Why this number": the calculation for one slider position, in words. */
export function explainVolume(m: PriceModel, x: number): string {
  const u = m.unitsAt(x), wn = m.weekNew(x), dw = m.deltaWeek(x);
  let s = `If sales change by ${spc(x)} (about ${num(Math.round(u))} a week): ${num(round(u, 1))} × ${price(m.mNew)} = ${eur(wn)} a week left after ingredients, against ${eur(m.weekOld)} now. That is ${seur(dw)} a week, ${seur(m.deltaTest(x))} over ${num(m.days)} days and about ${seur(m.deltaMonth(x))} a month.`;
  if (m.beV !== null)
    s += x >= m.beV - EPS
      ? " Better off than today, or level."
      : m.rise
        ? " Worse off than today: the higher margin does not make up for the lost sales."
        : " Worse off than today: the extra sales do not make up for the lower margin.";
  return s;
}

/** One "why this changed" sentence for a single input moved from `b` to `a`. */
export function explainPriceChange(key: string, b: Values, a: Values, label = key.replace(/_/g, " ")): { text: string; mentionsWorst: boolean } {
  const mb = priceModel(b), ma = priceModel(a);
  const hb = priceHeadline(b), ha = priceHeadline(a);
  const from = n(b, key), to = n(a, key);
  const up = to > from;
  const effect = (): string => {
    const parts: string[] = [];
    if (mb.beV !== null && ma.beV !== null && mb.beUnits !== null && ma.beUnits !== null) {
      if (Math.abs(ma.beV - mb.beV) > 1e-6) {
        if (ma.beV <= 0 && mb.beV <= 0)
          parts.push(`you can now lose up to ${pc(-ma.beV)} of sales (${num(ma.beUnits)} a week) instead of ${pc(-mb.beV)} (${num(mb.beUnits)}) before you are worse off`);
        else parts.push(`break-even moves from ${spc(mb.beV)} to ${spc(ma.beV)} change in sales`);
      } else parts.push(`break-even stays at ${spc(mb.beV)}`);
    } else if (ma.beV === null) parts.push("break-even is out of reach, because each sale leaves nothing after ingredients");
    if (Math.abs(ha.netTestExpected - hb.netTestExpected) >= 0.005)
      parts.push(`the expected test result goes from ${seur(hb.netTestExpected)} to ${seur(ha.netTestExpected)}`);
    return parts.join(", and ");
  };
  const so = (cause: string) => `${cause}, so ${effect()}.`;
  switch (key) {
    case "new_price":
      return { text: so(`You changed the new price from ${price(from)} to ${price(to)}. Each ${mb.item} would leave ${price(ma.mNew)} instead of ${price(mb.mNew)}`) + " This assumes customers react the same way; a bigger rise may lose more sales, which the test shows.", mentionsWorst: false };
    case "current_price":
      return { text: so(`Today's price went from ${price(from)} to ${price(to)}, so each ${mb.item} leaves ${price(ma.mOld)} now instead of ${price(mb.mOld)}: that is the bar the new price has to beat`), mentionsWorst: false };
    case "unit_cost":
      return { text: so(`Ingredients per ${mb.item} went ${up ? "up" : "down"} from ${price(from)} to ${price(to)}. Both margins move by ${price(Math.abs(to - from))} (now ${price(mb.mOld)} → ${price(ma.mOld)}, new price ${price(mb.mNew)} → ${price(ma.mNew)}), which changes how many sales the extra cents are worth`), mentionsWorst: false };
    case "units_per_week":
      return { text: so(`Weekly sales went from ${num(from)} to ${num(to)}. The same percentage change is now ${up ? "more" : "fewer"} ${mb.items}, so the money involved ${up ? "grows" : "shrinks"}; the break-even percentage depends only on prices and costs`), mentionsWorst: true };
    case "volume_likely":
      return {
        text: `You changed your likely guess from ${spc(from)} to ${spc(to)}. Each sale at the new price leaves ${price(mb.mNew)}, so the expected test result goes from ${seur(hb.netTestExpected)} to ${seur(ha.netTestExpected)}. Break-even stays at ${hb.breakEvenText}: it depends on prices and costs, not on your guess.`,
        mentionsWorst: false,
      };
    case "volume_low":
    case "volume_high": {
      const which = key === "volume_low" ? "cautious" : "optimistic";
      return {
        text: `Your ${which} guess changed from ${spc(from)} to ${spc(to)} (${seur(mb.deltaTest(from))} → ${seur(ma.deltaTest(to))} over the test). That only moves the ${which} scenario${key === "volume_low" ? " and the worst case" : ""}; break-even and the expected result stay the same.`,
        mentionsWorst: key === "volume_low",
      };
    }
    case "test_days":
      return { text: `The test now runs ${num(to)} days instead of ${num(from)}. The weekly numbers do not change; the totals over the test do (expected ${seur(hb.netTestExpected)} → ${seur(ha.netTestExpected)}, worst case ${seur(hb.worstCase)} → ${seur(ha.worstCase)}).`, mentionsWorst: true };
    case "item":
      return { text: `You changed the item from ${String(b.item ?? "")} to ${String(a.item ?? "")}. The numbers only change if its price, cost or sales do.`, mentionsWorst: false };
    default:
      return { text: so(`${label} changed from ${num(from)} to ${num(to)}`), mentionsWorst: false };
  }
}
