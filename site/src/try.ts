/**
 * /try — "Try with your numbers": a one-question-per-screen wizard for café
 * owners without an AI app. Template → Kiez → the required facts and the plan
 * (for the lunch deal also what a lunch guest spends today) → "What will the
 * test cost you?" (setup, extra staff hours, the hourly cost, promotion, spare
 * cash) → the likely guess → a check of all numbers, where every value What-IF
 * assumed is listed with an inline field ("Assumed — please check") → a
 * ShareState in the report link (/r#token). Also logs a test result:
 * /try#log=<report token> asks for the counted numbers and writes `observed`.
 *
 * Everything runs in the browser: the engine checks the numbers live
 * (checkInputs), nothing is sent to a server, and the half-finished answers are
 * kept only on this device so an owner can stop between customers.
 */
import { BERLIN_KIEZE, KIEZ_OTHER } from "../../src/engine/berlin.ts";
import { checkInputs, getTemplate, OBSERVED_FIELDS, show } from "../../src/engine/index.ts";
import type { DecisionTemplate, FieldSpec, RawInputs, TemplateId, Unit } from "../../src/engine/types.ts";
import { LOCALE } from "../../src/i18n/index.ts";
import type { Lang } from "../../src/i18n/index.ts";
import { decodeState, encodeState } from "../../src/state.ts";
import type { ShareState } from "../../src/state.ts";
import { mountCodeForm } from "./lib/code.ts";
import type { CodeForm, CodeInfo } from "./lib/code.ts";
import { announce, checkBeta, el, onReady, pageLang, readStore, storedCode, syncLang, t, writeStore } from "./lib/page.ts";
import { generatedQuestion } from "./lib/question.ts";
import type { SiteKey } from "./messages.ts";

const DRAFT_KEY = "whatif.try.draft";
const TEMPLATE_IDS: TemplateId[] = ["lunch_offer", "price_change"];

/** Fields the engine could fill in, but /try asks on a screen of their own (the report leans on them). */
const TRY_REQUIRED: Partial<Record<TemplateId, string[]>> = { lunch_offer: ["lunch_spend"] };
/** The "What will the test cost you?" screen, in this order (only the fields the template has). */
const COST_KEYS: Partial<Record<TemplateId, string[]>> = {
  lunch_offer: ["setup_cost", "extra_staff_hours_per_day", "staff_hourly_cost", "marketing_per_week", "cash_buffer"],
};
/** Optional one-field screens (with "skip"), asked after the facts (only when the template has the field). */
const ASK_ALSO: Partial<Record<TemplateId, string[]>> = { price_change: ["minimum_wage_hours_per_week"] };
/** Assumed values whose engine note carries a dated fact worth reading on the check screen (derived values always show theirs). */
const NOTE_KEYS = new Set(["vat_rate", "staff_hourly_cost"]);

interface Draft {
  v: 1;
  template?: TemplateId;
  kiez?: string;
  /** What the owner typed, per template and field (raw text, parsed on use). */
  answers: Partial<Record<TemplateId, Record<string, string>>>;
  business?: string;
}

type Mode = "plan" | "log";

let root: HTMLElement;
let draft: Draft = { v: 1, answers: {} };
let mode: Mode = "plan";
let logState: ShareState | null = null;
let observedText: Record<string, string> = {};
let screen = "template";
let depth = 0;
let gateNeeded = false;
let resumeOffered = false;
let codeForm: CodeForm | null = null;
let codeInfo: CodeInfo | null = null;
/** Screen to go back to after a "Change" from a review screen. */
let returnTo: string | null = null;

/* ------------------------------------------------------------------ draft */

