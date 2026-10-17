/**
 * The report's numbered steps (1–4 and 6) and the closing "What you learned"
 * section. Each step teaches one idea; every number shows its source chip and,
 * where it is calculated, a "Show the maths" toggle.
 */
import { money, pct } from "../engine/format.ts";
import type { Analysis, Figure, ResolvedInput, Scenario, Source, TestPlan, TestResult } from "../engine/types.ts";
import { barsSvg, nearestIndex, numberLineSvg, sensitivitySvg, xText } from "./charts.ts";
import type { LineMark, NetField } from "./charts.ts";
import { bigValue, chip, esc, figureChips, fmt, fmtInput, fmtSigned, ICONS, inputChips, list, mathsToggle, netWords, SOURCES, SOURCE_LESSON, tone } from "./html.ts";
import { STEPS, testDays } from "./model.ts";
import type { ReportInput, StepState } from "./model.ts";
import { SOURCE_LABEL } from "../engine/types.ts";

export const CHART_W = 640;

const STATE_WORD: Record<StepState, string> = { complete: "Done", current: "Now", upcoming: "Next", optional: "Optional" };

function input(a: Analysis, key: string): ResolvedInput | undefined {
  return a.inputs.find((i) => i.key === key);
}

function inputText(a: Analysis, key: string): string | undefined {
  const i = input(a, key);
  return i ? fmtInput(i.value, i.unit) : undefined;
}

/* ---------------- progress header ---------------- */

export function stepper(states: StepState[]): string {
  const done = states.filter((s) => s === "complete").length;
  const nowIdx = Math.max(0, states.indexOf("current"));
  const now = STEPS[nowIdx] ?? STEPS[0]!;
  const items = STEPS.map((st, i) => {
    const s = states[i] ?? "upcoming";
    const mark = s === "complete" ? ICONS.check : `<span>${st.n}</span>`;
    return `<li class="wi-st is-${s}" data-step="${st.n}"><a href="#${st.id}"${s === "current" ? ' aria-current="step"' : ""}><span class="wi-st-dot" aria-hidden="true">${mark}</span><span class="wi-st-label">${esc(st.short)}</span><span class="wi-sr"> — step ${st.n} of 6, ${STATE_WORD[s].toLowerCase()}</span></a></li>`;
  }).join("");
  return `<nav class="wi-stepper wi-noprint" aria-label="Report steps"><div class="wi-stepper-inner"><p class="wi-stepper-now" aria-hidden="true"><span class="wi-stepper-n" data-wi-now>Step ${now.n}/6 · ${esc(now.title)}</span><span class="wi-stepper-done">${done} of 6 done</span></p><ol class="wi-st-list">${items}</ol><div class="wi-st-bar" aria-hidden="true"><span style="width:${Math.round((done / 6) * 100)}%"></span></div></div></nav>`;
}

export function stepHead(n: number, state: StepState, extra = ""): string {
  const st = STEPS[n - 1]!;
  return `<header class="wi-step-head"><p class="wi-step-no"><span>Step ${n}/6</span><span class="wi-step-state is-${state}">${STATE_WORD[state]}</span>${extra}</p><h2 id="${st.id}-h">${esc(st.title)}</h2><p class="wi-step-lede">${esc(st.lede)}</p></header>`;
}

export function openStep(n: number, state: StepState): string {
  const st = STEPS[n - 1]!;
  return `<section class="wi-step is-${state}" id="${st.id}" aria-labelledby="${st.id}-h" data-step="${n}">`;
}

/* ---------------- hero + step 1 ---------------- */

export function hero(a: Analysis): string {
  const ribbon = a.demo
    ? `<div class="wi-demo-ribbon" role="note"><strong>DEMO DATA</strong><span>These numbers describe a made-up café. Swap in your own to get your answer.</span></div>`
    : "";
  return `<header class="wi-hero">${ribbon}<p class="wi-eyebrow">What-IF report${a.business ? ` · ${esc(a.business)}` : ""}</p><h1 class="wi-title">${esc(a.question || "What if…?")}</h1><p class="wi-hero-sub">Possibilities, not promises. Every number below says where it came from.</p></header>`;
}

