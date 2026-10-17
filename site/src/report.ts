/**
 * /r — the report viewer. The analysis travels in the URL fragment (/r#<token>),
 * which browsers never send to a server; this page decodes it and recomputes
 * everything in the browser with the same engine the MCP server uses.
 *
 * Language: the link's `lang` wins (default: the page language); switching
 * (header switcher or the report's own) writes the new `lang` into the link.
 * Special fragments: #demo (lunch deal), #demo-price (flat white and the 2027
 * minimum wage), #demo-result (the lunch demo after the test).
 * Also: "Log your result" (→ /try#log=<token>) and the check-in days as an .ics file.
 */
import { analyze, compareResult, planTest } from "../../src/engine/index.ts";
import type { TestPlan, TestResult } from "../../src/engine/types.ts";
import { LOCALE, setLang } from "../../src/i18n/index.ts";
import type { Lang } from "../../src/i18n/index.ts";
import { copyWithFeedback } from "../../src/report/connect.ts";
import { DEMO_SEEDS, demoState } from "../../src/report/demo.ts";
import { mountReport, printTestCard, reportStyles } from "../../src/report/index.ts";
import type { ReportInput } from "../../src/report/index.ts";
import { rebuildRehearsal, summarize } from "../../src/sim/index.ts";
import type { RehearsalSummary } from "../../src/sim/types.ts";
import { decodeState, encodeState } from "../../src/state.ts";
import type { ShareState } from "../../src/state.ts";
import { announce, onReady, pageLang, requestLang, syncLang, t, translate } from "./lib/page.ts";
import { generatedQuestion } from "./lib/question.ts";

let current: { state: ShareState; input: ReportInput; token: string } | null = null;
let lastHash = "";

function injectStyles(): void {
  if (document.getElementById("wi-report-styles")) return;
  const style = document.createElement("style");
  style.id = "wi-report-styles";
  style.textContent = reportStyles();
  document.head.appendChild(style);
}

