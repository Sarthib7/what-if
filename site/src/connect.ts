/**
 * /connect — the owner's path first: invite code → personal link (with a copy
 * button) → four steps in Claude, then ChatGPT; developer options are folded away.
 * The personal link is this site's /api/mcp with ?code=… (checked, never stored on the server).
 */
import { fillMcpUrl, wireCopyButtons } from "../../src/report/connect.ts";
import { mountCodeForm } from "./lib/code.ts";
import type { CodeForm, CodeInfo } from "./lib/code.ts";
import { connectorUrl, onReady, syncLang, t } from "./lib/page.ts";
import type { SiteKey } from "./messages.ts";

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
  });
  wireCopyButtons(document);
  paint(null);
  const box = document.querySelector<HTMLElement>("[data-code-form]");
  if (box)
    form = mountCodeForm(box, (info) => {
      last = info;
      paint(info);
    });
}

onReady(init);