function compareOptions(a: Analysis): { now: string; change: string } {
  if (a.template === "lunch_offer") {
    const lunch = input(a, "lunch_customers");
    const spend = inputText(a, "lunch_spend");
    const offer = inputText(a, "offer_price");
    const days = input(a, "test_days");
    return {
      now: `Carry on as now${lunch ? `: about ${fmt(lunch.value, lunch.unit)} at lunch` : ""}${spend ? `, spending ${spend}` : ""}.`,
      change: `Add a weekday lunch deal${offer ? ` at ${offer}` : ""}${days ? `, tried for ${fmt(days.value, days.unit)}` : ""}.`,
    };
  }
  if (a.template === "price_change") {
    const item = input(a, "item")?.value ?? "the item";
    const cur = inputText(a, "current_price");
    const nw = inputText(a, "new_price");
    return { now: `Keep the ${String(item)} at ${cur ?? "today's price"}.`, change: `Charge ${nw ?? "the new price"} for the ${String(item)} instead.` };
  }
  return { now: "Carry on as now.", change: "Make the change." };
}

function expected(a: Analysis): Scenario | undefined {
  return a.scenarios.find((s) => s.id === "expected") ?? a.scenarios[1] ?? a.scenarios[0];
}

export function step1(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const cmp = compareOptions(a);
  const exp = expected(a);
  const be = bigValue(a.breakEven.value, a.breakEven.unit);
  const days = testDays(input);
  const w = a.worstCase.value;
  const warnings = a.warnings.length
    ? `<div class="wi-callout wi-callout--warn" role="note">${ICONS.warn}<div><p class="wi-callout-title">Worth knowing first</p>${list(a.warnings)}</div></div>`
    : "";
  return `${openStep(1, state)}${stepHead(1, state)}
<div class="wi-card wi-ask">
  <p class="wi-ask-label">You asked</p>
  <blockquote class="wi-ask-q">${esc(a.question || "What if…?")}</blockquote>
  ${a.business ? `<p class="wi-ask-biz"><span class="wi-muted">Business:</span> ${esc(a.business)}</p>` : ""}
  <div class="wi-versus" role="list">
    <div class="wi-versus-opt" role="listitem"><span class="wi-versus-tag">Option A</span><p>${esc(cmp.now)}</p></div>
    <div class="wi-versus-vs" aria-hidden="true">vs</div>
    <div class="wi-versus-opt is-change" role="listitem"><span class="wi-versus-tag">Option B</span><p>${esc(cmp.change)}</p></div>
  </div>
</div>
<h3 class="wi-h3">The short answer</h3>
<div class="wi-tiles">
  <a class="wi-tile" href="#wi-step-4"><span class="wi-tile-label">${esc(a.breakEven.label)}</span><span class="wi-tile-value">${esc(be.big)}${be.small ? ` <small>${esc(be.small)}</small>` : ""}</span>${chip("calculation")}<span class="wi-tile-more">Step 4 ${ICONS.arrow}</span></a>
  ${exp ? `<a class="wi-tile" href="#wi-step-3"><span class="wi-tile-label">Your likely guess${days ? `, over the ${days}-day test` : ", over the test"}</span><span class="wi-tile-value wi-${tone(exp.netTest)}">${esc(fmtSigned(exp.netTest, "EUR"))}</span><span class="wi-tile-words">${esc(netWords(exp.netTest))}</span>${chip("calculation")}<span class="wi-tile-more">Step 3 ${ICONS.arrow}</span></a>` : ""}
  <a class="wi-tile" href="#wi-step-3-worst"><span class="wi-tile-label">Worst case over the test</span><span class="wi-tile-value wi-${tone(w)}">${esc(fmtSigned(w, "EUR"))}</span>${a.worstCase.shareOfCash !== undefined ? `<span class="wi-tile-words">${esc(pct(a.worstCase.shareOfCash))} of the cash you could spare</span>` : ""}${chip("calculation")}<span class="wi-tile-more">Step 3 ${ICONS.arrow}</span></a>
</div>
${warnings}
</section>`;
}

/* ---------------- step 2: your numbers ---------------- */

export function sourceLegend(only?: Source[]): string {
  const items = (only ?? SOURCES).map((s) => `<li>${chip(s)}<span>${esc(SOURCE_LESSON[s])}</span></li>`).join("");
  return `<div class="wi-legend-wrap"><p class="wi-legend-title">How to read the coloured labels</p><ul class="wi-legend">${items}</ul></div>`;
}

