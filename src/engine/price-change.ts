/**
 * Price change on one item: the deterministic maths.
 *
 * The guess that drives the result is v, the change in weekly sales (a share: −0.04 = 4% fewer).
 * Prices are what customers pay; margins use the price after VAT: net = price ÷ (1 + vat_rate).
 *
 *   margin now          m_old = current_price ÷ (1 + vat) − unit_cost
 *   margin at new price m_new = new_price ÷ (1 + vat) − unit_cost
 *   weekly, old         units × m_old
 *   weekly, new(v)      units × (1 + v) × m_new        (units × (1 + v) to one decimal)
 *   delta_week(v)  = new(v) − old ;  delta_month = delta_week × 4.33 ;  delta over test = delta_week × test_days ÷ 7
 *   break-even v   = m_old ÷ m_new − 1  (the change in sales at which you make exactly what you make now; never below −100%)
 *
 * Optional, when the owner gives the staff hours a week paid at or near the minimum wage (minimum_wage_hours_per_week):
 *   wage rise a week    = hours × (€14.60 − €13.90) = hours × €0.70   (from 1 Jan 2027, the wage alone)
 *   left after the rise = delta_week(likely) − wage rise a week
 *
 * Every building block is rounded to the cent before it is used again, so each maths line checks out by hand.
 */
import { EMPLOYER_SHARE_GUESS, MIN_WAGE_2026, MIN_WAGE_2027, MIN_WAGE_RISE_2027, VAT_DRINKS } from "./berlin.ts";
import { EPS, eur, has, n, num, pc, price, r1, r2, round, seur, signedPct, signedPrice } from "./format.ts";
import type { Values } from "./format.ts";
import { continueSentence, fig, filledIn, fromSources, sourcesOf, valuesOf } from "./figures.ts";
import { msg as t } from "./messages.ts";
import { pluralItem } from "./plural.ts";
import type { Analysis, Figure, ResolvedInput, Scenario, SensitivityPoint, WageRiseCheck } from "./types.ts";

export const WEEKS_PER_MONTH = 4.33;

type Body = Pick<
  Analysis,
  "current" | "scenarios" | "breakEven" | "worstCase" | "biggestUncertainty" | "sensitivity" | "lessons" | "nextQuestions" | "warnings" | "wageRise"
>;

const spc = (s: number): string => signedPct(s);

export { pluralItem };

export interface PriceModel {
  item: string;
  items: string;
  oldPrice: number;
  newPrice: number;
  unitCost: number;
  vat: number;
  vatDiv: number;
  netOld: number;
  netNew: number;
  units: number;
  days: number;
  mOld: number;
  mNew: number;
  rise: boolean;
  weekOld: number;
  reachable: boolean;
  /** The change in sales (share) at which you make exactly what you make now (−1 when today's price already loses money). */
  beV: number | null;
  /** Sales a week you can lose (price rise) or must gain (price cut) at break-even, in whole items. */
  beUnits: number | null;
  /** Sales a week that keep you level: units × m_old ÷ m_new (one decimal). */
  levelUnits: number | null;
  unitsAt(v: number): number;
  /** Measured: the difference over `days` between selling `after` at the new price and `before` at the old one. */
  deltaMeasured(before: number, after: number, days: number): number;
  weekNew(v: number): number;
  deltaWeek(v: number): number;
  deltaMonth(v: number): number;
  deltaTest(v: number): number;
}

