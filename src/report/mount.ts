/**
 * Client behaviour for the report: charts redrawn at their real width, the
 * break-even slider (keyboard, drag on the chart), "show all the maths",
 * rehearsal tabs, timeline cells, hover-to-peek "why" notes, the step
 * header's "you are here", and printing the test card.
 *
 * No globals at import time, so the module is safe to import in Node tests.
 */
import { nearestIndex, sensLayout } from "./charts.ts";
import type { ReportInput } from "./model.ts";
import { STEPS, testDays } from "./model.ts";
import { networkChart, uptakeChart } from "./rehearsal.ts";
import { readout, resultBars, resultLine, scenarioChart, sensChart, uncertaintyChart } from "./sections.ts";

type Cleanup = () => void;
const mounted = new WeakMap<HTMLElement, Cleanup>();

/** Prints only the test card (the rest of the page is hidden by the print stylesheet). */
export function printTestCard(): void {
  const html = document.documentElement;
  if (!document.getElementById("wi-testcard")) {
    window.print();
    return;
  }
  html.classList.add("wi-print-card");
  const done = () => {
    html.classList.remove("wi-print-card");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // Some browsers do not fire afterprint; print() blocks until the dialog closes in most of them.
  setTimeout(done, 1500);
}

export function wireReport(root: HTMLElement, input: ReportInput, render: (input: ReportInput) => string): void {
  mounted.get(root)?.();
  root.innerHTML = render(input);
  const cleanups: Cleanup[] = [];
  const a = input.analysis;
  const days = testDays(input);
  const points = a.sensitivity.points;

  /* ---------- reveal JS-only controls ---------- */
  root.querySelectorAll<HTMLElement>("[data-wi-only-js]").forEach((el) => (el.hidden = false));

  /* ---------- responsive charts ---------- */
  let sensIndex = Number(root.querySelector<HTMLInputElement>("#wi-slider")?.value ?? 0);
  const reh = input.rehearsal;
  const renderers: Record<string, (w: number) => string> = {
    scenarios: (w) => scenarioChart(input, w),
    uncertainty: (w) => uncertaintyChart(input, w),
    sens: (w) => sensChart(a, w, sensIndex),
    result: (w) => resultLine(input, w),
    "result-net": (w) => resultBars(input, w),
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
    box.innerHTML = fn(w);
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
  const sensBox = root.querySelector<HTMLElement>('[data-wi-chart="sens"]');
  const setIndex = (i: number) => {
    if (!slider || points.length === 0) return;
    const next = Math.max(0, Math.min(points.length - 1, i));
    const changed = next !== sensIndex;
    sensIndex = next;
    slider.value = String(next);
    const r = readout(a, next, days);
    slider.setAttribute("aria-valuetext", r.valueText);
    if (readoutEl) readoutEl.innerHTML = r.html; // built from escaped strings in sections.ts
    if (whyEl && (changed || whyEl.textContent !== r.why)) whyEl.textContent = r.why;
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

  /* ---------- show all the maths ---------- */
  const allBtn = root.querySelector<HTMLButtonElement>("[data-wi-allmaths]");
  if (allBtn) {
    allBtn.addEventListener("click", () => {
      const open = allBtn.getAttribute("aria-pressed") !== "true";
      root.querySelectorAll<HTMLDetailsElement>("details.wi-maths").forEach((d) => (d.open = open));
      allBtn.setAttribute("aria-pressed", String(open));
      allBtn.textContent = open ? "Hide all the maths" : "Show all the maths";
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
    const panels = tabs.map((t) => root.querySelector<HTMLElement>(`#${t.getAttribute("aria-controls")}`));
    const select = (i: number, focus = false) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const p = panels[j];
        if (p) p.hidden = !on;
      });
      if (focus) tabs[i]?.focus();
      panels[i]?.querySelectorAll<HTMLElement>("[data-wi-chart]").forEach((b) => drawBox(b, true));
    };
    tablist.hidden = false;
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
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

  /* ---------- timeline cells ---------- */
  const thought = root.querySelector<HTMLElement>("#wi-thought");
  root.querySelectorAll<HTMLButtonElement>("button[data-wi-cell]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.querySelector<HTMLElement>(".wi-cell-thought");
      if (!t || !thought) return;
      root.querySelectorAll(".wi-cell.is-selected").forEach((c) => c.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      const who = document.createElement("p");
      who.className = "wi-thought-who";
      who.textContent = `${t.dataset.name ?? ""} · round ${t.dataset.round ?? ""} · ${t.dataset.action ?? ""}`;
      const text = document.createElement("p");
      text.className = "wi-thought-text";
      text.textContent = `“${t.textContent ?? ""}”`;
      thought.replaceChildren(who, text);
    });
  });

  /* ---------- print the test card ---------- */
  root.querySelectorAll<HTMLButtonElement>("[data-wi-print]").forEach((b) => b.addEventListener("click", () => printTestCard()));

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
          if (now && st) now.textContent = `Step ${n}/6 · ${st.title}`;
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    stepEls.forEach((s) => io.observe(s));
    cleanups.push(() => io.disconnect());
  }

  mounted.set(root, () => cleanups.forEach((c) => c()));
}
