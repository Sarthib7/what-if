/**
 * Small client helpers shared by the site pages: the MCP URL for this
 * deployment (location.origin + "/api/mcp", plus "?code=…" for a closed-beta
 * invite code), filling it into the page, and the copy buttons.
 * Browser-only at call time; nothing runs at import.
 */
import { getLang, makeT } from "../i18n/index.ts";

const T = makeT<"copied" | "failed" | "copied_live" | "failed_live" | "copy">({
  en: { copied: "Copied", failed: "Press Ctrl+C to copy", copied_live: "Copied to the clipboard.", failed_live: "Could not copy automatically.", copy: "Copy" },
  de: { copied: "Kopiert", failed: "Mit Strg+C kopieren", copied_live: "In die Zwischenablage kopiert.", failed_live: "Automatisches Kopieren hat nicht geklappt.", copy: "Kopieren" },
  es: { copied: "Copiado", failed: "Pulsa Ctrl+C para copiar", copied_live: "Copiado al portapapeles.", failed_live: "No se ha podido copiar automáticamente.", copy: "Copiar" },
  pl: { copied: "Skopiowano", failed: "Naciśnij Ctrl+C, aby skopiować", copied_live: "Skopiowano do schowka.", failed_live: "Nie udało się skopiować automatycznie.", copy: "Kopiuj" },
});

/** This site's MCP URL; with an invite code it becomes the owner's personal connector link. */
export function mcpUrl(code?: string): string {
  const origin = typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location.origin : "";
  if (!origin) return "";
  const c = (code ?? "").replace(/\s+/g, "");
  return `${origin}/api/mcp${c ? `?code=${encodeURIComponent(c)}` : ""}`;
}

const ANY_MCP_URL = /(?:\{\{SITE_URL\}\}|https?:\/\/[^\s"'<>]+?)\/api\/mcp(?:\?code=[^\s"'<>]*)?/g;

/** Replaces every "<site>/api/mcp[?code=…]" URL (or the {{SITE_URL}} placeholder) inside [data-mcp-fill] with `url`. */
export function fillMcpUrl(root: ParentNode = document, url: string = mcpUrl()): string {
  if (!url) return "";
  root.querySelectorAll<HTMLElement>("[data-mcp-fill]").forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const t of nodes) {
      const before = t.data;
      const after = before.replace(ANY_MCP_URL, url);
      if (after !== before) t.data = after;
    }
  });
  root.querySelectorAll<HTMLAnchorElement>("a[data-mcp-href]").forEach((a) => (a.href = url));
  return url;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Copies text and shows a short "Copied" confirmation on the button (announced to screen readers). */
export async function copyWithFeedback(btn: HTMLElement, text: string): Promise<void> {
  const ok = await writeClipboard(text);
  const label = btn.querySelector<HTMLElement>("[data-copy-label]") ?? btn;
  const lang = getLang();
  if (!btn.dataset.copyBusy) btn.dataset.copyWas = label.textContent ?? T("copy", {}, lang);
  btn.dataset.copyBusy = "1";
  label.textContent = ok ? T("copied", {}, lang) : T("failed", {}, lang);
  btn.classList.toggle("is-copied", ok);
  let live = document.getElementById("s-live");
  if (!live) {
    live = document.createElement("div");
    live.id = "s-live";
    live.setAttribute("aria-live", "polite");
    live.className = "s-sr";
    document.body.appendChild(live);
  }
  live.textContent = ok ? T("copied_live", {}, lang) : T("failed_live", {}, lang);
  window.setTimeout(() => {
    label.textContent = btn.dataset.copyWas ?? T("copy", {}, lang);
    delete btn.dataset.copyBusy;
    btn.classList.remove("is-copied");
  }, 1800);
}

/** Wires every [data-copy] button: data-copy="#selector" copies that element's text; data-copy-text copies the attribute. */
export function wireCopyButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-copy]").forEach((btn) => {
    if (btn.dataset.copyWired) return;
    btn.dataset.copyWired = "1";
    btn.addEventListener("click", () => {
      const sel = btn.getAttribute("data-copy") ?? "";
      const text = btn.getAttribute("data-copy-text") ?? (sel ? document.querySelector<HTMLElement>(sel)?.textContent ?? "" : "");
      if (text) void copyWithFeedback(btn, text.trim());
    });
  });
}

export function wireConnect(root: ParentNode = document, code?: string): void {
  fillMcpUrl(root, mcpUrl(code));
  wireCopyButtons(root);
}