export function priceModel(v: Values): PriceModel {
  const item = typeof v.item === "string" && v.item.trim() ? v.item.trim() : t("price.itemFallback");
  const vat = has(v, "vat_rate") ? n(v, "vat_rate") : VAT_DRINKS;
  const vatDiv = round(1 + vat, 4);
  const oldPrice = n(v, "current_price"), newPrice = n(v, "new_price"), unitCost = n(v, "unit_cost");
  const units = n(v, "units_per_week"), days = Math.max(1, n(v, "test_days", 14));
  const mOld = r2(oldPrice / vatDiv - unitCost), mNew = r2(newPrice / vatDiv - unitCost);
  const weekOld = r2(units * mOld);
  const reachable = mNew > EPS;
  const beV = reachable ? Math.max(-1, mOld / mNew - 1) : null;
  let beUnits: number | null = null;
  let levelUnits: number | null = null;
  if (beV !== null) {
    levelUnits = Math.max(0, (units * Math.max(0, mOld)) / mNew);
    beUnits = beV <= 0 ? Math.max(0, Math.floor(units * -beV + EPS)) : Math.ceil(units * beV - EPS);
  }
  const unitsAt = (x: number) => r1(units * (1 + x));
  const weekNew = (x: number) => r2(unitsAt(x) * mNew);
  const deltaWeek = (x: number) => r2(weekNew(x) - weekOld);
  return {
    item, items: pluralItem(item), oldPrice, newPrice, unitCost, vat, vatDiv, netOld: r2(oldPrice / vatDiv), netNew: r2(newPrice / vatDiv), units, days, mOld, mNew,
    rise: newPrice >= oldPrice, weekOld, reachable, beV, beUnits, levelUnits,
    unitsAt,
    deltaMeasured: (before, after, d) => r2((r2(r2(after * mNew) - r2(before * mOld)) * d) / 7),
    weekNew,
    deltaWeek,
    deltaMonth: (x) => r2(deltaWeek(x) * WEEKS_PER_MONTH),
    deltaTest: (x) => r2((deltaWeek(x) * days) / 7),
  };
}

export function priceHeadline(v: Values) {
  const m = priceModel(v);
  const likely = n(v, "volume_likely"), low = n(v, "volume_low");
  const wl = m.deltaTest(low);
  return {
    breakEven: m.beV === null ? null : round(m.beV, 4),
    breakEvenText: m.beV === null ? t("price.outOfReach") : spc(m.beV),
    netTestExpected: m.deltaTest(likely),
    netMonthExpected: m.deltaMonth(likely),
    worstCase: wl < 0 ? wl : 0,
  };
}

/** "− €1,444.60 now" in a maths line, or "+ €68.20 you lose now" when today's price already loses money (never "− −"). */
function vsOld(m: PriceModel): string {
  return m.weekOld < 0 ? t("price.vsOldLoss", { old: price(-m.weekOld) }) : t("price.vsOld", { old: price(m.weekOld) });
}

/** "€14.60 − €13.90 = €0.70 more an hour. 60 staff hours a week × €0.70 = €42.00 a week …" */
function wageCostMaths(hours: number, costWeek: number): string {
  const wage = r2(hours * MIN_WAGE_RISE_2027);
  return t("price.fig.wage.maths", { new: price(MIN_WAGE_2027), old: price(MIN_WAGE_2026), rise: price(MIN_WAGE_RISE_2027), hours: t("n.wageHours", { n: hours }), wage: price(wage), share: pc(EMPLOYER_SHARE_GUESS), cost: price(costWeek) });
}

/** "+€43.40 a week from the new price − €42.00 for the wage rise = +€1.40 a week …" */
function wageLeftMaths(w: Pick<WageRiseCheck, "gainWeek" | "costWeek" | "leftWeek">, likely: number): string {
  return t("price.fig.wageLeft.maths", { gain: signedPrice(w.gainWeek), cost: price(w.costWeek), left: signedPrice(w.leftWeek), likely: spc(likely) });
}

/**
 * The minimum-wage rise on 1 Jan 2027 against what the new price brings a week at the likely guess.
 * Undefined unless minimum_wage_hours_per_week is more than 0. Words and money follow the current language and currency.
 */
export function priceWageRise(v: Values): WageRiseCheck | undefined {
  const hours = has(v, "minimum_wage_hours_per_week") ? n(v, "minimum_wage_hours_per_week") : 0;
  if (!(hours > EPS)) return undefined;
  const m = priceModel(v);
  const likely = n(v, "volume_likely");
  // The wage rise plus employer contributions on it (a guess): what the owner actually pays.
  const wageWeek = r2(hours * MIN_WAGE_RISE_2027);
  const costWeek = r2(wageWeek * (1 + EMPLOYER_SHARE_GUESS));
  const gainWeek = m.deltaWeek(likely);
  const leftWeek = r2(gainWeek - costWeek);
  const covers = gainWeek > EPS && leftWeek >= -EPS;
  const cents = Math.round(Math.abs(m.newPrice - m.oldPrice) * 100);
  const p = {
    likely: spc(likely),
    what: t(m.rise ? "price.wage.rise" : "price.wage.cut", { cents: t("n.cents", { n: cents }) }),
    gain: eur(gainWeek),
    cost: eur(costWeek),
    rise: price(MIN_WAGE_RISE_2027),
    hours: t("n.wageHoursFor", { n: hours }),
    left: eur(Math.abs(leftWeek)),
    wage: eur(wageWeek),
    share: pc(EMPLOYER_SHARE_GUESS),
  };
  const plain = gainWeek <= EPS ? t("price.wage.plain.none", p) : covers ? t("price.wage.plain.covers", p) : t("price.wage.plain.short", p);
  const w = { gainWeek, costWeek, leftWeek };
  return { hoursPerWeek: hours, risePerHour: MIN_WAGE_RISE_2027, wageWeek, employerShare: EMPLOYER_SHARE_GUESS, costWeek, gainWeek, leftWeek, covers, maths: `${wageCostMaths(hours, costWeek)} ${wageLeftMaths(w, likely)}`, plain };
}

