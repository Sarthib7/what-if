/**
 * UI check: opens the What-IF site in Chromium (Playwright), the way an owner
 * or a judge would, and checks what the report must do to teach: no sideways
 * scrolling on a phone, a break-even slider that re-explains itself, dark
 * mode with readable text (opacity included), one heading per page, named
 * controls, a report that draws within 2 s, no script errors, a connect page
 * that works, and for the Berlin closed beta (v0.2): a language switcher on
 * every page, a German report with no English UI left, a phone report under
 * 14 screens, a test card that prints on at most 2 pages, the /try wizard
 * done with the keyboard alone, and the invite-code gate on a beta server.
 *
 *   node --import tsx qa/ui-check.ts                         starts scripts/dev.mjs (and a beta server) on free ports
 *   node --import tsx qa/ui-check.ts --url http://localhost:3000   uses a server that is already running (no beta checks)
 *
 * Screenshots (*.png) and the visible page text (*.txt) go to qa/reports/ui/
 * (ignored by git), for the judges in qa/judges.md.
 *
 * Playwright is optional. Without it every UI check fails with the reason and
 * the install command. UI_CHROMIUM points at a Chromium binary when
 * Playwright's own download is missing. QA_PLAYWRIGHT_MODULE points at a
 * playwright package folder elsewhere on disk.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface UiResult {
  id: string;
  ok: boolean;
  detail: string;
}

/** Phone viewport for every 390 px check. */
const PHONE = { width: 390, height: 844 };
/** The phone report must fit in this many screens (with its sections collapsed). */
export const MAX_PHONE_SCREENS = 14;

export const UI_CHECKS: { id: string; title: string }[] = [
  { id: "ui-phone-width", title: "no sideways scrolling at 390 px (landing, connect, try, demo report)" },
  { id: "ui-slider-explains", title: "moving the break-even slider rewrites the \"Why this changed\" text, twice" },
  { id: "ui-dark-mode", title: "dark mode renders (prefers-color-scheme: dark) and text is readable: contrast >= 4.5 (3 for large text), opacity of the element and its parents included, the landing's method steps included (dark and light)" },
  { id: "ui-one-h1", title: "exactly one h1 per page" },
  { id: "ui-names", title: "every button, link and input has an accessible name" },
  { id: "ui-fast-report", title: "the demo report draws from its link within 2 s" },
  { id: "ui-no-errors", title: "no JavaScript errors or failed loads on any page" },
  { id: "ui-connect", title: "the landing page links to Connect; Connect shows the MCP URL (.../api/mcp) and a skill download that works" },
  { id: "ui-lang-switcher", title: "a DE · EN · ES · PL language switcher on the landing, connect, try and report pages; on the German report, EN re-renders it in English" },
  { id: "ui-german-report", title: "the German demo report (/r#… with lang de) draws in German: html lang de, no English UI phrases" },
  { id: "ui-report-height", title: `the demo report at 390 px is under ${MAX_PHONE_SCREENS} screen heights with its sections collapsed (reports the height)` },
  { id: "ui-landing-steps", title: "the landing page's method has as many steps as the report (six), in its heading and its list" },
  { id: "ui-print-card", title: "printing the test card (print media, A4) gives at most 2 pages" },
  { id: "ui-try", title: "/try is served and shows its first question" },
  { id: "ui-try-keyboard", title: "/try can be completed with the keyboard alone (Tab, typing, Space, Enter) and ends on a drawn report" },
  { id: "ui-try-invite", title: "closed beta (WHATIF_BETA_CODES set): /try asks for the invite code, refuses a wrong one, accepts the right one and remembers it; /connect then shows the personal …/api/mcp?code= URL" },
];

export interface UiOptions {
  root: string;
  /** Origin of the running site, e.g. http://127.0.0.1:3000 */
  base: string;
  /** encodeState() token of the main demo report (the shipped demo, German by default). */
  token: string;
  /** Tokens of the shipped demo per language (screenshots and text for each). */
  tokens?: Partial<Record<string, string>>;
  /** Language of `token` (default "de"). */
  lang?: string;
  /** Text the drawn report must contain (from the token), e.g. the demo café's name. */
  marker: string;
  /** "Why this changed" in every language the report may use. */
  whyLabels?: string[];
  /** Origin of a second server with WHATIF_BETA_CODES set, and the code it accepts. */
  betaBase?: string;
  betaCode?: string;
  /** Why there is no beta server, when there is none. */
  betaError?: string;
  /** Where screenshots and page text go. */
  shots: string;
  log?: (line: string) => void;
}

/** Common English UI phrases that must not appear in a German (or Spanish, Polish) report. */
export const EN_UI_PHRASES: RegExp[] = [
  /\bShow the maths\b/i,
  /\bYour numbers?\b/,
  /\bPossible outcomes\b/i,
  /\bBreak-even is\b/i,
  /\bWhy this changed\b/i,
  /\bWhich guess matters most\b/i,
  /\bThe one number to remember\b/i,
  /\bRehearsal with imagined customers\b/i,
  /\bCheck these with real customers\b/i,
  /\bCan you afford to be wrong\b/i,
  /\bWhat you learned\b/i,
  /\bDemo data\b/,
  /\bA guess\b/,
  /\bCalculated\b/,
  /\bImagined customers?\b/,
  /\bYour test\b/,
  /\bStep \d\/\d\b/,
  /\bSource: /,
  /\bextra (lunch )?customers a day\b/i,
  /\bWorst case over the test\b/i,
];

/** The English UI phrases found in a text (each phrase once). */
export function englishHits(text: string): string[] {
  const out: string[] = [];
  for (const re of EN_UI_PHRASES) {
    const m = re.exec(text);
    if (m) out.push(m[0].trim());
  }
  return out;
}

const GERMAN_WORDS = [/\bSchritt\b/, /\bIhre?n?\b/, /\bKunden\b/, /\bund\b/, /\bnicht\b/, /\bSie\b/, /\bpro Tag\b|\bam Tag\b/, /\bTest\w*\b/];

