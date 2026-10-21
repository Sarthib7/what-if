/**
 * Comparing things, two ways:
 *  - whatChanged(): two versions of the same decision, and why the result moved.
 *  - compareResult(): the plan against what really happened in the test, judged by
 *    exactly the rule printed on the test card (decision.ts).
 */
import { getLang, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { lunchThresholds, priceThresholds, verdictFor } from "./decision.ts";
import { ceilUp, EPS, eur, n, num, pc, price, r2, round, seur, setCurrency, signedPct } from "./format.ts";
import type { Values } from "./format.ts";
import { valuesOf } from "./figures.ts";
import { parseNumber, show } from "./inputs.ts";
import { langOf, withLang } from "./lang.ts";
import { explainLunchChange, lunchHeadline, lunchModel } from "./lunch-offer.ts";
import { msg as t } from "./messages.ts";
import type { MsgKey } from "./messages.ts";
import { explainPriceChange, priceHeadline, priceModel } from "./price-change.ts";
import { getTemplate } from "./templates.ts";
import type { Analysis, ChangeExplanation, Scenario, TemplateId, TestResult } from "./types.ts";

type ObservedField = { key: string; label: string; required: boolean };

const OBSERVED_BASE: Record<TemplateId, { key: string; label: MsgKey; required: boolean }[]> = {
  lunch_offer: [
    { key: "baseline_lunch_customers", label: "obs.baseline_lunch_customers", required: true },
    { key: "test_lunch_customers", label: "obs.test_lunch_customers", required: true },
    { key: "redemptions_per_day", label: "obs.redemptions_per_day", required: true },
    { key: "days_run", label: "obs.days_run_lunch", required: false },
    { key: "actual_setup_cost", label: "obs.actual_setup_cost", required: false },
  ],
  price_change: [
    { key: "units_before_per_week", label: "obs.units_before_per_week", required: true },
    { key: "units_after_per_week", label: "obs.units_after_per_week", required: true },
    { key: "days_run", label: "obs.days_run_price", required: false },
  ],
};

/** What the owner reports after the test, with labels in a language (default: the current one). */
export function observedFields(template: TemplateId, lang?: Lang): ObservedField[] {
  const base = OBSERVED_BASE[template];
  if (!base) return [];
  return withLang(lang, () => base.map((f) => ({ key: f.key, label: t(f.label), required: f.required })));
}

/** Observed fields per template, labelled in the current language (kept as an object for old call sites). */
export const OBSERVED_FIELDS: Record<TemplateId, ObservedField[]> = {} as Record<TemplateId, ObservedField[]>;
for (const id of Object.keys(OBSERVED_BASE) as TemplateId[]) Object.defineProperty(OBSERVED_FIELDS, id, { enumerable: true, get: () => observedFields(id) });

// ---------------------------------------------------------------------------
// whatChanged
// ---------------------------------------------------------------------------

const sameValue = (x: number | string | undefined, y: number | string | undefined): boolean => {
  if (x === undefined || y === undefined) return x === y;
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < 1e-9;
  return String(x).trim() === String(y).trim();
};

export function whatChanged(before: Analysis, after: Analysis): ChangeExplanation {
  setLang(langOf(after));
  if (before.template !== after.template) throw new Error(t("err.differentDecisions"));
  setCurrency(after.currency);
  const tpl = getTemplate(after.template);
  const bv = valuesOf(before.inputs), av = valuesOf(after.inputs);
  const lunch = tpl.id === "lunch_offer";
  const head = lunch ? lunchHeadline : priceHeadline;
  const explain = lunch ? explainLunchChange : explainPriceChange;
  const hb = head(bv), ha = head(av);

  const changes: ChangeExplanation["changes"] = [];
  for (const f of tpl.fields) {
    const x = bv[f.key], y = av[f.key];
    if (sameValue(x, y)) continue;
    changes.push({ key: f.key, label: f.label, from: x ?? "", to: y ?? "", fromText: x === undefined ? t("chg.notGiven") : show(f, x), toText: y === undefined ? t("chg.notGiven") : show(f, y) });
  }

  const unitText = (x: number) => (lunch ? t("unit.perDay", { v: num(x) }) : signedPct(x));
  const effects: ChangeExplanation["effects"] = [
    {
      id: "break_even",
      label: after.breakEven.label,
      from: hb.breakEven ?? 0,
      to: ha.breakEven ?? 0,
      fromText: hb.breakEven === null ? hb.breakEvenText : unitText(hb.breakEven),
      toText: ha.breakEven === null ? ha.breakEvenText : unitText(ha.breakEven),
    },
    { id: "net_test_expected", label: t("eff.expectedTest"), from: hb.netTestExpected, to: ha.netTestExpected, fromText: seur(hb.netTestExpected), toText: seur(ha.netTestExpected) },
    {
      id: "net_month_expected",
      label: t("eff.expectedMonth"),
      from: hb.netMonthExpected,
      to: ha.netMonthExpected,
      fromText: t("unit.perMonth", { v: seur(hb.netMonthExpected) }),
      toText: t("unit.perMonth", { v: seur(ha.netMonthExpected) }),
    },
    { id: "worst_case", label: lunch ? t("eff.worstLunch") : t("eff.worstPrice"), from: hb.worstCase, to: ha.worstCase, fromText: seur(hb.worstCase), toText: seur(ha.worstCase) },
  ];

  if (changes.length === 0) return { changes, effects, plain: [t("chg.nothing")] };

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
    if (bv[c.key] === undefined) text = t("chg.added", { label: c.label, to: c.toText });
    else if (y === undefined) text = t("chg.removed", { label: c.label, from: c.fromText });
    else {
      const e = explain(c.key, bv, mid, c.label);
      text = e.text;
      mentionsWorst ||= e.mentionsWorst;
    }
    const ai = afterInput.get(c.key);
    if (ai && (ai.filledBy === "derived" || ai.filledBy === "fallback")) text += t("chg.setForYou");
    return { text, impact, order };
  });
  sentences.sort((x, y) => y.impact - x.impact || x.order - y.order);
  const plain = sentences.map((s) => s.text);

  const worstChanged = Math.abs(ha.worstCase - hb.worstCase) >= 0.005;
  if (changes.length > 1) {
    plain.unshift(
      t("chg.altogether", {
        beFrom: effects[0]!.fromText,
        beTo: effects[0]!.toText,
        eFrom: seur(hb.netTestExpected),
        eTo: seur(ha.netTestExpected),
        worst: lunch ? t("chg.worstNameLunch") : t("chg.worstNamePrice"),
        wFrom: eur(Math.max(0, -hb.worstCase)),
        wTo: eur(Math.max(0, -ha.worstCase)),
      }),
    );
  } else if (worstChanged && !mentionsWorst) {
    plain.push(t(lunch ? "chg.worstLunch" : "chg.worstPrice", { to: eur(Math.max(0, -ha.worstCase)), from: eur(Math.max(0, -hb.worstCase)) }));
  }
  return { changes, effects, plain };
}