function loadDraft(): Draft | null {
  const raw = readStore(DRAFT_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Draft>;
    if (!d || d.v !== 1 || typeof d.answers !== "object" || d.answers === null) return null;
    const out: Draft = { v: 1, answers: {} };
    for (const id of TEMPLATE_IDS) {
      const a = (d.answers as Record<string, unknown>)[id];
      if (a && typeof a === "object") out.answers[id] = Object.fromEntries(Object.entries(a as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    }
    if (d.template && TEMPLATE_IDS.includes(d.template)) out.template = d.template;
    if (typeof d.kiez === "string") out.kiez = d.kiez;
    if (typeof d.business === "string") out.business = d.business;
    return out;
  } catch {
    return null;
  }
}

function saveDraft(): void {
  writeStore(DRAFT_KEY, JSON.stringify(draft));
}

function hasProgress(d: Draft | null): boolean {
  if (!d) return false;
  return Object.values(d.answers).some((a) => a && Object.values(a).some((v) => v.trim() !== ""));
}

function answers(id: TemplateId): Record<string, string> {
  return (draft.answers[id] ??= {});
}

/* ------------------------------------------------------------------ rough numbers */

const APPROX = /^(?:ca\.?|circa|zirka|etwa|ungefähr|ungefaehr|rund|knapp|about|around|approx\.?|roughly|maybe|aprox\.?|aproximadamente|unos|unas|alrededor de|około|okolo|ok\.?|mniej więcej|jakieś|~|≈)\s*/i;
const COUNT_UNITS = new Set<Unit>(["customers/day", "units/week", "EUR/month", "EUR/week", "days", "hours/day", "hours/week"]);

/** "1.500" → 1500, "9,90" → 9.9, "ca. 40" → 40, "40–50" → 45, "−4 %" → −0.04 for a share. */
export function parseRough(text: string, unit: Unit, lang: Lang): { ok: true; value: number } | { ok: false } | { ok: true; value: string } {
  const raw = text.trim();
  if (!raw) return { ok: false };
  if (unit === "text") return { ok: true, value: raw.slice(0, 80) };
  let s = raw.replace(/[−–—]/g, "-").replace(/ | /g, " ");
  for (let i = 0; i < 3 && APPROX.test(s); i++) s = s.replace(APPROX, "");
  // Digit groups split by a space or apostrophe: "1 500", "16'500".
  s = s.replace(/(\d)[ '’](?=\d{3}(?:\D|$))/g, "$1");
  const isPct = /%|prozent|percent|por ?ciento|procent/i.test(s);
  const tokens = [...s.matchAll(/\d[\d.,]*/g)];
  if (!tokens.length) return { ok: false };
  const first = tokens[0]!;
  const before = s.slice(0, first.index ?? 0);
  const negative = /-\s*$/.test(before) || /^\s*-/.test(before);
  const toNum = (tok: string): number => {
    let x = tok.replace(/[.,]+$/, "");
    const comma = x.lastIndexOf(","), dot = x.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) x = comma > dot ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
    else if (comma >= 0) x = lang === "en" && /^\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, "") : (x.match(/,/g)?.length ?? 0) > 1 ? x.replace(/,/g, "") : x.replace(",", ".");
    else if (dot >= 0) {
      const thousands = /^\d{1,3}(\.\d{3})+$/.test(x);
      if ((x.match(/\./g)?.length ?? 0) > 1 || (thousands && (lang !== "en" || COUNT_UNITS.has(unit)))) x = x.replace(/\./g, "");
    }
    return Number(x);
  };
  let n = toNum(first[0]);
  const second = tokens[1];
  if (second && tokens.length === 2) {
    const between = s.slice((first.index ?? 0) + first[0].length, second.index ?? 0);
    if (/^\s*(?:-|bis|to|a|y|do|und|or|oder|o)\s*$/i.test(between)) n = (n + toNum(second[0])) / 2;
  }
  if (!Number.isFinite(n)) return { ok: false };
  if (negative) n = -n;
  if (unit === "share") {
    if (isPct || Math.abs(n) > 1) n /= 100;
  }
  return { ok: true, value: Math.round(n * 1e6) / 1e6 };
}

/** A value as the owner would type it: "140", "7,40", "32" (for 32%). */
function bare(f: Pick<FieldSpec, "unit">, v: number | string, lang: Lang): string {
  if (typeof v === "string") return v;
  const nf = (n: number, digits?: number) =>
    new Intl.NumberFormat(LOCALE[lang], digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n).replace(/^-/, "−");
  if (f.unit === "share") return nf(Math.round(v * 1000) / 10);
  if (f.unit === "EUR") return nf(v, Number.isInteger(v) && v >= 100 ? 0 : 2);
  return nf(v);
}

function unitText(unit: Unit): string {
  const map: Partial<Record<Unit, SiteKey>> = {
    EUR: "t.unit_eur",
    share: "t.unit_pct",
    "customers/day": "t.unit_day",
    "units/week": "t.unit_pcs_week",
    "EUR/month": "t.unit_eur_month",
    "EUR/week": "t.unit_eur_week",
    "EUR/day": "t.unit_eur_day",
    days: "t.unit_days",
    "hours/day": "t.unit_hours_day",
    "hours/week": "t.unit_hours_week",
  };
  const key = map[unit];
  return key ? t(key) : "";
}

/* ------------------------------------------------------------------ template data */

function template(): DecisionTemplate | null {
  return draft.template ? getTemplate(draft.template, pageLang()) : null;
}

/** Required on /try: the engine's required fields plus the ones /try insists on. */
function isRequired(tpl: DecisionTemplate, f: FieldSpec): boolean {
  return f.required || (TRY_REQUIRED[tpl.id]?.includes(f.key) ?? false);
}

function requiredFields(tpl: DecisionTemplate): FieldSpec[] {
  const req = tpl.fields.filter((f) => isRequired(tpl, f) && f.key !== "kiez");
  return [...req.filter((f) => f.kind !== "assumption"), ...req.filter((f) => f.kind === "assumption")];
}

function costFields(tpl: DecisionTemplate): FieldSpec[] {
  return (COST_KEYS[tpl.id] ?? []).map((k) => tpl.fields.find((f) => f.key === k)).filter((f): f is FieldSpec => !!f && !isRequired(tpl, f));
}

function askAlsoFields(tpl: DecisionTemplate): FieldSpec[] {
  return (ASK_ALSO[tpl.id] ?? []).map((k) => tpl.fields.find((f) => f.key === k)).filter((f): f is FieldSpec => !!f && !isRequired(tpl, f));
}

/** The screens of the plan path after the Kiez: facts and plan, optional extras, the costs, the guesses, the check. */
function planScreens(tpl: DecisionTemplate): string[] {
  const req = requiredFields(tpl);
  const facts = req.filter((f) => f.kind !== "assumption").map((f) => `f:${f.key}`);
  const guesses = req.filter((f) => f.kind === "assumption").map((f) => `f:${f.key}`);
  const extra = askAlsoFields(tpl).map((f) => `f:${f.key}`);
  return [...facts, ...extra, ...(costFields(tpl).length ? ["costs"] : []), ...guesses, "review"];
}

/** The screen where the owner gives this field, if it has one. */
function screenOf(tpl: DecisionTemplate, key: string): string | null {
  if (costFields(tpl).some((f) => f.key === key)) return "costs";
  return planScreens(tpl).includes(`f:${key}`) ? `f:${key}` : null;
}

/** Raw inputs for the engine from the typed answers (parsed in the page language). */
function rawInputs(tpl: DecisionTemplate, skip?: string): RawInputs {
  const lang = pageLang();
  const a = answers(tpl.id);
  const out: RawInputs = {};
  for (const f of tpl.fields) {
    if (f.key === skip || f.key === "kiez") continue;
    const txt = a[f.key];
    if (!txt) continue;
    const p = parseRough(txt, f.unit, lang);
    if (p.ok) out[f.key] = p.value;
    else out[f.key] = txt;
  }
  if (draft.kiez && tpl.fields.some((f) => f.key === "kiez")) out.kiez = draft.kiez;
  return out;
}

/** Problems that appear because of this field (engine messages, in the page language). */
function problemsFor(tpl: DecisionTemplate, key: string): string[] {
  const lang = pageLang();
  const opts = { lang };
  const withIt = checkInputs(tpl.id, rawInputs(tpl), opts).problems;
  const without = new Set(checkInputs(tpl.id, rawInputs(tpl, key), opts).problems);
  return withIt.filter((p) => !without.has(p));
}

/* ------------------------------------------------------------------ sequence */

function obsFields(): { key: string; label: string; required: boolean; unit: Unit }[] {
  if (!logState) return [];
  const unitOf = (key: string): Unit => (key === "actual_setup_cost" ? "EUR" : key === "days_run" ? "days" : key.startsWith("units_") ? "units/week" : "customers/day");
  return (OBSERVED_FIELDS[logState.template] ?? []).map((f) => ({ ...f, unit: unitOf(f.key) }));
}

function sequence(): string[] {
  const seq: string[] = gateNeeded ? ["gate"] : [];
  if (mode === "log") {
    if (!logState) return [...seq, "template", "log-link"];
    return [...seq, ...obsFields().map((f) => `o:${f.key}`), "log-review"];
  }
  seq.push("template");
  const tpl = template();
  if (!tpl) return seq;
  return [...seq, "kiez", ...planScreens(tpl)];
}

function progress(): { n: number; total: number } | null {
  const seq = sequence().filter((s) => s !== "gate" && s !== "resume");
  const i = seq.indexOf(screen);
  if (i < 0) return null;
  const tpl = template();
  // Before a template is picked, count the questions of the lunch deal (the longer path).
  const total = mode === "plan" && !tpl ? 2 + planScreens(getTemplate("lunch_offer", pageLang())).length : seq.length;
  return { n: i + 1, total };
}

function go(next: string, opts: { replace?: boolean; focus?: boolean } = {}): void {
  screen = next;
  if (opts.replace) history.replaceState({ tryScreen: next, depth }, "");
  else {
    depth++;
    history.pushState({ tryScreen: next, depth }, "");
  }
  render(opts.focus !== false);
}

function forward(): void {
  if (returnTo && sequence().includes(returnTo)) {
    const back = returnTo;
    returnTo = null;
    go(back);
    return;
  }
  const seq = sequence();
  const i = seq.indexOf(screen);
  const next = seq[i + 1];
  if (next) go(next);
}

function backward(): void {
  if (depth > 0) {
    history.back();
    return;
  }
  const seq = sequence();
  const i = seq.indexOf(screen);
  if (i > 0) go(seq[i - 1]!, { replace: true });
}

/* ------------------------------------------------------------------ building blocks */

function shell(opts: { title: string; titleFor?: string; kind?: { label: string; chip: string; note?: string }; back?: boolean }, ...body: (Node | null | false | undefined)[]): HTMLElement {
  const p = progress();
  const top = p
    ? el(
        "div",
        { class: "s-q-top" },
        el("p", { class: "s-q-progress", text: t("t.progress", { n: p.n, total: p.total }) }),
        el("div", { class: "s-q-bar", "aria-hidden": "true" }, el("span", { style: `width:${Math.round((p.n / p.total) * 100)}%` })),
      )
    : null;
  const h = el("h2", { class: "s-q-h", id: "q-h", tabindex: "-1" });
  if (opts.titleFor) h.append(el("label", { for: opts.titleFor, text: opts.title }));
  else h.textContent = opts.title;
  const kind = opts.kind
    ? el("p", { class: "s-q-kind" }, el("span", { class: `s-chip s-chip--${opts.kind.chip}`, text: opts.kind.label }), opts.kind.note ? el("span", { class: "s-q-kind-note", text: opts.kind.note }) : null)
    : null;
  return el("section", { class: "s-q", "aria-labelledby": "q-h", "data-screen": screen }, top, kind, h, ...body);
}

function navRow(opts: { next?: string; onNext?: () => void; skip?: () => void; back?: boolean; nextType?: "submit" | "button" }): HTMLElement {
  const row = el("div", { class: "s-q-nav" });
  if (opts.back !== false) {
    const b = el("button", { type: "button", class: "s-btn s-btn--ghost s-q-back" }, el("span", { "aria-hidden": "true", text: "← " }), t("t.back"));
    b.addEventListener("click", backward);
    row.append(b);
  }
  if (opts.skip) {
    const s = el("button", { type: "button", class: "s-btn s-btn--ghost s-q-skip", text: t("t.skip") });
    s.addEventListener("click", opts.skip);
    row.append(s);
  }
  if (opts.next !== undefined) {
    const n = el("button", { type: opts.nextType ?? "submit", class: "s-btn s-q-next" }, opts.next, el("span", { "aria-hidden": "true", text: " →" }));
    if (opts.onNext) n.addEventListener("click", opts.onNext);
    row.append(n);
  }
  return row;
}

function whyBox(text: string, id = "q-why"): HTMLElement {
  return el("div", { class: "s-q-why", id }, el("p", { class: "s-q-why-t", text: t("t.why") }), el("p", { text }));
}

/** The chip says what the report will call the number (the engine's source words); the note says what kind of question it is. */
function kindOf(f: FieldSpec): { label: string; chip: string; note: string } {
  if (f.kind === "assumption") return { label: t("c.src_assumption"), chip: "assumption", note: t("t.kind_assumption") };
  if (f.kind === "choice") return { label: t("c.src_owner"), chip: "owner", note: t("t.kind_choice") };
  return { label: t("c.src_owner"), chip: "owner", note: t("t.kind_fact") };
}

/* ------------------------------------------------------------------ screens */

/** One field and one primary button ("Check code and continue"); a message shows only after the owner tried a code. */
function gateScreen(): HTMLElement {
  const box = el("div", { class: "s-q-code" });
  const section = shell({ title: t("t.gate_h") }, el("p", { class: "s-q-lede", text: t("t.gate_p") }), box);
  codeForm = mountCodeForm(
    box,
    (info) => {
      codeInfo = info;
    },
    {
      submitLabel: "t.gate_submit",
      big: true,
      onPass: () => {
        gateNeeded = false;
        go(resumeOffered ? "resume" : sequence()[0] ?? "template", { replace: true });
      },
    },
  );
  return section;
}

function resumeScreen(): HTMLElement {
  const cont = el("button", { type: "button", class: "s-btn s-q-next", text: t("t.draft_continue") });
  const fresh = el("button", { type: "button", class: "s-btn s-btn--ghost", text: t("t.draft_new") });
  cont.addEventListener("click", () => {
    const seq = sequence();
    const tpl = template();
    let target = "template";
    if (tpl) {
      const a = answers(tpl.id);
      const missing = requiredFields(tpl).find((f) => !a[f.key]?.trim());
      target = !draft.kiez ? "kiez" : missing ? `f:${missing.key}` : "review";
    }
    go(seq.includes(target) ? target : "template", { replace: true });
  });
  fresh.addEventListener("click", () => {
    draft = { v: 1, answers: {} };
    saveDraft();
    go("template", { replace: true });
  });
  return shell({ title: t("t.draft_h") }, el("p", { class: "s-q-lede", text: t("t.draft_p") }), el("div", { class: "s-q-nav s-q-nav--stack" }, cont, fresh));
}

function templateScreen(): HTMLElement {
  const option = (id: string, title: SiteKey, desc: SiteKey, onPick: () => void, pressed: boolean) => {
    const b = el("button", { type: "button", class: "s-opt", "aria-pressed": String(pressed), "data-opt": id }, el("span", { class: "s-opt-t", text: t(title) }), el("span", { class: "s-opt-d", text: t(desc) }));
    b.addEventListener("click", onPick);
    return b;
  };
  const pick = (id: TemplateId) => () => {
    mode = "plan";
    draft.template = id;
    saveDraft();
    forward();
  };
  const list = el(
    "div",
    { class: "s-opts", role: "group", "aria-labelledby": "q-h" },
    option("lunch_offer", "t.tpl_lunch_t", "t.tpl_lunch", pick("lunch_offer"), mode === "plan" && draft.template === "lunch_offer"),
    option("price_change", "t.tpl_price_t", "t.tpl_price", pick("price_change"), mode === "plan" && draft.template === "price_change"),
    option(
      "log",
      "t.tpl_log_t",
      "t.tpl_log",
      () => {
        mode = "log";
        forward();
      },
      mode === "log",
    ),
  );
  return shell({ title: t("t.tpl_h") }, el("p", { class: "s-q-lede", text: t("t.tpl_p") }), list, navRow({ back: depth > 0 }));
}

function kiezScreen(): HTMLElement {
  const names = [...BERLIN_KIEZE, KIEZ_OTHER];
  const grid = el("div", { class: "s-kiez", role: "group", "aria-labelledby": "q-h" });
  for (const k of names) {
    const label = k === KIEZ_OTHER ? t("t.kiez_other") : k;
    const b = el("button", { type: "button", class: "s-kiez-b", "aria-pressed": String(draft.kiez === k), lang: k === KIEZ_OTHER ? undefined : "de", text: label });
    b.addEventListener("click", () => {
      draft.kiez = k;
      saveDraft();
      forward();
    });
    grid.append(b);
  }
  const nav = navRow({ next: draft.kiez ? t("t.next") : undefined, nextType: "button", onNext: draft.kiez ? forward : undefined });
  return shell({ title: t("t.kiez_h") }, whyBox(t("t.kiez_why")), grid, nav);
}

function fieldScreen(tpl: DecisionTemplate, f: FieldSpec): HTMLElement {
  const lang = pageLang();
  const a = answers(tpl.id);
  const required = isRequired(tpl, f);
  const signed = f.unit === "share" && (f.min ?? 0) < 0;
  const input = el("input", {
    id: "q-in",
    class: "s-input s-input--big",
    type: "text",
    name: f.key,
    autocomplete: f.unit === "text" ? "on" : "off",
    inputmode: f.unit === "text" || signed ? "text" : "decimal",
    enterkeyhint: "next",
    "aria-describedby": "q-read q-err q-why",
    spellcheck: "false",
  });
  input.value = a[f.key] ?? "";
  input.placeholder = t("t.placeholder", { value: bare(f, f.example, lang) });
  const unit = unitText(f.unit);
  const row = el("div", { class: "s-ans" }, input, unit ? el("span", { class: "s-ans-unit", "aria-hidden": "true", text: unit }) : null);
  const read = el("p", { class: "s-q-read", id: "q-read", "aria-live": "polite" });
  const err = el("p", { class: "s-q-err", id: "q-err", role: "alert" });
  const hints = el("p", { class: "s-q-hint" }, f.unit === "text" ? "" : signed ? t("t.sign_hint") : t("t.rough"));
  const example = el("p", { class: "s-q-example" }, el("span", { class: "s-chip s-chip--demo", text: t("c.src_demo") }), " ", t("t.example", { value: show(f, f.example) }));
  const fallback = !required && f.fallback !== undefined ? el("p", { class: "s-q-hint", text: t("t.fallback", { value: show(f, f.fallback) }) }) : null;
  const note = f.kind === "assumption" ? el("p", { class: "s-q-note", text: t("t.kind_assumption_note") }) : null;
  const chips = signed ? quickChips(input, ["−10", "−5", "−2", "0", "+2"]) : null;

  let timer = 0;
  const check = (final: boolean): boolean => {
    const txt = input.value.trim();
    a[f.key] = input.value;
    saveDraft();
    err.textContent = "";
    read.textContent = "";
    input.removeAttribute("aria-invalid");
    if (!txt) {
      if (final && required) {
        err.textContent = t("t.needed");
        input.setAttribute("aria-invalid", "true");
        return false;
      }
      return true;
    }
    const p = parseRough(txt, f.unit, lang);
    if (!p.ok) {
      err.textContent = t("t.not_number");
      input.setAttribute("aria-invalid", "true");
      return false;
    }
    if (f.unit !== "text") read.textContent = t("t.read_as", { value: show(f, p.value) });
    const probs = problemsFor(tpl, f.key);
    if (probs.length) {
      err.textContent = probs.join(" ");
      input.setAttribute("aria-invalid", "true");
      return false;
    }
    return true;
  };
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => check(false), 300);
  });
  const form = el(
    "form",
    { class: "s-q-form", novalidate: true },
    row,
    chips,
    read,
    err,
    hints,
    navRow({ next: t("t.next"), skip: required ? undefined : () => { a[f.key] = ""; saveDraft(); forward(); } }),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    window.clearTimeout(timer);
    if (check(true)) forward();
    else input.focus();
  });
  if (input.value) window.setTimeout(() => check(false), 0);
  return shell({ title: f.ask, titleFor: "q-in", kind: kindOf(f) }, form, note, whyBox(f.why), example, fallback);
}