/** "you can sell up to 60 fewer a week (9.7% of 620) …" / "you need 64 more sales a week …". */
function beWords(m: PriceModel): string {
  if (m.beV === null || m.beUnits === null) return t("price.be.words.none");
  if (m.beV <= -1 + EPS) return t("price.be.words.any");
  return m.beV <= 0
    ? t("price.be.words.rise", { n: num(m.beUnits), p: pc(-m.beV), units: num(m.units) })
    : t("price.be.words.cut", { n: num(m.beUnits), p: pc(m.beV), units: num(m.units) });
}

export function analyzePrice(inputs: ResolvedInput[], demo: boolean): Body {
  const v = valuesOf(inputs);
  const src = sourcesOf(inputs);
  const m = priceModel(v);
  const low = n(v, "volume_low"), likely = n(v, "volume_likely"), high = n(v, "volume_high");
  const { item, days } = m;
  const change = m.newPrice - m.oldPrice;
  const div = num(m.vatDiv, 4);
  const vatPct = pc(m.vat);
  const dayN = (x: number) => t("n.days", { n: x });

  // ---- Current path ------------------------------------------------------
  const current: Figure[] = [
    fig("units_per_week", t("price.fig.units.label"), m.units, "units/week", src.units_per_week ?? "owner", t("price.fig.units.maths", { item, units: num(m.units) })),
    fig("margin_now", t("price.fig.marginNow.label"), m.mOld, "EUR", fromSources(src, ["current_price", "unit_cost", "vat_rate"]),
      t("price.fig.margin.maths", { price: price(m.oldPrice), div, vat: vatPct, cost: price(m.unitCost), m: price(m.mOld), item })),
    fig("margin_new", t("price.fig.marginNew.label"), m.mNew, "EUR", fromSources(src, ["new_price", "unit_cost", "vat_rate"]),
      t("price.fig.margin.maths", { price: price(m.newPrice), div, vat: vatPct, cost: price(m.unitCost), m: price(m.mNew), item })),
    fig("left_week_now", t("price.fig.leftWeek.label"), m.weekOld, "EUR/week", fromSources(src, ["units_per_week", "current_price", "unit_cost", "vat_rate"]),
      t("price.fig.leftWeek.maths", { units: num(m.units), m: price(m.mOld), week: price(m.weekOld) })),
    fig("left_month_now", t("price.fig.leftMonth.label"), r2(m.weekOld * WEEKS_PER_MONTH), "EUR/month", fromSources(src, ["units_per_week", "current_price", "unit_cost", "vat_rate"]),
      t("price.fig.leftMonth.maths", { week: price(m.weekOld), w: num(WEEKS_PER_MONTH, 2), month: price(r2(m.weekOld * WEEKS_PER_MONTH)) })),
  ];
  // The 2027 minimum-wage rise, when the owner said how many staff hours a week are paid at or near it.
  const wageRise = priceWageRise(v);
  if (wageRise)
    current.push(
      fig("min_wage_rise_week", t("price.fig.wage.label"), wageRise.costWeek, "EUR/week", fromSources(src, ["minimum_wage_hours_per_week"]), wageCostMaths(wageRise.hoursPerWeek, wageRise.costWeek)),
      fig("left_after_wage_rise_week", t("price.fig.wageLeft.label"), wageRise.leftWeek, "EUR/week",
        fromSources(src, ["minimum_wage_hours_per_week", "volume_likely", "units_per_week", "current_price", "new_price", "unit_cost", "vat_rate"]), wageLeftMaths(wageRise, likely)),
    );

  // ---- Scenarios ---------------------------------------------------------
  const scenario = (id: Scenario["id"], guessName: string, key: string, x: number): Scenario => {
    const u = m.unitsAt(x), wn = m.weekNew(x), dw = m.deltaWeek(x), dt = m.deltaTest(x), dm = m.deltaMonth(x);
    const figures: Figure[] = [
      fig("volume_change", t("price.assume.label"), x, "share", src[key] ?? "assumption", t("price.scn.volume.maths", { guess: guessName, x: spc(x) })),
      fig("units_week", t("price.scn.units.label"), u, "units/week", "calculation",
        t("price.scn.units.maths", { units: num(m.units), op: x < 0 ? "−" : "+", p: pc(Math.abs(x)), u: num(u) })),
      fig("left_week", t("price.scn.leftWeek.label"), wn, "EUR/week", "calculation", t("price.scn.leftWeek.maths", { u: num(u), m: price(m.mNew), wn: price(wn) })),
      fig("delta_week", t("price.scn.deltaWeek.label"), dw, "EUR/week", "calculation", t("price.scn.deltaWeek.maths", { wn: price(wn), vsOld: vsOld(m), dw: signedPrice(dw) })),
      fig("delta_test", t("price.scn.deltaTest.label", { days: dayN(days) }), dt, "EUR", "calculation", t("price.scn.deltaTest.maths", { dw: signedPrice(dw), days: num(days), dt: signedPrice(dt) })),
      fig("delta_month", t("price.scn.deltaMonth.label"), dm, "EUR/month", "calculation", t("price.scn.deltaMonth.maths", { dw: signedPrice(dw), w: num(WEEKS_PER_MONTH, 2), dm: signedPrice(dm) })),
    ];
    const about = t("price.scn.about", { x: spc(x), u: num(Math.round(u)) });
    const plain =
      dw >= 0
        ? t("price.scn.plain.more", { about, dw: eur(dw), dt: eur(dt), days: num(days), dm: eur(dm) })
        : t("price.scn.plain.less", { about, dw: eur(-dw), dt: eur(-dt), days: num(days), dm: eur(-dm) });
    const assumptionText = Math.abs(x) < 1e-9 ? t("price.assume.same") : x < 0 ? t("price.assume.down", { p: pc(-x) }) : t("price.assume.up", { p: pc(x) });
    return { id, label: t(`scn.${id}` as "scn.expected"), assumptionLabel: t("price.assume.label"), assumptionValue: x, assumptionUnit: "share", assumptionText, figures, netTest: dt, netMonth: dm, plain };
  };
  const scenarios: Scenario[] = [
    scenario("cautious", t("guess.cautious"), "volume_low", low),
    scenario("expected", t("guess.likely"), "volume_likely", likely),
    scenario("optimistic", t("guess.optimistic"), "volume_high", high),
  ];

  // ---- Break-even --------------------------------------------------------
  let beMaths: string;
  if (m.beV === null || m.beUnits === null || m.levelUnits === null) beMaths = t("price.be.maths.none", { price: price(m.newPrice), div, cost: price(m.unitCost), m: price(m.mNew), item });
  else if (m.mOld <= 0) beMaths = t("price.be.maths.any", { price: price(m.oldPrice), div, cost: price(m.unitCost), m: price(m.mOld), item });
  else
    beMaths = t(m.beV <= 0 ? "price.be.maths.rise" : "price.be.maths.cut", {
      old: price(m.mOld), new: price(m.mNew), be: spc(m.beV), units: num(m.units), level: num(r1(m.levelUnits)), n: num(m.beUnits),
    });
  const breakEven: Body["breakEven"] = {
    value: m.beV === null ? 0 : round(m.beV, 4),
    unit: "share",
    label: m.rise ? t("price.be.label.rise") : t("price.be.label.cut"),
    maths: beMaths,
    plain:
      m.beV === null
        ? t("price.be.plain.none", { price: price(m.newPrice), item, words: beWords(m) })
        : m.beV <= -1 + EPS
          ? t("price.be.plain.any", { old: price(m.oldPrice), item, m: price(m.mOld) })
          : t(m.beV <= 0 ? "price.be.plain.rise" : "price.be.plain.cut", { price: price(m.newPrice), item, new: price(m.mNew), old: price(m.mOld), words: beWords(m) }),
    reachable: m.reachable,
  };

  // ---- Worst case --------------------------------------------------------
  const wl = m.deltaTest(low);
  const worstCase: Body["worstCase"] = {
    value: wl < 0 ? wl : 0,
    maths: t("price.worst.maths", { u: num(m.unitsAt(low)), m: price(m.mNew), wn: price(m.weekNew(low)), vsOld: vsOld(m), dw: signedPrice(m.deltaWeek(low)), days: num(days), wl: signedPrice(wl) }),
    plain:
      wl < 0
        ? t("price.worst.plain", { how: low < 0 ? t("price.worst.fell", { p: pc(-low) }) : t("price.worst.changed", { p: spc(low) }), days: num(days), amt: eur(-wl) })
        : t("price.worst.none", { low: spc(low) }),
  };

  // ---- Biggest uncertainty (tornado) ------------------------------------
  const at = (patch: Values) => priceModel({ ...v, ...patch }).deltaTest(likely);
  const c = m.unitCost, cLo = r2(c * 0.85), cHi = r2(c * 1.15);
  const tornado = [
    { key: "volume_likely", label: t("price.unc.volume.label", { lo: spc(low), hi: spc(high) }), swing: Math.abs(m.deltaTest(high) - m.deltaTest(low)) },
    { key: "unit_cost", label: t("price.unc.cost.label", { item, lo: price(cLo), hi: price(cHi) }), swing: Math.abs(at({ unit_cost: cHi }) - at({ unit_cost: cLo })) },
  ]
    .map((x) => ({ ...x, swing: r2(x.swing) }))
    .sort((a, b) => b.swing - a.swing);
  const top = tornado[0]!;
  const uncertaintyPlain =
    top.swing < 0.005
      ? Math.abs(high - low) < 1e-9
        ? t("price.unc.volume.one", { x: spc(likely) })
        : t("unc.nothing")
      : top.key === "volume_likely"
        ? Math.abs(high - low) < 1e-9
          ? t("price.unc.volume.one", { x: spc(likely) })
          : t("price.unc.volume.plain", { lo: spc(low), hi: spc(high), swing: eur(top.swing), item })
        : t("price.unc.cost.plain", { item, lo: price(cLo), hi: price(cHi), swing: eur(top.swing) });
  const biggestUncertainty: Body["biggestUncertainty"] = { key: top.key, label: top.label, swing: top.swing, plain: uncertaintyPlain, ranking: tornado };

  // ---- Sensitivity (the slider) -----------------------------------------
  const lo = Math.max(-1, Math.min(-0.3, Math.floor((Math.min(low, m.beV ?? 0) - 0.02) * 100) / 100));
  const hi = Math.max(0.05, Math.ceil((Math.max(high, m.beV ?? 0) + 0.02) * 100) / 100);
  const kLo = Math.round(lo * 100), kHi = Math.round(hi * 100);
  const stepK = kHi - kLo > 120 ? Math.ceil((kHi - kLo) / 120) : 1;
  const points: SensitivityPoint[] = [];
  const atGuess = m.deltaTest(likely);
  for (let k = kLo; k <= kHi; k += stepK) {
    const x = k / 100;
    points.push({ x, netTest: m.deltaTest(x), netMonth: m.deltaMonth(x), explanation: explainVolume(m, x), vsGuess: r2(m.deltaTest(x) - atGuess) });
  }
  const stepWeek = m.units * 0.01 * m.mNew;
  const sensitivity: Body["sensitivity"] = {
    key: "volume_likely",
    label: t("price.assume.label"),
    unit: "share",
    current: likely,
    breakEvenX: m.beV === null ? null : round(m.beV, 4),
    points,
    perStep: {
      netTest: r2((stepWeek * days) / 7),
      netMonth: r2(stepWeek * WEEKS_PER_MONTH),
      plain: t("price.slope", { u: num(r1(m.units * 0.01)), test: eur((stepWeek * days) / 7), month: eur(stepWeek * WEEKS_PER_MONTH) }),
    },
  };

  // ---- Lessons -----------------------------------------------------------
  const lessons: string[] = [];
  if (wageRise) lessons.push(t("price.wage.lesson", { plain: wageRise.plain }));
  const cents = Math.round(Math.abs(change) * 100);
  if (m.reachable && m.mOld > 0) {
    const rel = m.mNew / m.mOld - 1;
    lessons.push(
      m.rise
        ? t("price.lesson.rise", { cents: t("n.cents", { n: cents }), vat: vatPct, gain: price(r2(m.mNew - m.mOld)), item, new: price(m.mNew), old: price(m.mOld), rel: pc(rel) })
        : t("price.lesson.cut", { cents: t("n.cents", { n: cents }), rel: pc(-rel), item, old: price(m.mOld), new: price(m.mNew) }),
    );
  }
  if (m.beV !== null && m.beUnits !== null && m.beV > -1 + EPS) {
    if (m.beV <= 0)
      lessons.push(
        likely >= m.beV
          ? t("price.lesson.inside", { n: m.beUnits, p: pc(-m.beV), likely: likely === 0 ? t("price.noChange") : t(likely < 0 ? "price.likelyFewer" : "price.likelyMore", { x: spc(likely), n: num(Math.round(m.units * Math.abs(likely))) }) })
          : t("price.lesson.outside", { n: m.beUnits, p: pc(-m.beV), likely: spc(likely) }),
      );
    else
      lessons.push(
        likely >= m.beV
          ? t("price.lesson.cutReach", { n: m.beUnits, be: spc(m.beV), likely: spc(likely) })
          : t("price.lesson.cutMiss", { n: m.beUnits, be: spc(m.beV), likely: spc(likely) }),
      );
  }
  if (wl < 0) lessons.push(t("price.lesson.cheap", { low: spc(low), days: num(days), amt: eur(-wl) }));
  if (top.swing >= 0.005) lessons.push(t("lesson.mostMatters", { plain: continueSentence(uncertaintyPlain) }));
  lessons.push(t("lesson.methodPrice"));

  // ---- Next questions ----------------------------------------------------
  const guessed = (k: string) => filledIn(inputs, k);
  const nextQuestions: string[] = [];
  if (demo) nextQuestions.push(t("price.q.demo", { item }));
  if (guessed("vat_rate")) nextQuestions.push(t("price.q.vat", { item, vat: vatPct }));
  if (guessed("volume_low") || guessed("volume_high")) nextQuestions.push(t("price.q.range", { lo: spc(low), hi: spc(high) }));
  if (guessed("test_days")) nextQuestions.push(t("price.q.days", { days: num(days) }));
  nextQuestions.push(t("price.q.steady", { units: num(m.units) }));
  nextQuestions.push(t("price.q.tradeDown"));

  // ---- Warnings ----------------------------------------------------------
  const warnings: string[] = [];
  if (!m.reachable) warnings.push(t("price.warn.none", { price: price(m.newPrice), net: price(m.netNew), item, cost: price(m.unitCost) }));
  else if (m.beV !== null && m.beV > -1 + EPS) {
    if (likely < m.beV) warnings.push(t("price.warn.likely", { likely: spc(likely), be: spc(m.beV) }));
    else if (low < m.beV) warnings.push(t("price.warn.low", { low: spc(low), be: spc(m.beV) }));
    if (m.beV > 0.5) warnings.push(t("price.warn.bigCut", { p: pc(m.beV) }));
  }
  if (m.oldPrice > 0 && Math.abs(change) / m.oldPrice > 0.2) warnings.push(t("price.warn.bigStep", { p: pc(Math.abs(change) / m.oldPrice) }));
  if (m.mOld <= 0) warnings.push(t("price.warn.oldLoses", { item, old: price(m.oldPrice), div, cost: price(m.unitCost), m: price(m.mOld) }));

  return { current, scenarios, breakEven, worstCase, biggestUncertainty, sensitivity, lessons, nextQuestions, warnings, ...(wageRise ? { wageRise } : {}) };
}

