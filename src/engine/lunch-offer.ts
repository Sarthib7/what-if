/**
 * Weekday lunch offer: the deterministic maths behind every number the owner sees.
 *
 * Everything is per weekday unless the name says otherwise. The one guess that
 * drives the result is x, the number of extra (new) lunch customers a day.
 * Prices the owner gives are what customers pay (with VAT); VAT is not the café's
 * money, so margins use the price after VAT: net = gross ÷ (1 + vat_rate).
 *
 *   margin per deal       m_offer     = offer_price ÷ (1 + vat) − offer_cost
 *   lunch margin today    m_lunch_now = lunch_spend ÷ (1 + vat) − lunch_spend × variable_cost_share
 *   switching regulars    switchers   = lunch_customers × switch_share            (one decimal)
 *   cost of switching     switch_loss = switchers × (m_lunch_now − m_offer)   (negative = a gain)
 *   running cost          daily_cost  = extra_staff_hours_per_day × staff_hourly_cost + marketing_per_week ÷ 5
 *   net_day(x)   = x × m_offer − switch_loss − daily_cost
 *   net_test(x)  = net_day(x) × test_days − setup_cost
 *   net_month(x) = net_day(x) × 21.7 weekdays (ongoing, setup already paid)
 *
 * Rounding rule: every building block is rounded to the cent (switchers to one decimal)
 * before it is used again, so each "show the maths" line can be redone by hand with the
 * numbers it prints and gives exactly the number it shows.
 */
import { LUNCH_VAT_BLENDED, MIN_WAGE_2026, MIN_WAGE_2027 } from "./berlin.ts";
import { ceilUp, EPS, eur, has, list, n, num, pc, pct, price, r1, r2, round, seur, signedPrice } from "./format.ts";
import type { Values } from "./format.ts";
import { continueSentence, fig, filledIn, fromSources, sourcesOf, sumText, valuesOf } from "./figures.ts";
import { msg as t } from "./messages.ts";
import type { Analysis, Figure, ResolvedInput, Scenario, SensitivityPoint } from "./types.ts";

export { valuesOf };

export const WEEKDAYS_PER_MONTH = 21.7;
const W = WEEKDAYS_PER_MONTH;

type Body = Pick<
  Analysis,
  "current" | "scenarios" | "breakEven" | "worstCase" | "biggestUncertainty" | "sensitivity" | "lessons" | "nextQuestions" | "warnings"
>;

export interface LunchModel {
  offerPrice: number;
  offerCost: number;
  lunchSpend: number;
  vcs: number;
  /** VAT rate in the prices (blended), and the divisor 1 + vat. */
  vat: number;
  vatDiv: number;
  lunchCustomers: number;
  switchShare: number;
  staffHours: number;
  staffRate: number;
  /** Extra staff cost per weekday: hours × cost per hour. */
  staff: number;
  marketing: number;
  /** Promotion per weekday: marketing ÷ 5. */
  marketingDay: number;
  setup: number;
  days: number;
  /** The deal price after VAT. */
  netOfferPrice: number;
  /** What one deal leaves after VAT and ingredients. */
  mOffer: number;
  /** What one ordinary lunch leaves after VAT and ingredients today. */
  mLunchNow: number;
  /** How much less a regular leaves when they switch to the deal (negative = more). */
  gap: number;
  switchers: number;
  switchLoss: number;
  /** Cash out per weekday: staff and promotion. */
  dailyCost: number;
  /** Everything a day of the deal has to cover before it makes money (switching + running costs). */
  needDay: number;
  /** The setup spread over the test days. */
  setupDay: number;
  /** Cash the owner pays out over the whole test: setup + staff + promotion. */
  cashOutTest: number;
  reachable: boolean;
  /** Extra customers a day so each day pays its way (setup already paid). The number for deciding after the test. */
  beOngoing: number | null;
  beOngoingExact: number | null;
  /** Extra customers a day so the whole test, including setup, pays back. The headline break-even. */
  beTest: number | null;
  beTestExact: number | null;
  netDay(x: number): number;
  netTest(x: number): number;
  netMonth(x: number): number;
  revenueDay(x: number): number;
}

