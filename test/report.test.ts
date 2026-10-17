import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { Analysis, TestPlan, TestResult } from "../src/engine/types.ts";
import { renderReport, reportStyles, reportTokens, STEPS } from "../src/report/index.ts";
import type { ReportInput } from "../src/report/index.ts";
import type { RehearsalSummary } from "../src/sim/types.ts";

/* ------------------------------------------------------------------ */
/* Hand-made fixture (independent of the engine and sim implementations) */
/* ------------------------------------------------------------------ */

const points = Array.from({ length: 21 }, (_, x) => ({
  x,
  netTest: Math.round((x * 6.3 * 10 - 18 * 10 - 25 * 2 - 180 - 30) * 100) / 100,
  netMonth: Math.round((x * 6.3 - 18 - 5 - 3) * 21.7 * 100) / 100,
  explanation: `At ${x} extra customers a day, each leaves €6.30, so the test nets this much.`,
}));

export function fixtureAnalysis(over: Partial<Analysis> = {}): Analysis {
  return {
    id: "a-fixture",
    template: "lunch_offer",
    createdAt: "2026-10-17T10:00:00.000Z",
    business: "Café Fixture",
    question: "What if I run a weekday lunch offer?",
    demo: true,
    currency: "EUR",
    inputs: [
      { key: "weekday_customers", label: "Customers on an average weekday", value: 140, unit: "customers/day", source: "owner", kind: "fact", why: "Sets the size of your business today." },
      { key: "avg_spend", label: "Average spend per customer", value: 7.4, unit: "EUR", source: "demo", kind: "fact", why: "Gives your normal takings." },
      { key: "offer_price", label: "Price of the lunch deal", value: 9.9, unit: "EUR", source: "owner", kind: "choice", why: "Price minus ingredients is what each deal earns." },
      { key: "test_days", label: "Length of the test", value: 10, unit: "days", source: "assumption", kind: "choice", why: "Long enough to see a pattern.", note: "You did not say, so What-IF used 10 days." },
      { key: "extra_likely", label: "Extra lunch customers a day: your likely guess", value: 8, unit: "customers/day", source: "assumption", kind: "assumption", why: "Everything depends on this guess." },
      { key: "switch_share", label: "Share of regulars who switch", value: 0.3, unit: "share", source: "assumption", kind: "assumption", why: "Switching regulars earn you less." },
    ],
    current: [{ id: "takings_day", label: "Weekday takings today", value: 1036, unit: "EUR/day", source: "calculation", maths: "140 × €7.40 = €1,036 a day" }],
    scenarios: (["cautious", "expected", "optimistic"] as const).map((id, i) => {
      const x = [3, 8, 15][i]!;
      const p = points[x]!;
      return {
        id,
        label: id[0]!.toUpperCase() + id.slice(1),
        assumptionLabel: "Extra lunch customers a day",
        assumptionValue: x,
        assumptionUnit: "customers/day" as const,
        figures: [{ id: `${id}-net`, label: "Net over the test", value: p.netTest, unit: "EUR" as const, source: "calculation" as const, maths: `${x} × €6.30 × 10 − costs = ${p.netTest}` }],
        netTest: p.netTest,
        netMonth: p.netMonth,
        plain: `With ${x} extra customers a day the test ${p.netTest >= 0 ? "makes" : "loses"} money.`,
      };
    }),
    breakEven: { value: 7, unit: "customers/day", label: "Extra lunch customers a day to pay back the test", maths: "(€180 + 10 × €43) ÷ 10 ÷ €6.30 = 6.8 → 7", plain: "The deal needs 7 extra lunch customers a day.", reachable: true },
    worstCase: { value: -640, maths: "0 × €6.30 − €43 × 10 − €180 = −€640", plain: "If nobody new comes, the test costs €640.", shareOfCash: 0.43 },
    biggestUncertainty: {
      key: "extra_likely",
      label: "Extra lunch customers a day (3 to 15)",
      swing: 756,
      plain: "Whether you get 3 or 15 extra customers changes the result by €756.",
      ranking: [
        { key: "extra_likely", label: "Extra lunch customers a day (3 to 15)", swing: 756 },
        { key: "switch_share", label: "Regulars who switch (10% to 50%)", swing: 310 },
      ],
    },
    sensitivity: { key: "extra_likely", label: "Extra lunch customers a day", unit: "customers/day", current: 8, breakEvenX: 7, points },
    lessons: ["Break-even is 7 extra customers a day; your guess is 8, so it is close."],
    nextQuestions: ["What if the deal were €10.50?"],
    warnings: ["Your guess is only just above break-even."],
    ...over,
  };
}

