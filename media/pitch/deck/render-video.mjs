// node render-video.mjs [--stills 10,30,55] — renders video.html frame by frame into what-if-pitch-2min.mp4
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("../../../node_modules/playwright");
const fps = 30;
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? process.argv[outArg + 1] : "../what-if-pitch-2min.mp4";
const stillsArg = process.argv.indexOf("--stills");
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(",").map(Number) : null;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
p.on("pageerror", (e) => console.error("page error:", e.message));
await p.goto(pathToFileURL("L:/what-if/media/pitch/deck/video.html").href);
await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
const cdp = await p.context().newCDPSession(p);
const grab = async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true })).data, "base64");
if (stills) {
  for (const t of stills) { await p.evaluate((x) => window.render(x), t); writeFileSync(`still-${t}.png`, await grab()); }
  console.log("stills ok"); await b.close(); process.exit(0);
}
const DUR = await p.evaluate(() => window.DUR);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart",
  "-metadata", "title=What if", OUT], { stdio: ["pipe", "inherit", "inherit"] });
const frames = Math.round(DUR * fps); const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  await p.evaluate((x) => window.render(x), f / fps);
  if (!ff.stdin.write(await grab())) await once(ff.stdin, "drain");
  if (f % 300 === 0) process.stdout.write(`\r${f}/${frames}`);
}
ff.stdin.end(); const [code] = await once(ff, "close");
console.log(`\rdone ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s, ffmpeg ${code}`);
await b.close();
