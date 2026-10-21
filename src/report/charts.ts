/**
 * Hand-written inline SVG charts for the report. No libraries.
 *
 * Every chart is a pure function of (data, width) that returns an SVG string.
 * The server-side render uses a default width and the viewBox scales; in the
 * browser mountReport() redraws each chart at its real pixel width so text
 * stays at reading size on a phone and on a laptop.
 *
 * Marks follow one spec: bars at most 24px thick with a 4px rounded data end,
 * 2px lines, markers with a surface ring, hairline solid grids, and labels in
 * text colours (never the data colour). Every chart has a <title>/<desc>, and
 * the report puts a table view next to it.
 */
import { money, num } from "../engine/format.ts";
import type { SensitivityPoint, Unit } from "../engine/types.ts";
import { esc, firstName, initial, sharePct, wholeSigned } from "./html.ts";
import { t } from "./messages.ts";

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** Clean tick values between min and max (inclusive range covered). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max === min) return [min];
  const raw = (max - min) / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const fr = raw / p;
  const step = (fr < 1.5 ? 1 : fr < 3 ? 2 : fr < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Rough text width for layout (system UI fonts, average glyph ≈ 0.56em). */
export function textW(s: string, size = 13): number {
  return Array.from(s).length * size * 0.56;
}

/** Splits text into lines no wider than maxW (rough width), at most maxLines; the last line ends with an ellipsis if cut. */
export function wrapWords(text: string, maxW: number, size = 13, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (textW(next, size) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1]!;
    kept[maxLines - 1] = `${last.includes(" ") ? last.replace(/\s+\S*$/, "") : last}…`;
    return kept;
  }
  return lines.length ? lines : [""];
}

function svgOpen(id: string, w: number, h: number, title: string, desc: string, cls: string): string {
  return `<svg class="wi-svg ${cls}" viewBox="0 0 ${f1(w)} ${f1(h)}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false"><title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>`;
}

/** A horizontal bar with a 4px rounded data end and a square end at the baseline. */
function hbar(x0: number, x1: number, y: number, h: number, cls: string, extra = ""): string {
  const len = Math.abs(x1 - x0);
  if (len < 1.5) return `<rect class="${cls}" x="${f1(Math.min(x0, x1) - 1)}" y="${f1(y)}" width="2" height="${f1(h)}" ${extra}/>`;
  const r = Math.min(4, len, h / 2);
  const d =
    x1 >= x0
      ? `M${f1(x0)} ${f1(y)}H${f1(x1 - r)}Q${f1(x1)} ${f1(y)} ${f1(x1)} ${f1(y + r)}V${f1(y + h - r)}Q${f1(x1)} ${f1(y + h)} ${f1(x1 - r)} ${f1(y + h)}H${f1(x0)}Z`
      : `M${f1(x0)} ${f1(y)}H${f1(x1 + r)}Q${f1(x1)} ${f1(y)} ${f1(x1)} ${f1(y + r)}V${f1(y + h - r)}Q${f1(x1)} ${f1(y + h)} ${f1(x1 + r)} ${f1(y + h)}H${f1(x0)}Z`;
  return `<path class="${cls}" d="${d}" ${extra}/>`;
}

/** A vertical column growing up from the baseline with a 4px rounded top. */
function vbar(x: number, w: number, yBase: number, yTop: number, cls: string): string {
  const h = yBase - yTop;
  if (h < 1) return `<rect class="${cls}" x="${f1(x)}" y="${f1(yBase - 2)}" width="${f1(w)}" height="2"/>`;
  const r = Math.min(4, h, w / 2);
  return `<path class="${cls}" d="M${f1(x)} ${f1(yBase)}V${f1(yTop + r)}Q${f1(x)} ${f1(yTop)} ${f1(x + r)} ${f1(yTop)}H${f1(x + w - r)}Q${f1(x + w)} ${f1(yTop)} ${f1(x + w)} ${f1(yTop + r)}V${f1(yBase)}Z"/>`;
}

