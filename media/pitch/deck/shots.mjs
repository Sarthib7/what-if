import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("../../../node_modules/playwright");
mkdirSync("frames", { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL("L:/what-if/media/pitch/what-if-deck.html").href + "#1");
await p.addStyleTag({ content: "#hint,#bar{display:none!important}" });
await p.evaluate(() => document.fonts.ready);
for (let n = 1; n <= 8; n++) {
  await p.evaluate((k) => { location.hash = "#" + k; }, n);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `frames/s${n}.png` });
}
await b.close(); console.log("ok");
