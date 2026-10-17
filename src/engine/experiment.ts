/**
 * planTest(): turns an analysis into one small, capped, measurable test.
 *
 * The decision rule is written before the test starts and is tied to the
 * break-even, so the owner decides on evidence rather than on hope.
 */
import { money, num, pct, price, setCurrency, signedPct } from "./format.ts";
import { lunchModel, valuesOf } from "./lunch-offer.ts";
import { priceModel } from "./price-change.ts";
import type { Analysis, TestPlan } from "./types.ts";

type Values = Record<string, number | string>;
const EPS = 1e-9;
/** Totals in plain sentences: whole euros from €10 up. */
const eur = (x: number): string => money(x, Math.abs(x) < 10 && Math.abs(x) >= 0.005);
const n = (v: Values, k: string, d = 0): number => {
  const x = v[k];
  return typeof x === "number" && Number.isFinite(x) ? x : d;
};
const has = (v: Values, k: string): boolean => typeof v[k] === "number";
const ceilUp = (q: number): number => Math.max(0, Math.ceil(q - EPS));
const pc = (s: number): string => pct(s, Number.isInteger(Math.round(s * 1e6) / 1e4) ? 0 : 1);
/** Round a spending limit up to a friendly number (nearest €10). */
const friendly = (x: number): number => Math.max(10, Math.round(x / 10) * 10);

export function planTest(a: Analysis): TestPlan {
  setCurrency(a.currency);
  const v = valuesOf(a.inputs);
  if (a.template === "lunch_offer") return planLunch(a, v);
  if (a.template === "price_change") return planPrice(a, v);
  throw new Error(`What-IF cannot plan a test for the decision "${String(a.template)}".`);
}

function checkInDays(days: number, mid: number): number[] {
  return [...new Set([Math.min(3, days), mid, days])].filter((d) => d >= 1).sort((x, y) => x - y);
}