// ---- the small part of Playwright used here, so this file type-checks without the package ----
interface PwConsoleMessage {
  type(): string;
  text(): string;
  location(): { url?: string };
}
interface PwLocator {
  first(): PwLocator;
  count(): Promise<number>;
  focus(): Promise<void>;
  click(o?: { timeout?: number }): Promise<void>;
  fill(value: string, o?: { timeout?: number }): Promise<void>;
  selectOption(value: string, o?: { timeout?: number }): Promise<unknown>;
  isVisible(): Promise<boolean>;
  inputValue(o?: { timeout?: number }): Promise<string>;
}
interface PwPage {
  goto(url: string, o?: { waitUntil?: "load" | "domcontentloaded" | "commit" | "networkidle"; timeout?: number }): Promise<unknown>;
  reload(o?: { waitUntil?: "load" | "domcontentloaded"; timeout?: number }): Promise<unknown>;
  url(): string;
  evaluate<T = unknown>(script: string): Promise<T>;
  waitForFunction(script: string, arg?: unknown, o?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
  pdf(o?: { format?: string; printBackground?: boolean }): Promise<Uint8Array>;
  locator(selector: string): PwLocator;
  keyboard: { press(key: string): Promise<void>; type(text: string): Promise<void> };
  on(event: "pageerror", fn: (e: Error) => void): void;
  on(event: "console", fn: (m: PwConsoleMessage) => void): void;
  on(event: "requestfailed", fn: (r: { url(): string; failure(): { errorText: string } | null }) => void): void;
  close(): Promise<void>;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(o?: { viewport?: { width: number; height: number }; colorScheme?: "light" | "dark" }): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwChromium {
  launch(o?: { executablePath?: string }): Promise<PwBrowser>;
}

const INSTALL_HINT =
  "Playwright is not installed. Add it with `npm i -D playwright@1.56.1`, then run `npx playwright install chromium` (or set UI_CHROMIUM to a Chromium binary).";

async function loadChromium(): Promise<{ chromium?: PwChromium; error?: string }> {
  for (const spec of ["playwright", "playwright-core"]) {
    try {
      const name: string = spec;
      const m = await import(name);
      const c = (m.chromium ?? m.default?.chromium) as PwChromium | undefined;
      if (c) return { chromium: c };
    } catch {
      /* try the next one */
    }
  }
  const dir = process.env.QA_PLAYWRIGHT_MODULE;
  if (dir) {
    try {
      const file = existsSync(join(dir, "index.mjs")) ? join(dir, "index.mjs") : join(dir, "index.js");
      const m = await import(pathToFileURL(file).href);
      const c = (m.chromium ?? m.default?.chromium) as PwChromium | undefined;
      if (c) return { chromium: c };
    } catch (e) {
      return { error: `QA_PLAYWRIGHT_MODULE=${dir} could not be loaded: ${(e as Error).message}` };
    }
  }
  return { error: INSTALL_HINT };
}

// ---- in-page scripts: plain JavaScript strings, because tsx adds helpers to real functions that the page does not have ----

const H1_COUNT = `Array.from(document.querySelectorAll('h1')).filter(function (h) { return h.getClientRects().length > 0; }).length`;

const OVERFLOW = `Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth`;

const HEIGHT = `Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)`;

/** Closes every open <details> (the report's collapsible sections) and returns how many were open. */
const COLLAPSE = `(() => { let n = 0; for (const d of Array.from(document.querySelectorAll('details[open]'))) { d.open = false; n++; } return n; })()`;

const UNNAMED = `(() => {
  const out = [];
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=slider], [role=tab], [role=switch], [role=checkbox]';
  for (const el of Array.from(document.querySelectorAll(sel))) {
    if (el.getClientRects().length === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    const byIds = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map((i) => { const n = document.getElementById(i); return n ? n.textContent : ''; }).join(' ').trim();
    const forLabel = el.id ? Array.from(document.querySelectorAll('label')).filter((l) => l.htmlFor === el.id).map((l) => l.textContent).join(' ').trim() : '';
    const wrap = el.closest('label') ? el.closest('label').textContent.trim() : '';
    const img = el.querySelector('img[alt]');
    const svgTitle = el.querySelector('svg title');
    const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    const buttonValue = el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type) ? el.value : '';
    const name = (el.getAttribute('aria-label') || '').trim() || byIds || forLabel || wrap || (el.getAttribute('title') || '').trim() || buttonValue
      || (isField ? '' : (el.textContent || '').trim()) || (img ? img.getAttribute('alt') : '') || (svgTitle ? svgTitle.textContent.trim() : '')
      || (isField ? (el.getAttribute('placeholder') || '').trim() : '');
    if (!name) {
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      out.push((el.tagName.toLowerCase() + (el.type ? '[type=' + el.type + ']' : '') + (el.id ? '#' + el.id : '') + cls).slice(0, 80));
    }
  }
  return out;
})()`;

/**
 * Contrast of visible text against its real background: background layers composited,
 * any CSS colour via canvas, and the opacity of the element and every parent applied to
 * the text and to each layer (so text dimmed with opacity: 0.62 is measured as it looks).
 * Large text (>= 24 px, or >= 18.66 px bold) needs 3:1, the rest 4.5:1. The landing's
 * method steps ([data-mstep], .s-mstep) are always included.
 */
const CONTRAST = `(() => {
  const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const lin = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const scheme = getComputedStyle(document.documentElement).colorScheme || '';
  const darkCanvas = /dark/.test(scheme) && matchMedia('(prefers-color-scheme: dark)').matches;
  const canvasBg = darkCanvas ? [18, 18, 18, 1] : [255, 255, 255, 1];
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).opacity); if (!isNaN(v)) o *= v; } return o; };
  const bgOf = (el) => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) { const a = c[3] * opacityOf(n); layers.push([c[0], c[1], c[2], a]); if (a >= 0.999) break; } } let b = canvasBg; for (let i = layers.length - 1; i >= 0; i--) b = over(layers[i], b); return b; };
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const hiddenish = (el) => { if (el.closest('[aria-hidden=true], svg, script, style, template, noscript')) return true; const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) return true; const cs = getComputedStyle(el); return cs.visibility === 'hidden' || cs.display === 'none' || /rect\\(0/.test(cs.clip || '') || cs.clipPath === 'inset(50%)'; };
  const sel = 'p, li, td, th, dd, dt, figcaption, blockquote, label, h1, h2, h3, h4, h5, h6, [data-mstep], [data-mstep] *, .s-mstep, .s-mstep *';
  const els = Array.from(document.querySelectorAll(sel))
    .filter((el) => el.getClientRects().length > 0 && !hiddenish(el) && ownText(el).length >= 3)
    .slice(0, 300);
  let worst = null; const low = []; let steps = 0;
  for (const el of els) {
    const bg = bgOf(el);
    const c = rgba(getComputedStyle(el).color);
    const op = opacityOf(el);
    const fg = over([c[0], c[1], c[2], c[3] * op], bg);
    const r = Math.round(ratio(fg, bg) * 100) / 100;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) || 16;
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const inSteps = !!el.closest('[data-mstep], .s-mstep');
    if (inSteps) steps++;
    const text = ownText(el).slice(0, 40);
    if (!worst || r < worst.r) worst = { r, text };
    if (r < need) low.push(r + ' "' + text + '"' + (op < 0.999 ? ' (opacity ' + Math.round(op * 100) / 100 + ')' : '') + (inSteps ? ' [method step]' : ''));
  }
  const page = bgOf(document.body || document.documentElement);
  return { count: els.length, steps, worst, low: low.slice(0, 4), lowCount: low.length, pageLum: Math.round(lum(page) * 1000) / 1000, pageBg: page.slice(0, 3).map(Math.round).join(',') };
})()`;

const SLIDER_STATE = `(() => { const s = document.querySelector('input[type="range"]'); return s ? { value: s.value, min: s.min, max: s.max, step: s.step } : null; })()`;

/** The text block around the words "Why this changed" (in any of the given languages): the explanation that follows the slider. */
const WHY_TEXT = (labels: string[]) => `(() => {
  const labels = ${JSON.stringify(labels.map((l) => l.toLowerCase()))};
  const has = (s) => { s = (s || '').toLowerCase(); return labels.some((l) => s.includes(l)); };
  const skip = ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'];
  const all = Array.from(document.body.querySelectorAll('*')).filter((e) => !skip.includes(e.tagName) && !e.closest('script, style, template'));
  const hits = all.filter((e) => has(e.textContent) && !Array.from(e.children).some((c) => has(c.textContent)));
  const shown = hits.filter((h) => h.getClientRects().length > 0);
  if (!shown.length) return null;
  const h = shown[0];
  const base = (h.innerText || h.textContent || '').trim().length;
  let r = h;
  while (r.parentElement && r.parentElement !== document.body && (r.innerText || '').trim().length < base + 25) r = r.parentElement;
  return (r.innerText || r.textContent || '').trim().slice(0, 3000);
})()`;

const setSlider = (steps: number) => `(() => {
  const s = document.querySelector('input[type="range"]');
  const step = Number(s.step) || 1;
  const v = Math.min(Number(s.max || 100), Math.max(Number(s.min || 0), Number(s.value) + (${steps}) * step));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(s, String(v));
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return s.value;
})()`;

const LINKS = `Array.from(document.querySelectorAll('a[href]')).map((a) => a.href)`;

const READY = (marker: string) => `!!document.querySelector('h1') && !!document.body && document.body.innerText.includes(${JSON.stringify(marker)})`;

const REPORT_DRAWN = `!!document.querySelector('[data-wi-report]') && !!document.querySelector('h1')`;

/** Finds the visible language controls (DE, EN, ES, PL) and marks each with data-qa-lang. */
const LANG_CONTROLS = `(() => {
  const want = { de: /^(de|deutsch)$/i, en: /^(en|english)$/i, es: /^(es|espa(ñ|n)ol)$/i, pl: /^(pl|polski)$/i };
  const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const found = {};
  const cands = Array.from(document.querySelectorAll('a, button, [role=button], [role=radio], [role=tab], [role=menuitem], [role=option], [role=menuitemradio], option, input[type=radio], label'));
  for (const el of cands) {
    const sel = el.tagName === 'OPTION' ? el.closest('select') : null;
    if (el.tagName === 'OPTION' ? !(sel && vis(sel)) : !vis(el)) continue;
    const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    const attrs = [el.getAttribute('hreflang'), el.getAttribute('data-lang'), el.getAttribute('data-set-lang'), el.getAttribute('data-wi-lang'), el.tagName === 'OPTION' || el.tagName === 'INPUT' ? el.value : null, el.tagName === 'A' || el.tagName === 'BUTTON' ? el.getAttribute('lang') : null]
      .filter(Boolean).map((s) => String(s).toLowerCase());
    const aria = (el.getAttribute('aria-label') || '').trim();
    for (const l of Object.keys(want)) {
      if (found[l]) continue;
      if (want[l].test(t) || want[l].test(aria) || attrs.includes(l) || attrs.some((a) => a.startsWith(l + '-'))) { found[l] = el.tagName.toLowerCase(); el.setAttribute('data-qa-lang', l); }
    }
  }
  return found;
})()`;

const HTML_LANG = `(() => { const r = document.querySelector('[data-wi-report]'); const near = r ? r.closest('[lang]') : null; return { html: document.documentElement.lang || '', report: near ? near.getAttribute('lang') : '' }; })()`;

const BODY_TEXT = `document.body ? document.body.innerText : ''`;

const LANDING_STEPS = `(() => {
  const items = Array.from(document.querySelectorAll('[data-mstep], .s-mstep')).filter((e) => e.getClientRects().length > 0);
  const uniq = items.filter((e, i) => !items.some((o, j) => j !== i && o.contains(e) && o !== e));
  const sec = uniq[0] ? uniq[0].closest('section') : null;
  const h = sec ? sec.querySelector('h2') : null;
  return { count: uniq.length, heading: h ? (h.innerText || '').trim() : '', last: uniq.length ? (uniq[uniq.length - 1].innerText || '').trim().slice(0, 120) : '' };
})()`;

const REPORT_STEPS = `new Set(Array.from(document.querySelectorAll('[data-wi-report] [data-step], section[data-step]')).map((e) => e.getAttribute('data-step'))).size`;

/** What is on the screen of a wizard: the visible question texts and fields (inside <main> when there is one). */
const SCREEN = `(() => {
  const vis = (el) => { if (!el || el.getClientRects().length === 0) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const main = document.querySelector('main') || document.body;
  const heads = Array.from(main.querySelectorAll('h1, h2, h3, legend, label')).filter(vis).map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
  const fields = Array.from(main.querySelectorAll('input:not([type=hidden]), select, textarea, [role=radio], [role=radiogroup] button, fieldset button')).filter(vis).filter((e) => !e.disabled);
  const buttons = Array.from(main.querySelectorAll('button, [role=button], input[type=submit]')).filter(vis).filter((e) => !e.disabled);
  const alerts = Array.from(document.querySelectorAll('[role=alert], [aria-live=assertive], [aria-live=polite], .s-error, [data-error], [data-try-error]')).filter(vis).map((e) => (e.innerText || '').trim()).filter(Boolean);
  const code = fields.find((f) => /code|einladung|invite|invitaci|zaprosz/i.test([f.name, f.id, f.getAttribute('autocomplete'), f.getAttribute('placeholder'), f.getAttribute('aria-label'), f.labels && f.labels[0] ? f.labels[0].innerText : ''].join(' ')));
  if (code) code.setAttribute('data-qa-code', '1');
  return { url: location.href, heads: heads.slice(0, 6), fields: fields.length, buttons: buttons.length, alerts: alerts.slice(0, 3), code: !!code,
    sig: heads.join(' | ').slice(0, 400) + ' #' + fields.map((f) => f.name || f.id || f.type || f.tagName).join(',') };
})()`;

/** The focused element, described for the keyboard driver. */
const FOCUSED = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { kind: 'none', text: '', label: '' };
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  const role = el.getAttribute('role') || '';
  let kind = 'other';
  if ((tag === 'input' && type === 'radio') || role === 'radio') kind = 'radio';
  else if (tag === 'input' && type === 'checkbox') kind = 'checkbox';
  else if (tag === 'input' && ['submit', 'button', 'reset', 'image'].includes(type)) kind = 'button';
  else if (tag === 'input' && type === 'range') kind = 'range';
  else if (tag === 'input' || tag === 'textarea') kind = 'text';
  else if (tag === 'select') kind = 'select';
  else if (tag === 'button' || role === 'button' || role === 'option') kind = 'button';
  else if (tag === 'a') kind = 'link';
  let groupChecked = false;
  if (kind === 'radio') {
    const name = el.getAttribute('name');
    if (name && tag === 'input') groupChecked = !!document.querySelector('input[type=radio][name="' + CSS.escape(name) + '"]:checked');
    else { const g = el.closest('[role=radiogroup]'); groupChecked = g ? !!g.querySelector('[aria-checked=true]') : el.getAttribute('aria-checked') === 'true'; }
  }
  const lab = el.labels && el.labels[0] ? el.labels[0].innerText : '';
  return { kind, tag, type,
    text: ((tag === 'input' ? el.value : el.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
    label: [(el.getAttribute('aria-label') || ''), lab].join(' ').trim().slice(0, 120),
    inChrome: !!el.closest('header, nav, footer, [data-lang-switch], [data-lang-switcher], [data-langs]') || /^(de|en|es|pl)$/i.test(((tag === 'input' ? '' : el.innerText) || '').trim()),
    value: 'value' in el ? String(el.value || '') : '', placeholder: el.getAttribute('placeholder') || '', name: (el.getAttribute('name') || '') + ' ' + (el.id || ''),
    list: el.list ? Array.from(el.list.options).map((o) => o.value).filter(Boolean).slice(0, 3) : [],
    selectedIndex: tag === 'select' ? el.selectedIndex : -1, options: tag === 'select' ? el.options.length : 0, selectValue: tag === 'select' ? el.value : '',
    groupChecked, pressed: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true',
    inputmode: el.getAttribute('inputmode') || '', min: el.getAttribute('min') || '',
    submit: type === 'submit' || (tag === 'button' && (el.getAttribute('type') || 'submit') === 'submit' && !!el.form) };
})()`;

interface Focused {
  kind: string;
  tag?: string;
  type?: string;
  text: string;
  label: string;
  inChrome?: boolean;
  value?: string;
  placeholder?: string;
  name?: string;
  list?: string[];
  selectedIndex?: number;
  options?: number;
  selectValue?: string;
  groupChecked?: boolean;
  pressed?: boolean;
  inputmode?: string;
  min?: string;
  submit?: boolean;
}
interface Screen {
  url: string;
  heads: string[];
  fields: number;
  buttons: number;
  alerts: string[];
  code: boolean;
  sig: string;
}

/** Whole words in any of the four languages (\b is ASCII-only in JavaScript, so "Ändern" or "wróć" would never match it). */
const words = (list: string, extra = "") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list})(?![\\p{L}\\p{N}])${extra ? `|${extra}` : ""}`, "iu");
const NEXT = words("next|continue|weiter|fortfahren|siguiente|continuar|seguir|dalej|kontynuuj|dalsze|done|fertig|los geht|starten|start|empezar|zacznij|zaczynamy|show|zeigen|anzeigen|erstellen|öffnen|open|abrir|otwórz|ver|crear|mostrar|pokaż|utwórz|report|bericht|informe|raport|ok", "[→›»]");
const BACK = words("back|zurück|atrás|volver|wstecz|cofnij|wróć|previous|vorherige", "[←‹«]");
/** "Change" buttons on a review screen jump back to a question; the driver never presses them. */
const EDIT = words("change|edit|ändern|bearbeiten|korrigieren|cambiar|editar|modificar|zmień|edytuj|popraw");

const PRINT_STUB = `(() => { window.__qaPrint = []; window.print = () => { window.__qaPrint.push({ html: document.documentElement.className, body: document.body ? document.body.className : '' }); }; return true; })()`;
const PRINT_HOLD = `(() => {
  const c = (window.__qaPrint || [])[0];
  if (!c) return false;
  const apply = () => { if (document.documentElement.className !== c.html) document.documentElement.className = c.html; if (document.body && document.body.className !== c.body) document.body.className = c.body; };
  apply();
  window.__qaObs = new MutationObserver(apply);
  window.__qaObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: false });
  return c.html;
})()`;
const PRINT_RELEASE = `(() => { if (window.__qaObs) window.__qaObs.disconnect(); document.documentElement.classList.remove('wi-print-card'); return true; })()`;

interface Contrast {
  count: number;
  steps: number;
  worst: { r: number; text: string } | null;
  low: string[];
  lowCount: number;
  pageLum: number;
  pageBg: string;
}

/** Pages in a PDF (Chromium writes one /Type /Page dictionary per page). */
export function pdfPages(bytes: Uint8Array): number {
  const s = Buffer.from(bytes).toString("latin1");
  const pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return Math.max(pages, counts.length ? Math.max(...counts) : 0);
}

async function firstOk(base: string, paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      const r = await fetch(base + p, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return p;
    } catch {
      /* next */
    }
  }
  return null;
}

