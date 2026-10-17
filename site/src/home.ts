/**
 * Landing page: the MCP URL for this deployment and copy buttons, the demo
 * link built in the browser (rule-based rehearsal, no server, no model), and
 * the step-by-step method player.
 */
import { wireConnect } from "../../src/report/connect.ts";
import { demoToken } from "../../src/report/demo.ts";

function wireDemoLinks(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-demo]"));
  if (!links.length) return;
  let href = "";
  const ensure = () => {
    if (href) return href;
    try {
      href = `/r#${demoToken("lunch_offer")}`;
    } catch (e) {
      console.warn("What-IF: could not build the demo link here; the report page will build it.", e);
      href = "/r#demo";
    }
    return href;
  };
  for (const a of links) {
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      location.href = ensure();
    });
  }
  // Build it when the browser is idle, so hovering or copying the link gives the real token.
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));
  idle(() => {
    const h = ensure();
    for (const a of links) a.href = h;
  });
}

function wireMethodPlayer(): void {
  const list = document.querySelector<HTMLElement>("[data-method]");
  const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-mstep]"));
  const controls = document.querySelector<HTMLElement>("[data-player-controls]");
  const toggle = document.querySelector<HTMLButtonElement>("[data-player-toggle]");
  const now = document.querySelector<HTMLElement>("[data-player-now]");
  if (!list || !steps.length) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  list.classList.add("is-player");
  let i = 0;
  let timer = 0;
  let playing = !reduce;
  let visible = false;
  const show = (n: number) => {
    i = (n + steps.length) % steps.length;
    steps.forEach((s, j) => {
      s.classList.toggle("is-active", j === i);
      s.classList.toggle("is-done", j < i);
    });
    list.style.setProperty("--progress", String(i / Math.max(1, steps.length - 1)));
    const title = steps[i]?.querySelector("h3")?.textContent ?? "";
    if (now) now.textContent = `Step ${i + 1} of ${steps.length}: ${title}`;
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
        stop();
        if (toggle) toggle.textContent = "Play again";
        return;
      }
      show(i + 1);
    }, 3200);
  };
  steps.forEach((s, j) => {
    // A stretched button over the card: the whole card is clickable, the heading stays a heading.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "s-mstep-btn";
    btn.setAttribute("aria-label", `Highlight step ${j + 1}: ${s.querySelector("h3")?.textContent ?? ""}`);
    btn.addEventListener("click", () => {
      playing = false;
      stop();
      if (toggle) toggle.textContent = "Play";
      show(j);
    });
    s.appendChild(btn);
  });
  if (controls) controls.hidden = false;
  if (toggle) {
    toggle.textContent = playing ? "Pause" : "Play";
    toggle.removeAttribute("aria-pressed");
    toggle.addEventListener("click", () => {
      if (playing) {
        playing = false;
        stop();
        toggle.textContent = "Play";
      } else {
        playing = true;
        if (i >= steps.length - 1) show(0);
        toggle.textContent = "Pause";
        start();
      }
    });
  }
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
}

function init(): void {
  document.documentElement.classList.add("s-js");
  wireConnect(document);
  wireDemoLinks();
  wireMethodPlayer();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
