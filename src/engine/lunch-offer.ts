/**
 * Weekday lunch offer: the deterministic maths behind every number the owner sees.
 *
 * Everything is per weekday unless the name says otherwise. The one guess that
 * drives the result is x, the number of extra (new) lunch customers a day.
 *
 *   margin per deal       m_offer     = offer_price − offer_cost
 *   lunch margin today    m_lunch_now = lunch_spend × (1 − variable_cost_share)
 *   switching regulars    switchers   = lunch_customers × switch_share
 *   cost of switching     switch_loss = switchers × (m_lunch_now − m_offer)   (negative = a gain)
 *   running cost          daily_cost  = extra_staff_cost_per_day + marketing_per_week / 5
 *   net_day(x)   = x × m_offer − switch_loss − daily_cost
 *   net_test(x)  = net_day(x) × test_days − setup_cost
 *   net_month(x) = net_day(x) × 21.7 weekdays (ongoing, setup already paid)
 */
import { money, num, pct, plural, price, round, signed } from "./format.ts";
import type { Analysis, Figure, ResolvedInput, Scenario, SensitivityPoint, Source, Unit } from "./types.ts";

export const WEEKDAYS_PER_MONTH = 21.7;
const W = WEEKDAYS_PER_MONTH;
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
const has = (v: Values, k: string): boolean => typeof v[k] === "number";
/** Whole customers, rounded up, never below zero (float-safe: 7.0000000001 stays 7). */
const ceilUp = (q: number): number => Math.max(0, Math.ceil(q - EPS));
/** 32%, or 32.5% when the share needs a decimal. */
const pc = (s: number): string => pct(s, Number.isInteger(Math.round(s * 1e6) / 1e4) ? 0 : 1);
/** Totals in plain sentences: whole euros from €10 up ("about €56 down"); the maths strings keep the cents. */
const eur = (x: number): string => money(x, Math.abs(x) < 10 && Math.abs(x) >= 0.005);
const seur = (x: number): string => (x > 0 ? `+${eur(x)}` : eur(x));

function fig(id: string, label: string, value: number, unit: Unit, source: Source, maths: string): Figure {
  return { id, label, value: unit === "share" ? round(value, 4) : round(value, 2), unit, source, maths };
}

/** A figure built from inputs is demo data if any input is, a guess if any input is a guess, else a calculation. */
function fromSources(src: Record<string, Source>, keys: string[]): Source {
  const s = keys.map((k) => src[k]);
  if (s.includes("demo")) return "demo";
  if (s.includes("assumption")) return "assumption";
  return "calculation";
}

/** "€15.00 for regulars who switch + €23.00 for staff and promotion − €4.00 …" (zero parts left out). */
function sumText(parts: { amount: number; label: string }[]): string {
  const live = parts.filter((p) => Math.abs(p.amount) > EPS).sort((x, y) => Number(x.amount < 0) - Number(y.amount < 0));
  if (live.length === 0) return money(0);
  return live
    .map((p, i) => {
      const body = `${money(Math.abs(p.amount))} ${p.label}`;
      if (i === 0) return p.amount < 0 ? `−${body}` : body;
      return `${p.amount < 0 ? "−" : "+"} ${body}`;
    })
    .join(" ");
}

export function valuesOf(inputs: ResolvedInput[]): Values {
  return Object.fromEntries(inputs.map((i) => [i.key, i.value]));
}

function sourcesOf(inputs: ResolvedInput[]): Record<string, Source> {
  return Object.fromEntries(inputs.map((i) => [i.key, i.source]));
}

export interface LunchModel {
  offerPrice: number;
  offerCost: number;
  lunchSpend: number;
  vcs: number;
  lunchCustomers: number;
  switchShare: number;
  staff: number;
  marketing: number;
  setup: number;
  days: number;
  /** What one deal leaves after ingredients. */
  mOffer: number;
  /** What one ordinary lunch leaves after ingredients today. */
  mLunchNow: number;
  /** How much less a regular leaves when they switch to the deal (negative = more). */
  gap: number;
  switchers: number;
  switchLoss: number;
  dailyCost: number;
  /** Everything a day of the deal has to cover before it makes money (switching + running costs). */
  needDay: number;
  reachable: boolean;
  /** Extra customers a day so each day pays its way (setup already paid). */
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
  const offerPrice = n(v, "offer_price");
  const offerCost = n(v, "offer_cost");
  const vcs = n(v, "variable_cost_share", 0.3);
  const lunchSpend = has(v, "lunch_spend") ? n(v, "lunch_spend") : n(v, "avg_spend");
  const lunchCustomers = n(v, "lunch_customers");
  const switchShare = n(v, "switch_share", 0.3);
  const staff = n(v, "extra_staff_cost_per_day");
  const marketing = n(v, "marketing_per_week");
  const setup = n(v, "setup_cost");
  const days = Math.max(1, n(v, "test_days", 10));

