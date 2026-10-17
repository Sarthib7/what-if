/**
 * /r — the report viewer. The analysis travels in the URL fragment (/r#<token>),
 * which browsers never send to a server; this page decodes it and recomputes
 * everything in the browser with the same engine the MCP server uses.
 *
 * Special fragments: #demo (lunch offer demo) and #demo-price (price change demo).
 */
import { analyze, compareResult, planTest } from "../../src/engine/index.ts";
import type { TestResult } from "../../src/engine/types.ts";
import { copyWithFeedback } from "../../src/report/connect.ts";
import { demoState } from "../../src/report/demo.ts";
import { mountReport, printTestCard, reportStyles } from "../../src/report/index.ts";
import type { ReportInput } from "../../src/report/index.ts";
import { rebuildRehearsal, summarize } from "../../src/sim/index.ts";
import type { RehearsalSummary } from "../../src/sim/types.ts";
import { decodeState, encodeState } from "../../src/state.ts";
import type { ShareState } from "../../src/state.ts";

function injectStyles(): void {
  if (document.getElementById("wi-report-styles")) return;
  const style = document.createElement("style");
  style.id = "wi-report-styles";
  style.textContent = reportStyles();
  document.head.appendChild(style);
}

function toolbar(show: boolean): void {
  const bar = document.querySelector<HTMLElement>("[data-toolbar]");
  if (bar) bar.hidden = !show;
}

function showError(main: HTMLElement, message?: string): void {
  toolbar(false);
  const tpl = document.getElementById("report-error") as HTMLTemplateElement | null;
  main.replaceChildren();
  if (tpl) main.appendChild(tpl.content.cloneNode(true));
  if (message) {
    const msg = main.querySelector<HTMLElement>("[data-error-msg]");
    if (msg) {
      msg.textContent = "";
      for (const [i, line] of message.split("\n").entries()) {
        if (i) msg.appendChild(document.createElement("br"));
        msg.appendChild(document.createTextNode(line));
      }
    }
    const h = main.querySelector<HTMLElement>("#err-h");
    if (h) h.textContent = "This report could not be drawn";
  }
  document.title = "Report link problem · What-IF";
}

function stateFromHash(hash: string): ShareState | null {
  const h = hash.replace(/^#/, "").trim();
  if (!h) return null;
  if (h === "demo") return demoState("lunch_offer");
  if (h === "demo-price") return demoState("price_change");
  return decodeState(h);
}

function buildInput(s: ShareState): ReportInput {
  const analysis = analyze(s.template, s.inputs, { business: s.business, question: s.question, demo: s.demo, currency: s.currency });
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
  return { analysis, plan, rehearsal, result, status };
}

let lastHash = "";

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
  } catch (e) {
    showError(main, e instanceof Error ? e.message : String(e));
    return;
  }
  if (!state) {
    showError(main);
    return;
  }
  try {
    const input = buildInput(state);
    mountReport(main, input);
    toolbar(true);
    const q = input.analysis.question;
    document.title = `${q.length > 70 ? `${q.slice(0, 67)}…` : q} · What-IF`;
    // A demo shortcut becomes a real, shareable link.
    if (/^#demo(-price)?$/.test(hash)) {
      const token = encodeState(state);
      history.replaceState(null, "", `#${token}`);
      lastHash = `#${token}`;
    }
  } catch (e) {
    showError(main, e instanceof Error ? e.message : String(e));
  }
}

function init(): void {
  document.querySelector<HTMLButtonElement>("[data-copy-link]")?.addEventListener("click", (e) => {
    void copyWithFeedback(e.currentTarget as HTMLElement, location.href);
  });
  document.querySelector<HTMLButtonElement>("[data-print-card]")?.addEventListener("click", () => printTestCard());
  window.addEventListener("hashchange", render);
  render();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
