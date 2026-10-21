import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  analyze,
  BERLIN_FACTS,
  BERLIN_KIEZE,
  berlinFacts,
  checkInputs,
  compareResult,
  DEMO_BUSINESS,
  demoBusiness,
  demoInputs,
  ENGINE_MESSAGES,
  engineMessage,
  getTemplate,
  normaliseKiez,
  OBSERVED_FIELDS,
  observedFields,
  parseNumber,
  planTest,
  sourceLabel,
  TEMPLATES,
  verdictFor,
  wageRiseCheck,
  whatChanged,
  WEEKDAYS_PER_MONTH,
  WEEKS_PER_MONTH,
} from "../src/engine/index.ts";
import type { Analysis, RawInputs, TemplateId } from "../src/engine/index.ts";
import type { Lang } from "../src/i18n/index.ts";
import { TERMS } from "../src/i18n/terms.ts";

const T = "2026-10-17T12:00:00.000Z";
const LANGS: Lang[] = ["en", "de", "es", "pl"];
const close = (actual: number, expected: number, msg?: string, tol = 0.006) =>
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
const lunchDemo = (lang?: Lang) => analyze("lunch_offer", demoInputs("lunch_offer", lang), { demo: true, createdAt: T, ...(lang ? { lang } : {}) });
const priceDemo = (lang?: Lang) => analyze("price_change", demoInputs("price_change", lang), { demo: true, createdAt: T, ...(lang ? { lang } : {}) });

// ---------------------------------------------------------------------------
// An independent re-statement of the maths from the spec, with its rounding rule:
// every building block is rounded to the cent (switchers to one decimal) before it is used again.
// ---------------------------------------------------------------------------
const r2 = (x: number) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;
const r1 = (x: number) => Math.round((x + Math.sign(x) * 1e-9) * 10) / 10;

function lunchRef(i: Record<string, number>) {
  const div = 1 + (i.vat_rate ?? 0.106);
  const mOffer = r2(i.offer_price! / div - i.offer_cost!);
  const mNow = r2(i.lunch_spend! / div - i.lunch_spend! * i.variable_cost_share!);
  const switchers = r1(i.lunch_customers! * i.switch_share!);
  const switchLoss = r2(switchers * r2(mNow - mOffer));
  const daily = r2(r2(i.extra_staff_hours_per_day! * i.staff_hourly_cost!) + r2(i.marketing_per_week! / 5));
  const need = r2(switchLoss + daily);
  const netDay = (x: number) => r2(x * mOffer - need);
  const netTest = (x: number) => r2(netDay(x) * i.test_days! - i.setup_cost!);
  const netMonth = (x: number) => r2(netDay(x) * 21.7);
  return { mOffer, mNow, switchers, switchLoss, daily, need, netDay, netTest, netMonth };
}

function priceRef(i: Record<string, number>) {
  const div = 1 + (i.vat_rate ?? 0.19);
  const mOld = r2(i.current_price! / div - i.unit_cost!), mNew = r2(i.new_price! / div - i.unit_cost!);
  const weekOld = r2(i.units_per_week! * mOld);
  const dWeek = (v: number) => r2(r2(r1(i.units_per_week! * (1 + v)) * mNew) - weekOld);
  return { mOld, mNew, weekOld, dWeek, dTest: (v: number) => r2((dWeek(v) * i.test_days!) / 7), dMonth: (v: number) => r2(dWeek(v) * 4.33) };
}

// ---------------------------------------------------------------------------
// "Show the maths" checker: every "a × b − c = d" in owner-facing text must give d by hand.
// ---------------------------------------------------------------------------
type Tok = { t: "num"; v: number; dec: number } | { t: "op"; v: "+" | "-" | "*" | "/" } | { t: "(" } | { t: ")" } | { t: "=" };
const NUM: Record<Lang, RegExp> = {
  en: /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/,
  de: /^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/,
  es: /^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/,
  pl: /^(?:\d{1,3}(?: \d{3})+(?:,\d+)?|\d+(?:,\d+)?)/,
};
function readNum(raw: string, lang: Lang): { v: number; dec: number } {
  const dec = lang === "en" ? "." : ",";
  const group = lang === "en" ? "," : lang === "pl" ? " " : ".";
  const s = raw.split(group).join("");
  const [int, frac = ""] = s.split(dec);
  return { v: Number(`${int}.${frac || "0"}`), dec: frac.length };
}
function tokenize(text: string, lang: Lang): Tok[] {
  const s = text.replace(/[  ]/g, " ");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    let sign = 1, k = i;
    if ((c === "−" || c === "+") && /[€\d]/.test(s[i + 1] ?? "")) {
      sign = c === "−" ? -1 : 1;
      k = i + 1;
    }
    if (s[k] === "€") k++;
    const m = /[\d]/.test(s[k] ?? "") && !/[\p{L}\d]/u.test(s[i - 1] ?? " ") ? NUM[lang].exec(s.slice(k)) : null;
    if (m) {
      let { v, dec } = readNum(m[0], lang);
      let end = k + m[0].length;
      const cur = /^ ?€/.exec(s.slice(end));
      if (cur) end += cur[0].length;
      const pc = /^ ?%/.exec(s.slice(end));
      if (pc) {
        end += pc[0].length;
        v /= 100;
        dec += 2;
      }
      out.push({ t: "num", v: sign * v, dec });
      i = end;
      continue;
    }
    if (c === "×") out.push({ t: "op", v: "*" });
    else if (c === "÷") out.push({ t: "op", v: "/" });
    else if (c === "+" && s[i + 1] === " ") out.push({ t: "op", v: "+" });
    else if (c === "−" && s[i + 1] === " ") out.push({ t: "op", v: "-" });
    else if (c === "(") out.push({ t: "(" });
    else if (c === ")") out.push({ t: ")" });
    else if (c === "=") out.push({ t: "=" });
    i++;
  }
  return out;
}
/** Drops "(comment)" groups that follow a number directly ("÷ 1.106 (without 10.6% VAT)"). */
function dropComments(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i]!;
    if (tk.t === "(" && out.at(-1)?.t === "num") {
      let depth = 1;
      while (depth > 0 && ++i < toks.length) depth += toks[i]!.t === "(" ? 1 : toks[i]!.t === ")" ? -1 : 0;
      continue;
    }
    out.push(tk);
  }
  return out;
}
function evaluate(toks: Tok[]): number {
  let p = 0;
  const peek = () => toks[p];
  const primary = (): number => {
    const tk = toks[p++];
    if (!tk) throw new Error("unexpected end");
    if (tk.t === "num") return tk.v;
    if (tk.t === "(") {
      const v = sum();
      if (toks[p++]?.t !== ")") throw new Error("missing )");
      return v;
    }
    throw new Error(`unexpected ${tk.t}`);
  };
  const product = (): number => {
    let v = primary();
    for (let tk = peek(); tk && tk.t === "op" && (tk.v === "*" || tk.v === "/"); tk = peek()) {
      p++;
      v = tk.v === "*" ? v * primary() : v / primary();
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    for (let tk = peek(); tk && tk.t === "op" && (tk.v === "+" || tk.v === "-"); tk = peek()) {
      p++;
      v = tk.v === "+" ? v + product() : v - product();
    }
    return v;
  };
  const v = sum();
  if (p !== toks.length) throw new Error(`numbers or brackets left over at token ${p}`);
  return v;
}
/** Problems with the sums in a text; also returns how many sums were checked. */
function mathsProblems(text: string, lang: Lang): { problems: string[]; checked: number } {
  const problems: string[] = [];
  let checked = 0;
  let carry: number | undefined;
  for (const clause of text.split(/(?<=[.;:!?])\s+|,\s+/)) {
    if (!clause.includes("=")) continue;
    const toks = dropComments(tokenize(clause, lang));
    let start = 0;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i]!.t !== "=") continue;
      let lhs = toks.slice(start, i);
      const rhs = toks.slice(i + 1).find((x) => x.t === "num") as Extract<Tok, { t: "num" }> | undefined;
      start = i + 1;
      while (start < toks.length && toks[start]!.t === "num" && toks[start] === rhs) start++;
      if (!rhs || !lhs.some((x) => x.t === "num")) continue;
      if (lhs[0]!.t === "op" && carry !== undefined) lhs = [{ t: "num", v: carry, dec: 2 }, ...lhs];
      try {
        const got = evaluate(lhs);
        const tol = 0.5 * 10 ** -rhs.dec + 1e-9;
        checked++;
        if (Math.abs(got - rhs.v) > tol) problems.push(`"${clause}" works out to ${got}, not ${rhs.v}`);
      } catch (e) {
        problems.push(`"${clause}": ${(e as Error).message}`);
      }
      carry = rhs.v;
    }
  }
  return { problems, checked };
}
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") {
    if (!/^https?:\/\//.test(x)) out.push(x); // a fact's link is not a sum ("…?__blob=publicationFile&v=6")
  }
  else if (Array.isArray(x)) for (const y of x) strings(y, out);
  else if (x && typeof x === "object") for (const y of Object.values(x)) strings(y, out);
  return out;
}
function assertMaths(objects: unknown[], lang: Lang, minChecked = 1) {
  let checked = 0;
  const problems: string[] = [];
  for (const s of strings(objects)) {
    const r = mathsProblems(s, lang);
    checked += r.checked;
    problems.push(...r.problems);
  }
  assert.deepEqual(problems, [], `sums that do not check out (${lang})`);
  assert.ok(checked >= minChecked, `checked ${checked} sums (${lang}), want at least ${minChecked}`);
}

describe("the maths checker itself", () => {
  test("accepts right sums and catches wrong ones", () => {
    assert.equal(mathsProblems("+€12.40 a day × 10 weekdays − €180.00 setup = −€56.00", "en").problems.length, 0);
    assert.equal(mathsProblems("+€12.40 a day × 10 weekdays − €180.00 setup = −€56.02", "en").problems.length, 1, "the old −€56.02 case");
    assert.equal(mathsProblems("11.4 × €1.32 = €15.00", "en").problems.length, 1, "the old €15.05 case");
    assert.equal(mathsProblems("+105,00 € pro Woche × 14 Tage ÷ 7 = +210,00 €", "de").problems.length, 0);
    assert.equal(mathsProblems("22 481,20 € ÷ 1,106 (bez 10,6% VAT) − 22 481,20 € × 32% = 13 132,60 €", "pl").problems.length, 0);
    assert.equal(mathsProblems("Nobody new: 0 × €5.35 − €36.57 = −€36.57 a day; × 10 weekdays − €180.00 = −€545.70", "en").checked, 2);
  });
});