/** "Why this number": the calculation for one slider position, in words. */
export function explainVolume(m: PriceModel, x: number): string {
  const u = m.unitsAt(x), wn = m.weekNew(x), dw = m.deltaWeek(x);
  let s = t("price.x.base", { x: spc(x), uR: num(Math.round(u)), u: num(u), m: price(m.mNew), wn: price(wn), old: price(m.weekOld), dw: signedPrice(dw), dt: signedPrice(m.deltaTest(x)), days: num(m.days), dm: signedPrice(m.deltaMonth(x)) });
  if (m.beV !== null) s += x >= m.beV - EPS ? t("price.x.better") : m.rise ? t("price.x.worseRise") : t("price.x.worseCut");
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
      // Compare what the owner reads: a move too small to show ("9.7% (60) instead of 9.7% (60)") is "stays".
      const lose = ma.beV <= 0 && mb.beV <= 0;
      const same = lose ? pc(-ma.beV) === pc(-mb.beV) && ma.beUnits === mb.beUnits : spc(ma.beV) === spc(mb.beV);
      if (!same) {
        if (lose) parts.push(t("price.chg.beLose", { pa: pc(-ma.beV), na: num(ma.beUnits), pb: pc(-mb.beV), nb: num(mb.beUnits) }));
        else parts.push(t("price.chg.beMove", { from: spc(mb.beV), to: spc(ma.beV) }));
      } else parts.push(t("price.chg.beSame", { be: spc(mb.beV) }));
    } else if (ma.beV === null) parts.push(t("price.chg.beGone"));
    if (Math.abs(ha.netTestExpected - hb.netTestExpected) >= 0.005)
      parts.push(t("chg.expected", { from: seur(hb.netTestExpected), to: seur(ha.netTestExpected) }));
    return parts.join(t("chg.and"));
  };
  const so = (cause: string) => t("chg.so", { cause, effect: effect() });
  switch (key) {
    case "new_price":
      return { text: so(t("price.chg.new", { from: price(from), to: price(to), item: mb.item, ma: price(ma.mNew), mb: price(mb.mNew) })) + t("price.chg.newTail"), mentionsWorst: false };
    case "current_price":
      return { text: so(t("price.chg.current", { from: price(from), to: price(to), item: mb.item, ma: price(ma.mOld), mb: price(mb.mOld) })), mentionsWorst: false };
    case "unit_cost":
      return {
        text: so(t(up ? "price.chg.cost.up" : "price.chg.cost.down", { item: mb.item, from: price(from), to: price(to), diff: price(Math.abs(to - from)), ob: price(mb.mOld), oa: price(ma.mOld), nb: price(mb.mNew), na: price(ma.mNew) })),
        mentionsWorst: false,
      };
    case "vat_rate":
      return { text: so(t("price.chg.vat", { from: pc(from), to: pc(to), item: mb.item, ob: price(mb.mOld), oa: price(ma.mOld), nb: price(mb.mNew), na: price(ma.mNew) })), mentionsWorst: false };
    case "units_per_week":
      return { text: so(t(up ? "price.chg.units.up" : "price.chg.units.down", { from: num(from), to: num(to) })), mentionsWorst: true };
    case "volume_likely":
      return { text: t("price.chg.likely", { from: spc(from), to: spc(to), m: price(mb.mNew), eb: seur(hb.netTestExpected), ea: seur(ha.netTestExpected), be: hb.breakEvenText }), mentionsWorst: false };
    case "volume_low":
    case "volume_high":
      return {
        text: t(key === "volume_low" ? "price.chg.low" : "price.chg.high", { from: spc(from), to: spc(to), rb: seur(mb.deltaTest(from)), ra: seur(ma.deltaTest(to)) }),
        mentionsWorst: key === "volume_low",
      };
    case "test_days":
      return { text: t("price.chg.days", { from: t("n.days", { n: from }), to: t("n.days", { n: to }), eb: seur(hb.netTestExpected), ea: seur(ha.netTestExpected), wb: seur(hb.worstCase), wa: seur(ha.worstCase) }), mentionsWorst: true };
    case "item":
      return { text: t("price.chg.item", { from: String(b.item ?? ""), to: String(a.item ?? "") }), mentionsWorst: false };
    case "minimum_wage_hours_per_week": {
      const wa = priceWageRise(a);
      const text = t("price.chg.wageHours", { from: t("n.wageHours", { n: from }), to: t("n.wageHours", { n: to }), cb: eur(r2(from * MIN_WAGE_RISE_2027)), ca: eur(r2(to * MIN_WAGE_RISE_2027)) });
      return { text: wa ? `${text} ${wa.plain}` : text, mentionsWorst: false };
    }
    case "kiez":
      return { text: t("chg.kiez", { from: String(b[key] ?? "—"), to: String(a[key] ?? "—") }), mentionsWorst: false };
    default:
      return { text: so(t("chg.default", { label, from: num(from), to: num(to) })), mentionsWorst: false };
  }
}