function planLunch(a: Analysis, v: Values): TestPlan {
  const m = lunchModel(v);
  const days = m.days;
  const likely = n(v, "extra_likely");
  const be = m.beTest, beOn = m.beOngoing;
  const worst = m.netTest(0);
  const cash = has(v, "cash_buffer") ? n(v, "cash_buffer") : undefined;
  const lunchGuessed = a.demo || a.inputs.some((i) => (i.key === "lunch_spend" || i.key === "lunch_customers") && i.source !== "owner");
  const mid = Math.max(1, Math.round(days / 2));
  const title = `${num(days)}-weekday lunch deal test at ${price(m.offerPrice)}`;

  if (!m.reachable || be === null || beOn === null) {
    return {
      analysisId: a.id,
      title,
      days,
      before: [`Change the deal first: at ${price(m.offerPrice)} with ${price(m.offerCost)} of ingredients, each deal leaves nothing. Raise the price or trim the contents, then run What-IF again.`],
      during: [],
      measure: [],
      checkIns: [],
      decisionRule: { keep: "Not applicable until each deal leaves something after ingredients.", tweak: "Change the price or the contents.", stop: "Do not start this test as it stands." },
      costCap: "Spend nothing on this version of the deal.",
      plain: "Do not test this deal as it stands: every deal sold loses money, so more customers would only lose more. Change the price or the contents first.",
    };
  }

  // Early-stop line: what the test has cost by the halfway check-in if nobody new comes, capped at half the spare cash.
  const spentByMid = m.setup + Math.max(0, m.dailyCost + Math.max(0, m.switchLoss)) * mid;
  const capRaw = cash !== undefined && cash > 0 ? Math.min(spentByMid, cash * 0.5) : spentByMid;
  const cap = friendly(Math.max(capRaw, 10));
  const half = ceilUp(be * 0.5);

  const better = lunchModel({ ...v, offer_price: m.offerPrice + 1 });
  const ideas: string[] = [];
  if (better.beTest !== null && better.beTest < be) ideas.push(`a ${price(m.offerPrice + 1)} price (needs ${num(better.beTest)} a day, if as many come)`);
  if (m.marketing > 0) {
    const noPromo = lunchModel({ ...v, marketing_per_week: 0 });
    if (noPromo.beTest !== null && noPromo.beTest < be) ideas.push(`no paid promotion (needs ${num(noPromo.beTest)} a day)`);
  }
  const tweakIdea = ideas.length ? `, for example ${ideas.join(" or ")}` : "";

  const before: string[] = [
    lunchGuessed
      ? "Count lunch customers (11:30–14:30) every weekday for one week before you start. Some of your lunch numbers are guesses, and this baseline is what the test is measured against."
      : "Count lunch customers (11:30–14:30) for 3 weekdays before you start, so you have a measured baseline to compare with.",
    'Set up a separate "Lunch deal" button or code on the till, so every deal sold is counted.',
    'Put a tally sheet by the till with two columns: "new to lunch here" and "usually has lunch here".',
  ];
  if (m.setup > 0) before.push(`Get the sign, flyers or menu ready within the ${eur(m.setup)} you planned.`);
  before.push(`Write your stop line at the top of the sheet: stop early if you have spent ${eur(cap)} without reaching ${num(half)} extra customers a day.`);

  const during: string[] = [
    `Run the deal at ${price(m.offerPrice)} every weekday for ${num(days)} weekdays, including the slow ones.`,
    "Keep everything else the same: same menu, same opening hours, same prices for everything else. Otherwise you cannot tell what made the difference.",
  ];
  if (m.staff > 0) during.push(`Book the extra staff as planned (${price(m.staff)} a day) and no more.`);
  if (m.marketing > 0) during.push(`Spend the ${price(m.marketing)} a week on promotion as planned, on the same days each week.`);
  during.push('Ask each deal customer one quick question, "Do you usually have lunch here?", and mark the answer on the tally sheet.');

  const nm = (x: number) => m.netMonth(x);
  const decisionRule =
    be <= 0
      ? {
          keep: "If lunchtime is at least as busy as your baseline: keep the deal. On your numbers it pays for itself even with no new customers.",
          tweak: "If many more regulars switch to it than you guessed, look at the price again before deciding.",
          stop: "If lunchtime gets quieter than your baseline: stop.",
        }
      : {
          keep: `At least ${num(be)} extra lunch customers a day on average: keep the deal. It has paid back the test and would earn about ${eur(nm(be))} a month at that level.`,
          tweak:
            half < be
              ? `${num(half)} to ${num(be - 1)} a day: tweak before deciding${tweakIdea}, and run one more week.${beOn < be ? ` From ${num(beOn)} a day the deal already pays its way going forward; the setup is spent either way.` : ""}`
              : `Just under ${num(be)} a day: tweak before deciding${tweakIdea}, and run one more week.`,
          stop: `Fewer than ${num(half)} a day: stop. You will have learned that this deal is not what brings people in, for at most ${eur(Math.max(0, -worst))}.`,
        };

  const plan: TestPlan = {
    analysisId: a.id,
    title,
    days,
    before,
    during,
    measure: [
      { what: "Lunch customers per day (11:30–14:30)", how: "Tally sheet by the till: one stroke per lunch customer, totalled at 14:30. Extra customers = this count minus your baseline." },
      { what: "Deals sold per day", how: "The lunch-deal button or code on the till; read the count from the daily report." },
      { what: "How many deal customers already had lunch here", how: `The "usually has lunch here" column on the tally sheet. It shows how many regulars switched (your guess: ${pc(m.switchShare)}).` },
      { what: "Money spent on the test", how: "Keep receipts for the sign, flyers, ads and extra staff hours in one envelope, and add them up at each check-in." },
    ],
    checkIns: checkInDays(days, mid).map((d) => ({
      day: d,
      look:
        d === days
          ? `Work out the averages, apply the decision rule below and log the result in What-IF to compare it with your scenarios.`
          : d === mid
            ? `Average extra lunch customers so far (count minus baseline) against the ${num(be)} a day needed, and money spent so far against your ${eur(cap)} stop line.`
            : "Are the tally sheet and the deal button used every day? Fix the counting now; it is too early to judge the numbers.",
    })),
    decisionRule,
    costCap: `Stop early once you have spent ${eur(cap)} on the test (setup, staff, promotion and discounts to regulars) without reaching ${num(half)} extra customers a day. Even if nobody new comes, the whole test cannot cost more than ${eur(Math.max(0, -worst))}.`,
    plain: `Run the lunch deal for ${num(days)} weekdays and count. It is worth keeping if it brings at least ${plural(be)} a day; your guess is ${num(likely)}. Count lunch customers and deals sold every day, keep everything else the same, and stop early if you have spent ${eur(cap)} without reaching ${num(half)} a day.`,
  };
  return plan;
}

function plural(x: number): string {
  return `${num(x)} extra lunch customer${x === 1 ? "" : "s"}`;
}