const NUMBER_WORDS: [RegExp, number][] = [
  [words("five|fünf|cinco|pięć|piec|5"), 5],
  [words("six|sechs|seis|sześć|szesc|6"), 6],
  [words("seven|sieben|siete|siedem|7"), 7],
  [words("eight|acht|ocho|osiem|8"), 8],
];

/** A value the owner might type for this field: the demo value from the placeholder when there is one. */
function valueFor(f: Focused, code?: string): string {
  const hint = `${f.name ?? ""} ${f.label} ${f.placeholder ?? ""}`;
  if (code && /code|einladung|invite|invitaci|zaprosz/i.test(hint)) return code;
  if (f.list?.length) return f.list[0]!;
  if (/kiez|bezirk|barrio|dzielnic|neighbou?rhood/i.test(hint)) return "Neukölln";
  const num = /\d+(?:[.,]\d+)?/.exec(f.placeholder ?? "")?.[0];
  if (num) return num;
  if (f.type === "number" || /numeric|decimal/.test(f.inputmode ?? "")) return f.min && Number(f.min) > 0 ? f.min : "10";
  if (/name|business|café|cafe/i.test(hint)) return "Café QA";
  return "40";
}

/**
 * Walks a one-question-per-screen wizard with the keyboard only: on each screen it tabs
 * through the controls, types into empty fields (demo values from the placeholders),
 * picks the first choice (Space on a radio, ArrowDown on a select, Enter on a choice
 * button) and presses Enter on the "next" button, until the page moves to /r#….
 */