function quickChips(input: HTMLInputElement, values: string[]): HTMLElement {
  const box = el("div", { class: "s-quick", role: "group" });
  for (const v of values) {
    const b = el("button", { type: "button", class: "s-quick-b", text: `${v} %` });
    b.addEventListener("click", () => {
      input.value = v.replace("−", "-");
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
    box.append(b);
  }
  return box;
}

/** One number on a multi-field screen: label, field with unit, the read-back and any problem. Returns the row and its check. */
function numberField(tpl: DecisionTemplate, f: FieldSpec, opts: { id: string; hint?: string; example?: boolean; placeholder?: string; labelText?: string }): { row: HTMLElement; check: (final: boolean) => boolean; input: HTMLInputElement } {
  const lang = pageLang();
  const a = answers(tpl.id);
  const id = opts.id;
  const signed = f.unit === "share" && (f.min ?? 0) < 0;
  const input = el("input", {
    id,
    class: "s-input",
    type: "text",
    name: f.key,
    inputmode: f.unit === "text" || signed ? "text" : "decimal",
    autocomplete: "off",
    spellcheck: "false",
    "aria-describedby": `${id}-read ${id}-err${opts.hint ? ` ${id}-hint` : ""}`,
  });
  input.value = a[f.key] ?? "";
  input.placeholder = opts.placeholder ?? t("t.placeholder", { value: bare(f, f.example, lang) });
  const read = el("p", { class: "s-q-read", id: `${id}-read`, "aria-live": "polite" });
  const err = el("p", { class: "s-q-err", id: `${id}-err`, role: "alert" });
  const unit = unitText(f.unit);
  const check = (final: boolean): boolean => {
    a[f.key] = input.value;
    saveDraft();
    read.textContent = "";
    err.textContent = "";
    input.removeAttribute("aria-invalid");
    const txt = input.value.trim();
    if (!txt) return true;
    const p = parseRough(txt, f.unit, lang);
    if (!p.ok) {
      err.textContent = t("t.not_number");
      input.setAttribute("aria-invalid", "true");
      return false;
    }
    if (f.unit !== "text") read.textContent = t("t.read_as", { value: show(f, p.value) });
    const probs = problemsFor(tpl, f.key);
    if (probs.length) {
      err.textContent = probs.join(" ");
      input.setAttribute("aria-invalid", "true");
      return false;
    }
    return true;
  };
  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => check(false), 300);
  });
  if (input.value) window.setTimeout(() => check(false), 0);
  const row = el(
    "div",
    { class: "s-cost-f" },
    el("label", { for: id, class: "s-field-label", text: opts.labelText ?? f.label }),
    el("div", { class: "s-ans s-ans--sm" }, input, unit ? el("span", { class: "s-ans-unit", "aria-hidden": "true", text: unit }) : null),
    read,
    err,
    opts.hint ? el("p", { class: "s-q-hint", id: `${id}-hint`, text: opts.hint }) : null,
    opts.example ? el("p", { class: "s-q-example" }, el("span", { class: "s-chip s-chip--demo", text: t("c.src_demo") }), " ", t("t.example", { value: show(f, f.example) })) : null,
  );
  return { row, check, input };
}