const GROUPS: { kind: ResolvedInput["kind"]; title: string; note: string }[] = [
  { kind: "fact", title: "Facts about your café", note: "Things you can look up: your till, your rent, your costs." },
  { kind: "choice", title: "Your plan", note: "Choices you make: the price, the length of the test, what you spend on it." },
  { kind: "assumption", title: "Guesses nobody knows yet", note: "These drive the result most. The small test exists to check them." },
];

function inputRow(i: ResolvedInput): string {
  const note = i.note ? `<p class="wi-note">${ICONS.info}<span>${esc(i.note)}</span></p>` : "";
  return `<tr><th scope="row"><span class="wi-in-label">${esc(i.label)}</span><details class="wi-why"><summary>Why it matters</summary><p>${esc(i.why)}</p></details></th><td class="wi-in-value" data-label="Value"><span class="wi-num">${esc(fmtInput(i.value, i.unit))}</span>${note}</td><td class="wi-in-src" data-label="Where it came from">${inputChips(i.source, i.kind)}</td></tr>`;
}

export function step2(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const groups = GROUPS.map((g) => {
    const rows = a.inputs.filter((i) => i.kind === g.kind);
    if (!rows.length) return "";
    return `<div class="wi-in-group"><h3 class="wi-h3">${esc(g.title)}</h3><p class="wi-muted wi-small">${esc(g.note)}</p><table class="wi-table wi-inputs"><thead><tr><th scope="col">What</th><th scope="col">Value</th><th scope="col">Where it came from</th></tr></thead><tbody>${rows.map(inputRow).join("")}</tbody></table></div>`;
  }).join("");
  const current = a.current.length
    ? `<div class="wi-in-group"><h3 class="wi-h3">What your numbers already say</h3><p class="wi-muted wi-small">Before changing anything, here is today in plain arithmetic.</p><ul class="wi-figs">${a.current
        .map(
          (f) =>
            `<li class="wi-fig"><span class="wi-fig-label">${esc(f.label)}</span><span class="wi-fig-value">${esc(fmt(f.value, f.unit))}</span><span class="wi-fig-chips">${figureChips(f.source, f.maths)}</span>${mathsToggle(f.maths)}</li>`,
        )
        .join("")}</ul></div>`
    : "";
  return `${openStep(2, state)}${stepHead(2, state)}${sourceLegend()}${groups}${current}</section>`;
}

/* ---------------- step 3: possible outcomes ---------------- */

/** The figure that is the scenario's own guess (already shown at the top of the card). */
function isGuessFigure(s: Scenario, f: Figure): boolean {
  return f.unit === s.assumptionUnit && Math.abs(f.value - s.assumptionValue) < 1e-9 && !/[=×÷]/.test(f.maths);
}

/** The figure whose value is the headline result over the test. */
function netFigure(s: Scenario): Figure | undefined {
  return s.figures.find((f) => /(^|_)(net|delta)_test$/.test(f.id)) ?? s.figures.find((f) => f.unit === "EUR" && Math.abs(f.value - s.netTest) < 0.01);
}

function scenarioCard(s: Scenario, days: number | undefined): string {
  const t = tone(s.netTest);
  const net = netFigure(s);
  const working = s.figures.filter((f) => f !== net && !isGuessFigure(s, f));
  const figs = working
    .map((f) => `<li class="wi-fig wi-fig--row"><span class="wi-fig-label">${esc(f.label)}</span><span class="wi-fig-value">${esc(fmt(f.value, f.unit))}</span>${mathsToggle(f.maths)}</li>`)
    .join("");
  const guessSrc = s.figures.find((f) => isGuessFigure(s, f))?.source;
  return `<article class="wi-scn wi-scn--${esc(s.id)}${s.id === "expected" ? " is-main" : ""}" aria-labelledby="wi-scn-${esc(s.id)}">
  <header class="wi-scn-head"><h3 id="wi-scn-${esc(s.id)}" class="wi-scn-name">${esc(s.label)}</h3>${s.id === "expected" ? '<span class="wi-badge">your likely guess</span>' : ""}</header>
  <p class="wi-scn-assume">If <strong>${esc(s.assumptionLabel)}: ${esc(fmt(s.assumptionValue, s.assumptionUnit))}</strong> ${guessSrc === "demo" ? `${chip("demo")} ` : ""}${chip("assumption")}</p>
  <p class="wi-scn-net wi-${t}"><span class="wi-scn-net-v">${esc(fmtSigned(s.netTest, "EUR"))}</span><span class="wi-scn-net-l">over the ${days ? `${days}-day ` : ""}test · ${esc(netWords(s.netTest))}</span></p>
  ${net ? mathsToggle(net.maths) : ""}
  <p class="wi-scn-month">${esc(fmtSigned(s.netMonth, "EUR"))} a month if you kept it going</p>
  <p class="wi-scn-plain">${esc(s.plain)}</p>
  ${figs ? `<div class="wi-working"><p class="wi-working-h"><span>The working</span>${chip("calculation")}</p><ul class="wi-figs wi-figs--tight">${figs}</ul></div>` : ""}
</article>`;
}

