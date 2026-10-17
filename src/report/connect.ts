/**
 * Small client helpers shared by the site pages: fill in the MCP URL for this
 * deployment (location.origin + "/api/mcp") and wire the copy buttons.
 * Browser-only at call time; nothing runs at import.
 */

export function mcpUrl(): string {
  const origin = typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location.origin : "";
  return origin ? `${origin}/api/mcp` : "";
}

/** Replaces any "<something>/api/mcp" URL (or the {{SITE_URL}} placeholder) inside [data-mcp-fill] with this site's URL. */
export function fillMcpUrl(root: ParentNode = document): string {
  const url = mcpUrl();
  if (!url) return "";
  root.querySelectorAll<HTMLElement>("[data-mcp-fill]").forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const t of nodes) {
      const before = t.data;
      const after = before.split("{{SITE_URL}}/api/mcp").join(url).replace(/https?:\/\/[^\s"'<>]+?\/api\/mcp/g, url);
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
  const was = btn.dataset.copyWas ?? label.textContent ?? "Copy";
  btn.dataset.copyWas = was;
  label.textContent = ok ? "Copied" : "Press Ctrl+C to copy";
  btn.classList.toggle("is-copied", ok);
  let live = document.getElementById("s-live");
  if (!live) {
    live = document.createElement("div");
    live.id = "s-live";
    live.setAttribute("aria-live", "polite");
    live.className = "s-sr";
    document.body.appendChild(live);
  }
  live.textContent = ok ? "Copied to the clipboard." : "Could not copy automatically.";
  window.setTimeout(() => {
    label.textContent = was;
    btn.classList.remove("is-copied");
  }, 1800);
}

/** Wires every [data-copy] button: data-copy="#selector" copies that element's text; data-copy-text copies the attribute. */
export function wireCopyButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sel = btn.getAttribute("data-copy") ?? "";
      const text = btn.getAttribute("data-copy-text") ?? (sel ? document.querySelector<HTMLElement>(sel)?.textContent ?? "" : "");
      if (text) void copyWithFeedback(btn, text.trim());
    });
  });
}

export function wireConnect(root: ParentNode = document): void {
  fillMcpUrl(root);
  wireCopyButtons(root);
}