export function lunchModel(v: Values): LunchModel {
  const vat = has(v, "vat_rate") ? n(v, "vat_rate") : LUNCH_VAT_BLENDED;
  const vatDiv = round(1 + vat, 4);
  const offerPrice = n(v, "offer_price");
  const offerCost = n(v, "offer_cost");
  const vcs = n(v, "variable_cost_share", 0.3);
  const lunchSpend = has(v, "lunch_spend") ? n(v, "lunch_spend") : n(v, "avg_spend");
  const lunchCustomers = n(v, "lunch_customers");
  const switchShare = n(v, "switch_share", 0.3);
  let staffHours = n(v, "extra_staff_hours_per_day");
  let staffRate = n(v, "staff_hourly_cost", MIN_WAGE_2026);
  if (!has(v, "extra_staff_hours_per_day") && has(v, "extra_staff_cost_per_day")) {
    // An older link's daily staff cost: read as one hour at that cost.
    const old = n(v, "extra_staff_cost_per_day");
    staffHours = old > 0 ? 1 : 0;
    if (old > 0) staffRate = old;
  }
  const staff = r2(staffHours * staffRate);
  const marketing = n(v, "marketing_per_week");
  const marketingDay = r2(marketing / 5);
  const setup = n(v, "setup_cost");
  const days = Math.max(1, n(v, "test_days", 10));

  const netOfferPrice = r2(offerPrice / vatDiv);
  const mOffer = r2(offerPrice / vatDiv - offerCost);
  const mLunchNow = r2(lunchSpend / vatDiv - lunchSpend * vcs);
  const gap = r2(mLunchNow - mOffer);
  const switchers = r1(lunchCustomers * switchShare);
  const switchLoss = r2(switchers * gap);
  const dailyCost = r2(staff + marketingDay);
  const needDay = r2(switchLoss + dailyCost);
  const setupDay = r2(setup / days);
  const reachable = mOffer > EPS;
  const beOngoingExact = reachable ? Math.max(0, needDay / mOffer) : null;
  const beTestExact = reachable ? Math.max(0, (needDay + setup / days) / mOffer) : null;

  const netDay = (x: number) => r2(x * mOffer - needDay);
  return {
    offerPrice, offerCost, lunchSpend, vcs, vat, vatDiv, lunchCustomers, switchShare, staffHours, staffRate, staff, marketing, marketingDay, setup, days,
    netOfferPrice, mOffer, mLunchNow, gap, switchers, switchLoss, dailyCost, needDay, setupDay, reachable,
    cashOutTest: r2(dailyCost * days + setup),
    beOngoing: beOngoingExact === null ? null : ceilUp(beOngoingExact),
    beOngoingExact,
    beTest: beTestExact === null ? null : ceilUp(beTestExact),
    beTestExact,
    netDay,
    netTest: (x) => r2(netDay(x) * days - setup),
    netMonth: (x) => r2(netDay(x) * W),
    revenueDay: (x) => r2(x * offerPrice + switchers * (offerPrice - lunchSpend)),
  };
}

/** The handful of numbers "what changed" compares. */
export function lunchHeadline(v: Values) {
  const m = lunchModel(v);
  const likely = n(v, "extra_likely");
  return {
    breakEven: m.beTest,
    breakEvenText: m.beTest === null ? t("lunch.outOfReach") : t("unit.perDay", { v: num(m.beTest) }),
    breakEvenOngoing: m.beOngoing,
    netTestExpected: m.netTest(likely),
    netMonthExpected: m.netMonth(likely),
    worstCase: m.netTest(0),
  };
}

/** "switching regulars, staff and promotion" — what the deal's daily costs are made of. */
function costWords(m: LunchModel): string {
  const w: string[] = [];
  if (Math.abs(m.switchLoss) > EPS) w.push(t("lunch.word.switching"));
  if (m.staff > 0) w.push(t("lunch.word.staff"));
  if (m.marketing > 0) w.push(t("lunch.word.promotion"));
  if (w.length === 0) return t("lunch.word.costs");
  return list(w, t("and"));
}

/** Whole euros in a plain list when they add up to the rounded total; otherwise cents, so the sum always checks out. */
function partsText(total: number, parts: { amount: number; key: "lunch.part.setup" | "lunch.part.staffPromo" | "lunch.part.switching" }[]): string {
  const live = parts.filter((p) => p.amount > EPS);
  const whole = live.reduce((s, p) => s + Math.round(p.amount), 0) === Math.round(total);
  const f = (x: number) => (whole ? eur(x) : price(x));
  return list(live.map((p) => t(p.key, { v: f(p.amount) })), t("and"));
}

function breakEvenMaths(m: LunchModel): string {
  if (!m.reachable)
    return t("lunch.be.maths.none", { price: price(m.offerPrice), div: num(m.vatDiv, 4), cost: price(m.offerCost), m: price(m.mOffer) });
  const lines: string[] = [];
  const parts = [
    { amount: m.switchLoss, label: m.switchLoss >= 0 ? t("lunch.label.forSwitching") : t("lunch.label.fromSwitching") },
    { amount: m.dailyCost, label: t("lunch.label.forStaffPromo") },
  ];
  if (m.setup > 0) {
    lines.push(t("lunch.be.maths.setup", { setup: price(m.setup), days: num(m.days), per: price(m.setupDay) }));
    parts.push({ amount: m.setupDay, label: t("lunch.label.setup") });
  }
  const need = r2(m.needDay + (m.setup > 0 ? m.setupDay : 0));
  if (need <= EPS) {
    lines.push(t("lunch.be.maths.free", { sum: sumText(parts), need: price(need) }));
    return lines.join(" ");
  }
  const exact = m.beTestExact ?? 0;
  const ratio = need / m.mOffer;
  lines.push(
    Math.abs(exact - Math.round(exact)) < 1e-6
      ? t("lunch.be.maths.exact", { sum: sumText(parts), need: price(need), m: price(m.mOffer), n: m.beTest ?? 0 })
      : t("lunch.be.maths.round", { sum: sumText(parts), need: price(need), m: price(m.mOffer), exact: num(ratio, 1), n: m.beTest ?? 0 }),
  );
  return lines.join(" ");
}

function ongoingMaths(m: LunchModel): string {
  if (!m.reachable || m.beOngoingExact === null) return t("lunch.be.maths.none", { price: price(m.offerPrice), div: num(m.vatDiv, 4), cost: price(m.offerCost), m: price(m.mOffer) });
  if (m.needDay <= EPS) return t("lunch.ongoing.maths.free", { need: price(m.needDay) });
  const exact = m.beOngoingExact;
  return Math.abs(exact - Math.round(exact)) < 1e-6
    ? t("lunch.ongoing.maths.exact", { need: price(m.needDay), m: price(m.mOffer), n: m.beOngoing ?? 0 })
    : t("lunch.ongoing.maths.round", { need: price(m.needDay), m: price(m.mOffer), exact: num(exact, 1), n: m.beOngoing ?? 0 });
}