// ---------------------------------------------------------------------------
// Lunch offer: the demo café (Café Lindenblatt, Neukölln)
// ---------------------------------------------------------------------------
describe("lunch offer: the Berlin demo café", () => {
  const d = demoInputs("lunch_offer") as Record<string, number>;
  const a = lunchDemo();
  const r = lunchRef(d);

  test("demo inputs: Neukölln, 1 staff hour at €18.00, VAT left to the fallback", () => {
    assert.equal(d.kiez as unknown, "Neukölln");
    assert.equal(d.extra_staff_hours_per_day, 1);
    assert.equal(d.staff_hourly_cost, 18);
    assert.ok(!("vat_rate" in d), "the demo leaves VAT blank so the fallback note shows");
    const vat = a.inputs.find((i) => i.key === "vat_rate")!;
    assert.equal(vat.value, 0.106);
    assert.equal(vat.source, "assumption");
    assert.equal(vat.filledBy, "fallback");
    assert.match(vat.note!, /The rates are law/, "the VAT rates are public facts, not a guess");
    assert.match(vat.note!, /Only the split is a guess: 70% food and 30% drinks/);
    assert.match(vat.note!, /22 December 2025/, "the 30% drinks share names the BMF letter it rests on");
    assert.match(vat.note!, /Steuerberater/);
    assert.match(DEMO_BUSINESS, /Lindenblatt.*Neukölln/);
  });

  test("hand-checked building blocks (net of 10.6% VAT)", () => {
    // 9.90 ÷ 1.106 = 8.9512 → − 3.60 = 5.35; 11.20 ÷ 1.106 − 11.20 × 0.32 = 10.1266 − 3.584 = 6.54
    assert.equal(r.mOffer, 5.35);
    assert.equal(r.mNow, 6.54);
    assert.equal(r.switchers, 11.4);
    assert.equal(r.switchLoss, 13.57); // 11.4 × 1.19 = 13.566
    assert.equal(r.daily, 23); // 1 h × €18.00 + €25 ÷ 5
    assert.equal(r.need, 36.57);
    close(fig(a, "deal_margin").value, 5.35, "deal margin figure");
    close(fig(a, "lunch_margin_now").value, 6.54, "lunch margin figure");
    close(fig(a, "switch_cost_day").value, 13.57, "switch cost figure");
    close(fig(a, "running_cost_day").value, 23, "running cost figure");
    assert.equal(fig(a, "deal_margin").maths, "€9.90 deal price ÷ 1.106 (without 10.6% VAT) − €3.60 ingredients = €5.35 per deal");
    assert.match(fig(a, "running_cost_day").maths, /^1 extra staff hour × €18\.00 \+ €25\.00 promotion a week ÷ 5 weekdays = €23\.00 a day$/);
  });

  test("today's figures say 'weekdays only' and are not set against monthly fixed costs", () => {
    close(fig(a, "weekday_takings_month").value, 22481.2, "weekday takings");
    close(fig(a, "weekday_left_month").value, 13132.6, "left after VAT and ingredients");
    assert.match(fig(a, "weekday_takings_month").label, /Monday to Friday only/);
    assert.match(fig(a, "weekday_left_month").label, /Monday to Friday only/);
    assert.match(fig(a, "weekday_left_month").maths, /not your whole month/);
    assert.ok(!a.current.some((f) => f.id === "monthly_fixed_costs"), "fixed costs are not listed next to weekday-only takings");
    for (const f of a.current) assert.equal(f.source, "demo", `${f.id} is tagged demo`);
  });

  test("break-even: 11 a day pays back the test, 7 a day pays its way", () => {
    assert.equal(a.breakEven.value, 11);
    assert.equal(a.breakEven.unit, "customers/day");
    assert.equal(a.breakEven.reachable, true);
    assert.ok(r.netTest(11) >= 0 && r.netTest(10) < 0);
    assert.ok(r.netDay(7) >= 0 && r.netDay(6) < 0);
    assert.match(a.breakEven.plain, /^Two numbers: from 11 extra lunch customers a day the deal pays back the test/);
    assert.match(a.breakEven.plain, /From 7 a day it pays its way after that; that is the number for keeping it/);
    assert.match(a.breakEven.maths, /€54\.57 a day to cover/);
    assert.match(a.breakEven.label, /pay back the test/);
    const on = a.breakEven.ongoing!;
    assert.equal(on.value, 7);
    assert.match(on.label, /pay its way/);
    assert.match(on.plain, /setup is spent either way/);
    assert.equal(a.sensitivity.ongoingX, 7);
  });

  test("worst case names the switching guess and is not called a ceiling", () => {
    close(a.worstCase.value, r.netTest(0), "worst case");
    close(a.worstCase.value, -545.7, "worst case");
    close(a.worstCase.shareOfCash!, 545.7 / 1500, "share of cash", 1e-4);
    close(a.worstCase.cashOut!, 410, "cash out over the test"); // €180 + €23 × 10
    close(a.worstCase.ifAllSwitch!, -862.2, "if every lunch regular switched"); // 38 × 1.19 = 45.22 a day
    assert.match(a.worstCase.plain, /€546/);
    assert.match(a.worstCase.plain, /your guess: 30% of lunch customers/);
    assert.match(a.worstCase.plain, /if every lunch regular switched, it could cost €862/);
    assert.match(a.worstCase.plain, /36% of the €1,500/);
    for (const l of LANGS) {
      const text = JSON.stringify([lunchDemo(l), planTest(lunchDemo(l))]);
      assert.doesNotMatch(text, /most it can cost|cannot cost more|at most/i, `${l}: no ceiling claims`);
    }
  });

  test("scenarios cautious / expected / optimistic", () => {
    assert.deepEqual(a.scenarios.map((s) => s.id), ["cautious", "expected", "optimistic"]);
    assert.deepEqual(a.scenarios.map((s) => s.assumptionValue), [3, 8, 15]);
    assert.deepEqual(a.scenarios.map((s) => s.netTest), [-385.2, -117.7, 256.8]);
    assert.deepEqual(a.scenarios.map((s) => s.netMonth), [-445.28, 135.19, 947.86]);
    for (const s of a.scenarios) {
      close(s.netTest, r.netTest(s.assumptionValue), `${s.id} net test`);
      close(s.netMonth, r.netMonth(s.assumptionValue), `${s.id} net month`);
    }
    assert.deepEqual(a.scenarios.map((s) => s.assumptionText), ["3 extra lunch customers a day", "8 extra lunch customers a day", "15 extra lunch customers a day"]);
    const e = scen(a, "expected");
    assert.deepEqual(e.figures.map((f) => f.id), ["extra_customers", "revenue_change_day", "net_day", "net_test", "net_month", "net_month_share_fixed"]);
    close(e.figures.find((f) => f.id === "revenue_change_day")!.value, 8 * 9.9 + 11.4 * (9.9 - 11.2), "revenue change per day");
    assert.equal(e.figures.find((f) => f.id === "net_test")!.maths, "+€6.23 a day × 10 weekdays − €180.00 setup = −€117.70");
    assert.match(e.plain, /8 extra customers/);
  });

  test("biggest uncertainty is the number of extra customers", () => {
    assert.equal(a.biggestUncertainty.key, "extra_likely");
    close(a.biggestUncertainty.swing, 12 * 5.35 * 10, "swing"); // €642
    assert.match(a.biggestUncertainty.plain, /Whether you get 3 or 15 extra customers a day changes the test result by €642/);
    assert.deepEqual(a.biggestUncertainty.ranking.map((x) => [x.key, x.swing]), [["extra_likely", 642], ["lunch_spend", 223.5], ["offer_cost", 209.5], ["switch_share", 180.9]]);
  });

  test("sensitivity powers the slider", () => {
    const s = a.sensitivity;
    assert.equal(s.key, "extra_likely");
    assert.equal(s.current, 8);
    assert.equal(s.breakEvenX, 11);
    assert.equal(s.points[0]!.x, 0);
    assert.equal(s.points.at(-1)!.x, 23); // max(ceil(15 × 1.5), 11 × 2, 10)
    assert.equal(s.points.length, 24);
    for (const p of s.points) {
      close(p.netTest, r.netTest(p.x), `netTest at ${p.x}`);
      close(p.netMonth, r.netMonth(p.x), `netMonth at ${p.x}`);
      assert.ok(p.explanation.includes(`${p.x} extra customer`), `explanation at ${p.x} names x`);
    }
    assert.match(s.points[11]!.explanation, /reaches the 11 a day needed, so the deal pays back the test/);
    assert.match(s.points[8]!.explanation, /does not pay back the test yet: that needs 11 a day/);
    assert.match(s.points[3]!.explanation, /below the 7 a day the deal needs to pay its way/);
    assert.equal(s.points[8]!.vsGuess, 0);
    assert.equal(s.points[9]!.vsGuess, 53.5);
    assert.deepEqual([s.perStep!.netTest, s.perStep!.netMonth], [53.5, 116.1]);
    assert.equal(s.perStep!.plain, "Each extra customer a day adds €5.35 × 10 weekdays = €53.50 over the test, and about €116 a month if you keep the deal.");
  });

  test("lessons, next questions and warnings", () => {
    assert.ok(a.lessons.length >= 3 && a.lessons.length <= 5, `3–5 lessons, got ${a.lessons.length}`);
    assert.ok(a.lessons.some((l) => l.includes("€5.35") && l.includes("€1.19") && /VAT is not yours/.test(l)), "VAT, margin and switching lesson");
    assert.ok(a.lessons.some((l) => /any decision/.test(l)), "transferable method line");
    assert.ok(a.nextQuestions.some((q) => /Count lunch customers \(11:30–14:30\) every weekday for one normal week/.test(q)));
    assert.ok(a.nextQuestions.some((q) => /7% VAT.*19%/.test(q)), "asks about the real VAT blend");
    assert.ok(a.warnings.some((w) => /below the 11 a day needed/.test(w)), "likely guess below the test break-even");
    assert.ok(a.warnings.some((w) => /€1\.19 less/.test(w)), "deal margin below today's lunch margin");
  });

  test("public facts used: the VAT rates behind the 10.6% guess and the BMF letter behind its 30% drinks share", () => {
    assert.deepEqual(a.facts.map((f) => f.id), ["vat_food_7", "vat_drinks_19", "bmf_drinks_share_30"]);
    const [food, drinks, bmf] = a.facts;
    assert.match(food!.source, /Steueränderungsgesetz 2025, § 12 Abs\. 2 Nr\. 15 UStG/);
    assert.match(drinks!.source, /§ 12/);
    for (const f of [food!, drinks!]) {
      assert.equal(f.url, "https://www.gesetze-im-internet.de/ustg_1980/__12.html", "the law text itself, not a home page");
      assert.equal(f.asOf, "2026-01-01");
    }
    assert.equal(bmf!.source, "Bundesministerium der Finanzen, BMF-Schreiben vom 22.12.2025");
    assert.equal(bmf!.asOf, "2025-12-22");
    assert.match(bmf!.url, /^https:\/\/www\.bundesfinanzministerium\.de\/.+2025-12-22-verpflegungsdienstleistungen\.pdf/);
    assert.match(bmf!.value, /30%/);
  });

  test("analysis metadata", () => {
    assert.equal(a.template, "lunch_offer");
    assert.equal(a.lang, "en");
    assert.equal(a.demo, true);
    assert.equal(a.currency, "EUR");
    assert.equal(a.createdAt, T);
    assert.match(a.id, /^a-[0-9a-f]{8}$/);
    assert.match(a.business, /demo/);
    assert.equal(a.inputs.length, getTemplate("lunch_offer").fields.length);
  });

  test("every sum in the demo, the plan and the slider checks out by hand (all languages)", () => {
    for (const l of LANGS) {
      const x = lunchDemo(l);
      assertMaths([x, planTest(x)], l, 40);
    }
  });
});

