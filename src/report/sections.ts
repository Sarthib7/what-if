/**
 * The report's numbered steps (1–4 and 6) and the closing "What you learned"
 * section. Each step teaches one idea; every number shows its source chip and,
 * where it is calculated, a "Show the maths" toggle. Details are collapsed by
 * default, so a phone shows the idea first and the working on request.
 *
 * Every owner-facing word comes from messages.ts, in the analysis language.
 */
import { money, num, pct, price } from "../engine/format.ts";
import type { Analysis, Figure, PublicFact, ResolvedInput, Scenario, Source, TestPlan, TestResult } from "../engine/types.ts";
import { LANG_NAMES, LANGS } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { barsSvg, nearestIndex, numberLineSvg, sensitivitySvg, xText } from "./charts.ts";
import type { LineMark, NetField } from "./charts.ts";
import {
  bigValue,
  chip,
  dateText,
  esc,
  figureChips,
  fmt,
  fmtInput,
  hint,
  ICONS,
  inputSources,
  list,
  listOf,
  lowerFirst,
  mathsToggle,
  netWords,
  safeHttpUrl,
  sharePct,
  termDef,
  TERMS,
  termWord,
  tidyMinus,
  tone,
  wholeSigned,
} from "./html.ts";
import { t } from "./messages.ts";
import type { MsgKey } from "./messages.ts";
import { aiPlayed, isCountUnit, madeBy, ongoingBreakEven, ongoingX, reportLang, STEPS, testDays, whoPlayedShort, zeroCrossing } from "./model.ts";
import type { ReportInput, StepState } from "./model.ts";

export const CHART_W = 640;

function stateWord(s: StepState): string {
  return t(`state.${s}` as MsgKey);
}

function input(a: Analysis, key: string): ResolvedInput | undefined {
  return a.inputs.find((i) => i.key === key);
}

function inputText(a: Analysis, key: string): string | undefined {
  const i = input(a, key);
  return i ? fmtInput(i.value, i.unit) : undefined;
}

/** Inputs nobody knows yet: the owner's guesses, plus facts What-IF had to fill in with a fallback. */
function isGuess(i: ResolvedInput): boolean {
  return i.kind === "assumption" || i.source === "assumption";
}

/** The guesses only the test can check (extra customers, regulars who switch, the change in sales). */
export function isTestGuess(i: ResolvedInput): boolean {
  return i.kind === "assumption";
}

/** Facts or plans the owner did not give, which What-IF filled in (a fallback or derived value): she checks these, not the test. */
export function isFilled(i: ResolvedInput): boolean {
  return i.kind !== "assumption" && i.source === "assumption";
}

/** How many guesses the test checks, and how many numbers What-IF filled in. The same counts everywhere in the report. */
export function guessCounts(a: Analysis): { guesses: number; filled: number } {
  return { guesses: a.inputs.filter(isTestGuess).length, filled: a.inputs.filter(isFilled).length };
}

/* ---------------- progress header ---------------- */

export function stepper(states: StepState[]): string {
  const done = states.filter((s) => s === "complete").length;
  const nowIdx = Math.max(0, states.indexOf("current"));
  const now = STEPS[nowIdx] ?? STEPS[0]!;
  const items = STEPS.map((st, i) => {
    const s = states[i] ?? "upcoming";
    const mark = s === "complete" ? ICONS.check : `<span>${st.n}</span>`;
    return `<li class="wi-st is-${s}" data-step="${st.n}"><a href="#${st.id}"${s === "current" ? ' aria-current="step"' : ""}><span class="wi-st-dot" aria-hidden="true">${mark}</span><span class="wi-st-label">${esc(st.short)}</span><span class="wi-sr"> — ${esc(t("stepper.sr", { n: st.n, state: stateWord(s) }))}</span></a></li>`;
  }).join("");
  return `<nav class="wi-stepper wi-noprint" aria-label="${esc(t("stepper.aria"))}"><div class="wi-stepper-inner"><p class="wi-stepper-now" aria-hidden="true"><span class="wi-stepper-n" data-wi-now>${esc(t("stepper.now", { n: now.n, title: now.title }))}</span><span class="wi-stepper-done">${esc(t("stepper.done", { done }))}</span></p><ol class="wi-st-list">${items}</ol><div class="wi-st-bar" aria-hidden="true"><span style="width:${Math.round((done / 6) * 100)}%"></span></div></div></nav>`;
}

export function stepHead(n: number, state: StepState, extra = ""): string {
  const st = STEPS[n - 1]!;
  return `<header class="wi-step-head"><p class="wi-step-no"><span>${esc(t("step.no", { n }))}</span><span class="wi-step-state is-${state}">${esc(stateWord(state))}</span>${extra}</p><h2 id="${st.id}-h">${esc(st.title)}</h2><p class="wi-step-lede">${esc(st.lede)}</p></header>`;
}

export function openStep(n: number, state: StepState): string {
  const st = STEPS[n - 1]!;
  return `<section class="wi-step is-${state}" id="${st.id}" aria-labelledby="${st.id}-h" data-step="${n}">`;
}

/* ---------------- hero: title, language switcher ---------------- */

/** DE · EN · ES · PL. Revealed by mountReport when the page can re-render in another language. */
export function langSwitch(current: Lang): string {
  const items = LANGS.map(
    (l) =>
      `<li><button type="button" class="wi-lang-btn" data-wi-lang="${l}" lang="${l}" aria-pressed="${l === current}"${l === current ? ' aria-current="true"' : ""}><span aria-hidden="true">${l.toUpperCase()}</span><span class="wi-sr">${esc(LANG_NAMES[l])}</span></button></li>`,
  ).join("");
  return `<nav class="wi-lang wi-noprint" aria-label="${esc(t("lang.aria"))}" data-wi-lang-nav hidden><ul>${items}</ul></nav>`;
}

export function hero(input: ReportInput): string {
  const a = input.analysis;
  const ribbon = a.demo
    ? `<div class="wi-demo-ribbon" role="note"><strong>${esc(t("demo.badge"))}</strong><span>${esc(t("demo.ribbon"))}</span><a href="/try">${esc(t("demo.try"))}</a></div>`
    : "";
  return `<header class="wi-hero"><div class="wi-hero-top"><p class="wi-eyebrow">${esc(t("hero.eyebrow"))}${a.business ? ` · ${esc(a.business)}` : ""}</p>${langSwitch(reportLang(a))}</div>${ribbon}<h1 class="wi-title">${esc(a.question || t("hero.noQuestion"))}</h1><p class="wi-hero-sub">${esc(t("hero.sub"))}</p></header>`;
}

/* ---------------- who did what (top of step 1) ---------------- */

/** How many figures plain code worked out: today's sums, every scenario figure, break-even and worst case. */
export function calculatedCount(a: Analysis): number {
  const scen = a.scenarios.reduce((n, s) => n + s.figures.filter((f) => !isGuessFigure(s, f)).length, 0);
  return a.current.length + scen + 2 + (a.breakEven.ongoing ? 1 : 0);
}

export function whoCard(input: ReportInput): string {
  const a = input.analysis;
  const reh = input.rehearsal;
  const by = madeBy(input);
  const given = a.inputs.filter((i) => !isGuess(i));
  const { guesses, filled } = guessCounts(a);
  const fromSrc: Source = a.demo || by === "demo" ? "demo" : "owner";
  const played = aiPlayed(reh);
  const aiKey = (by === "try" ? (played ? "who.ai.tryPlayed" : "who.ai.try") : by === "demo" ? (played ? "who.ai.demoPlayed" : "who.ai.demo") : played ? "who.ai.coachPlayed" : "who.ai.coach") as MsgKey;
  const row = (lead: string, k: string, v: string, cls = "") => `<li class="${cls}">${lead}<span><strong>${esc(k)}</strong> ${esc(v)}</span></li>`;
  const guessText = `${t("who.guessV", { n: guesses, count: guesses })}${filled ? t("who.filledV", { n: filled, count: filled }) : ""}`;
  const rows = [
    row(chip(fromSrc), t(fromSrc === "demo" ? "who.demoK" : "who.youK"), t(fromSrc === "demo" ? "who.demoV" : "who.youV", { n: given.length, count: given.length })),
    row(chip("calculation"), t("who.calcK"), t("who.calcV", { n: calculatedCount(a), count: calculatedCount(a) })),
    row(chip("assumption"), t("who.guessK"), guessText),
    reh ? row(chip("imagined"), t("who.imagK"), t("who.imagV", { n: reh.personas.length, count: reh.personas.length, played: whoPlayedShort(reh) })) : "",
  ].join("");
  // On a phone the card is one tap away, but what the AI did stays in view (the one line people most need).
  const ai = `<p class="wi-who-ai-line"><span class="wi-who-ai">${ICONS.bot}</span><span><strong>${esc(t("who.aiK"))}</strong> ${esc(t(aiKey))}</span></p>`;
  return `<div class="wi-card wi-who" id="wi-who" role="region" aria-labelledby="wi-who-h">
  <details class="wi-who-d" data-wi-open-wide><summary><h3 class="wi-h3" id="wi-who-h">${esc(t("who.title"))}</h3><span class="wi-who-chips" aria-hidden="true">${chip(fromSrc)}${chip("calculation")}${chip("assumption")}${reh ? chip("imagined") : ""}</span></summary>
  <ul class="wi-who-list">${rows}</ul>
  </details>
  ${ai}
</div>`;
}