// ---------------------------------------------------------------------------
// compareResult
// ---------------------------------------------------------------------------

function readObserved(template: TemplateId, observed: Record<string, unknown>): Record<string, number> {
  const fields = OBSERVED_BASE[template];
  if (!fields) throw new Error(t("err.noCompare", { t: String(template) }));
  const clean: Record<string, number> = {};
  const missing: string[] = [];
  const problems: string[] = [];
  for (const f of fields) {
    const raw = observed?.[f.key];
    if (raw === undefined || raw === null || raw === "") {
      if (f.required) missing.push(t(f.label));
      continue;
    }
    const x = typeof raw === "number" ? raw : parseNumber(String(raw), getLang()).value;
    if (!Number.isFinite(x) || x < 0) {
      problems.push(t("problem.observed", { label: t(f.label), raw: String(raw) }));
      continue;
    }
    clean[f.key] = x;
  }
  if (missing.length || problems.length) {
    const lines = [t("err.needResults")];
    if (missing.length) lines.push(t("err.stillNeeded"), ...missing.map((m) => `- ${m}`));
    if (problems.length) lines.push(t("err.pleaseCheck"), ...problems.map((p) => `- ${p}`));
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

export function compareResult(a: Analysis, observed: Record<string, number>, opts: { recordedAt?: string } = {}): TestResult {
  setLang(langOf(a));
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
  const extra = r2(during - baseline);
  const newDeals = Math.max(0, extra);
  const switchers = Math.min(baseline, Math.max(0, red - newDeals));
  const actualShare = baseline > 0 ? switchers / baseline : 0;

  // The verdict: exactly the card's rule (from the plan's numbers).
  const th = lunchThresholds(m, v);
  const verdict = verdictFor(th, extra);

  // What really happened in money: the plan's prices and costs with the measured lunch customers, switching, setup and days.
  const am = lunchModel({ ...v, lunch_customers: baseline, switch_share: actualShare, setup_cost: setup, test_days: days });
  // If lunch got quieter, each lost lunch costs what an ordinary lunch leaves.
  const netDay = extra >= 0 ? am.netDay(extra) : r2(am.netDay(0) + extra * am.mLunchNow);
  const netTest = r2(netDay * days - setup);
  const expected = a.scenarios.find((s) => s.id === "expected")?.netTest ?? m.netTest(n(v, "extra_likely"));

  const extraR = round(extra, 1);
  const closestScenario = closest(a.scenarios, extra, 0.5);
  const rule = !th
    ? t("res.lunch.ruleNone")
    : th.keepFrom === 0
      ? t("res.lunch.rule0")
      : t("res.lunch.rule", { n: th.keepFrom, keep: num(th.keepFrom), tweak: num(th.tweakFrom) });
  const beNow = am.beOngoingExact === null ? null : ceilUp(am.beOngoingExact);
  const careful = verdict === "keep" && beNow !== null && extra < beNow - EPS ? t("res.lunch.careful", { n: beNow, sw: num(round(switchers, 1)), plan: num(m.switchers), extra: num(extraR), beNow: num(beNow) }) : "";
  const verdictText = t(`res.lunch.${verdict}` as "res.lunch.keep");
  const lunchMove = extra >= 0 ? t("res.lunch.moveUp", { n: extraR }) : t("res.lunch.moveDown", { n: -extraR });
  const plain =
    t("res.lunch.plain", { baseline: num(baseline), during: num(during), move: lunchMove, rule, verdict: verdictText }) +
    (careful ? ` ${careful}` : "") +
    ` ${t(netTest < 0 ? "res.lunch.endedDown" : "res.lunch.endedUp", { amt: eur(Math.abs(netTest)), expected: seur(expected) })} ${t(`res.closest.${closestScenario}` as "res.closest.expected")}`;

  const likely = n(v, "extra_likely");
  const learned: string[] = [];
  if (Math.abs(extra - likely) < 0.5) learned.push(t("res.lunch.learn.close", { n: likely, real: num(extraR) }));
  else learned.push(t("res.lunch.learn.off", { n: likely, real: num(extraR), next: num(Math.max(0, extraR)) }));
  if (baseline > 0) learned.push(t("res.lunch.learn.switch", { plan: pc(m.switchShare), real: pc(round(actualShare, 3)), sw: num(round(switchers, 1)), baseline: num(baseline) }));
  if (beNow !== null && m.beOngoing !== null && beNow !== m.beOngoing) learned.push(t("res.lunch.learn.beNow", { n: beNow, beNow: num(beNow), bePlan: num(m.beOngoing) }));
  if (Math.abs(baseline - m.lunchCustomers) >= 1) learned.push(t("res.lunch.learn.baseline", { n: m.lunchCustomers, count: num(baseline) }));
  if (o.actual_setup_cost !== undefined && Math.abs(o.actual_setup_cost - m.setup) >= 0.5) learned.push(t("res.lunch.learn.setup", { real: eur(o.actual_setup_cost), plan: eur(m.setup) }));
  if (days < m.days) learned.push(t("res.learn.short", { real: t("n.weekdays", { n: days }), plan: num(m.days) }));
  if (red > during + EPS) learned.push(t("res.lunch.learn.tally", { red: num(red), during: num(during) }));
  learned.push(t("res.learn.habit"));

  return { analysisId: a.id, recordedAt, observed: o, actual: round(extra, 2), actualLabel: t("res.lunch.actual"), closestScenario, verdict, netTest, plain, learned };
}

function comparePrice(a: Analysis, v: Values, o: Record<string, number>, recordedAt: string): TestResult {
  const m = priceModel(v);
  const before = o.units_before_per_week!;
  const after = o.units_after_per_week!;
  if (before <= 0) throw new Error(t("err.priceBaseline"));
  const days = o.days_run !== undefined && o.days_run > 0 ? o.days_run : m.days;
  const change = after / before - 1;
  const netTest = m.deltaMeasured(before, after, days);
  const expected = a.scenarios.find((s) => s.id === "expected")?.netTest ?? m.deltaTest(n(v, "volume_likely"));

  // The verdict: the card's rule, applied to the measured baseline.
  const th = priceThresholds(m, before);
  const verdict = verdictFor(th, after);

  const closestScenario = closest(a.scenarios, change, 0.005);
  const rule = !th || m.beV === null
    ? t("res.price.ruleNone")
    : m.beV <= -1 + 1e-9
      ? t("res.price.ruleAny")
      : t(m.beV <= 0 ? "res.price.ruleRise" : "res.price.ruleCut", { keep: num(th.keepFrom), tweak: num(th.tweakFrom) });
  const verdictText = {
    keep: m.rise ? t("res.price.keepRise") : t("res.price.keepCut"),
    tweak: m.rise ? t("res.price.tweakRise") : t("res.price.tweakCut"),
    stop: t("res.price.stop", { old: price(m.oldPrice) }),
  }[verdict];
  const plain =
    t("res.price.plain", { before: num(before), after: num(after), change: signedPct(round(change, 3)), rule, verdict: verdictText, days: t("n.days", { n: days }), amt: seur(netTest), expected: seur(expected) }) +
    ` ${t(`res.closest.${closestScenario}` as "res.closest.expected")}`;

  const likely = n(v, "volume_likely");
  const learned: string[] = [];
  if (Math.abs(change - likely) < 0.01) learned.push(t("res.price.learn.close", { likely: signedPct(likely), real: signedPct(round(change, 3)) }));
  else learned.push(t("res.price.learn.off", { likely: signedPct(likely), real: signedPct(round(change, 3)), before: num(before), after: num(after), next: signedPct(round(change, 2)) }));
  if (Math.abs(before - m.units) / Math.max(1, m.units) >= 0.05) learned.push(t("res.price.learn.baseline", { n: m.units, count: num(before) }));
  if (days < m.days) learned.push(t("res.learn.short", { real: t("n.days", { n: days }), plan: num(m.days) }));
  learned.push(t("res.learn.habit"));

  return { analysisId: a.id, recordedAt, observed: o, actual: round(change, 4), actualLabel: t("res.price.actual"), closestScenario, verdict, netTest, plain, learned };
}