function chrome(show: boolean, s?: ShareState): void {
  const bar = document.querySelector<HTMLElement>("[data-toolbar]");
  if (bar) bar.hidden = !show;
  const next = document.querySelector<HTMLElement>("[data-next]");
  if (next) next.hidden = !show;
  const demo = document.querySelector<HTMLElement>("[data-demo-bar]");
  if (demo) demo.hidden = !(show && s?.demo);
  if (show && s?.demo) {
    const which = s.observed ? "demo-result" : s.template === "price_change" ? "demo-price" : "demo";
    document.querySelectorAll<HTMLAnchorElement>("[data-demo-switch]").forEach((a) => {
      if (a.dataset.demoSwitch === which) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
}

function showError(main: HTMLElement, detail?: string): void {
  chrome(false);
  document.body.classList.remove("s-has-report-lang");
  current = null;
  const lang = pageLang();
  const tpl = document.getElementById("report-error") as HTMLTemplateElement | null;
  main.replaceChildren();
  if (tpl) {
    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    translate(frag, lang);
    main.appendChild(frag);
  }
  if (detail) {
    const msg = main.querySelector<HTMLElement>("[data-error-msg]");
    if (msg) {
      msg.textContent = "";
      for (const [i, line] of detail.split("\n").entries()) {
        if (i) msg.appendChild(document.createElement("br"));
        msg.appendChild(document.createTextNode(line));
      }
    }
    const h = main.querySelector<HTMLElement>("#err-h");
    if (h) h.textContent = t("v.err_h2", {}, lang);
  }
  document.title = t("v.err_title", {}, lang);
}

function stateFromHash(hash: string): ShareState | null {
  const h = hash.replace(/^#/, "").trim();
  if (!h) return null;
  const lang = pageLang();
  if (h === "demo") return demoState("lunch_offer", { lang });
  if (h === "demo-price") return demoState("price_change", { lang });
  if (h === "demo-result") return demoState("lunch_offer", { lang, result: true });
  return decodeState(h);
}

function buildInput(s: ShareState, lang: Lang): ReportInput {
  setLang(lang);
  const opts = { business: s.business, question: s.question, demo: s.demo, currency: s.currency, lang };
  const analysis = analyze(s.template, s.inputs, opts);
  const plan = planTest(analysis);
  let rehearsal: RehearsalSummary | undefined;
  let status: ReportInput["status"] = "final";
  if (s.rehearsal) {
    try {
      const r = rebuildRehearsal(analysis, s.rehearsal);
      rehearsal = summarize(r);
      if (r.status !== "done") status = "running";
    } catch (e) {
      console.warn("What-IF: the rehearsal in this link could not be replayed.", e);
    }
  }
  let result: TestResult | undefined;
  if (s.observed && Object.keys(s.observed).length) {
    try {
      result = compareResult(analysis, s.observed);
    } catch (e) {
      console.warn("What-IF: the test result in this link could not be compared.", e);
    }
  }
  return { analysis, plan, rehearsal, result, status, ...(s.madeBy ? { madeBy: s.madeBy } : {}) };
}

function mount(main: HTMLElement, state: ShareState, token: string): void {
  const lang = state.lang ?? pageLang();
  const input = buildInput(state, lang);
  mountReport(main, input, { onLanguage: switchTo });
  current = { state, input, token };
  // One switcher is enough: the report's own (it re-renders the link), the header's only on error pages.
  document.body.classList.toggle("s-has-report-lang", !!main.querySelector("[data-wi-lang-nav]:not([hidden])"));
  chrome(true, state);
  wireNext(token);
  const q = input.analysis.question;
  document.title = `${q.length > 70 ? `${q.slice(0, 67)}…` : q} · What-IF`;
  // The page frame follows the report's language (without changing the visitor's saved choice).
  if (lang !== pageLang()) requestLang(lang, { persist: false });
}

function render(): void {
  const main = document.getElementById("report");
  if (!main) return;
  injectStyles();
  const hash = location.hash;
  if (hash === lastHash && main.querySelector("[data-wi-report]")) return;
  lastHash = hash;
  let state: ShareState | null;
  try {
    state = stateFromHash(hash);
  } catch {
    showError(main, t("v.err_msg"));
    return;
  }
  if (!state) {
    showError(main);
    return;
  }
  try {
    const token = encodeState(state);
    mount(main, state, token);
    // A demo shortcut becomes a real, shareable link.
    if (/^#demo(-price|-result)?$/.test(hash)) {
      history.replaceState(null, "", `#${token}`);
      lastHash = `#${token}`;
    }
  } catch (e) {
    showError(main, e instanceof Error ? e.message : String(e));
  }
}

/** The site's own demo (rule-based rehearsal on the demo seed), which can be rebuilt in any language. */
function isSiteDemo(s: ShareState): boolean {
  if (!s.demo) return false;
  const r = s.rehearsal;
  if (!r) return true;
  return r.seed === DEMO_SEEDS[s.template] && r.reactions.every((x) => x.method === "rule-based") && r.interviews.every((iv) => iv.answers.every((a) => a.method === "rule-based"));
}

/** Re-renders the same link in another language and writes `lang` into the link. */
function switchTo(lang: Lang): void {
  const main = document.getElementById("report");
  if (!main || !current) {
    if (lang !== pageLang()) requestLang(lang);
    return;
  }
  if ((current.state.lang ?? pageLang()) === lang && main.querySelector("[data-wi-report]")) {
    if (lang !== pageLang()) requestLang(lang);
    return;
  }
  const scrollY = window.scrollY;
  const from = current.state.lang ?? pageLang();
  let state: ShareState = { ...current.state, lang };
  if (isSiteDemo(state)) {
    // The demo is made up: rebuild it in the new language (its imagined customers speak it too).
    state = demoState(state.template, { lang, result: !!state.observed && Object.keys(state.observed).length > 0 });
  } else if (state.question && state.question === generatedQuestion(state.template, state.inputs, from)) {
    // A question /try wrote (not the owner's own words) follows the language.
    state.question = generatedQuestion(state.template, state.inputs, lang) ?? state.question;
  }
  try {
    const token = encodeState(state);
    history.replaceState(null, "", `#${token}`);
    lastHash = `#${token}`;
    mount(main, state, token);
    window.scrollTo(0, scrollY);
    if (lang !== pageLang()) requestLang(lang);
  } catch (e) {
    showError(main, e instanceof Error ? e.message : String(e));
  }
}

/* ------------------------------------------------------------------ next steps */

function wireNext(token: string): void {
  document.querySelectorAll<HTMLAnchorElement>("[data-log-link]").forEach((a) => (a.href = `/try#log=${token}`));
}

function testStart(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Test day n (1-based) as a date: weekdays for the lunch deal, calendar days for a price change. */
function dayOf(start: Date, n: number, weekdaysOnly: boolean): Date {
  const d = new Date(start);
  let left = Math.max(1, Math.round(n)) - 1;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!weekdaysOnly || (d.getDay() !== 0 && d.getDay() !== 6)) left--;
  }
  return d;
}

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 73 characters (RFC 5545 asks for 75 octets; close enough for every client). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function checkIns(plan: TestPlan | undefined, days: number): { day: number; look: string }[] {
  const list = (plan?.checkIns ?? []).filter((c) => Number.isFinite(c.day) && c.day >= 1);
  if (list.length) return list;
  return [3, 5, days].filter((d, i, a) => d >= 1 && a.indexOf(d) === i).map((day) => ({ day, look: t("v.ics_look") }));
}

function downloadCalendar(): void {
  const status = document.querySelector<HTMLElement>("[data-calendar-status]");
  if (!current) return;
  const lang = pageLang();
  const a = current.input.analysis;
  const plan = current.input.plan;
  const daysInput = a.inputs.find((i) => i.key === "test_days")?.value;
  const days = typeof daysInput === "number" ? daysInput : plan?.days ?? (a.template === "price_change" ? 14 : 10);
  const weekdays = a.template === "lunch_offer";
  const start = testStart(new Date());
  const url = `${location.origin}${location.pathname}#${current.token}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const items = checkIns(plan, days);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//What-IF//Test check-ins//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const c of items) {
    const d = dayOf(start, c.day, weekdays);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    const desc = url.length < 6000 ? t("v.ics_desc", { look: c.look, url }, lang) : t("v.ics_desc_nourl", { look: c.look }, lang);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}-day${c.day}-${ymd(start)}@what-if`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(d)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      fold(`SUMMARY:${icsText(t("v.ics_summary", { day: c.day }, lang))}`),
      fold(`DESCRIPTION:${icsText(desc)}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = t("v.ics_file", {}, lang);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
  const msg = t("v.ics_done", { n: items.length, start: start.toLocaleDateString(LOCALE[lang], { weekday: "long", day: "numeric", month: "long" }) }, lang);
  if (status) status.textContent = msg;
  announce(msg);
}

function init(): void {
  document.documentElement.classList.add("s-js");
  syncLang((lang) => switchTo(lang));
  document.querySelector<HTMLButtonElement>("[data-copy-link]")?.addEventListener("click", (e) => {
    void copyWithFeedback(e.currentTarget as HTMLElement, location.href);
  });
  document.querySelector<HTMLButtonElement>("[data-print-card]")?.addEventListener("click", () => printTestCard());
  document.querySelectorAll<HTMLButtonElement>("[data-calendar]").forEach((b) => b.addEventListener("click", downloadCalendar));
  window.addEventListener("hashchange", render);
  render();
}

onReady(init);