function anchorFor(x: number, w: number, lw: number): { x: number; anchor: string } {
  if (x - lw / 2 < 4) return { x: Math.max(4, x - 6), anchor: "start" };
  if (x + lw / 2 > w - 4) return { x: Math.min(w - 4, x + 6), anchor: "end" };
  return { x, anchor: "middle" };
}

/* ------------------------------------------------------------------ */
/* Diverging horizontal bars: net result per scenario, with zero line   */
/* ------------------------------------------------------------------ */

export interface BarRow {
  label: string;
  sub?: string;
  value: number;
  /** Visual role: polarity by default; "accent" or "muted" for emphasis charts. */
  role?: "polarity" | "accent" | "muted";
  highlight?: boolean;
}

export function barsSvg(
  rows: BarRow[],
  opts: { width: number; id: string; title: string; desc: string; worst?: { value: number; label: string }; zeroLabel?: string | false; format?: (v: number) => string },
): string {
  const W = Math.max(280, opts.width);
  const fmtV = opts.format ?? wholeSigned;
  const vals = rows.map((r) => r.value);
  const worst = opts.worst && Number.isFinite(opts.worst.value) ? opts.worst : undefined;
  let lo = Math.min(0, ...vals, worst ? worst.value : 0);
  let hi = Math.max(0, ...vals);
  if (hi - lo < 1e-9) hi = lo + 1;
  const labelLen = Math.max(...rows.map((r) => textW(fmtV(r.value), 13)), 30) + 10;
  const padL = 6 + (vals.some((v) => v < 0) ? labelLen : 0);
  const padR = 6 + (vals.some((v) => v >= 0) ? labelLen : 0);
  const sx = (v: number) => padL + ((v - lo) / (hi - lo)) * (W - padL - padR);
  const top = opts.zeroLabel === false ? 8 : 26;
  // Row labels sit on their own line above each bar; long ones wrap (a phone is narrow), so nothing is cut off.
  const maxLabel = W - 12;
  const labelLines = rows.map((r) => wrapWords(r.sub ? `${r.label} ${r.sub}` : r.label, maxLabel, 13.5, 3));
  const rowH = (i: number) => 60 + (labelLines[i]!.length - 1) * 16;
  const rowTop: number[] = [];
  rows.forEach((_, i) => rowTop.push(i === 0 ? top : rowTop[i - 1]! + rowH(i - 1)));
  const band = (i: number) => rowTop[i]! + (labelLines[i]!.length - 1) * 16;
  const bottom = worst ? 30 : 10;
  const H = (rows.length ? rowTop[rows.length - 1]! + rowH(rows.length - 1) : top) + bottom;
  const x0 = sx(0);
  let s = svgOpen(opts.id, W, H, opts.title, opts.desc, "wi-svg-bars");
  // zero line: full height when it is a reference ("€0: breaks even"); otherwise a baseline under each bar only
  if (opts.zeroLabel !== false) s += `<line class="wi-zero" x1="${f1(x0)}" x2="${f1(x0)}" y1="${f1(top - 6)}" y2="${f1(H - bottom)}"/>`;
  else rows.forEach((_, i) => (s += `<line class="wi-zero" x1="${f1(x0)}" x2="${f1(x0)}" y1="${f1(band(i) + 22)}" y2="${f1(band(i) + 52)}"/>`));
  if (opts.zeroLabel !== false) {
    const zl = opts.zeroLabel ?? t("chart.zero", { v: tickMoney(0) });
    const a = anchorFor(x0, W, textW(zl, 12));
    s += `<text class="wi-axis-label" x="${f1(a.x)}" y="14" text-anchor="${a.anchor}">${esc(zl)}</text>`;
  }
  const xw = worst ? sx(worst.value) : undefined;
  // a worst case at or above zero is no loss: drawn neutral, not as the red alarm line
  const worstCls = worst && worst.value >= -0.5 ? "wi-ref wi-ref--worst-ok" : "wi-ref wi-ref--neg";
  // the worst case: dashed segments in each bar band only, so the line never runs through a row label
  if (worst && xw !== undefined) rows.forEach((_, i) => (s += `<line class="${worstCls}" x1="${f1(xw)}" x2="${f1(xw)}" y1="${f1(band(i) + 22)}" y2="${f1(band(i) + 52)}"/>`));
  rows.forEach((r, i) => {
    const y = band(i);
    const role = r.role ?? "polarity";
    const tn = r.value > 0.5 ? "pos" : r.value < -0.5 ? "neg" : "zero";
    const cls = role === "polarity" ? `wi-bar wi-bar--${tn}` : `wi-bar wi-bar--${role}`;
    s += `<g class="wi-bar-row${r.highlight ? " is-hl" : ""}">`;
    const lines = labelLines[i]!;
    if (lines.length === 1 && textW(r.sub ? `${r.label} ${r.sub}` : r.label, 13.5) <= maxLabel) {
      s += `<text class="wi-row-label" x="6" y="${f1(rowTop[i]! + 16)}">${esc(r.label)}${r.sub ? `<tspan class="wi-row-sub" dx="6">${esc(r.sub)}</tspan>` : ""}</text>`;
    } else {
      s += `<text class="wi-row-label" x="6" y="${f1(rowTop[i]! + 16)}">${lines.map((ln, k) => `<tspan x="6"${k ? ' dy="16"' : ""}>${esc(ln)}</tspan>`).join("")}</text>`;
    }
    const x1 = sx(r.value);
    s += hbar(x0, x1, y + 26, 22, cls);
    const v = fmtV(r.value);
    if (r.value >= 0) s += `<text class="wi-value" x="${f1(x1 + 6)}" y="${f1(y + 42)}">${esc(v)}</text>`;
    else {
      // a value label that would cross the dashed worst-case line moves to the left of it
      let end = x1 - 6;
      if (xw !== undefined && end - textW(v, 13) < xw + 4 && end > xw - 4) end = xw - 6;
      s += `<text class="wi-value" x="${f1(end)}" y="${f1(y + 42)}" text-anchor="end">${esc(v)}</text>`;
    }
    s += `</g>`;
  });
  if (worst && xw !== undefined) {
    s += `<line class="${worstCls}" x1="${f1(xw)}" x2="${f1(xw)}" y1="${f1(H - bottom + 2)}" y2="${f1(H - bottom + 12)}"/>`;
    const a = anchorFor(xw, W, textW(worst.label, 12));
    s += `<text class="wi-ref-label${worst.value >= -0.5 ? " wi-ref-label--ok" : ""}" x="${f1(a.x)}" y="${f1(H - 4)}" text-anchor="${a.anchor}">${esc(worst.label)}</text>`;
  }
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ */
/* Break-even explorer: net result across the slider range              */
/* ------------------------------------------------------------------ */

export type NetField = "netTest" | "netMonth";

/** Money for axis ticks: no cents on round values. */
export function tickMoney(v: number): string {
  return money(v, !Number.isInteger(Math.round(v * 100) / 100));
}

export function xText(x: number, unit: Unit): string {
  if (unit === "share") return `${x > 0 ? "+" : x < 0 ? "−" : ""}${sharePct(x)}`;
  if (unit === "customers/day" || unit === "units/week" || unit === "days") return num(x);
  if (unit === "EUR") return money(x);
  return num(x);
}

export interface SensLayout {
  W: number;
  H: number;
  l: number;
  r: number;
  t: number;
  b: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
}

export function sensLayout(points: SensitivityPoint[], width: number, field: NetField, twoMarks = false): SensLayout {
  const W = Math.max(280, width);
  const H = Math.round(Math.min(340, Math.max(W < 420 ? 220 : 240, W * 0.5)));
  const ys = points.map((p) => p[field]);
  let yMin = Math.min(0, ...ys);
  let yMax = Math.max(0, ...ys);
  if (yMax - yMin < 1e-9) yMax = yMin + 1;
  const pad = (yMax - yMin) * 0.1;
  yMin -= pad;
  yMax += pad;
  const tickW = Math.max(...niceTicks(yMin, yMax, 4).map((v) => textW(tickMoney(v), 12)), 28);
  const l = Math.round(tickW + 14);
  const r = 18;
  const t = twoMarks ? 48 : 30;
  const b = 34;
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMax - xMin < 1e-9) xMax = xMin + 1;
  return {
    W,
    H,
    l,
    r,
    t,
    b,
    xMin,
    xMax,
    yMin,
    yMax,
    sx: (x) => l + ((x - xMin) / (xMax - xMin)) * (W - l - r),
    sy: (y) => t + (1 - (y - yMin) / (yMax - yMin)) * (H - t - b),
  };
}