/** "What will the test cost you?": setup, extra staff hours and their cost, promotion, and the money the owner can spare. */
function costsScreen(tpl: DecisionTemplate): HTMLElement {
  const fields = costFields(tpl);
  const hintFor = (f: FieldSpec): string | undefined => {
    if (f.key === "staff_hourly_cost" && f.fallback !== undefined) return t("t.cost_wage_hint", { value: show(f, f.fallback) });
    if (f.key === "cash_buffer") return t("t.cost_cash_hint");
    return undefined;
  };
  const lang = pageLang();
  // A field that falls back to a real value (the hourly cost: the minimum wage) shows that value, not the demo café's.
  const placeholderFor = (f: FieldSpec): string | undefined => (typeof f.fallback === "number" && f.fallback > 0 ? bare(f, f.fallback, lang) : undefined);
  const parts = fields.map((f, i) => numberField(tpl, f, { id: i === 0 ? "q-in" : `q-in-${f.key}`, hint: hintFor(f), example: true, placeholder: placeholderFor(f) }));
  const form = el("form", { class: "s-q-form s-costs", novalidate: true }, ...parts.map((p) => p.row), navRow({ next: t("t.next") }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const bad = parts.find((p) => !p.check(true));
    if (bad) bad.input.focus();
    else forward();
  });
  return shell({ title: t("t.costs_h"), kind: { label: t("c.src_owner"), chip: "owner", note: t("t.kind_choice") } }, el("p", { class: "s-q-lede", text: t("t.costs_p") }), form);
}

