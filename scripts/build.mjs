#!/usr/bin/env node
/**
 * Builds What-IF for Vercel (Build Output API v3) into .vercel/output:
 *
 *   static/                 site/** (minus site/src), with {{SITE_URL}} filled in
 *   static/assets/<name>.js  each site/src/*.ts entry, bundled for the browser
 *   static/what-if-skill.zip skill/what-if/** zipped under "what-if/", {{SITE_URL}} filled in
 *   static/skill/**          the same skill files, for direct links
 *   functions/api/mcp.func   src/mcp/http.ts bundled for Node 22
 *   config.json              routes: /mcp → /api/mcp, /r → /r.html, /connect → /connect.html, …
 *
 * Also bundles dist/whatif-stdio.mjs (the stdio server).
 * SITE_URL: WHATIF_SITE_URL, else https://$VERCEL_PROJECT_PRODUCTION_URL, else http://localhost:3000.
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
const SITE_URL = (
  process.env.WHATIF_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}` : "") ||
  "http://localhost:3000"
).replace(/\/+$/, "");

const TEXT_EXT = new Set([".html", ".htm", ".md", ".txt", ".json", ".css", ".svg", ".xml", ".webmanifest", ".js", ".mjs"]);
const started = Date.now();
const warnings = [];

const template = (text) => text.split("{{SITE_URL}}").join(SITE_URL).split("{{VERSION}}").join(pkg.version);
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
    if (TEXT_EXT.has(extname(file).toLowerCase())) writeFileSync(dest, template(readFileSync(file, "utf8")));
    else cpSync(file, dest);
    siteFiles++;
  }
} else warnings.push("site/ does not exist yet: only the MCP function and the skill were built.");

// --- client bundles --------------------------------------------------------------
const entries = existsSync(siteSrc) ? readdirSync(siteSrc).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !f.endsWith(".d.ts")).map((f) => join(siteSrc, f)) : [];
const define = {
  __WHATIF_VERSION__: JSON.stringify(pkg.version),
  __WHATIF_SITE_URL__: JSON.stringify(SITE_URL),
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

const stdioDefault = /^https:\/\//.test(SITE_URL) ? SITE_URL : "";
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
for (const must of ["r", "connect"]) if (!pages.includes(must)) pages.push(must);
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
for (const p of ["r", "connect"]) if (!existsSync(join(STATIC, `${p}.html`))) warnings.push(`site/${p}.html is missing (the /${p} route has nothing to serve yet).`);
const fnBytes = bytesOf(fnResult);
console.log(`What-IF build ${pkg.version} -> ${rel(OUT)}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
console.log(`  SITE_URL           ${SITE_URL}`);
console.log(`  static             ${siteFiles} site files, ${entries.length} client bundle(s) ${entries.length ? `(${kb(clientBytes)})` : ""}`);
console.log(`  skill              ${skillFiles} file(s) -> static/what-if-skill.zip ${zipBytes ? `(${kb(zipBytes)})` : "(not built)"}`);
console.log(`  function           functions/api/mcp.func/index.mjs (${kb(fnBytes)})`);
console.log(`  stdio              ${rel(join(DIST, "whatif-stdio.mjs"))} (${kb(bytesOf(stdioResult))})`);
console.log(`  routes             /mcp -> /api/mcp, ${pages.map((p) => `/${p}`).join(", ")}`);
for (const w of warnings) console.log(`  warning            ${w}`);