export function analyzeLunch(inputs: ResolvedInput[], demo: boolean): Body {
  const v = valuesOf(inputs);
  const src = sourcesOf(inputs);
  const m = lunchModel(v);
  const low = n(v, "extra_low");
  const likely = n(v, "extra_likely");
  const high = n(v, "extra_high");
  const cash = has(v, "cash_buffer") ? n(v, "cash_buffer") : undefined;
  const fixed = has(v, "monthly_fixed_costs") ? n(v, "monthly_fixed_costs") : undefined;
  const wc = n(v, "weekday_customers"), avg = n(v, "avg_spend");
  const days = m.days;
  const div = num(m.vatDiv, 4);
  const vatPct = pc(m.vat);
  const dayN = (x: number) => t("n.weekdays", { n: x });

  // ---- Current path (weekdays only: the deal runs on weekdays) -------------
  const current: Figure[] = [];
  const takings = r2(wc * avg * W);
  const left = r2(takings / m.vatDiv - takings * m.vcs);
  current.push(
    fig("weekday_takings_month", t("lunch.fig.takings.label"), takings, "EUR/month", fromSources(src, ["weekday_customers", "avg_spend"]),
      t("lunch.fig.takings.maths", { n: wc, avg: price(avg), w: num(W), takings: price(takings) })),
    fig("weekday_left_month", t("lunch.fig.left.label"), left, "EUR/month", fromSources(src, ["weekday_customers", "avg_spend", "variable_cost_share", "vat_rate"]),
      t("lunch.fig.left.maths", { takings: price(takings), div, vat: vatPct, vcs: pc(m.vcs), left: price(left) })),
    fig("lunch_margin_now", t("lunch.fig.lunchMargin.label"), m.mLunchNow, "EUR", fromSources(src, ["lunch_spend", "variable_cost_share", "vat_rate"]),
      t("lunch.fig.lunchMargin.maths", { spend: price(m.lunchSpend), div, vat: vatPct, vcs: pc(m.vcs), m: price(m.mLunchNow) })),
    fig("deal_margin", t("lunch.fig.dealMargin.label"), m.mOffer, "EUR", fromSources(src, ["offer_price", "offer_cost", "vat_rate"]),
      t("lunch.fig.dealMargin.maths", { price: price(m.offerPrice), div, vat: vatPct, cost: price(m.offerCost), m: price(m.mOffer) })),
    fig("switch_cost_day", t("lunch.fig.switch.label"), m.switchLoss, "EUR/day",
      fromSources(src, ["lunch_customers", "switch_share", "lunch_spend", "variable_cost_share", "offer_price", "offer_cost", "vat_rate"]),
      m.gap >= 0
        ? t("lunch.fig.switch.maths.cost", { n: m.lunchCustomers, share: pc(m.switchShare), sw: num(m.switchers), gap: price(m.gap), now: price(m.mLunchNow), deal: price(m.mOffer), loss: price(m.switchLoss) })
        : t("lunch.fig.switch.maths.gain", { n: m.lunchCustomers, share: pc(m.switchShare), sw: num(m.switchers), gap: price(-m.gap), now: price(m.mLunchNow), deal: price(m.mOffer), gain: price(-m.switchLoss) })),
    fig("running_cost_day", t("lunch.fig.running.label"), m.dailyCost, "EUR/day",
      fromSources(src, ["extra_staff_hours_per_day", "staff_hourly_cost", "marketing_per_week"]),
      t("lunch.fig.running.maths", { hours: t("n.staffHours", { n: m.staffHours }), rate: price(m.staffRate), mkt: price(m.marketing), daily: price(m.dailyCost) })),
  );

  // ---- Scenarios ---------------------------------------------------------
  const scenario = (id: Scenario["id"], guessName: string, key: string, x: number): Scenario => {
    const rev = m.revenueDay(x), nd = m.netDay(x), nt = m.netTest(x), nm = m.netMonth(x);
    const switchPart = m.switchLoss >= 0 ? t("lunch.scn.minusSwitch", { v: price(m.switchLoss) }) : t("lunch.scn.plusSwitch", { v: price(-m.switchLoss) });
    const figures: Figure[] = [
      fig("extra_customers", t("lunch.assume.label"), x, "customers/day", src[key] ?? "assumption",
        t("lunch.scn.extra.maths", { guess: guessName, x: t("n.extraLunchDay", { n: x }) })),
      fig("revenue_change_day", t("lunch.scn.revenue.label"), rev, "EUR/day", "calculation",
        t("lunch.scn.revenue.maths", { n: x, price: price(m.offerPrice), sw: num(m.switchers), spend: price(m.lunchSpend), rev: signedPrice(rev) })),
      fig("net_day", t("lunch.scn.netDay.label"), nd, "EUR/day", "calculation",
        t("lunch.scn.netDay.maths", { x: num(x), m: price(m.mOffer), switchPart, daily: price(m.dailyCost), nd: signedPrice(nd) })),
      fig("net_test", t("lunch.scn.netTest.label", { days: dayN(days) }), nt, "EUR", "calculation",
        t("lunch.scn.netTest.maths", { nd: signedPrice(nd), days: dayN(days), setup: price(m.setup), nt: signedPrice(nt) })),
      fig("net_month", t("lunch.scn.netMonth.label"), nm, "EUR/month", "calculation",
        t("lunch.scn.netMonth.maths", { nd: signedPrice(nd), w: num(W), nm: signedPrice(nm) })),
    ];
    if (fixed !== undefined && fixed > 0)
      figures.push(fig("net_month_share_fixed", t("lunch.scn.shareFixed.label"), nm / fixed, "share", "calculation",
        t("lunch.scn.shareFixed.maths", { nm: signedPrice(nm), fixed: price(fixed), share: `${nm < 0 ? "−" : ""}${pct(Math.abs(nm / fixed), 1)}` })));
    const ofFixed = fixed !== undefined && fixed > 0 && nm > 0 ? t("lunch.scn.ofFixed", { p: pct(nm / fixed, 1) }) : "";
    const who = t("lunch.scn.who", { n: x });
    let plain: string;
    if (nt >= 0) plain = t("lunch.scn.plain.up", { who, nt: eur(nt), nm: eur(Math.max(0, nm)), ofFixed });
    else if (nm >= 0) plain = t("lunch.scn.plain.setup", { who, nt: eur(-nt), setup: eur(m.setup), nm: eur(nm), ofFixed });
    else plain = t("lunch.scn.plain.down", { who, nt: eur(-nt), nm: eur(-nm) });
    return {
      id,
      label: t(`scn.${id}`),
      assumptionLabel: t("lunch.assume.label"),
      assumptionValue: x,
      assumptionUnit: "customers/day",
      assumptionText: t("n.extraLunchDay", { n: x }),
      figures,
      netTest: nt,
      netMonth: nm,
      plain,
    };
  };
  const scenarios: Scenario[] = [
    scenario("cautious", t("guess.cautious"), "extra_low", low),
    scenario("expected", t("guess.likely"), "extra_likely", likely),
    scenario("optimistic", t("guess.optimistic"), "extra_high", high),
  ];

  // ---- Break-even --------------------------------------------------------
  const be = m.beTest, beOn = m.beOngoing;
  /** "11 extra lunch customers" in the form that follows "from" ("ab 11 zusätzlichen Mittagsgästen", "od 11 dodatkowych klientów"). */
  const from = (x: number) => t("n.extraLunchFrom", { n: x });
  /** Regulars who switch leave more than their usual lunch (a gain), as opposed to costing nothing at all. */
  const switchGain = m.switchLoss < -EPS;
  let bePlain: string;
  if (!m.reachable || be === null || beOn === null) bePlain = t("lunch.be.plain.none");
  else if (be === 0) bePlain = t("lunch.be.plain.zero", { m: price(m.mOffer) });
  else if (m.setup > 0 && be !== beOn)
    bePlain = t("lunch.be.plain.two", { days: dayN(days), setup: eur(m.setup), be: from(be), beOn: num(beOn), m: price(m.mOffer), need: price(m.needDay), costs: costWords(m) });
  else
    bePlain = t("lunch.be.plain.one", { be: from(be), m: price(m.mOffer), need: price(r2(m.needDay + m.setupDay)), costs: m.setup > 0 ? `${costWords(m)}, ${t("lunch.word.setup")}` : costWords(m) });
  const breakEven: Body["breakEven"] = {
    value: be ?? 0,
    unit: "customers/day",
    label: t("lunch.be.label"),
    maths: breakEvenMaths(m),
    plain: bePlain,
    reachable: m.reachable,
    ongoing: {
      value: beOn ?? 0,
      unit: "customers/day",
      label: t("lunch.ongoing.label"),
      maths: ongoingMaths(m),
      plain:
        !m.reachable || beOn === null
          ? t("lunch.be.plain.none")
          : beOn === 0
            ? t(switchGain ? "lunch.ongoing.plain.zero" : "lunch.ongoing.plain.zeroFree")
            : t("lunch.ongoing.plain", { beOn: from(beOn), be: num(be ?? 0) }),
    },
  };

  // ---- Worst case: nobody new comes, regulars switch as guessed ----------
  const worst = m.netTest(0);
  const allSwitch = lunchModel({ ...v, switch_share: 1 }).netTest(0);
  const shareOfCash = cash !== undefined && cash > 0 ? round(Math.max(0, -worst) / cash, 4) : undefined;
  const worstParts = partsText(-worst, [
    { amount: m.setup, key: "lunch.part.setup" },
    { amount: r2(m.dailyCost * days), key: "lunch.part.staffPromo" },
    { amount: r2(m.switchLoss * days), key: "lunch.part.switching" },
  ]);
  const cashText = shareOfCash !== undefined && worst < 0 ? t("lunch.worst.cash", { p: pct(shareOfCash), cash: eur(cash!) }) : "";
  let worstPlain: string;
  if (worst >= 0)
    worstPlain = switchGain
      ? t("lunch.worst.plain.gain", { share: pc(m.switchShare), spend: price(m.lunchSpend), up: worst >= 0.5 ? t("lunch.worst.up", { amt: eur(worst) }) : "" })
      : t("lunch.worst.plain.free");
  else if (m.switchLoss > EPS)
    worstPlain =
      t("lunch.worst.plain.switch", { sw: t("n.regularsDay", { n: m.switchers }), swn: num(m.switchers), share: pc(m.switchShare), total: eur(-worst), parts: worstParts, cash: cashText }) +
      (allSwitch < worst - 0.5 && m.switchShare < 1 ? t("lunch.worst.plain.all", { all: eur(-allSwitch) }) : "");
  else worstPlain = t("lunch.worst.plain.noSwitch", { total: eur(-worst), parts: worstParts, cash: cashText });
  const worstCase: Body["worstCase"] = {
    value: worst,
    maths: t("lunch.worst.maths", {
      m: price(m.mOffer),
      switchPart: m.switchLoss >= 0 ? t("lunch.scn.minusSwitch", { v: price(m.switchLoss) }) : t("lunch.scn.plusSwitch", { v: price(-m.switchLoss) }),
      daily: price(m.dailyCost),
      nd: signedPrice(m.netDay(0)),
      days: dayN(days),
      setup: price(m.setup),
      worst: signedPrice(worst),
    }),
    plain: worstPlain,
    ...(shareOfCash !== undefined ? { shareOfCash } : {}),
    cashOut: m.cashOutTest,
    ...(m.gap > EPS && m.switchShare < 1 ? { ifAllSwitch: allSwitch } : {}),
  };

  // ---- Biggest uncertainty (tornado) ------------------------------------
  const at = (patch: Values) => lunchModel({ ...v, ...patch }).netTest(likely);
  const s = m.switchShare;
  const sLo = Math.max(0, Math.min(0.1, s * 0.5)), sHi = Math.min(1, Math.max(0.5, s * 1.5));
  const oc = m.offerCost, ls = m.lunchSpend;
  const lsLo = r2(ls * 0.85), lsHi = r2(ls * 1.15), ocLo = r2(oc * 0.85), ocHi = r2(oc * 1.15);
  const tornado = [
    { key: "extra_likely", label: t("lunch.unc.extra.label", { lo: num(low), hi: num(high) }), swing: Math.abs(m.netTest(high) - m.netTest(low)) },
    { key: "switch_share", label: t("lunch.unc.switch.label", { lo: pc(sLo), hi: pc(sHi) }), swing: Math.abs(at({ switch_share: sHi }) - at({ switch_share: sLo })) },
    { key: "lunch_spend", label: t("lunch.unc.spend.label", { lo: price(lsLo), hi: price(lsHi) }), swing: Math.abs(at({ lunch_spend: lsHi }) - at({ lunch_spend: lsLo })) },
    { key: "offer_cost", label: t("lunch.unc.cost.label", { lo: price(ocLo), hi: price(ocHi) }), swing: Math.abs(at({ offer_cost: ocHi }) - at({ offer_cost: ocLo })) },
  ]
    .map((x) => ({ ...x, swing: r2(x.swing) }))
    .sort((a, b) => b.swing - a.swing);
  const top = tornado[0]!;
  let uncertaintyPlain: string;
  if (top.swing < 0.005) uncertaintyPlain = t("unc.nothing");
  else if (top.key === "extra_likely" && low === high) uncertaintyPlain = t("lunch.unc.extra.one", { x: num(likely) });
  else
    uncertaintyPlain = {
      extra_likely: () => t("lunch.unc.extra.plain", { lo: num(low), hi: num(high), swing: eur(top.swing) }),
      switch_share: () => t("lunch.unc.switch.plain", { lo: pc(sLo), hi: pc(sHi), swing: eur(top.swing) }),
      lunch_spend: () => t("lunch.unc.spend.plain", { lo: price(lsLo), hi: price(lsHi), swing: eur(top.swing) }),
      offer_cost: () => t("lunch.unc.cost.plain", { lo: price(ocLo), hi: price(ocHi), swing: eur(top.swing) }),
    }[top.key as "extra_likely"]();
  const biggestUncertainty: Body["biggestUncertainty"] = { key: top.key, label: top.label, swing: top.swing, plain: uncertaintyPlain, ranking: tornado };

  // ---- Sensitivity (the slider) -----------------------------------------
  const maxX = Math.max(Math.ceil(high * 1.5), (be ?? 0) * 2, 10);
  const step = maxX > 60 ? Math.ceil(maxX / 60) : 1;
  const points: SensitivityPoint[] = [];
  const atGuess = m.netTest(likely);
  for (let x = 0; x <= maxX; x += step) points.push({ x, netTest: m.netTest(x), netMonth: m.netMonth(x), explanation: explainX(m, x), vsGuess: r2(m.netTest(x) - atGuess) });
  const sensitivity: Body["sensitivity"] = {
    key: "extra_likely",
    label: t("lunch.assume.label"),
    unit: "customers/day",
    current: likely,
    breakEvenX: be,
    ongoingX: beOn,
    points,
    perStep: {
      netTest: r2(m.mOffer * days),
      netMonth: r2(m.mOffer * W),
      plain: t("lunch.slope", { m: price(m.mOffer), days: dayN(days), test: price(r2(m.mOffer * days)), month: eur(m.mOffer * W) }),
    },
  };

  // ---- Lessons -----------------------------------------------------------
  const expectedTest = m.netTest(likely);
  const lessons: string[] = [];
  if (!m.reachable || be === null || beOn === null) lessons.push(t("lunch.lesson.none"));
  else if (be === 0) lessons.push(switchGain ? t("lunch.lesson.zero", { spend: price(m.lunchSpend) }) : t("lunch.lesson.zeroFree", { m: price(m.mOffer) }));
  else if (likely >= be)
    lessons.push(be === beOn ? t("lunch.lesson.beatsOne", { be: from(be), likely: num(likely) }) : t("lunch.lesson.beats", { be: from(be), beOn: num(beOn), likely: num(likely) }));
  else if (likely >= beOn)
    lessons.push(t("lunch.lesson.between", { be: from(be), setup: eur(m.setup), beOn: num(beOn), likely: num(likely), amt: eur(Math.abs(expectedTest)), dir: expectedTest < 0 ? t("word.down") : t("word.up") }));
  else lessons.push(be === beOn ? t("lunch.lesson.belowOne", { beOn: from(beOn), likely: num(likely) }) : t("lunch.lesson.below", { be: num(be), beOn: from(beOn), likely: num(likely) }));
  if (m.gap > EPS && m.switchers <= EPS)
    lessons.push(t("lunch.lesson.noRegulars", { price: price(m.offerPrice), net: price(m.netOfferPrice), vat: vatPct, cost: price(m.offerCost), m: price(m.mOffer) }));
  else if (m.gap > EPS)
    lessons.push(t("lunch.lesson.switch", { price: price(m.offerPrice), net: price(m.netOfferPrice), vat: vatPct, cost: price(m.offerCost), m: price(m.mOffer), spend: price(m.lunchSpend), now: price(m.mLunchNow), gap: price(m.gap), sw: num(m.switchers), loss: price(m.switchLoss) }));
  else lessons.push(t("lunch.lesson.noSwitch", { price: price(m.offerPrice), net: price(m.netOfferPrice), vat: vatPct, m: price(m.mOffer), now: price(m.mLunchNow) }));
  if (worst < 0)
    lessons.push(t("lunch.lesson.worst", { worst: eur(-worst), share: pc(m.switchShare), cash: shareOfCash !== undefined ? t("lunch.lesson.worstCash", { p: pct(shareOfCash), cash: eur(cash!) }) : "" }));
  if (top.swing >= 0.005) lessons.push(t("lesson.mostMatters", { plain: continueSentence(uncertaintyPlain) }));
  lessons.push(t("lesson.method"));

  // ---- Next questions ----------------------------------------------------
  const guessed = (k: string) => filledIn(inputs, k);
  const fromGuesses: string[] = [];
  if (guessed("lunch_spend")) fromGuesses.push(t("lunch.q.lunchSpend", { spend: price(m.lunchSpend) }));
  if (guessed("vat_rate")) fromGuesses.push(t("lunch.q.vat", { vat: vatPct }));
  if (guessed("variable_cost_share")) fromGuesses.push(t("lunch.q.vcs", { vcs: pc(m.vcs) }));
  if (guessed("switch_share")) fromGuesses.push(t("lunch.q.switch", { share: pc(m.switchShare) }));
  if (guessed("extra_low") || guessed("extra_high")) fromGuesses.push(t("lunch.q.range", { lo: num(low), hi: num(high) }));
  if (guessed("setup_cost")) fromGuesses.push(t("lunch.q.setup"));
  if (guessed("extra_staff_hours_per_day")) fromGuesses.push(t("lunch.q.staffHours"));
  else if (guessed("staff_hourly_cost") && m.staffHours > 0) fromGuesses.push(t("lunch.q.staffRate", { rate: price(m.staffRate) }));
  if (guessed("marketing_per_week")) fromGuesses.push(t("lunch.q.marketing"));
  if (guessed("test_days")) fromGuesses.push(t("lunch.q.days", { days: num(days) }));
  const nextQuestions: string[] = [
    ...(demo ? [t("lunch.q.demo")] : []),
    ...fromGuesses.slice(0, 4),
    ...(cash === undefined && worst < 0 ? [t("lunch.q.cash", { worst: eur(Math.max(0, -worst)) })] : []),
    ...(fixed === undefined ? [t("lunch.q.fixed")] : []),
    t("lunch.q.baseline", { lc: num(m.lunchCustomers) }),
    ...(top.key === "extra_likely" ? [t("lunch.q.extra")] : []),
  ].slice(0, 6);

  // ---- Warnings ----------------------------------------------------------
  const warnings: string[] = [];
  if (!m.reachable) warnings.push(t("lunch.warn.none", { price: price(m.offerPrice), net: price(m.netOfferPrice), cost: price(m.offerCost) }));
  else if (be !== null && beOn !== null) {
    if (beOn > wc && wc > 0) warnings.push(t("lunch.warn.beAboveDay", { beOn: num(beOn), wc: num(wc) }));
    if (likely < beOn) warnings.push(t("lunch.warn.belowOngoing", { likely: num(likely), beOn: num(beOn) }));
    else if (likely < be) warnings.push(t("lunch.warn.belowTest", { likely: num(likely), be: num(be), amt: eur(Math.abs(expectedTest)), beOn: num(beOn) }));
    if (high < be) warnings.push(t("lunch.warn.highBelow", { high: num(high), be: num(be) }));
  }
  if (likely > wc && wc > 0) warnings.push(t("lunch.warn.likelyAboveDay", { likely: num(likely), wc: num(wc) }));
  else if (m.lunchCustomers > 0 && likely > m.lunchCustomers) warnings.push(t("lunch.warn.likelyDoubles", { likely: num(likely), lc: num(m.lunchCustomers) }));
  if (worst < 0 && cash !== undefined && cash > 0) {
    if (-worst > cash) warnings.push(t("lunch.warn.cashOver", { worst: eur(-worst), cash: eur(cash) }));
    else if (-worst > cash * 0.5) warnings.push(t("lunch.warn.cashHalf", { worst: eur(-worst), cash: eur(cash) }));
  }
  if (guessed("lunch_spend") && m.gap < -EPS) warnings.push(t("lunch.warn.avgSpend", { spend: price(m.lunchSpend), now: price(m.mLunchNow), m: price(m.mOffer) }));
  if (m.gap > EPS && m.switchers > EPS) warnings.push(t("lunch.warn.gap", { gap: price(m.gap), m: price(m.mOffer), now: price(m.mLunchNow) }));
  // A cost per hour below the statutory minimum wage makes the deal look cheaper to run than it can be.
  const rateInput = inputs.find((i) => i.key === "staff_hourly_cost");
  if (rateInput && rateInput.filledBy === undefined && typeof rateInput.value === "number" && rateInput.value < MIN_WAGE_2026 - EPS)
    warnings.push(t("lunch.warn.belowMinWage", { rate: price(rateInput.value), min: price(MIN_WAGE_2026), next: price(MIN_WAGE_2027) }));

  return { current, scenarios, breakEven, worstCase, biggestUncertainty, sensitivity, lessons, nextQuestions, warnings };
}