export function scenarioChart(input: ReportInput, width: number): string {
  const a = input.analysis;
  const days = testDays(input);
  const rows = a.scenarios.map((s) => ({ label: s.label, sub: fmt(s.assumptionValue, s.assumptionUnit), value: s.netTest, highlight: s.id === "expected" }));
  const w = a.worstCase.value;
  return barsSvg(rows, {
    width,
    id: "wi-chart-scn",
    title: `Result over the ${days ? `${days}-day ` : ""}test for each version`,
    desc: a.scenarios.map((s) => `${s.label}: ${fmtSigned(s.netTest, "EUR")}`).join("; ") + `. Worst case: ${fmtSigned(w, "EUR")}.`,
    worst: { value: w, label: `Worst case ${fmtSigned(w, "EUR")}` },
  });
}

export function uncertaintyChart(input: ReportInput, width: number): string {
  const bu = input.analysis.biggestUncertainty;
  const rows = bu.ranking.slice(0, 6).map((r, i) => ({ label: r.label, value: Math.abs(r.swing), role: (i === 0 ? "accent" : "muted") as "accent" | "muted" }));
  return barsSvg(rows, {
    width,
    id: "wi-chart-unc",
    title: "How much each guess can move the result",
    desc: bu.ranking.map((r) => `${r.label}: ${money(Math.abs(r.swing))}`).join("; "),
    zeroLabel: false,
    format: (v) => money(v),
  });
}

/** "How much of your spare cash the worst case uses", as a bar (only when the owner gave a cash figure). */
function cashMeter(a: Analysis): string {
  const share = a.worstCase.shareOfCash;
  if (share === undefined || a.worstCase.value >= 0) return "";
  const cash = input(a, "cash_buffer");
  const pctText = pct(share);
  const width = Math.max(1.5, Math.min(100, share * 100));
  const over = share > 1;
  return `<div class="wi-meter-wrap"><div class="wi-meter${over ? " is-over" : ""}" role="img" aria-label="The worst case uses ${esc(pctText)} of the cash you could spare"><span style="width:${width.toFixed(1)}%"></span></div><p class="wi-meter-l"><span><strong>${esc(pctText)}</strong> of the ${cash ? esc(fmtInput(cash.value, cash.unit)) : "cash"} you could spare</span><span class="wi-muted">${over ? "more than you have set aside" : `${esc(pct(Math.max(0, 1 - share)))} left over`}</span></p></div>`;
}

export function step3(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const days = testDays(input);
  const w = a.worstCase;
  const bu = a.biggestUncertainty;
  const tableRows = a.scenarios
    .map((s) => `<tr><th scope="row">${esc(s.label)}</th><td data-label="Guess">${esc(fmt(s.assumptionValue, s.assumptionUnit))}</td><td data-label="Over the test">${esc(fmtSigned(s.netTest, "EUR"))}</td><td data-label="Per month">${esc(fmtSigned(s.netMonth, "EUR"))}</td></tr>`)
    .join("");
  return `${openStep(3, state)}${stepHead(3, state)}
<div class="wi-toolbar wi-noprint" data-wi-only-js hidden><button type="button" class="wi-btn wi-btn--ghost" data-wi-allmaths aria-pressed="false">Show all the maths</button></div>
<div class="wi-scns">${a.scenarios.map((s) => scenarioCard(s, days)).join("")}</div>
<figure class="wi-card wi-chart">
  <figcaption><span class="wi-chart-title">Result over the ${days ? `${days}-day ` : ""}test</span>${chip("calculation")}<span class="wi-chart-sub">Bars to the right make money, bars to the left lose it. The dashed line is the worst case.</span></figcaption>
  <div class="wi-chart-box" data-wi-chart="scenarios">${scenarioChart(input, CHART_W)}</div>
  <details class="wi-tableview"><summary>Show these numbers as a table</summary><table class="wi-table wi-table--plain"><thead><tr><th scope="col">Version</th><th scope="col">Guess</th><th scope="col">Over the test</th><th scope="col">Per month</th></tr></thead><tbody>${tableRows}</tbody></table></details>
</figure>
<div class="wi-callout wi-callout--neg" id="wi-step-3-worst">${ICONS.warn}<div><p class="wi-callout-title">Can you afford to be wrong? Worst case: ${esc(fmtSigned(w.value, "EUR"))} ${chip("calculation")}</p><p>${esc(w.plain)}</p>${cashMeter(a)}${mathsToggle(w.maths)}</div></div>
<figure class="wi-card wi-chart">
  <figcaption><span class="wi-chart-title">Which guess matters most</span>${chip("calculation")}<span class="wi-chart-sub">How far the result moves when each number moves across its likely range. The longest bar is the one to test.</span></figcaption>
  <p class="wi-big-unc"><strong>${esc(bu.label)}</strong> — ${esc(bu.plain)}</p>
  ${bu.ranking.length ? `<div class="wi-chart-box" data-wi-chart="uncertainty">${uncertaintyChart(input, CHART_W)}</div>` : ""}
</figure>
</section>`;
}

