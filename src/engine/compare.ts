/**
 * Comparing things, two ways:
 *  - whatChanged(): two versions of the same decision, and why the result moved.
 *  - compareResult(): the plan against what really happened in the test.
 */
import { money, num, pct, price, round, setCurrency, signedPct } from "./format.ts";
import { show } from "./inputs.ts";
import { explainLunchChange, lunchHeadline, lunchModel, valuesOf } from "./lunch-offer.ts";
import { explainPriceChange, priceHeadline, priceModel } from "./price-change.ts";
import { getTemplate } from "./templates.ts";
import type { Analysis, ChangeExplanation, Scenario, TemplateId, TestResult } from "./types.ts";

type Values = Record<string, number | string>;
const EPS = 1e-9;
/** Totals in plain sentences: whole euros from €10 up. */
const eur = (x: number): string => money(x, Math.abs(x) < 10 && Math.abs(x) >= 0.005);
const seur = (x: number): string => (x > 0 ? `+${eur(x)}` : eur(x));
const n = (v: Values, k: string, d = 0): number => {
  const x = v[k];
  return typeof x === "number" && Number.isFinite(x) ? x : d;
};
const pc = (s: number): string => pct(s, Number.isInteger(Math.round(s * 1e6) / 1e4) ? 0 : 1);
const ceilUp = (q: number): number => Math.max(0, Math.ceil(q - EPS));

export const OBSERVED_FIELDS: Record<TemplateId, { key: string; label: string; required: boolean }[]> = {
  lunch_offer: [
    { key: "baseline_lunch_customers", label: "Lunch customers a day before the test (your baseline count)", required: true },
    { key: "test_lunch_customers", label: "Lunch customers a day during the test (average)", required: true },
    { key: "redemptions_per_day", label: "Lunch deals sold a day during the test (average)", required: true },
    { key: "days_run", label: "Weekdays the test ran", required: false },
    { key: "actual_setup_cost", label: "What the setup really cost", required: false },
  ],
  price_change: [
    { key: "units_before_per_week", label: "Sales per week before the change (baseline)", required: true },
    { key: "units_after_per_week", label: "Sales per week at the new price (average)", required: true },
    { key: "days_run", label: "Days the test ran", required: false },
  ],
};

// ---------------------------------------------------------------------------
// whatChanged
// ---------------------------------------------------------------------------

const sameValue = (x: number | string | undefined, y: number | string | undefined): boolean => {
  if (x === undefined || y === undefined) return x === y;
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < 1e-9;
  return String(x).trim() === String(y).trim();
};

