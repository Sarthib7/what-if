/**
 * What-IF QA checks. Each check is { id, component, title, critical?, command, run(root) }.
 *
 * Rules every check follows:
 * - It never crashes the run. A module or file that does not exist yet fails
 *   with a plain detail ("src/engine/index.ts does not exist yet").
 * - `command` reproduces it from the repo root (shown in qa/reports/latest.md).
 * - In-process checks import the TypeScript modules directly (run.ts runs
 *   under `node --import tsx`), so they test the same code the site and the
 *   MCP use, without a build.
 * - Slow shared work runs once per QA run: tsc, the demo analysis and its
 *   rehearsal, the dev server, the MCP session and the browser run.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Analysis, ChangeExplanation, DecisionTemplate, InputCheck, RawInputs, TestPlan, TestResult } from "../src/engine/types.ts";
import type { PersonaBrief, Reaction, ReactionMethod, Rehearsal, RehearsalSummary, SubmitOutcome } from "../src/sim/types.ts";
import type { ShareState } from "../src/state.ts";
import { runUiCheck, UI_CHECKS, type UiResult } from "./ui-check.ts";

export interface Outcome {
  ok: boolean;
  detail: string;
}

export interface CheckDef {
  id: string;
  component: string;
  title: string;
  /** A failing critical check caps its component's automated score (rubric.criticalCap). */
  critical?: boolean;
  /** Command that reproduces the check from the repo root. */
  command?: string;
  /** Default 180 s. */
  timeoutMs?: number;
  run: (root: string) => Promise<Outcome> | Outcome;
}

export interface CheckResult {
  id: string;
  component: string;
  title: string;
  ok: boolean;
  critical?: boolean;
  skipped?: boolean;
  detail: string;
  command?: string;
  durationMs: number;
}

// ======================================================================
// helpers
// ======================================================================

const isWin = process.platform === "win32";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tail = (s: string, n = 1500) => (s.length > n ? "…" + s.slice(-n) : s).trim();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const posix = (p: string) => p.replace(/\\/g, "/");
const fmt = (n: number) => (Number.isFinite(n) ? (Math.round(n * 100) / 100).toString() : String(n));

function verdict(problems: string[], okDetail: string): Outcome {
  return problems.length ? { ok: false, detail: problems.join("\n") } : { ok: true, detail: okDetail };
}

function readText(root: string, rel: string): string | null {
  const p = join(root, rel);
  return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function listFiles(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".vercel", "reports"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}

/** Runs a program without a shell (paths with spaces are safe). */
function proc(cmd: string, args: string[], cwd: string, timeoutMs: number, env: NodeJS.ProcessEnv = {}): { code: number | null; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", ...env } });
  let out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.error) out += `\n${(r.error as NodeJS.ErrnoException).code === "ETIMEDOUT" ? `[timed out after ${Math.round(timeoutMs / 1000)} s]` : r.error.message}`;
  return { code: r.status, out };
}

/** Runs an npm command line through the shell (npm is npm.cmd on Windows). */
function npm(cmdline: string, cwd: string, timeoutMs: number): { code: number | null; out: string } {
  const r = spawnSync(cmdline, { cwd, shell: true, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } });
  let out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.error) out += `\n${(r.error as NodeJS.ErrnoException).code === "ETIMEDOUT" ? `[timed out after ${Math.round(timeoutMs / 1000)} s]` : r.error.message}`;
  return { code: r.status, out };
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", times: "×", minus: "−", ndash: "–", mdash: "—", hellip: "…", rarr: "→", larr: "←", le: "≤", ge: "≥", middot: "·", asymp: "≈", thinsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}
const squash = (s: string) => s.replace(/[\s   ]+/g, " ").trim();
const visibleText = (html: string) =>
  squash(decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")));
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Fails fast with a plain reason when a module is missing or does not load. */
class Missing extends Error {}
const moduleCache = new Map<string, Promise<Record<string, unknown>>>();
function load<T>(root: string, rel: string, need: string[] = []): Promise<T> {
  const key = join(root, rel);
  let p = moduleCache.get(key);
  if (!p) {
    p = (async () => {
      if (!existsSync(key)) throw new Missing(`${rel} does not exist yet`);
      try {
        return (await import(pathToFileURL(key).href)) as Record<string, unknown>;
      } catch (e) {
        throw new Error(`${rel} failed to load: ${msg(e).split("\n")[0]}`);
      }
    })();
    moduleCache.set(key, p);
  }
  return p.then((m) => {
    const absent = need.filter((n) => m[n] === undefined);
    if (absent.length) throw new Missing(`${rel} does not export ${absent.join(", ")}`);
    return m as T;
  });
}

// ---- module shapes (docs/ARCHITECTURE.md "Module signatures") ----

interface TemplatesMod {
  TEMPLATES: Record<string, DecisionTemplate>;
  demoInputs(id: string): Record<string, number | string>;
  DEMO_BUSINESS: string;
}
interface EngineMod extends TemplatesMod {
  analyze(template: string, raw: RawInputs, opts?: { business?: string; question?: string; demo?: boolean; currency?: string; id?: string }): Analysis;
  whatChanged(before: Analysis, after: Analysis): ChangeExplanation;
  planTest(a: Analysis): TestPlan;
  compareResult(a: Analysis, observed: Record<string, number>): TestResult;
  checkInputs(template: string, raw: RawInputs, opts?: { demo?: boolean }): InputCheck;
  getTemplate(id: string): DecisionTemplate;
  OBSERVED_FIELDS: Record<string, { key: string; label: string; required: boolean }[]>;
}
interface SimMod {
  startRehearsal(a: Analysis, opts?: { personas?: number; rounds?: number; seed?: number; event?: string }): Rehearsal;
  roundBriefs(r: Rehearsal): PersonaBrief[];
  submitRound(r: Rehearsal, reactions: unknown[], method?: ReactionMethod): SubmitOutcome;
  injectEvent(r: Rehearsal, text: string): Rehearsal;
  ruleBasedReactions(r: Rehearsal): Reaction[];
  summarize(r: Rehearsal): RehearsalSummary;
  interviewBriefs(r: Rehearsal, question: string, personaIds?: string[]): PersonaBrief[];
  recordInterview(r: Rehearsal, question: string, answers: unknown[], method?: ReactionMethod): { rehearsal: Rehearsal; errors: { personaId: string; error: string }[] };
  rebuildRehearsal(a: Analysis, s: NonNullable<ShareState["rehearsal"]>): Rehearsal;
}
interface StateMod {
  encodeState(s: ShareState): string;
  decodeState(token: string): ShareState;
  reportUrl(siteUrl: string, s: ShareState): string;
}
interface ReportMod {
  renderReport(input: { analysis: Analysis; plan?: TestPlan; rehearsal?: RehearsalSummary; result?: TestResult; status?: "running" | "final" }): string;
  reportStyles(): string;
}

const ENGINE_EXPORTS = ["checkInputs", "show", "TEMPLATES", "getTemplate", "demoInputs", "DEMO_BUSINESS", "analyze", "whatChanged", "planTest", "compareResult", "OBSERVED_FIELDS"];
const SIM_EXPORTS = ["startRehearsal", "roundBriefs", "submitRound", "injectEvent", "ruleBasedReactions", "summarize", "interviewBriefs", "recordInterview", "rebuildRehearsal"];
const SOURCES = ["owner", "assumption", "calculation", "imagined", "demo"];
const SOURCE_LABELS = ["Your number", "A guess", "Calculated", "Imagined", "Demo data"];
const EVENT = "The café opposite starts an €8.50 lunch.";

const templates = (root: string) => load<TemplatesMod>(root, "src/engine/templates.ts", ["TEMPLATES", "demoInputs", "DEMO_BUSINESS"]);
const engine = (root: string, need = ["analyze", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]) => load<EngineMod>(root, "src/engine/index.ts", need);
const simMod = (root: string, need = ["startRehearsal", "roundBriefs", "submitRound", "ruleBasedReactions", "summarize"]) => load<SimMod>(root, "src/sim/index.ts", need);
const stateMod = (root: string) => load<StateMod>(root, "src/state.ts", ["encodeState", "decodeState", "reportUrl"]);
const reportMod = (root: string) => load<ReportMod>(root, "src/report/index.ts", ["renderReport"]);

const question = (e: TemplatesMod, t: string) => e.TEMPLATES[t]?.exampleQuestion ?? "What if I run a weekday lunch offer?";

/** The demo analysis exactly as the report page rebuilds it from a demo link. */
function demoAnalysis(e: EngineMod, t = "lunch_offer", over: RawInputs = {}, opts: { demo?: boolean; business?: string; question?: string } = {}): Analysis {
  return e.analyze(t, { ...e.demoInputs(t), ...over }, { demo: true, business: e.DEMO_BUSINESS, question: question(e, t), ...opts });
}

function playRound(sim: SimMod, r: Rehearsal): Rehearsal {
  const reactions = sim.ruleBasedReactions(r);
  const out = sim.submitRound(r, reactions, "rule-based");
  if (out.errors.length) throw new Error(`the rule-based stand-in's own reactions were rejected in round ${r.currentRound}: ${out.errors.map((x) => `${x.personaId}: ${x.error}`).join("; ")}`);
  if (out.rehearsal.status !== "done" && out.rehearsal.currentRound === r.currentRound) throw new Error(`round ${r.currentRound} did not advance after every active persona reacted`);
  return out.rehearsal;
}

function playAll(sim: SimMod, r: Rehearsal, max = 8): Rehearsal {
  let cur = r;
  for (let i = 0; i < max && cur.status !== "done"; i++) cur = playRound(sim, cur);
  if (cur.status !== "done") throw new Error(`the rehearsal is not done after ${max} rounds (currentRound ${cur.currentRound} of ${cur.rounds.length})`);
  return cur;
}

const toShare = (r: Rehearsal): NonNullable<ShareState["rehearsal"]> => ({ seed: r.seed, personas: r.personas.length, rounds: r.rounds.length, events: r.events, reactions: r.reactions, interviews: r.interviews });

/** JSON with run-time stamps removed, for determinism comparisons. */
const stable = (x: unknown) => JSON.stringify(x, (k, v: unknown) => (k === "createdAt" || k === "recordedAt" ? undefined : v));

function firstDiff(a: unknown, b: unknown, path = "$"): string | null {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return `${path}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  for (const k of new Set([...ka, ...kb])) {
    if (k === "createdAt" || k === "recordedAt") continue;
    const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** The demo bundle: analysis, plan and a full rule-based rehearsal with one owner event. Built once. */
interface Bundle {
  e: EngineMod;
  a: Analysis;
  plan: TestPlan;
  sim?: SimMod;
  rehearsal?: Rehearsal;
  summary?: RehearsalSummary;
  simError?: string;
}
let bundleMemo: Promise<Bundle> | null = null;
function bundle(root: string): Promise<Bundle> {
  bundleMemo ??= (async () => {
    const e = await engine(root, ["analyze", "planTest", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]);
    const a = demoAnalysis(e);
    const plan = e.planTest(a);
    try {
      const sim = await simMod(root, [...SIM_EXPORTS.filter((n) => n !== "rebuildRehearsal")]);
      let r = sim.startRehearsal(a, { seed: 42 });
      r = playRound(sim, r);
      r = sim.injectEvent(r, EVENT);
      r = playAll(sim, r);
      return { e, a, plan, sim, rehearsal: r, summary: sim.summarize(r) };
    } catch (err) {
      return { e, a, plan, simError: msg(err) };
    }
  })();
  return bundleMemo;
}

/** The demo report link the UI check opens (and its text marker). */
export async function demoReport(root: string): Promise<{ token: string; marker: string; share: ShareState }> {
  const t = await templates(root);
  const st = await stateMod(root);
  const share: ShareState = { v: 1, template: "lunch_offer", inputs: t.demoInputs("lunch_offer"), demo: true, business: t.DEMO_BUSINESS, question: question(t, "lunch_offer") };
  try {
    const b = await bundle(root);
    if (b.rehearsal) share.rehearsal = toShare(b.rehearsal);
  } catch {
    /* the report still opens without the rehearsal */
  }
  const words = t.DEMO_BUSINESS.match(/\p{L}{5,}/gu) ?? [];
  const marker = words.find((w) => !/^caf/i.test(w)) ?? t.DEMO_BUSINESS;
  return { token: st.encodeState(share), marker, share };
}

// ---- type-check (once), with errors attributed to components by path ----

interface Tsc {
  ok: boolean;
  out: string;
  errors: { file: string; line: string }[];
}
let tscMemo: Tsc | null = null;
function tsc(root: string): Tsc {
  if (tscMemo) return tscMemo;
  const bin = join(root, "node_modules/typescript/bin/tsc");
  if (!existsSync(bin)) return (tscMemo = { ok: false, out: "TypeScript is not installed (run npm install)", errors: [] });
  const r = proc(process.execPath, [bin, "--noEmit", "-p", "tsconfig.json", "--pretty", "false"], root, 5 * 60_000);
  const errors = r.out
    .split(/\r?\n/)
    .map((line) => ({ line: line.trim(), m: /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line.trim()) }))
    .filter((x) => x.m)
    .map((x) => ({ file: posix(x.m![1] ?? ""), line: x.line }));
  return (tscMemo = { ok: r.code === 0, out: r.out, errors });
}

function typecheckFor(root: string, prefixes: string[], label: string): Outcome {
  const t = tsc(root);
  if (!t.ok && !t.errors.length) return { ok: false, detail: `tsc failed without file errors:\n${tail(t.out, 800)}` };
  const mine = t.errors.filter((e) => prefixes.some((p) => e.file.startsWith(p)));
  const files = prefixes.flatMap((p) => {
    const abs = join(root, p);
    if (!existsSync(abs)) return [];
    return statSync(abs).isFile() ? [abs] : listFiles(abs, (f) => /\.(ts|mts|tsx)$/.test(f));
  });
  if (!files.length) return { ok: false, detail: `no TypeScript files yet in ${prefixes.join(", ")}` };
  if (mine.length) return { ok: false, detail: `${mine.length} type errors in ${label}:\n${mine.slice(0, 8).map((e) => e.line).join("\n")}${mine.length > 8 ? `\n… +${mine.length - 8} more` : ""}` };
  return { ok: true, detail: `${files.length} files in ${label}, no type errors${t.ok ? "" : ` (${t.errors.length} errors elsewhere)`}` };
}

// ---- node:test runner ----

function nodeTest(root: string, candidates: string[]): Outcome {
  const file = candidates.find((f) => existsSync(join(root, f)));
  if (!file) return { ok: false, detail: `${candidates.join(" or ")} does not exist yet` };
  const r = proc(process.execPath, ["--import", "tsx", "--test", file], root, 5 * 60_000);
  const count = (re: RegExp) => Number(re.exec(r.out)?.[1] ?? 0);
  const pass = count(/^\s*(?:#|ℹ)\s*pass (\d+)/m);
  const fail = count(/^\s*(?:#|ℹ)\s*fail (\d+)/m);
  const failed = [...new Set([...r.out.matchAll(/^\s*(?:not ok \d+ - |✖ )(.+?)(?: \(\d[\d.]*m?s\))?$/gm)].map((m) => (m[1] ?? "").trim()))].filter((n) => !/^failing tests:?$/i.test(n)).slice(0, 8);
  const ok = r.code === 0 && fail === 0 && pass > 0;
  if (ok) return { ok, detail: `${file}: ${pass} passed` };
  return { ok, detail: `${file}: ${pass} passed, ${fail} failed${pass === 0 && fail === 0 ? " (no tests ran)" : ""}${failed.length ? `\nfailing: ${failed.join(" | ")}` : ""}\n${tail(r.out, 900)}` };
}

// ---- browser-safe modules (pure TS shared by the server and the report page) ----

function browserSafe(root: string, paths: string[], allowEnvIn: string[] = []): Outcome {
  const files = paths.flatMap((d) => {
    const p = join(root, d);
    if (!existsSync(p)) return [];
    return statSync(p).isFile() ? [p] : listFiles(p, (f) => /\.(ts|mts|js|mjs)$/.test(f) && !/\.test\./.test(f));
  });
  if (!files.length) return { ok: false, detail: `no files yet in ${paths.join(", ")}` };
  const bad: string[] = [];
  for (const f of files) {
    const rel = posix(relative(root, f));
    const src = stripComments(readFileSync(f, "utf8"));
    const hits: string[] = [];
    if (/\bfrom\s+["']node:|\bimport\(\s*["']node:|\brequire\(/.test(src)) hits.push("imports a Node module");
    if (/\bfrom\s+["'](fs|path|os|crypto|http|https|child_process|url|zlib|buffer|stream|net)(\/[a-z]+)?["']/.test(src)) hits.push("imports a Node built-in");
    if (/\bprocess\.(argv|cwd|exit|platform|stdout|stderr)\b/.test(src)) hits.push("uses process");
    if (/\bprocess\.env\b/.test(src) && !allowEnvIn.some((p) => rel.startsWith(p))) hits.push("reads process.env");
    if (/\bBuffer\.(from|alloc|concat)/.test(src)) hits.push("uses Buffer");
    if (/\b__dirname\b|\bimport\.meta\.dirname\b/.test(src)) hits.push("uses file paths");
    if (hits.length) bad.push(`${rel}: ${hits.join(", ")}`);
  }
  return verdict(bad, `${files.length} files, no Node APIs`);
}

// ---- the dev server (scripts/dev.mjs), started once per run on a free port ----

interface Dev {
  base: string;
  port: number;
  out: string[];
}
let devMemo: Promise<Dev> | null = null;
let devProc: ChildProcess | null = null;
/** Set by the build check: the dev server then serves that output (--no-build) instead of rebuilding it. */
let builtThisRun = false;

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolvePort(port));
    });
  });
}

export function devServer(root: string): Promise<Dev> {
  devMemo ??= (async () => {
    const script = join(root, "scripts/dev.mjs");
    if (!existsSync(script)) throw new Missing("scripts/dev.mjs does not exist yet");
    const port = await freePort();
    const out: string[] = [];
    const child = spawn(process.execPath, builtThisRun ? [script, "--no-build"] : [script], {
      cwd: root,
      env: { ...process.env, PORT: String(port), WHATIF_SITE_URL: `http://localhost:${port}`, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    devProc = child;
    let exited: number | null | undefined;
    child.on("exit", (c) => (exited = c));
    child.stdout?.on("data", (d: Buffer) => out.push(String(d)));
    child.stderr?.on("data", (d: Buffer) => out.push(String(d)));
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (exited !== undefined) throw new Error(`scripts/dev.mjs exited (code ${exited}) before answering:\n${tail(out.join(""), 800)}`);
      const ports = [String(port)];
      const said = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d+)/.exec(out.join(""))?.[1];
      if (said && said !== String(port)) ports.push(said);
      for (const p of ports)
        for (const host of ["127.0.0.1", "[::1]"]) {
          const base = `http://${host}:${p}`;
          try {
            await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
            return { base, port: Number(p), out };
          } catch {
            /* not up yet */
          }
        }
      await sleep(400);
    }
    throw new Error(`scripts/dev.mjs did not answer on port ${port} within 90 s (does it read PORT?):\n${tail(out.join(""), 800)}`);
  })();
  return devMemo;
}

