#!/usr/bin/env node
/**
 * Builds What-IF for Vercel (Build Output API v3) into .vercel/output:
 *
 *   static/                 site/** (minus site/src), with {{SITE_URL}}, {{BETA_CONTACT}}, {{VERSION}} filled in
 *   static/assets/<name>.js  each site/src/*.ts entry, bundled for the browser
 *   static/what-if-skill.zip skill/what-if/** zipped under "what-if/", placeholders filled in
 *   static/skill/**          the same skill files, for direct links
 *   functions/api/mcp.func   src/mcp/http.ts bundled for Node 22
 *   config.json              routes: /mcp → /api/mcp, /r → /r.html, /connect, /try, … → <page>.html
 *
 * Also bundles dist/whatif-stdio.mjs (the stdio server).
 *
 * SITE_URL:      WHATIF_SITE_URL, else (in a Vercel build) https://$VERCEL_PROJECT_PRODUCTION_URL,
 *                else http://localhost:3000 for local builds.
 * BETA_CONTACT:  WHATIF_BETA_CONTACT (an email or URL for invite-code requests), empty if unset.
 * Client bundles also get __WHATIF_VERSION__, __WHATIF_SITE_URL__ and __WHATIF_BETA_CONTACT__.
 */
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".vercel", "output");
const STATIC = join(OUT, "static");
const FUNC = join(OUT, "functions", "api", "mcp.func");
const SITE = join(ROOT, "site");
const SKILL = join(ROOT, "skill", "what-if");
const DIST = join(ROOT, "dist");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const ON_VERCEL = Boolean(process.env.VERCEL);
const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
const SITE_URL = (
  process.env.WHATIF_SITE_URL?.trim() ||
  (ON_VERCEL && vercelProd ? `https://${vercelProd}` : "") ||
  "http://localhost:3000"
).replace(/\/+$/, "");
const BETA_CONTACT = (process.env.WHATIF_BETA_CONTACT ?? "").trim();
const isPublicUrl = (u) => /^https:\/\//i.test(u) && !/^https:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(u) && !/\.localhost(:\d+)?(\/|$)/i.test(u);

const TEXT_EXT = new Set([".html", ".htm", ".md", ".txt", ".json", ".css", ".svg", ".xml", ".webmanifest", ".js", ".mjs"]);
const started = Date.now();
const warnings = [];

const escapeHtml = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const MARKUP_EXT = new Set([".html", ".htm", ".svg", ".xml"]);
/** Fills {{SITE_URL}}, {{BETA_CONTACT}} and {{VERSION}}; values are HTML-escaped inside markup files. */
const template = (text, ext = "") => {
  const esc = MARKUP_EXT.has(ext) ? escapeHtml : (v) => v;
  return text.split("{{SITE_URL}}").join(esc(SITE_URL)).split("{{BETA_CONTACT}}").join(esc(BETA_CONTACT)).split("{{VERSION}}").join(esc(pkg.version));
};
const rel = (p) => relative(ROOT, p).split(sep).join("/");
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function walk(dir, skip = () => false) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip(p)) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}

// --- clean -------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(STATIC, { recursive: true });
mkdirSync(FUNC, { recursive: true });
mkdirSync(DIST, { recursive: true });

// --- static site ---------------------------------------------------------------
const siteSrc = join(SITE, "src");
let siteFiles = 0;
if (existsSync(SITE)) {
  for (const file of walk(SITE, (p) => p === siteSrc)) {
    const dest = join(STATIC, relative(SITE, file));
    mkdirSync(dirname(dest), { recursive: true });
    const ext = extname(file).toLowerCase();
    if (TEXT_EXT.has(ext)) writeFileSync(dest, template(readFileSync(file, "utf8"), ext));
    else cpSync(file, dest);
    siteFiles++;
  }
} else warnings.push("site/ does not exist yet: only the MCP function and the skill were built.");