async function driveWizard(page: PwPage, o: { code?: string; maxScreens?: number; isDone: (url: string) => boolean }): Promise<{ ok: boolean; screens: string[]; detail: string }> {
  const screens: string[] = [];
  const screen = () => page.evaluate<Screen>(SCREEN);
  const changed = async (before: Screen, ms = 2500): Promise<boolean> => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await page.waitForTimeout(150);
      if (o.isDone(page.url())) return true;
      const now = await screen().catch(() => null);
      if (now && (now.sig !== before.sig || now.url !== before.url)) return true;
    }
    return false;
  };
  const visits = new Map<string, number>();
  for (let n = 0; n < (o.maxScreens ?? 40); n++) {
    if (o.isDone(page.url())) return { ok: true, screens, detail: `done after ${screens.length} screens` };
    const s = await screen();
    screens.push(s.heads.slice(0, 2).join(" / ") || "(no question text)");
    const seenBefore = (visits.get(s.sig) ?? 0) + 1;
    visits.set(s.sig, seenBefore);
    if (seenBefore >= 3) return { ok: false, screens, detail: `the wizard keeps coming back to "${s.heads.slice(0, 2).join(" / ").slice(0, 100)}" (${screens.length} screens so far; see try-walkthrough.txt)` };
    let advanced = false;
    let choiceTried = false;
    const seen: string[] = [];
    for (let k = 0; k < 40 && !advanced; k++) {
      const f = await page.evaluate<Focused>(FOCUSED);
      seen.push(`${f.kind}${f.text ? `:${f.text.slice(0, 20)}` : ""}`);
      let filled = false;
      if (f.kind === "text" && !f.value) {
        await page.keyboard.type(valueFor(f, o.code));
        filled = true;
      } else if (f.kind === "select" && (f.selectedIndex ?? 0) <= 0 && (f.options ?? 0) > 1 && !f.selectValue) {
        await page.keyboard.press("ArrowDown");
        filled = true;
      } else if (f.kind === "radio" && !f.groupChecked) {
        await page.keyboard.press("Space");
        filled = true;
      } else if ((f.kind === "button" || f.kind === "link") && !f.inChrome && !BACK.test(`${f.text} ${f.label}`) && !EDIT.test(`${f.text} ${f.label}`)) {
        const isNext = NEXT.test(`${f.text} ${f.label}`) || !!f.submit;
        if (isNext || (!choiceTried && f.kind === "button" && !f.pressed)) {
          if (!isNext) choiceTried = true;
          await page.keyboard.press("Enter");
          if (await changed(s)) {
            advanced = true;
            break;
          }
        }
      }
      // Enter in a field is the usual "next" (form submit); if the screen stays, keep tabbing to its button.
      if (filled) {
        await page.keyboard.press("Enter");
        if (await changed(s, 1200)) {
          advanced = true;
          break;
        }
      }
      await page.keyboard.press("Tab");
    }
    if (!advanced) {
      const now = await screen().catch(() => s);
      return { ok: false, screens, detail: `stuck on screen ${screens.length} "${s.heads.slice(0, 2).join(" / ")}"${now.alerts.length ? `, message: "${now.alerts[0]?.slice(0, 120)}"` : ""}; focus went ${seen.slice(0, 12).join(" → ")}` };
    }
  }
  return o.isDone(page.url()) ? { ok: true, screens, detail: `done after ${screens.length} screens` } : { ok: false, screens, detail: `not done after ${screens.length} screens` };
}