function questionText(tpl: DecisionTemplate, raw: RawInputs): string {
  return generatedQuestion(tpl.id, raw, pageLang()) ?? tpl.exampleQuestion;
}

/**
 * "Check your numbers": what the owner gave (each with "Change"), then every value the report
 * rests on that What-IF assumed, with the value it uses and a field to change it in place
 * ("Assumed — please check"), then the café's name.
 */
function reviewScreen(tpl: DecisionTemplate): HTMLElement {
  const lang = pageLang();
  const a = answers(tpl.id);
  const given = (f: FieldSpec) => !!a[f.key]?.trim();
  const valueText = (f: FieldSpec): string => {
    const txt = a[f.key]?.trim();
    if (!txt) return t("t.empty");
    const p = parseRough(txt, f.unit, lang);
    return p.ok ? show(f, p.value) : txt;
  };
  const change = (target: string, label: string) => {
    const b = el("button", { type: "button", class: "s-link-btn", "aria-label": t("t.change_aria", { label }), text: t("t.change") });
    b.addEventListener("click", () => {
      returnTo = "review";
      go(target);
    });
    return b;
  };

  // 1. Your numbers: everything asked on a screen, in the order it was asked.
  const rows = el("ul", { class: "s-review" });
  rows.append(
    el("li", {}, el("span", { class: "s-review-l", text: t("t.kiez_h") }), el("b", { class: "s-review-v", text: draft.kiez === KIEZ_OTHER ? t("t.kiez_other") : draft.kiez ?? t("t.empty") }), change("kiez", t("t.kiez_h"))),
  );
  const asked = tpl.fields.filter((f) => f.key !== "kiez" && screenOf(tpl, f.key));
  const order = planScreens(tpl);
  asked.sort((x, y) => order.indexOf(screenOf(tpl, x.key) ?? "") - order.indexOf(screenOf(tpl, y.key) ?? ""));
  for (const f of asked) {
    if (!isRequired(tpl, f) && !given(f)) continue; // left empty: listed under "Assumed" below
    rows.append(el("li", {}, el("span", { class: "s-review-l", text: f.label }), el("b", { class: "s-review-v", text: valueText(f) }), change(screenOf(tpl, f.key) ?? `f:${f.key}`, f.label)));
  }

  // 2. Assumed — please check: every other value the report uses, as What-IF filled it in.
  const check = checkInputs(tpl.id, rawInputs(tpl), { lang });
  const resolved = new Map(check.resolved.map((r) => [r.key, r]));
  const hours = resolved.get("extra_staff_hours_per_day")?.value;
  const assumed = el("ul", { class: "s-assumed" });
  for (const f of tpl.fields) {
    if (f.key === "kiez" || isRequired(tpl, f)) continue;
    const own = screenOf(tpl, f.key);
    if (own && given(f)) continue; // shown above with "Change"
    const r = resolved.get(f.key);
    if (f.key === "staff_hourly_cost" && !given(f) && hours === 0) continue; // no extra hours: the hourly cost plays no part
    const filled = !given(f) && r?.filledBy;
    const id = `as-${f.key}`;
    const input = el("input", {
      id,
      class: "s-input",
      type: "text",
      name: f.key,
      inputmode: f.unit === "text" || (f.unit === "share" && (f.min ?? 0) < 0) ? "text" : "decimal",
      autocomplete: "off",
      spellcheck: "false",
      "aria-describedby": `${id}-v ${id}-read`,
    });
    input.value = a[f.key] ?? "";
    input.placeholder = t("t.assumed_ph");
    const read = el("p", { class: "s-q-read", id: `${id}-read`, "aria-live": "polite" });
    const paint = () => {
      const txt = input.value.trim();
      read.textContent = "";
      read.classList.remove("is-err");
      input.removeAttribute("aria-invalid");
      if (!txt) return;
      const p = parseRough(txt, f.unit, lang);
      if (!p.ok) {
        read.textContent = t("t.not_number");
        read.classList.add("is-err");
        input.setAttribute("aria-invalid", "true");
        return;
      }
      const probs = problemsFor(tpl, f.key);
      read.textContent = probs.length ? probs.join(" ") : t("t.read_as", { value: show(f, p.value) });
      read.classList.toggle("is-err", probs.length > 0);
      if (probs.length) input.setAttribute("aria-invalid", "true");
    };
    let timer = 0;
    input.addEventListener("input", () => {
      a[f.key] = input.value;
      saveDraft();
      window.clearTimeout(timer);
      timer = window.setTimeout(paint, 300);
    });
    if (input.value) window.setTimeout(paint, 0);
    const value = given(f) ? valueText(f) : filled && r ? show(f, r.value) : null;
    const note = filled && r?.note && (r.filledBy === "derived" || NOTE_KEYS.has(f.key)) ? r.note : null;
    const unit = unitText(f.unit);
    assumed.append(
      el(
        "li",
        { class: "s-assumed-i" },
        el("label", { for: id, class: "s-review-l", text: f.label }),
        el("p", { class: "s-assumed-v", id: `${id}-v` }, value !== null ? t(given(f) ? "t.assumed_yours" : "t.assumed_uses", { value }) : t("t.assumed_none")),
        note ? el("p", { class: "s-small s-assumed-note", text: note }) : null,
        el("div", { class: "s-ans s-ans--sm" }, input, unit ? el("span", { class: "s-ans-unit", "aria-hidden": "true", text: unit }) : null),
        read,
      ),
    );
  }
  const assumedBox = assumed.childElementCount
    ? el(
        "section",
        { class: "s-assumed-box", "aria-labelledby": "as-h" },
        // The heading says what to do; the chip is the word these values wear in the report (the engine's sourceLabel).
        el("h3", { class: "s-assumed-h", id: "as-h" }, el("span", { text: t("t.assumed_h") }), " ", el("span", { class: "s-chip s-chip--assumption", text: t("c.src_assumption") })),
        el("p", { class: "s-small", text: t("t.assumed_p") }),
        assumed,
      )
    : null;

  // 3. The café's name (optional).
  const nameId = "opt-business";
  const name = el("input", { id: nameId, class: "s-input", type: "text", name: "business", autocomplete: "organization", maxlength: "80", "aria-describedby": `${nameId}-why` });
  name.value = draft.business ?? "";
  name.placeholder = t("t.cafe_placeholder");
  name.addEventListener("input", () => {
    draft.business = name.value;
    saveDraft();
  });
  const nameBox = el("div", { class: "s-more-f" }, el("label", { for: nameId, class: "s-field-label", text: t("t.cafe_name") }), name, el("p", { class: "s-small", id: `${nameId}-why`, text: t("t.cafe_name_why") }));

  const problems = el("div", { class: "s-q-problems", role: "alert", tabindex: "-1" });
  const see = el("button", { type: "button", class: "s-btn s-btn--big s-q-next" }, t("t.see_report"), el("span", { "aria-hidden": "true", text: " →" }));
  see.addEventListener("click", () => {
    const raw = rawInputs(tpl);
    const result = checkInputs(tpl.id, raw, { lang });
    if (!result.ready) {
      problems.replaceChildren(
        el("p", { class: "s-q-problems-h", text: t("t.problems_h") }),
        el("ul", {}, ...result.missing.map((m) => el("li", { text: t("t.missing", { label: m.label }) })), ...result.problems.map((p) => el("li", { text: p }))),
      );
      problems.focus();
      return;
    }
    const business = draft.business?.trim();
    const state: ShareState = {
      v: 1,
      template: tpl.id,
      inputs: raw,
      lang,
      madeBy: "try",
      question: questionText(tpl, raw),
      demo: false,
      currency: "EUR",
      ...(business ? { business: business.slice(0, 80) } : {}),
    };
    announce(t("v.loading"));
    location.assign(`/r#${encodeState(state)}`);
  });
  return shell(
    { title: t("t.review_h") },
    el("p", { class: "s-q-lede", text: t("t.review_p") }),
    el("h3", { class: "s-review-h", text: t("t.yours_h") }),
    rows,
    assumedBox,
    nameBox,
    problems,
    el("div", { class: "s-q-nav" }, backButton(), see),
    el("p", { class: "s-q-privacy", text: t("t.privacy") }),
  );
}

