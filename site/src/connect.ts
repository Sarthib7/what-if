/**
 * /connect — the owner's path first: invite code → personal link (with a copy
 * button) → four steps in Claude, then ChatGPT, and the starter message for apps
 * without skills (cn.starter_text: src/mcp/instructions.ts STARTER_PROMPTS with this
 * site's address, in the page language); developer options
 * (Claude Code, mcp.json, the skill's terminal steps) are folded away.
 * The personal link is this site's /api/mcp with ?code=… (checked, never stored on the server).
 */
import { fillMcpUrl, wireCopyButtons } from "../../src/report/connect.ts";
import { mountCodeForm } from "./lib/code.ts";
import type { CodeForm, CodeInfo } from "./lib/code.ts";
import { connectorUrl, onReady, pageLang, syncLang, t } from "./lib/page.ts";
import type { SiteKey } from "./messages.ts";

/** Baked in by scripts/build.mjs: the site's public address (used when the page is not served over http). */
declare const __WHATIF_SITE_URL__: string | undefined;

function siteAddress(): string {
  if (/^https?:$/.test(location.protocol)) return location.origin;
  try {
    return typeof __WHATIF_SITE_URL__ === "string" ? __WHATIF_SITE_URL__ : "";
  } catch {
    return "";
  }
}

/** The starter message for apps without the skill, in the page language, pointing at this site. */
function paintStarter(): void {
  const text = t("cn.starter_text", { site: siteAddress() }, pageLang());
  document.querySelectorAll<HTMLElement>("[data-starter-prompt]").forEach((el) => (el.textContent = text));
}

let last: CodeInfo | null = null;

function paint(info: CodeInfo | null): void {
  const hint = document.querySelector<HTMLElement>("[data-url-hint]");
  let url = connectorUrl();
  let key: SiteKey = "cn.url_need";
  if (info) {
    if (info.state === "ok") {
      url = connectorUrl(info.code);
      key = "cn.url_ok";
    } else if (info.state === "open") {
      key = "cn.url_open";
    } else if (info.state === "offline" && info.code) {
      url = connectorUrl(info.code);
      key = "cn.url_offline";
    }
  }
  fillMcpUrl(document, url);
  document.documentElement.dataset.connector = info?.state ?? "checking";
  if (hint) {
    hint.textContent = info ? t(key) : "";
    hint.dataset.state = info?.state ?? "checking";
  }
}

function init(): void {
  document.documentElement.classList.add("s-js");
  let form: CodeForm | null = null;
  syncLang(() => {
    form?.relabel();
    paint(last);
    paintStarter();
  });
  wireCopyButtons(document);
  paint(null);
  paintStarter();
  const box = document.querySelector<HTMLElement>("[data-code-form]");
  if (box)
    form = mountCodeForm(box, (info) => {
      last = info;
      paint(info);
    });
}

onReady(init);
