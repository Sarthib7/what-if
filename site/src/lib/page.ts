/**
 * Shared page runtime for every site page: the language (German by default,
 * remembered on this device), the DE · EN · ES · PL switcher, the "Request an
 * invite" link and the invite-code check against GET /api/mcp?code=….
 *
 * Pages are written in English (the complete catalog) and translated in place:
 * /assets/lang.js runs first and applies the stored language; page bundles
 * read the language from <html lang> and listen for "whatif:lang".
 * Browser-only at call time; nothing touches the DOM at import.
 */
import { DEFAULT_LANG, LANGS, LANG_NAMES, isLang, normaliseLang, setLang } from "../../../src/i18n/index.ts";
import type { Lang, Params } from "../../../src/i18n/index.ts";
import { st } from "../messages.ts";
import type { SiteKey } from "../messages.ts";

export type { Lang };

export const LANG_KEY = "whatif.lang";
export const CODE_KEY = "whatif.code";
const LANG_EVENT = "whatif:lang";
const SET_EVENT = "whatif:set-lang";

/* ------------------------------------------------------------------ storage */

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: the page still works, it just forgets */
  }
}

/* ------------------------------------------------------------------ language */

function known(x: string | null | undefined): Lang | null {
  if (!x) return null;
  const n = normaliseLang(x, "" as Lang);
  return isLang(n) ? n : null;
}

/** ?lang=… first (shareable), then the remembered choice, then German. */
export function preferredLang(): Lang {
  let fromUrl: Lang | null = null;
  try {
    fromUrl = known(new URLSearchParams(location.search).get("lang"));
  } catch {
    fromUrl = null;
  }
  return fromUrl ?? known(readStore(LANG_KEY)) ?? DEFAULT_LANG;
}

/** The language the page is shown in right now (set on <html lang> by lang.js). */
export function pageLang(): Lang {
  return known(document.documentElement.getAttribute("lang")) ?? DEFAULT_LANG;
}

/** Translator for site strings in the page language. */
export function t(key: SiteKey, params: Params = {}, lang: Lang = pageLang()): string {
  return st(key, params, lang);
}

function applyAttrs(el: Element, spec: string, lang: Lang): void {
  for (const part of spec.split(";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const attr = part.slice(0, i).trim();
    const key = part.slice(i + 1).trim() as SiteKey;
    const v = st(key, {}, lang);
    if (v !== key) el.setAttribute(attr, v);
  }
}

/**
 * Translates every [data-i18n] (text), [data-i18n-html] (markup from our own catalog only)
 * and [data-i18n-attr="attr:key;attr:key"] element under root. Unknown keys are left as written.
 */
export function translate(root: ParentNode, lang: Lang): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as SiteKey;
    const v = st(key, {}, lang);
    if (v !== key) el.textContent = v;
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml as SiteKey;
    const v = st(key, {}, lang);
    if (v !== key) el.innerHTML = v;
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-attr]").forEach((el) => applyAttrs(el, el.dataset.i18nAttr ?? "", lang));
}

function paintSwitchers(lang: Lang): void {
  document.querySelectorAll<HTMLButtonElement>("[data-lang-switch] button[data-lang]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  });
}

/** Builds the DE · EN · ES · PL switcher into every [data-lang-switch] element. */
export function renderSwitchers(onPick: (lang: Lang) => void): void {
  document.querySelectorAll<HTMLElement>("[data-lang-switch]").forEach((box) => {
    if (box.dataset.ready) return;
    box.dataset.ready = "1";
    box.setAttribute("role", "group");
    box.setAttribute("data-i18n-attr", "aria-label:c.lang_label");
    box.setAttribute("aria-label", st("c.lang_label", {}, pageLang()));
    box.replaceChildren();
    LANGS.forEach((l, i) => {
      if (i) {
        const dot = document.createElement("span");
        dot.className = "s-lang-dot";
        dot.setAttribute("aria-hidden", "true");
        dot.textContent = "·";
        box.appendChild(dot);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "s-lang-btn";
      b.dataset.lang = l;
      b.lang = l;
      b.textContent = l.toUpperCase();
      b.setAttribute("aria-label", LANG_NAMES[l]);
      b.title = LANG_NAMES[l];
      b.addEventListener("click", () => onPick(l));
      box.appendChild(b);
    });
  });
  paintSwitchers(pageLang());
}

/** Applies a language to the whole page (lang.js owns this; bundles call requestLang). */
export function applyLang(lang: Lang, opts: { persist?: boolean } = {}): void {
  setLang(lang);
  const html = document.documentElement;
  html.setAttribute("lang", lang);
  translate(document, lang);
  paintSwitchers(lang);
  wireBetaContact(document, lang);
  if (opts.persist) writeStore(LANG_KEY, lang);
  html.classList.remove("s-i18n-wait");
  document.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang } }));
}

/** Asks lang.js to switch the page language (persist = remember it on this device). */
export function requestLang(lang: Lang, opts: { persist?: boolean } = { persist: true }): void {
  if (document.documentElement.dataset.i18nReady === "1") {
    document.dispatchEvent(new CustomEvent(SET_EVENT, { detail: { lang, persist: opts.persist !== false } }));
  } else {
    applyLang(lang, opts);
  }
}

