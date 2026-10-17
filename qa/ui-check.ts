/**
 * UI check: opens the What-IF site in Chromium (Playwright), the way an owner
 * or a judge would, and checks what the report must do to teach: no sideways
 * scrolling on a phone, a break-even slider that re-explains itself, dark
 * mode with readable text, one heading per page, named controls, a report
 * that draws within 2 s, no script errors, and a connect page that works.
 *
 *   node --import tsx qa/ui-check.ts                         starts scripts/dev.mjs on a free port
 *   node --import tsx qa/ui-check.ts --url http://localhost:3000   uses a server that is already running
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

export const UI_CHECKS: { id: string; title: string }[] = [
  { id: "ui-phone-width", title: "no sideways scrolling at 390 px (landing, connect, demo report)" },
  { id: "ui-slider-explains", title: "moving the break-even slider rewrites the \"Why this changed\" text, twice" },
  { id: "ui-dark-mode", title: "dark mode renders (prefers-color-scheme: dark) and body text is readable (contrast >= 4.5, dark and light)" },
  { id: "ui-one-h1", title: "exactly one h1 per page" },
  { id: "ui-names", title: "every button, link and input has an accessible name" },
  { id: "ui-fast-report", title: "the demo report draws from its link within 2 s" },
  { id: "ui-no-errors", title: "no JavaScript errors or failed loads on any page" },
  { id: "ui-connect", title: "the landing page links to Connect; Connect shows the MCP URL (.../api/mcp) and a skill download that works" },
];

export interface UiOptions {
  root: string;
  /** Origin of the running site, e.g. http://127.0.0.1:3000 */
  base: string;
  /** encodeState() token of the demo report (with its rehearsal). */
  token: string;
  /** Text the drawn report must contain (from the token), e.g. the demo café's name. */
  marker: string;
  /** Where screenshots and page text go. */
  shots: string;
  log?: (line: string) => void;
}

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
}
interface PwPage {
  goto(url: string, o?: { waitUntil?: "load" | "domcontentloaded" | "commit" | "networkidle"; timeout?: number }): Promise<unknown>;
  evaluate<T = unknown>(script: string): Promise<T>;
  waitForFunction(script: string, arg?: unknown, o?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
  locator(selector: string): PwLocator;
  keyboard: { press(key: string): Promise<void> };
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
  "Playwright is not installed. Add it with `npm i -D playwright@1.56.1`; its Chromium (build 1194) is usually already cached in %LOCALAPPDATA%\\ms-playwright. Elsewhere run `npx playwright install chromium`.";

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

/** Contrast of visible body text against its real background (layers composited, any CSS colour via canvas). */
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
  const bgOf = (el) => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; } let b = canvasBg; for (let i = layers.length - 1; i >= 0; i--) b = over(layers[i], b); return b; };
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const els = Array.from(document.querySelectorAll('p, li, td, dd, figcaption, blockquote'))
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && ownText(el).length >= 3)
    .slice(0, 120);
  let worst = null; const low = [];
  for (const el of els) {
    const bg = bgOf(el);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const r = Math.round(ratio(fg, bg) * 100) / 100;
    const text = ownText(el).slice(0, 40);
    if (!worst || r < worst.r) worst = { r, text };
    if (r < 4.5) low.push(r + ' "' + text + '"');
  }
  const page = bgOf(document.body || document.documentElement);
  return { count: els.length, worst, low: low.slice(0, 4), lowCount: low.length, pageLum: Math.round(lum(page) * 1000) / 1000, pageBg: page.slice(0, 3).map(Math.round).join(',') };
})()`;

const SLIDER_STATE = `(() => { const s = document.querySelector('input[type="range"]'); return s ? { value: s.value, min: s.min, max: s.max, step: s.step } : null; })()`;

/** The text block around the words "Why this changed" (the explanation that follows the slider). */
const WHY_TEXT = `(() => {
  const re = /why this changed/i;
  const skip = ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'];
  const all = Array.from(document.body.querySelectorAll('*')).filter((e) => !skip.includes(e.tagName) && !e.closest('script, style, template'));
  const hits = all.filter((e) => re.test(e.textContent || '') && !Array.from(e.children).some((c) => re.test(c.textContent || '')));
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

interface Contrast {
  count: number;
  worst: { r: number; text: string } | null;
  low: string[];
  lowCount: number;
  pageLum: number;
  pageBg: string;
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

export async function runUiCheck(o: UiOptions): Promise<UiResult[]> {
  const log = o.log ?? (() => undefined);
  const results = new Map<string, { ok: boolean; detail: string }>();
  const set = (id: string, problems: string[], okDetail: string) => {
    results.set(id, problems.length ? { ok: false, detail: problems.join("; ") } : { ok: true, detail: okDetail });
    log(`${problems.length ? "FAIL" : "ok  "} ${id}: ${results.get(id)!.detail}`);
  };
  const all = (detail: string): UiResult[] => UI_CHECKS.map((c) => ({ id: c.id, ok: false, detail }));

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

  try {
    const connectPath = await firstOk(o.base, ["/connect", "/connect.html"]);
    const reportPath = await firstOk(o.base, ["/r", "/r.html"]);
    const pages: { name: string; url: string }[] = [{ name: "landing", url: `${o.base}/` }];
    if (connectPath) pages.push({ name: "connect", url: o.base + connectPath });
    if (reportPath) pages.push({ name: "report", url: `${o.base}${reportPath}#${o.token}` });
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
      if (name === "report") await page.waitForFunction(READY(o.marker), undefined, { timeout: 10_000 }).catch(() => undefined);
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
      if (c.lowCount) lightLow.push(`${p.name} (light): ${c.lowCount} low, e.g. ${c.low.slice(0, 2).join(", ")}`);
      writeFileSync(join(o.shots, `${p.name}.txt`), await page.evaluate<string>("document.body ? document.body.innerText : ''"));
      await page.screenshot({ path: shot(`${p.name}-desktop`), fullPage: true });

      if (p.name === "landing") {
        const links = await page.evaluate<string[]>(LINKS);
        if (!links.some((l) => /connect/i.test(l))) connect.push("the landing page has no link to the connect page");
        if (!links.some((l) => /\/r(\.html)?(#|$|\?)|demo/i.test(l))) connect.push("the landing page has no link to the demo report");
      }

      if (p.name === "connect") {
        const text = await page.evaluate<string>("document.body.innerText");
        const mcp = /https?:\/\/[^\s"'<>]+\/api\/mcp\b/.exec(text)?.[0];
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

      if (p.name === "report") {
        reportDrawn = (await page.evaluate<boolean>(READY(o.marker)).catch(() => false)) === true;
        const s0 = await page.evaluate<{ value: string; min: string; max: string; step: string } | null>(SLIDER_STATE);
        if (!s0) slider.push("the report has no range slider");
        else {
          const before = await page.evaluate<string | null>(WHY_TEXT);
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
          const why1 = await page.evaluate<string | null>(WHY_TEXT);
          await page.screenshot({ path: shot("report-slider-moved"), fullPage: true });
          if (how.startsWith("arrow")) for (let i = 0; i < 6; i++) await page.keyboard.press(up ? "ArrowLeft" : "ArrowRight");
          else await page.evaluate(setSlider(up ? -6 : 6));
          await page.waitForTimeout(400);
          const why2 = await page.evaluate<string | null>(WHY_TEXT);
          if (s1?.value === s0.value) slider.push("the slider did not move");
          else if (!why1) slider.push(`no visible "Why this changed" text after moving the slider from ${s0.value} to ${s1?.value}`);
          else if (why1 === before) slider.push(`"Why this changed" stayed the same when the slider moved from ${s0.value} to ${s1?.value}`);
          else if (why2 === why1) slider.push("\"Why this changed\" did not change on the second move");
          sliderOk = `moved with ${how}: ${s0.value} -> ${s1?.value}; text now "${(why1 ?? "").replace(/\s+/g, " ").slice(0, 120)}"`;
        }
      }
      await page.close();
    }
    await desktop.close();

    // ---- phone width ----
    const wide: string[] = [];
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
    for (const p of pages) {
      const page = await open(phone, p);
      if (!page) {
        wide.push(`${p.name}: did not load`);
        continue;
      }
      const over = await page.evaluate<number>(OVERFLOW);
      if (over > 1) wide.push(`${p.name} +${over}px`);
      await page.screenshot({ path: shot(`${p.name}-phone`), fullPage: true });
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

    const pre = missingNote ? [missingNote] : [];
    set("ui-phone-width", [...pre, ...wide], `no sideways scroll at 390 px on ${pages.map((p) => p.name).join(", ")}`);
    set("ui-slider-explains", [...(reportPath ? [] : pre), ...slider], sliderOk || "ok");
    set("ui-dark-mode", [...pre, ...dark, ...lightLow], `dark backgrounds; ${darkInfo.join("; ")}`);
    set("ui-one-h1", [...pre, ...h1], "one h1 on every page");
    set("ui-names", [...pre, ...unnamed], "every control has a name");
    set("ui-fast-report", [...(reportDrawn || !report ? [] : [`the report never showed "${o.marker}" (does it decode the #token?)`]), ...fast], fastOk || "ok");
    set("ui-no-errors", [...pre, ...[...errors].slice(0, 6), ...(errors.size > 6 ? [`(+${errors.size - 6} more)`] : [])], "no script errors or failed loads");
    set("ui-connect", [...(connectPath ? [] : ["no connect page (/connect or /connect.html)"]), ...connect], connectOk || "ok");
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
    const demo = await checks.demoReport(root);
    const out = await runUiCheck({ root, base, token: demo.token, marker: demo.marker, shots: join(root, "qa/reports/ui"), log: console.log });
    const passed = out.filter((r) => r.ok).length;
    console.log(`\nUI check: ${passed}/${out.length} pass (screenshots in qa/reports/ui/)`);
    return passed === out.length ? 0 : 1;
  } catch (e) {
    console.error(`UI check could not run: ${(e as Error).message}`);
    return 1;
  } finally {
    checks.stopDev();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void cli().then((code) => process.exit(code));
}