describe("lunch offer: break-even is exact", () => {
  const base = demoInputs("lunch_offer") as Record<string, number>;
  const variants: Record<string, number>[] = [
    base,
    { ...base, offer_price: 10.9 },
    { ...base, setup_cost: 0 },
    { ...base, switch_share: 0.5, lunch_spend: 13 },
    { ...base, extra_staff_hours_per_day: 0, marketing_per_week: 60, test_days: 15 },
    { ...base, offer_cost: 2.5, setup_cost: 400, test_days: 5 },
    { ...base, lunch_customers: 80, switch_share: 0.1, vat_rate: 0.07 },
    { ...base, vat_rate: 0.19, staff_hourly_cost: 13.9, extra_staff_hours_per_day: 2 },
  ];
  for (const [i, v] of variants.entries()) {
    test(`variant ${i}: net over the test is ≥ 0 at break-even and < 0 one below`, () => {
      const a = analyze("lunch_offer", v, { createdAt: T });
      const r = lunchRef({ vat_rate: 0.106, ...v });
      const be = a.breakEven.value;
      assert.ok(r.netTest(be) >= 0, `netTest(${be}) = ${r.netTest(be)}`);
      if (be > 0) assert.ok(r.netTest(be - 1) < 0, `netTest(${be - 1}) = ${r.netTest(be - 1)}`);
      const on = a.breakEven.ongoing!.value;
      assert.ok(r.netDay(on) >= 0);
      if (on > 0) assert.ok(r.netDay(on - 1) < 0);
      assert.equal(a.scenarios[1]!.netTest, r.netTest(v.extra_likely!));
      assertMaths([a, planTest(a)], "en", 30);
    });
  }
});

// ---------------------------------------------------------------------------
// Inputs, staff hours, old links, Kiez
// ---------------------------------------------------------------------------
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
    assert.throws(() => analyze("price_change", {}, { lang: "de" }), /Welchen Artikel möchten Sie im Preis ändern\?/);
  });

  test("problems throw in plain words", () => {
    assert.throws(() => analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_cost: 12 }), /every deal sold loses money/);
    assert.throws(() => analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_cost: 9 }), /after VAT/, "€9 of ingredients is more than €9.90 after VAT");
    assert.throws(() => analyze("lunch_offer", { ...demoInputs("lunch_offer"), avg_spend: "lots" }), /should be a number/);
    assert.throws(() => analyze("lunch_offer", { ...demoInputs("lunch_offer"), avg_spend: "7-8" }), /should be one number/);
    assert.throws(() => analyze("nope" as never, {}), /Unknown decision template/);
  });

  test("a share given as 30, '30%' or 0.3 gives the same analysis", () => {
    const d = demoInputs("lunch_offer");
    const runs = [30, "30%", 0.3, "30 %", "0,3"].map((s) => analyze("lunch_offer", { ...d, switch_share: s }, { createdAt: T }));
    for (const r of runs.slice(1)) {
      assert.equal(r.id, runs[0]!.id);
      assert.deepEqual(r.scenarios, runs[0]!.scenarios);
      assert.deepEqual(r.breakEven, runs[0]!.breakEven);
    }
    assert.equal(analyze("lunch_offer", { ...d, variable_cost_share: "32%" }, { createdAt: T }).breakEven.value, 11);
  });

  test("fallbacks are tagged as guesses and turn into next questions", () => {
    const a = analyze("lunch_offer", { weekday_customers: 140, avg_spend: 7.4, lunch_customers: 38, offer_price: 9.9, offer_cost: 3.6, extra_likely: 8 }, { createdAt: T });
    const inp = (k: string) => a.inputs.find((i) => i.key === k)!;
    assert.equal(inp("variable_cost_share").source, "assumption");
    assert.equal(inp("lunch_spend").filledBy, "derived");
    assert.equal(inp("extra_staff_hours_per_day").value, 0);
    assert.equal(inp("staff_hourly_cost").value, 13.9);
    assert.equal(inp("weekday_customers").source, "owner");
    assert.ok(a.nextQuestions.some((q) => /lunchtime customer really spend/.test(q)));
    assert.ok(a.nextQuestions.length <= 6);
    assert.equal(a.business, "Your café");
    assert.deepEqual(a.facts.map((f) => f.id), ["vat_food_7", "vat_drinks_19", "bmf_drinks_share_30"], "no staff hours: the minimum wage is not used");
  });

  test("staff cost = hours × cost per hour; the minimum wage fallback says so and is listed as a fact", () => {
    const d = { ...demoInputs("lunch_offer") } as RawInputs;
    delete d.staff_hourly_cost;
    const a = analyze("lunch_offer", { ...d, extra_staff_hours_per_day: 2 }, { createdAt: T });
    const rate = a.inputs.find((i) => i.key === "staff_hourly_cost")!;
    assert.equal(rate.value, 13.9);
    assert.match(rate.note!, /minimum wage.*1 January 2026.*€14\.60 from 1 January 2027/);
    assert.match(rate.note!, /employer contributions/);
    close(fig(a, "running_cost_day").value, 2 * 13.9 + 5, "2 h × €13.90 + €5 promotion");
    assert.deepEqual(a.facts.map((f) => f.id), ["vat_food_7", "vat_drinks_19", "bmf_drinks_share_30", "min_wage_2026", "min_wage_2027"]);
    const own = analyze("lunch_offer", { ...demoInputs("lunch_offer"), vat_rate: "7%" }, { createdAt: T });
    assert.deepEqual(own.facts, [], "the owner's own VAT rate and staff cost: no public facts used");
  });

  test("older links: extra_staff_cost_per_day still works as a daily cost", () => {
    const d = { ...demoInputs("lunch_offer") } as RawInputs;
    delete d.extra_staff_hours_per_day;
    delete d.staff_hourly_cost;
    const old = analyze("lunch_offer", { ...d, extra_staff_cost_per_day: 18 }, { createdAt: T });
    const now = lunchDemo();
    assert.deepEqual(old.scenarios.map((s) => s.netTest), now.scenarios.map((s) => s.netTest));
    assert.equal(old.breakEven.value, now.breakEven.value);
    const h = old.inputs.find((i) => i.key === "extra_staff_hours_per_day")!;
    assert.equal(h.filledBy, "alias");
    assert.match(h.note!, /older link/);
    const zero = analyze("lunch_offer", { ...d, extra_staff_cost_per_day: 0 }, { createdAt: T });
    close(fig(zero, "running_cost_day").value, 5, "no staff, €25 promotion a week");
  });

  test("Kiez: known names are normalised, others kept; demo is Neukölln", () => {
    assert.equal(BERLIN_KIEZE.length, 18);
    assert.ok(BERLIN_KIEZE.includes("Neukölln") && BERLIN_KIEZE.includes("Weißensee"));
    assert.equal(normaliseKiez("neukoelln"), "Neukölln");
    assert.equal(normaliseKiez("  NEUKÖLLN "), "Neukölln");
    assert.equal(normaliseKiez("prenzlauer berg"), "Prenzlauer Berg");
    assert.equal(normaliseKiez("Weissensee"), "Weißensee");
    assert.equal(normaliseKiez("andere"), "other");
    assert.equal(normaliseKiez("Rixdorf"), "Rixdorf");
    const a = analyze("lunch_offer", { ...demoInputs("lunch_offer"), kiez: "kreuzberg" }, { createdAt: T });
    assert.equal(a.inputs.find((i) => i.key === "kiez")!.value, "Kreuzberg");
    assert.deepEqual(a.scenarios.map((s) => s.netTest), lunchDemo().scenarios.map((s) => s.netTest), "the Kiez does not change the money");
  });
});