function planPrice(a: Analysis, v: Values): TestPlan {
  const m = priceModel(v);
  const { days, item, items, units } = m;
  const low = n(v, "volume_low");
  const likely = n(v, "volume_likely");
  const title = `${num(days)}-day price test: ${item} at ${price(m.newPrice)}`;
  const Items = items.charAt(0).toUpperCase() + items.slice(1);

  if (m.beV === null || m.beUnits === null) {
    return {
      analysisId: a.id,
      title,
      days,
      before: [`Change the plan first: at ${price(m.newPrice)} each ${item} leaves nothing after ingredients (${price(m.unitCost)}).`],
      during: [],
      measure: [],
      checkIns: [],
      decisionRule: { keep: "Not applicable.", tweak: "Pick a price above what the item costs to make.", stop: "Do not start this test as it stands." },
      costCap: "Spend nothing on this version.",
      plain: "Do not test this price: every sale would lose money.",
    };
  }

  const wl = m.deltaTest(low);
  const midPrice = Math.round(((m.oldPrice + m.newPrice) / 2) * 20) / 20;
  let decisionRule: TestPlan["decisionRule"];
  let costCap: string;
  let ruleShort: string;
  if (m.beV <= 0) {
    const keepFloor = units - m.beUnits;
    const tweakShare = m.beV * 1.5;
    const tweakFloor = Math.ceil(units * (1 + tweakShare) - EPS);
    decisionRule = {
      keep: `Sales fall by ${pc(-m.beV)} or less (you still sell at least ${num(keepFloor)} a week): keep the new price.`,
      tweak: `They fall by ${pc(-m.beV)} to ${pc(-tweakShare)} (${num(tweakFloor)} to ${num(keepFloor - 1)} a week): try a smaller rise, about ${price(midPrice)}, for another ${num(days)} days.`,
      stop: `They fall by more than ${pc(-tweakShare)} (fewer than ${num(tweakFloor)} a week): go back to ${price(m.oldPrice)}.`,
    };
    costCap = `Switch back early if sales fall below ${num(tweakFloor)} a week in the first full week. At your cautious guess (${signedPct(low)}) the whole test costs about ${eur(Math.max(0, -wl))}${wl >= 0 ? " — in money it has no downside" : ""}.`;
    ruleShort = `keep it if you still sell at least ${num(keepFloor)} ${items} a week (a drop of up to ${pc(-m.beV)})`;
  } else {
    const keepAt = units + m.beUnits;
    const halfShare = m.beV * 0.5;
    const tweakAt = Math.ceil(units * (1 + halfShare) - EPS);
    decisionRule = {
      keep: `Sales rise by at least ${pc(m.beV)} (${num(keepAt)} a week or more): keep the lower price.`,
      tweak: `They rise by ${pc(halfShare)} to ${pc(m.beV)} (${num(tweakAt)} to ${num(keepAt - 1)} a week): try a smaller cut, about ${price(midPrice)}, for another ${num(days)} days.`,
      stop: `They rise by less than ${pc(halfShare)} (fewer than ${num(tweakAt)} a week): go back to ${price(m.oldPrice)}.`,
    };
    costCap = `Go back early if sales are still below ${num(tweakAt)} a week after the first full week. At your cautious guess (${signedPct(low)}) the whole test costs about ${eur(Math.max(0, -wl))}.`;
    ruleShort = `keep it if you sell at least ${num(keepAt)} ${items} a week`;
  }

  return {
    analysisId: a.id,
    title,
    days,
    before: [
      `Write down how many ${items} you sold in each of the last 2 weeks (the till's item report): that is your baseline, about ${num(units)} a week.`,
      "Change the price on the menu board, the till and any online menu on the same day.",
      "Note the weekly sales of the nearest cheaper alternative too (for example filter coffee), so you can see whether people trade down.",
    ],
    during: [
      `Keep everything else the same: same recipe, same size, no special offers on ${items}.`,
      `Run it for the full ${num(days)} days, so regulars have time to react.`,
      "If a regular asks about the new price, explain it honestly and briefly.",
    ],
    measure: [
      { what: `${Items} sold per week`, how: "The till's item report, same weekday to same weekday, so the comparison is fair." },
      { what: "Sales of the nearest alternative", how: "The till's item report: if they rise while yours fall, customers are trading down rather than leaving." },
      { what: "Comments about the price", how: "A tally sheet by the till: one stroke per comment, with a word or two about what was said." },
    ],
    checkIns: checkInDays(days, Math.min(7, days)).map((d) => ({
      day: d,
      look:
        d === days
          ? "Compare the weekly average with your baseline, apply the decision rule below and log the result in What-IF."
          : d === Math.min(7, days)
            ? `Compare the first week with your baseline: ${m.beV! <= 0 ? `you can lose up to ${num(m.beUnits!)} a week (${pc(-m.beV!)}) before you are worse off` : `you need ${num(m.beUnits!)} more a week (${pc(m.beV!)}) to be better off`}.`
            : "Is the new price on the till, the board and online? Note any comments so far.",
    })),
    decisionRule,
    costCap,
    plain: `Charge ${price(m.newPrice)} for ${num(days)} days and count ${items} sold each week against your baseline of ${num(units)}. Your guess is ${signedPct(likely)}; ${ruleShort}. Keep everything else the same.`,
  };
}