const plan: TestPlan = {
  analysisId: "a-fixture",
  title: "Two-week lunch deal test",
  days: 10,
  before: ["Count lunch customers for a week before you start."],
  during: ["Tally every deal sold."],
  measure: [{ what: "Lunch customers a day", how: "Till count 11:30–14:30" }],
  checkIns: [{ day: 5, look: "Are you on track for 7 a day?" }],
  decisionRule: { keep: "8 or more a day.", tweak: "5 to 7 a day.", stop: "Fewer than 5 a day." },
  costCap: "Stop if the test has cost €640.",
  plain: "Run the deal for two weeks and count.",
};

const personas: RehearsalSummary["personas"] = ["Mia", "Jonas", "Aylin", "Herr Braun"].map((name, i) => ({
  id: `p${i + 1}`,
  name,
  segment: (["student", "office_worker", "parent", "retiree"] as const)[i]!,
  segmentLabel: ["Student", "Office worker", "Parent", "Retiree"][i]!,
  age: [21, 34, 39, 71][i]!,
  routine: "Lunch around 12:30.",
  usualSpend: [7.5, 11, 9, 8][i]!,
  priceSensitivity: (["high", "low", "medium", "medium"] as const)[i]!,
  relationship: (["occasional", "new", "regular", "regular"] as const)[i]!,
  channels: ["word of mouth"],
  alternatives: "The bakery next door.",
  quirk: "Always asks for oat milk.",
  represents: "price-conscious students nearby",
  attitude: (["fan", "neutral", "sceptical", "fan"] as const)[i]!,
  activityLevel: 0.8,
  story: "A made-up person who remembers your café's cinnamon buns.",
}));

export function fixtureRehearsal(over: Partial<RehearsalSummary> = {}): RehearsalSummary {
  const rounds = [1, 2, 3, 4].map((n) => ({ n, title: `Round ${n} title`, situation: "Lunchtime on a weekday.", actions: [] }));
  const grid: RehearsalSummary["grid"] = [];
  for (const p of personas)
    for (const r of [1, 2, 3, 4])
      grid.push({ personaId: p.id, round: r, action: r === 2 && p.id === "p3" ? "not_around" : "try", actionLabel: r === 2 && p.id === "p3" ? "Not around" : "Tried the deal", positive: !(r === 2 && p.id === "p3"), thought: `${p.name} thinks about round ${r}.` });
  return {
    id: "r-fixture",
    analysisId: "a-fixture",
    business: "Café Fixture",
    question: "What if I run a weekday lunch offer?",
    change: "Lunch deal: soup, sandwich and drink for €9.90",
    status: "done",
    method: "rule-based",
    personas,
    rounds,
    grid,
    perRound: rounds.map((r) => ({ round: r.n, title: r.title, counts: [{ action: "try", label: "Tried the deal", count: 3 }] })),
    funnel: [
      { label: "Noticed it", count: 4, of: 4 },
      { label: "Tried it", count: 3, of: 4 },
    ],
    quotes: [{ personaId: "p1", name: "Mia", round: 2, text: "Cheaper than the bakery!" }],
    questionsForOwner: ["Is there a vegan option?"],
    feed: [
      { round: 1, name: "Café Fixture", text: "New: lunch deal €9.90", kind: "post" },
      { round: 2, personaId: "p1", name: "Mia", text: "Told Jonas about it.", kind: "word_of_mouth" },
    ],
    events: [{ beforeRound: 3, text: "Rain all week" }],
    links: [{ from: "p1", to: "p2", round: 2 }],
    uptake: [1, 2, 3, 4].map((round) => ({ round, engaged: round === 2 ? 3 : 4, active: round === 2 ? 3 : 4 })),
    interviews: [{ question: "Would you come back?", answers: [{ personaId: "p1", name: "Mia", answer: "Yes, on Fridays.", method: "rule-based" }] }],
    checkWithRealCustomers: ["Ask five students whether €9.90 feels fair."],
    caveat: "These are imagined customers, not data.",
    ...over,
  };
}

const result: TestResult = {
  analysisId: "a-fixture",
  recordedAt: "2026-10-30T10:00:00.000Z",
  observed: { baseline_lunch_customers: 38, test_lunch_customers: 44, redemptions_per_day: 9 },
  actual: 6,
  actualLabel: "Extra lunch customers a day (measured)",
  closestScenario: "expected",
  verdict: "tweak",
  netTest: -40,
  plain: "You got 6 extra a day, a little under break-even.",
  learned: ["Your guess of 8 was a bit high."],
};