function backButton(): HTMLElement {
  const b = el("button", { type: "button", class: "s-btn s-btn--ghost s-q-back" }, el("span", { "aria-hidden": "true", text: "← " }), t("t.back"));
  b.addEventListener("click", backward);
  return b;
}

/* ------------------------------------------------------------------ log a result */

function tokenFrom(text: string): string {
  const s = text.trim();
  const i = s.indexOf("#");
  const tok = (i >= 0 ? s.slice(i + 1) : s).replace(/^log=/, "").trim();
  return tok;
}

function logLinkScreen(): HTMLElement {
  const input = el("input", { id: "q-in", class: "s-input", type: "url", name: "report-link", autocomplete: "off", inputmode: "url", "aria-describedby": "q-err q-why", spellcheck: "false" });
  const err = el("p", { class: "s-q-err", id: "q-err", role: "alert" });
  const form = el("form", { class: "s-q-form", novalidate: true }, el("label", { class: "s-field-label", for: "q-in", text: t("t.log_paste_label") }), input, err, navRow({ next: t("t.next") }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const s = decodeState(tokenFrom(input.value));
      if (!TEMPLATE_IDS.includes(s.template)) throw new Error("template");
      logState = s;
      observedText = Object.fromEntries(Object.entries(s.observed ?? {}).map(([k, v]) => [k, String(v)]));
      forward();
    } catch {
      err.textContent = t("t.log_bad_link");
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  });
  return shell({ title: t("t.log_paste_h") }, form, whyBox(t("t.log_paste_p")));
}