/** Linear read of the line at x (for placing the "your guess" marker between computed points). */
export function lineAt(points: SensitivityPoint[], x: number, field: NetField): number {
  const first = points[0];
  if (!first) return 0;
  let prev = first;
  for (const p of points) {
    if (p.x >= x) {
      if (p.x === prev.x) return p[field];
      const k = (x - prev.x) / (p.x - prev.x);
      return prev[field] + k * (p[field] - prev[field]);
    }
    prev = p;
  }
  return prev[field];
}

export function nearestIndex(points: SensitivityPoint[], x: number): number {
  let best = 0;
  let d = Infinity;
  points.forEach((p, i) => {
    const di = Math.abs(p.x - x);
    if (di < d - 1e-9) {
      d = di;
      best = i;
    }
  });
  return best;
}

export function sensitivitySvg(
  sens: { label: string; unit: Unit; current: number; breakEvenX: number | null; points: SensitivityPoint[] },
  opts: { width: number; index: number; field: NetField; id: string; title: string; desc: string; ongoing?: number | null; marks?: boolean },
): string {
  const pts = sens.points;
  if (pts.length === 0) return "";
  const be = sens.breakEvenX;
  const inRange = (x: number | null | undefined): x is number => x !== null && x !== undefined && Number.isFinite(x) && x >= Math.min(...pts.map((p) => p.x)) && x <= Math.max(...pts.map((p) => p.x));
  const showMarks = opts.marks !== false;
  const on = showMarks && inRange(opts.ongoing) ? opts.ongoing : undefined;
  const L = sensLayout(pts, opts.width, opts.field, on !== undefined && inRange(be));
  const { W, H, l, r, b, sx, sy } = L;
  const top = L.t;
  const y0 = sy(0);
  const plotB = H - b;
  const plotR = W - r;
  let s = svgOpen(opts.id, W, H, opts.title, opts.desc, "wi-svg-sens");
  const cp = `${opts.id}-cp`;
  const cn = `${opts.id}-cn`;
  s += `<defs><clipPath id="${cp}"><rect x="${l}" y="${top - 4}" width="${f1(plotR - l)}" height="${f1(Math.max(0, y0 - top + 4))}"/></clipPath><clipPath id="${cn}"><rect x="${l}" y="${f1(y0)}" width="${f1(plotR - l)}" height="${f1(Math.max(0, plotB - y0 + 4))}"/></clipPath></defs>`;
  // zones: makes money above zero, loses money below
  if (y0 > top) s += `<rect class="wi-zone wi-zone--pos" x="${l}" y="${top}" width="${f1(plotR - l)}" height="${f1(y0 - top)}"/>`;
  if (y0 < plotB) s += `<rect class="wi-zone wi-zone--neg" x="${l}" y="${f1(y0)}" width="${f1(plotR - l)}" height="${f1(plotB - y0)}"/>`;
  // zone words sit in a corner that no marker line crosses (left first, then right)
  const vxs = (showMarks ? [be, on] : []).filter((x): x is number => inRange(x)).map((x) => sx(x));
  const zone = (text: string, y: number) => {
    const w = textW(text, 12) + 4;
    const clear = (x0: number) => !vxs.some((vx) => vx > x0 - 4 && vx < x0 + w + 4);
    const lx = clear(l + 10) ? l + 10 : clear(plotR - 10 - w) ? plotR - 10 - w : l + 10;
    return `<text class="wi-zone-label" x="${f1(lx)}" y="${f1(y)}">${esc(text)}</text>`;
  };
  if (y0 - top > 26) s += zone(t("chart.makes"), top + 18);
  if (plotB - y0 > 26) s += zone(t("chart.loses"), plotB - 10);
  // y grid + ticks
  for (const v of niceTicks(L.yMin, L.yMax, 4)) {
    const y = sy(v);
    if (v !== 0) s += `<line class="wi-grid" x1="${l}" x2="${f1(plotR)}" y1="${f1(y)}" y2="${f1(y)}"/>`;
    s += `<text class="wi-tick" x="${l - 8}" y="${f1(y + 4)}" text-anchor="end">${esc(tickMoney(v))}</text>`;
  }
  s += `<line class="wi-zero" x1="${l}" x2="${f1(plotR)}" y1="${f1(y0)}" y2="${f1(y0)}"/>`;
  // x ticks
  const xt = niceTicks(L.xMin, L.xMax, Math.max(3, Math.min(8, Math.floor((W - l - r) / 64))));
  for (const v of xt) {
    const x = sx(v);
    s += `<line class="wi-axis" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(plotB)}" y2="${f1(plotB + 5)}"/>`;
    s += `<text class="wi-tick" x="${f1(x)}" y="${f1(plotB + 19)}" text-anchor="middle">${esc(xText(v, sens.unit))}</text>`;
  }
  s += `<line class="wi-axis" x1="${l}" x2="${f1(plotR)}" y1="${f1(plotB)}" y2="${f1(plotB)}"/>`;
  // break-even markers: pays back the test (solid) and, when different, pays its way each day (dashed).
  // Two labels stack on two rows above the plot, so they never overlap each other or the lines.
  const marks: { x: number; label: string; cls: string; row: number }[] = [];
  if (showMarks && inRange(be)) marks.push({ x: be, label: t(on !== undefined ? "chart.payBack" : "chart.be", { x: xText(be, sens.unit) }), cls: "wi-ref wi-ref--be", row: 0 });
  if (on !== undefined) marks.push({ x: on, label: t("chart.ongoing", { x: xText(on, sens.unit) }), cls: "wi-ref wi-ref--on", row: marks.length ? 1 : 0 });
  for (const m of marks) {
    const x = sx(m.x);
    s += `<line class="${m.cls}" x1="${f1(x)}" x2="${f1(x)}" y1="${top - 4}" y2="${f1(plotB)}"/>`;
    const a = anchorFor(x, W, textW(m.label, 12.5));
    const ly = marks.length > 1 ? (m.row === 0 ? top - 28 : top - 10) : top - 12;
    s += `<text class="wi-ref-label ${m.cls.includes("--on") ? "wi-ref-label--on" : "wi-ref-label--be"}" x="${f1(a.x)}" y="${f1(ly)}" text-anchor="${a.anchor}">${esc(m.label)}</text>`;
  }
  // the line, green above zero and red below
  const d = pts.map((p, i) => `${i ? "L" : "M"}${f1(sx(p.x))} ${f1(sy(p[opts.field]))}`).join("");
  s += `<path class="wi-line wi-line--pos" d="${d}" clip-path="url(#${cp})"/>`;
  s += `<path class="wi-line wi-line--neg" d="${d}" clip-path="url(#${cn})"/>`;
  // the owner's guess
  const idx = Math.max(0, Math.min(pts.length - 1, opts.index));
  const cur = pts[idx]!;
  const cx = sx(cur.x);
  const cy = sy(cur[opts.field]);
  if (sens.current >= L.xMin && sens.current <= L.xMax) {
    const gx = sx(sens.current);
    const gy = sy(lineAt(pts, sens.current, opts.field));
    s += `<circle class="wi-guess" cx="${f1(gx)}" cy="${f1(gy)}" r="6.5"/>`;
    if (Math.abs(gx - cx) > 56) {
      const lab = t("chart.yourGuess");
      const lw = textW(lab, 12);
      const vlines = marks.map((m) => sx(m.x));
      // pick the side (right, then left) and the height (above, then below) that crosses no line
      const crossesV = (x0: number, x1: number) => vlines.some((vx) => vx > x0 - 3 && vx < x1 + 3);
      const right = gx + 12 + lw < plotR && !crossesV(gx + 12, gx + 12 + lw);
      const left = gx - 12 - lw > l && !crossesV(gx - 12 - lw, gx - 12);
      const useRight = right ? true : left ? false : gx + 12 + lw < plotR;
      const above = gy - 10;
      const below = gy + 20;
      const clearOf = (y: number) => Math.abs(y - 4 - y0) > 9 && y - 12 > top && y < plotB - 2;
      const ly = clearOf(above) ? above : clearOf(below) ? below : gy < y0 ? above - 12 : below + 12;
      s += `<text class="wi-guess-label" x="${f1(useRight ? gx + 12 : gx - 12)}" y="${f1(ly)}" text-anchor="${useRight ? "start" : "end"}">${esc(lab)}</text>`;
    }
  }
  // the slider position
  s += `<g class="wi-cursor">`;
  s += `<line class="wi-cursor-line" x1="${f1(cx)}" x2="${f1(cx)}" y1="${top}" y2="${f1(plotB)}"/>`;
  s += `<circle class="wi-cursor-dot" cx="${f1(cx)}" cy="${f1(cy)}" r="6"/>`;
  const v = cur[opts.field];
  const lab = wholeSigned(v);
  const lw = textW(lab, 13.5) + 18;
  let bx = cx - lw / 2;
  bx = Math.max(l + 2, Math.min(plotR - lw - 2, bx));
  let by = cy - 40;
  if (by < top + 2) by = cy + 14;
  s += `<rect class="wi-cursor-box" x="${f1(bx)}" y="${f1(by)}" width="${f1(lw)}" height="26" rx="8"/>`;
  s += `<text class="wi-cursor-text" x="${f1(bx + lw / 2)}" y="${f1(by + 17.5)}" text-anchor="middle">${esc(lab)}</text>`;
  s += `</g>`;
  s += `<rect class="wi-hit" x="${l}" y="${top}" width="${f1(plotR - l)}" height="${f1(plotB - top)}" fill="transparent"/>`;
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ */
/* Rehearsal uptake: around vs engaged, per round                       */
/* ------------------------------------------------------------------ */

export function uptakeSvg(
  uptake: { round: number; engaged: number; active: number }[],
  opts: { width: number; id: string; total: number; rounds: number; title: string; desc: string; running?: number },
): string {
  const W = Math.max(280, opts.width);
  const H = 210;
  const l = 34;
  const r = 10;
  const top = 26;
  const b = 34;
  const n = Math.max(opts.rounds, uptake.length, 1);
  const band = (W - l - r) / n;
  const yMax = Math.max(1, opts.total);
  const sy = (v: number) => top + (1 - v / yMax) * (H - top - b);
  const bw = Math.min(22, band * 0.3);
  let s = svgOpen(opts.id, W, H, opts.title, opts.desc, "wi-svg-uptake");
  const step = yMax <= 6 ? 1 : yMax <= 12 ? 2 : Math.ceil(yMax / 5);
  for (let v = 0; v <= yMax; v += step) {
    const y = sy(v);
    s += `<line class="${v === 0 ? "wi-axis" : "wi-grid"}" x1="${l}" x2="${W - r}" y1="${f1(y)}" y2="${f1(y)}"/>`;
    s += `<text class="wi-tick" x="${l - 8}" y="${f1(y + 4)}" text-anchor="end">${v}</text>`;
  }
  for (let i = 0; i < n; i++) {
    const round = i + 1;
    const u = uptake.find((x) => x.round === round);
    const cx = l + band * i + band / 2;
    s += `<text class="wi-tick" x="${f1(cx)}" y="${H - 12}" text-anchor="middle">${esc(t("chart.round", { n: round }))}</text>`;
    if (!u) {
      const running = opts.running === round;
      s += `<text class="wi-axis-label${running ? " wi-pulse-text" : ""}" x="${f1(cx)}" y="${f1(sy(0) - 10)}" text-anchor="middle">${esc(running ? t("chart.running") : t("chart.toCome"))}</text>`;
      continue;
    }
    s += vbar(cx - bw - 1, bw, sy(0), sy(u.active), "wi-col wi-col--active");
    s += vbar(cx + 1, bw, sy(0), sy(u.engaged), "wi-col wi-col--engaged");
    const lab = t("reh.of", { n: u.engaged, of: u.active });
    s += `<text class="wi-value" x="${f1(cx)}" y="${f1(sy(Math.max(u.active, u.engaged)) - 8)}" text-anchor="middle">${esc(lab)}</text>`;
  }
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ */
/* Who told whom: a small circular network                              */
/* ------------------------------------------------------------------ */

export function networkSvg(
  people: { id: string; name: string; segment: string }[],
  links: { from: string; to: string; round: number }[],
  opts: { width: number; id: string; title: string; desc: string },
): string {
  const S = Math.max(280, Math.min(460, opts.width));
  const W = Math.max(280, opts.width);
  const H = S;
  const cx = W / 2;
  const cy = H / 2;
  const R = S / 2 - 52;
  const nr = 16;
  const pos = new Map<string, { x: number; y: number; a: number }>();
  people.forEach((p, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, people.length)) * Math.PI * 2;
    pos.set(p.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a });
  });
  const linked = new Set(links.flatMap((k) => [k.from, k.to]));
  let s = svgOpen(opts.id, W, H, opts.title, opts.desc, "wi-svg-net");
  s += `<defs><marker id="${opts.id}-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="wi-net-arrow"/></marker></defs>`;
  s += `<circle class="wi-net-ring" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}"/>`;
  const seen = new Map<string, number>();
  for (const k of links) {
    const a = pos.get(k.from);
    const z = pos.get(k.to);
    if (!a || !z || k.from === k.to) continue;
    const key = [k.from, k.to].sort().join("|");
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    const dx = z.x - a.x;
    const dy = z.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // curve slightly toward the centre; repeated pairs bend further so they stay visible
    const bend = 14 + nth * 12;
    const mx = (a.x + z.x) / 2 + (cx - (a.x + z.x) / 2) * (bend / Math.max(len, 1)) * 0.9;
    const my = (a.y + z.y) / 2 + (cy - (a.y + z.y) / 2) * (bend / Math.max(len, 1)) * 0.9;
    const sx0 = a.x + ux * (nr + 3);
    const sy0 = a.y + uy * (nr + 3);
    const ex = z.x - ux * (nr + 5);
    const ey = z.y - uy * (nr + 5);
    s += `<path class="wi-net-link" d="M${f1(sx0)} ${f1(sy0)}Q${f1(mx)} ${f1(my)} ${f1(ex)} ${f1(ey)}" marker-end="url(#${opts.id}-arrow)"/>`;
    const lx = 0.25 * sx0 + 0.5 * mx + 0.25 * ex;
    const ly = 0.25 * sy0 + 0.5 * my + 0.25 * ey;
    s += `<g class="wi-net-round"><rect x="${f1(lx - 13)}" y="${f1(ly - 9)}" width="26" height="18" rx="9"/><text x="${f1(lx)}" y="${f1(ly + 4)}" text-anchor="middle">R${k.round}</text></g>`;
  }
  for (const p of people) {
    const q = pos.get(p.id)!;
    const on = linked.has(p.id);
    s += `<g class="wi-net-node${on ? "" : " is-quiet"}" data-seg="${esc(p.segment)}">`;
    s += `<circle class="wi-net-dot wi-seg-${esc(p.segment)}" cx="${f1(q.x)}" cy="${f1(q.y)}" r="${nr}"/>`;
    s += `<text class="wi-net-initial" x="${f1(q.x)}" y="${f1(q.y + 5)}" text-anchor="middle">${esc(initial(p.name))}</text>`;
    const lx = cx + (R + nr + 14) * Math.cos(q.a);
    const ly = cy + (R + nr + 14) * Math.sin(q.a);
    const c = Math.cos(q.a);
    const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
    const dy = Math.sin(q.a) > 0.5 ? 8 : Math.sin(q.a) < -0.5 ? 0 : 4;
    s += `<text class="wi-net-name" x="${f1(lx)}" y="${f1(ly + dy)}" text-anchor="${anchor}">${esc(firstName(p.name))}</text>`;
    s += `</g>`;
  }
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ */
/* Where reality landed: a number line of guesses vs the measured value */
/* ------------------------------------------------------------------ */