export function stopDev(): void {
  const p = devProc;
  devProc = null;
  devMemo = null;
  if (!p || p.exitCode !== null || p.pid === undefined) return;
  if (isWin) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
  else p.kill("SIGTERM");
}
process.on("exit", stopDev);

// ---- MCP over HTTP (JSON or SSE answers) ----

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC payloads are checked field by field below */
type Json = any;
interface RpcReply {
  status: number;
  headers: Headers;
  raw: string;
  body: { result?: Json; error?: { code: number; message: string } } | null;
}

async function readRpc(res: Response, id: number | null): Promise<RpcReply> {
  const raw = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  let body: RpcReply["body"] = null;
  if (ct.includes("text/event-stream")) {
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try {
        const m = JSON.parse(line.slice(5).trim()) as Json;
        if (id === null || m?.id === id) body = m;
      } catch {
        /* keep-alive or partial line */
      }
    }
  } else if (raw.trim()) {
    try {
      const j = JSON.parse(raw) as Json;
      body = Array.isArray(j) ? (j.find((x: Json) => x?.id === id) ?? null) : j;
    } catch {
      body = null;
    }
  }
  return { status: res.status, headers: res.headers, raw, body };
}

const RPC_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

async function rpc(url: string, method: string, params: unknown, id: number | null, headers: Record<string, string> = {}): Promise<RpcReply> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...RPC_HEADERS, ...headers },
    body: JSON.stringify(id === null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  return readRpc(res, id);
}

interface McpSession {
  url: string;
  init: Json;
  headers: Record<string, string>;
  call(method: string, params: unknown, id: number): Promise<RpcReply>;
}
let mcpMemo: Promise<McpSession> | null = null;
function mcp(root: string): Promise<McpSession> {
  mcpMemo ??= (async () => {
    const dev = await devServer(root);
    const url = `${dev.base}/api/mcp`;
    const init = await rpc(url, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "what-if-qa", version: "1.0.0" } }, 1);
    if (!init.body?.result) throw new Error(`initialize at ${url} failed: HTTP ${init.status} ${init.raw.slice(0, 300)}`);
    const pv = init.body.result.protocolVersion as string | undefined;
    const headers: Record<string, string> = pv ? { "mcp-protocol-version": pv } : {};
    const sid = init.headers.get("mcp-session-id");
    if (sid) headers["mcp-session-id"] = sid;
    await rpc(url, "notifications/initialized", {}, null, headers).catch(() => undefined);
    return { url, init: init.body.result, headers, call: (method, params, id) => rpc(url, method, params, id, headers) };
  })();
  return mcpMemo;
}

async function toolCall(s: McpSession, name: string, args: unknown, id: number): Promise<Json> {
  const r = await s.call("tools/call", { name, arguments: args }, id);
  if (r.body?.error) throw new Error(`${name}: JSON-RPC error ${r.body.error.code}: ${r.body.error.message}`);
  if (!r.body?.result) throw new Error(`${name}: HTTP ${r.status} ${r.raw.slice(0, 300)}`);
  return r.body.result;
}

const toolText = (result: Json): string => (Array.isArray(result?.content) ? result.content.map((c: Json) => (typeof c?.text === "string" ? c.text : "")).join("\n") : "");

function findReportUrl(result: Json): string | null {
  const direct = result?.structuredContent?.report_url;
  if (typeof direct === "string") return direct;
  return /https?:\/\/[^\s"'<>)\]]+\/r(?:\.html)?#[A-Za-z0-9_-]+/.exec(JSON.stringify(result ?? {}))?.[0] ?? null;
}

/** Arrays of persona briefs anywhere in a result. */
function findBriefs(x: Json, depth = 0): { personaId: string; round?: number; allowedActions: string[]; prompt: string }[] {
  if (!x || typeof x !== "object" || depth > 6) return [];
  if (Array.isArray(x)) {
    if (x.length && x.every((b: Json) => b && typeof b === "object" && typeof b.personaId === "string" && typeof b.prompt === "string")) return x;
    for (const v of x) {
      const f = findBriefs(v, depth + 1);
      if (f.length) return f;
    }
    return [];
  }
  for (const k of ["briefs", "next", "nextBriefs", "next_briefs"]) {
    const f = findBriefs(x[k], depth + 1);
    if (f.length) return f;
  }
  for (const v of Object.values(x)) {
    const f = findBriefs(v, depth + 1);
    if (f.length) return f;
  }
  return [];
}

const ARCH_TOOLS_FALLBACK = ["whatif_start", "whatif_check_inputs", "whatif_run_scenarios", "whatif_what_changed", "whatif_rehearsal_start", "whatif_rehearsal_submit", "whatif_rehearsal_event", "whatif_rehearsal_autoplay", "whatif_rehearsal_interview", "whatif_plan_test", "whatif_log_result"];
function architectureTools(root: string): string[] {
  const s = readText(root, "docs/ARCHITECTURE.md") ?? "";
  const found = [...s.matchAll(/^\|\s*`(whatif_[a-z_]+)`\s*\|/gm)].map((m) => m[1] ?? "").filter(Boolean);
  return found.length ? [...new Set(found)] : ARCH_TOOLS_FALLBACK;
}

/** initialize + tools/list against the bundled Vercel function, without Vercel. */
async function smokeFunction(file: string, expected: string[]): Promise<{ problems: string[]; info: string }> {
  const m = (await import(`${pathToFileURL(file).href}?qa=${Date.now()}`)) as Record<string, unknown>;
  type Fetchish = (req: Request) => Promise<Response> | Response;
  const def = m.default as Json;
  type NodeHandler = (req: IncomingMessage, res: ServerResponse) => unknown;
  let nodeHandler: NodeHandler | null = null;
  let fetchish: Fetchish | null = null;
  if (typeof def === "function") nodeHandler = def;
  else if (def && typeof def.fetch === "function") fetchish = (r) => def.fetch(r);
  else if (typeof m.POST === "function") fetchish = m.POST as Fetchish;
  else if (typeof m.handler === "function") nodeHandler = m.handler as NodeHandler;
  if (!nodeHandler && !fetchish) return { problems: ["the function exports no handler (default (req, res), default { fetch } or POST)"], info: "" };
  let server: Server | null = null;
  let base = "http://function.qa.invalid";
  if (nodeHandler) {
    const h = nodeHandler;
    server = createServer((req, res) => {
      Promise.resolve()
        .then(() => h(req, res))
        .catch((e) => {
          if (!res.headersSent) res.writeHead(500);
          res.end(String(e));
        });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const post = async (body: { id: number; method: string; params: unknown }, headers: Record<string, string> = {}) => {
    const init: RequestInit = { method: "POST", headers: { ...RPC_HEADERS, ...headers }, body: JSON.stringify({ jsonrpc: "2.0", ...body }) };
    const res = fetchish ? await fetchish(new Request(`${base}/api/mcp`, init)) : await fetch(`${base}/api/mcp`, { ...init, signal: AbortSignal.timeout(20_000) });
    return readRpc(res, body.id);
  };
  try {
    const init = await post({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "what-if-qa", version: "1.0.0" } } });
    if (!init.body?.result) return { problems: [`the bundled function did not answer initialize: HTTP ${init.status} ${init.raw.slice(0, 200)}`], info: "" };
    const pv = init.body.result.protocolVersion as string | undefined;
    const list = await post({ id: 2, method: "tools/list", params: {} }, pv ? { "mcp-protocol-version": pv } : {});
    const names = ((list.body?.result?.tools ?? []) as Json[]).map((t) => String(t?.name));
    const missing = expected.filter((n) => !names.includes(n));
    return { problems: missing.length ? [`the bundled function lacks tools: ${missing.join(", ")}`] : [], info: `bundled function answers: ${names.length} tools` };
  } finally {
    server?.close();
  }
}

// ---- skill helpers ----

const SKILL_DIR = "skill/what-if";
const ALLOWED_FRONTMATTER = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];

function frontmatter(src: string): { keys: string[]; values: Record<string, string>; body: string; error?: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(src);
  if (!m) return { keys: [], values: {}, body: src, error: "no YAML frontmatter (--- … ---) at the top of the file" };
  const keys: string[] = [];
  const values: Record<string, string> = {};
  let cur: string | null = null;
  let block: string | null = null;
  const unquote = (v: string) => {
    const t = v.trim();
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
    if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    return t;
  };
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const k = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line);
    if (k && !/^\s/.test(line)) {
      cur = k[1] ?? "";
      keys.push(cur);
      const v = (k[2] ?? "").trim();
      if (/^[>|][+-]?$/.test(v)) {
        block = v[0] ?? ">";
        values[cur] = "";
      } else {
        block = null;
        values[cur] = unquote(v);
      }
    } else if (cur && line.trim()) {
      const piece = line.trim();
      values[cur] = values[cur] ? `${values[cur]}${block === "|" ? "\n" : " "}${piece}` : piece;
    }
  }
  return { keys, values, body: m[2] ?? "" };
}