const full: ReportInput = { analysis: fixtureAnalysis(), plan, rehearsal: fixtureRehearsal(), result, status: "final" };

function headings(html: string): string[] {
  return [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => m[2]!.replace(/<[^>]+>/g, "").trim());
}

/* ------------------------------------------------------------------ */

test("renders all six step headings in order, with one h1 and a Step N/6 header", () => {
  const html = renderReport(full);
  const hs = headings(html);
  let last = -1;
  for (const st of STEPS) {
    const i = hs.indexOf(st.title);
    assert.ok(i >= 0, `missing step heading "${st.title}"`);
    assert.ok(i > last, `step heading "${st.title}" out of order`);
    last = i;
    assert.ok(html.includes(`Step ${st.n}/6`), `missing "Step ${st.n}/6"`);
  }
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, "exactly one h1");
  assert.ok(hs.includes("What you learned"));
  assert.match(html, /aria-label="Report steps"/);
});

test("shows a source chip for every source used, and the legend explains all five", () => {
  const html = renderReport(full);
  for (const s of ["owner", "assumption", "calculation", "imagined", "demo"]) assert.ok(html.includes(`wi-chip--${s}`), `no chip for ${s}`);
  for (const label of ["Your number", "A guess", "Calculated", "Imagined", "Demo data"]) assert.ok(html.includes(label), `legend lacks ${label}`);
  // each input row carries its own source
  const a = full.analysis;
  for (const i of a.inputs) assert.ok(html.includes(i.label), `input ${i.key} not shown`);
});

test("break-even slider is a labelled range input with live explanation", () => {
  const html = renderReport(full);
  const m = html.match(/<input[^>]*type="range"[^>]*>/);
  assert.ok(m, "no range input");
  assert.match(m[0], /id="wi-slider"/);
  assert.match(html, /<label[^>]*for="wi-slider"[^>]*>Extra lunch customers a day<\/label>/);
  assert.match(m[0], /aria-valuetext="[^"]+"/);
  assert.match(m[0], /value="8"/, "starts at the owner's guess");
  assert.ok(html.includes("Why this changed"));
  assert.match(html, /aria-live="polite"/);
  assert.ok(html.includes(points[8]!.explanation));
});

test("every calculated figure has a Show the maths toggle", () => {
  const html = renderReport(full);
  const toggles = (html.match(/<details class="wi-maths">/g) ?? []).length;
  const a = full.analysis;
  const expected = a.current.length + a.scenarios.reduce((n, s) => n + s.figures.length, 0) + 2; // + break-even + worst case
  assert.ok(toggles >= expected, `expected at least ${expected} maths toggles, got ${toggles}`);
  assert.ok(html.includes("Show the maths"));
  assert.ok(html.includes(a.breakEven.maths.replace(/→/g, "→")));
});

test("rehearsal shows the caveat, the Imagined chip, personas, timeline and network; absent without one", () => {
  const html = renderReport(full);
  assert.ok(html.includes("What a simulation can and cannot tell you"));
  assert.ok(html.includes("wi-chip--imagined"));
  assert.ok(html.includes("Herr Braun"));
  assert.match(html, /class="wi-timeline"/);
  assert.match(html, /wi-svg-net/);
  assert.match(html, /wi-svg-uptake/);
  assert.ok(html.includes("Check these with real customers"));
  const without = renderReport({ ...full, rehearsal: undefined });
  assert.ok(!without.includes("What a simulation can and cannot tell you"));
  assert.ok(without.includes("Rehearsal with imagined customers"), "step 5 heading stays for the 6-step header");
  assert.ok(without.includes("Not rehearsed yet"));
});

test("a running rehearsal says which round is in progress", () => {
  const reh = fixtureRehearsal({ status: "running" });
  reh.grid = reh.grid.filter((c) => c.round <= 2);
  reh.uptake = reh.uptake.filter((u) => u.round <= 2);
  const html = renderReport({ ...full, rehearsal: reh, result: undefined, status: "running" });
  assert.ok(html.includes("Round 3 of 4 in progress"));
  assert.ok(html.includes("the coach is running round 3…") || html.includes("The coach is running round 3…"));
  assert.match(html, /aria-current="step"[^>]*>|<a href="#wi-step-5" aria-current="step"/);
});

test("DEMO DATA ribbon only when the analysis is demo", () => {
  assert.ok(renderReport(full).includes("DEMO DATA"));
  assert.ok(!renderReport({ ...full, analysis: fixtureAnalysis({ demo: false }) }).includes("DEMO DATA"));
});