// --- client bundles --------------------------------------------------------------
const entries = existsSync(siteSrc) ? readdirSync(siteSrc).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !f.endsWith(".d.ts") && f !== "messages.ts").map((f) => join(siteSrc, f)) : [];
const define = {
  __WHATIF_VERSION__: JSON.stringify(pkg.version),
  __WHATIF_SITE_URL__: JSON.stringify(SITE_URL),
  __WHATIF_BETA_CONTACT__: JSON.stringify(BETA_CONTACT),
};
let clientBytes = 0;
if (entries.length) {
  const r = await build({
    entryPoints: Object.fromEntries(entries.map((e) => [basename(e).replace(/\.[^.]+$/, ""), e])),
    outdir: join(STATIC, "assets"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    legalComments: "none",
    define: { ...define, "process.env.NODE_ENV": '"production"' },
    metafile: true,
    logLevel: "warning",
  });
  for (const [file, o] of Object.entries(r.metafile.outputs)) if (file.endsWith(".js")) clientBytes += o.bytes;
}

// --- skill zip + direct files --------------------------------------------------------
let skillFiles = 0;
let zipBytes = 0;
if (existsSync(SKILL)) {
  const files = {};
  for (const file of walk(SKILL)) {
    const inside = relative(SKILL, file).split(sep).join("/");
    const isText = TEXT_EXT.has(extname(file).toLowerCase()) || extname(file) === "";
    const data = isText ? strToU8(template(readFileSync(file, "utf8"))) : new Uint8Array(readFileSync(file));
    files[`what-if/${inside}`] = [data, { level: 9, mtime: new Date("2026-10-01T00:00:00Z") }];
    const dest = join(STATIC, "skill", ...inside.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
    skillFiles++;
  }
  const zip = zipSync(files);
  writeFileSync(join(STATIC, "what-if-skill.zip"), zip);
  zipBytes = zip.length;
  if (!existsSync(join(SKILL, "SKILL.md"))) warnings.push("skill/what-if/SKILL.md is missing.");
  // The zip tells owners which MCP address to add; a localhost or http address only works on this machine.
  if (!isPublicUrl(SITE_URL)) {
    const msg = `what-if-skill.zip points at ${SITE_URL}/api/mcp, which is not a public https address. Set WHATIF_SITE_URL to the live site before sharing the zip.`;
    warnings.push(ON_VERCEL ? `VERCEL BUILD: ${msg}` : msg);
    if (ON_VERCEL) console.warn(`::warning::${msg}`);
  }
} else warnings.push("skill/what-if/ does not exist yet: no what-if-skill.zip.");

// --- server bundles ----------------------------------------------------------------
// Node's ESM output cannot `require` CommonJS dependencies' built-ins without this shim.
const banner = {
  js: [
    'import { createRequire as __whatifCreateRequire } from "node:module";',
    "const require = __whatifCreateRequire(import.meta.url);",
  ].join("\n"),
};
const serverCommon = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node22"],
  minify: true,
  legalComments: "none",
  banner,
  metafile: true,
  logLevel: "warning",
};

const fnResult = await build({
  ...serverCommon,
  entryPoints: [join(ROOT, "src", "mcp", "http.ts")],
  outfile: join(FUNC, "index.mjs"),
  define,
});
writeFileSync(
  join(FUNC, ".vc-config.json"),
  JSON.stringify(
    { runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true },
    null,
    2,
  ) + "\n",
);

// The stdio server's default report site: the public site of a deployed build, else none (it then uses localhost).
const stdioDefault = isPublicUrl(SITE_URL) ? SITE_URL : "";
const stdioResult = await build({
  ...serverCommon,
  entryPoints: [join(ROOT, "src", "mcp", "stdio.ts")],
  outfile: join(DIST, "whatif-stdio.mjs"),
  define: { ...define, __WHATIF_DEFAULT_SITE__: JSON.stringify(stdioDefault) },
  banner: { js: `#!/usr/bin/env node\n${banner.js}` },
});

const bytesOf = (r) => Object.values(r.metafile.outputs).reduce((n, o) => n + o.bytes, 0);

// --- routes ------------------------------------------------------------------------
// Clean URLs for every top-level page (index.html is served at /).
const pages = existsSync(STATIC)
  ? readdirSync(STATIC).filter((f) => f.endsWith(".html") && f !== "index.html" && f !== "404.html").map((f) => f.slice(0, -5))
  : [];
const REQUIRED_PAGES = ["r", "connect", "try"];
for (const must of REQUIRED_PAGES) if (!pages.includes(must)) pages.push(must);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const routes = [
  { src: "^/mcp/?$", dest: "/api/mcp" },
  { src: "^/api/mcp/$", dest: "/api/mcp" },
  { src: "^/assets/(.*)$", headers: { "Cache-Control": "public, max-age=300, must-revalidate" }, continue: true },
  { src: "^/what-if-skill\\.zip$", headers: { "Content-Disposition": 'attachment; filename="what-if-skill.zip"' }, continue: true },
  { handle: "filesystem" },
  ...pages.map((p) => ({ src: `^/${escape(p)}/?$`, dest: `/${p}.html` })),
  ...(existsSync(join(STATIC, "404.html")) ? [{ src: "^/.*$", dest: "/404.html", status: 404 }] : []),
];
writeFileSync(join(OUT, "config.json"), JSON.stringify({ version: 3, routes }, null, 2) + "\n");

// --- summary -------------------------------------------------------------------------
for (const p of REQUIRED_PAGES) if (!existsSync(join(STATIC, `${p}.html`))) warnings.push(`site/${p}.html is missing (the /${p} route has nothing to serve yet).`);
const fnBytes = bytesOf(fnResult);
console.log(`What-IF build ${pkg.version} -> ${rel(OUT)}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
console.log(`  SITE_URL           ${SITE_URL}${ON_VERCEL ? " (Vercel build)" : ""}`);
console.log(`  BETA_CONTACT       ${BETA_CONTACT ? "set" : "(empty: the site hides the request-a-code button)"}`);
console.log(`  static             ${siteFiles} site files, ${entries.length} client bundle(s) ${entries.length ? `(${kb(clientBytes)})` : ""}`);
console.log(`  skill              ${skillFiles} file(s) -> static/what-if-skill.zip ${zipBytes ? `(${kb(zipBytes)})` : "(not built)"}`);
console.log(`  function           functions/api/mcp.func/index.mjs (${kb(fnBytes)})`);
console.log(`  stdio              ${rel(join(DIST, "whatif-stdio.mjs"))} (${kb(bytesOf(stdioResult))})`);
console.log(`  routes             /mcp -> /api/mcp, ${pages.map((p) => `/${p}`).join(", ")}`);
for (const w of warnings) console.log(`  warning            ${w}`);