// ---------------------------------------------------------------------------
// Numbers as Berlin owners type them
// ---------------------------------------------------------------------------
describe("number parsing by language", () => {
  const read = (key: string, raw: string, lang: Lang) => {
    const c = checkInputs("lunch_offer", { ...demoInputs("lunch_offer"), [key]: raw }, { lang });
    assert.deepEqual(c.problems, [], `${lang} "${raw}" reads without problems`);
    const i = c.resolved.find((x) => x.key === key)!;
    return { v: i.value as number, note: i.note };
  };
  const cases: [string, string, Record<Lang, number>, boolean][] = [
    // field, text, value per language, note expected (the "one separator + three digits" pattern)
    ["cash_buffer", "1.500", { en: 1.5, de: 1500, es: 1500, pl: 1500 }, true],
    ["cash_buffer", "1.500 €", { en: 1.5, de: 1500, es: 1500, pl: 1500 }, true],
    ["monthly_fixed_costs", "16.500", { en: 16.5, de: 16500, es: 16500, pl: 16500 }, true],
    ["cash_buffer", "1 500", { en: 1500, de: 1500, es: 1500, pl: 1500 }, false],
    ["cash_buffer", "1,500", { en: 1500, de: 1500, es: 1500, pl: 1500 }, true],
    ["cash_buffer", "1.500,50 €", { en: 1500.5, de: 1500.5, es: 1500.5, pl: 1500.5 }, false],
    ["cash_buffer", "1,500.50", { en: 1500.5, de: 1500.5, es: 1500.5, pl: 1500.5 }, false],
    ["avg_spend", "9,90", { en: 9.9, de: 9.9, es: 9.9, pl: 9.9 }, false],
    ["avg_spend", "9.90", { en: 9.9, de: 9.9, es: 9.9, pl: 9.9 }, false],
    ["avg_spend", "€9,90", { en: 9.9, de: 9.9, es: 9.9, pl: 9.9 }, false],
    ["avg_spend", "9,90 EUR", { en: 9.9, de: 9.9, es: 9.9, pl: 9.9 }, false],
    ["weekday_customers", "ca. 40", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["weekday_customers", "etwa 40", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["weekday_customers", "about 40", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["weekday_customers", "~40", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["weekday_customers", "40 Kunden", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["weekday_customers", "unos 40 clientes", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["weekday_customers", "około 40 klientów", { en: 40, de: 40, es: 40, pl: 40 }, false],
    ["switch_share", "30 %", { en: 0.3, de: 0.3, es: 0.3, pl: 0.3 }, false],
    ["switch_share", "30%", { en: 0.3, de: 0.3, es: 0.3, pl: 0.3 }, false],
    ["switch_share", "0,3", { en: 0.3, de: 0.3, es: 0.3, pl: 0.3 }, false],
    ["switch_share", "1/3", { en: 1 / 3, de: 1 / 3, es: 1 / 3, pl: 1 / 3 }, false],
    ["monthly_fixed_costs", "16k", { en: 16000, de: 16000, es: 16000, pl: 16000 }, false],
    ["monthly_fixed_costs", "16 Tsd. €", { en: 16000, de: 16000, es: 16000, pl: 16000 }, false],
  ];
  for (const [key, raw, want, noted] of cases)
    test(`"${raw}" (${key})`, () => {
      for (const l of LANGS) {
        const got = read(key, raw, l);
        close(got.v, want[l], `${l} "${raw}"`, 1e-9);
        assert.equal(got.note !== undefined, noted, `${l} "${raw}" note: ${got.note}`);
      }
    });

  test("the note says how a number was read, in the owner's language", () => {
    assert.match(read("cash_buffer", "1.500", "de").note!, /„1\.500“ wurde als 1\.500,00\s€ gelesen \(nicht 1,50\s€\)/);
    assert.match(read("cash_buffer", "1.500", "en").note!, /Read "1\.500" as €1\.50 \(not €1,500\.00\)/);
    assert.match(read("cash_buffer", "1.500", "es").note!, /«1\.500» se ha leído como 1500,00\s€/);
    assert.match(read("cash_buffer", "1.500", "pl").note!, /„1\.500” odczytano jako 1500,00\s€/);
  });

  test("an impossible reading falls back to the other one: '7.400' as an average spend is €7.40", () => {
    const de = read("avg_spend", "7.400", "de");
    assert.equal(de.v, 7.4);
    assert.match(de.note!, /außerhalb des erwarteten Bereichs/);
    assert.equal(read("lunch_spend", "11.200", "pl").v, 11.2);
  });

  test("typographic minus and percent for sales changes", () => {
    const p = checkInputs("price_change", { ...demoInputs("price_change"), volume_likely: "−4%", volume_low: "-12", volume_high: "+0 %" }, { lang: "de" });
    assert.equal(p.resolved.find((i) => i.key === "volume_likely")!.value, -0.04);
    assert.equal(p.resolved.find((i) => i.key === "volume_low")!.value, -0.12);
    assert.equal(p.resolved.find((i) => i.key === "volume_high")!.value, 0);
  });

  test("parseNumber directly", () => {
    assert.deepEqual(parseNumber("1.500", "de"), { value: 1500, percent: false, ambiguous: { alt: 1.5 } });
    assert.deepEqual(parseNumber("30 %", "de"), { value: 30, percent: true });
    assert.equal(parseNumber("40-50", "en").several, true);
    assert.ok(Number.isNaN(parseNumber("viele", "de").value));
    assert.equal(parseNumber("0,300", "de").value, 0.3, "a leading zero is never a thousands group");
  });

  test("measured results are read the same way", () => {
    const a = lunchDemo("de");
    const r = compareResult(a, { baseline_lunch_customers: "38", test_lunch_customers: "ca. 46", redemptions_per_day: "17,4" } as never, { recordedAt: T });
    assert.equal(r.actual, 8);
  });
});

// ---------------------------------------------------------------------------
// Price change
// ---------------------------------------------------------------------------
describe("price change (19% VAT on a flat white)", () => {
  const a = priceDemo();
  const d = demoInputs("price_change") as Record<string, number>;
  const r = priceRef(d);

  test("hand-checked margins after VAT", () => {
    assert.equal(r.mOld, 2.33); // 3.90 ÷ 1.19 = 3.2773 − 0.95
    assert.equal(r.mNew, 2.58); // 4.20 ÷ 1.19 = 3.5294 − 0.95
    close(fig(a, "margin_now").value, 2.33, "margin now");
    close(fig(a, "margin_new").value, 2.58, "margin new");
    close(fig(a, "left_week_now").value, 1444.6, "weekly left now");
    assert.deepEqual(a.facts.map((f) => f.id), ["vat_drinks_19", "vat_milk_takeaway_7", "vat_food_7", "min_wage_2026", "min_wage_2027"]);
    const note = a.inputs.find((i) => i.key === "vat_rate")!.note!;
    assert.match(note, /milk drinks drunk in the café included/);
    assert.match(note, /Only milk drinks sold to take away with at least 75% milk are 7%/);
  });

  test("break-even volume change and lost sales", () => {
    close(a.breakEven.value, 2.33 / 2.58 - 1, "break-even share", 1e-4); // −9.69%
    assert.equal(a.breakEven.unit, "share");
    assert.match(a.breakEven.plain, /60 fewer a week \(9\.7% of 620\)/);
    assert.ok((620 - 60) * 2.58 >= 620 * 2.33);
    assert.ok((620 - 61) * 2.58 < 620 * 2.33);
    assert.equal(a.sensitivity.breakEvenX, a.breakEven.value);
  });

  test("scenarios, worst case and the current path", () => {
    assert.deepEqual(a.scenarios.map((s) => s.netTest), [-73.9, 182.04, 310]);
    assert.deepEqual(a.scenarios.map((s) => s.netMonth), [-159.99, 394.12, 671.15]);
    for (const s of a.scenarios) close(s.netTest, r.dTest(s.assumptionValue), `${s.id}`);
    assert.deepEqual(a.scenarios.map((s) => s.assumptionText), ["sales 12% lower", "sales 4% lower", "sales unchanged"]);
    close(a.worstCase.value, -73.9, "worst case");
    assert.equal(a.biggestUncertainty.key, "volume_likely");
    close(a.biggestUncertainty.swing, 383.9, "swing");
    assertMaths([a, planTest(a)], "en", 20);
  });

  test("worst case is zero when even the cautious guess earns more", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), volume_low: -0.05, volume_likely: -0.02 }, { createdAt: T });
    assert.equal(b.worstCase.value, 0);
    assert.match(b.worstCase.plain, /no downside in money/);
  });

  test("a price cut needs more sales", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), new_price: 3.6, volume_low: 0, volume_likely: 0.08, volume_high: 0.15 }, { createdAt: T });
    close(b.breakEven.value, 2.33 / 2.08 - 1, "break-even share", 1e-4); // 3.60 ÷ 1.19 − 0.95 = 2.0752 → 2.08
    assert.match(b.breakEven.label, /need/);
    assert.ok(b.warnings.some((w) => /below break-even/.test(w)));
    assertMaths([b, planTest(b)], "en", 20);
  });

  test("sensitivity runs from −30% to +5% in 1-point steps", () => {
    const s = a.sensitivity;
    assert.equal(s.points.length, 36);
    close(s.points[0]!.x, -0.3, "first x", 1e-9);
    close(s.points.at(-1)!.x, 0.05, "last x", 1e-9);
    for (const p of s.points) close(p.netTest, r.dTest(p.x), `netTest at ${p.x}`);
  });

  test("weeks per month is 4.33 and weekdays per month 21.7, written into the maths", () => {
    assert.equal(WEEKS_PER_MONTH, 4.33);
    assert.equal(WEEKDAYS_PER_MONTH, 21.7);
    assert.match(scen(a, "expected").figures.find((f) => f.id === "delta_month")!.maths, /× 4\.33 weeks/);
  });
});

describe("edge cases the judges found", () => {
  test("a price cut with only a likely guess is not refused with 'swap them'", () => {
    const d = { ...demoInputs("price_change") } as RawInputs;
    delete d.volume_low;
    delete d.volume_high;
    const c = checkInputs("price_change", { ...d, new_price: 3.5, volume_likely: 0.1 });
    assert.deepEqual(c.problems, []);
    const hi = c.resolved.find((i) => i.key === "volume_high")!.value as number;
    assert.ok(hi >= 0.1, `optimistic ${hi} ≥ likely`);
    const rise = checkInputs("price_change", { ...d, volume_likely: -0.04 });
    assert.equal(rise.resolved.find((i) => i.key === "volume_high")!.value, 0, "a rise keeps the optimistic guess modest");
  });

  test("no 'X or X' when every guess is the same", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), volume_low: 0, volume_likely: 0, volume_high: 0 }, { createdAt: T });
    assert.doesNotMatch(b.biggestUncertainty.plain, /0% or 0%/);
    assert.match(b.biggestUncertainty.plain, /same guess/);
    const l = analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_low: 8, extra_likely: 8, extra_high: 8 }, { createdAt: T });
    assert.doesNotMatch(JSON.stringify(l), /\b8 or 8\b/);
  });

  test("today's price below cost: break-even clamps at −100% and the card has no negative counts", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), current_price: 1.0, new_price: 2.0, unit_cost: 0.95 }, { createdAt: T });
    assert.equal(b.breakEven.value, -1);
    const p = planTest(b);
    assert.deepEqual([p.rule!.keepFrom, p.rule!.tweakFrom], [0, 0]);
    assert.doesNotMatch(JSON.stringify([b.breakEven, p]), /[−-]\d+ a week|[−-]1\d\d%/);
    assert.ok(b.warnings.some((w) => /already loses money/.test(w)));
    assert.equal(compareResult(b, { units_before_per_week: 620, units_after_per_week: 100 }).verdict, "keep");
  });

  test("break-even 0: the card does not say 'reach 0 a day' or 'spent €10'", () => {
    const b = analyze("lunch_offer", { ...demoInputs("lunch_offer"), lunch_spend: 6, setup_cost: 0, marketing_per_week: 0, extra_staff_hours_per_day: 0 }, { createdAt: T });
    assert.equal(b.breakEven.value, 0);
    const p = planTest(b);
    const text = JSON.stringify(p);
    assert.doesNotMatch(text, /\b0 a day\b|€10\b|fewer than 0/);
    assert.match(p.decisionRule.keep, /at least as busy as your baseline/);
    assert.equal(compareResult(b, { baseline_lunch_customers: 38, test_lunch_customers: 38, redemptions_per_day: 10 }).verdict, "keep");
    assert.equal(compareResult(b, { baseline_lunch_customers: 38, test_lunch_customers: 35, redemptions_per_day: 10 }).verdict, "stop");
  });

  test("absurd guesses get a plain warning", () => {
    const b = analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_likely: 200, extra_high: 220 }, { createdAt: T });
    assert.ok(b.warnings.some((w) => /more than all the customers you serve on a whole weekday/.test(w)));
    const c = analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_likely: 50, extra_high: 60 }, { createdAt: T });
    assert.ok(c.warnings.some((w) => /more than double your lunch/.test(w)));
  });

  test("a deal one cent above cost: 'do not test as it stands', no huge tweak range", () => {
    const net = Math.round((9.9 / 1.106) * 100) / 100; // €8.95
    const b = analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_cost: net - 0.01 }, { createdAt: T });
    const p = planTest(b);
    assert.equal(p.rule!.testable, false);
    assert.match(p.plain, /Do not test this deal as it stands/);
    assert.deepEqual(p.measure, []);
    assert.ok(b.warnings.some((w) => /more than all the customers you serve on a weekday today/.test(w)));
  });

  test("no lunch customers yet: nobody can switch", () => {
    const b = analyze("lunch_offer", { ...demoInputs("lunch_offer"), lunch_customers: 0 }, { createdAt: T });
    close(fig(b, "switch_cost_day").value, 0, "switching");
    assertMaths([b, planTest(b)], "en", 20);
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

// ---------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------
describe("whatChanged", () => {
  test("explains a deal price change in mechanism terms, with sums that check out", () => {
    const before = lunchDemo();
    const after = analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_price: 10.9 }, { demo: true, createdAt: T });
    const c = whatChanged(before, after);
    assert.equal(c.changes.length, 1);
    assert.deepEqual({ key: c.changes[0]!.key, fromText: c.changes[0]!.fromText, toText: c.changes[0]!.toText }, { key: "offer_price", fromText: "€9.90", toText: "€10.90" });
    const s = c.plain[0]!;
    assert.match(s, /You raised the deal price from €9\.90 to €10\.90/);
    assert.match(s, /each deal now leaves €0\.91 more \(€5\.35 → €6\.26\)/);
    assert.match(s, /you need 3 fewer extra customers a day to break even \(11 → 8\)/);
    const be = c.effects.find((e) => e.id === "break_even")!;
    assert.deepEqual([be.from, be.to], [11, 8]);
    const nt = c.effects.find((e) => e.id === "net_test_expected")!;
    assert.equal(nt.from, -117.7);
    assert.equal(nt.to, lunchRef({ ...(demoInputs("lunch_offer") as Record<string, number>), offer_price: 10.9 }).netTest(8)); // +58.90
    assert.deepEqual(c.effects.map((e) => e.id), ["break_even", "net_test_expected", "net_month_expected", "worst_case"]);
  });

  test("the likely guess does not move break-even; its sum reproduces the change exactly", () => {
    const c = whatChanged(lunchDemo(), analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_likely: 12 }, { demo: true, createdAt: T }));
    assert.match(c.plain[0]!, /from 8 to 12/);
    assert.match(c.plain[0]!, /Break-even stays at 11 a day/);
    assert.match(c.plain[0]!, /4 × €5\.35 × 10 days = €214\.00 \(−€117\.70 → \+€96\.30\)/);
    assertMaths([c], "en", 1);
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
    assert.match(c.plain[0]!, /15\.3% of sales \(94 a week\) instead of 9\.7% \(60\)/);
    close(c.effects[0]!.to, 2.33 / 2.75 - 1, "new break-even", 1e-4);
  });

  test("the language follows the newer analysis", () => {
    const c = whatChanged(lunchDemo("de"), analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_likely: 12 }, { demo: true, createdAt: T, lang: "de" }));
    assert.match(c.plain[0]!, /4 × 5,35\s€ × 10 Tage = 214,00\s€/);
    assertMaths([c], "de", 1);
  });

  test("nothing changed / different decisions", () => {
    const c = whatChanged(lunchDemo(), lunchDemo());
    assert.equal(c.changes.length, 0);
    assert.match(c.plain[0]!, /Nothing changed/);
    assert.throws(() => whatChanged(lunchDemo(), priceDemo()), /different decisions/);
  });
});