export function whatChanged(before: Analysis, after: Analysis): ChangeExplanation {
  if (before.template !== after.template)
    throw new Error("These are two different decisions, so they cannot be compared line by line. Compare two versions of the same decision instead.");
  setCurrency(after.currency);
  const t = getTemplate(after.template);
  const bv = valuesOf(before.inputs), av = valuesOf(after.inputs);
  const lunch = t.id === "lunch_offer";
  const head = lunch ? lunchHeadline : priceHeadline;
  const explain = lunch ? explainLunchChange : explainPriceChange;
  const hb = head(bv), ha = head(av);

  const changes: ChangeExplanation["changes"] = [];
  for (const f of t.fields) {
    const x = bv[f.key], y = av[f.key];
    if (sameValue(x, y)) continue;
    changes.push({
      key: f.key,
      label: f.label,
      from: x ?? "",
      to: y ?? "",
      fromText: x === undefined ? "not given" : show(f, x),
      toText: y === undefined ? "not given" : show(f, y),
    });
  }

  const unitText = (x: number) => (lunch ? `${num(x)} a day` : signedPct(x));
  const effects: ChangeExplanation["effects"] = [
    {
      id: "break_even",
      label: after.breakEven.label,
      from: hb.breakEven ?? 0,
      to: ha.breakEven ?? 0,
      fromText: hb.breakEven === null ? hb.breakEvenText : unitText(hb.breakEven),
      toText: ha.breakEven === null ? ha.breakEvenText : unitText(ha.breakEven),
    },
    { id: "net_test_expected", label: "Expected result over the test", from: hb.netTestExpected, to: ha.netTestExpected, fromText: seur(hb.netTestExpected), toText: seur(ha.netTestExpected) },
    {
      id: "net_month_expected",
      label: "Expected result per month if you keep it",
      from: hb.netMonthExpected,
      to: ha.netMonthExpected,
      fromText: `${seur(hb.netMonthExpected)} a month`,
      toText: `${seur(ha.netMonthExpected)} a month`,
    },
    {
      id: "worst_case",
      label: lunch ? "Most the test can cost (nobody new comes)" : "Worst case over the test (your cautious guess)",
      from: hb.worstCase,
      to: ha.worstCase,
      fromText: seur(hb.worstCase),
      toText: seur(ha.worstCase),
    },
  ];

  if (changes.length === 0) return { changes, effects, plain: ["Nothing changed: the numbers are the same, so the results are the same."] };

  const afterInput = new Map(after.inputs.map((i) => [i.key, i]));
  let mentionsWorst = false;
  const sentences = changes.map((c, order) => {
    const mid: Values = { ...bv };
    const y = av[c.key];
    if (y === undefined) delete mid[c.key];
    else mid[c.key] = y;
    const hm = head(mid);
    const impact = Math.abs(hm.netTestExpected - hb.netTestExpected) + (hm.breakEven !== hb.breakEven ? 0.01 : 0);
    let text: string;
    if (bv[c.key] === undefined) text = `You added "${c.label}": ${c.toText}.`;
    else if (y === undefined) text = `You removed "${c.label}" (it was ${c.fromText}).`;
    else {
      const e = explain(c.key, bv, mid, c.label);
      text = e.text;
      mentionsWorst ||= e.mentionsWorst;
    }
    const ai = afterInput.get(c.key);
    if (ai?.note && ai.source === "assumption" && (c.key.startsWith("extra_") || c.key.startsWith("volume_") || c.key === "lunch_spend"))
      text += " What-IF set this one for you from your other answers; change it if you know better.";
    return { text, impact, order };
  });
  sentences.sort((x, y) => y.impact - x.impact || x.order - y.order);
  const plain = sentences.map((s) => s.text);

  const worstChanged = Math.abs(ha.worstCase - hb.worstCase) >= 0.005;
  if (changes.length > 1) {
    plain.unshift(
      `Altogether: break-even ${effects[0]!.fromText} → ${effects[0]!.toText}, expected test result ${seur(hb.netTestExpected)} → ${seur(ha.netTestExpected)}, ` +
        `${lunch ? "most the test can cost" : "worst case"} ${eur(Math.max(0, -hb.worstCase))} → ${eur(Math.max(0, -ha.worstCase))}.`,
    );
  } else if (worstChanged && !mentionsWorst) {
    plain.push(
      lunch
        ? `If nobody new comes, the test now costs at most ${eur(Math.max(0, -ha.worstCase))} instead of ${eur(Math.max(0, -hb.worstCase))}.`
        : `At your cautious guess the test now costs ${eur(Math.max(0, -ha.worstCase))} instead of ${eur(Math.max(0, -hb.worstCase))}.`,
    );
  }
  return { changes, effects, plain };
}

// ---------------------------------------------------------------------------
// compareResult
// ---------------------------------------------------------------------------

function readObserved(template: TemplateId, observed: Record<string, unknown>): Record<string, number> {
  const fields = OBSERVED_FIELDS[template];
  if (!fields) throw new Error(`What-IF cannot compare results for the decision "${String(template)}".`);
  const clean: Record<string, number> = {};
  const missing: string[] = [];
  const problems: string[] = [];
  for (const f of fields) {
    const raw = observed?.[f.key];
    if (raw === undefined || raw === null || raw === "") {
      if (f.required) missing.push(f.label);
      continue;
    }
    const x = typeof raw === "number" ? raw : Number(String(raw).replace(/[€\s]/g, "").replace(",", "."));
    if (!Number.isFinite(x) || x < 0) {
      problems.push(`"${f.label}" should be a number of 0 or more; got "${String(raw)}".`);
      continue;
    }
    clean[f.key] = x;
  }
  if (missing.length || problems.length) {
    const lines = ["What-IF needs the test results before it can compare them with the plan."];
    if (missing.length) lines.push("Still needed:", ...missing.map((m) => `- ${m}`));
    if (problems.length) lines.push("Please check:", ...problems.map((p) => `- ${p}`));
    throw new Error(lines.join("\n"));
  }
  return clean;
}