/* ---------------- step 4: break-even + slider ---------------- */

export function guessIndex(a: Analysis): number {
  return nearestIndex(a.sensitivity.points, a.sensitivity.current);
}

export function sensChart(a: Analysis, width: number, index: number, field: NetField = "netTest"): string {
  const s = a.sensitivity;
  return sensitivitySvg(s, {
    width,
    index,
    field,
    id: "wi-chart-sens",
    title: `Result over the test for each value of: ${s.label}`,
    desc: `Line chart. ${s.breakEvenX !== null ? `It crosses zero (break-even) at ${xText(s.breakEvenX, s.unit)}. ` : "It does not cross zero in this range. "}Your guess is ${xText(s.current, s.unit)}.`,
  });
}

/** The live sentence under the slider. Shared by the server render and the client. */
export function readout(a: Analysis, index: number, days: number | undefined): { html: string; why: string; valueText: string } {
  const s = a.sensitivity;
  const p = s.points[Math.max(0, Math.min(s.points.length - 1, index))];
  if (!p) return { html: "", why: "", valueText: "" };
  const g = guessIndex(a);
  const gp = s.points[g];
  const xs = xText(p.x, s.unit);
  const valueText = `${s.label}: ${xs}`;
  const delta = gp && g !== index ? p.netTest - gp.netTest : 0;
  const vs =
    gp && g !== index
      ? `<p class="wi-readout-vs">${esc(fmtSigned(delta, "EUR"))} compared with your guess of ${esc(xText(gp.x, s.unit))}.</p>`
      : `<p class="wi-readout-vs">This is your own guess.</p>`;
  const html = `<p class="wi-readout-main"><span class="wi-readout-x">${esc(s.label)}: <strong>${esc(xs)}</strong></span><span class="wi-readout-net wi-${tone(p.netTest)}">${esc(fmtSigned(p.netTest, "EUR"))} <small>over the ${days ? `${days}-day ` : ""}test · ${esc(netWords(p.netTest))}</small></span><span class="wi-readout-month">${esc(fmtSigned(p.netMonth, "EUR"))} a month if you kept it going</span></p>${vs}`;
  return { html, why: p.explanation, valueText };
}