/** "Why this number": the calculation for one slider position, in words. */
export function explainX(m: LunchModel, x: number): string {
  const nd = m.netDay(x), nt = m.netTest(x);
  // When switching regulars leave more than the running costs, there is nothing to cover: add it, never "− −€10.03".
  let s = t(m.needDay < -EPS ? "lunch.x.baseGain" : "lunch.x.base", {
    who: t("n.extraCustomersDay", { n: x }),
    x: num(x),
    m: price(m.mOffer),
    need: price(m.needDay),
    gain: price(-m.needDay),
    nd: signedPrice(nd),
    days: t("n.weekdays", { n: m.days }),
    dn: num(m.days),
    setup: price(m.setup),
    nt: signedPrice(nt),
  });
  const be = m.beTest, beOn = m.beOngoing;
  if (be !== null && beOn !== null) {
    if (be === 0) s += t("lunch.x.paysZero");
    else if (x >= be) s += t("lunch.x.pays", { be: num(be) });
    else if (x >= beOn) s += t("lunch.x.daily", { beOn: num(beOn), be: num(be) });
    else s += t("lunch.x.loses", { beOn: num(beOn), be: num(be) });
  } else s += t("lunch.x.none");
  return s;
}

/**
 * One "why this changed" sentence for a single input moved from `b` to `a` (all other inputs as in `b`).
 * Explains the mechanism first, then what it did to break-even and the expected test result.
 * Any sum it writes out uses the same cent amounts the model uses, so it checks out by hand.
 */
