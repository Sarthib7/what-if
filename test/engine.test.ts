import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  analyze,
  checkInputs,
  compareResult,
  demoInputs,
  getTemplate,
  OBSERVED_FIELDS,
  planTest,
  whatChanged,
  WEEKDAYS_PER_MONTH,
  WEEKS_PER_MONTH,
} from "../src/engine/index.ts";
import type { Analysis, RawInputs } from "../src/engine/index.ts";

const T = "2026-10-17T12:00:00.000Z";
const close = (actual: number, expected: number, msg?: string, tol = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? "value"}: expected ≈${expected}, got ${actual}`);
const fig = (a: Analysis, id: string) => {
  const f = a.current.find((x) => x.id === id);
  assert.ok(f, `figure ${id} exists`);
  return f;
};
const scen = (a: Analysis, id: string) => {
  const s = a.scenarios.find((x) => x.id === id);
  assert.ok(s, `scenario ${id} exists`);
  return s;
};
const lunchDemo = () => analyze("lunch_offer", demoInputs("lunch_offer"), { demo: true, createdAt: T });
const priceDemo = () => analyze("price_change", demoInputs("price_change"), { demo: true, createdAt: T });

/** An independent re-statement of the lunch maths from the spec, for cross-checking. */
function lunchRef(i: Record<string, number>) {
  const mOffer = i.offer_price! - i.offer_cost!;
  const mNow = i.lunch_spend! * (1 - i.variable_cost_share!);
  const switchers = i.lunch_customers! * i.switch_share!;
  const switchLoss = switchers * (mNow - mOffer);
  const daily = i.extra_staff_cost_per_day! + i.marketing_per_week! / 5;
  const netDay = (x: number) => x * mOffer - switchLoss - daily;
  const netTest = (x: number) => netDay(x) * i.test_days! - i.setup_cost!;
  const netMonth = (x: number) => netDay(x) * 21.7;
  return { mOffer, mNow, switchers, switchLoss, daily, netDay, netTest, netMonth };
}

describe("lunch offer: the demo café", () => {
  const d = demoInputs("lunch_offer") as Record<string, number>;
  const a = lunchDemo();
  const r = lunchRef(d);

  test("hand-checked building blocks", () => {
    close(r.mOffer, 6.3, "margin per deal");
    close(r.mNow, 7.616, "lunch margin today", 1e-9);
    close(r.switchers, 11.4, "switchers", 1e-9);
    close(r.switchLoss, 15.0024, "switch loss per day", 1e-9);
    close(r.daily, 23, "running cost per day", 1e-9);
    close(fig(a, "deal_margin").value, 6.3, "deal margin figure");
    close(fig(a, "lunch_margin_now").value, 7.62, "lunch margin figure");
    close(fig(a, "switch_cost_day").value, 15.0, "switch cost figure");
    close(fig(a, "running_cost_day").value, 23, "running cost figure");
    assert.equal(fig(a, "deal_margin").maths, "€9.90 deal price − €3.60 ingredients = €6.30 per deal");
  });

  test("current path", () => {
    close(fig(a, "weekday_takings_month").value, 140 * 7.4 * WEEKDAYS_PER_MONTH, "weekday takings"); // 22,481.20
    close(fig(a, "weekday_left_month").value, 140 * 7.4 * 21.7 * 0.68, "left after ingredients"); // 15,287.22
    close(fig(a, "monthly_fixed_costs").value, 16500, "fixed costs");
    assert.match(fig(a, "weekday_takings_month").maths, /140 customers a day × €7\.40 .* = €22,481 a month/);
    for (const f of a.current) assert.equal(f.source, "demo", `${f.id} is tagged demo`);
  });

  test("break-even: 9 a day to pay back the test, 7 a day ongoing", () => {
    assert.equal(a.breakEven.value, 9);
    assert.equal(a.breakEven.unit, "customers/day");
    assert.equal(a.breakEven.reachable, true);
    assert.equal(Math.ceil((r.switchLoss + r.daily + d.setup_cost! / d.test_days!) / r.mOffer), 9);
    assert.equal(Math.ceil((r.switchLoss + r.daily) / r.mOffer), 7);
    assert.match(a.breakEven.plain, /9 extra lunch customers a day/);
    assert.match(a.breakEven.plain, /7 a day keeps you level/);
    assert.match(a.breakEven.maths, /€56\.00 a day to cover/);
    assert.match(a.breakEven.label, /pay back the test/);
  });

  test("worst case: nobody new comes", () => {
    close(a.worstCase.value, r.netTest(0), "worst case"); // −560.02
    close(a.worstCase.value, -560.02, "worst case");
    close(a.worstCase.shareOfCash!, 560.024 / 1500, "share of cash", 1e-4);
    assert.match(a.worstCase.plain, /€560/);
    assert.match(a.worstCase.plain, /37% of the €1,500/);
  });

  test("scenarios cautious / expected / optimistic", () => {
    assert.deepEqual(a.scenarios.map((s) => s.id), ["cautious", "expected", "optimistic"]);
    assert.deepEqual(a.scenarios.map((s) => s.assumptionValue), [3, 8, 15]);
    close(scen(a, "cautious").netTest, r.netTest(3), "cautious net test"); // −371.02
    close(scen(a, "expected").netTest, r.netTest(8), "expected net test"); // −56.02
    close(scen(a, "optimistic").netTest, r.netTest(15), "optimistic net test"); // +384.98
    close(scen(a, "expected").netTest, -56.02, "expected net test");
    close(scen(a, "expected").netMonth, 269.03, "expected net month");
    close(scen(a, "optimistic").netMonth, r.netMonth(15), "optimistic net month");
    const e = scen(a, "expected");
    const ids = e.figures.map((f) => f.id);
    assert.deepEqual(ids, ["extra_customers", "revenue_change_day", "net_day", "net_test", "net_month", "net_month_share_fixed"]);
    close(e.figures.find((f) => f.id === "revenue_change_day")!.value, 8 * 9.9 + 11.4 * (9.9 - 11.2), "revenue change per day");
    close(e.figures.find((f) => f.id === "net_month_share_fixed")!.value, r.netMonth(8) / 16500, "share of fixed costs", 1e-4);
    assert.match(e.plain, /8 extra customers/);
    for (const s of a.scenarios) for (const f of s.figures) assert.ok(f.maths.length > 10, `${s.id}.${f.id} has maths`);
  });

  test("biggest uncertainty is the number of extra customers", () => {
    assert.equal(a.biggestUncertainty.key, "extra_likely");
    close(a.biggestUncertainty.swing, 12 * 6.3 * 10, "swing"); // €756
    assert.match(a.biggestUncertainty.plain, /Whether you get 3 or 15 extra customers a day changes the test result by €756/);
    assert.equal(a.biggestUncertainty.ranking.length, 4);
    const swings = a.biggestUncertainty.ranking.map((x) => x.swing);
    assert.deepEqual([...swings].sort((x, y) => y - x), swings, "ranking is sorted");
    const sw = a.biggestUncertainty.ranking.find((x) => x.key === "switch_share")!;
    close(sw.swing, 38 * 0.4 * (7.616 - 6.3) * 10, "switch share swing (10% → 50%)");
  });

  test("sensitivity powers the slider", () => {
    const s = a.sensitivity;
    assert.equal(s.key, "extra_likely");
    assert.equal(s.current, 8);
    assert.equal(s.breakEvenX, 9);
    assert.equal(s.points[0]!.x, 0);
    assert.equal(s.points.at(-1)!.x, 23); // max(ceil(15 × 1.5), 9 × 2, 10)
    assert.equal(s.points.length, 24);
    for (const p of s.points) {
      close(p.netTest, r.netTest(p.x), `netTest at ${p.x}`);
      close(p.netMonth, r.netMonth(p.x), `netMonth at ${p.x}`);
      assert.ok(p.explanation.includes(`${p.x} extra customer`), `explanation at ${p.x} names x`);
    }
    assert.match(s.points[9]!.explanation, /at or above the 9 a day needed/);
    assert.match(s.points[8]!.explanation, /setup is not paid back/);
    assert.match(s.points[3]!.explanation, /below the 9 a day needed/);
  });

  test("lessons, next questions and warnings", () => {
    assert.ok(a.lessons.length >= 3 && a.lessons.length <= 5, `3–5 lessons, got ${a.lessons.length}`);
    assert.ok(a.lessons.some((l) => l.includes("€6.30") && l.includes("€1.32")), "margin and switching lesson");
    assert.ok(a.lessons.some((l) => /any decision/.test(l)), "transferable method line");
    assert.ok(a.nextQuestions.length >= 1);
    assert.ok(a.nextQuestions.some((q) => /Count lunch customers/.test(q)));
    assert.ok(a.warnings.some((w) => /below the 9 a day needed/.test(w)), "likely guess below break-even");
    assert.ok(a.warnings.some((w) => /€1\.32 less/.test(w)), "deal margin below today's lunch margin");
  });

  test("analysis metadata", () => {
    assert.equal(a.template, "lunch_offer");
    assert.equal(a.demo, true);
    assert.equal(a.currency, "EUR");
    assert.equal(a.createdAt, T);
    assert.match(a.id, /^a-[0-9a-f]{8}$/);
    assert.match(a.business, /demo/);
    assert.equal(a.inputs.length, getTemplate("lunch_offer").fields.length);
  });
});

describe("lunch offer: break-even is exact", () => {
  const base = demoInputs("lunch_offer") as Record<string, number>;
  const variants: Record<string, number>[] = [
    base,
    { ...base, offer_price: 10.9 },
    { ...base, setup_cost: 0 },
    { ...base, switch_share: 0.5, lunch_spend: 13 },
    { ...base, extra_staff_cost_per_day: 0, marketing_per_week: 60, test_days: 15 },
    { ...base, offer_cost: 2.5, setup_cost: 400, test_days: 5 },
    { ...base, lunch_customers: 80, switch_share: 0.1 },
  ];
  for (const [i, v] of variants.entries()) {
    test(`variant ${i}: net over the test is ≥ 0 at break-even and < 0 one below`, () => {
      const a = analyze("lunch_offer", v, { createdAt: T });
      const r = lunchRef({ ...v });
      const be = a.breakEven.value;
      assert.ok(r.netTest(be) >= -1e-9, `netTest(${be}) = ${r.netTest(be)}`);
      if (be > 0) assert.ok(r.netTest(be - 1) < 0, `netTest(${be - 1}) = ${r.netTest(be - 1)}`);
      const ongoing = Math.max(0, Math.ceil((r.switchLoss + r.daily) / r.mOffer - 1e-9));
      assert.ok(r.netDay(ongoing) >= -1e-9);
      if (ongoing > 0) assert.ok(r.netDay(ongoing - 1) < 0);
    });
  }
});

describe("inputs", () => {
  test("missing required inputs throw with the questions to ask", () => {
    assert.throws(
      () => analyze("lunch_offer", { weekday_customers: 140 }),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        const t = getTemplate("lunch_offer");
        for (const key of ["avg_spend", "lunch_customers", "offer_price", "offer_cost", "extra_likely"]) {
          const f = t.fields.find((x) => x.key === key)!;
          assert.ok(e.message.includes(f.ask), `message asks for ${key}`);
        }
        assert.ok(!e.message.includes(t.fields.find((x) => x.key === "weekday_customers")!.ask), "does not ask for what was given");
        return true;
      },
    );
    assert.throws(() => analyze("price_change", {}), /Which item are you thinking of repricing\?/);
  });

  test("problems throw in plain words", () => {
    assert.throws(() => analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_cost: 12 }), /every deal sold loses money/);
    assert.throws(() => analyze("lunch_offer", { ...demoInputs("lunch_offer"), avg_spend: "lots" }), /should be a number/);
    assert.throws(() => analyze("nope" as never, {}), /Unknown decision template/);
  });

  test("a share given as 30, '30%' or 0.3 gives the same analysis", () => {
    const d = demoInputs("lunch_offer");
    const runs = [30, "30%", 0.3, "30 %"].map((s) => analyze("lunch_offer", { ...d, switch_share: s }, { createdAt: T }));
    for (const r of runs.slice(1)) {
      assert.equal(r.id, runs[0]!.id);
      assert.deepEqual(r.scenarios, runs[0]!.scenarios);
      assert.deepEqual(r.breakEven, runs[0]!.breakEven);
    }
    const vcs = analyze("lunch_offer", { ...d, variable_cost_share: "32%" }, { createdAt: T });
    assert.equal(vcs.breakEven.value, 9);
  });

  test("money and percentages as people type them", () => {
    const c = checkInputs("lunch_offer", { ...demoInputs("lunch_offer"), avg_spend: "€7,40", cash_buffer: "1,500", offer_price: "9.90 EUR" });
    const v = (k: string) => c.resolved.find((i) => i.key === k)!.value;
    assert.equal(v("avg_spend"), 7.4);
    assert.equal(v("cash_buffer"), 1500);
    assert.equal(v("offer_price"), 9.9);
    const p = checkInputs("price_change", { ...demoInputs("price_change"), volume_likely: "−4%", volume_low: "-12" });
    assert.equal(p.resolved.find((i) => i.key === "volume_likely")!.value, -0.04);
    assert.equal(p.resolved.find((i) => i.key === "volume_low")!.value, -0.12);
  });

  test("fallbacks are tagged as guesses and turn into next questions", () => {
    const a = analyze("lunch_offer", { weekday_customers: 140, avg_spend: 7.4, lunch_customers: 38, offer_price: 9.9, offer_cost: 3.6, extra_likely: 8 }, { createdAt: T });
    const src = (k: string) => a.inputs.find((i) => i.key === k)!.source;
    assert.equal(src("variable_cost_share"), "assumption");
    assert.equal(src("lunch_spend"), "assumption");
    assert.equal(src("weekday_customers"), "owner");
    assert.ok(a.nextQuestions.some((q) => /lunchtime customer really spend/.test(q)));
    assert.ok(a.nextQuestions.some((q) => /ingredients and packaging/.test(q)));
    assert.ok(a.nextQuestions.length <= 6);
    assert.equal(a.business, "Your café");
  });
});

describe("price change", () => {
  const a = priceDemo();
  const mOld = 3.9 - 0.95, mNew = 4.2 - 0.95;
  const dWeek = (v: number) => 620 * (1 + v) * mNew - 620 * mOld;

  test("break-even volume change and lost sales", () => {
    close(a.breakEven.value, mOld / mNew - 1, "break-even share", 1e-4); // −9.23%
    assert.equal(a.breakEven.unit, "share");
    assert.match(a.breakEven.plain, /57 fewer a week \(9\.2% of 620\)/);
    // You can lose 57 and still be level; losing 58 makes you worse off.
    assert.ok((620 - 57) * mNew >= 620 * mOld);
    assert.ok((620 - 58) * mNew < 620 * mOld);
    assert.equal(a.sensitivity.breakEvenX, a.breakEven.value);
  });

  test("scenarios, worst case and the current path", () => {
    close(scen(a, "expected").netTest, (dWeek(-0.04) * 14) / 7, "expected over test"); // +210.80
    close(scen(a, "expected").netMonth, dWeek(-0.04) * WEEKS_PER_MONTH, "expected per month"); // +456.38
    close(scen(a, "cautious").netTest, (dWeek(-0.12) * 14) / 7, "cautious over test"); // −111.60
    close(scen(a, "optimistic").netTest, (dWeek(0) * 14) / 7, "optimistic over test"); // +372
    close(a.worstCase.value, -111.6, "worst case");
    close(fig(a, "margin_now").value, 2.95, "margin now");
    close(fig(a, "margin_new").value, 3.25, "margin new");
    close(fig(a, "left_week_now").value, 1829, "weekly left now");
    assert.equal(a.biggestUncertainty.key, "volume_likely");
    close(a.biggestUncertainty.swing, 620 * 3.25 * 0.12 * 2, "swing");
  });

  test("worst case is zero when even the cautious guess earns more", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), volume_low: -0.05, volume_likely: -0.02 }, { createdAt: T });
    assert.equal(b.worstCase.value, 0);
    assert.match(b.worstCase.plain, /no downside in money/);
  });

  test("a price cut needs more sales", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), new_price: 3.6, volume_low: 0, volume_likely: 0.08, volume_high: 0.15 }, { createdAt: T });
    close(b.breakEven.value, 2.95 / 2.65 - 1, "break-even share", 1e-4); // +11.3%
    assert.match(b.breakEven.label, /need/);
    assert.ok(b.warnings.some((w) => /below break-even/.test(w)));
  });

  test("sensitivity runs from −30% to +5% in 1-point steps", () => {
    const s = a.sensitivity;
    assert.equal(s.points.length, 36);
    close(s.points[0]!.x, -0.3, "first x", 1e-9);
    close(s.points.at(-1)!.x, 0.05, "last x", 1e-9);
    for (const p of s.points) close(p.netTest, (dWeek(p.x) * 14) / 7, `netTest at ${p.x}`);
  });
});

describe("sensitivity is monotonic", () => {
  const cases: [string, RawInputs][] = [
    ["lunch demo", demoInputs("lunch_offer")],
    ["lunch, big setup", { ...demoInputs("lunch_offer"), setup_cost: 900, extra_high: 40 }],
    ["price demo", demoInputs("price_change")],
    ["price cut", { ...demoInputs("price_change"), new_price: 3.5, volume_low: 0, volume_likely: 0.1, volume_high: 0.2 }],
  ];
  for (const [name, inputs] of cases) {
    test(name, () => {
      const tpl = "current_price" in inputs ? "price_change" : "lunch_offer";
      const a = analyze(tpl, inputs, { createdAt: T });
      const pts = a.sensitivity.points;
      for (let i = 1; i < pts.length; i++) {
        assert.ok(pts[i]!.x > pts[i - 1]!.x, "x increases");
        assert.ok(pts[i]!.netTest >= pts[i - 1]!.netTest, `netTest rises at x=${pts[i]!.x}`);
        assert.ok(pts[i]!.netMonth >= pts[i - 1]!.netMonth, `netMonth rises at x=${pts[i]!.x}`);
      }
    });
  }
});

describe("whatChanged", () => {
  test("explains a deal price change in mechanism terms", () => {
    const before = lunchDemo();
    const after = analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_price: 10.9 }, { demo: true, createdAt: T });
    const c = whatChanged(before, after);
    assert.equal(c.changes.length, 1);
    assert.deepEqual(
      { key: c.changes[0]!.key, fromText: c.changes[0]!.fromText, toText: c.changes[0]!.toText },
      { key: "offer_price", fromText: "€9.90", toText: "€10.90" },
    );
    const s = c.plain[0]!;
    assert.match(s, /You raised the deal price from €9\.90 to €10\.90/);
    assert.match(s, /Each deal now earns €1\.00 more/);
    assert.match(s, /you need 2 fewer extra customers a day to break even \(9 → 7\)/);
    const be = c.effects.find((e) => e.id === "break_even")!;
    assert.equal(be.from, 9);
    assert.equal(be.to, 7);
    const nt = c.effects.find((e) => e.id === "net_test_expected")!;
    close(nt.from, -56.02, "expected before");
    close(nt.to, (8 * 7.3 - 11.4 * (7.616 - 7.3) - 23) * 10 - 180, "expected after"); // +137.98
    assert.deepEqual(c.effects.map((e) => e.id), ["break_even", "net_test_expected", "net_month_expected", "worst_case"]);
  });

  test("the likely guess does not move break-even", () => {
    const c = whatChanged(lunchDemo(), analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_likely: 12 }, { demo: true, createdAt: T }));
    assert.match(c.plain[0]!, /from 8 to 12/);
    assert.match(c.plain[0]!, /Break-even stays at 9 a day/);
    assert.match(c.plain[0]!, /4 × €6\.30 × 10 days = €252/);
  });

  test("several changes get an 'altogether' line first", () => {
    const c = whatChanged(lunchDemo(), analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_price: 10.9, setup_cost: 300 }, { demo: true, createdAt: T }));
    assert.equal(c.changes.length, 2);
    assert.match(c.plain[0]!, /^Altogether:/);
    assert.equal(c.plain.length, 3);
  });

  test("a new price for the price change", () => {
    const after = analyze("price_change", { ...demoInputs("price_change"), new_price: 4.4 }, { demo: true, createdAt: T });
    const c = whatChanged(priceDemo(), after);
    assert.match(c.plain[0]!, /from €4\.20 to €4\.40/);
    assert.match(c.plain[0]!, /14\.5% of sales/);
    close(c.effects[0]!.to, 2.95 / 3.45 - 1, "new break-even", 1e-4);
  });

  test("nothing changed / different decisions", () => {
    const c = whatChanged(lunchDemo(), lunchDemo());
    assert.equal(c.changes.length, 0);
    assert.match(c.plain[0]!, /Nothing changed/);
    assert.throws(() => whatChanged(lunchDemo(), priceDemo()), /different decisions/);
  });
});

describe("planTest", () => {
  test("lunch plan is tied to the break-even", () => {
    const a = lunchDemo();
    const p = planTest(a);
    assert.equal(p.analysisId, a.id);
    assert.equal(p.days, 10);
    assert.match(p.decisionRule.keep, /At least 9 extra lunch customers a day/);
    assert.match(p.decisionRule.tweak, /^5 to 8 a day/);
    assert.match(p.decisionRule.stop, /Fewer than 5 a day/);
    assert.deepEqual(p.checkIns.map((c) => c.day), [3, 5, 10]);
    assert.match(p.costCap, /€370/); // €180 setup + €38.00 a day × 5 days
    assert.ok(p.measure.some((m) => /tally sheet/i.test(m.how)));
    assert.ok(p.measure.some((m) => /till/i.test(m.how) && /Deals sold/.test(m.what)));
    assert.ok(p.before.some((b) => /baseline/.test(b)));
    assert.ok(p.during.some((d) => /Keep everything else the same/.test(d)));
  });

  test("price plan: keep if sales drop less than break-even", () => {
    const p = planTest(priceDemo());
    assert.match(p.decisionRule.keep, /9\.2% or less/);
    assert.match(p.decisionRule.keep, /563 a week/);
    assert.match(p.decisionRule.stop, /go back to €3\.90/);
    assert.deepEqual(p.checkIns.map((c) => c.day), [3, 7, 14]);
  });
});

describe("compareResult", () => {
  const a = lunchDemo();
  test("observed fields", () => {
    assert.deepEqual(
      OBSERVED_FIELDS.lunch_offer.filter((f) => f.required).map((f) => f.key),
      ["baseline_lunch_customers", "test_lunch_customers", "redemptions_per_day"],
    );
    assert.deepEqual(OBSERVED_FIELDS.price_change.filter((f) => f.required).map((f) => f.key), ["units_before_per_week", "units_after_per_week"]);
  });

  test("keep: 12 extra a day", () => {
    const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 50, redemptions_per_day: 23 }, { recordedAt: T });
    assert.equal(r.verdict, "keep");
    assert.equal(r.actual, 12);
    assert.equal(r.closestScenario, "optimistic");
    close(r.netTest, (12 * 6.3 - 11 * (7.616 - 6.3) - 23) * 10 - 180, "net over test"); // +201.24
    assert.equal(r.recordedAt, T);
    assert.equal(r.analysisId, a.id);
  });

  test("tweak: 5 extra a day, and what was learned", () => {
    const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 43, redemptions_per_day: 16.4 }, { recordedAt: T });
    assert.equal(r.verdict, "tweak");
    assert.equal(r.closestScenario, "cautious");
    assert.ok(r.learned.some((l) => /Your likely guess was 8 extra customers a day; reality was 5\. Next time start from 5\./.test(l)));
    assert.match(r.plain, /from 38 to 43 customers a day/);
  });

  test("stop: 2 extra a day, below even the cautious scenario", () => {
    const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 40, redemptions_per_day: 14, actual_setup_cost: 220, days_run: 8 }, { recordedAt: T });
    assert.equal(r.verdict, "stop");
    assert.equal(r.closestScenario, "below_cautious");
    close(r.netTest, (2 * 6.3 - 12 * (7.616 - 6.3) - 23) * 8 - 220, "net over test");
    assert.ok(r.learned.some((l) => /€220/.test(l)));
    assert.ok(r.learned.some((l) => /8 weekdays instead of 10/.test(l)));
  });

  test("price change verdicts", () => {
    const p = priceDemo();
    const res = (after: number) => compareResult(p, { units_before_per_week: 620, units_after_per_week: after }, { recordedAt: T });
    assert.equal(res(600).verdict, "keep"); // −3.2%
    assert.equal(res(600).closestScenario, "expected");
    close(res(600).netTest, ((600 * 3.25 - 620 * 2.95) * 14) / 7, "net over test");
    assert.equal(res(545).verdict, "tweak"); // −12.1%, within 1.5× break-even
    assert.equal(res(500).verdict, "stop"); // −19.4%
    assert.equal(res(500).closestScenario, "below_cautious");
    assert.ok(res(560).learned[0]!.includes("they changed by −9.7%"));
  });

  test("missing observations throw in plain words", () => {
    assert.throws(() => compareResult(a, { baseline_lunch_customers: 38 }), /Lunch customers a day during the test/);
    assert.throws(() => compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: -1, redemptions_per_day: 3 }), /0 or more/);
  });
});

describe("determinism and currency", () => {
  test("same inputs → same id and same numbers", () => {
    const x = analyze("lunch_offer", demoInputs("lunch_offer"), { demo: true });
    const y = analyze("lunch_offer", demoInputs("lunch_offer"), { demo: true });
    assert.equal(x.id, y.id);
    const { createdAt: _x, ...rx } = x;
    const { createdAt: _y, ...ry } = y;
    assert.deepEqual(rx, ry);
    const z = analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_likely: 9 }, { demo: true });
    assert.notEqual(z.id, x.id);
    assert.equal(analyze("lunch_offer", demoInputs("lunch_offer"), { id: "fixed" }).id, "fixed");
    const p1 = analyze("price_change", demoInputs("price_change"));
    assert.notEqual(p1.id, x.id);
    assert.equal(p1.id, analyze("price_change", demoInputs("price_change")).id);
  });

  test("currency follows the analysis", () => {
    const g = analyze("lunch_offer", demoInputs("lunch_offer"), { currency: "GBP", createdAt: T });
    assert.equal(g.currency, "GBP");
    assert.match(fig(g, "deal_margin").maths, /£9\.90/);
    analyze("lunch_offer", demoInputs("lunch_offer"), { createdAt: T }); // resets the formatter to EUR
    assert.match(planTest(g).costCap, /£/);
    assert.match(compareResult(g, { baseline_lunch_customers: 38, test_lunch_customers: 45, redemptions_per_day: 18 }).plain, /£/);
    assert.equal(analyze("lunch_offer", demoInputs("lunch_offer"), { currency: "XYZ" }).currency, "EUR");
  });
});