  const mOffer = offerPrice - offerCost;
  const mLunchNow = lunchSpend * (1 - vcs);
  const gap = mLunchNow - mOffer;
  const switchers = lunchCustomers * switchShare;
  const switchLoss = switchers * gap;
  const dailyCost = staff + marketing / 5;
  const needDay = switchLoss + dailyCost;
  const reachable = mOffer > EPS;
  const beOngoingExact = reachable ? Math.max(0, needDay / mOffer) : null;
  const beTestExact = reachable ? Math.max(0, (needDay + setup / days) / mOffer) : null;

  const netDay = (x: number) => x * mOffer - switchLoss - dailyCost;
  return {
    offerPrice, offerCost, lunchSpend, vcs, lunchCustomers, switchShare, staff, marketing, setup, days,
    mOffer, mLunchNow, gap, switchers, switchLoss, dailyCost, needDay, reachable,
    beOngoing: beOngoingExact === null ? null : ceilUp(beOngoingExact),
    beOngoingExact,
    beTest: beTestExact === null ? null : ceilUp(beTestExact),
    beTestExact,
    netDay,
    netTest: (x) => netDay(x) * days - setup,
    netMonth: (x) => netDay(x) * W,
    revenueDay: (x) => x * offerPrice + switchers * (offerPrice - lunchSpend),
  };
}

/** The handful of numbers "what changed" compares. */
export function lunchHeadline(v: Values) {
  const m = lunchModel(v);
  const likely = n(v, "extra_likely");
  return {
    breakEven: m.beTest,
    breakEvenText: m.beTest === null ? "out of reach" : `${num(m.beTest)} a day`,
    netTestExpected: round(m.netTest(likely)),
    netMonthExpected: round(m.netMonth(likely)),
    worstCase: round(m.netTest(0)),
  };
}

/** What a day of the deal has to cover, as words for the maths strings. */
function needParts(m: LunchModel): { amount: number; label: string }[] {
  return [
    { amount: m.switchLoss, label: m.switchLoss >= 0 ? "for regulars who switch" : "gained from regulars who switch" },
    { amount: m.dailyCost, label: "for staff and promotion" },
  ];
}