/** lang.js: listen for requests from page bundles. */
export function listenForRequests(): void {
  document.documentElement.dataset.i18nReady = "1";
  document.addEventListener(SET_EVENT, (e) => {
    const d = (e as CustomEvent<{ lang?: string; persist?: boolean }>).detail ?? {};
    const lang = known(d.lang ?? null);
    if (lang) applyLang(lang, { persist: d.persist !== false });
  });
}

/** Page bundles: keep this bundle's i18n in step with the page, and react to switches. */
export function syncLang(onChange?: (lang: Lang) => void): Lang {
  const lang = pageLang();
  setLang(lang);
  document.addEventListener(LANG_EVENT, (e) => {
    const l = known((e as CustomEvent<{ lang?: string }>).detail?.lang ?? null) ?? pageLang();
    setLang(l);
    onChange?.(l);
  });
  return lang;
}

/* ------------------------------------------------------------------ beta contact */

/** Also baked into the bundles by scripts/build.mjs (WHATIF_BETA_CONTACT); the HTML attribute wins. */
declare const __WHATIF_BETA_CONTACT__: string | undefined;

function builtContact(): string {
  try {
    return typeof __WHATIF_BETA_CONTACT__ === "string" ? __WHATIF_BETA_CONTACT__ : "";
  } catch {
    return "";
  }
}

/** The templated {{BETA_CONTACT}} value, or "" when it is empty or was never filled in. */
export function betaContact(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || /^\{\{\s*[A-Z_]+\s*\}\}$/.test(v) || v.includes("{{")) return "";
  return v;
}

export function contactHref(contact: string, lang: Lang): string {
  if (/^mailto:/i.test(contact)) return contact;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(contact)) {
    const subject = encodeURIComponent(st("c.invite_subject", {}, lang));
    const body = encodeURIComponent(st("c.invite_body", {}, lang));
    return `mailto:${contact}?subject=${subject}&body=${body}`;
  }
  if (/^https:\/\//i.test(contact)) return contact;
  return "";
}

/** Shows every [data-beta-contact] link when a contact was templated in; hides it otherwise. */
export function wireBetaContact(root: ParentNode, lang: Lang): void {
  root.querySelectorAll<HTMLAnchorElement>("a[data-beta-contact]").forEach((a) => {
    const href = contactHref(betaContact(a.getAttribute("data-beta-contact")) || betaContact(builtContact()), lang);
    if (!href) {
      a.hidden = true;
      a.closest<HTMLElement>("[data-beta-contact-wrap]")?.setAttribute("hidden", "");
      return;
    }
    a.href = href;
    if (/^https:/i.test(href)) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.hidden = false;
    a.closest<HTMLElement>("[data-beta-contact-wrap]")?.removeAttribute("hidden");
  });
}

/** The contact templated into this page (first [data-beta-contact] found), or "". */
export function pageContact(): string {
  return betaContact(document.querySelector("[data-beta-contact]")?.getAttribute("data-beta-contact")) || betaContact(builtContact());
}

/* ------------------------------------------------------------------ invite codes */

export interface BetaStatus {
  /** The server answered. */
  reachable: boolean;
  /** The closed beta is on (WHATIF_BETA_CODES is set). */
  required: boolean;
  /** The code given is valid (always false without a code). */
  valid: boolean;
}

export function cleanCode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").slice(0, 80);
}

export function storedCode(): string {
  return cleanCode(readStore(CODE_KEY));
}

/**
 * Asks GET /api/mcp?code=… whether the beta needs a code and whether this one is valid.
 * Nothing is stored on the server; an older server without `beta` counts as "no code needed".
 */
export async function checkBeta(code?: string): Promise<BetaStatus> {
  const c = cleanCode(code);
  const url = `/api/mcp${c ? `?code=${encodeURIComponent(c)}` : ""}`;
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timer = ctrl ? window.setTimeout(() => ctrl.abort(), 8000) : 0;
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: ctrl?.signal });
    window.clearTimeout(timer);
    const body = (await res.json().catch(() => null)) as { beta?: { required?: unknown; valid?: unknown } } | null;
    const beta = body && typeof body === "object" ? body.beta : undefined;
    if (!beta || typeof beta !== "object") return { reachable: res.ok, required: false, valid: res.ok && !!c };
    return { reachable: true, required: beta.required === true, valid: beta.valid === true };
  } catch {
    return { reachable: false, required: false, valid: false };
  }
}

/** This site's connector URL, with the invite code when there is one. */
export function connectorUrl(code?: string): string {
  const origin = /^https?:$/.test(location.protocol) ? location.origin : "";
  const c = cleanCode(code);
  return `${origin}/api/mcp${c ? `?code=${encodeURIComponent(c)}` : ""}`;
}

/* ------------------------------------------------------------------ small DOM helpers */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

/** Announces a short message to screen readers. */
export function announce(text: string): void {
  let live = document.getElementById("s-live");
  if (!live) {
    live = el("div", { id: "s-live", "aria-live": "polite", class: "s-sr" });
    document.body.appendChild(live);
  }
  live.textContent = "";
  window.setTimeout(() => {
    if (live) live.textContent = text;
  }, 30);
}

export function onReady(fn: () => void): void {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}