// ---------------------------------------------------------------------------
// Test plan and results: one rule for both
// ---------------------------------------------------------------------------
describe("planTest", () => {
  test("lunch plan: keep from the ongoing break-even (setup is a sunk cost)", () => {
    const a = lunchDemo();
    const p = planTest(a);
    assert.equal(p.analysisId, a.id);
    assert.equal(p.days, 10);
    assert.deepEqual(p.rule, { unit: "customers/day", keepFrom: 7, tweakFrom: 4, payBackFrom: 11, testable: true });
    assert.match(p.decisionRule.keep, /^7 or more extra lunch customers a day on average: keep the deal/);
    assert.match(p.decisionRule.keep, /setup is already spent/);
    assert.match(p.decisionRule.keep, /From 11 a day it also pays back the test/);
    assert.match(p.plain, /from there it pays its way \(from 11 a day it also pays back the test\)/);
    assert.match(p.decisionRule.tweak, /^4 to under 7 a day/);
    assert.match(p.decisionRule.stop, /^Fewer than 4 a day/);
    assert.deepEqual(p.checkIns.map((c) => c.day), [3, 5, 10]);
    assert.ok(p.before.some((b) => /every weekday for one normal week/.test(b)), "same baseline wording as the next questions");
    assert.ok(p.during.some((d) => /Keep everything else the same/.test(d)));
  });

  test("the cash stop line counts only money that goes out; switching is shown separately", () => {
    const p = planTest(lunchDemo());
    assert.match(p.costCap, /about €295 in cash \(€180 setup and €23\.00 a day for staff and promotion\)/); // €180 + €23 × 5
    assert.match(p.costCap, /test costs €410 in cash/);
    assert.match(p.costCap, /Separately, regulars who switch .* about €13\.57 a day/);
    assert.doesNotMatch(p.costCap, /discounts to regulars/);
    assert.ok(p.measure.some((m) => /Cash spent/.test(m.what) && /receipts/.test(m.how)));
  });

  test("price plan: keep if sales drop less than break-even", () => {
    const p = planTest(priceDemo());
    assert.match(p.decisionRule.keep, /9\.7% or less/);
    assert.match(p.decisionRule.keep, /560 a week/);
    assert.match(p.decisionRule.tweak, /from 530 to under 560 a week/);
    assert.match(p.decisionRule.stop, /go back to €3\.90/);
    assert.deepEqual([p.rule!.keepFrom, p.rule!.tweakFrom], [560, 530]);
    assert.deepEqual(p.checkIns.map((c) => c.day), [3, 7, 14]);
  });
});

describe("compareResult uses exactly the card's rule", () => {
  const a = lunchDemo();
  test("observed fields", () => {
    assert.deepEqual(OBSERVED_FIELDS.lunch_offer.filter((f) => f.required).map((f) => f.key), ["baseline_lunch_customers", "test_lunch_customers", "redemptions_per_day"]);
    assert.deepEqual(OBSERVED_FIELDS.price_change.filter((f) => f.required).map((f) => f.key), ["units_before_per_week", "units_after_per_week"]);
  });

  test("lunch: on a grid of measured averages the verdict always matches the printed rule", () => {
    const p = planTest(a);
    const keep = Number(/^(\d+) or more/.exec(p.decisionRule.keep)![1]);
    const tweak = Number(/^(\d+) to under/.exec(p.decisionRule.tweak)![1]);
    const stop = Number(/^Fewer than (\d+)/.exec(p.decisionRule.stop)![1]);
    assert.deepEqual([keep, tweak, stop], [7, 4, 4]);
    for (let x10 = 0; x10 <= 200; x10++) {
      const x = x10 / 10;
      const card = x >= keep ? "keep" : x >= tweak ? "tweak" : "stop";
      const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 38 + x, redemptions_per_day: x + 11.4 }, { recordedAt: T });
      assert.equal(r.verdict, card, `x = ${x}`);
      assert.equal(verdictFor(p.rule!, x), card);
    }
    const at = (x: number) => compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 38 + x, redemptions_per_day: x + 11.4 }).verdict;
    assert.equal(at(4.5), "tweak", "4.5 a day is in the card's tweak band (4 to under 7)");
    assert.equal(at(3.9), "stop");
    assert.equal(at(6.9), "tweak", "6.9 is under the card's 7, even though 6.84 would pay its way");
  });

  test("price: on a grid of weekly sales the verdict always matches the printed rule", () => {
    const pd = priceDemo();
    const p = planTest(pd);
    for (let u2 = 1000; u2 <= 1300; u2++) {
      const u = u2 / 2;
      const card = u >= 560 ? "keep" : u >= 530 ? "tweak" : "stop";
      assert.equal(compareResult(pd, { units_before_per_week: 620, units_after_per_week: u }).verdict, card, `${u} a week`);
      assert.equal(verdictFor(p.rule!, u), card);
    }
    assert.equal(compareResult(pd, { units_before_per_week: 620, units_after_per_week: 534.5 }).verdict, "tweak");
    assert.equal(compareResult(pd, { units_before_per_week: 620, units_after_per_week: 529.5 }).verdict, "stop");
  });

  test("keep: 12 extra a day", () => {
    const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 50, redemptions_per_day: 23 }, { recordedAt: T });
    assert.equal(r.verdict, "keep");
    assert.equal(r.actual, 12);
    assert.equal(r.closestScenario, "optimistic");
    const ref = lunchRef({ ...(demoInputs("lunch_offer") as Record<string, number>), switch_share: 11 / 38 });
    close(r.netTest, ref.netTest(12), "net over test"); // (12 × 5.35 − 13.09 − 23) × 10 − 180 = +101.10
    assert.match(r.plain, /Your test card said: keep from 7 extra a day, tweak from 4, stop below 4\./);
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
    const ref = lunchRef({ ...(demoInputs("lunch_offer") as Record<string, number>), switch_share: 12 / 38, setup_cost: 220, test_days: 8 });
    close(r.netTest, ref.netTest(2), "net over test"); // (2 × 5.35 − 14.28 − 23) × 8 − 220 = −432.64
    assert.ok(r.learned.some((l) => /€220/.test(l)));
    assert.ok(r.learned.some((l) => /8 weekdays instead of 10/.test(l)));
  });

  test("keep on the card, but many more regulars switched: a plain 'careful'", () => {
    const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 46, redemptions_per_day: 38 }, { recordedAt: T });
    assert.equal(r.verdict, "keep");
    assert.match(r.plain, /Careful: more regulars switched/);
  });

  test("price change verdicts", () => {
    const p = priceDemo();
    const res = (after: number) => compareResult(p, { units_before_per_week: 620, units_after_per_week: after }, { recordedAt: T });
    assert.equal(res(600).verdict, "keep");
    assert.equal(res(600).closestScenario, "expected");
    close(res(600).netTest, ((600 * 2.58 - 620 * 2.33) * 14) / 7, "net over test"); // +206.80
    assert.equal(res(545).verdict, "tweak");
    assert.equal(res(500).verdict, "stop");
    assert.equal(res(500).closestScenario, "below_cautious");
    assert.ok(res(560).learned[0]!.includes("they changed by −9.7%"));
    assert.match(res(600).plain, /keep the new price at 560 a week or more/);
  });

  test("missing observations throw in plain words", () => {
    assert.throws(() => compareResult(a, { baseline_lunch_customers: 38 }), /Lunch customers a day during the test/);
    assert.throws(() => compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: -1, redemptions_per_day: 3 }), /0 or more/);
    assert.throws(() => compareResult(lunchDemo("pl"), { baseline_lunch_customers: 38 }), /Klienci w porze lunchu dziennie w trakcie testu/);
  });
});

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------
describe("four languages", () => {
  test("every catalog has every English key, non-empty", () => {
    const keys = Object.keys(ENGINE_MESSAGES.en);
    assert.ok(keys.length > 300, `${keys.length} keys`);
    for (const l of ["de", "es", "pl"] as const) {
      const table = ENGINE_MESSAGES[l] as Record<string, unknown>;
      const missing = keys.filter((k) => !(k in table) || table[k] === "");
      assert.deepEqual(missing, [], `${l} is complete`);
    }
  });

  test("template texts are translated: es and pl differ from de and en, and are non-empty", () => {
    for (const id of ["lunch_offer", "price_change"] as TemplateId[]) {
      const [en, de, es, pl] = (["en", "de", "es", "pl"] as Lang[]).map((l) => getTemplate(id, l));
      for (const t of [en, de, es, pl]) for (const f of t!.fields) for (const k of ["label", "ask", "why"] as const) assert.ok(f[k].trim().length > 2, `${t!.id}.${f.key}.${k}`);
      assert.notEqual(es!.title, de!.title);
      assert.notEqual(pl!.title, de!.title);
      assert.notEqual(es!.title, en!.title);
      for (const [i, f] of de!.fields.entries()) {
        for (const k of ["label", "ask", "why"] as const) {
          assert.notEqual(es!.fields[i]![k], f[k], `es ${id}.${f.key}.${k} is not German`);
          assert.notEqual(pl!.fields[i]![k], f[k], `pl ${id}.${f.key}.${k} is not German`);
          assert.notEqual(f[k], en!.fields[i]![k], `de ${id}.${f.key}.${k} is not English`);
        }
      }
    }
    assert.equal(getTemplate("lunch_offer", "de").title, "Mittagsangebot unter der Woche");
    assert.equal(getTemplate("lunch_offer", "es").title, "Menú del mediodía entre semana");
    assert.equal(getTemplate("lunch_offer", "pl").title, "Oferta lunchowa w dni robocze");
    assert.equal(getTemplate("lunch_offer", "en").title, "Weekday lunch offer");
    analyze("lunch_offer", demoInputs("lunch_offer"), { lang: "es" });
    assert.equal(getTemplate("lunch_offer").title, "Menú del mediodía entre semana", "without a language: the current one");
  });

  test("observed fields, demo business and source labels per language", () => {
    const labels = (l: Lang) => observedFields("lunch_offer", l).map((f) => f.label);
    for (const l of ["es", "pl"] as Lang[]) for (const [i, x] of labels(l).entries()) assert.notEqual(x, labels("de")[i], `${l} observed label ${i}`);
    assert.match(observedFields("price_change", "de")[0]!.label, /Verkäufe pro Woche/);
    assert.deepEqual(LANGS.map((l) => demoBusiness(l)), [
      "Café Lindenblatt (demo café, Berlin-Neukölln)",
      "Café Lindenblatt (Demo-Café, Berlin-Neukölln)",
      "Café Lindenblatt (café de demostración, Berlín-Neukölln)",
      "Café Lindenblatt (kawiarnia demonstracyjna, Berlin-Neukölln)",
    ]);
    assert.deepEqual(LANGS.map((l) => sourceLabel("assumption", l)), ["A guess", "Eine Schätzung", "Una estimación", "Szacunek"]);
    assert.equal(Object.values(TEMPLATES).length, 2);
  });

  test("the same numbers in every language; words and number format follow the language", () => {
    const en = lunchDemo("en");
    for (const l of LANGS) {
      const a = lunchDemo(l);
      assert.equal(a.lang, l);
      assert.equal(a.id, en.id, "the analysis id does not depend on the language");
      assert.deepEqual(a.scenarios.map((s) => s.netTest), en.scenarios.map((s) => s.netTest));
      assert.equal(a.breakEven.value, en.breakEven.value);
      assert.equal(a.facts.length, 3);
      assert.equal(a.inputs.length, en.inputs.length);
    }
    assert.match(fig(lunchDemo("de"), "deal_margin").maths, /^9,90\s€ Angebotspreis ÷ 1,106 \(ohne 10,6\s% Mehrwertsteuer\) − 3,60\s€ Zutaten = 5,35\s€ pro Angebot$/);
    assert.match(lunchDemo("de").breakEven.plain, /^Zwei Zahlen: Ab 11 zusätzlichen Mittagsgästen pro Tag holt das Angebot den Test herein/);
    assert.match(lunchDemo("de").breakEven.plain, /Ab 7 pro Tag trägt sich das Angebot danach; das ist die Zahl, um es zu behalten/);
    assert.match(lunchDemo("es").breakEven.label, /Clientes más al mediodía/);
    assert.match(lunchDemo("pl").worstCase.plain, /546\s€/);
    assert.match(lunchDemo("de").facts[0]!.label, /Mehrwertsteuer auf Speisen/);
    assert.match(planTest(lunchDemo("de")).decisionRule.keep, /^Im Schnitt 7 oder mehr zusätzliche Mittagsgäste pro Tag/);
    assert.match(compareResult(lunchDemo("es"), { baseline_lunch_customers: 38, test_lunch_customers: 50, redemptions_per_day: 23 }).plain, /mantener el menú/);
  });

  test("plural forms: Polish one / few / many", () => {
    const pl = (x: number) => analyze("lunch_offer", { ...demoInputs("lunch_offer"), extra_low: x, extra_likely: x, extra_high: x + 1 }, { lang: "pl", createdAt: T }).scenarios[0]!.assumptionText;
    assert.equal(pl(1), "1 dodatkowy klient w porze lunchu dziennie");
    assert.equal(pl(3), "3 dodatkowi klienci w porze lunchu dziennie");
    assert.equal(pl(5), "5 dodatkowych klientów w porze lunchu dziennie");
    assert.equal(pl(22), "22 dodatkowi klienci w porze lunchu dziennie");
  });

  test("no placeholders, NaN or undefined left in any language", () => {
    for (const l of LANGS) {
      const objs: unknown[] = [lunchDemo(l), priceDemo(l), planTest(lunchDemo(l)), planTest(priceDemo(l)), getTemplate("lunch_offer", l), getTemplate("price_change", l), berlinFacts(l)];
      objs.push(compareResult(lunchDemo(l), { baseline_lunch_customers: 38, test_lunch_customers: 44, redemptions_per_day: 15 }));
      objs.push(compareResult(priceDemo(l), { units_before_per_week: 620, units_after_per_week: 590 }));
      objs.push(whatChanged(lunchDemo(l), analyze("lunch_offer", { ...demoInputs("lunch_offer"), offer_price: 10.5, setup_cost: 250, vat_rate: 0.07 }, { lang: l, demo: true })));
      const text = JSON.stringify(objs);
      assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, `${l}: an unfilled {placeholder}`);
      assert.doesNotMatch(text, /\bNaN\b|\bundefined\b|Infinity/, `${l}: NaN or undefined`);
      assertMaths(objs, l, 50);
    }
  });

  test("analyze defaults to English for old call sites", () => {
    lunchDemo("de");
    assert.equal(analyze("lunch_offer", demoInputs("lunch_offer"), { demo: true }).lang, "en");
    assert.equal(analyze("lunch_offer", demoInputs("lunch_offer"), { demo: true, lang: "Deutsch" }).lang, "de");
  });
});

