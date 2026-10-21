import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("../../../node_modules/playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(pathToFileURL("L:/what-if/media/pitch/what-if-deck.html").href);
const cur = () => p.evaluate(() => [...document.querySelectorAll("#deck .s")].findIndex((s) => s.classList.contains("on")) + 1);
const out = [await cur()];
for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft", "End", "ArrowRight", "Home"]) { await p.keyboard.press(k); out.push(await cur()); }
await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
await p.waitForTimeout(900); await p.screenshot({ path: "deck-test.png" });
console.log("slides visited", out.join(" "), "errors", errs.length ? errs : "none", "hash", await p.evaluate(() => location.hash));
await b.close();
