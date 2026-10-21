/**
 * Client behaviour for the report: charts redrawn at their real width, the
 * break-even slider (keyboard, drag on the chart), the predict-then-check box,
 * the language switcher, "show all the maths", rehearsal tabs, timeline cells,
 * hover-to-peek "why" notes, the step header's "you are here", printing the
 * test card on its own, starting a rule-based rehearsal (onRehearse) and the
 * two practice questions on the decision rule.
 *
 * No globals at import time, so the module is safe to import in Node tests.
 */
import { isLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { nearestIndex, sensLayout } from "./charts.ts";
import { t } from "./messages.ts";
import type { ReportInput } from "./model.ts";
import { STEPS, testDays, useReport } from "./model.ts";
import { networkChart, uptakeChart } from "./rehearsal.ts";
import { hideThresholds, predictFeedback, readout, resultBars, resultLine, scenarioChart, sensChart, uncertaintyChart, wageChart } from "./sections.ts";

type Cleanup = () => void;
const mounted = new WeakMap<HTMLElement, Cleanup>();
/** Set when the owner started a rehearsal from step 5: the next render of that root moves focus to the rehearsal. */
const focusRehearsal = new WeakSet<HTMLElement>();

export interface MountOptions {
  /** Called with the language the owner picked in the report header (DE · EN · ES · PL). */
  onLanguage?: (lang: Lang) => void;
  /**
   * Shown as the step-5 button "Start a rehearsal with imagined customers (simple rules, no AI)" when the report has
   * no rehearsal. Called once per click, with no arguments; the page runs the rule-based rehearsal and mounts the
   * report again (same root) with `input.rehearsal` set. The button shows "Rehearsing…" and stays disabled until then;
   * if the callback throws (or its promise rejects), it comes back with a short "could not start" message.
   * After the re-render, focus moves to the step-5 heading.
   */
  onRehearse?: () => void | Promise<unknown>;
}

/**
 * The owner's break-even guess, per analysis, kept in this page's memory only:
 * never stored, never sent. It survives a re-render (a language switch) but not a reload.
 */
const predictions = new Map<string, { guess: number | null }>();

/**
 * Prints only the test card. A detached copy of the card is put at the top of
 * <body> and everything else is taken out of the print layout (display: none),
 * so the printout is one page, not the whole report with blank pages.
 */
export function printTestCard(): void {
  const html = document.documentElement;
  const card = document.getElementById("wi-testcard");
  if (!card) {
    window.print();
    return;
  }
  document.querySelectorAll(".wi-print-clone").forEach((n) => n.remove());
  const wrap = document.createElement("div");
  wrap.className = "wi-report wi-print-clone";
  const lang = card.closest("[lang]")?.getAttribute("lang");
  if (lang) wrap.setAttribute("lang", lang);
  const copy = card.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  // On paper the card reads top to bottom: what to do before and during, then the rule and the cost cap.
  const more = copy.querySelector<HTMLElement>(".wi-tc-more");
  const grid = more?.querySelector<HTMLElement>(".wi-tc-grid");
  const cap = more?.querySelector<HTMLElement>(".wi-tc-cap");
  const plain = copy.querySelector<HTMLElement>(".wi-tc-plain");
  if (more && grid && plain) {
    plain.after(grid);
    if (cap) more.after(cap);
    more.remove();
  }
  copy.querySelectorAll("details").forEach((d) => (d.open = true));
  wrap.appendChild(copy);
  document.body.prepend(wrap);
  html.classList.add("wi-print-card");
  let cleaned = false;
  const done = () => {
    if (cleaned) return;
    cleaned = true;
    html.classList.remove("wi-print-card");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // Some browsers do not fire afterprint; print() blocks until the dialog closes in most of them.
  // The copy stays (hidden on screen) until the next print, so a late print still finds it.
  setTimeout(done, 1500);
}

export function wireReport(root: HTMLElement, input: ReportInput, render: (input: ReportInput) => string, opts: MountOptions = {}): void {
  mounted.get(root)?.();
  const a = input.analysis;
  useReport(a);
  root.innerHTML = render(input);
  const cleanups: Cleanup[] = [];
  const days = testDays(input);
  const points = a.sensitivity.points;
  // Charts redraw later (resize, tabs): keep the formatters in this report's language and currency.
  const inLang = <T>(fn: () => T): T => {
    useReport(a);
    return fn();
  };

  /* ---------- reveal JS-only controls ---------- */
  root.querySelectorAll<HTMLElement>("[data-wi-only-js]").forEach((el) => (el.hidden = false));

  /* ---------- wide screens: open the parts a phone keeps one tap away ---------- */
  if (typeof matchMedia === "function" && matchMedia("(min-width: 760px)").matches)
    root.querySelectorAll<HTMLDetailsElement>("details[data-wi-open-wide]").forEach((d) => (d.open = true));

  /* ---------- language switcher ---------- */
  const onLanguage = opts.onLanguage ?? input.onLanguage;
  const langNav = root.querySelector<HTMLElement>("[data-wi-lang-nav]");
  if (langNav && onLanguage) {
    langNav.hidden = false;
    langNav.querySelectorAll<HTMLButtonElement>("button[data-wi-lang]").forEach((b) =>
      b.addEventListener("click", () => {
        const l = b.dataset.wiLang;
        if (!isLang(l) || b.getAttribute("aria-pressed") === "true") return;
        onLanguage(l);
      }),
    );
  }

  /* ---------- responsive charts ---------- */
  let sensIndex = Number(root.querySelector<HTMLInputElement>("#wi-slider")?.value ?? 0);
  const reh = input.rehearsal;
  // Until the owner guesses (or taps "just show me"), the break-even numbers stay out of view everywhere in step 4.
  let covered = !!root.querySelector("[data-wi-predict]") && !predictions.has(a.id);
  const renderers: Record<string, (w: number) => string> = {
    scenarios: (w) => scenarioChart(input, w),
    uncertainty: (w) => uncertaintyChart(input, w),
    sens: (w) => sensChart(a, w, sensIndex, "netTest", !covered),
    result: (w) => resultLine(input, w),
    "result-net": (w) => resultBars(input, w),
    wage: (w) => wageChart(a, w),
  };
  if (reh) {
    renderers.uptake = (w) => uptakeChart(reh, input, w);
    renderers.network = (w) => networkChart(reh, w);
  }
  const drawBox = (box: HTMLElement, force = false) => {
    const name = box.dataset.wiChart ?? "";
    const fn = renderers[name];
    const w = Math.round(box.clientWidth);
    if (!fn || w < 40) return;
    if (!force && box.dataset.w === String(w)) return;
    box.dataset.w = String(w);
    box.innerHTML = inLang(() => fn(w));
    if (name === "sens") alignSlider(w);
  };
  // Line the slider's track up with the chart's plot area, so the thumb sits under the chart cursor.
  const alignSlider = (w: number) => {
    const row = root.querySelector<HTMLElement>(".wi-slider-row");
    if (!row || points.length === 0) return;
    const L = sensLayout(points, w, "netTest");
    row.style.setProperty("--wi-plot-l", `${L.l}px`);
    row.style.setProperty("--wi-plot-r", `${L.r}px`);
    row.classList.add("is-aligned");
  };
  const boxes = Array.from(root.querySelectorAll<HTMLElement>("[data-wi-chart]"));
  boxes.forEach((b) => drawBox(b));
  if (typeof ResizeObserver !== "undefined") {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => boxes.forEach((b) => drawBox(b)));
    });
    boxes.forEach((b) => ro.observe(b));
    cleanups.push(() => ro.disconnect());
  }

  /* ---------- break-even slider ---------- */
  const slider = root.querySelector<HTMLInputElement>("#wi-slider");
  const readoutEl = root.querySelector<HTMLElement>("[data-wi-readout]");
  const whyEl = root.querySelector<HTMLElement>("[data-wi-why]");
  const diffEl = root.querySelector<HTMLElement>("[data-wi-diff]");
  const sensBox = root.querySelector<HTMLElement>('[data-wi-chart="sens"]');
  /** "Why this changed", without the break-even numbers while they are still covered. */
  const showWhy = (why: string) => {
    if (!whyEl) return;
    const text = covered ? inLang(() => hideThresholds(why, a)) : why;
    if (whyEl.textContent !== text) whyEl.textContent = text;
    whyEl.hidden = !text;
  };
  const setIndex = (i: number) => {
    if (!slider || points.length === 0) return;
    const next = Math.max(0, Math.min(points.length - 1, i));
    sensIndex = next;
    slider.value = String(next);
    const r = inLang(() => readout(a, next, days));
    slider.setAttribute("aria-valuetext", r.valueText);
    if (readoutEl) readoutEl.innerHTML = r.html; // built from escaped strings in sections.ts
    showWhy(r.why);
    if (diffEl && diffEl.textContent !== r.diff) diffEl.textContent = r.diff;
    if (sensBox) drawBox(sensBox, true);
  };
  if (slider) {
    slider.addEventListener("input", () => setIndex(Number(slider.value)));
    if (sensBox) {
      let dragging = false;
      const fromPointer = (e: PointerEvent) => {
        const svg = sensBox.querySelector("svg");
        const w = Number(sensBox.dataset.w ?? 640);
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0) return;
        const L = sensLayout(points, w, "netTest");
        const vx = (e.clientX - rect.left) * (L.W / rect.width);
        const xv = L.xMin + ((vx - L.l) / (L.W - L.l - L.r)) * (L.xMax - L.xMin);
        setIndex(nearestIndex(points, xv));
      };
      const down = (e: PointerEvent) => {
        if (!(e.target instanceof Element) || !e.target.closest(".wi-hit, .wi-cursor, .wi-line")) return;
        dragging = true;
        sensBox.setPointerCapture?.(e.pointerId);
        fromPointer(e);
      };
      const move = (e: PointerEvent) => {
        if (dragging) fromPointer(e);
      };
      const up = () => {
        dragging = false;
      };
      sensBox.addEventListener("pointerdown", down);
      sensBox.addEventListener("pointermove", move);
      sensBox.addEventListener("pointerup", up);
      sensBox.addEventListener("pointercancel", up);
    }
  }

  /* ---------- predict, then check ---------- */
  const predict = root.querySelector<HTMLElement>("[data-wi-predict]");
  const covers = Array.from(root.querySelectorAll<HTMLElement>("[data-wi-be-cover]"));
  const values = Array.from(root.querySelectorAll<HTMLElement>("[data-wi-be-value]"));
  const beMore = root.querySelector<HTMLElement>("[data-wi-be-more]");
  const beHead = root.querySelector<HTMLElement>("[data-wi-be-head]");
  const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-wi-be-reveal]"));
  if (predict) {
    const field = predict.querySelector<HTMLInputElement>("#wi-predict-in");
    const out = root.querySelector<HTMLElement>("[data-wi-predict-out]");
    const checkBtn = predict.querySelector<HTMLButtonElement>("[data-wi-predict-check]");
    const skipBtn = predict.querySelector<HTMLButtonElement>("[data-wi-predict-skip]");
    // Until the owner guesses (or skips), the break-even card asks the question instead of showing the answer,
    // and the slider chart's markers, its caption, "Worth knowing" and the thresholds in "Why this changed" wait too.
    const cover = (on: boolean) => {
      const was = covered;
      covered = on;
      covers.forEach((c) => (c.hidden = !on));
      values.forEach((v) => (v.hidden = on));
      reveals.forEach((r) => (r.hidden = on));
      if (beMore) beMore.hidden = on;
      if (beHead) beHead.hidden = on;
      predict.hidden = !on;
      showWhy(inLang(() => readout(a, sensIndex, days)).why);
      if (sensBox && was !== on) drawBox(sensBox, true);
    };
    const reveal = (guess: number | null, announce: boolean) => {
      predictions.set(a.id, { guess });
      cover(false);
      if (out) {
        out.textContent = inLang(() => predictFeedback(a, guess));
        out.classList.add("is-shown");
        if (!announce) out.removeAttribute("aria-live");
        else {
          // the form just disappeared: keep keyboard and screen-reader users on the answer
          out.tabIndex = -1;
          out.focus();
        }
      }
      if (field && guess !== null) field.value = String(guess);
    };
    predict.hidden = false;
    const saved = predictions.get(a.id);
    if (saved) reveal(saved.guess, false);
    else cover(true);
    checkBtn?.addEventListener("click", () => {
      const raw = (field?.value ?? "").trim().replace(",", ".");
      const g = Number(raw);
      if (!raw || !Number.isFinite(g) || g < 0) {
        if (out) out.textContent = t("predict.invalid");
        field?.focus();
        return;
      }
      if (out) out.setAttribute("aria-live", "polite");
      reveal(g, true);
    });
    field?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        checkBtn?.click();
      }
    });
    skipBtn?.addEventListener("click", () => {
      if (out) out.setAttribute("aria-live", "polite");
      reveal(null, true);
    });
  }

  /* ---------- show all the maths ---------- */
  const allBtn = root.querySelector<HTMLButtonElement>("[data-wi-allmaths]");
  if (allBtn) {
    allBtn.addEventListener("click", () => {
      const open = allBtn.getAttribute("aria-pressed") !== "true";
      root.querySelectorAll<HTMLDetailsElement>("#wi-step-3 details.wi-working, #wi-step-3 details.wi-scns-more, details.wi-maths").forEach((d) => (d.open = open));
      allBtn.setAttribute("aria-pressed", String(open));
      allBtn.textContent = inLang(() => (open ? t("maths.hideAll") : t("maths.showAll")));
    });
  }

  /* ---------- "why it matters": peek on hover, pin on click ---------- */
  root.querySelectorAll<HTMLDetailsElement>("details.wi-why").forEach((d) => {
    const summary = d.querySelector("summary");
    d.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && !d.open) {
        d.open = true;
        d.dataset.peek = "1";
      }
    });
    d.addEventListener("pointerleave", () => {
      if (d.dataset.peek === "1") {
        d.open = false;
        delete d.dataset.peek;
      }
    });
    summary?.addEventListener("click", (e) => {
      if (d.dataset.peek === "1") {
        e.preventDefault();
        delete d.dataset.peek;
      }
    });
  });

  /* ---------- rehearsal tabs ---------- */
  const tablist = root.querySelector<HTMLElement>("[data-wi-tabs]");
  if (tablist) {
    const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = tabs.map((tb) => root.querySelector<HTMLElement>(`#${tb.getAttribute("aria-controls")}`));
    const select = (i: number, focus = false) => {
      tabs.forEach((tb, j) => {
        const on = i === j;
        tb.setAttribute("aria-selected", String(on));
        tb.tabIndex = on ? 0 : -1;
        const p = panels[j];
        if (p) p.hidden = !on;
      });
      if (focus) tabs[i]?.focus();
      panels[i]?.querySelectorAll<HTMLElement>("[data-wi-chart]").forEach((b) => drawBox(b, true));
    };
    tablist.hidden = false;
    tabs.forEach((tb, i) => {
      tb.addEventListener("click", () => select(i));
      tb.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k === "ArrowRight" || k === "ArrowLeft" || k === "Home" || k === "End") {
          e.preventDefault();
          const n = tabs.length;
          select(k === "Home" ? 0 : k === "End" ? n - 1 : (i + (k === "ArrowRight" ? 1 : n - 1)) % n, true);
        }
      });
    });
    select(0);
  }

  /* ---------- the people list opens: draw nothing new, but keep charts sized ---------- */
  root.querySelectorAll<HTMLDetailsElement>("details").forEach((d) =>
    d.addEventListener("toggle", () => {
      if (d.open) d.querySelectorAll<HTMLElement>("[data-wi-chart]").forEach((b) => drawBox(b, true));
    }),
  );

  /* ---------- timeline cells ---------- */
  const thought = root.querySelector<HTMLElement>("#wi-thought");
  root.querySelectorAll<HTMLButtonElement>("button[data-wi-cell]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const th = btn.querySelector<HTMLElement>(".wi-cell-thought");
      if (!th || !thought) return;
      root.querySelectorAll(".wi-cell.is-selected").forEach((c) => c.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      const who = document.createElement("p");
      who.className = "wi-thought-who";
      who.textContent = inLang(() => t("tl.thoughtWho", { name: th.dataset.name ?? "", n: th.dataset.round ?? "", action: th.dataset.action ?? "" }));
      const text = document.createElement("p");
      text.className = "wi-thought-text";
      text.textContent = inLang(() => t("tl.quote", { text: th.textContent ?? "" }));
      thought.replaceChildren(who, text);
    });
  });

  /* ---------- print the test card ---------- */
  root.querySelectorAll<HTMLButtonElement>("[data-wi-print]").forEach((b) => b.addEventListener("click", () => printTestCard()));

  /* ---------- step 5: start a rule-based rehearsal (only when the page can run one) ---------- */
  const rehWrap = root.querySelector<HTMLElement>("[data-wi-rehearse-wrap]");
  const rehBtn = root.querySelector<HTMLButtonElement>("[data-wi-rehearse]");
  const onRehearse = opts.onRehearse;
  if (rehWrap && rehBtn && onRehearse && !reh) {
    rehWrap.hidden = false;
    const label = rehBtn.querySelector<HTMLElement>("[data-wi-rehearse-label]");
    const msg = root.querySelector<HTMLElement>("[data-wi-rehearse-msg]");
    const fail = (e: unknown) => {
      console.warn("What-IF: the rehearsal could not start.", e);
      focusRehearsal.delete(root);
      if (!rehBtn.isConnected) return;
      rehBtn.disabled = false;
      rehBtn.removeAttribute("aria-busy");
      if (label) label.textContent = inLang(() => t("reh.start"));
      if (msg) msg.textContent = inLang(() => t("reh.startFailed"));
    };
    rehBtn.addEventListener("click", () => {
      if (rehBtn.disabled) return;
      rehBtn.disabled = true;
      rehBtn.setAttribute("aria-busy", "true");
      if (label) label.textContent = inLang(() => t("reh.starting"));
      if (msg) msg.textContent = "";
      focusRehearsal.add(root);
      // Let "Rehearsing…" paint before the rules run (they are synchronous and quick, but not free on an old phone).
      setTimeout(() => {
        try {
          const ret = onRehearse();
          if (ret && typeof (ret as Promise<unknown>).then === "function") (ret as Promise<unknown>).catch(fail);
        } catch (e) {
          fail(e);
        }
      }, 30);
    });
  }
  if (reh && focusRehearsal.has(root)) {
    focusRehearsal.delete(root);
    const h = root.querySelector<HTMLElement>("#wi-step-5-h");
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
      h.closest("section")?.scrollIntoView({ block: "start" });
    }
  }

  /* ---------- step 6: try the decision rule once (page memory only) ---------- */
  root.querySelectorAll<HTMLElement>(".wi-sc-q").forEach((q) => {
    const out = q.querySelector<HTMLElement>(".wi-sc-out");
    const opts2 = Array.from(q.querySelectorAll<HTMLButtonElement>("button[data-wi-sc]"));
    opts2.forEach((b) =>
      b.addEventListener("click", () => {
        const right = b.dataset.wiSc === q.dataset.answer;
        opts2.forEach((x) => {
          x.setAttribute("aria-pressed", String(x === b));
          x.classList.toggle("is-right", x === b && right);
          x.classList.toggle("is-wrong", x === b && !right);
        });
        if (out) {
          out.textContent = (right ? q.dataset.right : q.dataset.wrong) ?? "";
          out.classList.toggle("is-right", right);
          out.classList.toggle("is-wrong", !right);
        }
      }),
    );
  });

  /* ---------- step header: you are here ---------- */
  const now = root.querySelector<HTMLElement>("[data-wi-now]");
  const stepEls = Array.from(root.querySelectorAll<HTMLElement>("section[data-step]"));
  if (typeof IntersectionObserver !== "undefined" && stepEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const n = Number((en.target as HTMLElement).dataset.step);
          root.querySelectorAll(".wi-st").forEach((li) => li.classList.toggle("is-viewing", Number((li as HTMLElement).dataset.step) === n));
          const st = STEPS[n - 1];
          if (now && st) now.textContent = inLang(() => t("stepper.now", { n, title: st.title }));
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    stepEls.forEach((s) => io.observe(s));
    cleanups.push(() => io.disconnect());
  }

  mounted.set(root, () => cleanups.forEach((c) => c()));
}