/** Relative links and `references/…` mentions in a markdown file. */
function localLinks(md: string): string[] {
  const links = [...md.matchAll(/\]\(\s*<?([^)\s>#]+)[^)]*\)/g)].map((m) => m[1] ?? "");
  const mentions = [...md.matchAll(/(?:^|[\s`'"(])((?:\.\/)?references\/[\w./-]+\.md)/g)].map((m) => m[1] ?? "");
  // only things that look like files: "(report_url)" is a placeholder the model fills in
  return [...new Set([...links, ...mentions])].filter((l) => l && !/^(https?:|mailto:|#|\{\{)/.test(l) && (/\//.test(l) || /\.[a-z0-9]{1,5}$/i.test(l)));
}

// ---- docs / claims helpers ----

const NEGATION = /\b(not|no|never|cannot|can't|isn't|doesn't|don't|won't|without|nor|neither|instead of)\b|n't\b/i;
const OVERCLAIM = /\bguarantee[sd]?\b|\bpredicts? (the|your) (future|sales|revenue|outcome)|\baccurate(ly)? (forecast|predict)|\bwill (definitely|certainly|surely) (increase|grow|earn|make|bring)|\b100 ?% (accurate|certain)|\bknows? exactly\b/i;

function overclaims(text: string, where: string): string[] {
  const out: string[] = [];
  for (const sentence of text.replace(/<[^>]+>/g, " ").split(/(?<=[.!?])\s+|\n+/)) {
    if (OVERCLAIM.test(sentence) && !NEGATION.test(sentence)) out.push(`${where}: "${squash(sentence).slice(0, 110)}"`);
  }
  return out;
}

function gitFiles(root: string): string[] | null {
  const r = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout.split("\0").filter(Boolean).filter((f) => existsSync(join(root, f)));
}

function gitIgnored(root: string, path: string): boolean | null {
  const r = spawnSync("git", ["check-ignore", "-q", "--no-index", path], { cwd: root, windowsHide: true });
  return r.status === 0 ? true : r.status === 1 ? false : null;
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{32,}/, "OpenAI-style API key"],
  [/\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/, "GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bvercel_[A-Za-z0-9]{24,}\b/, "Vercel token"],
];

// ======================================================================
// the checks
// ======================================================================

/** The browser run is shared by every ui-* check. */
let uiMemo: Promise<UiResult[]> | null = null;
function ui(root: string): Promise<UiResult[]> {
  uiMemo ??= (async () => {
    let base: string;
    let demo: Awaited<ReturnType<typeof demoReport>>;
    try {
      base = (await devServer(root)).base;
      demo = await demoReport(root);
    } catch (e) {
      return UI_CHECKS.map((c) => ({ id: c.id, ok: false, detail: `cannot open the site: ${msg(e).split("\n")[0]}` }));
    }
    return runUiCheck({ root, base, token: demo.token, marker: demo.marker, shots: join(root, "qa/reports/ui") });
  })();
  return uiMemo;
}

/** The static report HTML for the demo (with rehearsal), rendered once. */
let renderedMemo: Promise<{ b: Bundle; report: ReportMod; html: string; styles: string }> | null = null;
function rendered(root: string) {
  renderedMemo ??= (async () => {
    const [b, report] = await Promise.all([bundle(root), reportMod(root)]);
    const html = report.renderReport({ analysis: b.a, plan: b.plan, ...(b.summary ? { rehearsal: b.summary } : {}), status: "final" });
    const styles = typeof report.reportStyles === "function" ? report.reportStyles() : "";
    try {
      const dir = join(root, "qa/reports/ui");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "report-static.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>What-IF demo report (static)</title><style>${styles}</style><main>${html}</main></html>`);
    } catch {
      /* the copy for judges is a convenience */
    }
    return { b, report, html, styles };
  })();
  return renderedMemo;
}
const needRehearsal = (b: Bundle) => (b.summary ? null : `the demo rehearsal could not run: ${b.simError ?? "unknown"}`);

export const CHECKS: CheckDef[] = [
  // ==================== engine ====================
  {
    id: "engine-typecheck",
    component: "engine",
    title: "src/engine and its tests type-check",
    command: "npx tsc --noEmit -p tsconfig.json",
    run: (root) => typecheckFor(root, ["src/engine/", "test/engine.test.ts"], "src/engine"),
  },
  {
    id: "engine-tests",
    component: "engine",
    title: "engine tests pass",
    critical: true,
    command: "node --import tsx --test test/engine.test.ts",
    timeoutMs: 300_000,
    run: (root) => nodeTest(root, ["test/engine.test.ts"]),
  },
  {
    id: "engine-api",
    component: "engine",
    title: "src/engine/index.ts exports the ARCHITECTURE.md API, with the observed keys per template",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const m = await load<Record<string, unknown>>(root, "src/engine/index.ts");
      const fns = ["checkInputs", "show", "getTemplate", "demoInputs", "analyze", "whatChanged", "planTest", "compareResult"];
      const problems = [
        ...fns.filter((n) => typeof m[n] !== "function").map((n) => `${n} is not an exported function`),
        ...["TEMPLATES", "DEMO_BUSINESS", "OBSERVED_FIELDS"].filter((n) => m[n] === undefined).map((n) => `${n} is not exported`),
      ];
      const obs = m.OBSERVED_FIELDS as Record<string, { key: string }[]> | undefined;
      const want: Record<string, string[]> = { lunch_offer: ["baseline_lunch_customers", "test_lunch_customers", "redemptions_per_day"], price_change: ["units_before_per_week", "units_after_per_week"] };
      if (obs)
        for (const [t, keys] of Object.entries(want)) {
          const have = (obs[t] ?? []).map((f) => f.key);
          const miss = keys.filter((k) => !have.includes(k));
          if (miss.length) problems.push(`OBSERVED_FIELDS.${t} lacks ${miss.join(", ")}`);
        }
      return verdict(problems, `all ${ENGINE_EXPORTS.length} exports present`);
    },
  },
  {
    id: "engine-break-even",
    component: "engine",
    title: "demo break-even holds: at the break-even net_test >= 0, one customer less < 0",
    critical: true,
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root);
      const raw = e.demoInputs("lunch_offer");
      const a = e.analyze("lunch_offer", raw, { demo: true });
      const be = a.breakEven;
      if (!be || typeof be.value !== "number" || !Number.isFinite(be.value)) return { ok: false, detail: `breakEven.value is not a number: ${JSON.stringify(be)?.slice(0, 200)}` };
      const problems: string[] = [];
      if (!be.reachable) problems.push("the demo break-even is marked unreachable");
      const key = a.sensitivity?.key && a.sensitivity.key in raw ? a.sensitivity.key : "extra_likely";
      const at = (x: number) => {
        const r: RawInputs = { ...raw, [key]: x };
        const lo = key.replace(/_likely$/, "_low"), hi = key.replace(/_likely$/, "_high");
        if (lo !== key && typeof raw[lo] === "number" && (raw[lo] as number) > x) r[lo] = x;
        if (hi !== key && typeof raw[hi] === "number" && (raw[hi] as number) < x) r[hi] = x;
        const s = e.analyze("lunch_offer", r, { demo: true }).scenarios.find((x) => x.id === "expected");
        if (!s) throw new Error("the analysis has no 'expected' scenario");
        return s.netTest;
      };
      const atBe = at(be.value);
      const below = at(be.value - 1);
      if (!(atBe >= 0)) problems.push(`${key} = ${be.value} (the break-even) gives net_test ${fmt(atBe)} < 0`);
      if (!(below < 0)) problems.push(`${key} = ${be.value - 1} (one less) gives net_test ${fmt(below)} >= 0`);
      const bx = a.sensitivity?.breakEvenX;
      if (typeof bx === "number" && Math.abs(bx - be.value) > 1) problems.push(`sensitivity.breakEvenX ${bx} disagrees with breakEven.value ${be.value}`);
      return verdict(problems, `break-even ${be.value} (${be.unit}): net_test ${fmt(atBe)} at ${be.value}, ${fmt(below)} at ${be.value - 1}`);
    },
  },
  {
    id: "engine-break-even-price",
    component: "engine",
    title: "price-change break-even agrees with the scenario maths (within €1)",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root);
      const raw = e.demoInputs("price_change");
      const a = e.analyze("price_change", raw, { demo: true });
      const s = a.sensitivity;
      if (!s || typeof s.breakEvenX !== "number") return { ok: false, detail: `no sensitivity.breakEvenX for the demo price change (breakEven: ${JSON.stringify(a.breakEven)?.slice(0, 160)})` };
      const key = s.key;
      const step = s.unit === "share" ? 0.01 : 1;
      const at = (x: number) => {
        const r: RawInputs = { ...raw, [key]: x };
        const lo = key.replace(/_likely$/, "_low"), hi = key.replace(/_likely$/, "_high");
        if (lo !== key && typeof raw[lo] === "number" && (raw[lo] as number) > x) r[lo] = x;
        if (hi !== key && typeof raw[hi] === "number" && (raw[hi] as number) < x) r[hi] = x;
        return e.analyze("price_change", r, { demo: true }).scenarios.find((x) => x.id === "expected")?.netTest ?? NaN;
      };
      const atBe = at(s.breakEvenX), below = at(s.breakEvenX - step);
      const problems: string[] = [];
      if (!(atBe >= -1)) problems.push(`${key} = ${s.breakEvenX} (break-even) gives net_test ${fmt(atBe)}`);
      if (!(below < 0)) problems.push(`${key} = ${fmt(s.breakEvenX - step)} (one step worse) gives net_test ${fmt(below)} >= 0`);
      return verdict(problems, `break-even ${key} = ${fmt(s.breakEvenX)}: net_test ${fmt(atBe)}, one step worse ${fmt(below)}`);
    },
  },
  {
    id: "engine-figures",
    component: "engine",
    title: "every Figure has a source tag and a non-empty 'show the maths' string with numbers in it; no NaN or undefined",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root);
      const problems: string[] = [];
      let n = 0;
      for (const t of ["lunch_offer", "price_change"]) {
        const a = e.analyze(t, e.demoInputs(t), { demo: true });
        if (a.scenarios.length !== 3) problems.push(`${t}: ${a.scenarios.length} scenarios (want cautious, expected, optimistic)`);
        const figs = [...a.current.map((f) => ["current", f] as const), ...a.scenarios.flatMap((s) => s.figures.map((f) => [s.id, f] as const))];
        if (!figs.length) problems.push(`${t}: no figures`);
        for (const [where, f] of figs) {
          n++;
          const id = `${t}/${where}/${f.id}`;
          if (typeof f.maths !== "string" || !f.maths.trim()) problems.push(`${id}: empty maths`);
          else if (!/\d/.test(f.maths)) problems.push(`${id}: maths has no numbers in it ("${f.maths.slice(0, 60)}")`);
          if (!SOURCES.includes(f.source)) problems.push(`${id}: source "${String(f.source)}" is not one of ${SOURCES.join(", ")}`);
          if (!Number.isFinite(f.value)) problems.push(`${id}: value ${f.value}`);
        }
        if (!a.breakEven?.maths?.trim()) problems.push(`${t}: breakEven has no maths`);
        if (!a.worstCase?.maths?.trim()) problems.push(`${t}: worstCase has no maths`);
        if ((a.sensitivity?.points?.length ?? 0) < 5) problems.push(`${t}: the slider series has ${a.sensitivity?.points?.length ?? 0} points (want >= 5)`);
        if (a.sensitivity?.points?.some((p) => !p.explanation?.trim())) problems.push(`${t}: a slider point has no explanation`);
        const leaks = JSON.stringify(a).match(/\bNaN\b|\bundefined\b|-?Infinity|\[object Object\]/g);
        if (leaks) problems.push(`${t}: the analysis text contains ${[...new Set(leaks)].join(", ")}`);
      }
      return verdict(problems.slice(0, 12), `${n} figures across 2 templates, each with maths and a source`);
    },
  },
  {
    id: "engine-deterministic",
    component: "engine",
    title: "analyze and planTest are deterministic (same inputs, same id and output); inputs are not mutated",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root, ["analyze", "planTest", "demoInputs"]);
      const problems: string[] = [];
      for (const t of ["lunch_offer", "price_change"]) {
        const raw = e.demoInputs(t);
        const before = JSON.stringify(raw);
        const a1 = e.analyze(t, raw, { demo: true });
        const a2 = e.analyze(t, { ...raw }, { demo: true });
        if (JSON.stringify(raw) !== before) problems.push(`${t}: analyze changed its input object`);
        if (a1.id !== a2.id) problems.push(`${t}: ids differ (${a1.id} / ${a2.id})`);
        const d = firstDiff(JSON.parse(stable(a1)), JSON.parse(stable(a2)));
        if (d) problems.push(`${t}: output differs at ${d}`);
        const firstNum = Object.entries(raw).find(([, v]) => typeof v === "number");
        if (firstNum) {
          const a3 = e.analyze(t, { ...raw, [firstNum[0]]: (firstNum[1] as number) * 1.1 }, { demo: true });
          if (a3.id === a1.id) problems.push(`${t}: changing ${firstNum[0]} keeps the same id`);
        }
        if (stable(e.planTest(a1)) !== stable(e.planTest(a2))) problems.push(`${t}: planTest differs between identical analyses`);
      }
      return verdict(problems, "identical inputs give identical analyses, ids and plans");
    },
  },
  {
    id: "engine-missing-input",
    component: "engine",
    title: "missing or odd inputs give one focused question or a plain problem, not a crash",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root, ["analyze", "checkInputs", "demoInputs"]);
      const problems: string[] = [];
      const raw: RawInputs = e.demoInputs("lunch_offer");
      delete raw.offer_price;
      try {
        e.analyze("lunch_offer", raw, { demo: true });
        problems.push("analyze did not throw without offer_price");
      } catch (err) {
        if (!/offer_price|price of the lunch deal|lunch deal/i.test(msg(err))) problems.push(`analyze's error does not name the missing field: "${msg(err).slice(0, 120)}"`);
      }
      const c = e.checkInputs("lunch_offer", raw);
      if (c.ready) problems.push("checkInputs says ready without offer_price");
      const miss = c.missing.find((m) => m.key === "offer_price");
      if (!miss) problems.push("checkInputs.missing does not list offer_price");
      else if (!miss.ask?.trim() || !miss.why?.trim()) problems.push("the missing field has no ask or why");
      const odd = e.checkInputs("lunch_offer", { ...e.demoInputs("lunch_offer"), avg_spend: 5000 });
      if (!odd.problems.length) problems.push("an average spend of €5,000 raises no problem");
      const cost = e.checkInputs("lunch_offer", { ...e.demoInputs("lunch_offer"), offer_cost: 12 });
      if (cost.ready) problems.push("a deal that costs more than its price is accepted as ready");
      return verdict(problems, `missing offer_price -> "${miss?.ask.slice(0, 70) ?? ""}…"; odd values -> plain problems`);
    },
  },
  {
    id: "engine-explain-plan-result",
    component: "engine",
    title: "whatChanged explains a moved guess; planTest gives a measurable test; compareResult gives a verdict",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root, ["analyze", "whatChanged", "planTest", "compareResult", "OBSERVED_FIELDS", "demoInputs"]);
      const problems: string[] = [];
      const a = e.analyze("lunch_offer", e.demoInputs("lunch_offer"), { demo: true });
      const b = e.analyze("lunch_offer", { ...e.demoInputs("lunch_offer"), extra_likely: 12, extra_high: 16 }, { demo: true });
      const w = e.whatChanged(a, b);
      if (!w.changes?.some((c) => c.key === "extra_likely")) problems.push("whatChanged does not list extra_likely as changed");
      if (!w.effects?.length) problems.push("whatChanged lists no effects");
      if (!w.plain?.length || (w.plain[0] ?? "").length < 20) problems.push("whatChanged has no plain explanation");
      const same = e.whatChanged(a, a);
      if (same.changes?.length) problems.push("whatChanged(a, a) reports changes");
      for (const t of ["lunch_offer", "price_change"]) {
        const x = e.analyze(t, e.demoInputs(t), { demo: true });
        const p = e.planTest(x);
        if (!(p.days > 0)) problems.push(`${t}: test plan has ${p.days} days`);
        if (!p.measure?.length) problems.push(`${t}: test plan measures nothing`);
        if (!p.decisionRule?.keep?.trim() || !p.decisionRule?.tweak?.trim() || !p.decisionRule?.stop?.trim()) problems.push(`${t}: test plan lacks a keep/tweak/stop rule`);
        if (!p.costCap?.trim()) problems.push(`${t}: test plan has no cost cap`);
        const guess: Record<string, number> = { baseline_lunch_customers: 38, test_lunch_customers: 44, redemptions_per_day: 14, days_run: 10, actual_setup_cost: 180, units_before_per_week: 620, units_after_per_week: 600 };
        const observed = Object.fromEntries((e.OBSERVED_FIELDS[t] ?? []).map((f) => [f.key, guess[f.key] ?? 10]));
        const r = e.compareResult(x, observed);
        if (!["keep", "tweak", "stop"].includes(r.verdict)) problems.push(`${t}: verdict "${r.verdict}"`);
        if (!r.plain?.trim() || !r.learned?.length) problems.push(`${t}: the result says nothing learned`);
      }
      return verdict(problems, `"${(w.plain?.[0] ?? "").slice(0, 90)}…"; plans and verdicts for both templates`);
    },
  },
  {
    id: "engine-browser-safe",
    component: "engine",
    title: "src/engine uses no Node APIs (it runs in the report page)",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: (root) => browserSafe(root, ["src/engine"]),
  },

  // ==================== rehearsal ====================
  {
    id: "sim-typecheck",
    component: "rehearsal",
    title: "src/sim and its tests type-check",
    command: "npx tsc --noEmit -p tsconfig.json",
    run: (root) => typecheckFor(root, ["src/sim/", "test/sim.test.ts"], "src/sim"),
  },
  {
    id: "sim-tests",
    component: "rehearsal",
    title: "rehearsal tests pass",
    critical: true,
    command: "node --import tsx --test test/sim.test.ts",
    timeoutMs: 300_000,
    run: (root) => nodeTest(root, ["test/sim.test.ts", "test/rehearsal.test.ts"]),
  },
  {
    id: "sim-full-run",
    component: "rehearsal",
    title: "a rule-based rehearsal runs to done: 6 personas x 4 rounds by default, one reaction per active persona per round, sizes clamped",
    critical: true,
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root);
      const a = demoAnalysis(e);
      const r0 = sim.startRehearsal(a);
      const problems: string[] = [];
      if (r0.personas.length !== 6) problems.push(`${r0.personas.length} personas by default (want 6)`);
      if (r0.rounds.length !== 4) problems.push(`${r0.rounds.length} rounds by default (want 4)`);
      if (r0.status !== "running" || r0.currentRound !== 1) problems.push(`starts as ${r0.status} at round ${r0.currentRound}`);
      const b1 = sim.roundBriefs(r0);
      const act1 = r0.active[1] ?? [];
      if (b1.length !== act1.length) problems.push(`round 1 has ${b1.length} briefs for ${act1.length} active personas`);
      let r = r0;
      const perRound: string[] = [];
      for (let i = 0; i < 8 && r.status !== "done"; i++) {
        const round = r.currentRound;
        const reactions = sim.ruleBasedReactions(r);
        const out = sim.submitRound(r, reactions, "rule-based");
        if (out.errors.length) {
          problems.push(`round ${round}: the stand-in's reactions were rejected (${out.errors.map((x) => x.error).join("; ").slice(0, 160)})`);
          break;
        }
        if (!out.done && !out.next.length && (out.rehearsal.active[out.rehearsal.currentRound] ?? []).length) problems.push(`round ${round}: no briefs for the next round`);
        perRound.push(`R${round}:${reactions.length}`);
        r = out.rehearsal;
      }
      if (r.status !== "done") problems.push(`not done (round ${r.currentRound} of ${r.rounds.length})`);
      else if (r.currentRound !== r.rounds.length + 1) problems.push(`done but currentRound is ${r.currentRound} (want ${r.rounds.length + 1})`);
      for (const spec of r.rounds)
        for (const pid of r.active[spec.n] ?? []) {
          const n = r.reactions.filter((x) => x.round === spec.n && x.personaId === pid).length;
          if (n !== 1) problems.push(`round ${spec.n}: ${pid} has ${n} reactions`);
        }
      if (r.status === "done" && sim.summarize(r).status !== "done") problems.push("the summary of a finished rehearsal is not done");
      for (const [p, k] of [[4, 3], [12, 5]] as const) {
        const x = sim.startRehearsal(a, { personas: p, rounds: k });
        if (x.personas.length !== p || x.rounds.length !== k) problems.push(`asked for ${p} personas / ${k} rounds, got ${x.personas.length} / ${x.rounds.length}`);
      }
      try {
        const big = sim.startRehearsal(a, { personas: 50, rounds: 20 });
        if (big.personas.length > 12 || big.rounds.length > 5) problems.push(`50 personas / 20 rounds were not limited (got ${big.personas.length} / ${big.rounds.length})`);
      } catch {
        /* refusing is fine too */
      }
      return verdict(problems.slice(0, 10), `done in ${r.rounds.length} rounds; reactions ${perRound.join(" ")}`);
    },
  },
  {
    id: "sim-personas",
    component: "rehearsal",
    title: "personas are distinct two-layer characters (card + 60-200-word story) across at least 4 segments",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root);
      const r = sim.startRehearsal(demoAnalysis(e));
      const problems: string[] = [];
      const names = new Set(r.personas.map((p) => p.name));
      if (names.size !== r.personas.length) problems.push("two personas share a name");
      const segs = new Set(r.personas.map((p) => p.segment));
      if (segs.size < 4) problems.push(`only ${segs.size} segments among ${r.personas.length} personas`);
      const attitudes = new Set(r.personas.map((p) => p.attitude));
      if (attitudes.size < 2) problems.push("every persona has the same attitude (no sceptics or fans)");
      for (const p of r.personas) {
        const words = (p.story ?? "").split(/\s+/).filter(Boolean).length;
        if (words < 60 || words > 200) problems.push(`${p.name}: story has ${words} words`);
        if (!(p.activityLevel >= 0 && p.activityLevel <= 1)) problems.push(`${p.name}: activityLevel ${p.activityLevel}`);
        if (!(p.usualSpend > 0)) problems.push(`${p.name}: usualSpend ${p.usualSpend}`);
        for (const k of ["routine", "alternatives", "quirk", "represents"] as const) if (!String(p[k] ?? "").trim()) problems.push(`${p.name}: no ${k}`);
      }
      for (const spec of r.rounds) {
        if (!spec.actions.some((x) => !x.positive && !x.public)) problems.push(`round ${spec.n} has no do-nothing action`);
        if (spec.actions.length < 3 || spec.actions.length > 7) problems.push(`round ${spec.n} offers ${spec.actions.length} actions (want 4-6)`);
      }
      return verdict(problems.slice(0, 10), `${r.personas.length} personas: ${r.personas.map((p) => `${p.name} (${p.segmentLabel})`).join(", ")}`);
    },
  },
  {
    id: "sim-briefs-private",
    component: "rehearsal",
    title: "persona briefs carry the JSON answer schema and none of the owner's cost numbers",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root, ["startRehearsal", "roundBriefs", "submitRound", "ruleBasedReactions", "interviewBriefs"]);
      // distinctive owner numbers, so a match is a leak and not a coincidence
      const canary: RawInputs = { monthly_fixed_costs: 23456, cash_buffer: 4321, offer_cost: 3.17, setup_cost: 247.31, extra_staff_cost_per_day: 19.37, variable_cost_share: 0.291, marketing_per_week: 27.13 };
      const leaks = [/23[.,\s]?456/, /\b4[.,\s]?321\b/, /\b3[.,]17\b/, /\b247[.,]31\b/, /\b19[.,]37\b/, /\b29[.,]1\s?%|\b0[.,]291\b/, /\b27[.,]13\b/];
      const a = e.analyze("lunch_offer", { ...e.demoInputs("lunch_offer"), ...canary }, { demo: false, business: "Café QA" });
      let r = sim.startRehearsal(a, { seed: 9 });
      const briefs: PersonaBrief[] = [];
      for (let i = 0; i < 8 && r.status !== "done"; i++) {
        briefs.push(...sim.roundBriefs(r));
        r = playRound(sim, r);
      }
      briefs.push(...sim.interviewBriefs(r, "What would make you come back for lunch?"));
      const problems: string[] = [];
      if (!briefs.length) problems.push("no briefs");
      for (const b of briefs) {
        const p = b.prompt ?? "";
        const id = `${b.name ?? b.personaId} R${b.round}`;
        if (!/json/i.test(p)) problems.push(`${id}: the prompt does not ask for JSON`);
        if (b.allowedActions?.length) {
          if (!/"?action"?/.test(p) || !/"?thought"?/.test(p)) problems.push(`${id}: the prompt does not show the action/thought fields`);
          const absent = b.allowedActions.filter((x) => !p.includes(x));
          if (absent.length) problems.push(`${id}: allowed actions not in the prompt: ${absent.join(", ")}`);
        }
        const hit = leaks.find((re) => re.test(p));
        if (hit) problems.push(`${id}: the prompt leaks an owner number (${hit.source}: "${p.slice(Math.max(0, (hit.exec(p)?.index ?? 0) - 30), (hit.exec(p)?.index ?? 0) + 30)}")`);
        if (p.length > 12_000) problems.push(`${id}: the prompt is ${p.length} chars (keep briefs short)`);
      }
      const avg = briefs.length ? Math.round(briefs.reduce((s, b) => s + (b.prompt?.length ?? 0), 0) / briefs.length) : 0;
      return verdict([...new Set(problems)].slice(0, 10), `${briefs.length} briefs (incl. interview), avg ${avg} chars, schema present, no owner cost numbers`);
    },
  },
  {
    id: "sim-rebuild",
    component: "rehearsal",
    title: "rebuildRehearsal from the encoded ShareState reproduces the summary exactly (with an owner event)",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root, [...SIM_EXPORTS]);
      const st = await stateMod(root);
      const raw = e.demoInputs("lunch_offer");
      const a = e.analyze("lunch_offer", raw, { demo: true });
      let r = sim.startRehearsal(a, { seed: 7 });
      r = playRound(sim, r);
      r = sim.injectEvent(r, "It rains all week.");
      r = playAll(sim, r);
      const share: ShareState = { v: 1, template: "lunch_offer", inputs: raw, demo: true, rehearsal: toShare(r) };
      const token = st.encodeState(share);
      const back = st.decodeState(token);
      const a2 = e.analyze(back.template, back.inputs, { demo: back.demo });
      const rebuilt = sim.rebuildRehearsal(a2, back.rehearsal!);
      const d = firstDiff(JSON.parse(stable(sim.summarize(rebuilt))), JSON.parse(stable(sim.summarize(r))));
      const problems = d ? [`the rebuilt summary differs at ${d}`] : [];
      if (!rebuilt.events.some((x) => /rains/.test(x.text))) problems.push("the owner's event was lost in the rebuild");
      return verdict(problems, `identical summary after encode -> decode -> rebuild (token ${token.length} chars)`);
    },
  },
  {
    id: "sim-validation",
    component: "rehearsal",
    title: "submitRound rejects unknown actions, missing or over-long text, unknown personas and garbage, and waits for the retry",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root);
      const r = sim.startRehearsal(demoAnalysis(e), { seed: 5 });
      const good = sim.ruleBasedReactions(r).filter((x) => (r.active[1] ?? []).includes(x.personaId));
      const first = good[0];
      if (!first) return { ok: false, detail: "nobody is active in round 1" };
      const problems: string[] = [];
      const tryBad = (label: string, bad: unknown) => {
        let out: SubmitOutcome;
        try {
          out = sim.submitRound(r, [bad, ...good.slice(1)], "in-context");
        } catch (err) {
          problems.push(`${label}: threw instead of returning an error (${msg(err).slice(0, 80)})`);
          return;
        }
        if (!out.errors.length) problems.push(`${label}: accepted`);
        if (out.rehearsal.currentRound !== 1) problems.push(`${label}: the round advanced anyway`);
        return out;
      };
      tryBad("unknown action", { ...first, action: "teleport_to_mars" });
      const { thought: _t, ...noThought } = first;
      tryBad("missing thought", noThought);
      tryBad("over-long thought", { ...first, thought: "word ".repeat(1500) });
      tryBad("not an object", "I love it!");
      try {
        const out = sim.submitRound(r, [{ ...first, personaId: "nobody-here" }], "in-context");
        if (!out.errors.length) problems.push("unknown persona: accepted silently");
      } catch (err) {
        problems.push(`unknown persona: threw (${msg(err).slice(0, 80)})`);
      }
      // a partial batch waits; the retry of the missing persona completes the round
      const out = tryBad("partial batch", { ...first, action: "teleport_to_mars" });
      if (out && !out.errors.some((x) => x.personaId === first.personaId)) problems.push("the error does not name the persona to retry");
      if (out) {
        const retry = sim.submitRound(out.rehearsal, [first], "in-context");
        if (retry.errors.length) problems.push(`the retry was rejected: ${retry.errors.map((x) => x.error).join("; ").slice(0, 100)}`);
        else if (retry.rehearsal.currentRound !== 2) problems.push(`after the retry the round is ${retry.rehearsal.currentRound} (want 2)`);
      }
      return verdict(problems, "bad reactions rejected with retryable errors; the retry completes the round");
    },
  },
  {
    id: "sim-deterministic",
    component: "rehearsal",
    title: "same analysis and options give the same personas, activation and rule-based reactions",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root);
      const a = demoAnalysis(e);
      const r1 = playAll(sim, sim.startRehearsal(a, { seed: 3 }));
      const r2 = playAll(sim, sim.startRehearsal(a, { seed: 3 }));
      const d = firstDiff(JSON.parse(stable(r1)), JSON.parse(stable(r2)));
      const r3 = playAll(sim, sim.startRehearsal(a, { seed: 4 }));
      const differs = stable({ p: r3.personas, a: r3.active, x: r3.reactions }) !== stable({ p: r1.personas, a: r1.active, x: r1.reactions });
      return verdict(d ? [`two runs with seed 3 differ at ${d}`] : [], `seed 3 twice: identical; seed 4: ${differs ? "different" : "the same (seed has no effect?)"}`);
    },
  },
  {
    id: "sim-honest-summary",
    component: "rehearsal",
    title: "the summary is descriptive and honest: caveat present, counts never scaled up, quotes attributed, real-customer questions, analysis untouched",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root);
      const a = demoAnalysis(e);
      const before = stable(a);
      const r = playAll(sim, sim.startRehearsal(a, { seed: 11 }));
      const s = sim.summarize(r);
      const problems: string[] = [];
      if (stable(a) !== before) problems.push("running the rehearsal changed the analysis (it must never feed the maths)");
      if (!s.caveat || s.caveat.length < 40 || !/imagin/i.test(s.caveat) || !NEGATION.test(s.caveat)) problems.push(`weak caveat: "${s.caveat ?? ""}"`);
      const ids = new Set(r.personas.map((p) => p.id));
      for (const f of s.funnel ?? []) if (f.of > r.personas.length || f.count > f.of) problems.push(`funnel "${f.label}": ${f.count} of ${f.of} with ${r.personas.length} personas`);
      for (const q of s.quotes ?? []) if (!ids.has(q.personaId) || !q.name) problems.push(`a quote is not attributed to a persona (${q.personaId})`);
      if (!s.checkWithRealCustomers?.length) problems.push("no questions to check with real customers");
      if ((s.uptake ?? []).some((u) => u.engaged > u.active)) problems.push("uptake counts more engaged than active people");
      if (!s.grid?.length || s.grid.some((g) => !g.actionLabel)) problems.push("the timeline grid is empty or has unlabelled cells");
      return verdict(problems, `caveat "${(s.caveat ?? "").slice(0, 80)}…"; ${s.checkWithRealCustomers?.length ?? 0} questions for real customers`);
    },
  },
  {
    id: "sim-browser-safe",
    component: "rehearsal",
    title: "src/sim uses no Node APIs (it runs in the report page)",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: (root) => browserSafe(root, ["src/sim"]),
  },

  // ==================== mcp ====================
  {
    id: "mcp-typecheck",
    component: "mcp",
    title: "src/mcp, src/state.ts and the MCP tests type-check",
    command: "npx tsc --noEmit -p tsconfig.json",
    run: (root) => typecheckFor(root, ["src/mcp/", "src/state.ts", "test/mcp.test.ts"], "src/mcp + src/state.ts"),
  },
  {
    id: "mcp-tests",
    component: "mcp",
    title: "MCP tests pass",
    critical: true,
    command: "node --import tsx --test test/mcp.test.ts",
    timeoutMs: 300_000,
    run: (root) => nodeTest(root, ["test/mcp.test.ts"]),
  },
  {
    id: "mcp-state",
    component: "mcp",
    title: "ShareState round-trips, report links use the URL fragment, damaged tokens give a plain error, links stay short",
    command: "node --import tsx qa/run.ts --no-loop --only mcp",
    run: async (root) => {
      const st = await stateMod(root);
      const problems: string[] = [];
      const demo = await demoReport(root);
      const s = demo.share;
      const back = st.decodeState(st.encodeState(s));
      const d = firstDiff(back, s);
      if (d) problems.push(`decode(encode(s)) differs at ${d}`);
      const url = st.reportUrl("https://what-if.example/", s);
      if (!url.startsWith("https://what-if.example/r#")) problems.push(`reportUrl gives ${url.slice(0, 40)}… (want <site>/r#<token>)`);
      for (const bad of ["@@not-a-token@@", demo.token.slice(0, Math.floor(demo.token.length / 2))]) {
        try {
          st.decodeState(bad);
          problems.push(`decodeState accepted a damaged token (${bad.slice(0, 12)}…)`);
        } catch (err) {
          if (!(err instanceof Error) || /\n\s*at\s|SyntaxError|Unexpected (token|end)|invalid (block|distance|stored|length)|unexpected EOF/i.test(err.message)) problems.push(`damaged token: unfriendly error "${msg(err).slice(0, 80)}"`);
        }
      }
      if (demo.token.length > 16_000) problems.push(`the demo link with its rehearsal is ${demo.token.length} chars (chat apps cut long links)`);
      const safe = browserSafe(root, ["src/state.ts"]);
      if (!safe.ok) problems.push(safe.detail);
      return verdict(problems, `round-trip ok; demo link token ${demo.token.length} chars${s.rehearsal ? " with rehearsal" : " (no rehearsal yet)"}`);
    },
  },
  {
    id: "build",
    component: "mcp",
    title: "npm run build succeeds and writes .vercel/output",
    critical: true,
    command: "npm run build",
    timeoutMs: 600_000,
    run: (root) => {
      if (!existsSync(join(root, "scripts/build.mjs"))) return { ok: false, detail: "scripts/build.mjs does not exist yet" };
      const r = npm("npm run build", root, 10 * 60_000);
      const ok = r.code === 0 && existsSync(join(root, ".vercel/output/config.json"));
      builtThisRun = ok;
      return { ok, detail: ok ? "built .vercel/output" : `exit ${r.code}${r.code === 0 ? ", but .vercel/output/config.json is missing" : ""}\n${tail(r.out, 1200)}` };
    },
  },
  {
    id: "build-function",
    component: "mcp",
    title: "the Vercel function is complete (config v3, .vc-config.json, index.mjs), self-contained, and answers initialize + tools/list",
    command: "npm run build && node --import tsx qa/run.ts --no-loop --only mcp",
    run: async (root) => {
      const out = join(root, ".vercel/output");
      if (!existsSync(out)) return { ok: false, detail: ".vercel/output does not exist (run npm run build)" };
      const problems: string[] = [];
      const cfg = readJson<{ version?: number }>(join(out, "config.json"));
      if (cfg?.version !== 3) problems.push(`config.json version is ${cfg?.version ?? "missing"} (want 3)`);
      const func = join(out, "functions/api/mcp.func");
      const vc = readJson<{ runtime?: string; handler?: string; launcherType?: string }>(join(func, ".vc-config.json"));
      if (!vc) problems.push("functions/api/mcp.func/.vc-config.json is missing or not JSON");
      else {
        if (!/^nodejs\d+\.x$/.test(vc.runtime ?? "")) problems.push(`.vc-config.json runtime "${vc.runtime}" (want nodejs22.x or similar)`);
        if (!vc.handler) problems.push(".vc-config.json has no handler");
        if (vc.launcherType && vc.launcherType !== "Nodejs") problems.push(`launcherType "${vc.launcherType}"`);
      }
      const index = join(func, "index.mjs");
      if (!existsSync(index)) problems.push("functions/api/mcp.func/index.mjs is missing");
      const handlerName = vc?.handler ?? "index.mjs";
      let info = "";
      if (existsSync(join(func, handlerName))) {
        // Import a copy that lives outside the repo, so the repo's node_modules cannot
        // stand in for packages the bundle forgot (on Vercel only mcp.func/ exists).
        const isolated = mkdtempSync(join(tmpdir(), "what-if-qa-func-"));
        try {
          cpSync(func, isolated, { recursive: true });
          const smoke = await smokeFunction(join(isolated, handlerName), architectureTools(root));
          problems.push(...smoke.problems);
          info = smoke.info;
        } catch (err) {
          const m = msg(err).split("\n")[0] ?? "";
          problems.push(/Cannot find (package|module)/.test(m) ? `the function is not self-contained (Vercel ships only mcp.func/): ${m.replace(isolated, "<mcp.func>")}` : `the bundled function failed: ${m}`);
        } finally {
          rmSync(isolated, { recursive: true, force: true });
        }
      }
      return verdict(problems, `config v3, ${vc?.runtime}, ${info}`);
    },
  },
  {
    id: "mcp-live-initialize",
    component: "mcp",
    title: "the dev server's /api/mcp answers initialize: server what-if, tools capability, instructions about \"what if\"",
    critical: true,
    command: "node scripts/dev.mjs  (then POST initialize to http://localhost:3000/api/mcp)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const r = s.init;
      const problems: string[] = [];
      if (r?.serverInfo?.name !== "what-if") problems.push(`serverInfo.name is "${r?.serverInfo?.name}" (want what-if)`);
      if (!r?.capabilities?.tools) problems.push("no tools capability");
      if (!/what[- ]if/i.test(String(r?.instructions ?? ""))) problems.push("the server instructions do not mention \"what if\"");
      return verdict(problems, `${s.url.replace(/^http:\/\/[^/]+/, "")}: ${r?.serverInfo?.name} ${r?.serverInfo?.version ?? ""}, protocol ${r?.protocolVersion}, instructions ${String(r?.instructions ?? "").length} chars`);
    },
  },
  {
    id: "mcp-live-tools",
    component: "mcp",
    title: "tools/list has every ARCHITECTURE.md tool with a description and an object schema; whatif_start says \"what if\"; the what-if prompt is listed",
    critical: true,
    command: "node scripts/dev.mjs  (then POST tools/list to /api/mcp)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const expected = architectureTools(root);
      const list = await s.call("tools/list", {}, 2);
      const tools = (list.body?.result?.tools ?? []) as Json[];
      const names = tools.map((t) => String(t?.name));
      const problems: string[] = [];
      const missing = expected.filter((n) => !names.includes(n));
      if (missing.length) problems.push(`missing tools: ${missing.join(", ")}`);
      for (const t of tools) {
        if (String(t?.description ?? "").length < 20) problems.push(`${t?.name}: description too short`);
        if (t?.inputSchema?.type !== "object") problems.push(`${t?.name}: inputSchema is not an object schema`);
      }
      const start = tools.find((t) => t?.name === "whatif_start");
      if (start && !/what[- ]if/i.test(String(start.description ?? ""))) problems.push("whatif_start's description does not mention \"what if\"");
      const prompts = await s.call("prompts/list", {}, 3);
      const pnames = ((prompts.body?.result?.prompts ?? []) as Json[]).map((p) => String(p?.name));
      if (!pnames.includes("what-if")) problems.push(`no "what-if" prompt (prompts: ${pnames.join(", ") || "none"})`);
      const extra = names.filter((n) => !expected.includes(n));
      return verdict(problems.slice(0, 10), `${names.length} tools${extra.length ? ` (+ not in ARCHITECTURE.md: ${extra.join(", ")})` : ""}; prompt what-if listed`);
    },
  },
  {
    id: "mcp-live-run-scenarios",
    component: "mcp",
    title: "whatif_run_scenarios over HTTP: plain text first, structuredContent, and a report_url /r#<token> that decodes to the inputs",
    command: "node scripts/dev.mjs  (then tools/call whatif_run_scenarios with the demo inputs)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const t = await templates(root);
      const inputs = t.demoInputs("lunch_offer");
      const res = await toolCall(s, "whatif_run_scenarios", { template: "lunch_offer", inputs, demo: true, business: t.DEMO_BUSINESS, question: question(t, "lunch_offer") }, 10);
      const problems: string[] = [];
      if (res.isError) return { ok: false, detail: `the tool returned an error: ${toolText(res).slice(0, 300)}` };
      const first = res.content?.[0];
      if (first?.type !== "text" || !String(first.text ?? "").trim()) problems.push("the first content block is not plain text");
      if (!res.structuredContent || typeof res.structuredContent !== "object") problems.push("no structuredContent");
      const url = findReportUrl(res);
      if (!url) problems.push("no report_url");
      else if (!url.includes("/r#")) problems.push(`report_url is not a /r#<token> link: ${url.slice(0, 60)}`);
      else {
        const st = await stateMod(root);
        try {
          const back = st.decodeState(url.slice(url.indexOf("#") + 1));
          if (back.template !== "lunch_offer" || Number(back.inputs.offer_price) !== Number(inputs.offer_price)) problems.push("the report token does not carry the inputs");
        } catch (err) {
          problems.push(`the report token does not decode: ${msg(err)}`);
        }
      }
      if (!/break[- ]?even/i.test(toolText(res))) problems.push("the text block does not mention the break-even");
      return verdict(problems, `text first, structuredContent, report_url ${url?.replace(/#.*/, "#…")} (${url?.length ?? 0} chars)`);
    },
  },
  {
    id: "mcp-live-rehearsal",
    component: "mcp",
    title: "stateless rehearsal over HTTP: start gives briefs and a state token, submit accepts one reaction per brief, autoplay finishes",
    command: "node scripts/dev.mjs  (then whatif_rehearsal_start -> _submit -> _autoplay)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const t = await templates(root);
      const inputs = t.demoInputs("lunch_offer");
      const problems: string[] = [];
      const start = await toolCall(s, "whatif_rehearsal_start", { template: "lunch_offer", inputs, demo: true }, 20);
      if (start.isError) return { ok: false, detail: `whatif_rehearsal_start failed: ${toolText(start).slice(0, 300)}` };
      const state1 = start.structuredContent?.state;
      const briefs = findBriefs(start.structuredContent);
      if (typeof state1 !== "string" || !state1) return { ok: false, detail: "whatif_rehearsal_start returned no state token" };
      if (!briefs.length) return { ok: false, detail: "whatif_rehearsal_start returned no persona briefs" };
      const reactions = briefs.map((b) => ({ personaId: b.personaId, round: b.round ?? 1, action: b.allowedActions?.[0] ?? "", thought: "I would try it once to see what is in the deal.", diary: "Read about the new lunch deal." }));
      const sub = await toolCall(s, "whatif_rehearsal_submit", { state: state1, reactions, method: "in-context" }, 21);
      const errs = (sub.structuredContent?.errors ?? []) as Json[];
      if (sub.isError || errs.length) problems.push(`submit rejected valid reactions: ${(errs.length ? JSON.stringify(errs) : toolText(sub)).slice(0, 200)}`);
      const state2 = sub.structuredContent?.state;
      if (typeof state2 !== "string" || state2 === state1) problems.push("submit returned no new state");
      const auto = await toolCall(s, "whatif_rehearsal_autoplay", { state: typeof state2 === "string" ? state2 : state1 }, 22);
      if (auto.isError) problems.push(`autoplay failed: ${toolText(auto).slice(0, 200)}`);
      if (!/"status":"done"|"done":true/.test(JSON.stringify(auto.structuredContent ?? {}))) problems.push("autoplay did not report the rehearsal as done");
      const url = findReportUrl(auto);
      let n = 0;
      if (!url) problems.push("autoplay returned no report_url");
      else {
        const back = (await stateMod(root)).decodeState(url.slice(url.indexOf("#") + 1));
        n = back.rehearsal?.reactions.length ?? 0;
        if (n <= reactions.length) problems.push(`the report link holds ${n} reactions after the whole rehearsal`);
      }
      return verdict(problems, `${briefs.length} briefs in round 1, submit accepted, autoplay done; report link holds ${n} reactions`);
    },
  },
  {
    id: "mcp-live-errors",
    component: "mcp",
    title: "bad calls get helpful answers, never a 500: a missing input names what to ask, an unknown template lists the real ones, bad JSON and huge bodies are refused",
    command: "node scripts/dev.mjs  (then call whatif_run_scenarios without offer_price)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const t = await templates(root);
      const problems: string[] = [];
      const inputs: RawInputs = t.demoInputs("lunch_offer");
      delete inputs.offer_price;
      const r1 = await s.call("tools/call", { name: "whatif_run_scenarios", arguments: { template: "lunch_offer", inputs } }, 30);
      const say1 = r1.body?.result ? toolText(r1.body.result) : (r1.body?.error?.message ?? "");
      if (r1.status >= 500) problems.push(`missing input: HTTP ${r1.status}`);
      else if (!/price|offer_price/i.test(say1)) problems.push(`missing input: the answer does not say what to ask ("${say1.slice(0, 120)}")`);
      const r2 = await s.call("tools/call", { name: "whatif_run_scenarios", arguments: { template: "open_a_zoo", inputs: {} } }, 31);
      const say2 = r2.body?.result ? toolText(r2.body.result) : (r2.body?.error?.message ?? "");
      if (r2.status >= 500) problems.push(`unknown template: HTTP ${r2.status}`);
      else if (!/lunch_offer/.test(say2)) problems.push(`unknown template: the answer does not list the templates ("${say2.slice(0, 120)}")`);
      const r3 = await fetch(s.url, { method: "POST", headers: { ...RPC_HEADERS, ...s.headers }, body: "{not json", signal: AbortSignal.timeout(15_000) });
      if (r3.status >= 500 || r3.status < 400) problems.push(`malformed JSON: HTTP ${r3.status} (want 400)`);
      const huge = JSON.stringify({ jsonrpc: "2.0", id: 32, method: "tools/call", params: { name: "whatif_start", arguments: { question: `What if ${"x".repeat(2_000_000)}` } } });
      const r4 = await fetch(s.url, { method: "POST", headers: { ...RPC_HEADERS, ...s.headers }, body: huge, signal: AbortSignal.timeout(20_000) }).catch((err: unknown) => ({ status: 0, err }) as const);
      const r4body = "text" in r4 ? await readRpc(r4, 32) : null;
      if (r4.status >= 500 || r4.status === 0) problems.push(`a 2 MB request: ${r4.status === 0 ? "no answer" : `HTTP ${r4.status}`}`);
      else if (r4.status < 400 && r4body?.body?.result && !r4body.body.result.isError) problems.push("a 2 MB question was accepted (no payload limit)");
      return verdict(problems, `missing input -> "${say1.replace(/\s+/g, " ").slice(0, 70)}…"; unknown template, bad JSON and 2 MB bodies refused`);
    },
  },
  {
    id: "mcp-live-cors",
    component: "mcp",
    title: "CORS for browser-based MCP clients (preflight and POST)",
    command: "curl -i -X OPTIONS http://localhost:3000/api/mcp -H \"Origin: https://claude.ai\" -H \"Access-Control-Request-Method: POST\"",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const pre = await fetch(s.url, { method: "OPTIONS", headers: { origin: "https://claude.ai", "access-control-request-method": "POST", "access-control-request-headers": "content-type, mcp-protocol-version, mcp-session-id" }, signal: AbortSignal.timeout(10_000) });
      const h = (n: string) => (pre.headers.get(n) ?? "").toLowerCase();
      const problems: string[] = [];
      if (pre.status !== 200 && pre.status !== 204) problems.push(`OPTIONS answered HTTP ${pre.status}`);
      if (!["*", "https://claude.ai"].includes(h("access-control-allow-origin"))) problems.push(`allow-origin "${h("access-control-allow-origin")}"`);
      if (!/post|\*/.test(h("access-control-allow-methods"))) problems.push(`allow-methods "${h("access-control-allow-methods")}" lacks POST`);
      const ah = h("access-control-allow-headers");
      if (ah !== "*" && !(ah.includes("content-type") && ah.includes("mcp-protocol-version"))) problems.push(`allow-headers "${ah}" lacks content-type or mcp-protocol-version`);
      const post = await rpc(s.url, "tools/list", {}, 40, { ...s.headers, origin: "https://claude.ai" });
      if (!post.headers.get("access-control-allow-origin")) problems.push("the POST answer has no access-control-allow-origin");
      return verdict(problems, `preflight ${pre.status}; allow-origin ${h("access-control-allow-origin")}; methods ${h("access-control-allow-methods")}`);
    },
  },
  {
    id: "mcp-live-get-info",
    component: "mcp",
    title: "a browser GET on /api/mcp gets a friendly page that says what this is and how to connect",
    command: "curl -i http://localhost:3000/api/mcp -H \"Accept: text/html\"",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const res = await fetch(s.url, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      const problems: string[] = [];
      if (res.status !== 200) problems.push(`HTTP ${res.status}`);
      if (!/what[- ]if/i.test(text)) problems.push("does not say it is What-IF");
      if (!/\/api\/mcp/.test(text)) problems.push("does not show the URL to paste");
      return verdict(problems, `HTTP 200, ${text.length} chars`);
    },
  },
  {
    id: "mcp-stdio",
    component: "mcp",
    title: "the stdio server answers initialize and lists the same tools",
    command: "node --import tsx src/mcp/stdio.ts",
    timeoutMs: 60_000,
    run: async (root) => {
      if (!existsSync(join(root, "src/mcp/stdio.ts"))) return { ok: false, detail: "src/mcp/stdio.ts does not exist yet" };
      const child = spawn(process.execPath, ["--import", "tsx", "src/mcp/stdio.ts"], { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } });
      let buf = "";
      let errText = "";
      const waiting = new Map<number, (m: Json) => void>();
      child.stdout.on("data", (d: Buffer) => {
        buf += String(d);
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          try {
            const m = JSON.parse(line) as Json;
            if (typeof m?.id === "number") waiting.get(m.id)?.(m);
          } catch {
            /* a log line on stdout */
          }
        }
      });
      child.stderr.on("data", (d: Buffer) => (errText += String(d)));
      const ask = (id: number, method: string, params: unknown) =>
        new Promise<Json>((resolveAsk, reject) => {
          const timer = setTimeout(() => reject(new Error(`no answer to ${method} within 20 s${errText ? `: ${tail(errText, 300)}` : ""}`)), 20_000);
          waiting.set(id, (m) => {
            clearTimeout(timer);
            resolveAsk(m);
          });
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        });
      try {
        const init = await ask(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "what-if-qa", version: "1.0.0" } });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
        const list = await ask(2, "tools/list", {});
        const names = ((list?.result?.tools ?? []) as Json[]).map((t) => String(t?.name));
        const missing = architectureTools(root).filter((n) => !names.includes(n));
        const problems: string[] = [];
        if (init?.result?.serverInfo?.name !== "what-if") problems.push(`serverInfo.name "${init?.result?.serverInfo?.name}"`);
        if (missing.length) problems.push(`missing tools: ${missing.join(", ")}`);
        return verdict(problems, `stdio: ${names.length} tools`);
      } finally {
        if (isWin && child.pid !== undefined) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
        else child.kill();
      }
    },
  },

  // ==================== visual ====================
  {
    id: "visual-typecheck",
    component: "visual",
    title: "src/report, the site client code and the report tests type-check",
    command: "npx tsc --noEmit -p tsconfig.json",
    run: (root) => {
      const base = typecheckFor(root, ["src/report/", "site/", "test/report.test.ts"], "src/report + site");
      const siteTs = listFiles(join(root, "site"), (f) => /\.(ts|tsx)$/.test(f));
      if (!siteTs.length) return base;
      const cfg = readJson<{ include?: string[] }>(join(root, "tsconfig.json"));
      const covered = (cfg?.include ?? []).some((i) => /^\.?\/?site\b/.test(i));
      if (covered) return base;
      if (existsSync(join(root, "site/tsconfig.json"))) {
        const bin = join(root, "node_modules/typescript/bin/tsc");
        const r = proc(process.execPath, [bin, "--noEmit", "-p", "site/tsconfig.json", "--pretty", "false"], root, 5 * 60_000);
        if (r.code !== 0) return { ok: false, detail: `site/tsconfig.json: ${tail(r.out, 800)}` };
        return base;
      }
      return { ok: false, detail: `${siteTs.length} TypeScript files in site/ are not type-checked: add "site" to tsconfig.json include (or give site/ its own tsconfig.json)${base.ok ? "" : `\n${base.detail}`}` };
    },
  },
  {
    id: "report-tests",
    component: "visual",
    title: "report tests pass",
    critical: true,
    command: "node --import tsx --test test/report.test.ts",
    timeoutMs: 300_000,
    run: (root) => nodeTest(root, ["test/report.test.ts"]),
  },
  {
    id: "visual-steps",
    component: "visual",
    title: "the demo report is a six-step lesson (progress header / step sections)",
    command: "node --import tsx qa/run.ts --no-loop --only visual  (static copy: qa/reports/ui/report-static.html)",
    run: async (root) => {
      const { html } = await rendered(root);
      const dataStep = new Set([...html.matchAll(/data-step=["']?(\d+)/g)].map((m) => m[1]));
      const idStep = new Set([...html.matchAll(/\bid=["']step-?(\d+)["']/g)].map((m) => m[1]));
      const list = /<(ol|ul|nav)\b[^>]*class=["'][^"']*\b(steps|progress|pipeline|stepper)\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(html);
      const listItems = list ? (list[3]?.match(/<li\b/gi) ?? []).length : 0;
      const sections = (html.match(/<section\b[^>]*class=["'][^"']*\bstep\b[^"']*["']/gi) ?? []).length;
      const found = [
        ["data-step", dataStep.size],
        ["id=step-N", idStep.size],
        ["progress list", listItems],
        ["section.step", sections],
      ] as const;
      const best = found.find(([, n]) => n > 0);
      if (!best) return { ok: false, detail: "no steps found (mark them with data-step=\"1\"…\"6\", ids step-1…step-6, an <ol class=\"steps\"> header, or <section class=\"step\">)" };
      return best[1] === 6 ? { ok: true, detail: `6 steps (${best[0]})` } : { ok: false, detail: `${best[1]} steps by ${best[0]} (want 6: question, numbers, outcomes, the one number, rehearsal, your test)` };
    },
  },
  {
    id: "visual-source-chips",
    component: "visual",
    title: "source chips teach where numbers come from: demo shows >= 4 of the 5 labels, an owner's report shows \"Your number\"",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { b, report, html } = await rendered(root);
      const text = visibleText(html);
      const shown = SOURCE_LABELS.filter((l) => text.includes(l));
      const problems: string[] = [];
      if (shown.length < 4) problems.push(`the demo report shows ${shown.length} source labels (${shown.join(", ") || "none"}); want >= 4 of ${SOURCE_LABELS.join(", ")}`);
      for (const must of ["Demo data", "Calculated", "Imagined"]) if (!shown.includes(must)) problems.push(`no "${must}" chip in the demo report`);
      const owner = b.e.analyze("lunch_offer", b.e.demoInputs("lunch_offer"), { demo: false, business: "Café QA" });
      const ownerText = visibleText(report.renderReport({ analysis: owner }));
      if (!ownerText.includes("Your number")) problems.push("a report from the owner's own numbers does not show \"Your number\"");
      return verdict(problems, `demo: ${shown.join(", ")}; owner report: Your number`);
    },
  },
  {
    id: "visual-slider-label",
    component: "visual",
    title: "the break-even slider is a labelled range input with min and max",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { html } = await rendered(root);
      const tags = html.match(/<input\b[^>]*type=["']?range\b[^>]*>/gi) ?? [];
      if (!tags.length) return { ok: false, detail: "no <input type=\"range\"> in the report" };
      const problems: string[] = [];
      for (const tag of tags) {
        const id = /\bid=["']([^"']+)["']/.exec(tag)?.[1];
        const labelled =
          /\baria-label=["'][^"']+["']/.test(tag) ||
          (/\baria-labelledby=["']([^"']+)["']/.test(tag) && new RegExp(`id=["']${/\baria-labelledby=["']([^"'\s]+)/.exec(tag)?.[1]}["']`).test(html)) ||
          (!!id && new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(html)) ||
          new RegExp(`<label\\b[^>]*>(?:(?!</label>)[\\s\\S])*${tag.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(html);
        if (!labelled) problems.push(`slider ${id ? `#${id}` : tag.slice(0, 50)} has no label`);
        if (!/\bmin=/.test(tag) || !/\bmax=/.test(tag)) problems.push(`slider ${id ? `#${id}` : ""} has no min/max`);
      }
      return verdict(problems, `${tags.length} labelled slider(s)`);
    },
  },
  {
    id: "visual-show-maths",
    component: "visual",
    title: "\"show the maths\" toggles sit beside the numbers, and the figures' maths strings are in the report",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { b, html } = await rendered(root);
      const summaries = [...html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/gi)].filter((m) => /math|working|how (is|was|we|it'?s) (this )?(calculated|worked out)/i.test(visibleText(m[1] ?? "")));
      const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].filter((m) => /show (the )?maths?|how (is|was) this calculated/i.test(visibleText(m[1] ?? "")));
      const toggles = summaries.length + buttons.length;
      const text = visibleText(html);
      const maths = [b.a.breakEven.maths, b.a.worstCase.maths, ...b.a.scenarios.flatMap((s) => s.figures.map((f) => f.maths))].filter((m): m is string => !!m && !!m.trim());
      const present = maths.filter((m) => text.includes(squash(m)));
      const problems: string[] = [];
      if (toggles < 3) problems.push(`${toggles} "show the maths" toggles (want at least one per scenario: <details><summary>Show the maths</summary>…)`);
      if (present.length < Math.ceil(maths.length * 0.8)) problems.push(`${present.length} of ${maths.length} maths strings appear in the report`);
      return verdict(problems, `${toggles} toggles; ${present.length}/${maths.length} maths strings shown`);
    },
  },
  {
    id: "visual-caveat",
    component: "visual",
    title: "the rehearsal caveat and the \"what a simulation can and cannot tell you\" box are in the report",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { b, html } = await rendered(root);
      const no = needRehearsal(b);
      if (no) return { ok: false, detail: no };
      const text = visibleText(html);
      const problems: string[] = [];
      if (!text.includes(squash(b.summary!.caveat))) problems.push("the summary's caveat text is not in the report");
      if (!/can(not|'t| not) tell|can and cannot/i.test(text)) problems.push("no \"what a simulation can and cannot tell you\" box");
      if (!/imagined/i.test(text)) problems.push("the rehearsal is not labelled as imagined");
      return verdict(problems, `caveat shown: "${b.summary!.caveat.slice(0, 80)}…"`);
    },
  },
  {
    id: "visual-privacy",
    component: "visual",
    title: "a privacy card says the data stays in the link and the server stores nothing",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { html } = await rendered(root);
      const text = visibleText(html);
      const marked = /class=["'][^"']*privacy|id=["'][^"']*privacy/i.test(html) || /\bprivacy\b|your data/i.test(text);
      const says = /never (sent|stored|leaves)|stores? nothing|not stored|nothing is stored|stays (in|on) (your|this) (browser|device|link)|after the #|fragment/i.test(text);
      const problems = [...(marked ? [] : ["no privacy card (class/id \"privacy\" or a \"Privacy\" heading)"]), ...(says ? [] : ["nothing says the data stays in the link / the server stores nothing"])];
      return verdict(problems, "privacy card present");
    },
  },
  {
    id: "visual-self-contained",
    component: "visual",
    title: "the report, its styles and the built pages load no external scripts, styles, fonts or images (the #token stays private)",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { html, styles } = await rendered(root);
      const ext = /<script\b[^>]*\bsrc=["']?(https?:)?\/\/|<link\b[^>]*\bhref=["']?(https?:)?\/\/|<img\b[^>]*\bsrc=["']?(https?:)?\/\/|<iframe\b[^>]*\bsrc=["']?(https?:)?\/\//i;
      const css = /@import\b|url\(\s*["']?(https?:)?\/\//i;
      const problems: string[] = [];
      if (ext.test(html)) problems.push(`renderReport output loads "${ext.exec(html)?.[0]}…"`);
      if (css.test(styles)) problems.push(`reportStyles() loads "${css.exec(styles)?.[0]}…"`);
      const dirs = [join(root, ".vercel/output/static"), join(root, "site")];
      const pages = dirs.flatMap((d) => listFiles(d, (f) => /\.html?$/.test(f)));
      for (const p of pages) {
        const s = readFileSync(p, "utf8");
        const m = ext.exec(s) ?? css.exec(s.match(/<style[\s\S]*?<\/style>/gi)?.join("\n") ?? "");
        if (m) problems.push(`${posix(relative(root, p))} loads "${m[0]}…"`);
      }
      for (const f of dirs.flatMap((d) => listFiles(d, (x) => /\.css$/.test(x)))) {
        const m = css.exec(readFileSync(f, "utf8"));
        if (m) problems.push(`${posix(relative(root, f))} loads "${m[0]}…"`);
      }
      return verdict(problems, `report + ${pages.length} pages load nothing from other origins`);
    },
  },
  {
    id: "visual-escaping",
    component: "visual",
    title: "text from the link (business, question, events, item) is escaped: no HTML injection in the report",
    critical: true,
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const { b, report } = await rendered(root);
      const e = b.e;
      const problems: string[] = [];
      const raw = [/<img src=x/i, /<script>alert/i, /<iframe src="javascript/i, /<svg\/onload/i, /<[^>]*\sonmouseover="alert\(2\)"/i];
      const inspect = (label: string, html: string) => {
        for (const re of raw) if (re.test(html)) problems.push(`${label}: "${re.exec(html)?.[0]}" reaches the HTML unescaped`);
      };
      const a = e.analyze("lunch_offer", e.demoInputs("lunch_offer"), { demo: true, business: "<img src=x onerror=alert(1)>Café", question: 'What if "x" onmouseover="alert(2)" <script>alert(3)</script>?' });
      let summary: RehearsalSummary | undefined;
      if (b.sim) {
        let r = b.sim.startRehearsal(a, { seed: 2 });
        r = b.sim.injectEvent(r, '<iframe src="javascript:alert(4)"></iframe>');
        r = playAll(b.sim, r);
        summary = b.sim.summarize(r);
      }
      inspect("business/question/event", report.renderReport({ analysis: a, plan: e.planTest(a), ...(summary ? { rehearsal: summary } : {}), status: "final" }));
      try {
        const p = e.analyze("price_change", { ...e.demoInputs("price_change"), item: "<svg/onload=alert(5)>" }, { demo: true });
        inspect("item", report.renderReport({ analysis: p }));
      } catch {
        /* the engine refusing the item is fine */
      }
      return verdict([...new Set(problems)], `5 injection probes escaped${summary ? " (incl. an owner event in the rehearsal)" : " (rehearsal not available)"}`);
    },
  },
  {
    id: "visual-browser-safe",
    component: "visual",
    title: "src/report and site/src use no Node APIs",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: (root) => browserSafe(root, ["src/report", "site/src"], ["site/"]),
  },
  {
    id: "site-pages-built",
    component: "visual",
    title: "the build has index.html, r.html, connect.html and bundled JS; every page has lang, viewport and a title; local assets resolve",
    command: "npm run build",
    run: (root) => {
      const st = join(root, ".vercel/output/static");
      if (!existsSync(st)) return { ok: false, detail: ".vercel/output/static does not exist (run npm run build)" };
      const problems: string[] = [];
      for (const p of ["index.html", "r.html", "connect.html"]) if (!existsSync(join(st, p))) problems.push(`static/${p} is missing`);
      const js = listFiles(join(st, "assets"), (f) => /\.m?js$/.test(f));
      if (!js.length) problems.push("static/assets/ has no .js bundle");
      const pages = listFiles(st, (f) => /\.html$/.test(f));
      for (const p of pages) {
        const rel = posix(relative(st, p));
        const s = readFileSync(p, "utf8");
        if (!/<html\b[^>]*\blang=/i.test(s)) problems.push(`${rel}: no <html lang>`);
        if (!/<meta\b[^>]*name=["']viewport/i.test(s)) problems.push(`${rel}: no viewport meta`);
        if (!/<title>[^<]+<\/title>/i.test(s)) problems.push(`${rel}: no title`);
        for (const m of s.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"'#?]+)/gi)) {
          const ref = m[1] ?? "";
          if (/^(https?:|\/\/|data:|mailto:)/.test(ref) || !/\.(m?js|css)$/.test(ref)) continue;
          const file = ref.startsWith("/") ? join(st, ref) : join(dirname(p), ref);
          if (!existsSync(file)) problems.push(`${rel}: ${ref} does not exist in the build`);
        }
      }
      return verdict(problems.slice(0, 10), `${pages.length} pages, ${js.length} JS bundles`);
    },
  },
  ...UI_CHECKS.map(
    (c): CheckDef => ({
      id: c.id,
      component: "visual",
      title: c.title,
      command: "node --import tsx qa/ui-check.ts",
      timeoutMs: 300_000,
      run: async (root) => (await ui(root)).find((x) => x.id === c.id) ?? { ok: false, detail: "did not run" },
    })
  ),

  // ==================== skill ====================
  {
    id: "skill-frontmatter",
    component: "skill",
    title: "SKILL.md frontmatter is valid for upload: allowed keys only, name = folder, description <= 1024 chars and mentions \"what if\"",
    critical: true,
    command: "node --import tsx qa/run.ts --no-loop --only skill",
    run: (root) => {
      const src = readText(root, `${SKILL_DIR}/SKILL.md`);
      if (src === null) return { ok: false, detail: `${SKILL_DIR}/SKILL.md does not exist yet` };
      const fm = frontmatter(src);
      if (fm.error) return { ok: false, detail: fm.error };
      const problems: string[] = [];
      const extra = fm.keys.filter((k) => !ALLOWED_FRONTMATTER.includes(k));
      if (extra.length) problems.push(`keys not allowed in a claude.ai upload: ${extra.join(", ")} (allowed: ${ALLOWED_FRONTMATTER.join(", ")})`);
      const dupes = fm.keys.filter((k, i) => fm.keys.indexOf(k) !== i);
      if (dupes.length) problems.push(`duplicate keys: ${dupes.join(", ")}`);
      const name = fm.values.name ?? "";
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) problems.push(`name "${name}" must be lowercase letters, digits and hyphens, <= 64 chars`);
      if (name !== basename(SKILL_DIR)) problems.push(`name "${name}" does not match the folder "${basename(SKILL_DIR)}"`);
      if (/anthropic|claude/.test(name)) problems.push("name uses a reserved word");
      const d = fm.values.description ?? "";
      if (!d.trim()) problems.push("no description");
      if (d.length > 1024) problems.push(`description is ${d.length} chars (max 1024)`);
      if (!/what[- ]if/i.test(d)) problems.push("the description does not mention \"what if\" (it is the trigger)");
      if (/<[a-z/][^>]*>/i.test(d)) problems.push("the description contains XML/HTML tags");
      return verdict(problems, `keys ${fm.keys.join(", ")}; description ${d.length} chars`);
    },
  },
  {
    id: "skill-body",
    component: "skill",
    title: "SKILL.md body is under 500 lines and points at {{SITE_URL}}/api/mcp",
    command: "node --import tsx qa/run.ts --no-loop --only skill",
    run: (root) => {
      const src = readText(root, `${SKILL_DIR}/SKILL.md`);
      if (src === null) return { ok: false, detail: `${SKILL_DIR}/SKILL.md does not exist yet` };
      const fm = frontmatter(src);
      const lines = fm.body.split(/\r?\n/).length;
      const problems: string[] = [];
      if (lines >= 500) problems.push(`the body has ${lines} lines (keep it under 500; move detail to references/)`);
      if (!src.includes("{{SITE_URL}}/api/mcp")) problems.push("SKILL.md does not mention {{SITE_URL}}/api/mcp");
      return verdict(problems, `${lines} lines; MCP URL templated`);
    },
  },
  {
    id: "skill-references",
    component: "skill",
    title: "every reference linked from SKILL.md exists, none is orphaned, and they cover coaching, rehearsal, maths, connecting and visuals",
    command: "node --import tsx qa/run.ts --no-loop --only skill",
    run: (root) => {
      const dir = join(root, SKILL_DIR);
      const src = readText(root, `${SKILL_DIR}/SKILL.md`);
      if (src === null) return { ok: false, detail: `${SKILL_DIR}/SKILL.md does not exist yet` };
      const refs = listFiles(join(dir, "references"), (f) => /\.md$/.test(f)).map((f) => posix(relative(dir, f)));
      const problems: string[] = [];
      if (!refs.length) problems.push("references/ has no .md files");
      const links = localLinks(src);
      for (const l of links) if (!existsSync(join(dir, l))) problems.push(`SKILL.md links to ${l}, which does not exist`);
      const linked = new Set(links.map((l) => posix(l).replace(/^\.\//, "")));
      const orphans = refs.filter((r) => !linked.has(r));
      if (orphans.length) problems.push(`not linked from SKILL.md: ${orphans.join(", ")}`);
      for (const r of refs) for (const l of localLinks(readFileSync(join(dir, r), "utf8"))) if (!existsSync(join(dir, dirname(r), l)) && !existsSync(join(dir, l))) problems.push(`${r} links to ${l}, which does not exist`);
      for (const [topic, re] of [["coaching", /coach/], ["rehearsal", /rehears|customer|persona/], ["maths", /math/], ["connecting", /connect|mcp|setup/], ["visuals", /visual|report/]] as const)
        if (!refs.some((r) => re.test(r))) problems.push(`no reference for ${topic}`);
      return verdict(problems.slice(0, 10), `${refs.length} references, all linked: ${refs.join(", ")}`);
    },
  },
  {
    id: "skill-workflow",
    component: "skill",
    title: "the skill starts with whatif_start, never does the money maths itself, shares the report link, runs the rehearsal as subagents, explains connecting",
    command: "node --import tsx qa/run.ts --no-loop --only skill",
    run: (root) => {
      const src = readText(root, `${SKILL_DIR}/SKILL.md`);
      if (src === null) return { ok: false, detail: `${SKILL_DIR}/SKILL.md does not exist yet` };
      const refs = listFiles(join(root, SKILL_DIR, "references"), (f) => /\.md$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
      const allText = `${src}\n${refs}`;
      const problems: string[] = [];
      if (!/whatif_start/.test(src)) problems.push("SKILL.md does not tell the model to call whatif_start first");
      if (!/report[_ ]?(url|link)/i.test(src)) problems.push("SKILL.md does not say to share the report link");
      if (!/(never|do not|don't|not) (compute|calculate|do (the )?(money )?maths?|invent)|tools? (do|does|compute) the (maths|numbers)/i.test(src)) problems.push("SKILL.md does not forbid computing the money maths by hand");
      if (!/sub-?agents?/i.test(allText)) problems.push("nothing explains running the imagined customers as subagents");
      if (!/imagined/i.test(allText)) problems.push("nothing says the rehearsal is imagined");
      if (!/claude mcp add|custom connector|connector/i.test(allText)) problems.push("nothing explains how to connect the MCP");
      if (!/one (focused )?question at a time|one question/i.test(allText)) problems.push("nothing says to ask one focused question at a time");
      return verdict(problems, "workflow, maths rule, report link, subagents, imagined caveat and connecting are covered");
    },
  },
  {
    id: "skill-zip",
    component: "skill",
    title: "the built what-if-skill.zip holds what-if/SKILL.md and its references with {{SITE_URL}} filled in",
    command: "npm run build",
    run: async (root) => {
      const zipPath = join(root, ".vercel/output/static/what-if-skill.zip");
      if (!existsSync(zipPath)) return { ok: false, detail: ".vercel/output/static/what-if-skill.zip does not exist (run npm run build)" };
      const { unzipSync, strFromU8 } = (await import("fflate")) as typeof import("fflate");
      let files: Record<string, Uint8Array>;
      try {
        files = unzipSync(new Uint8Array(readFileSync(zipPath)));
      } catch (err) {
        return { ok: false, detail: `not a valid zip: ${msg(err)}` };
      }
      const names = Object.keys(files).filter((n) => !n.endsWith("/"));
      const problems: string[] = [];
      const skill = files["what-if/SKILL.md"];
      if (!skill) problems.push(`no what-if/SKILL.md in the zip (entries: ${names.slice(0, 6).join(", ")})`);
      const outside = names.filter((n) => !n.startsWith("what-if/"));
      if (outside.length) problems.push(`entries outside what-if/: ${outside.slice(0, 4).join(", ")}`);
      for (const n of names) if (/\.(md|txt|json|ya?ml)$/.test(n) && strFromU8(files[n]!).includes("{{SITE_URL}}")) problems.push(`${n} still contains {{SITE_URL}}`);
      if (skill) {
        const s = strFromU8(skill);
        if (!/https?:\/\/[^\s)`'"<>]+\/api\/mcp/.test(s)) problems.push("the zipped SKILL.md has no real …/api/mcp URL");
        if (!s.startsWith("---")) problems.push("the zipped SKILL.md lost its frontmatter");
      }
      const srcRefs = listFiles(join(root, SKILL_DIR, "references"), (f) => /\.md$/.test(f)).map((f) => `what-if/${posix(relative(join(root, SKILL_DIR), f))}`);
      const missing = srcRefs.filter((r) => !names.includes(r));
      if (missing.length) problems.push(`references missing from the zip: ${missing.join(", ")}`);
      return verdict(problems, `${names.length} files; ${/https?:\/\/[^\s)`'"<>]+\/api\/mcp/.exec(skill ? strFromU8(skill) : "")?.[0] ?? ""}`);
    },
  },
  {
    id: "skill-server-instructions",
    component: "skill",
    title: "src/mcp/instructions.ts exports SERVER_INSTRUCTIONS: the \"what if\" trigger, the report link at every step, no hand-made maths",
    command: "node --import tsx qa/run.ts --no-loop --only skill",
    run: async (root) => {
      const m = await load<{ SERVER_INSTRUCTIONS?: unknown }>(root, "src/mcp/instructions.ts", ["SERVER_INSTRUCTIONS"]);
      const s = String(m.SERVER_INSTRUCTIONS ?? "");
      const problems: string[] = [];
      if (s.length < 200) problems.push(`SERVER_INSTRUCTIONS is ${s.length} chars`);
      if (!/what[- ]if/i.test(s)) problems.push("does not mention \"what if\"");
      if (!/whatif_start/.test(s)) problems.push("does not name whatif_start");
      if (!/report/i.test(s)) problems.push("does not say to share the report link");
      if (!/(never|do not|don't|not) (compute|calculate|do (the )?(money )?maths?|invent)|tools? (do|does|compute) the (maths|numbers)/i.test(s)) problems.push("does not forbid computing money by hand");
      return verdict(problems, `${s.length} chars`);
    },
  },

  // ==================== product ====================
  {
    id: "product-theme",
    component: "product",
    title: "vision.md and docs/PRD.md name the hackathon theme (AI education for everyone) and the target user (café owners)",
    command: "node --import tsx qa/run.ts --no-loop --only product",
    run: (root) => {
      const problems: string[] = [];
      for (const f of ["vision.md", "docs/PRD.md"]) {
        const s = readText(root, f);
        if (s === null) {
          problems.push(`${f} is missing`);
          continue;
        }
        if (!/AI education for everyone/i.test(s)) problems.push(`${f} does not name the theme "AI education for everyone"`);
        if (!/caf[eé] owners?/i.test(s)) problems.push(`${f} does not name café owners`);
      }
      return verdict(problems, "theme and target user named in vision.md and PRD.md");
    },
  },
  {
    id: "product-pitch-surfaces",
    component: "product",
    title: "the README and the landing page say who it is for and what the owner learns",
    command: "node --import tsx qa/run.ts --no-loop --only product",
    run: (root) => {
      const problems: string[] = [];
      const landing = readText(root, "site/index.html") ?? readText(root, ".vercel/output/static/index.html");
      for (const [where, s] of [["README.md", readText(root, "README.md")], ["the landing page", landing]] as const) {
        if (s === null) {
          problems.push(`${where} is missing`);
          continue;
        }
        const t = visibleText(s);
        if (!/caf[eé]/i.test(t)) problems.push(`${where} does not say it is for café owners`);
        if (!/learn|teach|lesson|educat|understand/i.test(t)) problems.push(`${where} does not say what the owner learns`);
        if (!/what if/i.test(t)) problems.push(`${where} has no "what if…" example`);
      }
      return verdict(problems, "README and landing page name the audience, the learning and a what-if example");
    },
  },
  {
    id: "product-full-loop",
    component: "product",
    title: "the demo covers the vision's loop: lessons and next questions, a small capped test with keep/tweak/stop, questions for real customers, learning from the result",
    command: "node --import tsx qa/run.ts --no-loop --only product",
    run: async (root) => {
      const b = await bundle(root);
      const problems: string[] = [];
      if ((b.a.lessons?.length ?? 0) < 2) problems.push(`${b.a.lessons?.length ?? 0} lessons (want >= 2 transferable ones)`);
      if (!b.a.nextQuestions?.length) problems.push("no next questions");
      if (!b.a.biggestUncertainty?.plain?.trim()) problems.push("no plain biggest uncertainty");
      if (!(b.plan.days > 0 && b.plan.days <= 30)) problems.push(`the test lasts ${b.plan.days} days (want a small one)`);
      if (!b.plan.costCap?.trim()) problems.push("the test has no cost cap");
      if (!b.plan.decisionRule?.keep || !b.plan.decisionRule?.stop) problems.push("the test has no keep/stop rule");
      if (!b.summary) problems.push(`no rehearsal: ${b.simError ?? "?"}`);
      else if (!b.summary.checkWithRealCustomers?.length) problems.push("the rehearsal ends without questions for real customers");
      try {
        const e = await engine(root, ["compareResult", "OBSERVED_FIELDS"]);
        const r = e.compareResult(b.a, { baseline_lunch_customers: 38, test_lunch_customers: 43, redemptions_per_day: 12, days_run: 10 });
        if (!r.learned?.length) problems.push("logging a result teaches nothing");
      } catch (err) {
        problems.push(`logging a result failed: ${msg(err).split("\n")[0]}`);
      }
      return verdict(problems, `${b.a.lessons.length} lessons, a ${b.plan.days}-day test with a cost cap, ${b.summary?.checkWithRealCustomers.length ?? 0} real-customer questions`);
    },
  },
  {
    id: "product-honest-claims",
    component: "product",
    title: "possibilities, not promises: no 'will' in scenario text and no overclaiming in README, site, skill or instructions",
    command: "node --import tsx qa/run.ts --no-loop --only product",
    run: async (root) => {
      const problems: string[] = [];
      try {
        const e = await engine(root);
        for (const t of ["lunch_offer", "price_change"]) {
          const a = e.analyze(t, e.demoInputs(t), { demo: true });
          for (const s of a.scenarios) if (/\bwill\b/i.test(s.plain ?? "")) problems.push(`${t}/${s.id}: "${squash(s.plain).slice(0, 100)}"`);
        }
      } catch (err) {
        problems.push(`scenario text not checked: ${msg(err).split("\n")[0]}`);
      }
      const files = [
        "README.md",
        "src/mcp/instructions.ts",
        ...listFiles(join(root, "site"), (f) => /\.html?$/.test(f)).map((f) => posix(relative(root, f))),
        ...listFiles(join(root, SKILL_DIR), (f) => /\.md$/.test(f)).map((f) => posix(relative(root, f))),
      ];
      for (const f of files) {
        const s = readText(root, f);
        if (s !== null) problems.push(...overclaims(s, f));
      }
      return verdict(problems.slice(0, 8), `${files.length} files and the scenario texts make no promises`);
    },
  },
  {
    id: "product-demo-labelled",
    component: "product",
    title: "demo data is labelled as demo everywhere (business name, inputs, report)",
    command: "node --import tsx qa/run.ts --no-loop --only product",
    run: async (root) => {
      const b = await bundle(root);
      const problems: string[] = [];
      if (!/demo/i.test(b.e.DEMO_BUSINESS)) problems.push(`DEMO_BUSINESS "${b.e.DEMO_BUSINESS}" does not say demo`);
      if (!b.a.demo) problems.push("the demo analysis is not flagged demo");
      const owner = b.a.inputs.filter((i) => i.source === "owner");
      if (owner.length) problems.push(`demo inputs tagged as the owner's: ${owner.map((i) => i.key).join(", ")}`);
      try {
        const { html } = await rendered(root);
        if (!visibleText(html).includes("Demo data")) problems.push("the demo report does not say \"Demo data\"");
      } catch (err) {
        problems.push(`report not checked: ${msg(err).split("\n")[0]}`);
      }
      return verdict(problems, "demo labelled in the business name, the inputs and the report");
    },
  },

  // ==================== docs-devex ====================
  {
    id: "devex-typecheck",
    component: "docs-devex",
    title: "the whole repo type-checks (npm run typecheck)",
    command: "npx tsc --noEmit -p tsconfig.json",
    run: (root) => {
      const t = tsc(root);
      if (t.ok) return { ok: true, detail: "no type errors" };
      const byDir = new Map<string, number>();
      for (const e of t.errors) {
        const d = e.file.split("/").slice(0, 2).join("/");
        byDir.set(d, (byDir.get(d) ?? 0) + 1);
      }
      return { ok: false, detail: `${t.errors.length} type errors (${[...byDir].map(([d, n]) => `${d}: ${n}`).join(", ")})\n${t.errors.slice(0, 5).map((e) => e.line).join("\n") || tail(t.out, 600)}` };
    },
  },
  {
    id: "docs-set",
    component: "docs-devex",
    title: "README, PRD, PLAN, ARCHITECTURE and QA-RUBRIC exist and are not stubs",
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const files = ["README.md", "docs/PRD.md", "docs/PLAN.md", "docs/ARCHITECTURE.md", "docs/QA-RUBRIC.md"];
      const problems = files.flatMap((f) => {
        const s = readText(root, f);
        return s === null ? [`${f} is missing`] : s.length < 400 ? [`${f} is a stub (${s.length} chars)`] : [];
      });
      return verdict(problems, "all present");
    },
  },
  {
    id: "docs-readme-usage",
    component: "docs-devex",
    title: "README shows how to use it: a \"what if…\" example, the MCP URL, how to add it to an AI app, the skill download",
    critical: true,
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const s = readText(root, "README.md");
      if (s === null) return { ok: false, detail: "README.md does not exist yet" };
      const problems: string[] = [];
      if (!/what if (i|we)\b/i.test(s)) problems.push("no \"What if I…\" example question");
      if (!/^#{2,3}\s.*(use|usage|try|how it works|quick ?start|get started|what if)/im.test(s)) problems.push("no usage section heading");
      if (!/\/api\/mcp/.test(s)) problems.push("no MCP URL (…/api/mcp)");
      if (!/claude mcp add|custom connector|connector/i.test(s)) problems.push("does not say how to add the MCP to an AI app");
      if (!/what-if-skill\.zip|\bskill\b/i.test(s)) problems.push("does not mention the skill");
      return verdict(problems, `${s.length} chars; example, MCP URL, connector steps and skill present`);
    },
  },
  {
    id: "docs-readme-dev",
    component: "docs-devex",
    title: "README has the local dev commands: install, dev server, test, build, qa",
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const s = readText(root, "README.md");
      if (s === null) return { ok: false, detail: "README.md does not exist yet" };
      const need: [RegExp, string][] = [
        [/npm (install|ci)\b/, "npm install"],
        [/npm run dev\b|node scripts\/dev\.mjs/, "the dev server (npm run dev / node scripts/dev.mjs)"],
        [/npm (run )?test\b/, "npm test"],
        [/npm run build\b/, "npm run build"],
        [/npm run qa\b/, "npm run qa"],
      ];
      return verdict(need.filter(([re]) => !re.test(s)).map(([, w]) => `missing ${w}`), "install, dev, test, build and qa documented");
    },
  },
  {
    id: "docs-commands-exist",
    component: "docs-devex",
    title: "every npm script and node file the README names exists",
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const s = readText(root, "README.md");
      if (s === null) return { ok: false, detail: "README.md does not exist yet" };
      const scripts = readJson<{ scripts?: Record<string, string> }>(join(root, "package.json"))?.scripts ?? {};
      const problems: string[] = [];
      for (const m of s.matchAll(/npm run ([\w:.-]+)/g)) if (!scripts[m[1] ?? ""]) problems.push(`npm run ${m[1]} is not a script`);
      for (const m of s.matchAll(/npm (test|start)\b/g)) if (!scripts[m[1] ?? ""]) problems.push(`npm ${m[1]} is not a script`);
      for (const m of s.matchAll(/node (?:--import tsx )?((?:scripts|src|qa)\/[\w./-]+\.(?:m?js|ts))/g)) if (!existsSync(join(root, m[1] ?? ""))) problems.push(`${m[1]} does not exist`);
      return verdict([...new Set(problems)], "every documented command exists");
    },
  },
  {
    id: "devex-scripts-resolve",
    component: "docs-devex",
    title: "every package.json script points at files that exist",
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const scripts = readJson<{ scripts?: Record<string, string> }>(join(root, "package.json"))?.scripts ?? {};
      const problems: string[] = [];
      for (const [name, cmd] of Object.entries(scripts))
        for (const m of cmd.matchAll(/(?:^|\s)((?:\.\/)?[\w@./-]+\/[\w.-]+\.(?:m?js|c?js|m?ts))(?=\s|$)/g)) {
          const f = m[1] ?? "";
          if (f.includes("*")) continue;
          if (!existsSync(join(root, f))) problems.push(`"${name}" runs ${f}, which does not exist`);
        }
      for (const [name, cmd] of Object.entries(scripts))
        for (const m of cmd.matchAll(/(?:^|\s)((?:\.\/)?[\w./-]+)\/\*\.test\.ts/g)) if (!listFiles(join(root, m[1] ?? ""), (f) => f.endsWith(".test.ts")).length) problems.push(`"${name}" globs ${m[1]}/*.test.ts, which matches nothing`);
      return verdict(problems, `${Object.keys(scripts).length} scripts, all targets exist`);
    },
  },
  {
    id: "devex-layout",
    component: "docs-devex",
    title: "the code matches the ARCHITECTURE.md layout",
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const arch = readText(root, "docs/ARCHITECTURE.md") ?? "";
      const block = /## Layout[\s\S]*?```[^\n]*\n([\s\S]*?)```/.exec(arch)?.[1] ?? "";
      const paths = [...new Set([...block.split("\n").map((l) => l.trim().split(/\s+/)[0] ?? "").filter((p) => /^[\w.-]+\//.test(p) || /\.\w+$/.test(p)), "src/engine/index.ts", "src/sim/index.ts", "src/report/index.ts"])];
      const missing = paths.filter((p) => {
        if (p.includes("*")) {
          const dir = join(root, dirname(p));
          const re = new RegExp(`^${basename(p).replace(/\./g, "\\.").replace(/\*/g, ".*")}$`);
          return !existsSync(dir) || !readdirSync(dir).some((f) => re.test(f));
        }
        return !existsSync(join(root, p));
      });
      return verdict(missing.length ? [`missing: ${missing.join(", ")}`] : [], `${paths.length} paths from ARCHITECTURE.md exist`);
    },
  },
  {
    id: "devex-no-secrets",
    component: "docs-devex",
    title: "no API keys, tokens or private keys in any file git would commit; no .env files",
    critical: true,
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex",
    run: (root) => {
      const list = gitFiles(root) ?? listFiles(root, () => true).map((f) => posix(relative(root, f)));
      const files = list.filter((f) => !/\.(png|jpe?g|gif|webp|ico|zip|woff2?|mp4|pdf)$/i.test(f) && !/(^|\/)package-lock\.json$/.test(f) && statSync(join(root, f)).size < 2_000_000);
      const hits: string[] = [];
      for (const f of list) if (/(^|\/)\.env(\.(?!example$)[\w.-]+)?$/.test(f)) hits.push(`${f} (an env file would be committed)`);
      for (const f of files) {
        const s = readFileSync(join(root, f), "utf8");
        for (const [re, what] of SECRET_PATTERNS) if (re.test(s)) hits.push(`${f} (${what})`);
      }
      return verdict(hits, `${files.length} files scanned, clean`);
    },
  },
  {
    id: "devex-gitignore",
    component: "docs-devex",
    title: ".gitignore covers node_modules and .vercel (and the UI screenshots)",
    command: "git check-ignore -v --no-index node_modules/x .vercel/output/config.json",
    run: (root) => {
      const problems: string[] = [];
      for (const p of ["node_modules/x/index.js", ".vercel/output/config.json", "qa/reports/ui/landing-desktop.png"]) {
        const ignored = gitIgnored(root, p);
        if (ignored === false) problems.push(`${p.split("/").slice(0, p.startsWith("qa") ? 3 : 1).join("/")} is not ignored`);
        if (ignored === null) problems.push("git check-ignore failed");
      }
      return verdict([...new Set(problems)], "node_modules, .vercel and qa/reports/ui are ignored");
    },
  },
  {
    id: "devex-lockfile",
    component: "docs-devex",
    title: "package-lock.json is present and not ignored",
    command: "git check-ignore --no-index package-lock.json",
    run: (root) => {
      if (!existsSync(join(root, "package-lock.json"))) return { ok: false, detail: "package-lock.json is missing" };
      return gitIgnored(root, "package-lock.json") === true ? { ok: false, detail: "package-lock.json is ignored" } : { ok: true, detail: "present, not ignored" };
    },
  },
];

/** Stops the dev server and anything else started by the checks. */
export function cleanup(): void {
  stopDev();
}