/* ---------------- step 1: your question ---------------- */

function compareOptions(a: Analysis): { now: string; change: string } {
  if (a.template === "lunch_offer") {
    const lunch = input(a, "lunch_customers");
    const spend = inputText(a, "lunch_spend");
    const offer = inputText(a, "offer_price");
    const days = input(a, "test_days");
    return {
      now: t("cmp.lunchNow", { lunch: lunch ? fmt(lunch.value, lunch.unit) : "", spend: spend ?? "" }),
      change: t("cmp.lunchChange", { offer: offer ?? "", days: days ? fmt(days.value, days.unit) : "" }),
    };
  }
  if (a.template === "price_change") {
    const item = String(input(a, "item")?.value ?? "") || t("cmp.theItem");
    const cur = inputText(a, "current_price") ?? "";
    const nw = inputText(a, "new_price") ?? "";
    return { now: t("cmp.priceNow", { item, cur }), change: t("cmp.priceChange", { item, new: nw }) };
  }
  return { now: t("cmp.now"), change: t("cmp.change") };
}

function expected(a: Analysis): Scenario | undefined {
  return a.scenarios.find((s) => s.id === "expected") ?? a.scenarios[1] ?? a.scenarios[0];
}

/** Costs that What-IF fills in as 0 when the owner does not give them: they make a change look better than it probably is. */
const ZERO_COSTS = ["setup_cost", "extra_staff_hours_per_day", "marketing_per_week"];

/**
 * A warning that belongs above the short answer, not folded away: the break-even is 0 (or the worst case is no loss)
 * only because What-IF filled in costs the owner never gave, or a filled-in lunch spend turns switching regulars into a gain.
 * Never names the break-even itself, so the guess in step 4 still means something.
 */
export function filledWarning(a: Analysis): { title: string; lines: string[] } | null {
  if (a.template !== "lunch_offer") return null;
  const switchGain = (a.current.find((f) => f.id === "switch_cost_day")?.value ?? 0) < -0.005;
  const fills = a.inputs.filter((i) => isFilled(i) && ((ZERO_COSTS.includes(i.key) && i.value === 0) || (i.key === "lunch_spend" && switchGain)));
  if (!fills.length) return null;
  const free = a.breakEven.reachable && a.breakEven.value <= 0;
  const noLoss = a.worstCase.value >= -0.5;
  const spendFilled = fills.some((i) => i.key === "lunch_spend");
  if (!free && !noLoss && !spendFilled) return null;
  const lines: string[] = [];
  const list = listOf(fills.map((i) => `${lowerFirst(i.label)} (${fmtInput(i.value, i.unit)})`));
  lines.push(t("warn.filled", { list: reportLang(a) === "de" ? cap1(list) : list }));
  // the engine's own sentence about a filled-in lunch spend, when it gave one
  if (switchGain && spendFilled) {
    const spend = fills.find((i) => i.key === "lunch_spend");
    const own = spend ? a.warnings.find((w) => w.includes(fmtInput(spend.value, spend.unit))) : undefined;
    if (own) lines.push(own);
  }
  return { title: t("warn.filledTitle"), lines };
}

