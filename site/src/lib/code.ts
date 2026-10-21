/**
 * The invite-code form used on /connect and /try. The code is checked with
 * GET /api/mcp?code=… (the server answers beta: { required, valid } and keeps
 * nothing) and remembered on this device only. It has one button, and it says
 * nothing until the owner has tried a code (no "please enter the code" up front).
 */
import type { SiteKey } from "../messages.ts";
import { CODE_KEY, checkBeta, cleanCode, contactHref, el, pageContact, pageLang, storedCode, t, writeStore } from "./page.ts";
import type { BetaStatus } from "./page.ts";

export type CodeState = "checking" | "ok" | "bad" | "short" | "open" | "offline" | "needed";

export interface CodeInfo extends BetaStatus {
  code: string;
  state: CodeState;
}

export interface CodeForm {
  /** Re-renders the texts in the current page language. */
  relabel(): void;
  info(): CodeInfo;
  focus(): void;
}

export interface CodeFormOptions {
  /** The button's words (default "Check code"). /try uses "Check code and continue". */
  submitLabel?: SiteKey;
  /** A big, full-width primary button (the /try screens). */
  big?: boolean;
  /** Called when a code the owner submitted lets them in: valid, not needed right now, or not checkable offline. */
  onPass?: (info: CodeInfo) => void;
}

let counter = 0;

export function mountCodeForm(box: HTMLElement, onChange: (info: CodeInfo) => void, opts: CodeFormOptions = {}): CodeForm {
  const id = `s-code-${++counter}`;
  let info: CodeInfo = { code: storedCode(), state: "checking", reachable: false, required: false, valid: false };
  /** The owner has submitted the form at least once. */
  let touched = false;

  const label = el("label", { for: id, class: "s-field-label" });
  const input = el("input", {
    id,
    class: "s-input s-input--code",
    type: "text",
    name: "invite-code",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "go",
    "aria-describedby": `${id}-status`,
  });
  const button = el("button", { type: "submit", class: opts.big ? "s-btn s-btn--big s-code-go" : "s-btn" });
  const status = el("p", { id: `${id}-status`, class: "s-code-status", role: "status", "aria-live": "polite" });
  const help = el("p", { class: "s-code-help" });
  const form = el("form", { class: "s-code-form", novalidate: true }, label, el("div", { class: "s-code-row" }, input, button), status, help);
  box.replaceChildren(form);
  input.value = info.code;

  const paint = () => {
    const lang = pageLang();
    label.textContent = t("c.code_label", {}, lang);
    input.placeholder = t("c.code_placeholder", {}, lang);
    button.textContent = info.state === "checking" ? t("c.code_checking", {}, lang) : t(opts.submitLabel ?? "c.code_check", {}, lang);
    button.disabled = info.state === "checking";
    const msg: Record<CodeState, string> = {
      // The first, automatic check of a remembered code is silent; the button already says "Checking…".
      checking: touched ? t("c.code_checking", {}, lang) : "",
      ok: t("c.code_ok", {}, lang),
      bad: t("c.code_bad", {}, lang),
      short: t("c.code_short", {}, lang),
      open: t("c.code_open", {}, lang),
      offline: t("c.code_offline", {}, lang),
      // Before the owner has typed anything there is nothing to correct: no message.
      needed: "",
    };
    status.textContent = msg[info.state];
    status.dataset.state = info.state;
    input.setAttribute("aria-invalid", String(info.state === "bad" || info.state === "short"));
    help.replaceChildren();
    const href = contactHref(pageContact(), lang);
    if (href && info.state !== "ok" && info.state !== "open") {
      const a = el("a", { href, text: t("c.invite", {}, lang) });
      if (/^https:/i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener";
      }
      help.append(t("c.code_help", {}, lang), " ", a);
    } else if (info.state !== "ok" && info.state !== "open") {
      help.textContent = t("c.code_help_nocontact", {}, lang);
    }
    help.hidden = !help.textContent;
  };

  const set = (next: Partial<CodeInfo>) => {
    info = { ...info, ...next };
    paint();
    if (info.state !== "checking") onChange(info);
  };

  const run = async (code: string, fromUser: boolean) => {
    set({ code, state: "checking" });
    const s = await checkBeta(code || undefined);
    if (!s.reachable) {
      set({ ...s, state: "offline" });
      if (fromUser) opts.onPass?.(info);
      return;
    }
    if (!s.required) {
      set({ ...s, state: "open" });
      if (fromUser) opts.onPass?.(info);
      return;
    }
    if (!code) {
      set({ ...s, state: "needed" });
      return;
    }
    if (s.valid) {
      writeStore(CODE_KEY, code);
      set({ ...s, state: "ok" });
      if (fromUser) opts.onPass?.(info);
      return;
    }
    if (storedCode() === code) writeStore(CODE_KEY, null);
    set({ ...s, state: "bad" });
    if (fromUser) input.focus();
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    touched = true;
    const code = cleanCode(input.value);
    input.value = code;
    if (code.length < 6) {
      set({ code, state: "short" });
      input.focus();
      return;
    }
    void run(code, true);
  });

  paint();
  void run(info.code, false);

  return {
    relabel: paint,
    info: () => info,
    focus: () => input.focus(),
  };
}
