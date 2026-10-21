/**
 * Landing page. Everything that shows numbers is built from the same demo
 * state the demo report uses (src/report/demo.ts), in the visitor's language,
 * so the hero chart, the method teasers and the rehearsal teaser always match
 * what "See the demo" opens. Also: demo links, copy buttons, the method player,
 * and the link to the rehearsal Claude played (/r#demo-ai) when this build has it.
 */
import { analyze, money, num, price, WEEKDAYS_PER_MONTH } from "../../src/engine/index.ts";
import type { Analysis, Scenario } from "../../src/engine/types.ts";
import type { Lang } from "../../src/i18n/index.ts";
import { wireCopyButtons } from "../../src/report/connect.ts";
import { aiDemoLang, demoState, loadAiDemo } from "../../src/report/demo.ts";
import { rebuildRehearsal, summarize } from "../../src/sim/index.ts";
import type { RehearsalSummary } from "../../src/sim/types.ts";
import { encodeState } from "../../src/state.ts";
import type { ShareState } from "../../src/state.ts";
import { heroSvg } from "./lib/hero.ts";
import type { HeroSeries } from "./lib/hero.ts";
import { el, onReady, pageLang, syncLang, t } from "./lib/page.ts";

type DemoKind = "lunch_offer" | "price_change" | "result";

interface Demo {
  lang: Lang;
  state: ShareState;
  analysis: Analysis;
  summary?: RehearsalSummary;
}

const demos = new Map<string, Demo>();
const tokens = new Map<string, string>();

function demoFor(lang: Lang): Demo | null {
  const hit = demos.get(lang);
  if (hit) return hit;
  try {
    const state = demoState("lunch_offer", { lang });
    const opts = { demo: true, business: state.business, question: state.question, currency: state.currency, lang };
    const analysis = analyze(state.template, state.inputs, opts);
    let summary: RehearsalSummary | undefined;
    if (state.rehearsal) {
      try {
        summary = summarize(rebuildRehearsal(analysis, state.rehearsal));
      } catch {
        summary = undefined;
      }
    }
    const d = { lang, state, analysis, summary };
    demos.set(lang, d);
    return d;
  } catch (e) {
    console.warn("What-IF: could not build the demo here; the report page will build it.", e);
    return null;
  }
}

function tokenFor(kind: DemoKind, lang: Lang): string {
  const key = `${kind}:${lang}`;
  const hit = tokens.get(key);
  if (hit) return hit;
  let token = "";
  try {
    if (kind === "lunch_offer") token = encodeState(demoFor(lang)?.state ?? demoState("lunch_offer", { lang }));
    else if (kind === "price_change") token = encodeState(demoState("price_change", { lang }));
    else token = encodeState(demoState("lunch_offer", { lang, result: true }));
  } catch {
    token = kind === "price_change" ? "demo-price" : kind === "result" ? "demo-result" : "demo";
  }
  tokens.set(key, token);
  return token;
}

/* ------------------------------------------------------------------ demo links */

function wireDemoLinks(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-demo]"));
  const kindOf = (a: HTMLAnchorElement): DemoKind => {
    const k = a.dataset.demo;
    return k === "price_change" || k === "result" ? k : "lunch_offer";
  };
  for (const a of links) {
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      location.href = `/r#${tokenFor(kindOf(a), pageLang())}`;
    });
  }
  const refresh = () => {
    const lang = pageLang();
    for (const a of links) a.href = `/r#${tokenFor(kindOf(a), lang)}`;
  };
  idle(refresh);
  document.addEventListener("whatif:lang", () => idle(refresh));
}

function idle(fn: () => void): void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 1500 });
  else window.setTimeout(fn, 300);
}

/* ------------------------------------------------------------------ teasers */