function planValue(key: string): number | undefined {
  const inp = logState?.inputs ?? {};
  const n = (k: string) => {
    const v = inp[k];
    return typeof v === "number" ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  switch (key) {
    case "baseline_lunch_customers":
      return n("lunch_customers");
    case "test_lunch_customers": {
      const l = n("lunch_customers"), x = n("extra_likely");
      return l !== undefined && x !== undefined ? l + x : undefined;
    }
    case "days_run":
      return n("test_days") ?? (logState?.template === "price_change" ? 14 : 10);
    case "redemptions_per_day": {
      const l = n("lunch_customers"), x = n("extra_likely"), sw = n("switch_share") ?? 0.3;
      return l !== undefined && x !== undefined ? Math.round(l * (sw > 1 ? sw / 100 : sw) + x) : undefined;
    }
    case "actual_setup_cost":
      return n("setup_cost");
    case "units_before_per_week":
      return n("units_per_week");
    default:
      return undefined;
  }
}

function obsScreen(o: { key: string; label: string; required: boolean; unit: Unit }): HTMLElement {
  const lang = pageLang();
  const labelKey = `t.obs_${o.key}` as SiteKey;
  const whyKey = `t.obs_${o.key}_why` as SiteKey;
  const label = t(labelKey) === labelKey ? o.label : t(labelKey);
  const why = t(whyKey) === whyKey ? "" : t(whyKey);
  const input = el("input", { id: "q-in", class: "s-input s-input--big", type: "text", name: o.key, inputmode: "decimal", autocomplete: "off", enterkeyhint: "next", "aria-describedby": "q-read q-err q-why" });
  input.value = observedText[o.key] ?? "";
  const plan = planValue(o.key);
  if (plan !== undefined) input.placeholder = t("t.placeholder", { value: bare({ unit: o.unit }, plan, lang) });
  const unit = unitText(o.unit);
  const read = el("p", { class: "s-q-read", id: "q-read", "aria-live": "polite" });
  const err = el("p", { class: "s-q-err", id: "q-err", role: "alert" });
  const check = (final: boolean): boolean => {
    observedText[o.key] = input.value;
    err.textContent = "";
    read.textContent = "";
    const txt = input.value.trim();
    if (!txt) {
      if (final && o.required) {
        err.textContent = t("t.needed");
        return false;
      }
      return true;
    }
    const p = parseRough(txt, o.unit, lang);
    if (!p.ok || typeof p.value !== "number" || p.value < 0) {
      err.textContent = t("t.not_number");
      return false;
    }
    read.textContent = t("t.read_as", { value: show({ unit: o.unit }, p.value) });
    return true;
  };
  input.addEventListener("input", () => check(false));
  const form = el(
    "form",
    { class: "s-q-form", novalidate: true },
    el("div", { class: "s-ans" }, input, unit ? el("span", { class: "s-ans-unit", "aria-hidden": "true", text: unit }) : null),
    read,
    err,
    el("p", { class: "s-q-hint", text: t("t.rough") }),
    navRow({ next: t("t.next"), skip: o.required ? undefined : () => { observedText[o.key] = ""; forward(); } }),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (check(true)) forward();
    else input.focus();
  });
  if (input.value) check(false);
  const hint = plan !== undefined ? el("p", { class: "s-q-example", text: t("t.obs_hint", { value: show({ unit: o.unit }, plan) }) }) : null;
  return shell(
    { title: label, titleFor: "q-in", kind: { label: t("t.log_h"), chip: "owner" } },
    logState?.question ? el("p", { class: "s-q-lede", text: t("t.log_for", { question: logState.question }) }) : null,
    form,
    why ? whyBox(why) : null,
    hint,
  );
}

