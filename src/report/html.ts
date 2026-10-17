/**
 * Small, browser-safe HTML helpers for the report: escaping, source chips,
 * unit formatting (the engine's own formatters, so numbers read the same
 * everywhere) and a few icons.
 */
import { money, num, pct, price, signed } from "../engine/format.ts";
import { SOURCE_LABEL } from "../engine/types.ts";
import type { Source, Unit } from "../engine/types.ts";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes any value for use in HTML text or a double-quoted attribute. */
export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

/** A safe fragment of an id: letters, digits and dashes only. */
export function idPart(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

export const SOURCES: Source[] = ["owner", "assumption", "calculation", "imagined", "demo"];

/** One line per source: the AI-literacy lesson "what came from you, what is maths, what is a guess, what is imagined". */
export const SOURCE_LESSON: Record<Source, string> = {
  owner: "A fact you told What-IF about your café.",
  assumption: "Nobody knows this yet. It is a guess, and the small test will check it.",
  calculation: "Worked out from the numbers above with plain arithmetic. Open “Show the maths” to check it.",
  imagined: "Made up by the rehearsal's imagined customers. Good for finding questions, never evidence.",
  demo: "Sample numbers for a made-up café, so you can see how the method works.",
};

const ICON_PATH: Record<Source, string> = {
  owner: '<circle cx="8" cy="5.2" r="2.7" fill="currentColor"/><path d="M2.8 14.2c0-3 2.4-4.8 5.2-4.8s5.2 1.8 5.2 4.8z" fill="currentColor"/>',
  assumption:
    '<path d="M5.6 5.9a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.2 1-1.2 1.9v.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="8" cy="13.1" r="1.15" fill="currentColor"/>',
  calculation: '<path d="M3.5 6h9M3.5 10.4h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  imagined: '<path d="M8 1.6l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="currentColor"/><circle cx="13" cy="13" r="1.4" fill="currentColor"/>',
  demo: '<path d="M8 2.2l5.8 5.8L8 13.8 2.2 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
};

export function sourceIcon(source: Source): string {
  return `<svg class="wi-chip-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">${ICON_PATH[source]}</svg>`;
}

/** The coloured "where this number came from" chip. Colour + icon + words, so it never relies on colour alone. */
export function chip(source: Source): string {
  return `<span class="wi-chip wi-chip--${source}" data-source="${source}"><span class="wi-sr">Source: </span>${sourceIcon(source)}${esc(SOURCE_LABEL[source])}</span>`;
}

/** A share as a percentage, with one decimal only when it matters (6.9%, 30%). */
export function sharePct(v: number): string {
  const p = Math.abs(v) * 100;
  return pct(Math.abs(v), Math.abs(p - Math.round(p)) > 0.05 ? 1 : 0);
}

/** Formats a value in its unit, the way the engine writes it. */
export function fmt(v: number | string, unit: Unit): string {
  if (typeof v === "string") return v;
  switch (unit) {
    case "EUR":
      return money(v);
    case "EUR/day":
      return `${money(v)} a day`;
    case "EUR/week":
      return `${money(v)} a week`;
    case "EUR/month":
      return `${money(v)} a month`;
    case "customers/day":
      return `${num(v)} a day`;
    case "units/week":
      return `${num(v)} a week`;
    case "share":
      return `${v < 0 ? "−" : ""}${sharePct(v)}`;
    case "days":
      return `${num(v)} ${Math.abs(v) === 1 ? "day" : "days"}`;
    default:
      return String(v);
  }
}

/** Input values: money per item keeps its cents. */
export function fmtInput(v: number | string, unit: Unit): string {
  if (typeof v === "number" && unit === "EUR") return Math.abs(v) < 100 ? price(v) : money(v);
  return fmt(v, unit);
}

/**
 * Chips for an owner input. Demo values that are guesses get both labels,
 * so the demo still teaches "this one is a guess".
 */
export function inputChips(source: Source, kind: "fact" | "assumption" | "choice"): string {
  if (source === "demo" && kind === "assumption") return `${chip("demo")} ${chip("assumption")}`;
  return chip(source);
}

/**
 * Chips for a figure. A demo figure with a worked formula is still a calculation:
 * show both, so the demo keeps the "what is maths" lesson.
 */
export function figureChips(source: Source, maths: string | undefined): string {
  if (source === "demo" && maths && /[=×÷]/.test(maths)) return `${chip("calculation")} ${chip("demo")}`;
  return chip(source);
}

/** A signed change: "+€412", "−€120", "+3%", "+2 a day". */
export function fmtSigned(v: number, unit: Unit): string {
  if (unit === "share") return `${v > 0 ? "+" : v < 0 ? "−" : ""}${sharePct(v)}`;
  if (unit === "EUR" || unit === "EUR/day" || unit === "EUR/week" || unit === "EUR/month") {
    const base = signed(v);
    return unit === "EUR" ? base : `${base}${unit === "EUR/day" ? " a day" : unit === "EUR/week" ? " a week" : " a month"}`;
  }
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), unit)}`;
}

/** Splits a value into a big number and a small suffix for hero figures. */
export function bigValue(v: number, unit: Unit): { big: string; small: string } {
  switch (unit) {
    case "customers/day":
      return { big: num(v), small: "a day" };
    case "units/week":
      return { big: num(v), small: "a week" };
    case "share":
      return { big: `${v > 0 ? "+" : v < 0 ? "−" : ""}${sharePct(v)}`, small: "" };
    case "days":
      return { big: num(v), small: Math.abs(v) === 1 ? "day" : "days" };
    case "EUR/day":
    case "EUR/week":
    case "EUR/month":
      return { big: money(v), small: unit === "EUR/day" ? "a day" : unit === "EUR/week" ? "a week" : "a month" };
    case "EUR":
      return { big: money(v), small: "" };
    default:
      return { big: String(v), small: "" };
  }
}

/** "pos" / "neg" / "zero", for colouring money results (always paired with a sign and words). */
export function tone(v: number): "pos" | "neg" | "zero" {
  return v > 0.004 ? "pos" : v < -0.004 ? "neg" : "zero";
}

/** Plain words for a net result, so colour is never the only signal. */
export function netWords(v: number): string {
  const t = tone(v);
  return t === "pos" ? "makes money" : t === "neg" ? "loses money" : "breaks even";
}

/** The "Show the maths" disclosure. Works without JavaScript; the summary text flips when open. */
export function mathsToggle(maths: string | undefined, label = "Show the maths"): string {
  if (!maths || !maths.trim()) return "";
  return `<details class="wi-maths"><summary><span class="wi-when-closed">${esc(label)}</span><span class="wi-when-open">Hide the maths</span></summary><pre class="wi-maths-body">${esc(maths.trim())}</pre></details>`;
}

export function list(items: string[] | undefined, cls = "wi-list"): string {
  if (!items || items.length === 0) return "";
  return `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

/** First letter for an avatar (handles accents and empty names). */
export function initial(name: string): string {
  const ch = Array.from(name.trim())[0] ?? "?";
  return ch.toLocaleUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Inline icons used across the report (decorative; always next to words). */
export const ICONS = {
  check: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3.2 8.4l3 3 6.6-6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dot: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="3.4" fill="currentColor"/></svg>',
  keep: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tweak: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 6h9M15 6h2M3 14h3M9 14h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="13.5" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  stop: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect x="4.5" y="4.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  lock: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><rect x="4" y="9" width="12" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  warn: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 2.8l7.6 13.4H2.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 8v3.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="10" cy="14" r="1" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9v4.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="10" cy="6.3" r="1.05" fill="currentColor"/></svg>',
  printer: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5.5 7.5V3h9v4.5M5.5 14.5H3.5v-6a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v6h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><rect x="5.5" y="11.5" width="9" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M8 13.6S2 10 2 6.1A3 3 0 0 1 8 4.6a3 3 0 0 1 6 1.5C14 10 8 13.6 8 13.6z" fill="currentColor"/></svg>',
  minus: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3.5 8h9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  brow: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3 5.5l4 1.6M13 5.5l-4 1.6M4.5 11.5h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
} as const;