/** Whole euros; the word joiner keeps "−€118" from breaking after the minus. */
const whole = (n: number) => money(Math.round(n), false).replace("−", "−\u2060");
/** Whole euros with a sign on gains too: "+257 €", "−385 €". */
const signed = (n: number) => (Math.round(n) > 0 ? `+${whole(n)}` : whole(n));
const scenario = (a: Analysis, id: Scenario["id"]) => a.scenarios.find((s) => s.id === id);
const inputNum = (a: Analysis, key: string): number | undefined => {
  const v = a.inputs.find((i) => i.key === key)?.value;
  return typeof v === "number" ? v : undefined;
};
const AV = ["a", "b", "c", "d", "e", "f"];

function testDays(a: Analysis): number {
  return inputNum(a, "test_days") ?? 10;
}

function heroSeries(a: Analysis, lang: Lang): HeroSeries[] {
  const days = testDays(a);
  return (["cautious", "expected", "optimistic"] as const).flatMap((id) => {
    const s = scenario(a, id);
    if (!s) return [];
    const start = s.netTest - (s.netMonth * days) / WEEKDAYS_PER_MONTH;
    return [{ id, label: t(`h.sc_${id}`, {}, lang), start, test: s.netTest, later: s.netTest + s.netMonth }];
  });
}

function setupCost(a: Analysis, ex: Scenario): number {
  const days = testDays(a);
  const fromInputs = inputNum(a, "setup_cost");
  if (fromInputs !== undefined) return fromInputs;
  return Math.max(0, -(ex.netTest - (ex.netMonth * days) / WEEKDAYS_PER_MONTH));
}

function drawHero(d: Demo): void {
  const box = document.querySelector<HTMLElement>("[data-hero-chart]");
  const cap = document.querySelector<HTMLElement>("[data-hero-caption]");
  const a = d.analysis;
  const ex = scenario(a, "expected");
  if (!box || !ex) return;
  const lang = d.lang;
  const days = testDays(a);
  const w = Math.round(box.clientWidth) || 520;
  const p = { days: num(days), test: whole(ex.netTest), setup: whole(setupCost(a, ex)), month: whole(Math.abs(ex.netMonth)) };
  const capKey = ex.netTest < 0 && ex.netMonth > 0 ? "h.cap_mixed" : ex.netMonth >= 0 ? "h.cap_pos" : "h.cap_neg";
  const caption = t(capKey, p, lang);
  box.innerHTML = heroSvg(heroSeries(a, lang), days, WEEKDAYS_PER_MONTH, w, {
    titleId: "hero-vis-t",
    descId: "hero-vis-d",
    title: t("h.chart_t", {}, lang),
    desc: `${t("h.chart_d", { days: num(days) }, lang)} ${caption}`,
    gain: t("h.chart_gain", {}, lang),
    loss: t("h.chart_loss", {}, lang),
    zero: t("h.chart_zero", {}, lang),
    today: t("h.chart_today", {}, lang),
    test: t("h.chart_test", { days: num(days) }, lang),
    keep: t("h.chart_keep", {}, lang),
    testValue: whole(ex.netTest),
  });
  box.dataset.w = String(w);
  if (cap) cap.textContent = caption;
}

/**
 * The step-3 teaser: one row per scenario, its name on its own line above the bar, and the signed
 * value just beyond the bar's end, so no text ever sits on another (the report's step-3 chart does the same).
 * The longest bar leaves 56 units for its value on either side of the zero line.
 */