export interface LineMark {
  x: number;
  label: string;
  kind: "scenario" | "breakeven" | "actual";
}

export function numberLineSvg(marks: LineMark[], opts: { width: number; id: string; unit: Unit; title: string; desc: string }): string {
  const W = Math.max(280, opts.width);
  const valid = marks.filter((m) => Number.isFinite(m.x));
  if (valid.length === 0) return "";
  let lo = Math.min(0, ...valid.map((m) => m.x));
  let hi = Math.max(...valid.map((m) => m.x));
  if (hi - lo < 1e-9) hi = lo + 1;
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const l = 22;
  const r = 22;
  const sx = (v: number) => l + ((v - lo) / (hi - lo)) * (W - l - r);
  const rowH = 18;
  // greedy label rows above the axis so labels never overlap
  const above = valid.filter((m) => m.kind !== "actual").sort((a, b) => a.x - b.x);
  const rowsEnd: number[] = [];
  const placed = above.map((m) => {
    const w = textW(m.label, 12.5) + 10;
    const x = sx(m.x);
    let row = rowsEnd.findIndex((end) => end < x - w / 2);
    if (row < 0) {
      row = rowsEnd.length;
      rowsEnd.push(-Infinity);
    }
    rowsEnd[row] = x + w / 2;
    return { m, row, x };
  });
  const nRows = Math.max(1, rowsEnd.length);
  const axisY = 16 + nRows * rowH + 18;
  const H = axisY + 62;
  let s = svgOpen(opts.id, W, H, opts.title, opts.desc, "wi-svg-line");
  s += `<line class="wi-axis wi-axis--strong" x1="${l}" x2="${W - r}" y1="${axisY}" y2="${axisY}"/>`;
  for (const v of niceTicks(lo, hi, Math.max(3, Math.floor((W - l - r) / 70)))) {
    const x = sx(v);
    s += `<line class="wi-axis" x1="${f1(x)}" x2="${f1(x)}" y1="${axisY}" y2="${axisY + 5}"/>`;
    s += `<text class="wi-tick" x="${f1(x)}" y="${axisY + 19}" text-anchor="middle">${esc(xText(v, opts.unit))}</text>`;
  }
  for (const p of placed) {
    const ly = 16 + p.row * rowH + 12;
    const cls = p.m.kind === "breakeven" ? "wi-ref wi-ref--be" : "wi-mark-stem";
    s += `<line class="${cls}" x1="${f1(p.x)}" x2="${f1(p.x)}" y1="${f1(ly + 4)}" y2="${axisY}"/>`;
    if (p.m.kind === "scenario") s += `<circle class="wi-mark-guess" cx="${f1(p.x)}" cy="${axisY}" r="5"/>`;
    const a = anchorFor(p.x, W, textW(p.m.label, 12.5));
    s += `<text class="wi-mark-label${p.m.kind === "breakeven" ? " wi-ref-label--be" : ""}" x="${f1(a.x)}" y="${f1(ly)}" text-anchor="${a.anchor}">${esc(p.m.label)}</text>`;
  }
  for (const m of valid.filter((v) => v.kind === "actual")) {
    const x = sx(m.x);
    s += `<circle class="wi-mark-actual" cx="${f1(x)}" cy="${axisY}" r="9"/>`;
    const a = anchorFor(x, W, textW(m.label, 13.5));
    s += `<text class="wi-mark-actual-label" x="${f1(a.x)}" y="${axisY + 46}" text-anchor="${a.anchor}">${esc(m.label)}</text>`;
    s += `<line class="wi-mark-stem" x1="${f1(x)}" x2="${f1(x)}" y1="${axisY + 10}" y2="${axisY + 30}"/>`;
  }
  return s + `</svg>`;
}
