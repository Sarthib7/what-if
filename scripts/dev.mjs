#!/usr/bin/env node
/**
 * Local preview of the Vercel output on http://localhost:3000 (PORT env):
 * static files from .vercel/output/static and the bundled MCP function at
 * /api/mcp (and /mcp), routed with the same config.json Vercel uses.
 *
 *   node scripts/dev.mjs             build, then serve
 *   node scripts/dev.mjs --no-build  serve the existing .vercel/output
 *   node scripts/dev.mjs --watch     rebuild when site/, src/ or skill/ change
 *
 * Closed beta locally: set WHATIF_BETA_CODES (and WHATIF_BETA_CONTACT) in the shell first;
 * unset = open. The request log prints paths only, never query strings, so codes stay out of it.
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".vercel", "output");
const STATIC = join(OUT, "static");
const FUNCTIONS = join(OUT, "functions");
const argv = process.argv.slice(2);
const portArg = argv.indexOf("--port");
const PORT = Number((portArg >= 0 && argv[portArg + 1]) || process.env.PORT || 3000);
const args = new Set(argv);
const SITE_URL = process.env.WHATIF_SITE_URL || `http://localhost:${PORT}`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
  ".webmanifest": "application/manifest+json",
};

function runBuild() {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "build.mjs")], {
    stdio: "inherit",
    env: { ...process.env, WHATIF_SITE_URL: SITE_URL },
  });
  return r.status === 0;
}

if (!args.has("--no-build")) {
  if (!runBuild()) {
    if (!existsSync(join(OUT, "config.json"))) process.exit(1);
    console.error("[dev] build failed; serving the previous .vercel/output");
  }
} else if (!existsSync(join(OUT, "config.json"))) {
  console.error("[dev] .vercel/output is missing; run without --no-build first.");
  process.exit(1);
}

let config = loadConfig();
let version = 0;
const handlers = new Map();

function loadConfig() {
  return JSON.parse(readFileSync(join(OUT, "config.json"), "utf8"));
}

/** A function lives at functions/<path>.func; its handler file is named in .vc-config.json. */
function functionFor(path) {
  const dir = join(FUNCTIONS, `${path.replace(/^\/+/, "")}.func`);
  if (!existsSync(join(dir, ".vc-config.json"))) return null;
  return dir;
}

async function loadHandler(dir) {
  const key = `${dir}@${version}`;
  if (!handlers.has(key)) {
    const cfg = JSON.parse(readFileSync(join(dir, ".vc-config.json"), "utf8"));
    const mod = await import(`${pathToFileURL(join(dir, cfg.handler)).href}?v=${version}`);
    handlers.set(key, mod.default ?? mod.handler);
  }
  return handlers.get(key);
}

function staticFile(path) {
  let p;
  try {
    p = decodeURIComponent(path);
  } catch {
    return null;
  }
  const full = normalize(join(STATIC, p));
  if (full !== STATIC && !full.startsWith(STATIC + sep)) return null;
  for (const candidate of [full, join(full, "index.html")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The filesystem phase: a function or a static file at this path. */
function resolveFs(path) {
  const fn = functionFor(path);
  if (fn) return { kind: "function", dir: fn };
  const file = staticFile(path);
  if (file) return { kind: "file", file };
  return null;
}

/** Applies config.json routes the way Vercel does for src/dest/headers/status/continue/handle:filesystem. */
function route(pathname) {
  const headers = {};
  let path = pathname;
  let status;
  for (const r of config.routes) {
    if (r.handle) {
      if (r.handle === "filesystem") {
        const hit = resolveFs(path);
        if (hit) return { ...hit, headers, status };
      }
      continue;
    }
    const m = new RegExp(r.src).exec(path);
    if (!m) continue;
    if (r.headers) Object.assign(headers, r.headers);
    if (r.status) status = r.status;
    if (r.dest) path = r.dest.replace(/\$(\d+)/g, (_, i) => m[Number(i)] ?? "");
    if (!r.continue) {
      const hit = resolveFs(path);
      return hit ? { ...hit, headers, status } : { kind: "missing", headers, status };
    }
  }
  const hit = resolveFs(path);
  return hit ? { ...hit, headers, status } : { kind: "missing", headers, status };
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${PORT}`}`);
  const hit = route(url.pathname);
  res.on("finish", () => {
    if (!url.pathname.startsWith("/assets/")) console.log(`[dev] ${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started} ms)`);
  });
  for (const [k, v] of Object.entries(hit.headers ?? {})) res.setHeader(k, v);
  try {
    if (hit.kind === "function") {
      const handler = await loadHandler(hit.dir);
      await handler(req, res);
      return;
    }
    if (hit.kind === "file") {
      res.writeHead(hit.status ?? 200, {
        "Content-Type": TYPES[extname(hit.file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(hit.file).pipe(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Not found: ${url.pathname}\n`);
  } catch (e) {
    console.error("[dev] request failed:", e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal error\n");
  }
});

server.listen(PORT, () => {
  console.log(`[dev] What-IF on ${SITE_URL}`);
  console.log(`[dev]   site     ${SITE_URL}/`);
  console.log(`[dev]   report   ${SITE_URL}/r#<token>`);
  console.log(`[dev]   connect  ${SITE_URL}/connect`);
  console.log(`[dev]   try      ${SITE_URL}/try`);
  const codes = (process.env.WHATIF_BETA_CODES ?? "").split(",").map((c) => c.trim()).filter(Boolean).length;
  const closed = (process.env.WHATIF_BETA_CODES ?? "").trim() !== "";
  const mcpUrl = closed ? `"${SITE_URL}/api/mcp?code=YOUR-INVITE-CODE"` : `${SITE_URL}/api/mcp`;
  console.log(`[dev]   MCP      ${SITE_URL}/api/mcp  (claude mcp add --transport http what-if-local ${mcpUrl})`);
  console.log(`[dev]   beta     ${closed ? `closed: ${codes} invite code${codes === 1 ? "" : "s"} from WHATIF_BETA_CODES` : "open (WHATIF_BETA_CODES is not set)"}`);
});

if (args.has("--watch")) {
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log("[dev] change detected, rebuilding…");
      if (runBuild()) {
        config = loadConfig();
        version++;
        handlers.clear();
      }
    }, 250);
  };
  for (const dir of ["site", "src", "skill"]) {
    const p = join(ROOT, dir);
    if (existsSync(p)) watch(p, { recursive: true }, rebuild);
  }
  console.log("[dev] watching site/, src/ and skill/");
}