export function step4(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const be = a.breakEven;
  const bv = bigValue(be.value, be.unit);
  const s = a.sensitivity;
  const days = testDays(input);
  const g = guessIndex(a);
  const r = readout(a, g, days);
  const reach = be.reachable
    ? ""
    : `<p class="wi-badge wi-badge--warn">${ICONS.warn} Beyond even your optimistic guess</p>`;
  const guessInput = a.inputs.find((i) => i.key === s.key);
  const explorer = s.points.length
    ? `<div class="wi-card wi-explorer" data-wi-explorer>
  <div class="wi-explorer-head"><h3 class="wi-h3">Move the guess, watch the result</h3>${chip("calculation")}</div>
  <p class="wi-muted wi-small">Drag the slider (or use the arrow keys). The line shows the result over the test for every value; where it crosses zero is break-even.</p>
  <div class="wi-chart-box" data-wi-chart="sens">${sensChart(a, CHART_W, g)}</div>
  <div class="wi-slider-row">
    <label class="wi-slider-label" for="wi-slider">${esc(s.label)}</label>
    <input class="wi-slider" id="wi-slider" type="range" min="0" max="${Math.max(0, s.points.length - 1)}" step="1" value="${g}" aria-valuetext="${esc(r.valueText)}" aria-describedby="wi-readout">
    <div class="wi-slider-scale" aria-hidden="true"><span>${esc(xText(s.points[0]!.x, s.unit))}</span><span>${esc(xText(s.points[s.points.length - 1]!.x, s.unit))}</span></div>
  </div>
  <output class="wi-readout" id="wi-readout" for="wi-slider" data-wi-readout>${r.html}</output>
  <div class="wi-whybox"><h4 class="wi-h4">Why this changed</h4><p data-wi-why aria-live="polite">${esc(r.why)}</p></div>
  <details class="wi-tableview"><summary>Show every slider position as a table</summary><table class="wi-table wi-table--plain"><thead><tr><th scope="col">${esc(s.label)}</th><th scope="col">Over the test</th><th scope="col">Per month</th></tr></thead><tbody>${s.points
    .map((p) => `<tr${s.breakEvenX !== null && Math.abs(p.x - s.breakEvenX) < 1e-9 ? ' class="is-be"' : ""}><th scope="row">${esc(xText(p.x, s.unit))}</th><td data-label="Over the test">${esc(fmtSigned(p.netTest, "EUR"))}</td><td data-label="Per month">${esc(fmtSigned(p.netMonth, "EUR"))}</td></tr>`)
    .join("")}</tbody></table></details>
</div>`
    : "";
  return `${openStep(4, state)}${stepHead(4, state)}
<div class="wi-card wi-breakeven">
  <p class="wi-be-label">${esc(be.label)} ${chip("calculation")}</p>
  <p class="wi-be-value"><span class="wi-be-big">${esc(bv.big)}</span>${bv.small ? `<span class="wi-be-small">${esc(bv.small)}</span>` : ""}</p>
  ${reach}
  <p class="wi-be-plain">${esc(be.plain)}</p>
  ${guessInput ? `<p class="wi-be-vs"><span>Your likely guess: <strong>${esc(fmtInput(guessInput.value, guessInput.unit))}</strong></span>${inputChips(guessInput.source, guessInput.kind)}</p>` : ""}
  ${mathsToggle(be.maths)}
</div>
${explorer}
</section>`;
}

/* ---------------- step 6: test plan + result ---------------- */

function testCard(plan: TestPlan): string {
  const measure = plan.measure.length
    ? `<div class="wi-tc-block"><h4 class="wi-h4">What to measure</h4><ul class="wi-tc-measure">${plan.measure.map((m) => `<li><strong>${esc(m.what)}</strong><span>${esc(m.how)}</span></li>`).join("")}</ul></div>`
    : "";
  const checkins = plan.checkIns.length
    ? `<div class="wi-tc-block"><h4 class="wi-h4">Check-ins</h4><ol class="wi-tc-days">${plan.checkIns.map((c) => `<li><span class="wi-tc-day">Day ${esc(c.day)}</span><span>${esc(c.look)}</span></li>`).join("")}</ol></div>`
    : "";
  return `<article class="wi-card wi-testcard" id="wi-testcard" aria-labelledby="wi-testcard-h">
  <header class="wi-tc-head"><p class="wi-eyebrow">What-IF test card</p><h3 id="wi-testcard-h" class="wi-tc-title">${esc(plan.title)}</h3><p class="wi-tc-days-badge">${esc(plan.days)} days</p></header>
  <p class="wi-tc-plain">${esc(plan.plain)}</p>
  <div class="wi-tc-grid">
    <div class="wi-tc-block"><h4 class="wi-h4">Before you start</h4>${list(plan.before, "wi-checklist")}</div>
    <div class="wi-tc-block"><h4 class="wi-h4">Every day during the test</h4>${list(plan.during, "wi-checklist")}</div>
    ${measure}
    ${checkins}
  </div>
  <div class="wi-tc-block"><h4 class="wi-h4">The decision rule — agree it now, before you see the results</h4>
    <div class="wi-rule">
      <div class="wi-rule-item is-keep">${ICONS.keep}<p><strong>Keep</strong>${esc(plan.decisionRule.keep)}</p></div>
      <div class="wi-rule-item is-tweak">${ICONS.tweak}<p><strong>Tweak</strong>${esc(plan.decisionRule.tweak)}</p></div>
      <div class="wi-rule-item is-stop">${ICONS.stop}<p><strong>Stop</strong>${esc(plan.decisionRule.stop)}</p></div>
    </div>
  </div>
  <p class="wi-tc-cap"><strong>Cost cap:</strong> ${esc(plan.costCap)}</p>
  <div class="wi-tc-actions wi-noprint"><button type="button" class="wi-btn" data-wi-print>${ICONS.printer}<span>Print this test card</span></button></div>
</article>`;
}