export function explainLunchChange(key: string, b: Values, a: Values, label = key.replace(/_/g, " ")): { text: string; mentionsWorst: boolean } {
  const mb = lunchModel(b), ma = lunchModel(a);
  const hb = lunchHeadline(b), ha = lunchHeadline(a);
  const from = n(b, key), to = n(a, key);
  const up = to > from;
  const effect = (): string => {
    const parts: string[] = [];
    if (hb.breakEven !== null && ha.breakEven !== null) {
      const d = ha.breakEven - hb.breakEven;
      if (d !== 0) parts.push(t(d < 0 ? "lunch.chg.beFewer" : "lunch.chg.beMore", { n: Math.abs(d), from: num(hb.breakEven), to: num(ha.breakEven) }));
      else parts.push(t("lunch.chg.beSame", { be: num(hb.breakEven) }));
    } else if (ha.breakEven === null) parts.push(t("lunch.chg.beGone"));
    if (Math.abs(ha.netTestExpected - hb.netTestExpected) >= 0.005)
      parts.push(t("chg.expected", { from: seur(hb.netTestExpected), to: seur(ha.netTestExpected) }));
    return parts.join(t("chg.and"));
  };
  const so = (cause: string) => t("chg.so", { cause, effect: effect() });
  const days = (x: number) => t("n.weekdays", { n: x });

  switch (key) {
    case "offer_price":
      return {
        text:
          so(
            t(up ? "lunch.chg.offerPrice.up" : "lunch.chg.offerPrice.down", { from: price(from), to: price(to), diff: price(Math.abs(r2(ma.mOffer - mb.mOffer))), mb: price(mb.mOffer), ma: price(ma.mOffer) }) +
              (Math.abs(ma.switchLoss - mb.switchLoss) > 0.005 ? t("lunch.chg.offerPrice.switch", { lb: price(mb.switchLoss), la: price(ma.switchLoss) }) : ""),
          ) + t("lunch.chg.offerPrice.tail"),
        mentionsWorst: false,
      };
    case "offer_cost":
      return { text: so(t(up ? "lunch.chg.offerCost.up" : "lunch.chg.offerCost.down", { from: price(from), to: price(to), diff: price(Math.abs(r2(ma.mOffer - mb.mOffer))), mb: price(mb.mOffer), ma: price(ma.mOffer) })), mentionsWorst: false };
    case "extra_likely": {
      const d = Math.abs(to - from);
      return {
        text: t("lunch.chg.likely", { from: num(from), to: num(to), m: price(mb.mOffer), d: num(d), days: num(mb.days), amt: price(r2(d * mb.mOffer * mb.days)), eb: signedPrice(hb.netTestExpected), ea: signedPrice(ha.netTestExpected), be: hb.breakEvenText }),
        mentionsWorst: false,
      };
    }
    case "extra_low":
    case "extra_high":
      return {
        text: t(key === "extra_low" ? "lunch.chg.low" : "lunch.chg.high", { from: num(from), to: num(to), rb: seur(mb.netTest(from)), ra: seur(ma.netTest(to)) }),
        mentionsWorst: false,
      };
    case "switch_share":
      return {
        text: so(t(mb.gap >= 0 ? "lunch.chg.switch.cost" : "lunch.chg.switch.gain", { from: pc(from), to: pc(to), sb: num(mb.switchers), sa: num(ma.switchers), gap: price(Math.abs(mb.gap)), lb: price(Math.abs(mb.switchLoss)), la: price(Math.abs(ma.switchLoss)) })),
        mentionsWorst: false,
      };
    case "lunch_customers":
      return { text: so(t(mb.gap >= 0 ? "lunch.chg.lunchCustomers.cost" : "lunch.chg.lunchCustomers.gain", { from: num(from), to: num(to), sa: num(ma.switchers), sb: num(mb.switchers), gap: price(Math.abs(mb.gap)) })), mentionsWorst: false };
    case "lunch_spend":
      return { text: so(t(ma.gap >= 0 ? "lunch.chg.lunchSpend.cost" : "lunch.chg.lunchSpend.gain", { from: price(from), to: price(to), ma: price(ma.mLunchNow), mb: price(mb.mLunchNow), price: price(mb.offerPrice), ga: price(Math.abs(ma.gap)), gb: price(mb.gap) })), mentionsWorst: false };
    case "variable_cost_share": {
      const W2 = (vv: Values, mm: LunchModel) => { const tk = r2(n(vv, "weekday_customers") * n(vv, "avg_spend") * W); return r2(tk / mm.vatDiv - tk * mm.vcs); };
      return { text: so(t("lunch.chg.vcs", { from: pc(from), to: pc(to), mb: price(mb.mLunchNow), ma: price(ma.mLunchNow), lb: eur(W2(b, mb)), la: eur(W2(a, ma)) })), mentionsWorst: false };
    }
    case "vat_rate":
      return { text: so(t("lunch.chg.vat", { from: pc(from), to: pc(to), mb: price(mb.mOffer), ma: price(ma.mOffer), lb: price(mb.mLunchNow), la: price(ma.mLunchNow) })), mentionsWorst: false };
    case "setup_cost":
      return {
        text: so(t("lunch.chg.setup", { from: eur(from), to: eur(to), beOn: mb.beOngoing === null ? t("lunch.outOfReach") : t("unit.perDay", { v: num(mb.beOngoing) }), wb: eur(Math.max(0, -hb.worstCase)), wa: eur(Math.max(0, -ha.worstCase)) })),
        mentionsWorst: true,
      };
    case "extra_staff_hours_per_day":
    case "extra_staff_cost_per_day":
      return { text: so(t("lunch.chg.staffHours", { from: t("unit.hoursPerDay", { n: mb.staffHours }), to: t("unit.hoursPerDay", { n: ma.staffHours }), db: price(mb.dailyCost), da: price(ma.dailyCost) })), mentionsWorst: false };
    case "staff_hourly_cost":
      return { text: so(t("lunch.chg.staffRate", { from: price(from), to: price(to), db: price(mb.dailyCost), da: price(ma.dailyCost) })), mentionsWorst: false };
    case "marketing_per_week":
      return { text: so(t("lunch.chg.marketing", { from: price(from), to: price(to), pb: price(mb.marketingDay), pa: price(ma.marketingDay), db: price(mb.dailyCost), da: price(ma.dailyCost) })), mentionsWorst: false };
    case "test_days":
      return {
        text: t(to > from ? "lunch.chg.days.more" : "lunch.chg.days.fewer", { from: days(from), to: days(to), bb: hb.breakEvenText, ba: ha.breakEvenText, wb: eur(Math.max(0, -hb.worstCase)), wa: eur(Math.max(0, -ha.worstCase)), eb: seur(hb.netTestExpected), ea: seur(ha.netTestExpected) }),
        mentionsWorst: true,
      };
    case "cash_buffer": {
      const w = Math.max(0, -ha.worstCase);
      const share = `${from > 0 ? `${pct(w / from)} → ` : ""}${to > 0 ? pct(w / to) : t("lunch.chg.cash.all")}`;
      return { text: t("lunch.chg.cash", { from: eur(from), to: eur(to), w: eur(w), share }), mentionsWorst: true };
    }
    case "monthly_fixed_costs": {
      const nm = ha.netMonthExpected;
      return { text: t("lunch.chg.fixed", { from: eur(from), to: eur(to), nm: seur(nm), pb: from > 0 ? pct(nm / from, 1) : "—", pa: to > 0 ? pct(nm / to, 1) : "—" }), mentionsWorst: false };
    }
    case "weekday_customers":
    case "avg_spend": {
      const tb = r2(n(b, "weekday_customers") * n(b, "avg_spend") * W), ta = r2(n(a, "weekday_customers") * n(a, "avg_spend") * W);
      const what = key === "weekday_customers" ? t("lunch.chg.wc", { from: num(from), to: num(to) }) : t("lunch.chg.avg", { from: price(from), to: price(to) });
      return { text: t("lunch.chg.dayTail", { what, tb: eur(tb), ta: eur(ta) }), mentionsWorst: false };
    }
    case "kiez":
      return { text: t("chg.kiez", { from: String(b[key] ?? "—"), to: String(a[key] ?? "—") }), mentionsWorst: false };
    default:
      return { text: so(t("chg.default", { label, from: typeof b[key] === "string" ? String(b[key]) : num(from), to: typeof a[key] === "string" ? String(a[key]) : num(to) })), mentionsWorst: false };
  }
}

