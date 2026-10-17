/**
 * The landing hero chart, drawn from the demo analysis so it always tells the
 * same story as the demo report: money gained or lost from today, through the
 * test (solid) and one month after it if the owner keeps the change (dashed),
 * on the cautious, expected and optimistic guesses.
 *
 * Pure: returns an SVG string sized in real pixels, so labels stay readable
 * (>= 13 px) on a 390 px phone. All text is passed in (already translated).
 */

export interface HeroSeries {
  id: "cautious" | "expected" | "optimistic";
  label: string;
  /** Result on day 0 (the one-off setup already paid, so usually negative). */
  start: number;
  /** Result at the end of the test. */
  test: number;
  /** Result one month after the test, if kept. */
  later: number;
}

export interface HeroText {
  titleId: string;
  descId: string;
  title: string;
  desc: string;
  gain: string;
  loss: string;
  zero: string;
  today: string;
  test: string;
  keep: string;
  /** Formatted result of the expected line at the end of the test ("−56 €"). */
  testValue: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (n: number) => Math.round(n * 10) / 10;

export function heroSvg(series: HeroSeries[], days: number, monthDays: number, width: number, text: HeroText): string {
  const w = Math.max(280, Math.round(width));
  const phone = w < 520;
  const h = Math.round(Math.min(340, Math.max(phone ? 270 : 250, w * 0.6)));
  const fs = phone ? 13 : 14;
  const labelW = Math.round(Math.min(118, Math.max(84, w * 0.22)));
  const L = 12;
  const R = w - labelW - 6;
  const T = 40;
  const B = h - 34;
  const span = days + monthDays;
  const x = (d: number) => L + (d / span) * (R - L);
  const values = series.flatMap((s) => [s.start, s.test, s.later]).concat(0);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo || 1) * 0.1;
  lo -= pad;
  hi += pad;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (B - T);
  const y0 = y(0);
  const xd = x(days);
  const out: string[] = [];
  out.push(
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="${text.titleId} ${text.descId}" focusable="false" class="s-hv-svg">`,
    `<title id="${text.titleId}">${esc(text.title)}</title>`,
    `<desc id="${text.descId}">${esc(text.desc)}</desc>`,
    `<rect class="s-hv-zone-pos" x="${L}" y="${T}" width="${r1(R - L)}" height="${r1(Math.max(0, y0 - T))}"/>`,
    `<rect class="s-hv-zone-neg" x="${L}" y="${r1(y0)}" width="${r1(R - L)}" height="${r1(Math.max(0, B - y0))}"/>`,
    `<rect class="s-hv-band" x="${L}" y="${T}" width="${r1(xd - L)}" height="${r1(B - T)}"/>`,
    `<line class="s-hv-split" x1="${r1(xd)}" x2="${r1(xd)}" y1="${T - 6}" y2="${B}"/>`,
    `<text class="s-hv-band-t" x="${L + 2}" y="${T - 12}" font-size="${fs}">${esc(text.test)}</text>`,
    `<text class="s-hv-band-t s-hv-band-t--keep" x="${r1(R)}" y="${T - 12}" text-anchor="end" font-size="${fs}">${esc(text.keep)}</text>`,
    `<line class="s-hv-zero" x1="${L}" x2="${r1(R)}" y1="${r1(y0)}" y2="${r1(y0)}"/>`,
  );
  // Zone words, kept clear of the zero line.
  if (y0 - T > fs * 2.2) out.push(`<text class="s-hv-zone-t" x="${r1(xd + 8)}" y="${r1(T + fs + 6)}" font-size="${fs - 1}">↑ ${esc(text.gain)}</text>`);
  if (B - y0 > fs * 2.2) out.push(`<text class="s-hv-zone-t" x="${r1(xd + 8)}" y="${r1(B - 8)}" font-size="${fs - 1}">↓ ${esc(text.loss)}</text>`);
  out.push(`<text class="s-hv-zero-t" x="${r1(R - 4)}" y="${r1(y0 - 6)}" text-anchor="end" font-size="${fs - 1}">${esc(text.zero)}</text>`);

  const order: HeroSeries["id"][] = ["cautious", "optimistic", "expected"];
  const cls = (id: HeroSeries["id"]) => (id === "expected" ? "s-hv-line--main" : id === "optimistic" ? "s-hv-line--pos" : "s-hv-line--neg");
  for (const id of order) {
    const s = series.find((v) => v.id === id);
    if (!s) continue;
    const c = cls(id);
    out.push(
      `<path class="s-hv-line ${c}" d="M${r1(x(0))} ${r1(y(s.start))} L${r1(xd)} ${r1(y(s.test))}"/>`,
      `<path class="s-hv-line s-hv-line--later ${c}" d="M${r1(xd)} ${r1(y(s.test))} L${r1(x(span))} ${r1(y(s.later))}"/>`,
      `<circle class="s-hv-end ${c}" cx="${r1(xd)}" cy="${r1(y(s.test))}" r="${id === "expected" ? 6 : 4.5}"/>`,
    );
  }
  // The expected result at the end of the test, between its dot and the zero line, only when it fits there.
  const ex = series.find((s) => s.id === "expected");
  if (ex) {
    const dy = y(ex.test);
    const room = Math.abs(dy - y0);
    if (room >= fs + 8) {
      const ty = ex.test < 0 ? dy - 8 : dy - 8;
      out.push(`<text class="s-hv-val${ex.test < 0 ? "" : " s-hv-val--pos"}" x="${r1(xd - 8)}" y="${r1(ty)}" text-anchor="end" font-size="${fs}">${esc(text.testValue)}</text>`);
    }
  }
  // Line names at the right end, nudged apart so they never overlap.
  const ends = series
    .map((s) => ({ s, y: y(s.later) }))
    .sort((a, b) => a.y - b.y);
  const gap = fs + 5;
  for (let i = 1; i < ends.length; i++) if (ends[i]!.y - ends[i - 1]!.y < gap) ends[i]!.y = ends[i - 1]!.y + gap;
  const overflow = ends.length ? ends[ends.length - 1]!.y - (h - 6) : 0;
  if (overflow > 0) for (const e of ends) e.y -= overflow;
  for (const e of ends) {
    out.push(
      `<circle class="s-hv-end ${cls(e.s.id)}" cx="${r1(x(span))}" cy="${r1(y(e.s.later))}" r="${e.s.id === "expected" ? 6 : 4.5}"/>`,
      `<text class="s-hv-t${e.s.id === "expected" ? " s-hv-t--main" : ""}" x="${r1(x(span) + 10)}" y="${r1(e.y + fs / 3)}" font-size="${fs}">${esc(e.s.label)}</text>`,
    );
  }
  out.push(
    `<circle class="s-hv-start" cx="${r1(x(0))}" cy="${r1(y(series.find((s) => s.id === "expected")?.start ?? 0))}" r="5"/>`,
    `<text class="s-hv-axis" x="${L}" y="${h - 10}" font-size="${fs - 1}">${esc(text.today)}</text>`,
    "</svg>",
  );
  return out.join("");
}