const VERDICT: Record<TestResult["verdict"], { word: string; icon: string }> = {
  keep: { word: "Keep it", icon: ICONS.keep },
  tweak: { word: "Tweak it", icon: ICONS.tweak },
  stop: { word: "Stop it", icon: ICONS.stop },
};

const CLOSEST: Record<TestResult["closestScenario"], string> = {
  cautious: "closest to the cautious version",
  expected: "closest to your likely guess",
  optimistic: "closest to the optimistic version",
  below_cautious: "below even the cautious version",
  above_optimistic: "above even the optimistic version",
};

export function resultLine(input: ReportInput, width: number): string {
  const a = input.analysis;
  const res = input.result;
  if (!res) return "";
  const unit = a.scenarios[0]?.assumptionUnit ?? a.sensitivity.unit;
  const marks: LineMark[] = a.scenarios.map((s) => ({ x: s.assumptionValue, label: `${s.label}: ${xText(s.assumptionValue, unit)}`, kind: "scenario" }));
  if (a.breakEven.unit === unit) marks.push({ x: a.breakEven.value, label: `Break-even: ${xText(a.breakEven.value, unit)}`, kind: "breakeven" });
  marks.push({ x: res.actual, label: `What happened: ${xText(res.actual, unit)}`, kind: "actual" });
  return numberLineSvg(marks, {
    width,
    id: "wi-chart-result",
    unit,
    title: "Where reality landed compared with the guesses",
    desc: `${res.actualLabel}: ${xText(res.actual, unit)}. Guesses: ${a.scenarios.map((s) => `${s.label} ${xText(s.assumptionValue, unit)}`).join(", ")}.`,
  });
}

export function resultBars(input: ReportInput, width: number): string {
  const a = input.analysis;
  const res = input.result;
  if (!res) return "";
  const rows = [
    ...a.scenarios.map((s) => ({ label: s.label, sub: "(guess)", value: s.netTest, role: "muted" as const })),
    { label: "What happened", sub: "(measured)", value: res.netTest, highlight: true },
  ];
  return barsSvg(rows, {
    width,
    id: "wi-chart-result-net",
    title: "Result over the test: what happened compared with the three versions",
    desc: rows.map((r) => `${r.label}: ${fmtSigned(r.value, "EUR")}`).join("; "),
  });
}

function resultBlock(input: ReportInput): string {
  const res = input.result;
  if (!res) return "";
  const v = VERDICT[res.verdict];
  const obs = Object.entries(res.observed)
    .map(([k, val]) => `<li><span>${esc(k.replace(/_/g, " "))}</span><strong>${esc(String(val))}</strong></li>`)
    .join("");
  return `<div class="wi-card wi-result" aria-labelledby="wi-result-h">
  <h3 class="wi-h3" id="wi-result-h">What actually happened</h3>
  <div class="wi-result-top">
    <p class="wi-verdict is-${esc(res.verdict)}">${v.icon}<span><small>The decision rule says</small>${esc(v.word)}</span></p>
    <p class="wi-result-actual"><span class="wi-muted">${esc(res.actualLabel)}</span><strong>${esc(xText(res.actual, input.analysis.scenarios[0]?.assumptionUnit ?? input.analysis.sensitivity.unit))}</strong><span>${esc(CLOSEST[res.closestScenario])}</span>${chip("owner")}</p>
    <p class="wi-result-net wi-${tone(res.netTest)}"><span class="wi-muted">Result over the test</span><strong>${esc(fmtSigned(res.netTest, "EUR"))}</strong>${chip("calculation")}</p>
  </div>
  <p>${esc(res.plain)}</p>
  <figure class="wi-chart"><figcaption><span class="wi-chart-title">Where reality landed</span><span class="wi-chart-sub">Your three guesses on one line, and what you measured.</span></figcaption><div class="wi-chart-box" data-wi-chart="result">${resultLine(input, CHART_W)}</div></figure>
  <figure class="wi-chart"><figcaption><span class="wi-chart-title">Result over the test</span><span class="wi-chart-sub">The three versions you planned for, and the real one.</span></figcaption><div class="wi-chart-box" data-wi-chart="result-net">${resultBars(input, CHART_W)}</div></figure>
  ${res.learned.length ? `<h4 class="wi-h4">What the test taught you</h4>${list(res.learned)}` : ""}
  ${obs ? `<details class="wi-tableview"><summary>What you measured</summary><ul class="wi-observed">${obs}</ul></details>` : ""}
</div>`;
}