test("no external URLs or CDNs in the report or its styles", () => {
  const html = renderReport(full) + reportStyles();
  assert.ok(!/https?:\/\//i.test(html), "found an http(s) URL");
  assert.ok(!/(src|href)="\/\//i.test(html), "found a protocol-relative URL");
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(html), "found an external stylesheet or font");
  assert.ok(!/<script/i.test(renderReport(full)), "the fragment carries no scripts");
});

test("escapes HTML in every user- or model-provided string", () => {
  const evil = '<script>alert("x")</script>';
  const reh = fixtureRehearsal({ change: evil, questionsForOwner: [evil], caveat: evil });
  reh.personas = reh.personas.map((p, i) => (i === 0 ? { ...p, name: evil, story: evil } : p));
  reh.grid = reh.grid.map((c) => ({ ...c, thought: evil }));
  reh.feed = [{ round: 1, name: evil, text: evil, kind: "post" }];
  const a = fixtureAnalysis({ business: evil, question: evil, lessons: [evil], warnings: [evil] });
  a.inputs = a.inputs.map((i) => ({ ...i, note: evil }));
  const html = renderReport({ analysis: a, plan: { ...plan, title: evil, before: [evil] }, rehearsal: reh, result: { ...result, plain: evil } });
  assert.ok(!html.includes("<script"), "raw <script> leaked");
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
});

test("styles: tokens with dark mode, print stylesheet, focus states; site.css shares the tokens", () => {
  const css = reportStyles();
  assert.match(css, /:root\s*\{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media print/);
  assert.match(css, /:focus-visible/);
  const site = new URL("../site/assets/site.css", import.meta.url);
  if (existsSync(site)) assert.ok(readFileSync(site, "utf8").includes(reportTokens()), "site/assets/site.css must contain reportTokens() verbatim");
});

test("price-change style analysis (share units) renders percentages with a real minus sign", () => {
  const a = fixtureAnalysis({
    template: "price_change",
    breakEven: { value: -0.069, unit: "share", label: "Drop in sales you can absorb", maths: "m", plain: "p", reachable: true },
    sensitivity: {
      key: "volume_likely",
      label: "Change in sales",
      unit: "share",
      current: -0.04,
      breakEvenX: -0.069,
      points: [-0.3, -0.2, -0.1, -0.05, 0, 0.05].map((x) => ({ x, netTest: x * 1000 + 50, netMonth: x * 3000 + 150, explanation: `At ${x}` })),
    },
  });
  const html = renderReport({ analysis: a });
  assert.ok(html.includes("−6.9%"), "break-even shown as −6.9%");
  assert.ok(!/>-\d/.test(html), "no ASCII hyphen used as a minus sign in text");
});

/* ------------------------------------------------------------------ */
/* Integration with the real engine and sim, when they exist             */
/* ------------------------------------------------------------------ */

const engineReady = existsSync(new URL("../src/engine/index.ts", import.meta.url));
const simReady = existsSync(new URL("../src/sim/index.ts", import.meta.url));

test("renders a real demo analysis from the engine", { skip: !engineReady && "src/engine/index.ts not written yet" }, async () => {
  const eng = await import("../src/engine/index.ts");
  const a = eng.analyze("lunch_offer", eng.demoInputs("lunch_offer"), { demo: true, createdAt: "2026-10-17T00:00:00.000Z" });
  const html = renderReport({ analysis: a, plan: eng.planTest(a) });
  for (const st of STEPS) assert.ok(html.includes(st.title));
  assert.ok(html.includes("DEMO DATA"));
  const p = eng.analyze("price_change", eng.demoInputs("price_change"), { demo: true });
  assert.ok(renderReport({ analysis: p, plan: eng.planTest(p) }).includes("Change in sales"));
});

test("renders a real rule-based rehearsal from the sim", { skip: !(engineReady && simReady) && "src/sim/index.ts not written yet" }, async () => {
  const eng = await import("../src/engine/index.ts");
  const sim = await import("../src/sim/index.ts");
  const a = eng.analyze("lunch_offer", eng.demoInputs("lunch_offer"), { demo: true });
  let r = sim.startRehearsal(a, { seed: 7 });
  for (let i = 0; i < 8 && r.status !== "done"; i++) r = sim.submitRound(r, sim.ruleBasedReactions(r), "rule-based").rehearsal;
  const html = renderReport({ analysis: a, plan: eng.planTest(a), rehearsal: sim.summarize(r) });
  assert.ok(html.includes("What a simulation can and cannot tell you"));
  assert.ok(html.includes(r.personas[0]!.name.replace(/&/g, "&amp;")));
});