describe("Berlin facts", () => {
  const byId = (id: string, lang: Lang = "en") => berlinFacts(lang).find((f) => f.id === id)!;

  test("six dated, sourced facts, each linked to the document itself (a path, not a home page)", () => {
    assert.deepEqual(BERLIN_FACTS.map((f) => f.id), ["vat_food_7", "vat_drinks_19", "vat_milk_takeaway_7", "bmf_drinks_share_30", "min_wage_2026", "min_wage_2027"]);
    for (const f of BERLIN_FACTS) {
      const u = new URL(f.url);
      assert.equal(u.protocol, "https:");
      assert.ok(u.pathname.length > 1, `${f.id}: ${f.url} opens the cited text, not a home page`);
      assert.match(f.asOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(f.source.length > 10 && f.label.length > 5 && f.value.length > 1);
    }
  });

  test("VAT links to § 12 UStG and Anlage 2, the minimum wage to the MiLoV5, the 30% drinks share to the BMF letter", () => {
    for (const id of ["vat_food_7", "vat_drinks_19"]) assert.equal(byId(id).url, "https://www.gesetze-im-internet.de/ustg_1980/__12.html");
    assert.equal(byId("vat_milk_takeaway_7").url, "https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html");
    assert.match(byId("vat_milk_takeaway_7").source, /§ 12 Abs\. 2 Nr\. 1 UStG mit Anlage 2/);
    for (const id of ["min_wage_2026", "min_wage_2027"]) {
      assert.equal(byId(id).url, "https://www.gesetze-im-internet.de/milov5/BJNR10C0A0025.html");
      assert.match(byId(id).source, /Fünfte Mindestlohnanpassungsverordnung \(MiLoV5\)/);
    }
    const bmf = byId("bmf_drinks_share_30");
    assert.equal(bmf.source, "Bundesministerium der Finanzen, BMF-Schreiben vom 22.12.2025");
    assert.equal(bmf.asOf, "2025-12-22");
    assert.match(new URL(bmf.url).pathname, /2025-12-22-verpflegungsdienstleistungen\.pdf$/);
    assert.match(byId("min_wage_2026").value, /€13\.90/);
    assert.match(byId("min_wage_2027").value, /€14\.60.*2027/);
    assert.match(byId("min_wage_2026", "de").value, /13,90 €/);
  });

  test("milk drinks: every language puts the 7% rate on take-away only, never on drinks in the café", () => {
    const words: Record<Lang, { milk: RegExp; cafe: RegExp; away: RegExp }> = {
      en: { milk: /milk/i, cafe: /in the café/i, away: /take[- ]away/i },
      de: { milk: /milch/i, cafe: /im Café/i, away: /zum Mitnehmen/i },
      es: { milk: /leche/i, cafe: /en el local/i, away: /para llevar/i },
      pl: { milk: /mlek|mlecz/i, cafe: /na miejscu/i, away: /na wynos/i },
    };
    const seven = /(^|[^\d.,])7\s?%/;
    for (const l of LANGS) {
      const w = words[l];
      const msg = (k: string) => engineMessage(k as never, { value: "19%", item: "flat white", vat: "19%" }, l);
      // The four places that state the milk-drink rule each name take-away.
      for (const k of ["f.price.vat_rate.ask", "note.vatPrice", "price.q.vat", "fact.vat_milk_takeaway_7.label"]) {
        assert.match(msg(k), w.milk, `${l} ${k} talks about milk drinks`);
        assert.match(msg(k), w.away, `${l} ${k} names take-away`);
      }
      assert.match(msg("fact.vat_drinks_19.label"), w.cafe, `${l}: the drinks fact says milk drinks in the café are 19%`);
      // Every clause of the price analysis, plan, template and facts: milk at 7% only with take-away, never with the café.
      const texts = strings([priceDemo(l), planTest(priceDemo(l)), getTemplate("price_change", l), berlinFacts(l), lunchDemo(l)]);
      for (const text of texts)
        for (const clause of text.split(/[.;!?](?:\s|$)|[()]/)) {
          if (!w.milk.test(clause)) continue;
          if (seven.test(clause)) assert.match(clause, w.away, `${l}: "${clause}" puts milk drinks at 7% without saying take-away`);
          if (w.cafe.test(clause)) assert.doesNotMatch(clause, seven, `${l}: "${clause}" puts milk drinks in the café at 7%`);
        }
    }
  });
});

// ---------------------------------------------------------------------------
// The price demo answers its own wage question (1 Jan 2027: €13.90 → €14.60)
// ---------------------------------------------------------------------------
describe("price change and the 2027 minimum wage", () => {
  const withHours = (patch: RawInputs = {}, lang?: Lang) =>
    analyze("price_change", { ...demoInputs("price_change", "en"), ...patch }, { demo: true, createdAt: T, ...(lang ? { lang } : {}) });

  test("demo: 60 h a week at the minimum wage; the rise costs 60 × €0.70 = €42 in wages, €50.82 with ~21% employer contributions; the 30 cents bring €91.02", () => {
    assert.equal(demoInputs("price_change").minimum_wage_hours_per_week, 60);
    const a = priceDemo();
    const w = a.wageRise!;
    assert.deepEqual([w.hoursPerWeek, w.risePerHour, w.wageWeek, w.employerShare, w.costWeek, w.gainWeek, w.leftWeek, w.covers], [60, 0.7, 42, 0.21, 50.82, 91.02, 40.2, true]);
    assert.equal(w.gainWeek, scen(a, "expected").figures.find((f) => f.id === "delta_week")!.value, "the gain is the expected scenario's weekly difference");
    assert.equal(fig(a, "min_wage_rise_week").value, 50.82);
    assert.equal(
      fig(a, "min_wage_rise_week").maths,
      "From 1 January 2027 the minimum wage rises from €13.90 to €14.60 an hour: €14.60 − €13.90 = €0.70 more an hour. 60 staff hours a week × €0.70 = €42.00 a week in wages; with about 21% employer contributions on top (a guess; Minijobs cost more) = €50.82 a week.",
    );
    assert.equal(fig(a, "left_after_wage_rise_week").maths, "+€91.02 a week from the new price − €50.82 for the wage rise = +€40.20 a week. Both at your likely guess (−4% sales).");
    assert.match(w.plain, /the rise of 30 cents brings about €91 a week/);
    assert.match(w.plain, /€42 a week in wages for 60 staff hours, about €51 with employer contributions \(a guess: about 21%\)/);
    assert.match(w.plain, /covers the wage rise, with about €40 a week to spare/);
    assert.match(w.plain, /The rise comes either way; the decision is only about the price\./);
    assert.ok(a.lessons[0]!.startsWith(w.plain), "the wage answer is the first lesson");
    assert.deepEqual(a.facts.map((f) => f.id), ["vat_drinks_19", "vat_milk_takeaway_7", "vat_food_7", "min_wage_2026", "min_wage_2027"]);
    assert.equal(wageRiseCheck(a), w);
  });

  test("the shipped report demo (+20 cents): €43.40 a week against €50.82 with contributions, so the price covers only part of the rise", () => {
    const a = withHours({ new_price: 4.1 });
    assert.deepEqual([a.wageRise!.gainWeek, a.wageRise!.wageWeek, a.wageRise!.costWeek, a.wageRise!.leftWeek, a.wageRise!.covers], [43.4, 42, 50.82, -7.42, false]);
    assert.match(a.wageRise!.plain, /the rise of 20 cents brings about €43 a week/);
    assert.match(a.wageRise!.plain, /covers only part of the wage rise: about €7\.42 a week is still missing/);
    const de = withHours({ new_price: 4.1 }, "de");
    assert.match(de.wageRise!.plain, /bringt die Erhöhung um 20 Cent etwa 43\s€ pro Woche/);
    assert.match(de.wageRise!.maths, /60 Personalstunden pro Woche × 0,70\s€ = 42,00\s€ Lohn pro Woche; mit etwa 21\s%\s?Arbeitgeberanteil/);
    assert.match(de.wageRise!.maths, /\+43,40\s€ pro Woche durch den neuen Preis − 50,82\s€ für die Lohnerhöhung = −7,42\s€ pro Woche/);
  });

  test("short and none: more hours than the price covers, and a price that brings nothing", () => {
    const short = withHours({ minimum_wage_hours_per_week: 200 }).wageRise!;
    assert.deepEqual([short.wageWeek, short.costWeek, short.leftWeek, short.covers], [140, 169.4, -78.38, false]);
    assert.match(short.plain, /covers only part of the wage rise: about €78 a week is still missing/);
    const none = withHours({ new_price: 3.6, volume_low: -0.02, volume_likely: 0, volume_high: 0.02 }).wageRise!;
    assert.ok(none.gainWeek < 0 && !none.covers);
    assert.match(none.plain, /brings no extra money \(−€\d+ a week\), so it does nothing towards the minimum-wage rise/);
  });

  test("without the hours: no wage line, no minimum-wage facts, no extra figures", () => {
    const d = { ...demoInputs("price_change") } as RawInputs;
    delete d.minimum_wage_hours_per_week;
    for (const raw of [d, { ...d, minimum_wage_hours_per_week: 0 }]) {
      const a = analyze("price_change", raw, { demo: true, createdAt: T });
      assert.equal(a.wageRise, undefined);
      assert.equal(wageRiseCheck(a), undefined);
      assert.ok(!a.current.some((f) => f.id === "min_wage_rise_week"));
      assert.ok(!a.facts.some((f) => f.id.startsWith("min_wage")));
    }
  });

  test("wageRiseCheck recomputes for an older saved analysis, in its own language and currency", () => {
    const de = withHours({}, "de");
    const { wageRise, ...old } = de;
    analyze("lunch_offer", demoInputs("lunch_offer"), { lang: "en", currency: "GBP" });
    assert.deepEqual(wageRiseCheck(old as Analysis), wageRise);
  });

  test("every wage sum checks out in every language; changing the hours explains itself", () => {
    for (const l of LANGS) {
      const a = withHours({}, l);
      assertMaths([a.wageRise!.maths, fig(a, "min_wage_rise_week").maths, fig(a, "left_after_wage_rise_week").maths], l, 4);
      assert.doesNotMatch(JSON.stringify(a.wageRise), /\{[a-zA-Z]+\}|NaN|undefined/);
    }
    const c = whatChanged(withHours(), withHours({ minimum_wage_hours_per_week: 40 }));
    assert.equal(c.changes[0]!.key, "minimum_wage_hours_per_week");
    assert.deepEqual([c.changes[0]!.fromText, c.changes[0]!.toText], ["60 hours a week", "40 hours a week"]);
    assert.match(c.plain[0]!, /from 60 staff hours to 40 staff hours a week, so the wage rise from 1 January 2027 costs €28 a week instead of €42/);
  });
});

// ---------------------------------------------------------------------------
// Plain words for edge cases: low wages, nobody to switch, a test that cannot lose
// ---------------------------------------------------------------------------
describe("plain words for edge cases", () => {
  test("a staff hour below the minimum wage gets a warning, and the minimum wage joins the facts", () => {
    const low = analyze("lunch_offer", { ...demoInputs("lunch_offer"), staff_hourly_cost: 10 }, { createdAt: T });
    assert.ok(low.warnings.some((w) => /€10\.00 is below the statutory minimum wage of €13\.90 an hour \(since 1 January 2026; €14\.60 from 1 January 2027\)/.test(w)));
    assert.ok(low.warnings.some((w) => /Check your number/.test(w)));
    assert.ok(low.facts.some((f) => f.id === "min_wage_2026"));
    const de = analyze("lunch_offer", { ...demoInputs("lunch_offer"), staff_hourly_cost: 10 }, { createdAt: T, lang: "de" });
    assert.ok(de.warnings.some((w) => /unter dem gesetzlichen Mindestlohn von 13,90\s€ pro Stunde/.test(w)));
    for (const rate of [13.9, 18]) {
      const ok = analyze("lunch_offer", { ...demoInputs("lunch_offer"), staff_hourly_cost: rate }, { createdAt: T });
      assert.ok(!ok.warnings.some((w) => /minimum wage/.test(w)), `€${rate} an hour: no warning`);
    }
  });

  test("no lunch customers: no 'every regular who switches costs you money', and the lesson says nobody switches", () => {
    const b = analyze("lunch_offer", { ...demoInputs("lunch_offer"), lunch_customers: 0 }, { createdAt: T });
    assert.ok(!b.warnings.some((w) => /every regular who switches costs you money/.test(w)));
    assert.ok(b.lessons.some((l) => /no lunch regular switches to the deal, so switching costs you nothing/.test(l)));
    assert.doesNotMatch(JSON.stringify(b), /about 0 of them/);
  });

  test("the /try placeholders (switching is a gain): never an alarm, never '− −', never 'lowers … by €0.00'", () => {
    const raw: RawInputs = { weekday_customers: 140, avg_spend: 7.4, lunch_customers: 38, offer_price: 9.9, offer_cost: 3.6, extra_likely: 8 };
    for (const l of LANGS) {
      const a = analyze("lunch_offer", raw, { createdAt: T, lang: l });
      const p = planTest(a);
      assert.ok(a.worstCase.value > 0);
      assert.equal(a.breakEven.value, 0);
      const text = strings([a, p]).join("\n");
      assert.doesNotMatch(text, /−\s*−|\+\s*−|--/, `${l}: a double sign`);
      assert.doesNotMatch(strings([p.measure, p.costCap, p.checkIns]).join("\n"), /€0\.00|\b0,00\s?€|(^|[^\d.,])0\s?€|€0(?![\d.,])/, `${l}: a zero amount in words`);
      assertMaths([a, p], l, 10);
    }
    const en = analyze("lunch_offer", raw, { createdAt: T });
    assert.match(en.worstCase.plain, /^Even if nobody new comes, the test does not lose money \(it ends about €100 up\)/);
    assert.match(en.sensitivity.points[8]!.explanation, /8 × €5\.35 per deal \+ €10\.03 a day left from regulars who switch after running costs = \+€52\.83 a day/);
    assert.match(en.sensitivity.points[8]!.explanation, /No extra customers are needed/);
    assert.match(planTest(en).measure[2]!.how, /each one leaves you about €0\.88 more than their usual lunch/);
    assert.match(planTest(en).costCap, /^The test costs you nothing in cash/);
  });

  test("a free test with nobody switching says so, without claiming a gain", () => {
    const b = analyze("lunch_offer", { ...demoInputs("lunch_offer"), switch_share: 0, setup_cost: 0, marketing_per_week: 0, extra_staff_hours_per_day: 0 }, { createdAt: T });
    assert.equal(b.worstCase.value, 0);
    assert.match(b.worstCase.plain, /does not lose money: it has no setup, staff or promotion costs/);
    assert.match(b.breakEven.ongoing!.plain, /it has no daily costs/);
    assert.ok(b.lessons.some((l) => /costs nothing to run/.test(l)));
    const p = planTest(b);
    assert.match(p.decisionRule.keep, /it has no daily costs/);
    assert.match(p.costCap, /^The test costs you nothing:/);
    assert.doesNotMatch(JSON.stringify([b, p]), /leave you more than their usual lunch|€0\.00 a day more/);
  });

  test("words match their numbers: 'what you keep' for a margin, 'VAT included' on the till, the blend named", () => {
    const a = lunchDemo(), p = planTest(a);
    assert.match(p.costCap, /lower what you keep by about €13\.57 a day/);
    assert.match(p.measure[2]!.how, /each one lowers what you keep by about €1\.19/);
    assert.doesNotMatch(JSON.stringify(p), /takings by/);
    assert.match(scen(a, "expected").figures.find((f) => f.id === "revenue_change_day")!.label, /VAT included, before costs/);
    assert.match(fig(lunchDemo("de"), "weekday_left_month").maths, /Die 10,6\s% sind Ihre Mischung beim Mittagessen/);
    assert.match(scen(lunchDemo("de"), "expected").figures.find((f) => f.id === "revenue_change_day")!.label, /mit Mehrwertsteuer, vor Kosten/);
    // A VAT change too small to show is "stays", not "9.7% (60) instead of 9.7% (60)".
    const before = analyze("price_change", demoInputs("price_change", "en"), { demo: true, createdAt: T });
    const c = whatChanged(before, analyze("price_change", { ...demoInputs("price_change", "en"), vat_rate: 0.16 }, { demo: true, createdAt: T }));
    assert.deepEqual(c.changes.map((x) => x.key), ["vat_rate"]);
    assert.match(c.plain[0]!, /break-even stays at −9\.7%/);
    assert.doesNotMatch(c.plain[0]!, /instead of 9\.7% \(60\)/);
  });

  test("proper singulars and plurals: 1 extra customer, 1 zusätzlicher Gast, 1 cliente, 1 dodatkowy klient", () => {
    const raw: RawInputs = { ...demoInputs("lunch_offer"), switch_share: 0, setup_cost: 0, extra_staff_hours_per_day: 0, marketing_per_week: 5, extra_low: 0, extra_likely: 1, extra_high: 2 };
    const bad: Record<Lang, RegExp> = {
      en: /\b1 (extra (lunch )?)?customers\b|\b1 sales\b/,
      de: /\b1 zusätzliche (Mittags)?[gG]äste\b|\b1 zusätzlichen (Mittags)?[gG]ästen\b|\b1 Mittagsgäste\b|\b1 Verkäufe\b/,
      es: /\b1 clientes\b|\b1 ventas\b/,
      pl: /\b1 dodatkowych\b|\b1 klientów\b/,
    };
    for (const l of LANGS) {
      const a = analyze("lunch_offer", raw, { createdAt: T, lang: l });
      assert.equal(a.breakEven.value, 1);
      assert.equal(a.breakEven.ongoing!.value, 1);
      const r = compareResult(a, { baseline_lunch_customers: 38, test_lunch_customers: 39, redemptions_per_day: 1 });
      const text = strings([a, planTest(a), r]).join("\n");
      assert.doesNotMatch(text, bad[l], `${l}: a plural after 1`);
      assertMaths([a, planTest(a)], l, 10);
    }
    assert.match(analyze("lunch_offer", raw, { createdAt: T, lang: "de" }).breakEven.maths, /aufgerundet 1 zusätzlicher Gast pro Tag/);
  });

  test("seeded: no '− −', '--' or '+−' anywhere, in any language, for lunch and price (switching gains included)", () => {
    const rand = rng(1717);
    const between = (lo: number, hi: number, dp = 2) => Math.round((lo + rand() * (hi - lo)) * 10 ** dp) / 10 ** dp;
    const DOUBLE = /−\s*−|\+\s*−|--/;
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const lang = LANGS[i % 4]!;
      const offer = between(6, 14, 1);
      const raw: RawInputs = {
        weekday_customers: 150,
        avg_spend: between(4, 12),
        lunch_customers: Math.round(between(0, 60, 0)),
        offer_price: offer,
        offer_cost: between(1, Math.max(1.1, offer / 1.106 - 0.5)),
        extra_likely: Math.round(between(0, 12, 0)),
        ...(rand() < 0.5 ? {} : { lunch_spend: between(5, 14) }),
        ...(rand() < 0.5 ? {} : { setup_cost: Math.round(between(0, 300, 0)) }),
        ...(rand() < 0.5 ? {} : { extra_staff_hours_per_day: 1, staff_hourly_cost: between(10, 20) }),
        ...(rand() < 0.5 ? {} : { marketing_per_week: Math.round(between(0, 50, 0)) }),
      };
      const a = analyze("lunch_offer", raw, { createdAt: T, lang });
      const after = analyze("lunch_offer", { ...raw, offer_price: offer + 0.5, lunch_customers: 20 }, { createdAt: T, lang });
      const objs = [a, planTest(a), compareResult(a, { baseline_lunch_customers: 30, test_lunch_customers: 28 + (i % 6), redemptions_per_day: 9 }), whatChanged(a, after)];
      assert.doesNotMatch(strings(objs).join("\n"), DOUBLE, `lunch case ${i} (${lang})`);
      assertMaths(objs, lang, 10);
      const cur = between(1.5, 5);
      const pr: RawInputs = {
        item: "Cappuccino",
        current_price: cur,
        new_price: Math.max(0.5, Math.round((cur + between(-0.5, 0.8)) * 100) / 100),
        units_per_week: 300,
        unit_cost: between(0.3, 1.2),
        volume_likely: between(-0.1, 0.05),
        minimum_wage_hours_per_week: Math.round(between(0, 80, 0)),
      };
      const check = checkInputs("price_change", pr, { lang });
      if (!check.ready) continue; // same price, or a new price at or below cost: refused in words (tested above)
      const p = analyze("price_change", pr, { createdAt: T, lang });
      const objsP = [p, planTest(p), compareResult(p, { units_before_per_week: 300, units_after_per_week: 280 }), whatChanged(p, analyze("price_change", { ...pr, minimum_wage_hours_per_week: 30 }, { createdAt: T, lang }))];
      assert.doesNotMatch(strings(objsP).join("\n"), DOUBLE, `price case ${i} (${lang})`);
      assertMaths(objsP, lang, 5);
      checked++;
    }
    assert.ok(checked >= 20, `${checked} price cases checked`);
  });

  test("today's price below cost: the weekly difference adds today's loss instead of subtracting a negative", () => {
    const b = analyze("price_change", { ...demoInputs("price_change"), current_price: 1.0, new_price: 2.0, unit_cost: 0.95 }, { createdAt: T });
    const dw = scen(b, "expected").figures.find((f) => f.id === "delta_week")!.maths;
    assert.match(dw, /\+ €68\.20 you lose now = /);
    assert.doesNotMatch(JSON.stringify(b), /−\s*−/);
    assertMaths([b], "en", 10);
  });
});