export function step6(input: ReportInput, state: StepState): string {
  const plan = input.plan;
  const body = plan
    ? testCard(plan)
    : `<div class="wi-card wi-empty"><p><strong>No test planned yet.</strong> Ask your AI coach: “Plan a small test for this.”</p></div>`;
  const waiting =
    plan && !input.result
      ? `<div class="wi-callout wi-callout--info">${ICONS.info}<div><p class="wi-callout-title">When the test is done, come back</p><p>Tell the coach what you measured. What-IF will put it next to your three guesses, so you learn which one was closest and what to do next.</p></div></div>`
      : "";
  return `${openStep(6, state)}${stepHead(6, state)}${body}${waiting}${resultBlock(input)}</section>`;
}

/* ---------------- closing: what you learned ---------------- */

const GLOSSARY: [string, string][] = [
  ["Break-even", "The point where a change stops costing you money and starts earning it. Below it you lose; above it you gain."],
  ["Margin", "What is left from a sale after paying for what went into it (ingredients, packaging). Takings are not profit; margin is closer."],
  ["Assumption", "A number nobody knows yet, written down as a guess so it can be checked. Good decisions say their assumptions out loud."],
  ["Scenario", "One possible version of the future, worked out from a stated guess. Three scenarios show a range instead of a false promise."],
  ["Simulation", "A pretend run of what might happen, here with imagined customers. It helps you think of questions; it cannot tell you what real people will do."],
];

export function closing(input: ReportInput): string {
  const a = input.analysis;
  const method = [
    { t: "Write down your numbers", d: "Facts you know, plus the guesses you are unsure of, kept apart." },
    { t: "Find the break-even", d: "How many extra customers (or sales) you need before the change pays." },
    { t: "Run a small test", d: "Cheap, short and reversible, with a rule for keep, tweak or stop agreed up front." },
  ];
  return `<section class="wi-step wi-closing" id="wi-learned" aria-labelledby="wi-learned-h">
<header class="wi-step-head"><p class="wi-step-no"><span>After the six steps</span></p><h2 id="wi-learned-h">What you learned</h2></header>
${a.lessons.length ? `<div class="wi-card"><ul class="wi-lessons">${a.lessons.map((l) => `<li>${ICONS.check}<span>${esc(l)}</span></li>`).join("")}</ul></div>` : ""}
${a.nextQuestions.length ? `<h3 class="wi-h3">Good questions to ask next</h3><ul class="wi-nextq">${a.nextQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
<div class="wi-card wi-method"><h3 class="wi-h3">Use this method again — on any decision</h3><ol class="wi-method-steps">${method
    .map((m, i) => `<li><span class="wi-method-n" aria-hidden="true">${i + 1}</span><div><strong>${esc(m.t)}</strong><p>${esc(m.d)}</p></div></li>`)
    .join("")}</ol><p class="wi-muted wi-small">It works for a new opening hour, a price rise, a hire or a promotion. You can do it on paper; What-IF just shows the working.</p></div>
<div class="wi-two">
  <div class="wi-card wi-glossary"><h3 class="wi-h3">Five words, in plain English</h3><dl>${GLOSSARY.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join("")}</dl></div>
  <div class="wi-card wi-privacy">${ICONS.lock}<h3 class="wi-h3">Your data</h3><p>What-IF saw only the numbers in this link. Nothing is stored on a server; the data lives in the link after the #.</p><p class="wi-muted wi-small">Anyone you send the link to can see these numbers, so share it like you would share a spreadsheet.</p></div>
</div>
<p class="wi-footnote">What-IF shows possibilities, not promises. It is not a substitute for an accountant, a lender or other professional advice. ${esc(SOURCE_LABEL.calculation)} numbers come from plain arithmetic on the numbers in step 2.</p>
</section>`;
}