function cap1(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

function filledCallout(a: Analysis): string {
  const w = filledWarning(a);
  if (!w) return "";
  return `<div class="wi-callout wi-callout--warn wi-filled-warn" role="note">${ICONS.warn}<div><p class="wi-callout-title">${esc(w.title)}</p>${w.lines.map((l) => `<p>${esc(tidyMinus(l))}</p>`).join("")}</div></div>`;
}

export function step1(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const cmp = compareOptions(a);
  const exp = expected(a);
  const be = bigValue(a.breakEven.value, a.breakEven.unit);
  const on = ongoingBreakEven(a);
  const days = testDays(input);
  const w = a.worstCase.value;
  return `${openStep(1, state)}${stepHead(1, state)}
${whoCard(input)}
<div class="wi-card wi-ask">
  <p class="wi-ask-label">${esc(t("ask.label"))}</p>
  <blockquote class="wi-ask-q">${esc(a.question || t("hero.noQuestion"))}</blockquote>
  ${a.business ? `<p class="wi-ask-biz"><span class="wi-muted">${esc(t("ask.business"))}</span> ${esc(a.business)}</p>` : ""}
  <div class="wi-versus" role="list">
    <div class="wi-versus-opt" role="listitem"><span class="wi-versus-tag">${esc(t("cmp.a"))}</span><p>${esc(cmp.now)}</p></div>
    <div class="wi-versus-vs" aria-hidden="true">${esc(t("cmp.vs"))}</div>
    <div class="wi-versus-opt is-change" role="listitem"><span class="wi-versus-tag">${esc(t("cmp.b"))}</span><p>${esc(cmp.change)}</p></div>
  </div>
</div>
${filledCallout(a)}
<h3 class="wi-h3">${esc(t("short.title"))}</h3>
<div class="wi-tiles">
  <a class="wi-tile wi-tile--be" href="#wi-step-4"><span class="wi-tile-label">${esc(a.breakEven.label)}</span><span class="wi-tile-value" data-wi-be-value>${esc(be.big)}${be.small ? ` <small>${esc(be.small)}</small>` : ""}</span>${on ? `<span class="wi-tile-words wi-tile-on" data-wi-be-value>${esc(t("tile.ongoing", { x: fmt(on.value, on.unit) }))}</span>` : ""}<span class="wi-tile-cover" data-wi-be-cover hidden><span class="wi-tile-q" aria-hidden="true">?</span>${esc(t("tile.guessFirst"))}</span>${chip("calculation")}<span class="wi-tile-more">${esc(t("tile.step", { n: 4 }))} ${ICONS.arrow}</span></a>
  ${exp ? `<a class="wi-tile" href="#wi-step-3"><span class="wi-tile-label">${esc(days ? t("tile.likelyDays", { days }) : t("tile.likely"))}</span><span class="wi-tile-value wi-${tone(exp.netTest)}">${esc(wholeSigned(exp.netTest))}</span><span class="wi-tile-words">${esc(netWords(exp.netTest))}</span>${chip("calculation")}<span class="wi-tile-more">${esc(t("tile.step", { n: 3 }))} ${ICONS.arrow}</span></a>` : ""}
  <a class="wi-tile" href="#wi-step-3-worst"><span class="wi-tile-label">${esc(t("tile.worst"))}</span><span class="wi-tile-value wi-${tone(w)}">${esc(wholeSigned(w))}</span>${a.worstCase.shareOfCash !== undefined ? `<span class="wi-tile-words">${esc(t("tile.cash", { pct: pct(a.worstCase.shareOfCash) }))}</span>` : ""}${chip("calculation")}<span class="wi-tile-more">${esc(t("tile.step", { n: 3 }))} ${ICONS.arrow}</span></a>
</div>
</section>`;
}

/* ---------------- step 2: your numbers ---------------- */

const KEY_INPUTS: Record<string, string[]> = {
  lunch_offer: ["lunch_customers", "lunch_spend", "offer_price", "test_days"],
  price_change: ["item", "current_price", "new_price", "units_per_week", "test_days"],
};

/** The chip set most rows share (shown once, in the group's heading); rows with other sources keep their own chips. */
function sharedChips(rows: ResolvedInput[]): { set: Source[]; all: boolean } | null {
  if (!rows.length) return null;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = inputSources(r.source, r.kind).join(",");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const [best, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]!;
  if (n < 2 && rows.length > 1) return null;
  return { set: best.split(",") as Source[], all: n === rows.length };
}

/** A compact label → value list. One chip set for the whole group when every row shares it ("all demo data"). */
function kvGroup(title: string, rows: ResolvedInput[], note = "", cls = "", tail = ""): string {
  if (!rows.length) return "";
  const shared = sharedChips(rows);
  const key = shared?.set.join(",");
  const head = shared ? `<span class="wi-kv-chips">${shared.set.map(chip).join(" ")}${shared.all && rows.length > 1 ? `<span class="wi-sr"> ${esc(t("nums.allRows"))}</span>` : ""}</span>` : "";
  const items = rows
    .map((i) => {
      const own = inputSources(i.source, i.kind);
      return `<div><dt>${esc(i.label)}</dt><dd><span class="wi-num">${esc(fmtInput(i.value, i.unit))}</span>${own.join(",") === key ? "" : ` ${own.map(chip).join(" ")}`}</dd></div>`;
    })
    .join("");
  return `<div class="wi-nums-col ${cls}"><div class="wi-nums-head"><h3 class="wi-h4">${esc(title)}</h3>${head}</div>${note ? `<p class="wi-muted wi-small">${esc(note)}</p>` : ""}<dl class="wi-kv">${items}</dl>${tail}</div>`;
}

const GROUPS: { kind: ResolvedInput["kind"]; title: MsgKey; note: MsgKey }[] = [
  { kind: "fact", title: "nums.facts", note: "nums.factsNote" },
  { kind: "choice", title: "nums.plan", note: "nums.planNote" },
  { kind: "assumption", title: "nums.guesses", note: "nums.guessesNote" },
];

function inputRow(i: ResolvedInput): string {
  const note = i.note ? `<p class="wi-note">${ICONS.info}<span>${esc(i.note)}</span></p>` : "";
  const chips = inputSources(i.source, i.kind).map(chip).join(" ");
  return `<tr><th scope="row"><span class="wi-in-label">${esc(i.label)}</span>${i.why ? `<details class="wi-why"><summary>${esc(t("nums.why"))}</summary><p>${esc(i.why)}</p></details>` : ""}</th><td class="wi-in-value" data-label="${esc(t("th.value"))}"><span class="wi-num">${esc(fmtInput(i.value, i.unit))}</span>${note}</td><td class="wi-in-src" data-label="${esc(t("th.source"))}">${chips}</td></tr>`;
}

export function factsCard(facts: PublicFact[] | undefined): string {
  if (!facts || !facts.length) return "";
  const items = facts
    .map((f) => {
      const url = safeHttpUrl(f.url);
      const src = url
        ? `<a class="wi-fact-link" href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(f.source)}${ICONS.out}<span class="wi-sr"> ${esc(t("facts.newTab"))}</span></a>`
        : esc(f.source);
      return `<li><span class="wi-fact-l">${esc(f.label)}</span><strong class="wi-fact-v">${esc(f.value)}</strong><span class="wi-fact-src">${src} · ${esc(t("facts.asOf", { date: dateText(f.asOf) }))}</span></li>`;
    })
    .join("");
  // Open from the start, on a phone too: public, dated rules are the third kind of number the report teaches.
  return `<aside class="wi-card wi-facts" id="wi-facts" aria-labelledby="wi-facts-h"><details open><summary class="wi-facts-head">${ICONS.pin}<h3 class="wi-h4" id="wi-facts-h">${esc(t("facts.title"))} (${facts.length})</h3></summary><p class="wi-muted wi-small">${esc(t("facts.note"))}</p><ul class="wi-facts-list">${items}</ul></details></aside>`;
}

/** The numbers What-IF filled in: in view when there are a few, one tap away when there are many (a quick /try). */
function filledGroup(filled: ResolvedInput[]): string {
  if (!filled.length) return "";
  const rows = filled
    .map((i) => `<div><dt>${esc(i.label)}</dt><dd><span class="wi-num">${esc(fmtInput(i.value, i.unit))}</span> ${inputSources(i.source, i.kind).map(chip).join(" ")}</dd></div>`)
    .join("");
  const body = `<dl class="wi-kv">${rows}</dl>`;
  const head = `${esc(t("nums.filled"))}`;
  // A few in view under the key facts; many (a quick /try) one tap away, with the note on why.
  if (filled.length <= 3) return `<div class="wi-kv-filled"><p class="wi-kv-sub" title="${esc(t("nums.filledNote"))}">${head}</p>${body}</div>`;
  return `<details class="wi-kv-filled wi-filled-more"><summary class="wi-kv-sub">${head} (${filled.length})</summary><p class="wi-muted wi-small">${esc(t("nums.filledNote"))}</p>${body}</details>`;
}

export function step2(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const guesses = a.inputs.filter(isTestGuess);
  const filled = a.inputs.filter(isFilled);
  const known = a.inputs.filter((i) => !isGuess(i));
  const keys = KEY_INPUTS[a.template] ?? [];
  let key = keys.map((k) => known.find((i) => i.key === k)).filter((i): i is ResolvedInput => !!i);
  if (key.length < 3) key = known.slice(0, 4);
  // Filled-in facts and plans sit with their own kind (with their chip and note); only real guesses sit under "guesses".
  const groups = GROUPS.map((g) => {
    const rows = g.kind === "assumption" ? guesses : a.inputs.filter((i) => i.kind === g.kind);
    if (!rows.length) return "";
    return `<div class="wi-in-group"><h3 class="wi-h4">${esc(t(g.title))}</h3><p class="wi-muted wi-small">${esc(t(g.note))}</p><table class="wi-table wi-inputs"><thead><tr><th scope="col">${esc(t("th.what"))}</th><th scope="col">${esc(t("th.value"))}</th><th scope="col">${esc(t("th.source"))}</th></tr></thead><tbody>${rows.map(inputRow).join("")}</tbody></table></div>`;
  }).join("");
  const current = a.current.length
    ? `<details class="wi-more"><summary>${esc(t("nums.today", { n: a.current.length, count: a.current.length }))}</summary><p class="wi-muted wi-small">${esc(t("nums.todayNote"))}</p><ul class="wi-figs">${a.current
        .map(
          (f) =>
            `<li class="wi-fig"><span class="wi-fig-label">${esc(f.label)}</span><span class="wi-fig-value">${esc(fmt(f.value, f.unit))}</span><span class="wi-fig-chips">${figureChips(f.source, f.maths)}</span>${mathsToggle(f.maths)}</li>`,
        )
        .join("")}</ul></details>`
    : "";
  return `${openStep(2, state)}${stepHead(2, state)}
<p class="wi-labels-note">${ICONS.info}<span>${esc(t("nums.labels"))} <a href="#wi-who">${esc(t("nums.labelsLink"))}</a></span></p>
<div class="wi-nums">${kvGroup(t("nums.guesses"), guesses, t("nums.guessesShort"), "is-guess")}${kvGroup(t("nums.key"), key, "", "", filledGroup(filled))}</div>
<details class="wi-more"><summary>${esc(t("nums.all", { n: a.inputs.length, count: a.inputs.length }))}</summary>${groups}</details>
${current}
${factsCard(a.facts)}
</section>`;
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

/** "3 extra lunch customers a day": the scenario's guess as a phrase (the engine's, when it gives one). */
export function guessPhrase(s: Scenario): string {
  if (s.assumptionText && s.assumptionText.trim()) return s.assumptionText.trim();
  const label = s.assumptionLabel.trim();
  if (s.assumptionUnit === "share") return `${label}: ${s.assumptionValue > 0 ? "+" : s.assumptionValue < 0 ? "−" : ""}${sharePct(s.assumptionValue)}`;
  if (isCountUnit(s.assumptionUnit)) {
    const suffix = s.assumptionUnit === "customers/day" ? t("u.aDay") : t("u.aWeek");
    const hasUnit = label.toLowerCase().includes(suffix.toLowerCase());
    return `${num(s.assumptionValue)} ${lowerFirst(label)}${hasUnit ? "" : ` ${suffix}`}`;
  }
  return `${label}: ${fmt(s.assumptionValue, s.assumptionUnit)}`;
}

function overTest(days: number | undefined): string {
  return days ? t("scn.overDays", { days }) : t("scn.overTest");
}

function scenarioCard(s: Scenario, days: number | undefined): string {
  const net = netFigure(s);
  const working = s.figures.filter((f) => f !== net && !isGuessFigure(s, f) && !/_share_fixed$/.test(f.id));
  const figs = working
    .map((f) => `<li class="wi-fig wi-fig--row"><span class="wi-fig-label">${esc(f.label)}</span><span class="wi-fig-value">${esc(fmt(f.value, f.unit))}</span>${mathsToggle(f.maths)}</li>`)
    .join("");
  const guessSrc = s.figures.find((f) => isGuessFigure(s, f))?.source;
  // One sentence in view on the likely guess; the other two keep theirs with the working (the chart above already compares them).
  const main = s.id === "expected";
  const plain = s.plain ? `<p class="wi-scn-plain">${esc(tidyMinus(s.plain))}</p>` : "";
  const workBody = `${main ? "" : plain}${net ? `<div class="wi-working-net"><span>${esc(net.label)}</span>${mathsToggle(net.maths)}</div>` : ""}${figs ? `<ul class="wi-figs wi-figs--tight">${figs}</ul>` : ""}`;
  return `<article class="wi-scn wi-scn--${esc(s.id)}${s.id === "expected" ? " is-main" : ""}" aria-labelledby="wi-scn-${esc(s.id)}">
  <header class="wi-scn-head"><h3 id="wi-scn-${esc(s.id)}" class="wi-scn-name">${esc(s.label)}</h3>${s.id === "expected" ? `<span class="wi-badge">${esc(t("scn.likely"))}</span>` : ""}</header>
  <p class="wi-scn-assume"><strong>${esc(guessPhrase(s))}</strong> ${guessSrc === "demo" ? `${chip("demo")} ` : ""}${chip("assumption")}</p>
  <p class="wi-scn-net wi-${tone(s.netTest)}"><span class="wi-scn-net-v">${esc(wholeSigned(s.netTest))}</span><span class="wi-scn-net-l">${esc(overTest(days))} · ${esc(netWords(s.netTest))}</span></p>
  <p class="wi-scn-month">${esc(t("scn.month", { v: wholeSigned(s.netMonth) }))}</p>
  ${main ? plain : ""}
  ${workBody ? `<details class="wi-working"><summary><span>${esc(t("scn.working"))}</span>${chip("calculation")}</summary>${workBody}</details>` : ""}
</article>`;
}

/** The likely guess in full; the slow and the strong start one tap away on a phone (open on a wide screen). */
function scenarioCards(a: Analysis, days: number | undefined): string {
  const main = expected(a);
  const others = a.scenarios.filter((s) => s !== main);
  return `${main ? scenarioCard(main, days) : ""}${
    others.length
      ? `<details class="wi-more wi-scns-more" data-wi-open-wide><summary>${esc(t("scn.others", { a: others.map((s) => s.label).join(" · ") }))}</summary><div class="wi-scns-rest">${others.map((s) => scenarioCard(s, days)).join("")}</div></details>`
      : ""
  }`;
}

export function scenarioChart(input: ReportInput, width: number): string {
  const a = input.analysis;
  const days = testDays(input);
  const rows = a.scenarios.map((s) => ({ label: s.label, sub: fmt(s.assumptionValue, s.assumptionUnit), value: s.netTest, highlight: s.id === "expected" }));
  const w = a.worstCase.value;
  return barsSvg(rows, {
    width,
    id: "wi-chart-scn",
    title: days ? t("chart3.titleDays", { days }) : t("chart3.title"),
    desc: `${a.scenarios.map((s) => `${s.label}: ${wholeSigned(s.netTest)}`).join("; ")}. ${t("chart.worst", { v: wholeSigned(w) })}.`,
    worst: { value: w, label: t("chart.worst", { v: wholeSigned(w) }) },
  });
}

export function uncertaintyChart(input: ReportInput, width: number): string {
  const bu = input.analysis.biggestUncertainty;
  const rows = bu.ranking.slice(0, 6).map((r, i) => ({ label: r.label, value: Math.abs(r.swing), role: (i === 0 ? "accent" : "muted") as "accent" | "muted" }));
  return barsSvg(rows, {
    width,
    id: "wi-chart-unc",
    title: t("unc.title"),
    desc: bu.ranking.map((r) => `${r.label}: ${money(Math.abs(r.swing), false)}`).join("; "),
    zeroLabel: false,
    format: (v) => money(v, false),
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
  return `<div class="wi-meter-wrap"><div class="wi-meter${over ? " is-over" : ""}" role="img" aria-label="${esc(t("meter.aria", { pct: pctText }))}"><span style="width:${width.toFixed(1)}%"></span></div><p class="wi-meter-l"><span><strong>${esc(pctText)}</strong> ${esc(t("meter.ofCash", { cash: cash ? fmtInput(cash.value, cash.unit) : "" }))}</span><span class="wi-muted">${esc(over ? t("meter.over") : t("meter.left", { pct: pct(Math.max(0, 1 - share)) }))}</span></p></div>`;
}

/**
 * Price change and the 2027 minimum wage, when the owner gave the staff hours paid at or near it: what the new price
 * brings a week against what the wage rise costs a week, in one unit (euros a week), from the engine's wageRise
 * (or its two figures). Nothing without them.
 */
export function wageRise(a: Analysis): { gainWeek: number; costWeek: number; leftWeek: number; plain: string; maths: string } | null {
  if (a.template !== "price_change") return null;
  const w = a.wageRise;
  if (w && Number.isFinite(w.costWeek) && w.costWeek > 0) return { gainWeek: w.gainWeek, costWeek: w.costWeek, leftWeek: w.leftWeek, plain: w.plain, maths: w.maths };
  const cost = a.current.find((f) => f.id === "min_wage_rise_week");
  const left = a.current.find((f) => f.id === "left_after_wage_rise_week");
  if (!cost || !left || !(cost.value > 0)) return null;
  return { gainWeek: left.value + cost.value, costWeek: cost.value, leftWeek: left.value, plain: "", maths: [cost.maths, left.maths].filter(Boolean).join("\n\n") };
}

export function wageChart(a: Analysis, width: number): string {
  const w = wageRise(a);
  if (!w) return "";
  const rows = [
    { label: t("wage.gain"), value: w.gainWeek },
    { label: t("wage.cost"), value: -w.costWeek },
    { label: t("wage.left"), value: w.leftWeek, highlight: true },
  ];
  return barsSvg(rows, {
    width,
    id: "wi-chart-wage",
    title: t("wage.title"),
    desc: rows.map((r) => `${r.label}: ${wholeSigned(r.value)}`).join("; "),
  });
}

function wageRiseCard(input: ReportInput): string {
  const a = input.analysis;
  const w = wageRise(a);
  if (!w) return "";
  return `<figure class="wi-card wi-chart wi-wage" id="wi-wage">
  <figcaption><span class="wi-chart-title">${esc(t("wage.title"))}</span>${chip("calculation")}<span class="wi-chart-sub">${esc(t("wage.sub"))}</span></figcaption>
  <div class="wi-chart-box" data-wi-chart="wage">${wageChart(a, CHART_W)}</div>
  ${w.plain ? `<p class="wi-wage-plain">${esc(tidyMinus(w.plain))}</p>` : ""}
  ${mathsToggle(w.maths)}
</figure>`;
}

export function step3(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const days = testDays(input);
  const w = a.worstCase;
  const tableRows = a.scenarios
    .map((s) => `<tr><th scope="row">${esc(s.label)}</th><td data-label="${esc(t("th.guess"))}">${esc(fmt(s.assumptionValue, s.assumptionUnit))}</td><td data-label="${esc(t("th.overTest"))}">${esc(wholeSigned(s.netTest))}</td><td data-label="${esc(t("th.perMonth"))}">${esc(wholeSigned(s.netMonth))}</td></tr>`)
    .join("");
  // The worst case rests on a guess: say so in view (the range), and keep the long explanation one tap away.
  const hasRange = typeof w.ifAllSwitch === "number" && Number.isFinite(w.ifAllSwitch) && Math.abs(w.ifAllSwitch - w.value) >= 1;
  const allSwitch = hasRange ? `<p class="wi-worst-range">${esc(t("worst.range", { v: wholeSigned(w.ifAllSwitch!) }))}</p>` : "";
  const worstBody = hasRange
    ? `${allSwitch}${cashMeter(a)}<details class="wi-more wi-worst-more"><summary>${esc(t("worst.why"))}</summary><p>${esc(tidyMinus(w.plain))}</p>${mathsToggle(w.maths)}</details>`
    : `<p>${esc(tidyMinus(w.plain))}</p>${cashMeter(a)}${mathsToggle(w.maths)}`;
  // No loss even in the worst case: a calm card in the engine's own words, never the red alarm.
  const safe = Math.round(w.value) >= 0;
  return `${openStep(3, state)}${stepHead(3, state)}
<figure class="wi-card wi-chart">
  <figcaption><span class="wi-chart-title">${esc(days ? t("chart3.titleDays", { days }) : t("chart3.title"))}</span>${chip("calculation")}<span class="wi-chart-sub">${esc(t("chart3.sub"))}</span></figcaption>
  <div class="wi-chart-box" data-wi-chart="scenarios">${scenarioChart(input, CHART_W)}</div>
  <details class="wi-tableview"><summary>${esc(t("chart3.table"))}</summary><table class="wi-table wi-table--plain"><thead><tr><th scope="col">${esc(t("th.version"))}</th><th scope="col">${esc(t("th.guess"))}</th><th scope="col">${esc(t("th.overTest"))}</th><th scope="col">${esc(t("th.perMonth"))}</th></tr></thead><tbody>${tableRows}</tbody></table></details>
</figure>
<div class="wi-toolbar wi-noprint" data-wi-only-js hidden><button type="button" class="wi-btn wi-btn--ghost" data-wi-allmaths aria-pressed="false">${esc(t("maths.showAll"))}</button></div>
<div class="wi-scns">${scenarioCards(a, days)}</div>
${wageRiseCard(input)}
<div class="wi-callout ${safe ? "wi-callout--ok" : "wi-callout--neg"}" id="wi-step-3-worst">${safe ? ICONS.check : ICONS.warn}<div><p class="wi-callout-title">${esc(t(safe ? "worst.titleOk" : "worst.title", { v: wholeSigned(w.value) }))} ${chip("calculation")}</p>${worstBody}${hint("worstCase")}</div></div>
</section>`;
}

/* ---------------- step 4: break-even + slider ---------------- */

export function guessIndex(a: Analysis): number {
  return nearestIndex(a.sensitivity.points, a.sensitivity.current);
}

/** The break-even chart. `marks: false` while the owner has not guessed yet: no threshold lines or labels, and the description keeps quiet too. */
export function sensChart(a: Analysis, width: number, index: number, field: NetField = "netTest", marks = true): string {
  const s = a.sensitivity;
  const on = ongoingX(a);
  const lead = !marks ? t("ex.descLine") : `${s.breakEvenX !== null ? t("ex.descBe", { x: xText(s.breakEvenX, s.unit) }) : t("ex.descNoBe")}${on !== null ? ` ${t("ex.descOn", { x: xText(on, s.unit) })}` : ""}`;
  return sensitivitySvg(s, {
    width,
    index,
    field,
    ongoing: on,
    marks,
    id: "wi-chart-sens",
    title: t("ex.chartTitle", { label: s.label }),
    desc: `${lead} ${t("ex.descGuess", { x: xText(s.current, s.unit) })}`,
  });
}

/** The break-even numbers as the report writes them ("11", "7", "9,7 %"), to keep them out of view until the owner guesses. */
function thresholdTokens(a: Analysis): string[] {
  const vals = [a.breakEven, ongoingBreakEven(a)].filter((v): v is NonNullable<typeof v> => !!v && Number.isFinite(v.value));
  return [...new Set(vals.map((v) => (v.unit === "share" ? sharePct(v.value) : num(v.value))))];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text: string, tokens: string[]): boolean {
  return tokens.some((tok) => new RegExp(`(^|[^\\d.,])${escapeRe(tok)}(?![.,]?\\d)`).test(text));
}

/**
 * An engine sentence with the break-even numbers taken out, for "Why this changed" before the owner has guessed:
 * sentences that name a threshold are dropped, and so are brackets like "(that needs 11)". Empty when nothing is left.
 */
export function hideThresholds(text: string, a: Analysis): string {
  const tokens = thresholdTokens(a);
  if (!tokens.length || !text) return text;
  const sentences = text.split(/(?<=[.!?])\s+(?=[\p{Lu}„"«¿¡(])/u);
  const kept = sentences
    .map((x) => x.replace(/\s*\([^()]*\)/g, (m) => (mentions(m, tokens) ? "" : m)))
    .filter((x) => !mentions(x, tokens));
  return kept.join(" ").trim();
}

/**
 * The difference from the owner's guess, as a mechanism the owner can check by hand:
 * "3 more customers a day × €6.30 each × 10 days = +€189 compared with your guess."
 */
/** A signed amount you can check by hand: cents only when the sum has them ("+€160.50", "+€189", "−€126"). */
function exactSigned(v: number): string {
  const r = Math.round(v * 100) / 100;
  const body = Number.isInteger(r) ? money(r, false) : price(r);
  return r > 0 ? `+${body}` : body;
}

export function mechanism(a: Analysis, index: number, days: number | undefined): string {
  const s = a.sensitivity;
  const p = s.points[Math.max(0, Math.min(s.points.length - 1, index))];
  const gp = s.points[guessIndex(a)];
  if (!p || !gp) return "";
  const dx = p.x - gp.x;
  // At the guess: name the slope itself (the engine's "each extra customer a day adds …"), the transferable mechanism.
  if (Math.abs(dx) < 1e-9) return s.perStep?.plain?.trim() || t("ex.isGuess");
  // The engine's numbers when it gives them (vsGuess, perStep); otherwise the slope between the two points.
  const delta = typeof p.vsGuess === "number" && Number.isFinite(p.vsGuess) ? p.vsGuess : p.netTest - gp.netTest;
  const slope = delta / dx;
  if (s.unit === "share") {
    const pp = Math.abs(dx) * 100;
    const per = s.perStep && Number.isFinite(s.perStep.netTest) ? s.perStep.netTest : Math.round((slope / 100) * 100) / 100;
    return t(dx > 0 ? "mech.ppUp" : "mech.ppDown", { n: num(Math.round(pp * 10) / 10), per: price(per), total: wholeSigned(delta) });
  }
  if (s.unit === "customers/day" && days) {
    const perTest = s.perStep && Number.isFinite(s.perStep.netTest) ? s.perStep.netTest : slope;
    const per = Math.round((perTest / days) * 100) / 100;
    const total = typeof p.vsGuess === "number" && Number.isFinite(p.vsGuess) ? p.vsGuess : dx * per * days;
    return t(dx > 0 ? "mech.more" : "mech.fewer", { n: num(Math.abs(dx)), count: Math.abs(dx), per: price(per), days: num(days), total: exactSigned(total) });
  }
  return t("ex.vs", { d: wholeSigned(delta), g: xText(gp.x, s.unit) });
}

/** The live sentence under the slider. Shared by the server render and the client. */
export function readout(a: Analysis, index: number, days: number | undefined): { html: string; why: string; diff: string; valueText: string } {
  const s = a.sensitivity;
  const p = s.points[Math.max(0, Math.min(s.points.length - 1, index))];
  if (!p) return { html: "", why: "", diff: "", valueText: "" };
  const xs = xText(p.x, s.unit);
  const valueText = `${s.label}: ${xs}`;
  const html = `<p class="wi-readout-main"><span class="wi-readout-x">${esc(s.label)}: <strong>${esc(xs)}</strong></span><span class="wi-readout-net wi-${tone(p.netTest)}">${esc(wholeSigned(p.netTest))} <small>${esc(overTest(days))} · ${esc(netWords(p.netTest))}</small></span><span class="wi-readout-month">${esc(t("scn.month", { v: wholeSigned(p.netMonth) }))}</span></p>`;
  return { html, why: tidyMinus(p.explanation), diff: tidyMinus(mechanism(a, index, days)), valueText };
}

/**
 * For a guess below the break-even: the costs gut feeling tends to miss, in the owner's own numbers
 * (what a deal leaves after VAT and ingredients, what switching regulars cost a day), from the engine's figures.
 */
export function gutMisses(a: Analysis): string {
  const fig = (id: string) => a.current.find((f) => f.id === id);
  if (a.template === "lunch_offer") {
    const m = fig("deal_margin");
    const offer = a.inputs.find((i) => i.key === "offer_price");
    if (!m || !offer || typeof offer.value !== "number") return "";
    const sw = fig("switch_cost_day");
    const p = { price: fmtInput(offer.value, offer.unit), m: price(m.value) };
    return sw && sw.value > 0.005 ? t("predict.lowWhy", { ...p, sw: price(sw.value) }) : t("predict.lowWhyMargin", p);
  }
  if (a.template === "price_change") {
    const old = fig("margin_now");
    const nw = fig("margin_new");
    return old && nw ? t("predict.lowWhyPrice", { old: price(old.value), new: price(nw.value) }) : "";
  }
  return "";
}

/** What the predict-then-check box says once the owner has guessed (or skipped). Plain text. */
export function predictFeedback(a: Analysis, guess: number | null): string {
  const be = a.breakEven;
  const share = be.unit === "share";
  const beText = share ? sharePct(be.value) : fmt(be.value, be.unit);
  if (guess === null || !Number.isFinite(guess)) return t("predict.skipped", { be: beText });
  const target = share ? Math.abs(be.value) * 100 : be.value;
  const gText = share ? pct(Math.abs(guess) / 100, Number.isInteger(guess) ? 0 : 1) : fmt(guess, be.unit);
  const gap = Math.abs(target - Math.abs(guess));
  const dText = share ? pct(gap / 100, Number.isInteger(Math.round(gap * 10) / 10) ? 0 : 1) : num(Math.round(gap * 10) / 10);
  if (gap < 0.5) return t("predict.spot", { g: gText, be: beText });
  if (Math.abs(guess) < target) {
    const on = ongoingBreakEven(a);
    const extra = on && !share && guess >= on.value ? ` ${t("predict.lowOngoing", { on: fmt(on.value, on.unit) })}` : "";
    const why = gutMisses(a);
    return `${t("predict.low", { g: gText, be: beText, d: dText })}${extra}${why ? ` ${why}` : ""}`;
  }
  return t("predict.high", { g: gText, be: beText, d: dText });
}

function predictBox(a: Analysis): string {
  const share = a.breakEven.unit === "share";
  const unit = share ? "%" : isCountUnit(a.breakEven.unit) ? (a.breakEven.unit === "customers/day" ? t("u.aDay") : t("u.aWeek")) : "";
  return `<div class="wi-predict wi-noprint" data-wi-predict hidden>
  <h3 class="wi-h3">${esc(t("predict.title"))}</h3>
  <label class="wi-predict-q" for="wi-predict-in">${esc(t("predict.q", { label: a.breakEven.label }))}</label>
  <div class="wi-predict-row"><span class="wi-predict-field"><input class="wi-input" id="wi-predict-in" type="number" inputmode="decimal" step="any" min="0"${share ? ' max="100"' : ""} aria-describedby="wi-predict-note">${unit ? `<span class="wi-predict-unit">${esc(unit)}</span>` : ""}</span><button type="button" class="wi-btn" data-wi-predict-check>${esc(t("predict.check"))}</button><button type="button" class="wi-btn wi-btn--link" data-wi-predict-skip>${esc(t("predict.skip"))}</button></div>
  <p class="wi-muted wi-small" id="wi-predict-note">${esc(t("predict.note"))}</p>
</div>`;
}

/**
 * Under the slider chart, the two numbers in the engine's framing: the solid line pays back the test (setup included),
 * the dashed one is where each day pays its way, the number for keeping it. Also why the marker sits right of where the
 * line crosses zero (whole customers). Hidden, like the markers, until the owner has guessed.
 */
function twoNumbers(a: Analysis): string {
  const be = a.breakEven;
  const on = ongoingBreakEven(a);
  const s = a.sensitivity;
  const parts: string[] = [];
  if (on) parts.push(t("ex.two", { be: fmt(be.value, be.unit), on: fmt(on.value, on.unit) }));
  if (isCountUnit(be.unit) && be.unit === s.unit && be.reachable) {
    const x = zeroCrossing(s.points, "netTest");
    if (x !== null && x < be.value - 0.05 && be.value - x < 1) parts.push(t("ex.rounded", { exact: num(Math.round(x * 10) / 10), be: fmt(be.value, be.unit) }));
  }
  return parts.length ? `<p class="wi-ex-two" data-wi-be-reveal>${parts.map(esc).join(" ")}</p>` : "";
}

export function step4(input: ReportInput, state: StepState): string {
  const a = input.analysis;
  const be = a.breakEven;
  const bv = bigValue(be.value, be.unit);
  const s = a.sensitivity;
  const days = testDays(input);
  const g = guessIndex(a);
  const r = readout(a, g, days);
  const on = ongoingBreakEven(a);
  const reach = be.reachable ? "" : `<p class="wi-badge wi-badge--warn">${ICONS.warn} ${esc(t("be.unreachable"))}</p>`;
  const guessInput = a.inputs.find((i) => i.key === s.key);
  const ongoingLine = on
    ? `<div class="wi-be-ongoing"><p><span class="wi-be-ongoing-k">${esc(t("be.ongoingK"))}</span> ${esc(on.label ? `${on.label}: ` : t("be.ongoingV"))}<strong>${esc(fmt(on.value, on.unit))}</strong></p>${mathsToggle([on.plain, on.maths].filter(Boolean).join("\n\n"))}</div>`
    : "";
  // Two or three things worth knowing, one tap away (their numbers are already on the card above).
  const warnings = a.warnings.length
    ? `<details class="wi-callout wi-callout--warn wi-warn-d" data-wi-be-reveal><summary>${ICONS.warn}<span>${esc(t("warn.title"))} (${a.warnings.length})</span></summary>${list(a.warnings)}</details>`
    : "";
  const explorer = s.points.length
    ? `<div class="wi-card wi-explorer" data-wi-explorer>
  <div class="wi-explorer-head"><h3 class="wi-h3">${esc(t("ex.title"))}</h3>${chip("calculation")}</div>
  <p class="wi-muted wi-small">${esc(on ? t("ex.helpTwo") : t("ex.help"))}</p>
  <div class="wi-chart-box" data-wi-chart="sens">${sensChart(a, CHART_W, g)}</div>
  ${twoNumbers(a)}
  <div class="wi-slider-row">
    <label class="wi-slider-label" for="wi-slider">${esc(s.label)}</label>
    <input class="wi-slider" id="wi-slider" type="range" min="0" max="${Math.max(0, s.points.length - 1)}" step="1" value="${g}" aria-valuetext="${esc(r.valueText)}" aria-describedby="wi-readout">
    <div class="wi-slider-scale" aria-hidden="true"><span>${esc(xText(s.points[0]!.x, s.unit))}</span><span>${esc(xText(s.points[s.points.length - 1]!.x, s.unit))}</span></div>
  </div>
  <output class="wi-readout" id="wi-readout" for="wi-slider" data-wi-readout>${r.html}</output>
  <div class="wi-whybox"><h4 class="wi-h4">${esc(t("ex.why"))}</h4><p class="wi-diff" data-wi-diff aria-live="polite">${esc(r.diff)}</p><p data-wi-why aria-live="polite">${esc(r.why)}</p></div>
  <details class="wi-tableview"><summary>${esc(t("ex.table"))}</summary><table class="wi-table wi-table--plain"><thead><tr><th scope="col">${esc(s.label)}</th><th scope="col">${esc(t("th.overTest"))}</th><th scope="col">${esc(t("th.perMonth"))}</th></tr></thead><tbody>${s.points
    .map((p) => `<tr${s.breakEvenX !== null && Math.abs(p.x - s.breakEvenX) < 1e-9 ? ' class="is-be"' : ""}><th scope="row">${esc(xText(p.x, s.unit))}</th><td data-label="${esc(t("th.overTest"))}">${esc(wholeSigned(p.netTest))}</td><td data-label="${esc(t("th.perMonth"))}">${esc(wholeSigned(p.netMonth))}</td></tr>`)
    .join("")}</tbody></table></details>
</div>`
    : "";
  return `${openStep(4, state)}${stepHead(4, state)}
<div class="wi-card wi-breakeven" data-wi-be-card>
  ${predictBox(a)}
  <p class="wi-predict-out" data-wi-predict-out aria-live="polite"></p>
  <div class="wi-be-label" data-wi-be-head><span>${esc(be.label)}</span> ${chip("calculation")}</div>
  <p class="wi-be-value" data-wi-be-value><span class="wi-be-big">${esc(bv.big)}</span>${bv.small ? `<span class="wi-be-small">${esc(bv.small)}</span>` : ""}</p>
  <div data-wi-be-more>
  ${reach}
  <p class="wi-be-plain">${esc(tidyMinus(be.plain))}</p>
  ${guessInput ? `<p class="wi-be-vs"><span>${esc(t("be.yourGuess"))} <strong>${esc(fmtInput(guessInput.value, guessInput.unit))}</strong></span>${inputSources(guessInput.source, guessInput.kind).map(chip).join(" ")}</p>` : ""}
  ${mathsToggle(be.maths)}
  ${ongoingLine}
  <div class="wi-hints">${hint("breakEven")}${on ? `${hint("payBack")}${hint("paysItsWay")}` : ""}</div>
  </div>
</div>
${warnings}
${explorer}
</section>`;
}

/* ---------------- step 6: what to test, test plan, result ---------------- */

/** A blank daily tally for the printed card: one column per test day, the rows the test counts, and an average column. */
function tallyGrid(a: Analysis, plan: TestPlan): string {
  const days = Math.max(1, Math.min(31, Math.round(plan.days)));
  const item = String(input(a, "item")?.value ?? "") || t("cmp.theItem");
  const rows =
    a.template === "price_change"
      ? [t("tally.price.sold", { item: cap1(item) }), t("tally.price.alt"), t("tally.price.remarks")]
      : [t("tally.lunch.customers"), t("tally.lunch.deals"), t("tally.lunch.regulars")];
  const chunks: [number, number][] = [];
  for (let d = 1; d <= days; d += 16) chunks.push([d, Math.min(days, d + 15)]);
  const tables = chunks
    .map(([from, to], k) => {
      const cols = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      const last = k === chunks.length - 1;
      const head = `<tr><th scope="col">${esc(t("tally.day"))}</th>${cols.map((d) => `<th scope="col">${d}</th>`).join("")}${last ? `<th scope="col" class="wi-tally-avg">${esc(t("tally.avg"))}</th>` : ""}</tr>`;
      const body = rows.map((r) => `<tr><th scope="row">${esc(r)}</th>${cols.map(() => "<td></td>").join("")}${last ? `<td class="wi-tally-avg"></td>` : ""}</tr>`).join("");
      return `<table class="wi-tally"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    })
    .join("");
  return `<div class="wi-tc-block wi-tally-wrap"><h4 class="wi-h4">${esc(t("tally.title"))}</h4>${tables}<p class="wi-tally-base">${esc(t(a.template === "price_change" ? "tally.basePrice" : "tally.baseLunch"))}</p></div>`;
}

type Verdict = "keep" | "tweak" | "stop";

/** Two practice questions on the rule just agreed (retrieval before the real test), from the plan's own thresholds; none without them. */
function selfCheck(plan: TestPlan): string {
  const r = plan.rule;
  if (!r || !r.testable || !(r.keepFrom > r.tweakFrom) || r.tweakFrom <= 0) return "";
  const lunch = r.unit === "customers/day";
  const word = (v: Verdict) => t(v === "keep" ? "tc.keep" : v === "tweak" ? "tc.tweak" : "tc.stop");
  const qs: { x: number; answer: Verdict; sunk: boolean }[] = [];
  qs.push({ x: lunch ? Math.max(r.tweakFrom, r.keepFrom - 1) : Math.round((r.tweakFrom + r.keepFrom) / 2), answer: "tweak", sunk: false });
  if (lunch && r.payBackFrom !== undefined && r.payBackFrom - 1 >= r.keepFrom) qs.push({ x: r.payBackFrom - 1, answer: "keep", sunk: true });
  else qs.push({ x: lunch ? r.tweakFrom - 1 : Math.max(0, r.tweakFrom - Math.max(1, Math.ceil(r.tweakFrom * 0.05))), answer: "stop", sunk: false });
  const items = qs
    .map((q, i) => {
      const x = fmt(q.x, r.unit);
      const why = `${t(`sc.why.${q.answer}` as MsgKey, { x, keep: fmt(r.keepFrom, r.unit), tweak: fmt(r.tweakFrom, r.unit) })}${q.sunk ? t("sc.why.sunk") : ""}`;
      const text = lunch ? t(q.sunk ? "sc.qSunk" : "sc.qLunch", { n: num(q.x) }) : t("sc.qUnits", { n: num(q.x) });
      const opts = (["keep", "tweak", "stop"] as const)
        .map((v) => `<button type="button" class="wi-btn wi-btn--ghost wi-sc-opt is-${v}" data-wi-sc="${v}" aria-pressed="false">${esc(word(v))}</button>`)
        .join("");
      return `<li class="wi-sc-q" data-answer="${q.answer}" data-right="${esc(t("sc.right", { why }))}" data-wrong="${esc(t("sc.wrong", { why }))}"><p class="wi-sc-text" id="wi-sc-q${i + 1}">${esc(text)}</p><div class="wi-sc-opts" role="group" aria-labelledby="wi-sc-q${i + 1}">${opts}</div><p class="wi-sc-out" aria-live="polite"></p></li>`;
    })
    .join("");
  return `<details class="wi-more wi-selfcheck wi-noprint" data-wi-selfcheck data-wi-only-js hidden><summary><span>${esc(t("sc.title"))}</span></summary><p class="wi-muted wi-small">${esc(t("sc.note"))}</p><ol class="wi-sc-list">${items}</ol></details>`;
}

function testCard(a: Analysis, plan: TestPlan): string {
  const measure = plan.measure.length
    ? `<div class="wi-tc-block"><h4 class="wi-h4">${esc(t("tc.measure"))}</h4><ul class="wi-tc-measure">${plan.measure.map((m) => `<li><strong>${esc(m.what)}</strong><span>${esc(m.how)}</span></li>`).join("")}</ul></div>`
    : "";
  const checkins = plan.checkIns.length
    ? `<div class="wi-tc-block"><h4 class="wi-h4">${esc(t("tc.checkins"))}</h4><ol class="wi-tc-days">${plan.checkIns.map((c) => `<li><span class="wi-tc-day">${esc(t("tc.day", { n: c.day }))}</span><span>${esc(c.look)}</span></li>`).join("")}</ol></div>`
    : "";
  const items = plan.before.length + plan.during.length + plan.measure.length + plan.checkIns.length;
  return `<article class="wi-card wi-testcard" id="wi-testcard" aria-labelledby="wi-testcard-h">
  <header class="wi-tc-head"><p class="wi-eyebrow">${esc(t("tc.eyebrow"))}</p><h3 id="wi-testcard-h" class="wi-tc-title">${esc(plan.title)}</h3><p class="wi-tc-days-badge">${esc(fmt(plan.days, "days"))}</p></header>
  <p class="wi-tc-plain">${esc(plan.plain)}</p>
  <div class="wi-tc-block"><h4 class="wi-h4">${esc(t("tc.rule"))}</h4>
    ${plan.rule && plan.rule.payBackFrom !== undefined && plan.rule.payBackFrom > plan.rule.keepFrom ? `<p class="wi-tc-two">${esc(t("tc.twoNumbers", { keep: fmt(plan.rule.keepFrom, plan.rule.unit), pay: fmt(plan.rule.payBackFrom, plan.rule.unit) }))}</p>` : ""}
    <div class="wi-rule">
      <div class="wi-rule-item is-keep">${ICONS.keep}<p><strong>${esc(t("tc.keep"))}</strong>${esc(plan.decisionRule.keep)}</p></div>
      <div class="wi-rule-item is-tweak">${ICONS.tweak}<p><strong>${esc(t("tc.tweak"))}</strong>${esc(plan.decisionRule.tweak)}</p></div>
      <div class="wi-rule-item is-stop">${ICONS.stop}<p><strong>${esc(t("tc.stop"))}</strong>${esc(plan.decisionRule.stop)}</p></div>
    </div>
  </div>
  <details class="wi-more wi-tc-more"><summary>${esc(t("tc.more", { n: items, count: items }))}</summary>
  <div class="wi-tc-grid">
    <div class="wi-tc-block"><h4 class="wi-h4">${esc(t("tc.before"))}</h4>${list(plan.before, "wi-checklist")}</div>
    <div class="wi-tc-block"><h4 class="wi-h4">${esc(t("tc.during"))}</h4>${list(plan.during, "wi-checklist")}</div>
    ${measure}
    ${checkins}
  </div>
  <p class="wi-tc-cap"><strong>${esc(t("tc.cap"))}</strong> ${esc(plan.costCap)}</p>
  </details>
  ${tallyGrid(a, plan)}
  <div class="wi-tc-actions wi-noprint"><button type="button" class="wi-btn" data-wi-print>${ICONS.printer}<span>${esc(t("tc.print"))}</span></button></div>
</article>`;
}

export function resultLine(input: ReportInput, width: number): string {
  const a = input.analysis;
  const res = input.result;
  if (!res) return "";
  const unit = a.scenarios[0]?.assumptionUnit ?? a.sensitivity.unit;
  const marks: LineMark[] = a.scenarios.map((s) => ({ x: s.assumptionValue, label: `${s.label}: ${xText(s.assumptionValue, unit)}`, kind: "scenario" }));
  const on = ongoingBreakEven(a);
  const two = !!on && on.unit === unit;
  if (a.breakEven.unit === unit) marks.push({ x: a.breakEven.value, label: t(two ? "chart.payBack" : "chart.be", { x: xText(a.breakEven.value, unit) }), kind: "breakeven" });
  if (on && two) marks.push({ x: on.value, label: t("chart.ongoing", { x: xText(on.value, unit) }), kind: "breakeven" });
  marks.push({ x: res.actual, label: t("res.happened", { x: xText(res.actual, unit) }), kind: "actual" });
  return numberLineSvg(marks, {
    width,
    id: "wi-chart-result",
    unit,
    title: t("res.lineTitle"),
    desc: `${res.actualLabel}: ${xText(res.actual, unit)}. ${t("res.lineGuesses")}: ${a.scenarios.map((s) => `${s.label} ${xText(s.assumptionValue, unit)}`).join(", ")}.`,
  });
}

export function resultBars(input: ReportInput, width: number): string {
  const a = input.analysis;
  const res = input.result;
  if (!res) return "";
  const rows = [
    ...a.scenarios.map((s) => ({ label: s.label, sub: t("res.guessSub"), value: s.netTest, role: "muted" as const })),
    { label: t("res.happenedShort"), sub: t("res.measuredSub"), value: res.netTest, highlight: true },
  ];
  return barsSvg(rows, {
    width,
    id: "wi-chart-result-net",
    title: t("res.barsTitle"),
    desc: rows.map((r) => `${r.label}: ${wholeSigned(r.value)}`).join("; "),
  });
}

const OBSERVED_KEYS = [
  "baseline_lunch_customers",
  "test_lunch_customers",
  "redemptions_per_day",
  "regulars_per_day",
  "days_run",
  "actual_setup_cost",
  "units_before_per_week",
  "units_after_per_week",
] as const;

const OBSERVED_UNIT: Record<string, ResolvedInput["unit"]> = {
  baseline_lunch_customers: "customers/day",
  test_lunch_customers: "customers/day",
  redemptions_per_day: "customers/day",
  regulars_per_day: "customers/day",
  days_run: "days",
  actual_setup_cost: "EUR",
  units_before_per_week: "units/week",
  units_after_per_week: "units/week",
};

function observedValue(k: string, v: unknown): string {
  if (typeof v !== "number") return String(v);
  const u = OBSERVED_UNIT[k];
  return u ? fmtInput(v, u) : num(v);
}

function observedLabel(k: string): string {
  return (OBSERVED_KEYS as readonly string[]).includes(k) ? t(`obs.${k}` as MsgKey) : k.replace(/_/g, " ");
}

function resultBlock(input: ReportInput): string {
  const res = input.result;
  if (!res) return "";
  const verdictIcon = res.verdict === "keep" ? ICONS.keep : res.verdict === "tweak" ? ICONS.tweak : ICONS.stop;
  // The after-test demo's counts are made up: they wear the demo label, never "Your number".
  const measured: Source = input.analysis.demo ? "demo" : "owner";
  const obs = Object.entries(res.observed)
    .map(([k, val]) => `<li><span>${esc(observedLabel(k))}</span><strong>${esc(observedValue(k, val))}</strong></li>`)
    .join("");
  const unit = input.analysis.scenarios[0]?.assumptionUnit ?? input.analysis.sensitivity.unit;
  return `<div class="wi-card wi-result" aria-labelledby="wi-result-h">
  <h3 class="wi-h3" id="wi-result-h">${esc(t("res.title"))}</h3>
  <div class="wi-result-top">
    <p class="wi-verdict is-${esc(res.verdict)}">${verdictIcon}<span><small>${esc(t("res.ruleSays"))}</small>${esc(t(`res.verdict.${res.verdict}` as MsgKey))}</span></p>
    <p class="wi-result-actual"><span class="wi-muted">${esc(res.actualLabel)}</span><strong>${esc(xText(res.actual, unit))}</strong><span>${esc(t(`res.closest.${res.closestScenario}` as MsgKey))}</span>${chip(measured)}</p>
    <p class="wi-result-net wi-${tone(res.netTest)}"><span class="wi-muted">${esc(t("res.net"))}</span><strong>${esc(wholeSigned(res.netTest))}</strong>${chip("calculation")}</p>
  </div>
  <p>${esc(tidyMinus(res.plain))}</p>
  <figure class="wi-chart"><figcaption><span class="wi-chart-title">${esc(t("res.lineCap"))}</span><span class="wi-chart-sub">${esc(t("res.lineSub"))}</span></figcaption><div class="wi-chart-box" data-wi-chart="result">${resultLine(input, CHART_W)}</div></figure>
  <figure class="wi-chart"><figcaption><span class="wi-chart-title">${esc(t("res.net"))}</span><span class="wi-chart-sub">${esc(t("res.barsSub"))}</span></figcaption><div class="wi-chart-box" data-wi-chart="result-net">${resultBars(input, CHART_W)}</div></figure>
  ${res.learned.length ? `<h4 class="wi-h4">${esc(t("res.learned"))}</h4>${list(res.learned)}` : ""}
  ${obs ? `<details class="wi-tableview"><summary>${esc(t("res.measured"))} ${chip(measured)}</summary><ul class="wi-observed">${obs}</ul></details>` : ""}
</div>`;
}

/** "Which guess matters most": the bridge from the maths to the test (the longest bar is what the test checks). */
function whatToTest(input: ReportInput): string {
  const bu = input.analysis.biggestUncertainty;
  if (!bu || !bu.label) return "";
  return `<figure class="wi-card wi-chart wi-unc">
  <figcaption><span class="wi-chart-title">${esc(t("unc.title"))}</span>${chip("calculation")}</figcaption>
  <p class="wi-big-unc"><strong>${esc(bu.label)}</strong> — ${esc(bu.plain)}</p>
  ${bu.ranking.length ? `<details class="wi-more wi-unc-more" data-wi-open-wide><summary>${esc(t("unc.compare", { n: Math.min(6, bu.ranking.length), count: Math.min(6, bu.ranking.length) }))}</summary><p class="wi-muted wi-small">${esc(t("unc.sub"))}</p><div class="wi-chart-box" data-wi-chart="uncertainty">${uncertaintyChart(input, CHART_W)}</div></details>` : ""}
</figure>`;
}

export function step6(input: ReportInput, state: StepState): string {
  const plan = input.plan;
  const by = madeBy(input);
  const tried = by === "try";
  // No AI coach on /try or in the demo: the result goes in through the page's own "log your result".
  const noCoach = by === "try" || by === "demo";
  const body = plan ? testCard(input.analysis, plan) : `<div class="wi-card wi-empty"><p><strong>${esc(t("tc.none"))}</strong> ${esc(t(tried ? "tc.noneTry" : "tc.noneAsk"))}</p></div>`;
  const practice = plan && !input.result ? selfCheck(plan) : "";
  const waiting =
    plan && !input.result
      ? `<div class="wi-callout wi-callout--info">${ICONS.info}<div><p><strong>${esc(t("tc.backTitle"))}.</strong> ${esc(t(noCoach ? "tc.backTry" : "tc.back"))}</p></div></div>`
      : "";
  return `${openStep(6, state)}${stepHead(6, state)}${whatToTest(input)}${body}${practice}${waiting}${resultBlock(input)}</section>`;
}

/* ---------------- closing: what you learned ---------------- */

/** One AI lesson in the owner's own numbers, in three short lines, plus the take-home rule. */
function aiLesson(input: ReportInput): string {
  const a = input.analysis;
  const reh = input.rehearsal;
  const calc = calculatedCount(a);
  const { guesses, filled } = guessCounts(a);
  const lines = [
    t("ai.calc", { n: calc, count: calc }),
    `${t("ai.guess", { n: guesses, count: guesses })}${filled ? t("ai.filled", { n: filled, count: filled }) : ""}`,
    reh ? t("ai.imag", { n: reh.personas.length, count: reh.personas.length, played: whoPlayedShort(reh) }) : t("ai.imagNone"),
  ];
  return `<div class="wi-card wi-ai-lesson" aria-labelledby="wi-ai-h">
  <h3 class="wi-h3" id="wi-ai-h">${ICONS.bot}<span>${esc(t("ai.title"))}</span></h3>
  <ul class="wi-ai-lines"><li>${chip("calculation")}<span>${esc(lines[0]!)}</span></li><li>${chip("assumption")}<span>${esc(lines[1]!)}</span></li><li>${chip("imagined")}<span>${esc(lines[2]!)}</span></li></ul>
  <p class="wi-rule-box"><strong>${esc(t("ai.ruleK"))}</strong> ${esc(t("ai.rule"))}</p>
</div>`;
}

function lesson(l: string): string {
  return `<li>${ICONS.check}<span>${esc(l)}</span></li>`;
}

export function closing(input: ReportInput): string {
  const a = input.analysis;
  const method = [1, 2, 3].map((i) => ({ t: t(`method.${i}.t` as MsgKey), d: t(`method.${i}.d` as MsgKey) }));
  return `<section class="wi-step wi-closing" id="wi-learned" aria-labelledby="wi-learned-h">
<header class="wi-step-head"><p class="wi-step-no"><span>${esc(t("learn.eyebrow"))}</span></p><h2 id="wi-learned-h">${esc(t("learn.title"))}</h2></header>
${a.lessons.length ? `<div class="wi-card"><ul class="wi-lessons">${a.lessons.slice(0, 1).map(lesson).join("")}</ul>${a.lessons.length > 1 ? `<details class="wi-lessons-more"><summary>${esc(t("learn.more", { n: a.lessons.length - 1, count: a.lessons.length - 1 }))}</summary><ul class="wi-lessons">${a.lessons.slice(1).map(lesson).join("")}</ul></details>` : ""}</div>` : ""}
${aiLesson(input)}
${a.nextQuestions.length ? `<details class="wi-more wi-nextq-more"><summary>${esc(t("learn.next"))} (${a.nextQuestions.length})</summary><ul class="wi-nextq">${a.nextQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></details>` : ""}
<div class="wi-card wi-method"><h3 class="wi-h3">${esc(t("method.title"))}</h3><ol class="wi-method-steps">${method
    .map((m, i) => `<li><span class="wi-method-n" aria-hidden="true">${i + 1}</span><div><strong>${esc(m.t)}</strong><p>${esc(m.d)}</p></div></li>`)
    .join("")}</ol><p class="wi-muted wi-small">${esc(t("method.note"))}</p></div>
<div class="wi-two">
  <div class="wi-card wi-glossary"><details><summary><h3 class="wi-h3">${esc(t("gloss.title", { n: TERMS.length }))}</h3></summary><dl>${TERMS.map((id) => `<div><dt>${esc(termWord(id))}</dt><dd>${esc(termDef(id))}</dd></div>`).join("")}</dl></details></div>
  <div class="wi-card wi-privacy"><details data-wi-open-wide><summary><h3 class="wi-h3">${ICONS.lock}<span>${esc(t("priv.title"))}</span></h3></summary><p>${esc(t("priv.p1"))}</p><p class="wi-muted wi-small">${esc(t("priv.p2"))}</p></details></div>
</div>
<p class="wi-footnote">${esc(t("foot"))}</p>
</section>`;
}