function costWords(m: LunchModel): string {
  const w: string[] = [];
  if (Math.abs(m.switchLoss) > EPS) w.push("switching regulars");
  if (m.staff > 0) w.push("staff");
  if (m.marketing > 0) w.push("promotion");
  if (w.length === 0) return "costs";
  return w.length === 1 ? w[0]! : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

function breakEvenMaths(m: LunchModel): string {
  if (!m.reachable) return `${price(m.offerPrice)} deal price − ${price(m.offerCost)} ingredients = ${price(m.mOffer)} per deal: nothing is left to cover any costs.`;
  const parts = needParts(m);
  if (m.setup > 0) parts.push({ amount: m.setup / m.days, label: `setup (${money(m.setup)} ÷ ${num(m.days)} days)` });
  const need = m.needDay + (m.setup > 0 ? m.setup / m.days : 0);
  const exact = m.beTestExact ?? 0;
  if (need <= EPS)
    return `Regulars who switch leave you ${money(-m.switchLoss)} a day more than their usual lunch did${m.dailyCost > 0 || m.setup > 0 ? `, which covers ${sumText(parts.filter((p) => p.amount > 0))} a day` : ""}: nothing is left to cover, so no extra customers are needed.`;
  const rounded = Math.abs(exact - Math.round(exact)) < 1e-6 ? `exactly ${m.beTest}` : `${num(exact)}, rounded up to ${m.beTest}`;
  return `${sumText(parts)} = ${price(need)} a day to cover. ${price(need)} ÷ ${price(m.mOffer)} per deal = ${rounded} extra customers a day.`;
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
  const days = m.days;

  // ---- Current path ------------------------------------------------------
  const current: Figure[] = [];
  const wc = n(v, "weekday_customers"), avg = n(v, "avg_spend");
  const takings = wc * avg * W;
  const left = takings * (1 - m.vcs);
  current.push(
    fig("weekday_takings_month", "Weekday takings per month, today", takings, "EUR/month", fromSources(src, ["weekday_customers", "avg_spend"]),
      `${num(wc)} customers a day × ${price(avg)} average spend × ${W} weekdays = ${money(takings)} a month`),
    fig("weekday_left_month", "Left after ingredients per month (weekdays), today", left, "EUR/month",
      fromSources(src, ["weekday_customers", "avg_spend", "variable_cost_share"]),
      `${money(takings)} × (100% − ${pc(m.vcs)} spent on ingredients and packaging) = ${money(left)} a month to pay rent, wages and you`),
  );
  if (fixed !== undefined)
    current.push(fig("monthly_fixed_costs", "Monthly fixed costs (rent, wages, energy, insurance)", fixed, "EUR/month", src.monthly_fixed_costs ?? "owner",
      `${money(fixed)} a month, whether or not you run the deal`));
  current.push(
    fig("lunch_margin_now", "What one lunch leaves you today, after ingredients", m.mLunchNow, "EUR", fromSources(src, ["lunch_spend", "variable_cost_share"]),
      `${price(m.lunchSpend)} lunch × (100% − ${pc(m.vcs)} ingredients) = ${price(m.mLunchNow)} per lunch`),
    fig("deal_margin", "What one deal leaves you, after ingredients", m.mOffer, "EUR", fromSources(src, ["offer_price", "offer_cost"]),
      `${price(m.offerPrice)} deal price − ${price(m.offerCost)} ingredients = ${price(m.mOffer)} per deal`),
    fig("switch_cost_day", "What regulars switching to the deal cost you, per day", m.switchLoss, "EUR/day",
      fromSources(src, ["lunch_customers", "switch_share", "lunch_spend", "variable_cost_share", "offer_price", "offer_cost"]),
      m.gap >= 0
        ? `${num(m.lunchCustomers)} lunch customers × ${pc(m.switchShare)} who switch = ${num(m.switchers)} a day. Each leaves ${price(m.gap)} less (${price(m.mLunchNow)} − ${price(m.mOffer)}), so ${num(m.switchers)} × ${price(m.gap)} = ${money(m.switchLoss)} a day`
        : `${num(m.lunchCustomers)} lunch customers × ${pc(m.switchShare)} who switch = ${num(m.switchers)} a day. Each leaves ${price(-m.gap)} more than today (${price(m.mOffer)} − ${price(m.mLunchNow)}), so switching earns you ${money(-m.switchLoss)} a day`),
    fig("running_cost_day", "Running cost of the deal, per weekday", m.dailyCost, "EUR/day", fromSources(src, ["extra_staff_cost_per_day", "marketing_per_week"]),
      `${price(m.staff)} extra staff + ${price(m.marketing)} promotion a week ÷ 5 weekdays = ${price(m.dailyCost)} a day`),
  );

  // ---- Scenarios ---------------------------------------------------------
  const scenario = (id: Scenario["id"], label: string, guessName: string, key: string, x: number): Scenario => {
    const rev = m.revenueDay(x), nd = m.netDay(x), nt = m.netTest(x), nm = m.netMonth(x);
    const switchPart = m.switchLoss >= 0 ? `− ${money(m.switchLoss)} switching regulars` : `+ ${money(-m.switchLoss)} from switching regulars`;
    const figures: Figure[] = [
      fig("extra_customers", "Extra lunch customers a day", x, "customers/day", src[key] ?? "assumption",
        `${guessName}: ${plural(x, "extra lunch customer")} a day. Nobody knows this yet; the test measures it.`),
      fig("revenue_change_day", "Change in lunch takings per day", rev, "EUR/day", "calculation",
        `${num(x)} new deals × ${price(m.offerPrice)} + ${num(m.switchers)} switching regulars × (${price(m.offerPrice)} − ${price(m.lunchSpend)}) = ${signed(rev)} a day`),
      fig("net_day", "Result per weekday, after ingredients and costs", nd, "EUR/day", "calculation",
        `${num(x)} × ${price(m.mOffer)} per deal ${switchPart} − ${money(m.dailyCost)} staff and promotion = ${signed(nd)} a day`),
      fig("net_test", `Result over the test (${num(days)} weekdays, after setup)`, nt, "EUR", "calculation",
        `${signed(nd)} × ${num(days)} weekdays − ${money(m.setup)} setup = ${signed(nt)}`),
      fig("net_month", "Result per month if you keep it", nm, "EUR/month", "calculation",
        `${signed(nd)} × ${W} weekdays = ${signed(nm)} a month (no setup: that is paid once)`),
    ];
    if (fixed !== undefined && fixed > 0)
      figures.push(fig("net_month_share_fixed", "Monthly result as a share of your fixed costs", nm / fixed, "share", "calculation",
        `${signed(nm)} ÷ ${money(fixed)} fixed costs = ${nm < 0 ? "−" : ""}${pct(Math.abs(nm / fixed), 1)}`));
    const ofFixed = fixed !== undefined && fixed > 0 && nm > 0 ? ` (${pct(nm / fixed, 1)} of your fixed costs)` : "";
    const who = `If ${plural(x, "extra customer")} come${x === 1 ? "s" : ""} each weekday`;
    let plain: string;
    if (nt >= 0) plain = `${who}, the test ends ${eur(nt)} up, and keeping the deal would earn about ${eur(Math.max(0, nm))} a month${ofFixed}.`;
    else if (nm >= 0)
      plain = `${who}, the test ends ${eur(-nt)} down because the ${eur(m.setup)} setup is not paid back yet, but keeping the deal would earn about ${eur(nm)} a month${ofFixed}.`;
    else plain = `${who}, the test ends ${eur(-nt)} down, and keeping the deal would lose about ${eur(-nm)} a month.`;
    return {
      id, label, assumptionLabel: "Extra lunch customers a day", assumptionValue: x, assumptionUnit: "customers/day",
      figures, netTest: round(nt), netMonth: round(nm), plain,
    };
  };
  const scenarios: Scenario[] = [
    scenario("cautious", "Cautious", "Your cautious guess", "extra_low", low),
    scenario("expected", "Expected", "Your likely guess", "extra_likely", likely),
    scenario("optimistic", "Optimistic", "Your optimistic guess", "extra_high", high),
  ];

  // ---- Break-even --------------------------------------------------------
  const be = m.beTest, beOn = m.beOngoing;
  let bePlain: string;
  if (!m.reachable || be === null || beOn === null)
    bePlain = "Each deal leaves nothing after ingredients, so no number of extra customers can pay for the test. Raise the price or trim what is in the deal first.";
  else if (be === 0)
    bePlain = `The deal covers its costs even if nobody new comes, because regulars who switch to it leave you at least as much as their usual lunch and the running costs are covered. Every extra customer adds ${price(m.mOffer)}.`;
  else if (m.setup > 0 && be !== beOn)
    bePlain = `To pay back the whole test (${num(days)} weekdays, including the ${eur(m.setup)} setup), the deal needs ${plural(be, "extra lunch customer")} a day. After that, ${num(beOn)} a day keeps you level: each extra customer leaves ${price(m.mOffer)}, and the deal costs ${price(m.needDay)} a day to run (${costWords(m)}).`;
  else
    bePlain = `The deal needs ${plural(be, "extra lunch customer")} a day to cover what it costs: each leaves ${price(m.mOffer)}, and the deal costs ${price(m.needDay + m.setup / days)} a day (${costWords(m)}${m.setup > 0 ? ", setup" : ""}).`;
  const breakEven: Body["breakEven"] = {
    value: be ?? 0,
    unit: "customers/day",
    label: "Extra lunch customers a day to pay back the test",
    maths: breakEvenMaths(m),
    plain: bePlain,
    reachable: m.reachable,
  };

  // ---- Worst case --------------------------------------------------------
  const worst = m.netTest(0);
  const shareOfCash = cash !== undefined && cash > 0 ? round(Math.max(0, -worst) / cash, 4) : undefined;
  const worstParts: string[] = [];
  if (m.setup > 0) worstParts.push(`${eur(m.setup)} setup`);
  if (m.dailyCost > 0) worstParts.push(`${eur(m.dailyCost * days)} for staff and promotion`);
  if (m.switchLoss > EPS) worstParts.push(`${eur(m.switchLoss * days)} less from regulars who switch to the deal`);
  const worstPartsText = worstParts.length > 1 ? `${worstParts.slice(0, -1).join(", ")} and ${worstParts[worstParts.length - 1]}` : worstParts[0] ?? "";
  const cashText = shareOfCash !== undefined && worst < 0 ? ` That is ${pct(shareOfCash)} of the ${eur(cash!)} you could spend without worry.` : "";
  const worstCase: Body["worstCase"] = {
    value: round(worst),
    maths: `Nobody new: 0 × ${price(m.mOffer)} ${m.switchLoss >= 0 ? "−" : "+"} ${money(Math.abs(m.switchLoss))} switching regulars − ${money(m.dailyCost)} staff and promotion = ${signed(m.netDay(0))} a day; × ${num(days)} weekdays − ${money(m.setup)} setup = ${signed(worst)}`,
    plain:
      worst < 0
        ? `If the deal brings in nobody new, the test costs ${eur(-worst)}${worstPartsText ? `: ${worstPartsText}` : ""}.${cashText} That is the most it can cost.`
        : "Even if nobody new comes, the test does not lose money: regulars who switch to the deal leave you at least as much as their usual lunch, and that covers the running costs.",
    ...(shareOfCash !== undefined ? { shareOfCash } : {}),
  };

  // ---- Biggest uncertainty (tornado) ------------------------------------
  const at = (patch: Values) => lunchModel({ ...v, ...patch }).netTest(likely);
  const s = m.switchShare;
  const sLo = Math.max(0, Math.min(0.1, s * 0.5)), sHi = Math.min(1, Math.max(0.5, s * 1.5));
  const oc = m.offerCost, ls = m.lunchSpend;
  const tornado = [
    { key: "extra_likely", label: `Extra lunch customers a day (${num(low)} to ${num(high)})`, swing: Math.abs(m.netTest(high) - m.netTest(low)) },
    { key: "switch_share", label: `Regulars who switch to the deal (${pc(sLo)} to ${pc(sHi)})`, swing: Math.abs(at({ switch_share: sHi }) - at({ switch_share: sLo })) },
    { key: "lunch_spend", label: `What a lunch customer spends today (${price(ls * 0.85)} to ${price(ls * 1.15)})`, swing: Math.abs(at({ lunch_spend: ls * 1.15 }) - at({ lunch_spend: ls * 0.85 })) },
    { key: "offer_cost", label: `Ingredients per deal (${price(oc * 0.85)} to ${price(oc * 1.15)})`, swing: Math.abs(at({ offer_cost: oc * 1.15 }) - at({ offer_cost: oc * 0.85 })) },
  ]
    .map((t) => ({ ...t, swing: round(t.swing) }))
    .sort((a, b) => b.swing - a.swing);
  const top = tornado[0]!;
  const uncertaintyPlain: Record<string, string> = {
    extra_likely: `Whether you get ${num(low)} or ${num(high)} extra customers a day changes the test result by ${eur(top.swing)} — more than anything else. That is what your test should measure.`,
    switch_share: `How many of your regulars switch to the deal (between ${pc(sLo)} and ${pc(sHi)} of them) changes the test result by ${eur(top.swing)} — more than anything else. Ask each deal customer whether they usually have lunch here, and count the answers.`,
    lunch_spend: `What your lunch customers spend today (${price(ls * 0.85)} to ${price(ls * 1.15)}) changes the test result by ${eur(top.swing)} — more than anything else, because it sets what a switching regular costs you. Check last week's lunchtime receipts on the till before you start.`,
    offer_cost: `What one deal really costs you to make (${price(oc * 0.85)} to ${price(oc * 1.15)}) changes the test result by ${eur(top.swing)} — more than anything else. Cost one deal carefully from your supplier invoices before you start.`,
  };
  const biggestUncertainty: Body["biggestUncertainty"] = {
    key: top.key,
    label: top.label,
    swing: top.swing,
    plain: uncertaintyPlain[top.key] ?? "",
    ranking: tornado,
  };

  // ---- Sensitivity (the slider) -----------------------------------------
  const maxX = Math.max(Math.ceil(high * 1.5), (be ?? 0) * 2, 10);
  const step = maxX > 60 ? Math.ceil(maxX / 60) : 1;
  const points: SensitivityPoint[] = [];
  for (let x = 0; x <= maxX; x += step) points.push({ x, netTest: round(m.netTest(x)), netMonth: round(m.netMonth(x)), explanation: explainX(m, x) });
  const sensitivity: Body["sensitivity"] = {
    key: "extra_likely",
    label: "Extra lunch customers a day",
    unit: "customers/day",
    current: likely,
    breakEvenX: be,
    points,
  };

  // ---- Lessons -----------------------------------------------------------
  const expectedTest = m.netTest(likely);
  const lessons: string[] = [];
  if (!m.reachable || be === null || beOn === null)
    lessons.push("Each deal leaves nothing after ingredients, so more customers only means more work. A deal has to leave something over before customer numbers matter.");
  else if (be === 0)
    lessons.push(`On these numbers the deal pays for itself even if nobody new comes, because regulars who switch to it leave you more than their usual lunch. That rests on what lunch customers spend today (${price(m.lunchSpend)}), so check that number first.`);
  else if (likely >= be)
    lessons.push(`Break-even is the number to beat: ${plural(be, "extra lunch customer")} a day pays back the test. Your likely guess of ${num(likely)} beats it, so on your own numbers the test pays for itself — if the guess is right. The test checks the guess.`);
  else if (likely >= beOn)
    lessons.push(`You need ${num(be)} extra lunch customers a day to pay back the test (including the ${eur(m.setup)} setup), and ${num(beOn)} a day to break even after that. Your likely guess of ${num(likely)} sits in between: the test itself would end about ${eur(Math.abs(expectedTest))} ${expectedTest < 0 ? "down" : "up"}, but the deal would pay its way if you kept it.`);
  else
    lessons.push(`You need ${num(beOn)} extra lunch customers a day just to cover the deal's daily costs (${num(be)} to pay back the test too). Your likely guess is ${num(likely)}, so on your own numbers the deal loses money every day. Changing the price, the contents or the promotion moves the break-even; a hopeful guess does not.`);
  if (m.gap > EPS)
    lessons.push(`Each deal leaves ${price(m.mOffer)} after ingredients, while a regular's usual ${price(m.lunchSpend)} lunch leaves ${price(m.mLunchNow)}. So every regular who switches to the deal costs you ${price(m.gap)}: with about ${num(m.switchers)} of them a day, that is ${eur(m.switchLoss)} a day before a single new customer arrives.`);
  else
    lessons.push(`Each deal leaves ${price(m.mOffer)} after ingredients — at least as much as a regular's usual lunch (${price(m.mLunchNow)}) — so regulars switching to it cost you nothing. Only the running costs have to be earned back.`);
  if (worst < 0)
    lessons.push(`If nobody new comes, the test costs at most ${eur(-worst)}${shareOfCash !== undefined ? ` — ${pct(shareOfCash)} of the ${eur(cash!)} you could spend without worry` : ""}. Knowing the most you can lose before you start is what makes a test safe to try.`);
  if (biggestUncertainty.plain) lessons.push(`The number that matters most: ${biggestUncertainty.plain.charAt(0).toLowerCase()}${biggestUncertainty.plain.slice(1)}`);
  lessons.push("This method works for any decision: write down your numbers, work out the break-even, then run a small test with a spending limit to check the one guess that matters most.");

  // ---- Next questions ----------------------------------------------------
  const guessed = (k: string) => src[k] === "assumption" && inputs.find((i) => i.key === k)?.note !== undefined;
  const fromGuesses: string[] = [];
  if (guessed("lunch_spend"))
    fromGuesses.push(`What does a lunchtime customer really spend? What-IF used your all-day average (${price(m.lunchSpend)}); last week's lunchtime receipts on the till will tell you.`);
  if (guessed("variable_cost_share"))
    fromGuesses.push(`What share of your takings goes on ingredients and packaging? What-IF guessed ${pc(m.vcs)}; last month's supplier bills divided by last month's takings gives the real figure.`);
  if (guessed("switch_share"))
    fromGuesses.push(`How many regulars would switch to the deal? What-IF used ${pc(m.switchShare)}. Ask five regulars this week whether they would take the deal instead of their usual lunch.`);
  if (guessed("extra_low") || guessed("extra_high"))
    fromGuesses.push(`What would a slow week and a great week look like? Give your own cautious and optimistic numbers instead of What-IF's ${num(low)} and ${num(high)} a day.`);
  if (guessed("setup_cost")) fromGuesses.push("Are there any one-off costs to start, such as a sign, flyers or reprinting the menu? What-IF assumed none.");
  if (guessed("extra_staff_cost_per_day")) fromGuesses.push("Would a busier lunch need extra staff hours? What-IF assumed no extra staff cost.");
  if (guessed("marketing_per_week")) fromGuesses.push("Will you pay to promote the deal, for example a boosted Instagram post? What-IF assumed nothing.");
  if (guessed("test_days")) fromGuesses.push(`How many weekdays could you run the test? What-IF assumed ${num(days)}.`);
  const nextQuestions: string[] = [
    ...(demo ? ["These are demo numbers for a made-up café. Which ones are furthest from yours? Start with your lunch customers and what they spend."] : []),
    ...fromGuesses.slice(0, 4),
    ...(cash === undefined && worst < 0 ? [`How much cash could you put into a test without worry? It tells you whether the ${eur(Math.max(0, -worst))} worst case is comfortable.`] : []),
    ...(fixed === undefined ? ["What are your monthly fixed costs (rent, wages, energy, insurance)? They put the monthly result in proportion."] : []),
    `Count lunch customers (11:30–14:30) for 3 weekdays to replace the rough figure of ${num(m.lunchCustomers)} a day with a measured baseline.`,
    ...(top.key === "extra_likely" ? ["How many extra lunch customers a day will the deal really bring? Only the test can tell, so plan how you will count them."] : []),
  ].slice(0, 6);

  // ---- Warnings ----------------------------------------------------------
  const warnings: string[] = [];
  if (!m.reachable)
    warnings.push(`Each deal leaves nothing after ingredients (${price(m.offerPrice)} price, ${price(m.offerCost)} ingredients), so extra customers cannot make it pay.`);
  else if (be !== null && beOn !== null) {
    if (likely < beOn)
      warnings.push(`Your likely guess (${num(likely)} a day) is below the ${num(beOn)} a day the deal needs just to cover its daily costs: on your own numbers it loses money every day.`);
    else if (likely < be)
      warnings.push(`Your likely guess (${num(likely)} a day) is below the ${num(be)} a day needed to pay back the test, so the test itself would probably end about ${eur(Math.abs(expectedTest))} down. It pays off only if you keep the deal going afterwards (it pays its way from ${num(beOn)} a day) or more people come than you expect.`);
    if (high < be) warnings.push(`Even your optimistic guess (${num(high)} a day) does not reach break-even (${num(be)} a day).`);
  }
  if (worst < 0 && cash !== undefined && cash > 0) {
    if (-worst > cash)
      warnings.push(`If nobody new comes, the test could cost ${eur(-worst)} — more than the ${eur(cash)} you said you could spare. Consider a shorter test or a cheaper setup.`);
    else if (-worst > cash * 0.5)
      warnings.push(`If nobody new comes, the test could cost ${eur(-worst)} — more than half of the ${eur(cash)} you can spare. Consider a shorter test or a cheaper setup.`);
  }
  if (guessed("lunch_spend") && m.gap < -EPS)
    warnings.push(`What-IF used your all-day average spend (${price(m.lunchSpend)}) for lunch, which is below the deal price (${price(m.offerPrice)}), so regulars switching to the deal looks like a gain. Lunch customers often spend more than the daily average; check your till, because this changes the result a lot.`);
  if (m.gap > EPS)
    warnings.push(`Each deal earns ${price(m.gap)} less than a regular's usual lunch (${price(m.mOffer)} against ${price(m.mLunchNow)}), so every regular who switches costs you money. A deal that looks different from what regulars already buy keeps switching down.`);

  return { current, scenarios, breakEven, worstCase, biggestUncertainty, sensitivity, lessons, nextQuestions, warnings };
}

/** "Why this number": the calculation for one slider position, in words. */
export function explainX(m: LunchModel, x: number): string {
  const nd = m.netDay(x), nt = m.netTest(x);
  const costs = m.needDay;
  const costText = costs >= 0 ? `minus ${money(costs)} for ${costWords(m)}` : `plus ${money(-costs)} from regulars who switch, after staff and promotion`;
  let s = `With ${plural(x, "extra customer")} a day: ${num(x)} × ${price(m.mOffer)} = ${money(x * m.mOffer)} from new customers, ${costText} = ${signed(nd)} a day. Over ${num(m.days)} weekdays${m.setup > 0 ? `, after the ${money(m.setup)} setup` : ""}: ${signed(nt)}.`;
  const be = m.beTest, beOn = m.beOngoing;
  if (be !== null && beOn !== null) {
    if (x >= be) s += ` That is at or above the ${num(be)} a day needed, so the test pays for itself.`;
    else if (x >= beOn) s += ` Each day pays its way (${num(beOn)} a day is enough for that), but the setup is not paid back within the test (that needs ${num(be)}).`;
    else s += ` That is below the ${num(be)} a day needed, so the test loses money.`;
  } else s += " Each deal leaves nothing after ingredients, so more customers cannot help.";
  return s;
}

/**
 * One "why this changed" sentence for a single input moved from `b` to `a` (all other inputs as in `b`).
 * Explains the mechanism first, then what it did to break-even and the expected test result.
 */
export function explainLunchChange(key: string, b: Values, a: Values, label = key.replace(/_/g, " ")): { text: string; mentionsWorst: boolean } {
  const mb = lunchModel(b), ma = lunchModel(a);
  const hb = lunchHeadline(b), ha = lunchHeadline(a);
  const fv = (vv: Values) => n(vv, key);
  const from = fv(b), to = fv(a);
  const up = to > from;
  const effect = (): string => {
    const parts: string[] = [];
    if (hb.breakEven !== null && ha.breakEven !== null) {
      const d = ha.breakEven - hb.breakEven;
      if (d !== 0) parts.push(`you need ${num(Math.abs(d))} ${d < 0 ? "fewer" : "more"} extra customer${Math.abs(d) === 1 ? "" : "s"} a day to break even (${num(hb.breakEven)} → ${num(ha.breakEven)})`);
      else parts.push(`break-even stays at ${num(hb.breakEven)} a day`);
    } else if (ha.breakEven === null) parts.push("break-even is now out of reach, because each deal leaves nothing after ingredients");
    if (Math.abs(ha.netTestExpected - hb.netTestExpected) >= 0.005)
      parts.push(`the expected test result goes from ${seur(hb.netTestExpected)} to ${seur(ha.netTestExpected)}`);
    return parts.join(", and ");
  };
  const so = (cause: string) => `${cause}, so ${effect()}.`;

  switch (key) {
    case "offer_price":
      return {
        text: so(`You ${up ? "raised" : "lowered"} the deal price from ${price(from)} to ${price(to)}. Each deal now earns ${price(Math.abs(to - from))} ${up ? "more" : "less"} (${price(mb.mOffer)} → ${price(ma.mOffer)})` +
          (Math.abs(ma.switchLoss - mb.switchLoss) > 0.005 ? ` and regulars who switch cost you ${money(mb.switchLoss)} → ${money(ma.switchLoss)} a day` : "")) +
          " This assumes as many new customers come at the new price; the test will show whether they do.",
        mentionsWorst: false,
      };
    case "offer_cost":
      return { text: so(`Ingredients per deal went ${up ? "up" : "down"} from ${price(from)} to ${price(to)}, so each deal leaves ${price(Math.abs(to - from))} ${up ? "less" : "more"} (${price(mb.mOffer)} → ${price(ma.mOffer)})`), mentionsWorst: false };
    case "extra_likely": {
      const d = to - from;
      return {
        text: `You changed your likely guess from ${num(from)} to ${num(to)} extra customers a day. Each one leaves ${price(mb.mOffer)}, so the expected test result moves by ${num(Math.abs(d))} × ${price(mb.mOffer)} × ${num(mb.days)} days = ${eur(Math.abs(d) * mb.mOffer * mb.days)} (${seur(hb.netTestExpected)} → ${seur(ha.netTestExpected)}). Break-even stays at ${hb.breakEvenText}: it depends on prices and costs, not on your guess.`,
        mentionsWorst: false,
      };
    }
    case "extra_low":
    case "extra_high": {
      const which = key === "extra_low" ? "cautious" : "optimistic";
      return {
        text: `Your ${which} guess changed from ${num(from)} to ${num(to)} extra customers a day (${seur(mb.netTest(from))} → ${seur(ma.netTest(to))} over the test). That only moves the ${which} scenario; break-even and the expected result stay the same.`,
        mentionsWorst: false,
      };
    }
    case "switch_share":
      return { text: so(`You changed how many regulars switch from ${pc(from)} to ${pc(to)} (${num(mb.switchers)} → ${num(ma.switchers)} a day). Each one ${mb.gap >= 0 ? `costs you ${price(mb.gap)}` : `earns you ${price(-mb.gap)} more`}, so switching now ${ma.switchLoss >= 0 ? "costs" : "earns"} ${money(Math.abs(ma.switchLoss))} a day instead of ${money(Math.abs(mb.switchLoss))}`), mentionsWorst: false };
    case "lunch_customers":
      return { text: so(`Lunch customers went from ${num(from)} to ${num(to)} a day, so about ${num(ma.switchers)} instead of ${num(mb.switchers)} would switch to the deal, ${mb.gap >= 0 ? `each costing you ${price(mb.gap)}` : `each leaving you ${price(-mb.gap)} more`}`), mentionsWorst: false };
    case "lunch_spend":
      return { text: so(`What a lunch customer spends went from ${price(from)} to ${price(to)}, so each one now leaves ${price(ma.mLunchNow)} instead of ${price(mb.mLunchNow)}, and a regular who switches to the ${price(mb.offerPrice)} deal ${ma.gap >= 0 ? `costs you ${price(ma.gap)}` : `leaves you ${price(-ma.gap)} more`} instead of ${price(mb.gap)}`), mentionsWorst: false };
    case "variable_cost_share": {
      const lb = n(b, "weekday_customers") * n(b, "avg_spend") * W * (1 - mb.vcs), la = n(a, "weekday_customers") * n(a, "avg_spend") * W * (1 - ma.vcs);
      return { text: so(`Ingredients went from ${pc(from)} to ${pc(to)} of the price. Today's lunches leave ${price(mb.mLunchNow)} → ${price(ma.mLunchNow)}, which changes what a switching regular costs, and your weekday takings after ingredients go from ${eur(lb)} to ${eur(la)} a month`), mentionsWorst: false };
    }
    case "setup_cost":
      return { text: so(`One-off setup costs went from ${eur(from)} to ${eur(to)}. They have to be paid back during the test, so they move the test break-even but not the daily one (${mb.beOngoing === null ? "out of reach" : `${num(mb.beOngoing)} a day`}). If nobody new comes, the test costs ${eur(Math.max(0, -hb.worstCase))} → ${eur(Math.max(0, -ha.worstCase))}`), mentionsWorst: true };
    case "extra_staff_cost_per_day":
      return { text: so(`Extra staff now costs ${price(to)} a day instead of ${price(from)}, so the deal costs ${price(ma.dailyCost)} a day to run instead of ${price(mb.dailyCost)}`), mentionsWorst: false };
    case "marketing_per_week":
      return { text: so(`Promotion now costs ${price(to)} a week instead of ${price(from)} (${price(ma.marketing / 5)} instead of ${price(mb.marketing / 5)} a weekday), so the deal costs ${price(ma.dailyCost)} a day to run instead of ${price(mb.dailyCost)}`), mentionsWorst: false };
    case "test_days":
      return {
        text: `The test now runs ${num(to)} weekdays instead of ${num(from)}. The setup is spread over ${to > from ? "more" : "fewer"} days, so the test break-even goes ${hb.breakEvenText} → ${ha.breakEvenText}; but if nobody new comes, the test costs ${eur(Math.max(0, -hb.worstCase))} → ${eur(Math.max(0, -ha.worstCase))}, because staff, promotion and switching regulars cost money every day it runs. The expected test result goes from ${seur(hb.netTestExpected)} to ${seur(ha.netTestExpected)}.`,
        mentionsWorst: true,
      };
    case "cash_buffer": {
      const w = Math.max(0, -ha.worstCase);
      return {
        text: `You said you could spare ${eur(to)} instead of ${eur(from)}, so the worst case (${eur(w)}) is now ${from > 0 ? `${pct(w / from)} → ` : ""}${to > 0 ? pct(w / to) : "all"} of it. The deal's own numbers do not change.`,
        mentionsWorst: true,
      };
    }
    case "monthly_fixed_costs": {
      const nm = ha.netMonthExpected;
      return {
        text: `Monthly fixed costs went from ${eur(from)} to ${eur(to)}. That does not change what the deal earns (expected ${seur(nm)} a month); it only changes how big that is next to your costs (${from > 0 ? pct(nm / from, 1) : "—"} → ${to > 0 ? pct(nm / to, 1) : "—"}).`,
        mentionsWorst: false,
      };
    }
    case "weekday_customers":
    case "avg_spend": {
      const tb = n(b, "weekday_customers") * n(b, "avg_spend") * W, ta = n(a, "weekday_customers") * n(a, "avg_spend") * W;
      const what = key === "weekday_customers" ? `Customers on a weekday went from ${num(from)} to ${num(to)}` : `Average spend went from ${price(from)} to ${price(to)}`;
      return { text: `${what}, so your weekday takings today go from ${eur(tb)} to ${eur(ta)} a month. On its own this does not change the deal's result: that depends on your lunch numbers, not the whole day.`, mentionsWorst: false };
    }
    default:
      return { text: so(`${label} changed from ${typeof b[key] === "string" ? b[key] : num(from)} to ${typeof a[key] === "string" ? a[key] : num(to)}`), mentionsWorst: false };
  }
}
