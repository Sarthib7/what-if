/** /connect — fills in this site's MCP URL and wires the copy buttons. */
import { wireConnect } from "../../src/report/connect.ts";

function init(): void {
  document.documentElement.classList.add("s-js");
  wireConnect(document);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