function logReviewScreen(): HTMLElement {
  const lang = pageLang();
  const fields = obsFields();
  const parsed: Record<string, number> = {};
  const rows = el("ul", { class: "s-review" });
  for (const o of fields) {
    const labelKey = `t.obs_${o.key}` as SiteKey;
    const label = t(labelKey) === labelKey ? o.label : t(labelKey);
    const txt = observedText[o.key]?.trim() ?? "";
    const p = txt ? parseRough(txt, o.unit, lang) : null;
    if (p && p.ok && typeof p.value === "number") parsed[o.key] = p.value;
    const b = el("button", { type: "button", class: "s-link-btn", "aria-label": t("t.change_aria", { label }), text: t("t.change") });
    b.addEventListener("click", () => {
      returnTo = "log-review";
      go(`o:${o.key}`);
    });
    rows.append(el("li", {}, el("span", { class: "s-review-l", text: label }), el("b", { class: "s-review-v", text: p && p.ok && typeof p.value === "number" ? show({ unit: o.unit }, p.value) : t("t.empty") }), b));
  }
  const problems = el("div", { class: "s-q-problems", role: "alert", tabindex: "-1" });
  const submit = el("button", { type: "button", class: "s-btn s-btn--big s-q-next" }, t("t.log_see"), el("span", { "aria-hidden": "true", text: " →" }));
  submit.addEventListener("click", () => {
    if (!logState) return;
    const missing = fields.filter((o) => o.required && parsed[o.key] === undefined);
    if (missing.length) {
      problems.replaceChildren(el("p", { class: "s-q-problems-h", text: t("t.problems_h") }), el("ul", {}, ...missing.map((o) => el("li", { text: t("t.missing", { label: t(`t.obs_${o.key}` as SiteKey) }) }))));
      problems.focus();
      return;
    }
    const state: ShareState = { ...logState, observed: parsed, lang: logState.lang ?? lang };
    location.assign(`/r#${encodeState(state)}`);
  });
  return shell(
    { title: t("t.log_h") },
    el("p", { class: "s-q-lede", text: logState?.question ? t("t.log_for", { question: logState.question }) : t("t.log_p") }),
    rows,
    problems,
    el("div", { class: "s-q-nav" }, backButton(), submit),
    el("p", { class: "s-q-privacy", text: t("t.privacy") }),
  );
}

/* ------------------------------------------------------------------ render */

function render(focus: boolean): void {
  const tpl = template();
  let node: HTMLElement;
  codeForm = screen === "gate" ? codeForm : null;
  if (screen === "gate") node = gateScreen();
  else if (screen === "resume") node = resumeScreen();
  else if (screen === "kiez" && tpl) node = kiezScreen();
  else if (screen.startsWith("f:") && tpl) {
    const f = tpl.fields.find((x) => x.key === screen.slice(2));
    node = f ? fieldScreen(tpl, f) : templateScreen();
  } else if (screen === "costs" && tpl && costFields(tpl).length) node = costsScreen(tpl);
  else if (screen === "review" && tpl) node = reviewScreen(tpl);
  else if (screen === "log-link") node = logLinkScreen();
  else if (screen.startsWith("o:") && logState) {
    const o = obsFields().find((x) => x.key === screen.slice(2));
    node = o ? obsScreen(o) : logReviewScreen();
  } else if (screen === "log-review" && logState) node = logReviewScreen();
  else {
    screen = "template";
    node = templateScreen();
  }
  root.replaceChildren(node);
  root.dataset.screen = screen;
  if (!focus) return;
  const target = node.querySelector<HTMLElement>("#q-in") ?? node.querySelector<HTMLElement>("#q-h");
  target?.focus({ preventScroll: true });
  root.scrollIntoView({ block: "start", behavior: "auto" });
}

async function init(): Promise<void> {
  const box = document.querySelector<HTMLElement>("[data-try]");
  if (!box) return;
  root = box;
  document.documentElement.classList.add("s-js");
  syncLang(() => render(false));

  // A report link to log a result for: /try#log=<token>
  const hash = location.hash.replace(/^#/, "");
  if (hash.startsWith("log=")) {
    try {
      const s = decodeState(hash.slice(4));
      if (TEMPLATE_IDS.includes(s.template)) {
        logState = s;
        mode = "log";
        observedText = Object.fromEntries(Object.entries(s.observed ?? {}).map(([k, v]) => [k, String(v)]));
      }
    } catch {
      logState = null;
    }
    history.replaceState(null, "", location.pathname + location.search);
  }

  const saved = loadDraft();
  if (saved) draft = saved;
  if (mode === "plan" && hasProgress(saved)) resumeOffered = true;

  window.addEventListener("popstate", (e) => {
    const st = e.state as { tryScreen?: string; depth?: number } | null;
    if (!st?.tryScreen) return;
    depth = st.depth ?? 0;
    screen = st.tryScreen;
    returnTo = null;
    render(true);
  });

  // Is the closed beta on, and is the remembered code still valid?
  const code = storedCode();
  const status = await checkBeta(code || undefined);
  gateNeeded = status.reachable && status.required && !status.valid;
  const first = gateNeeded ? "gate" : resumeOffered ? "resume" : sequence().find((s) => s !== "gate") ?? "template";
  screen = first;
  history.replaceState({ tryScreen: first, depth: 0 }, "");
  render(false);
}

onReady(() => void init());