export async function runUiCheck(o: UiOptions): Promise<UiResult[]> {
  const log = o.log ?? (() => undefined);
  const results = new Map<string, { ok: boolean; detail: string }>();
  const set = (id: string, problems: string[], okDetail: string) => {
    results.set(id, problems.length ? { ok: false, detail: problems.join("; ") } : { ok: true, detail: okDetail });
    log(`${problems.length ? "FAIL" : "ok  "} ${id}: ${results.get(id)!.detail}`);
  };
  const all = (detail: string): UiResult[] => UI_CHECKS.map((c) => ({ id: c.id, ok: false, detail }));
  const mainLang = o.lang ?? "de";
  const why = o.whyLabels?.length ? o.whyLabels : ["Why this changed"];

  const { chromium, error } = await loadChromium();
  if (!chromium) return all(error ?? INSTALL_HINT);
  let browser: PwBrowser;
  try {
    browser = await chromium.launch(process.env.UI_CHROMIUM ? { executablePath: process.env.UI_CHROMIUM } : {});
  } catch (e) {
    return all(`Chromium did not start (${(e as Error).message.split("\n")[0]}). Run \`npx playwright install chromium\` or set UI_CHROMIUM.`);
  }
  mkdirSync(o.shots, { recursive: true });
  const shot = (name: string) => join(o.shots, `${name}.png`);
  const text = (name: string, s: string) => writeFileSync(join(o.shots, `${name}.txt`), s);

  try {
    const connectPath = await firstOk(o.base, ["/connect", "/connect.html"]);
    const reportPath = await firstOk(o.base, ["/r", "/r.html"]);
    const tryPath = await firstOk(o.base, ["/try", "/try.html"]);
    const pages: { name: string; url: string }[] = [{ name: "landing", url: `${o.base}/` }];
    if (connectPath) pages.push({ name: "connect", url: o.base + connectPath });
    if (tryPath) pages.push({ name: "try", url: o.base + tryPath });
    if (reportPath) pages.push({ name: "report", url: `${o.base}${reportPath}#${o.token}` });
    // A missing connect or report page fails every page check; a missing /try fails only the /try checks and the switcher.
    const missing = [!connectPath && "connect page (/connect or /connect.html)", !reportPath && "report page (/r or /r.html)"].filter(Boolean) as string[];
    const missingNote = missing.length ? `not served: ${missing.join(", ")}` : "";

    const errors = new Set<string>();
    const watch = (page: PwPage, name: string) => {
      page.on("pageerror", (e) => errors.add(`${name}: ${e.message.split("\n")[0]}`));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const where = m.location()?.url ?? "";
        if (/favicon/i.test(where + m.text())) return;
        errors.add(`${name}: console error: ${m.text().slice(0, 160)}`);
      });
      page.on("requestfailed", (r) => {
        if (!/favicon/i.test(r.url())) errors.add(`${name}: failed to load ${r.url().replace(o.base, "").slice(0, 80)} (${r.failure()?.errorText ?? "?"})`);
      });
    };
    const settle = async (page: PwPage, name: string) => {
      if (name.startsWith("report")) await page.waitForFunction(READY(o.marker), undefined, { timeout: 10_000 }).catch(() => undefined);
      else if (name === "try") await page.waitForFunction("!!document.querySelector('h1') && !!document.querySelector('main input, main select, main textarea, main button, main [role=radio]')", undefined, { timeout: 6000 }).catch(() => undefined);
      else await page.waitForFunction("!!document.querySelector('h1')", undefined, { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(300);
    };
    const open = async (ctx: PwContext, p: { name: string; url: string }): Promise<PwPage | null> => {
      const page = await ctx.newPage();
      watch(page, p.name);
      try {
        await page.goto(p.url, { waitUntil: "load", timeout: 20_000 });
      } catch (e) {
        errors.add(`${p.name}: did not load (${(e as Error).message.split("\n")[0]})`);
        await page.close();
        return null;
      }
      await settle(page, p.name);
      return page;
    };

    // ---- desktop, light ----
    const h1: string[] = [];
    const unnamed: string[] = [];
    const lightLow: string[] = [];
    const slider: string[] = [];
    let sliderOk = "";
    const connect: string[] = [];
    let connectOk = "";
    let reportDrawn = false;
    const langs: string[] = [];
    const langsOk: string[] = [];
    const german: string[] = [];
    let germanOk = "";
    const steps: string[] = [];
    let stepsOk = "";
    let landingSteps: { count: number; heading: string; last: string } | null = null;
    let reportSteps = 0;
    const print: string[] = [];
    let printOk = "";
    const tryFirst: string[] = [];
    let tryFirstOk = "";
    let methodSteps = 0;
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    for (const p of pages) {
      const page = await open(desktop, p);
      if (!page) {
        h1.push(`${p.name}: did not load`);
        continue;
      }
      const n = await page.evaluate<number>(H1_COUNT);
      if (n !== 1) h1.push(`${p.name}: ${n} h1`);
      const bad = await page.evaluate<string[]>(UNNAMED);
      if (bad.length) unnamed.push(`${p.name}: ${bad.slice(0, 4).join(", ")}${bad.length > 4 ? ` (+${bad.length - 4})` : ""}`);
      const c = await page.evaluate<Contrast>(CONTRAST);
      if (p.name === "landing") methodSteps = c.steps;
      if (c.lowCount) lightLow.push(`${p.name} (light): ${c.lowCount} low, e.g. ${c.low.slice(0, 2).join(", ")}`);
      text(p.name, await page.evaluate<string>(BODY_TEXT));
      await page.screenshot({ path: shot(`${p.name}-desktop`), fullPage: true });

      const switcher = await page.evaluate<Record<string, string>>(LANG_CONTROLS);
      const absent = ["de", "en", "es", "pl"].filter((l) => !switcher[l]);
      if (absent.length) langs.push(`${p.name}: no ${absent.map((l) => l.toUpperCase()).join(", ")} control`);
      else langsOk.push(p.name);

      if (p.name === "landing") {
        const links = await page.evaluate<string[]>(LINKS);
        if (!links.some((l) => /connect/i.test(l))) connect.push("the landing page has no link to the connect page");
        if (!links.some((l) => /\/r(\.html)?(#|$|\?)|demo/i.test(l))) connect.push("the landing page has no link to the demo report");
        landingSteps = await page.evaluate<{ count: number; heading: string; last: string }>(LANDING_STEPS);
      }

      if (p.name === "connect") {
        const body = await page.evaluate<string>(BODY_TEXT);
        const mcp = /https?:\/\/[^\s"'<>]+\/api\/mcp\b/.exec(body)?.[0];
        if (!mcp) connect.push("the connect page does not show the MCP URL ending in /api/mcp");
        const links = await page.evaluate<string[]>(LINKS);
        const zip = links.find((l) => /what-if-skill\.zip/.test(l));
        if (!zip) connect.push("the connect page has no link to what-if-skill.zip");
        else {
          const local = zip.replace(/^https?:\/\/[^/]+/, o.base);
          const res = await fetch(local, { signal: AbortSignal.timeout(8000) }).catch(() => null);
          const bytes = res && res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
          if (!bytes || bytes[0] !== 0x50 || bytes[1] !== 0x4b) connect.push(`the skill download (${local.replace(o.base, "")}) is not a zip (HTTP ${res?.status ?? "no answer"})`);
        }
        connectOk = `MCP URL ${mcp ?? "?"} and skill zip shown`;
      }

      if (p.name === "try") {
        const s = await page.evaluate<Screen>(SCREEN);
        if (!s.fields && !s.buttons) tryFirst.push("/try shows no field or choice");
        if (!s.heads.length) tryFirst.push("/try shows no question text (h1/h2/label/legend)");
        if (s.code) tryFirst.push("/try asks for an invite code although no codes are configured (the beta is off on this server)");
        tryFirstOk = `first screen: "${s.heads.slice(0, 2).join(" / ").slice(0, 120)}" with ${s.fields} field(s)`;
      }

      if (p.name === "report") {
        reportDrawn = (await page.evaluate<boolean>(READY(o.marker)).catch(() => false)) === true;
        reportSteps = await page.evaluate<number>(REPORT_STEPS).catch(() => 0);
        // German report
        const lang = await page.evaluate<{ html: string; report: string }>(HTML_LANG);
        const body = await page.evaluate<string>(BODY_TEXT);
        const hits = englishHits(body);
        const de = GERMAN_WORDS.filter((re) => re.test(body)).length;
        if (mainLang === "de") {
          if (!/^de\b/i.test(lang.html) && !/^de\b/i.test(lang.report ?? "")) german.push(`html lang is "${lang.html}" on the German report (want de, so screen readers read German)`);
          if (hits.length) german.push(`English UI text: ${hits.slice(0, 6).map((h) => `"${h}"`).join(", ")}${hits.length > 6 ? ` (+${hits.length - 6})` : ""}`);
          if (de < 3) german.push(`hardly any German words (${de} of ${GERMAN_WORDS.length} markers)`);
          germanOk = `html lang ${lang.html || lang.report}; ${de} German markers; no English UI phrases`;
        }
        // slider
        const s0 = await page.evaluate<{ value: string; min: string; max: string; step: string } | null>(SLIDER_STATE);
        if (!s0) slider.push("the report has no range slider");
        else {
          const before = await page.evaluate<string | null>(WHY_TEXT(why));
          const up = Number(s0.value) < Number(s0.max || 100);
          await page.locator('input[type="range"]').first().focus();
          for (let i = 0; i < 3; i++) await page.keyboard.press(up ? "ArrowRight" : "ArrowLeft");
          await page.waitForTimeout(400);
          let how = "arrow keys";
          let s1 = await page.evaluate<{ value: string } | null>(SLIDER_STATE);
          if (s1?.value === s0.value) {
            await page.evaluate(setSlider(up ? 3 : -3));
            await page.waitForTimeout(400);
            s1 = await page.evaluate<{ value: string } | null>(SLIDER_STATE);
            how = "a script (the arrow keys did not move it)";
          }
          const why1 = await page.evaluate<string | null>(WHY_TEXT(why));
          await page.screenshot({ path: shot("report-slider-moved"), fullPage: true });
          if (how.startsWith("arrow")) for (let i = 0; i < 6; i++) await page.keyboard.press(up ? "ArrowLeft" : "ArrowRight");
          else await page.evaluate(setSlider(up ? -6 : 6));
          await page.waitForTimeout(400);
          const why2 = await page.evaluate<string | null>(WHY_TEXT(why));
          if (s1?.value === s0.value) slider.push("the slider did not move");
          else if (!why1) slider.push(`no visible "${why.join("\" / \"")}" text after moving the slider from ${s0.value} to ${s1?.value}`);
          else if (why1 === before) slider.push(`"Why this changed" stayed the same when the slider moved from ${s0.value} to ${s1?.value}`);
          else if (why2 === why1) slider.push("\"Why this changed\" did not change on the second move");
          sliderOk = `moved with ${how}: ${s0.value} -> ${s1?.value}; text now "${(why1 ?? "").replace(/\s+/g, " ").slice(0, 120)}"`;
        }
        // print the test card
        try {
          await page.evaluate(PRINT_STUB);
          let trigger = "";
          for (const sel of ["[data-wi-print]", "[data-print-card]"]) {
            const loc = page.locator(sel).first();
            if ((await loc.count()) && (await loc.isVisible().catch(() => false))) {
              await loc.click({ timeout: 4000 }).catch(() => undefined);
              trigger = sel;
              break;
            }
          }
          let held = await page.evaluate<string | false>(PRINT_HOLD);
          if (!held) {
            await page.evaluate("document.documentElement.classList.add('wi-print-card')");
            held = "wi-print-card";
            trigger = trigger ? `${trigger} (it did not call print(); the wi-print-card class was set by hand)` : "no print button; the wi-print-card class was set by hand";
          }
          const pdf = await page.pdf({ format: "A4", printBackground: true });
          const n = pdfPages(pdf);
          await page.evaluate(PRINT_RELEASE);
          if (!trigger.startsWith("[")) print.push(`no visible "print test card" button ([data-wi-print] or [data-print-card])`);
          if (n > 2) print.push(`printing the test card gives ${n} A4 pages (want at most 2)`);
          if (n === 0) print.push("the PDF has no pages");
          printOk = `${n} A4 page(s) via ${trigger}`;
        } catch (e) {
          print.push(`printing failed: ${(e as Error).message.split("\n")[0]}`);
        }
        // the switcher re-renders in English
        if (switcher.en) {
          const loc = page.locator('[data-qa-lang="en"]').first();
          try {
            if (switcher.en === "option") await page.evaluate("(() => { const o = document.querySelector('option[data-qa-lang=en]'); const s = o.closest('select'); s.value = o.value; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
            else await loc.click({ timeout: 4000 });
            await page.waitForFunction(REPORT_DRAWN, undefined, { timeout: 8000 }).catch(() => undefined);
            await page.waitForTimeout(600);
            const after = await page.evaluate<string>(BODY_TEXT);
            const en = englishHits(after).length;
            const l2 = await page.evaluate<{ html: string; report: string }>(HTML_LANG);
            if (en < 3) langs.push(`report: after choosing EN only ${en} English UI phrases appear (the report should re-render in English)`);
            else if (!/^en\b/i.test(l2.html) && !/^en\b/i.test(l2.report ?? "")) langs.push(`report: after choosing EN, html lang is "${l2.html}"`);
            text("report-switched-en", after);
          } catch (e) {
            langs.push(`report: choosing EN failed (${(e as Error).message.split("\n")[0]})`);
          }
        }
      }
      await page.close();
    }
    await desktop.close();

    // landing steps against the report's steps
    if (!landingSteps) steps.push("the landing page did not load");
    else {
      const want = reportSteps || 6;
      const said = NUMBER_WORDS.find(([re]) => re.test(landingSteps!.heading))?.[1];
      const afterTest = /after|nach dem test|danach|después|despues|po teście|po tescie|learn|lernen|aprend|nauka/i.test(landingSteps.last);
      if (!landingSteps.count) steps.push("no method steps found on the landing page (mark them [data-mstep] or .s-mstep)");
      else if (landingSteps.count !== want && !(landingSteps.count === want + 1 && afterTest)) steps.push(`the landing lists ${landingSteps.count} steps, the report has ${want}`);
      if (said !== undefined && said !== want) steps.push(`the landing heading says ${said} steps ("${landingSteps.heading.slice(0, 80)}"), the report has ${want}`);
      if (reportSteps && reportSteps !== 6) steps.push(`the report shows ${reportSteps} steps (want 6)`);
      stepsOk = `landing: ${landingSteps.count} items, heading "${landingSteps.heading.slice(0, 70)}"; report: ${reportSteps || "?"} steps`;
    }

    // ---- phone width (and the report's height) ----
    const wide: string[] = [];
    const height: string[] = [];
    let heightOk = "";
    const phone = await browser.newContext({ viewport: PHONE, colorScheme: "light" });
    for (const p of pages) {
      const page = await open(phone, p);
      if (!page) {
        wide.push(`${p.name}: did not load`);
        continue;
      }
      const over = await page.evaluate<number>(OVERFLOW);
      if (over > 1) wide.push(`${p.name} +${over}px`);
      await page.screenshot({ path: shot(`${p.name}-phone`), fullPage: true });
      if (p.name === "report") {
        const h0 = await page.evaluate<number>(HEIGHT);
        const closed = await page.evaluate<number>(COLLAPSE);
        await page.waitForTimeout(250);
        const h1x = await page.evaluate<number>(HEIGHT);
        const limit = MAX_PHONE_SCREENS * PHONE.height;
        const screens = (h: number) => (h / PHONE.height).toFixed(1);
        if (h1x >= limit) height.push(`the ${mainLang} report is ${h1x} px tall at 390 px with its sections collapsed = ${screens(h1x)} screens (limit ${MAX_PHONE_SCREENS} = ${limit} px; as opened: ${h0} px)`);
        heightOk = `${h1x} px = ${screens(h1x)} screens with sections collapsed (${closed} were open; as opened ${h0} px = ${screens(h0)} screens; limit ${MAX_PHONE_SCREENS})`;
        if (closed) await page.screenshot({ path: shot("report-phone-collapsed"), fullPage: true });
      }
      await page.close();
    }
    // the shipped demo in the other languages, for the judges
    const otherLangs: string[] = [];
    if (reportPath)
      for (const [l, tok] of Object.entries(o.tokens ?? {})) {
        if (!tok || l === mainLang) continue;
        const name = `report-${l}`;
        const page = await open(phone, { name, url: `${o.base}${reportPath}#${tok}` });
        if (!page) continue;
        const body = await page.evaluate<string>(BODY_TEXT);
        text(name, body);
        await page.screenshot({ path: shot(`${name}-phone`), fullPage: true });
        const h = await page.evaluate<number>(HEIGHT);
        const leaks = l === "en" ? [] : englishHits(body);
        otherLangs.push(`${l}: ${h} px${leaks.length ? `, ${leaks.length} English phrases` : ""}`);
        await page.close();
      }
    await phone.close();

    // ---- dark mode ----
    const dark: string[] = [];
    const darkInfo: string[] = [];
    const darkCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
    for (const p of pages) {
      const page = await open(darkCtx, p);
      if (!page) {
        dark.push(`${p.name}: did not load`);
        continue;
      }
      const c = await page.evaluate<Contrast>(CONTRAST);
      if (c.pageLum > 0.2) dark.push(`${p.name}: no dark background in dark mode (page background rgb(${c.pageBg}))`);
      if (c.lowCount) dark.push(`${p.name} (dark): ${c.lowCount} low-contrast text blocks, e.g. ${c.low.slice(0, 2).join(", ")}`);
      darkInfo.push(`${p.name} worst ${c.worst?.r ?? "-"} over ${c.count} blocks`);
      await page.screenshot({ path: shot(`${p.name}-dark`), fullPage: true });
      await page.close();
    }
    await darkCtx.close();

    // ---- first draw of the report from its link, in a fresh browser profile ----
    const fast: string[] = [];
    let fastOk = "";
    const report = pages.find((p) => p.name === "report");
    if (!report) fast.push("no report page");
    else {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watch(page, "report");
      const t0 = Date.now();
      await page.goto(report.url, { waitUntil: "commit", timeout: 20_000 }).catch(() => undefined);
      const drawn = await page.waitForFunction(READY(o.marker), undefined, { timeout: 10_000 }).then(
        () => true,
        () => false
      );
      const ms = Date.now() - t0;
      if (!drawn) fast.push(`the report did not draw "${o.marker}" from its link within 10 s`);
      else if (ms > 2000) fast.push(`the report took ${ms} ms to draw (limit 2000 ms)`);
      fastOk = `drawn in ${ms} ms`;
      await ctx.close();
    }

    // ---- /try with the keyboard alone (open server) ----
    const tryKeys: string[] = [];
    let tryKeysOk = "";
    if (!tryPath) tryKeys.push("no /try page");
    else {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watch(page, "try");
      try {
        await page.goto(o.base + tryPath, { waitUntil: "load", timeout: 20_000 });
        await settle(page, "try");
        const run = await driveWizard(page, { isDone: (u) => /\/r(\.html)?#./.test(u) });
        text("try-walkthrough", run.screens.map((s, i) => `${i + 1}. ${s}`).join("\n"));
        if (!run.ok) tryKeys.push(run.detail);
        else {
          const drawn = await page.waitForFunction(REPORT_DRAWN, undefined, { timeout: 10_000 }).then(
            () => true,
            () => false
          );
          await page.screenshot({ path: shot("try-done-report"), fullPage: false });
          if (!drawn) tryKeys.push(`the wizard ended on ${page.url().replace(o.base, "").slice(0, 40)}… but no report was drawn`);
          tryKeysOk = `${run.screens.length} screens with the keyboard, then a drawn report (${page.url().replace(o.base, "").slice(0, 24)}…)`;
        }
      } catch (e) {
        tryKeys.push(`the keyboard run stopped: ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }

    // ---- the closed beta: /try and /connect on a server with WHATIF_BETA_CODES ----
    const invite: string[] = [];
    let inviteOk = "";
    if (!o.betaBase || !o.betaCode) invite.push(o.betaError ?? "no beta server (run through qa/run.ts, which starts one with WHATIF_BETA_CODES set)");
    else if (!tryPath) invite.push("no /try page");
    else {
      const ctx = await browser.newContext({ viewport: PHONE });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.add(`try (beta): ${e.message.split("\n")[0]}`));
      try {
        await page.goto(o.betaBase + tryPath, { waitUntil: "load", timeout: 20_000 });
        await page.waitForFunction("!!document.querySelector('main input, input')", undefined, { timeout: 6000 }).catch(() => undefined);
        await page.waitForTimeout(300);
        const s0 = await page.evaluate<Screen>(SCREEN);
        await page.screenshot({ path: shot("try-beta-code"), fullPage: true });
        if (!s0.code) invite.push(`the beta /try does not ask for an invite code first (first screen: "${s0.heads.slice(0, 2).join(" / ").slice(0, 80)}"; mark the field with name/id/autocomplete/label "code")`);
        else {
          const codeGone = (ms: number) =>
            page.waitForFunction("!document.querySelector('[data-qa-code]') || document.querySelector('[data-qa-code]').getClientRects().length === 0", undefined, { timeout: ms }).then(
              () => true,
              () => false
            );
          // A wrong code: typed, then Enter (the keyboard way to submit).
          const field = page.locator("[data-qa-code]").first();
          await field.fill("wrong-code-0");
          await field.focus();
          await page.keyboard.press("Enter");
          await page.waitForTimeout(1500);
          const s1 = await page.evaluate<Screen>(SCREEN);
          const said = s1.alerts.filter((a) => !s0.alerts.includes(a));
          if (!s1.code) invite.push("a wrong code was accepted (the code field went away)");
          else if (!said.length) invite.push("a wrong code shows no new message (use role=alert, role=status or aria-live)");
          // The right code: typed, Enter, then on to the first question with the keyboard (Enter on the focused or next button).
          const f2 = page.locator("[data-qa-code]").first();
          await f2.fill(o.betaCode);
          await f2.focus();
          await page.keyboard.press("Enter");
          let accepted = await codeGone(2500);
          for (let k = 0; k < 8 && !accepted; k++) {
            const f = await page.evaluate<Focused>(FOCUSED);
            if (f.kind === "button" && !f.inChrome && !BACK.test(`${f.text} ${f.label}`) && (NEXT.test(`${f.text} ${f.label}`) || f.submit)) {
              await page.keyboard.press("Enter");
              accepted = await codeGone(1500);
              if (accepted) break;
            }
            await page.keyboard.press("Tab");
          }
          const after = await page.evaluate<Screen>(SCREEN);
          if (!accepted) invite.push(`the right invite code did not lead on to the first question with the keyboard (still on "${after.heads.slice(0, 2).join(" / ").slice(0, 80)}"${after.alerts[0] ? `, message "${after.alerts[0].slice(0, 80)}"` : ""})`);
          else {
            const s2 = after;
            await page.screenshot({ path: shot("try-beta-first-question"), fullPage: true });
            await page.reload({ waitUntil: "load", timeout: 20_000 });
            await page.waitForTimeout(1200);
            const s3 = await page.evaluate<Screen>(SCREEN);
            if (s3.code) {
              const kept = await page.locator("[data-qa-code]").first().inputValue({ timeout: 2000 }).catch(() => "");
              if (kept !== o.betaCode) invite.push("after a reload /try asks for the code again with an empty field (remember it in localStorage)");
            }
            let personal = "";
            const connectPath2 = connectPath ?? "/connect";
            await page.goto(o.betaBase + connectPath2, { waitUntil: "load", timeout: 20_000 });
            await page.waitForTimeout(800);
            const body = await page.evaluate<string>(BODY_TEXT);
            text("connect-beta", body);
            await page.screenshot({ path: shot("connect-beta-phone"), fullPage: true });
            personal = new RegExp(`https?://[^\\s"'<>]+/api/mcp\\?code=${o.betaCode.replace(/[-]/g, "\\-")}`).exec(body)?.[0] ?? "";
            if (!personal) invite.push(`/connect (code remembered from /try) does not show the personal …/api/mcp?code=${o.betaCode} URL`);
            inviteOk = `code asked first; wrong code refused${said[0] ? ` ("${said[0].slice(0, 60)}")` : ""}; right code opens "${s2.heads[0]?.slice(0, 60) ?? "?"}"; remembered; connect shows ${personal}`;
          }
        }
      } catch (e) {
        invite.push(`the beta run stopped: ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }

    const pre = missingNote ? [missingNote] : [];
    if (methodSteps === 0 && landingSteps && (landingSteps as { count: number }).count) lightLow.push("the landing's method steps were not measured");
    set("ui-phone-width", [...pre, ...wide], `no sideways scroll at 390 px on ${pages.map((p) => p.name).join(", ")}`);
    set("ui-slider-explains", [...(reportPath ? [] : pre), ...slider], sliderOk || "ok");
    set("ui-dark-mode", [...pre, ...dark, ...lightLow], `dark backgrounds; ${darkInfo.join("; ")}; ${methodSteps} method-step texts measured with opacity`);
    set("ui-one-h1", [...pre, ...h1], "one h1 on every page");
    set("ui-names", [...pre, ...unnamed], "every control has a name");
    set("ui-fast-report", [...(reportDrawn || !report ? [] : [`the report never showed "${o.marker}" (does it decode the #token?)`]), ...fast], fastOk || "ok");
    set("ui-no-errors", [...pre, ...[...errors].slice(0, 6), ...(errors.size > 6 ? [`(+${errors.size - 6} more)`] : [])], "no script errors or failed loads");
    set("ui-connect", [...(connectPath ? [] : ["no connect page (/connect or /connect.html)"]), ...connect], connectOk || "ok");
    set("ui-lang-switcher", [...pre, ...(tryPath ? [] : ["no /try page to check"]), ...langs], `DE · EN · ES · PL on ${langsOk.join(", ")}; EN re-renders the report`);
    set("ui-german-report", [...(reportPath ? [] : pre), ...(mainLang === "de" ? german : [`the main report is in ${mainLang}, not de`])], germanOk || "ok");
    set("ui-report-height", [...(reportPath ? [] : pre), ...height], `${heightOk}${otherLangs.length ? `; other languages as opened: ${otherLangs.join(", ")}` : ""}`);
    set("ui-landing-steps", steps, stepsOk);
    set("ui-print-card", [...(reportPath ? [] : pre), ...print], printOk || "ok");
    set("ui-try", tryPath ? tryFirst : ["no /try page (site/try.html)"], tryFirstOk || "ok");
    set("ui-try-keyboard", tryKeys, tryKeysOk || "ok");
    set("ui-try-invite", invite, inviteOk || "ok");
  } catch (e) {
    for (const c of UI_CHECKS) if (!results.has(c.id)) results.set(c.id, { ok: false, detail: `the UI run stopped: ${(e as Error).message.split("\n")[0]}` });
  } finally {
    await browser.close().catch(() => undefined);
  }
  return UI_CHECKS.map((c) => ({ id: c.id, ...(results.get(c.id) ?? { ok: false, detail: "did not run" }) }));
}

// node --import tsx qa/ui-check.ts [--url <origin>]
// No top-level await here: checks.ts imports this module, and a pending top-level
// await in the entry module would deadlock that import cycle.
async function cli(): Promise<number> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const at = process.argv.indexOf("--url");
  const checks = await import("./checks.ts");
  try {
    const base = at === -1 ? (await checks.devServer(root)).base : (process.argv[at + 1] ?? "http://localhost:3000").replace(/\/+$/, "");
    let betaBase: string | undefined;
    let betaError: string | undefined;
    if (at === -1) {
      try {
        betaBase = (await checks.betaServer(root)).base;
      } catch (e) {
        betaError = `the beta dev server did not start: ${(e as Error).message.split("\n")[0]}`;
      }
    } else betaError = "--url given: no beta server is started (run without --url for ui-try-invite)";
    const demo = await checks.demoReport(root);
    const out = await runUiCheck({ root, base, token: demo.token, tokens: demo.tokens, lang: "de", marker: demo.marker, betaBase, betaCode: checks.BETA_CODE, betaError, shots: join(root, "qa/reports/ui"), log: console.log });
    const passed = out.filter((r) => r.ok).length;
    console.log(`\nUI check: ${passed}/${out.length} pass (screenshots in qa/reports/ui/)`);
    return passed === out.length ? 0 : 1;
  } catch (e) {
    console.error(`UI check could not run: ${(e as Error).message}`);
    return 1;
  } finally {
    checks.cleanup();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void cli().then((code) => process.exit(code));
}
