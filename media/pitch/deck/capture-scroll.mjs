// Full-page captures of the real product for the "how it works" clips.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("../../../node_modules/playwright");
const token = readFileSync("L:/what-if/media/pitch/assets/ai-rehearsal-link.txt", "utf8").trim();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.334 });
const hide = "header[class*=sticky],.wi-sticky,[data-sticky]{position:static!important} #hint{display:none!important}";
// 1) the AI-coached report, top to bottom
await p.goto(`http://localhost:3351/r?lang=en#${token}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.addStyleTag({ content: hide });
await p.screenshot({ path: "frames/report-full.png", fullPage: true });
// 2) /try: the first screen and the lunch-customers question
await p.goto("http://localhost:3351/try?lang=en", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
await p.screenshot({ path: "frames/try-1.png" });
await b.close();
console.log("ok");