// ---------------------------------------------------------------------------
// Two numbers, the same words everywhere (src/i18n/terms.ts)
// ---------------------------------------------------------------------------
describe("two numbers: pays back the test (11) and pays its way, to keep it (7)", () => {
  /** The shared phrase's words in order, so German word order ("holt das Angebot den Test herein") still counts. */
  const inOrder = (phrase: string) => new RegExp(phrase.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"), "i");

  test("the break-even card, first lesson, keep rule and plan use the shared words in every language", () => {
    for (const l of LANGS) {
      const a = lunchDemo(l), p = planTest(a);
      const back = inOrder(TERMS[l].payBackTest), way = inOrder(TERMS[l].paysItsWay);
      assert.match(a.breakEven.plain, back, `${l}: break-even says "${TERMS[l].payBackTest}"`);
      assert.match(a.breakEven.plain, way, `${l}: break-even says "${TERMS[l].paysItsWay}"`);
      assert.ok(a.breakEven.plain.indexOf("11") < a.breakEven.plain.indexOf(" 7 "), `${l}: 11 first, then 7`);
      assert.match(a.lessons[0]!, back);
      assert.match(a.lessons[0]!, way);
      assert.match(p.decisionRule.keep, back, `${l}: the keep rule names paying back the test as the second line`);
      assert.match(p.plain, way);
    }
  });

  test("German owner text says Gewinnschwelle, never Break-even", () => {
    const all = JSON.stringify([lunchDemo("de"), planTest(lunchDemo("de")), priceDemo("de"), planTest(priceDemo("de"))]);
    assert.doesNotMatch(all, /break-even/i);
    for (const [k, v] of Object.entries(ENGINE_MESSAGES.de as Record<string, unknown>)) if (typeof v === "string") assert.doesNotMatch(v, /break-even/i, k);
    assert.match(all, /Gewinnschwelle/);
  });
});

// ---------------------------------------------------------------------------
// Property test: random valid cafés
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("random valid inputs (seeded)", () => {
  const rand = rng(20261017);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const between = (lo: number, hi: number, dp = 2) => Math.round((lo + rand() * (hi - lo)) * 10 ** dp) / 10 ** dp;
  const vats = [undefined, 0, 0.07, 0.106, 0.19];

  test("lunch: 60 cafés — no NaN, sums check out, worst case ≤ every scenario, verdict = card", () => {
    for (let i = 0; i < 60; i++) {
      const vat = pick(vats);
      const offer = between(6, 14, 1);
      const net = offer / (1 + (vat ?? 0.106));
      const wc = Math.round(between(40, 400, 0));
      const low = Math.round(between(0, 10, 0)), likely = low + Math.round(between(0, 10, 0)), high = likely + Math.round(between(1, 15, 0));
      const raw: RawInputs = {
        weekday_customers: wc, avg_spend: between(3, 15), variable_cost_share: between(0.2, 0.45), monthly_fixed_costs: Math.round(between(5000, 40000, 0)),
        lunch_customers: Math.round(between(0, Math.min(wc, 120), 0)), lunch_spend: between(6, 16), cash_buffer: Math.round(between(0, 5000, 0)),
        offer_price: offer, offer_cost: between(1.5, Math.max(1.6, net - 0.5)), setup_cost: Math.round(between(0, 600, 0)),
        extra_staff_hours_per_day: pick([0, 0.5, 1, 2, 3]), staff_hourly_cost: between(13.9, 25), marketing_per_week: Math.round(between(0, 80, 0)),
        test_days: Math.round(between(5, 20, 0)), extra_low: low, extra_likely: likely, extra_high: high, switch_share: between(0, 0.8), kiez: pick([...BERLIN_KIEZE]),
        ...(vat === undefined ? {} : { vat_rate: vat }),
      };
      const lang = pick(LANGS);
      const a = analyze("lunch_offer", raw, { lang, createdAt: T });
      const p = planTest(a);
      const text = JSON.stringify([a, p]);
      assert.doesNotMatch(text, /\bNaN\b|\bundefined\b|Infinity|\{[a-zA-Z]+\}/, `case ${i}`);
      for (const s of a.scenarios) assert.ok(a.worstCase.value <= s.netTest + 1e-9, `case ${i}: worst ≤ ${s.id}`);
      assertMaths([a, p], lang, 10);
      if (p.rule) {
        assert.ok(p.rule.keepFrom >= 0 && p.rule.tweakFrom >= 0 && p.rule.tweakFrom <= p.rule.keepFrom);
        for (const x of [0, p.rule.tweakFrom - 0.5, p.rule.tweakFrom, p.rule.keepFrom - 0.1, p.rule.keepFrom, p.rule.keepFrom + 3]) {
          if (x < 0) continue;
          const r = compareResult(a, { baseline_lunch_customers: 40, test_lunch_customers: 40 + x, redemptions_per_day: x });
          assert.equal(r.verdict, verdictFor(p.rule, Math.round(x * 100) / 100), `case ${i}, x = ${x}`);
        }
      }
      if (lang === "en") assert.doesNotMatch(text, /\b(\d+(?:\.\d+)?%?) (?:or|to) \1\b/, `case ${i}: 'X or X'`);
    }
  });

  test("price: 60 items — no NaN, sums check out, worst case ≤ every scenario, verdict = card", () => {
    for (let i = 0; i < 60; i++) {
      const vat = pick(vats);
      const cur = between(2, 6);
      const nw = Math.max(0.5, Math.round((cur + pick([-1, 1]) * between(0.1, 1)) * 100) / 100);
      if (Math.abs(nw - cur) < 0.01) continue;
      const netNew = nw / (1 + (vat ?? 0.19));
      if (netNew < 0.6) continue;
      const lo = between(-0.4, 0.1), li = Math.min(0.3, lo + between(0, 0.15)), hi = Math.min(0.4, li + between(0, 0.15));
      const raw: RawInputs = {
        item: pick(["flat white", "Cappuccino", "Croissant", "Brownie"]), current_price: cur, new_price: nw, units_per_week: Math.round(between(50, 1500, 0)),
        unit_cost: between(0.3, Math.max(0.35, netNew - 0.2)), volume_low: lo, volume_likely: li, volume_high: hi, test_days: Math.round(between(7, 28, 0)),
        ...(vat === undefined ? {} : { vat_rate: vat }),
      };
      const lang = pick(LANGS);
      const a = analyze("price_change", raw, { lang, createdAt: T });
      const p = planTest(a);
      const text = JSON.stringify([a, p]);
      assert.doesNotMatch(text, /\bNaN\b|\bundefined\b|Infinity|\{[a-zA-Z]+\}/, `case ${i}`);
      for (const s of a.scenarios) assert.ok(a.worstCase.value <= s.netTest + 1e-9, `case ${i}: worst ≤ ${s.id}`);
      assertMaths([a, p], lang, 10);
      if (p.rule) {
        const units = raw.units_per_week as number;
        assert.ok(p.rule.keepFrom >= 0 && p.rule.tweakFrom >= 0);
        for (const u of [p.rule.tweakFrom - 0.5, p.rule.tweakFrom, p.rule.keepFrom - 0.5, p.rule.keepFrom, units]) {
          if (u < 0) continue;
          assert.equal(compareResult(a, { units_before_per_week: units, units_after_per_week: u }).verdict, verdictFor(p.rule, u), `case ${i}, ${u} a week`);
        }
      }
    }
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