function barsSvg(a: Analysis, lang: Lang): string {
  const ids = ["cautious", "expected", "optimistic"] as const;
  const vals = ids.map((id) => scenario(a, id)?.netTest ?? 0);
  const max = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const zero = 130;
  const span = 70;
  const rows = ids.map((id, i) => {
    const v = vals[i] ?? 0;
    const len = Math.max(3, (Math.abs(v) / max) * span);
    const top = 2 + i * 35;
    const x = v < 0 ? zero - len : zero;
    const label = t(`h.sc_${id}`, {}, lang);
    const tx = v < 0 ? x - 4 : x + len + 4;
    return `<text x="4" y="${top + 11}" class="s-mc-t">${esc(label)}</text><rect x="${x.toFixed(1)}" y="${top + 15}" width="${len.toFixed(1)}" height="13" rx="3" class="${v < 0 ? "s-mc-neg" : "s-mc-pos"}"/><text x="${tx.toFixed(1)}" y="${top + 25.5}" class="s-mc-t s-mc-t--b" text-anchor="${v < 0 ? "end" : "start"}">${esc(signed(v))}</text>`;
  });
  return `<svg viewBox="0 0 260 108" class="s-minichart" role="presentation"><line x1="${zero}" x2="${zero}" y1="15" y2="107" class="s-mc-zero"/>${rows.join("")}</svg>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fill(sel: string, fn: (node: HTMLElement) => void): void {
  document.querySelectorAll<HTMLElement>(`[data-teaser="${sel}"]`).forEach(fn);
}

/** A feed line with the speaker's name in bold (wherever the language puts it). */
function withBoldName(text: string, name: string): HTMLElement {
  const at = name ? text.indexOf(name) : -1;
  if (at < 0) return el("p", { text });
  return el("p", {}, text.slice(0, at), el("b", { text: name }), text.slice(at + name.length));
}

function avatars(sum: RehearsalSummary, n: number): HTMLElement[] {
  return sum.personas.slice(0, n).map((p, i) => el("span", { class: `s-av s-av--${AV[i % AV.length]}`, title: p.name, text: (p.name.trim()[0] ?? "?").toUpperCase() }));
}

function paintTeasers(d: Demo): void {
  const a = d.analysis;
  const lang = d.lang;
  const days = testDays(a);
  const offer = inputNum(a, "offer_price");
  if (offer !== undefined) fill("bubble", (n) => (n.textContent = t("m.s1_bubble", { price: price(offer) }, lang)));
  fill("rows", (n) => {
    const rows: [string, string, string, string][] = [];
    const cust = inputNum(a, "weekday_customers");
    const extra = inputNum(a, "extra_likely");
    const margin = a.current.find((f) => f.id === "deal_margin")?.value;
    if (cust !== undefined) rows.push([t("m.r_customers", {}, lang), num(cust), "owner", t("c.src_owner", {}, lang)]);
    if (extra !== undefined) rows.push([t("m.r_extra", {}, lang), num(extra), "assumption", t("c.src_assumption", {}, lang)]);
    if (margin !== undefined) rows.push([t("m.r_margin", {}, lang), price(margin), "calculation", t("c.src_calculation", {}, lang)]);
    if (!rows.length) return;
    n.replaceChildren(...rows.map(([label, value, src, chip]) => el("li", {}, el("span", { text: label }), el("b", { text: value }), el("span", { class: `s-chip s-chip--${src}`, text: chip }))));
  });
  fill("s3", (n) => (n.textContent = t("m.s3", { days: num(days) }, lang)));
  fill("bars", (n) => (n.innerHTML = barsSvg(a, lang)));
  if (a.breakEven.reachable) {
    fill("be_t", (n) => (n.textContent = t("m.be_t", {}, lang)));
    fill("be_n", (n) => (n.textContent = t("m.be_n", { n: num(Math.ceil(a.breakEven.value)) }, lang)));
  }
  fill("card", (n) => (n.textContent = t("m.card_t", { days: num(days) }, lang)));

  const sum = d.summary;
  if (!sum) return;
  fill("s5", (n) => (n.textContent = t("m.s5", { n: num(sum.personas.length) }, lang)));
  fill("avatars", (n) => n.replaceChildren(...avatars(sum, 4)));
  fill("people", (n) => n.replaceChildren(...avatars(sum, 6)));
  fill("grid", (n) => {
    const rounds = Math.max(1, sum.rounds.length);
    n.style.setProperty("--cols", String(rounds));
    const cells = sum.personas.flatMap((p) =>
      Array.from({ length: rounds }, (_, i) => {
        const c = sum.grid.find((g) => g.personaId === p.id && g.round === i + 1);
        const kind = !c || c.action === "not_around" ? "a" : c.positive ? "p" : /elsewhere|skips|old_habits|cheaper|stays_away/.test(c.action) ? "e" : "n";
        return el("i", { class: kind });
      }),
    );
    n.replaceChildren(...cells);
  });
  fill("feed", (n) => {
    const items: HTMLElement[] = [];
    const name = (id: string) => sum.personas.find((p) => p.id === id)?.name ?? id;
    const link = sum.links[0];
    if (link) {
      const said = sum.feed.find((f) => f.personaId === link.from && f.round === link.round && f.kind === "word_of_mouth") ?? sum.feed.find((f) => f.personaId === link.from);
      const text = said?.text ?? sum.quotes.find((q) => q.personaId === link.from)?.text ?? "";
      if (text) items.push(withBoldName(t("r.told", { from: name(link.from), to: name(link.to), text }, lang), name(link.from)));
    } else if (sum.quotes[0]) {
      const q = sum.quotes[0];
      items.push(withBoldName(t("r.said", { from: q.name, text: q.text }, lang), q.name));
    }
    const ev = sum.events[0];
    if (ev) items.push(el("p", { class: "is-event", text: t("r.event", { text: ev.text }, lang) }));
    if (items.length) n.replaceChildren(...items);
  });
  const tried = sum.funnel[1];
  fill("qs", (n) => {
    const qs = sum.questionsForOwner.slice(0, 2).map((q) => el("li", { text: q }));
    if (tried) qs.push(el("li", { text: t("r.tried", { n: num(tried.count), of: num(tried.of) }, lang) }));
    if (qs.length) n.replaceChildren(...qs);
  });
  if (tried) fill("f4", (n) => (n.textContent = t("r.f4", { tried: num(tried.count), of: num(tried.of) }, lang)));
}

function paintFacts(d: Demo): void {
  const box = document.querySelector<HTMLElement>("[data-facts]");
  const list = box?.querySelector<HTMLElement>("ul");
  const facts = (d.analysis as Analysis & { facts?: Analysis["facts"] }).facts;
  if (!box || !list || !Array.isArray(facts) || !facts.length) return;
  const date = (iso: string) => {
    const dt = new Date(`${iso}T12:00:00Z`);
    return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleDateString({ de: "de-DE", en: "en-GB", es: "es-ES", pl: "pl-PL" }[d.lang], { day: "numeric", month: "long", year: "numeric" });
  };
  list.replaceChildren(
    ...facts.map((f) => {
      const src = /^https:\/\//.test(f.url) ? el("a", { href: f.url, rel: "noopener", text: f.source }) : el("span", { text: f.source });
      return el("li", {}, el("b", { text: `${f.label}: ${f.value}` }), " · ", src, ` · ${date(f.asOf)}`);
    }),
  );
  box.hidden = false;
}

/* ------------------------------------------------------------------ the AI-played rehearsal */

/** Shows the link to /r#demo-ai when this build has the saved Claude run, with an honest line on how it differs. */
async function paintAiDemo(): Promise<void> {
  const box = document.querySelector<HTMLElement>("[data-ai-demo]");
  if (!box) return;
  const saved = await loadAiDemo();
  if (!saved) {
    box.hidden = true;
    return;
  }
  const lang = pageLang();
  const note = box.querySelector<HTMLElement>("[data-ai-demo-note]");
  let told = -1;
  try {
    const opts = { demo: true, business: saved.business, question: saved.question, currency: saved.currency, lang };
    const a = analyze(saved.template, saved.inputs, opts);
    if (saved.rehearsal) told = summarize(rebuildRehearsal(a, saved.rehearsal)).links.length;
  } catch (e) {
    console.warn("What-IF: could not replay the AI-played rehearsal here.", e);
    told = -1;
  }
  const parts = [t("r.ai_note", {}, lang)];
  if (told === 0) parts.push(t("r.ai_wom", {}, lang));
  if (aiDemoLang(saved) !== lang) parts.push(t("r.ai_lang", {}, lang));
  if (note) note.textContent = parts.join(" ");
  box.hidden = false;
}

let heroObserver: ResizeObserver | null = null;

function paintAll(): void {
  const lang = pageLang();
  const d = demoFor(lang);
  if (!d) return;
  drawHero(d);
  paintTeasers(d);
  paintFacts(d);
  void paintAiDemo();
  const box = document.querySelector<HTMLElement>("[data-hero-chart]");
  if (box && typeof ResizeObserver !== "undefined" && !heroObserver) {
    let raf = 0;
    heroObserver = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cur = demoFor(pageLang());
        if (cur && box.dataset.w !== String(Math.round(box.clientWidth))) drawHero(cur);
      });
    });
    heroObserver.observe(box);
  }
}

/* ------------------------------------------------------------------ method player */

function wireMethodPlayer(): () => void {
  const list = document.querySelector<HTMLElement>("[data-method]");
  const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-mstep]"));
  const controls = document.querySelector<HTMLElement>("[data-player-controls]");
  const toggle = document.querySelector<HTMLButtonElement>("[data-player-toggle]");
  const now = document.querySelector<HTMLElement>("[data-player-now]");
  if (!list || !steps.length) return () => {};
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  list.classList.add("is-player");
  let i = 0;
  let timer = 0;
  let playing = !reduce;
  let visible = false;
  let finished = false;
  const title = (j: number) => steps[j]?.querySelector("h3")?.textContent ?? "";
  const label = () => {
    if (toggle) toggle.textContent = playing ? t("m.pause") : finished ? t("m.again") : t("m.play");
    if (now) now.textContent = t("m.now", { n: i + 1, total: steps.length, title: title(i) });
    buttons.forEach((b, j) => b.setAttribute("aria-label", t("m.highlight", { n: j + 1, title: title(j) })));
  };
  const show = (n: number) => {
    i = (n + steps.length) % steps.length;
    steps.forEach((s, j) => {
      s.classList.toggle("is-active", j === i);
      s.classList.toggle("is-done", j < i);
    });
    list.style.setProperty("--progress", String(i / Math.max(1, steps.length - 1)));
    label();
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    if (!playing || !visible) return;
    timer = window.setInterval(() => {
      if (i >= steps.length - 1) {
        playing = false;
        finished = true;
        stop();
        label();
        return;
      }
      show(i + 1);
    }, 3200);
  };
  // A stretched button over each card: the whole card is clickable, the heading stays a heading.
  const buttons = steps.map((s, j) => {
    const btn = el("button", { type: "button", class: "s-mstep-btn" });
    btn.addEventListener("click", () => {
      playing = false;
      finished = false;
      stop();
      show(j);
    });
    s.appendChild(btn);
    return btn;
  });
  if (controls) controls.hidden = false;
  toggle?.addEventListener("click", () => {
    if (playing) {
      playing = false;
      stop();
    } else {
      playing = true;
      if (i >= steps.length - 1) show(0);
      finished = false;
      start();
    }
    label();
  });
  show(0);
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) start();
        else stop();
      },
      { threshold: 0.25 },
    ).observe(list);
  } else {
    visible = true;
    start();
  }
  return label;
}

function init(): void {
  document.documentElement.classList.add("s-js");
  let relabel: () => void = () => {};
  syncLang(() => {
    relabel();
    paintAll();
  });
  wireCopyButtons(document);
  wireDemoLinks();
  relabel = wireMethodPlayer();
  paintAll();
}

onReady(init);