/** Closest scenario by the measured key number, with half a unit of slack for rounding. */
function closest(scenarios: Scenario[], actual: number, slack: number): TestResult["closestScenario"] {
  const byId = (id: Scenario["id"]) => scenarios.find((s) => s.id === id)?.assumptionValue;
  const lo = byId("cautious"), hi = byId("optimistic");
  if (lo !== undefined && actual < lo - slack) return "below_cautious";
  if (hi !== undefined && actual > hi + slack) return "above_optimistic";
  let best: Scenario["id"] = "expected";
  let bestD = Infinity;
  for (const id of ["expected", "cautious", "optimistic"] as const) {
    const x = byId(id);
    if (x === undefined) continue;
    const d = Math.abs(actual - x);
    if (d < bestD - EPS) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

const CLOSEST_TEXT: Record<TestResult["closestScenario"], string> = {
  cautious: "That is closest to your cautious scenario.",
  expected: "That is close to your expected scenario.",
  optimistic: "That is closest to your optimistic scenario.",
  below_cautious: "That is below even your cautious scenario.",
  above_optimistic: "That beats even your optimistic scenario.",
};

export function compareResult(a: Analysis, observed: Record<string, number>, opts: { recordedAt?: string } = {}): TestResult {
  setCurrency(a.currency);
  const clean = readObserved(a.template, observed as Record<string, unknown>);
  const recordedAt = opts.recordedAt ?? new Date().toISOString();
  const v = valuesOf(a.inputs);
  return a.template === "lunch_offer" ? compareLunch(a, v, clean, recordedAt) : comparePrice(a, v, clean, recordedAt);
}

function compareLunch(a: Analysis, v: Values, o: Record<string, number>, recordedAt: string): TestResult {
  const m = lunchModel(v);
  const baseline = o.baseline_lunch_customers!;
  const during = o.test_lunch_customers!;
  const red = o.redemptions_per_day!;
  const days = o.days_run !== undefined && o.days_run > 0 ? o.days_run : m.days;
  const setup = o.actual_setup_cost ?? m.setup;
  const extra = during - baseline;
  const newDeals = Math.max(0, extra);
  const switchers = Math.min(baseline, Math.max(0, red - newDeals));
  const actualShare = baseline > 0 ? switchers / baseline : 0;

  // The plan's prices and costs, with what was measured: lunch customers, switching, setup, days run.
  const am = lunchModel({ ...v, lunch_customers: baseline, switch_share: actualShare, setup_cost: setup, test_days: days });
  // If lunch got quieter, each lost lunch costs what an ordinary lunch leaves.
  const netDay = extra >= 0 ? am.netDay(extra) : am.netDay(0) + extra * am.mLunchNow;
  const netTest = netDay * days - setup;
  const expected = a.scenarios.find((s) => s.id === "expected")?.netTest ?? m.netTest(n(v, "extra_likely"));

  const beExact = am.beTestExact;
  let verdict: TestResult["verdict"];
  if (beExact === null) verdict = "stop";
  else if (extra >= beExact - EPS) verdict = "keep";
  else if (extra >= beExact * 0.5 - EPS) verdict = "tweak";
  else verdict = "stop";

  const extraR = round(extra, 1);
  const closestScenario = closest(a.scenarios, extra, 0.5);
  const beNow = beExact === null ? null : ceilUp(beExact);
  const bePlanned = m.beTest;
  const beReasons: string[] = [];
  if (Math.abs(switchers - m.switchers) >= 0.5) beReasons.push(`${switchers > m.switchers ? "more" : "fewer"} regulars switched to the deal than you guessed (${num(round(switchers, 1))} a day, not ${num(round(m.switchers, 1))})`);
  if (Math.abs(setup - m.setup) >= 0.5) beReasons.push(`the setup cost ${eur(setup)} instead of ${eur(m.setup)}`);
  if (days !== m.days) beReasons.push(`it ran ${num(days)} weekdays instead of ${num(m.days)}`);
  const beSentence =
    beNow === null
      ? "Each deal leaves nothing after ingredients, so no number of customers could pay for it."
      : `With what really happened, the test needed ${num(beNow)} extra a day to pay back${bePlanned !== null && bePlanned !== beNow ? ` (the plan said ${num(bePlanned)}; ${beReasons.length ? beReasons.join(" and ") : "the measured numbers moved it"})` : ""}.`;
  const verdictText = { keep: "keep the deal", tweak: "tweak it and test one more week", stop: "stop the deal" }[verdict];
  const lunchMove = extra >= 0 ? `${num(extraR)} extra` : `${num(-extraR)} fewer`;
  const plain =
    `During the test, lunch went from ${num(baseline)} to ${num(during)} customers a day: ${lunchMove}. ${beSentence} ` +
    `So the verdict is: ${verdictText}. The test ended about ${eur(Math.abs(netTest))} ${netTest < 0 ? "down" : "up"}, against ${seur(expected)} in your expected scenario. ${CLOSEST_TEXT[closestScenario]}`;

  const likely = n(v, "extra_likely");
  const learned: string[] = [];
  if (Math.abs(extra - likely) < 0.5)
    learned.push(`Your likely guess of ${num(likely)} extra customers a day was close: reality was ${num(extraR)}. Your feel for this is good.`);
  else learned.push(`Your likely guess was ${num(likely)} extra customers a day; reality was ${num(extraR)}. Next time start from ${num(Math.max(0, extraR))}.`);
  if (baseline > 0)
    learned.push(`You guessed ${pc(m.switchShare)} of lunch regulars would switch to the deal; about ${pc(round(actualShare, 3))} did (${num(round(switchers, 1))} of ${num(baseline)} a day).`);
  if (Math.abs(baseline - m.lunchCustomers) >= 1)
    learned.push(`You estimated ${num(m.lunchCustomers)} lunch customers a day; the count said ${num(baseline)}. Use the counted number from now on.`);
  if (o.actual_setup_cost !== undefined && Math.abs(o.actual_setup_cost - m.setup) >= 0.5)
    learned.push(`The setup cost ${eur(o.actual_setup_cost)}, not the ${eur(m.setup)} you planned.`);
  if (days < m.days) learned.push(`You ran it for ${num(days)} weekdays instead of ${num(m.days)}. Short tests are noisier, so treat this as a first reading.`);
  if (red > during + EPS) learned.push(`More deals were recorded (${num(red)} a day) than lunch customers (${num(during)}); check the tally sheet and the till count.`);
  learned.push("Compare the measured number with the break-even, not with your hopes: that habit makes every next decision easier.");

  return {
    analysisId: a.id,
    recordedAt,
    observed: o,
    actual: round(extra, 2),
    actualLabel: "Extra lunch customers a day (measured)",
    closestScenario,
    verdict,
    netTest: round(netTest),
    plain,
    learned,
  };
}

function comparePrice(a: Analysis, v: Values, o: Record<string, number>, recordedAt: string): TestResult {
  const m = priceModel(v);
  const before = o.units_before_per_week!;
  const after = o.units_after_per_week!;
  if (before <= 0) throw new Error("What-IF needs the sales per week before the change (more than 0) to compare against.");
  const days = o.days_run !== undefined && o.days_run > 0 ? o.days_run : m.days;
  const change = after / before - 1;
  const netTest = ((after * m.mNew - before * m.mOld) * days) / 7;
  const expected = a.scenarios.find((s) => s.id === "expected")?.netTest ?? m.deltaTest(n(v, "volume_likely"));
  const be = m.beV;

  let verdict: TestResult["verdict"];
  if (be === null) verdict = "stop";
  else if (change >= be - EPS) verdict = "keep";
  else if (be <= 0 ? change >= be * 1.5 - EPS : change >= be * 0.5 - EPS) verdict = "tweak";
  else verdict = "stop";

  const closestScenario = closest(a.scenarios, change, 0.005);
  const beSentence =
    be === null
      ? "Each sale leaves nothing after ingredients at the new price."
      : be <= 0
        ? `You could lose up to ${pc(-be)} of sales before being worse off.`
        : `You needed sales to rise by ${pc(be)} to be better off.`;
  const verdictText = {
    keep: m.rise ? "keep the new price" : "keep the lower price",
    tweak: m.rise ? "try a smaller rise" : "try a smaller cut",
    stop: `go back to ${price(m.oldPrice)}`,
  }[verdict];
  const plain =
    `Sales went from ${num(before)} to ${num(after)} ${m.items} a week (${signedPct(round(change, 3))}). ${beSentence} So the verdict is: ${verdictText}. ` +
    `Over ${num(days)} days that is about ${seur(netTest)} compared with the old price, against ${seur(expected)} in your expected scenario. ${CLOSEST_TEXT[closestScenario]}`;

  const likely = n(v, "volume_likely");
  const learned: string[] = [];
  if (Math.abs(change - likely) < 0.01)
    learned.push(`Your likely guess (${signedPct(likely)}) was close: sales changed by ${signedPct(round(change, 3))}. Your feel for your customers is good.`);
  else
    learned.push(`You guessed sales would change by ${signedPct(likely)}; they changed by ${signedPct(round(change, 3))} (${num(before)} → ${num(after)} a week). Next time start from ${signedPct(round(change, 2))}.`);
  if (Math.abs(before - m.units) / Math.max(1, m.units) >= 0.05)
    learned.push(`You estimated ${num(m.units)} sales a week; the baseline count said ${num(before)}. Use the counted number from now on.`);
  if (days < m.days) learned.push(`You ran it for ${num(days)} days instead of ${num(m.days)}. Short tests are noisier, so treat this as a first reading.`);
  learned.push("Compare the measured number with the break-even, not with your hopes: that habit makes every next decision easier.");

  return {
    analysisId: a.id,
    recordedAt,
    observed: o,
    actual: round(change, 4),
    actualLabel: "Change in weekly sales (measured)",
    closestScenario,
    verdict,
    netTest: round(netTest),
    plain,
    learned,
  };
}
