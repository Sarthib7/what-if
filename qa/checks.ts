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
 * - Slow shared work runs once per QA run: tsc, the shipped demo per language,
 *   the dev servers (open, and closed beta), the MCP session, the browser run
 *   and the scratch copies (production-like build, LF/CRLF test runs).
 * - The evidence for the judges (qa/reports/ui) comes from the shipped demo
 *   (src/report/demo.ts demoState), the same link /r#demo opens, in de/en/es/pl.
 * - v0.2 (Berlin closed beta): German is the product default, so the English-text
 *   checks call the engine and the MCP tools with lang "en"; the language checks
 *   pass the language themselves.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Analysis, ChangeExplanation, DecisionTemplate, InputCheck, RawInputs, TestPlan, TestResult } from "../src/engine/types.ts";
import type { PersonaBrief, Reaction, ReactionMethod, Rehearsal, RehearsalSummary, SubmitOutcome } from "../src/sim/types.ts";
import type { ShareState } from "../src/state.ts";
import { DEFAULT_WHY_LABELS, englishHits, hasTerm, runUiCheck, signHits, TERM_ALTERNATES, UI_BUDGET_MS, UI_CHECKS, type TermWords, type UiOptions, type UiResult } from "./ui-check.ts";

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
type Lang = "de" | "en" | "es" | "pl";
const LANGS: Lang[] = ["de", "en", "es", "pl"];
interface AnalyzeOpts {
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
  id?: string;
  lang?: Lang;
}
interface EngineMod extends TemplatesMod {
  analyze(template: string, raw: RawInputs, opts?: AnalyzeOpts): Analysis;
  whatChanged(before: Analysis, after: Analysis): ChangeExplanation;
  planTest(a: Analysis): TestPlan;
  compareResult(a: Analysis, observed: Record<string, number>): TestResult;
  checkInputs(template: string, raw: RawInputs, opts?: { demo?: boolean; lang?: Lang }): InputCheck;
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

interface I18nMod {
  setLang(l: Lang): void;
  getLang(): Lang;
}
interface DemoMod {
  demoState(template?: string, opts?: Record<string, unknown>): ShareState;
}

const templates = (root: string) => load<TemplatesMod>(root, "src/engine/templates.ts", ["TEMPLATES", "demoInputs", "DEMO_BUSINESS"]);
/** The engine module itself, exactly as exported (no defaults added). */
const rawEngine = (root: string, need = ["analyze", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]) => load<EngineMod>(root, "src/engine/index.ts", need);
/**
 * The engine with `lang: "en"` added to every analyze/checkInputs call that does not name a
 * language, so the English-text checks below stay stable now that the product default is German.
 * Language checks use rawEngine() and pass the language themselves.
 */
const engine = async (root: string, need = ["analyze", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]): Promise<EngineMod> => {
  const m = await rawEngine(root, need);
  return {
    ...m,
    analyze: (t, raw, opts = {}) => m.analyze(t, raw, { lang: "en", ...opts }),
    checkInputs: (t, raw, opts = {}) => (typeof m.checkInputs === "function" ? m.checkInputs(t, raw, { lang: "en", ...opts }) : (undefined as never)),
  };
};
const simMod = (root: string, need = ["startRehearsal", "roundBriefs", "submitRound", "ruleBasedReactions", "summarize"]) => load<SimMod>(root, "src/sim/index.ts", need);
const stateMod = (root: string) => load<StateMod>(root, "src/state.ts", ["encodeState", "decodeState", "reportUrl"]);
const reportMod = (root: string) => load<ReportMod>(root, "src/report/index.ts", ["renderReport"]);
const i18nMod = (root: string) => load<I18nMod>(root, "src/i18n/index.ts", ["setLang", "getLang"]);

/** Runs fn with the module-wide language set (when src/i18n exists), then puts English back. */
async function inLang<T>(root: string, lang: Lang, fn: () => T): Promise<T> {
  const i = await i18nMod(root).catch(() => null);
  i?.setLang(lang);
  try {
    return fn();
  } finally {
    i?.setLang("en");
  }
}

const question = (e: TemplatesMod, t: string) => e.TEMPLATES[t]?.exampleQuestion ?? "What if I run a weekday lunch offer?";

/** The demo analysis exactly as the report page rebuilds it from a demo link. */
function demoAnalysis(e: EngineMod, t = "lunch_offer", over: RawInputs = {}, opts: AnalyzeOpts = {}): Analysis {
  return e.analyze(t, { ...e.demoInputs(t), ...over }, { demo: true, business: e.DEMO_BUSINESS, question: question(e, t), ...opts });
}

/** Exported names in src/** that define `name` (export const NAME / export { NAME }). */
function findExport(root: string, name: string): string[] {
  const re = new RegExp(`export\\s+(?:const|let|var|function)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return listFiles(join(root, "src"), (f) => /\.ts$/.test(f) && !/\.test\./.test(f))
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map((f) => posix(relative(root, f)))
    .sort((a, b) => Number(/index\.ts$/.test(b)) - Number(/index\.ts$/.test(a)));
}

async function loadExport<T>(root: string, name: string, prefer: string[]): Promise<{ value: T; file: string }> {
  for (const rel of [...prefer, ...findExport(root, name)]) {
    if (!existsSync(join(root, rel))) continue;
    const m = await load<Record<string, unknown>>(root, rel).catch(() => null);
    if (m && m[name] !== undefined) return { value: m[name] as T, file: rel };
  }
  throw new Missing(`no module in src/ exports ${name} yet`);
}

// ---- message catalogs ({ en: {...}, de: {...}, es: {...}, pl: {...} }, docs/ARCHITECTURE.md "Languages") ----

type CatalogLike = Record<string, Record<string, unknown> | undefined>;

/** Keys of each language block in a catalog file, read from the source (for catalogs that are not exported). */
function staticCatalogs(src: string): Record<string, string[]>[] {
  const groups: Record<string, string[]>[] = [];
  const keysAt = (open: number): string[] => {
    const keys: string[] = [];
    let depth = 0;
    let expectKey = false;
    for (let i = open; i < src.length; i++) {
      const c = src[i]!;
      if (c === "/" && src[i + 1] === "/") {
        i = src.indexOf("\n", i);
        if (i < 0) break;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        i = src.indexOf("*/", i + 2) + 1;
        if (i <= 0) break;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        let tplDepth = 0;
        for (; j < src.length; j++) {
          if (src[j] === "\\") {
            j++;
            continue;
          }
          if (c === "`" && src[j] === "$" && src[j + 1] === "{") tplDepth++;
          else if (c === "`" && tplDepth && src[j] === "}") tplDepth--;
          else if (src[j] === c && !tplDepth) break;
        }
        if (depth === 1 && expectKey && c !== "`" && /^\s*:/.test(src.slice(j + 1, j + 20))) keys.push(src.slice(i + 1, j));
        expectKey = false;
        i = j;
        continue;
      }
      if (c === "{" || c === "[" || c === "(") {
        depth++;
        if (depth === 1) expectKey = true;
        continue;
      }
      if (c === "}" || c === "]" || c === ")") {
        depth--;
        if (depth === 0) return keys;
        continue;
      }
      if (depth === 1 && c === ",") {
        expectKey = true;
        continue;
      }
      if (depth === 1 && expectKey && /[A-Za-z_$]/.test(c)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))!;
        if (/^\s*[:(]/.test(src.slice(i + m[0].length, i + m[0].length + 20))) keys.push(m[0]);
        expectKey = false;
        i += m[0].length - 1;
        continue;
      }
      if (!/\s/.test(c)) expectKey = false;
    }
    return keys;
  };
  for (const m of src.matchAll(/(?:^|[\s,{])["']?(en|de|es|pl)["']?\s*:\s*\{/g)) {
    const lang = m[1]!;
    const open = (m.index ?? 0) + m[0].length - 1;
    if (lang === "en" || !groups.length) groups.push({});
    groups[groups.length - 1]![lang] = keysAt(open);
  }
  return groups.filter((g) => g.en);
}

/** Every `en` key must be translated in de, es and pl (an empty string does not count). */
async function catalogCheck(root: string, rel: string): Promise<Outcome> {
  if (!existsSync(join(root, rel))) return { ok: false, detail: `${rel} does not exist yet (each module keeps its owner-facing strings in its own catalog: en complete, de/es/pl translated)` };
  const problems: string[] = [];
  const found: { name: string; keys: Record<string, string[]>; values?: CatalogLike }[] = [];
  let loadError = "";
  try {
    const m = await load<Record<string, unknown>>(root, rel);
    const consider = (name: string, v: unknown, depth: number) => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return;
      const o = v as CatalogLike;
      if (o.en && typeof o.en === "object" && LANGS.some((l) => l !== "en" && o[l])) {
        found.push({ name, keys: Object.fromEntries(LANGS.filter((l) => o[l]).map((l) => [l, Object.keys(o[l]!)])), values: o });
        return;
      }
      if (depth < 1) for (const [k, x] of Object.entries(o)) consider(`${name}.${k}`, x, depth + 1);
    };
    for (const [k, v] of Object.entries(m)) consider(k, v, 0);
  } catch (e) {
    loadError = msg(e).split("\n")[0] ?? "";
  }
  if (!found.length) {
    const groups = staticCatalogs(readFileSync(join(root, rel), "utf8"));
    groups.forEach((g, i) => found.push({ name: `catalog ${i + 1} (read from the source${loadError ? `; the module did not load: ${loadError}` : ", not exported"})`, keys: g }));
  }
  if (!found.length) return { ok: false, detail: `${rel} has no catalog of the shape { en: {...}, de: {...}, es: {...}, pl: {...} }${loadError ? ` (${loadError})` : ""}` };
  let total = 0;
  const same: string[] = [];
  for (const c of found) {
    const en = c.keys.en ?? [];
    total += en.length;
    if (!en.length) problems.push(`${c.name}: the en block is empty`);
    for (const l of LANGS.filter((x) => x !== "en")) {
      const have = new Set(c.keys[l] ?? []);
      if (!c.keys[l]) {
        problems.push(`${c.name}: no ${l} block`);
        continue;
      }
      const miss = en.filter((k) => !have.has(k));
      const empty = c.values ? en.filter((k) => have.has(k) && typeof c.values![l]?.[k] === "string" && !String(c.values![l]![k]).trim()) : [];
      if (miss.length) problems.push(`${c.name}: ${l} lacks ${miss.length} of ${en.length} keys: ${miss.slice(0, 6).join(", ")}${miss.length > 6 ? " …" : ""}`);
      if (empty.length) problems.push(`${c.name}: ${l} has empty texts for ${empty.slice(0, 6).join(", ")}`);
      if (c.values) {
        const copied = en.filter((k) => typeof c.values!.en?.[k] === "string" && c.values![l]?.[k] === c.values!.en![k] && /[a-z]{4,}\s+[a-z]{3,}/i.test(String(c.values!.en![k])));
        if (copied.length) same.push(`${l}: ${copied.length}`);
      }
    }
  }
  return verdict(problems.slice(0, 10), `${found.length} catalog(s), ${total} en keys, every key in de/es/pl${same.length ? ` (texts identical to English, worth a look: ${same.join(", ")})` : ""}`);
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

/**
 * The shipped demo in one language: the ShareState that /r#demo opens (src/report/demo.ts demoState),
 * rebuilt the way the report page rebuilds it (analyze → planTest → rebuildRehearsal → summarize).
 * Every judge screenshot and the static report come from this, so judges score what visitors see.
 * When src/report/demo.ts cannot load, it falls back to a rule-based run (seed 42) and says so.
 */
interface Shipped {
  lang: Lang;
  share: ShareState;
  token: string;
  a: Analysis;
  plan: TestPlan;
  rehearsal?: Rehearsal;
  summary?: RehearsalSummary;
  simError?: string;
  /** Where the share state came from. */
  source: string;
}
const shippedMemo = new Map<Lang, Promise<Shipped>>();
function shippedDemo(root: string, lang: Lang): Promise<Shipped> {
  let p = shippedMemo.get(lang);
  if (!p) {
    p = (async () => {
      const e = await rawEngine(root, ["analyze", "planTest", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]);
      const st = await stateMod(root);
      let share: ShareState;
      let source = "src/report/demo.ts demoState(\"lunch_offer\")";
      try {
        const d = await load<DemoMod>(root, "src/report/demo.ts", ["demoState"]);
        share = await inLang(root, lang, () => d.demoState("lunch_offer", { lang }));
      } catch (err) {
        source = `fallback (src/report/demo.ts: ${msg(err).split("\n")[0]}): rule-based run, seed 42`;
        share = { v: 1, template: "lunch_offer", inputs: e.demoInputs("lunch_offer"), demo: true, business: e.DEMO_BUSINESS, question: question(e, "lunch_offer"), currency: "EUR" };
        try {
          const sim = await simMod(root, [...SIM_EXPORTS.filter((n) => n !== "rebuildRehearsal")]);
          const a0 = e.analyze("lunch_offer", share.inputs, { demo: true, business: share.business, question: share.question, lang });
          const r = await inLang(root, lang, () => playAll(sim, sim.injectEvent(playRound(sim, sim.startRehearsal(a0, { seed: 42 })), EVENT)));
          share.rehearsal = toShare(r);
        } catch {
          /* the report still opens without the rehearsal */
        }
      }
      share = { ...share, lang };
      const a = e.analyze(share.template, share.inputs, { business: share.business, question: share.question, demo: share.demo, currency: share.currency, lang });
      const plan = e.planTest(a);
      const out: Shipped = { lang, share, token: st.encodeState(share), a, plan, source };
      if (share.rehearsal) {
        try {
          const sim = await simMod(root, [...SIM_EXPORTS]);
          out.rehearsal = await inLang(root, lang, () => sim.rebuildRehearsal(a, share.rehearsal!));
          out.summary = await inLang(root, lang, () => sim.summarize(out.rehearsal!));
        } catch (err) {
          out.simError = msg(err);
        }
      } else {
        // demoState swallows rehearsal errors; replay the start of one to say why.
        let why = "";
        try {
          const sim = await simMod(root);
          await inLang(root, lang, () => playRound(sim, sim.startRehearsal(a, { seed: 23 })));
        } catch (err) {
          why = `; starting one on the demo analysis fails with: ${msg(err).split("\n")[0]}`;
        }
        out.simError = `the shipped demo (src/report/demo.ts) has no rehearsal${why || " (demoState caught an error)"}`;
      }
      return out;
    })();
    shippedMemo.set(lang, p);
  }
  return p;
}

/** The English demo bundle most checks read: the shipped demo plus the modules. */
interface Bundle {
  e: EngineMod;
  a: Analysis;
  plan: TestPlan;
  sim?: SimMod;
  rehearsal?: Rehearsal;
  summary?: RehearsalSummary;
  simError?: string;
  source: string;
}
let bundleMemo: Promise<Bundle> | null = null;
function bundle(root: string): Promise<Bundle> {
  bundleMemo ??= (async () => {
    const e = await engine(root, ["analyze", "planTest", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]);
    const s = await shippedDemo(root, "en");
    const sim = await simMod(root, [...SIM_EXPORTS.filter((n) => n !== "rebuildRehearsal")]).catch(() => undefined);
    return { e, a: s.a, plan: s.plan, sim, rehearsal: s.rehearsal, summary: s.summary, simError: s.simError, source: s.source };
  })();
  return bundleMemo;
}

/** The demo report links the UI check opens: German first (the beta default), then en, es, pl; plus a text marker. */
export async function demoReport(root: string): Promise<{ token: string; marker: string; share: ShareState; tokens: Partial<Record<Lang, string>>; source: string }> {
  const t = await templates(root);
  const tokens: Partial<Record<Lang, string>> = {};
  let main: Shipped | null = null;
  for (const l of LANGS) {
    try {
      const s = await shippedDemo(root, l);
      tokens[l] = s.token;
      if (l === "de") main = s;
    } catch {
      /* the other languages still open */
    }
  }
  if (!main) main = await shippedDemo(root, "en");
  const words = t.DEMO_BUSINESS.match(/\p{L}{5,}/gu) ?? [];
  const marker = words.find((w) => !/^caf/i.test(w) && !/^demo/i.test(w)) ?? t.DEMO_BUSINESS;
  return { token: main.token, marker, share: main.share, tokens, source: main.source };
}

/** Text labels for "Why this changed" in every language: the four known ones plus whatever src/report/messages.ts says now. */
export async function whyLabels(root: string): Promise<string[]> {
  const out = new Set(DEFAULT_WHY_LABELS);
  try {
    const m = await load<Record<string, unknown>>(root, "src/report/messages.ts");
    for (const v of Object.values(m)) {
      const c = v as CatalogLike;
      if (!c || typeof c !== "object" || !c.en) continue;
      for (const [k, en] of Object.entries(c.en)) {
        if (typeof en !== "string" || !/^why this changed/i.test(en.trim())) continue;
        for (const l of LANGS) {
          const x = c[l]?.[k];
          if (typeof x === "string" && x.trim()) out.add(x.trim().replace(/[.:?!…]+$/, ""));
        }
      }
    }
  } catch {
    /* English only */
  }
  return [...out];
}

/** Source id → the TERMS key of its chip word. */
const CHIP_TERM: Record<string, "yourNumber" | "guess" | "calculated" | "imagined" | "demoData"> = { owner: "yourNumber", assumption: "guess", calculation: "calculated", imagined: "imagined", demo: "demoData" };

interface TermsMod {
  TERMS: Record<Lang, Record<string, string>>;
}
interface EngineMessagesMod {
  ENGINE_MESSAGES?: Record<string, Record<string, unknown>>;
  sourceLabel(s: string, lang?: Lang): string;
}

/** The TERMS words per language (src/i18n/terms.ts) with the engine's own chip words (sourceLabel), for the UI check. */
async function termWords(root: string): Promise<{ terms?: Record<Lang, TermWords>; error?: string }> {
  try {
    const t = await load<TermsMod>(root, "src/i18n/terms.ts", ["TERMS"]);
    const m = await load<EngineMessagesMod>(root, "src/engine/messages.ts", ["sourceLabel"]);
    const out = {} as Record<Lang, TermWords>;
    for (const l of LANGS) {
      const w = t.TERMS[l];
      if (!w) throw new Error(`TERMS has no ${l} block`);
      const missing = ["breakEven", "imagined", "imaginedCustomers"].filter((k) => !w[k]?.trim());
      if (missing.length) throw new Error(`TERMS.${l} has no ${missing.join(", ")}`);
      out[l] = { breakEven: w.breakEven!, imagined: w.imagined!, imaginedCustomers: w.imaginedCustomers!, chips: Object.fromEntries(SOURCES.map((s) => [s, m.sourceLabel(s, l)])) };
    }
    return { terms: out };
  } catch (e) {
    return { error: msg(e).split("\n")[0] };
  }
}

/** The rule-based caveat per language (src/sim/messages.ts CAVEATS), which a /try rehearsal must show. */
async function ruleCaveats(root: string): Promise<Partial<Record<Lang, string>> | undefined> {
  try {
    const m = await load<{ CAVEATS?: Record<string, Partial<Record<Lang, string>>> }>(root, "src/sim/messages.ts", ["CAVEATS"]);
    const c = m.CAVEATS?.["rule-based"];
    return c && typeof c === "object" ? c : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the site has a /r#demo-ai demo (the report page names that fragment). */
function siteHasDemoAi(root: string): boolean {
  return /["'`]demo-ai["'`]|#demo-ai\b|demo-ai\)/.test(readText(root, "site/src/report.ts") ?? "");
}

/** Everything the browser run needs; qa/run.ts and the standalone `node --import tsx qa/ui-check.ts` both use it. */
export async function uiOptions(root: string, base: string, beta: { betaBase?: string; betaError?: string } = {}): Promise<UiOptions> {
  const demo = await demoReport(root);
  const terms = await termWords(root);
  return {
    root,
    base,
    token: demo.token,
    tokens: demo.tokens,
    lang: "de",
    marker: demo.marker,
    whyLabels: await whyLabels(root),
    betaBase: beta.betaBase,
    betaCode: BETA_CODE,
    betaError: beta.betaError,
    terms: terms.terms,
    termsError: terms.error,
    ruleCaveats: await ruleCaveats(root),
    demoAi: siteHasDemoAi(root),
    shots: join(root, "qa/reports/ui"),
  };
}

// ---- every shipped demo, and a /try report, rendered statically per language ----

type Variant = "demo" | "demo-price" | "demo-result" | "try";
const VARIANTS: Variant[] = ["demo", "demo-price", "demo-result", "try"];
interface VariantRender {
  lang: Lang;
  variant: Variant;
  share: ShareState;
  a: Analysis;
  html: string;
  /** Every string the analysis, the plan, the result and the rehearsal summary hold (the slider's text for every position included). */
  strings: string[];
}

/** Every string value in a JSON-like object. */
function allStrings(x: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 10 || x === null || x === undefined) return out;
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) allStrings(v, out, depth + 1);
  else if (typeof x === "object") for (const v of Object.values(x as Record<string, unknown>)) allStrings(v, out, depth + 1);
  return out;
}

/**
 * The /try report the UI bot reaches: the lunch template's required fields with their example values (the
 * placeholders the wizard shows and the bot types), Neukölln, made by "try", no rehearsal.
 */
function tryShare(e: EngineMod, lang: Lang): ShareState {
  const t = typeof e.getTemplate === "function" ? e.getTemplate("lunch_offer") : e.TEMPLATES.lunch_offer;
  const inputs: RawInputs = {};
  for (const f of t?.fields ?? []) if (f.required && f.key !== "kiez") inputs[f.key] = f.example;
  inputs.kiez = "Neukölln";
  return { v: 1, template: "lunch_offer", inputs, lang, madeBy: "try", demo: false, currency: "EUR", question: t?.exampleQuestion ?? "" } as ShareState;
}

const variantMemo = new Map<string, Promise<VariantRender>>();
/** One demo (as /r#demo, /r#demo-price, /r#demo-result open it) or the /try report, rebuilt the way the report page does and rendered. */
function variantRender(root: string, lang: Lang, variant: Variant): Promise<VariantRender> {
  const key = `${lang}:${variant}`;
  let p = variantMemo.get(key);
  if (!p) {
    p = (async () => {
      const e = await rawEngine(root, ["analyze", "planTest", "compareResult", "demoInputs", "DEMO_BUSINESS", "TEMPLATES"]);
      const report = await reportMod(root);
      let share: ShareState;
      if (variant === "try") share = tryShare(e, lang);
      else {
        const d = await load<DemoMod>(root, "src/report/demo.ts", ["demoState"]);
        share = await inLang(root, lang, () => d.demoState(variant === "demo-price" ? "price_change" : "lunch_offer", { lang, ...(variant === "demo-result" ? { result: true } : {}) }));
      }
      const a = await inLang(root, lang, () => e.analyze(share.template, share.inputs, { business: share.business, question: share.question, demo: share.demo, currency: share.currency, lang }));
      const plan = await inLang(root, lang, () => e.planTest(a));
      let summary: RehearsalSummary | undefined;
      if (share.rehearsal) {
        const sim = await simMod(root, [...SIM_EXPORTS]);
        summary = await inLang(root, lang, () => sim.summarize(sim.rebuildRehearsal(a, share.rehearsal!)));
      }
      let result: TestResult | undefined;
      if (share.observed && Object.keys(share.observed).length) result = await inLang(root, lang, () => e.compareResult(a, share.observed!));
      const input = { analysis: a, plan, ...(summary ? { rehearsal: summary } : {}), ...(result ? { result } : {}), status: "final" as const, ...(share.madeBy ? { madeBy: share.madeBy } : {}) };
      const html = await inLang(root, lang, () => report.renderReport(input));
      return { lang, variant, share, a, html, strings: allStrings([a, plan, result, summary]) };
    })();
    variantMemo.set(key, p);
  }
  return p;
}

/** Visible text plus the accessible names (aria-label, title, alt, placeholder) of rendered HTML. */
function ownerText(html: string): string {
  const attrs = [...html.matchAll(/\b(?:aria-label|title|alt|placeholder)=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1] ?? "")).join("\n");
  return `${visibleText(html)}\n${attrs}`;
}

// ---- VAT honesty: the 7% rate for milk drinks is a take-away rule ----

const PCT = "[\\s\\u00a0\\u202f]?%";
const VAT_SEVEN = new RegExp(`(?<![\\d.,])7(?:[.,]0+)?${PCT}`);
const VAT_NINETEEN = new RegExp(`(?<![\\d.,])19(?:[.,]0+)?${PCT}`);
const VAT_MILK: Record<Lang, RegExp> = {
  en: new RegExp(`\\bmilk[- ]?(?:drinks?|based|beverages?)\\b|\\d+${PCT} (?:cow'?s )?milk\\b`, "i"),
  de: new RegExp(`milch(?:misch)?getränk|\\d+${PCT} (?:kuh)?milch`, "iu"),
  es: new RegExp(`bebidas? (?:lácteas?|con (?:al menos |como mínimo )?(?:un )?\\d+${PCT} de leche)|\\d+${PCT} de leche`, "iu"),
  pl: new RegExp(`napoj\\p{L}* mleczn\\p{L}*|\\d+${PCT} mleka`, "iu"),
};
const VAT_TAKEAWAY: Record<Lang, RegExp> = {
  en: /take[- ]?away|takeaway|\bto go\b|to take (?:out|away)|carry[- ]?out/i,
  de: /zum mitnehmen|mitnahme|au(?:ß|ss)er[- ]?haus|(?<!\p{L})to[- ]go(?!\p{L})/iu,
  es: /para llevar|a domicilio/iu,
  pl: /na wynos/iu,
};
const VAT_EAT_IN: Record<Lang, RegExp> = {
  en: /eat[- ]?in|drunk (?:in|at)|in the caf[eé]|on the premises|in-house|sit[- ]?in|at the table/i,
  de: /im (?:café|cafe|haus|lokal|laden)(?!\p{L})|vor ort|getrunken|am tisch|an ort und stelle/iu,
  es: /en el (?:local|café|cafe)|para tomar (?:allí|aquí|en el local)|en (?:la )?mesa|(?:consumid|tomad)[oa]s? en/iu,
  pl: /na miejscu|w kawiarni|w lokalu|przy stoliku/iu,
};
const VAT_NOT = /(?<!\p{L})(?:not|no|never|nicht|kein\p{L}*|nie|nunca|ningun\p{L}*)(?!\p{L})/iu;

/** The clauses of a text that give milk drinks 7%, and what is wrong with each (no take-away, or drunk in the café). */
function milkVatProblems(text: string, lang: Lang): { clause: string; ok: boolean; why: string }[] {
  const out: { clause: string; ok: boolean; why: string }[] = [];
  for (const raw of text.split(/(?<=[.!?])\s+|;|\n+/)) {
    const c = squash(raw);
    if (!VAT_MILK[lang].test(c) || !VAT_SEVEN.test(c)) continue;
    if (!VAT_TAKEAWAY[lang].test(c)) out.push({ clause: c, ok: false, why: "gives milk drinks 7% without saying it is only for take-away" });
    else if (VAT_EAT_IN[lang].test(c) && !VAT_NINETEEN.test(c) && !VAT_NOT.test(c)) out.push({ clause: c, ok: false, why: "gives milk drinks drunk in the café 7% (they are 19%)" });
    else out.push({ clause: c, ok: true, why: "" });
  }
  return out;
}

/** The texts of a catalog entry: the string, or a function's output for a few counts. */
function catalogTexts(v: unknown, lang: Lang): string[] {
  if (typeof v === "string") return [v];
  if (typeof v !== "function") return [];
  const out = new Set<string>();
  for (const n of [1, 2, 5]) {
    try {
      const s = (v as (p: Record<string, unknown>, l: Lang) => unknown)({ n }, lang);
      if (typeof s === "string") out.add(s);
    } catch {
      /* needs other parameters */
    }
  }
  return [...out];
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
const devMemos = new Map<string, Promise<Dev>>();
const devProcs = new Set<ChildProcess>();
/** Set by the build check: the dev server then serves that output (--no-build) instead of rebuilding it. */
let builtThisRun = false;

/** The invite code the beta server accepts (a test value, not a real code). */
export const BETA_CODE = "test-code-123";
const BETA_CONTACT = "beta-qa@example.org";

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

/** The open dev server (no invite codes): the one every other live check uses. */
export function devServer(root: string): Promise<Dev> {
  return startDev(root, "main", {}, () => builtThisRun);
}

/** A second dev server with WHATIF_BETA_CODES set (closed beta), serving the main server's build. */
export function betaServer(root: string): Promise<Dev> {
  return startDev(root, "beta", { WHATIF_BETA_CODES: BETA_CODE, WHATIF_BETA_CONTACT: BETA_CONTACT }, () => true, () => devServer(root));
}

function startDev(root: string, name: string, extraEnv: Record<string, string>, noBuild: () => boolean, before?: () => Promise<unknown>): Promise<Dev> {
  let memo = devMemos.get(name);
  if (memo) return memo;
  memo = (async () => {
    if (before) await before();
    const script = join(root, "scripts/dev.mjs");
    if (!existsSync(script)) throw new Missing("scripts/dev.mjs does not exist yet");
    const port = await freePort();
    const out: string[] = [];
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), WHATIF_SITE_URL: `http://localhost:${port}`, FORCE_COLOR: "0", ...extraEnv };
    // The open server must be open even when the shell has beta variables set.
    if (!extraEnv.WHATIF_BETA_CODES) delete env.WHATIF_BETA_CODES;
    if (!extraEnv.WHATIF_BETA_CONTACT) delete env.WHATIF_BETA_CONTACT;
    const child = spawn(process.execPath, noBuild() ? [script, "--no-build"] : [script], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    devProcs.add(child);
    let exited: number | null | undefined;
    child.on("exit", (c) => (exited = c));
    child.stdout?.on("data", (d: Buffer) => out.push(String(d)));
    child.stderr?.on("data", (d: Buffer) => out.push(String(d)));
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (exited !== undefined) {
        const noBuild = !existsSync(join(root, ".vercel/output/config.json"));
        throw new Error(`scripts/dev.mjs exited (code ${exited}) before answering${noBuild ? ": there is no .vercel/output to serve because the build failed (see the build check)" : ""}:\n${tail(out.join(""), 800)}`);
      }
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
  devMemos.set(name, memo);
  return memo;
}

export function stopDev(): void {
  const procs = [...devProcs];
  devProcs.clear();
  devMemos.clear();
  for (const p of procs) {
    if (p.exitCode !== null || p.pid === undefined) continue;
    if (isWin) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
    else p.kill("SIGTERM");
  }
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

// ---- scratch copies of the repo: a production-like build and a CRLF checkout ----
// They live in node_modules/.cache/what-if-qa: packages resolve from the repo's node_modules,
// tsc and git ignore the folder, and the real .vercel/output (served by the dev server) is never touched.

const SCRATCH = "node_modules/.cache/what-if-qa";
const PROD_URL = "https://example.vercel.app";
const TEXT_FILE = /\.(ts|mts|mjs|js|css|html?|md|json|svg|txt|webmanifest|ya?ml)$/i;
const scratchDirs = new Set<string>();

/** Copies the parts of the repo a build or the tests need; `eol` rewrites every text file to LF or CRLF. */
function scratchCopy(root: string, name: string, eol?: "lf" | "crlf"): string {
  const dir = join(root, SCRATCH, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  scratchDirs.add(dir);
  scratchRoots.add(root);
  for (const d of ["src", "site", "skill", "scripts", "test"]) {
    const from = join(root, d);
    if (existsSync(from)) cpSync(from, join(dir, d), { recursive: true, filter: (s) => !/(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(relative(from, s)) });
  }
  for (const f of ["package.json", "tsconfig.json"]) if (existsSync(join(root, f))) cpSync(join(root, f), join(dir, f));
  if (eol)
    for (const f of listFiles(dir, (x) => TEXT_FILE.test(x))) {
      const lf = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      writeFileSync(f, eol === "crlf" ? lf.replace(/\n/g, "\r\n") : lf);
    }
  return dir;
}

function removeScratch(): void {
  for (const d of scratchDirs) rmSync(d, { recursive: true, force: true });
  scratchDirs.clear();
  for (const root of scratchRoots) {
    const dir = join(root, SCRATCH);
    if (existsSync(dir) && !readdirSync(dir).length) rmSync(dir, { recursive: true, force: true });
  }
}
const scratchRoots = new Set<string>();

interface ProdBuild {
  dir: string;
  zip: Record<string, Uint8Array> | null;
  out: string;
}
const prodMemos = new Map<string, Promise<ProdBuild>>();
/**
 * `node scripts/build.mjs` with WHATIF_SITE_URL=https://example.vercel.app, in a scratch copy;
 * contact "set" gives it WHATIF_BETA_CONTACT, "empty" leaves the contact empty (allowed: the site then hides the request button).
 */
function prodBuild(root: string, contact: "set" | "empty" = "set"): Promise<ProdBuild> {
  let memo = prodMemos.get(contact);
  if (memo) return memo;
  memo = (async () => {
    if (!existsSync(join(root, "scripts/build.mjs"))) throw new Missing("scripts/build.mjs does not exist yet");
    const dir = scratchCopy(root, contact === "set" ? "prod-build" : "prod-build-nocontact");
    const r = proc(process.execPath, [join(dir, "scripts/build.mjs")], dir, 5 * 60_000, { WHATIF_SITE_URL: PROD_URL, WHATIF_BETA_CONTACT: contact === "set" ? BETA_CONTACT : "" });
    const zipPath = join(dir, ".vercel/output/static/what-if-skill.zip");
    if (r.code !== 0) throw new Error(`the production-like build (WHATIF_SITE_URL=${PROD_URL}, WHATIF_BETA_CONTACT ${contact === "set" ? "set" : "empty"}) failed: exit ${r.code}\n${tail(r.out, 800)}`);
    let zip: Record<string, Uint8Array> | null = null;
    if (existsSync(zipPath)) {
      const { unzipSync } = (await import("fflate")) as typeof import("fflate");
      zip = unzipSync(new Uint8Array(readFileSync(zipPath)));
    }
    return { dir, zip, out: r.out };
  })();
  prodMemos.set(contact, memo);
  return memo;
}

async function unzipText(path: string): Promise<{ files: Record<string, string>; error?: string }> {
  const { unzipSync, strFromU8 } = (await import("fflate")) as typeof import("fflate");
  try {
    const raw = unzipSync(new Uint8Array(readFileSync(path)));
    return { files: Object.fromEntries(Object.entries(raw).filter(([n]) => !n.endsWith("/") && (TEXT_FILE.test(n) || !extname(n))).map(([n, d]) => [n, strFromU8(d)])) };
  } catch (e) {
    return { files: {}, error: `not a valid zip: ${msg(e)}` };
  }
}

/** Every …/api/mcp URL in a text, with its host. */
const mcpUrls = (s: string) => [...s.matchAll(/\b(https?):\/\/([^\s/)`'"<>]+)[^\s)`'"<>]*?\/api\/mcp\b[^\s)`'"<>]*/g)].map((m) => ({ url: m[0], scheme: m[1]!, host: m[2]!.toLowerCase() }));
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$|\.localhost(:\d+)?$/;

// ---- language helpers ----

/** Sentences that say the imagined customers were played by an AI, per language (negated or conditional sentences are fine). */
const AI_PLAYED: Record<Lang, { claim: RegExp; ok: RegExp }> = {
  en: {
    claim: /\b(played|acted|voiced|role-?played|written) by (an |the |a )?(AI|model|language model|Claude)\b|\b(an |the )?AI (plays|played|role-?plays|acted)\b/i,
    ok: /\b(not|no|never|isn't|aren't|wasn't|without|if|when|whenever|with your|would|could|instead)\b|n't\b/i,
  },
  de: {
    claim: /\b(von|durch) (einer |der |einem )?(KI|AI|Sprachmodell|Claude) (gespielt|verkörpert|dargestellt|geschrieben)|\b(gespielt|verkörpert|dargestellt) (von|durch) (einer |der |einem )?(KI|AI|Sprachmodell|Claude)\b|\b(eine |die )?KI spielt\b/i,
    ok: /\b(nicht|keine?|keinem|keiner|nie|wenn|falls|sobald|mit Ihrem|mit Ihrer|würde|statt)\b/i,
  },
  es: {
    claim: /\b(interpretad|representad|jugad|escrit)[oa]s? por (una |la |un |el )?(IA|AI|modelo|Claude)\b|\b(la |una )?IA (interpreta|representa|juega)\b/i,
    ok: /\b(no|nunca|ningún|ninguna|si|cuando|con tu|con su|en lugar)\b/i,
  },
  pl: {
    claim: /\b(odgrywan|grane|grani|odegran|napisan)\w* przez (AI|SI|model|Claude)\b|\b(AI|SI|model) (odgrywa|gra)\b/i,
    ok: /\b(nie|jeśli|jeżeli|gdy|kiedy|z twoim|zamiast)\b/i,
  },
};

function aiPlayedClaims(text: string, lang: Lang): string[] {
  const p = AI_PLAYED[lang];
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => p.claim.test(s) && !p.ok.test(s))
    .map((s) => `"${squash(s).slice(0, 120)}"`);
}

/** The element (balanced tags) that starts at `start` in an HTML string. */
function elementAt(html: string, start: number): string {
  const tag = /^<([a-z][a-z0-9-]*)/i.exec(html.slice(start))?.[1]?.toLowerCase();
  if (!tag) return "";
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

/** The smallest card/section around a piece of text: the nearest enclosing div/section/article/aside whose class says card (or any section). */
function enclosing(html: string, index: number): string {
  const opens = [...html.slice(0, index).matchAll(/<(div|section|article|aside)\b[^>]*>/gi)].reverse();
  for (const m of opens) {
    const el = elementAt(html, m.index ?? 0);
    if ((m.index ?? 0) + el.length <= index) continue;
    if (/^<(section|article|aside)/i.test(m[0]) || /class=["'][^"']*\b(card|box|panel|checkreal)/i.test(m[0])) return el;
  }
  return "";
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
    try {
      base = (await devServer(root)).base;
    } catch (e) {
      return UI_CHECKS.map((c) => ({ id: c.id, ok: false, detail: `cannot open the site: ${msg(e).split("\n")[0]}` }));
    }
    let betaBase: string | undefined;
    let betaError: string | undefined;
    try {
      betaBase = (await betaServer(root)).base;
    } catch (e) {
      betaError = `the beta dev server (WHATIF_BETA_CODES set) did not start: ${msg(e).split("\n")[0]}`;
    }
    let opts: UiOptions;
    try {
      opts = await uiOptions(root, base, { betaBase, betaError });
    } catch (e) {
      return UI_CHECKS.map((c) => ({ id: c.id, ok: false, detail: `cannot build the demo report links: ${msg(e).split("\n")[0]}` }));
    }
    // One deadline for the whole browser run, so a hanging page fails every ui-* check once instead of each one waiting out its own timeout.
    const hard = UI_BUDGET_MS + 120_000;
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<UiResult[]>((resolveLate) => {
      timer = setTimeout(() => resolveLate(UI_CHECKS.map((c) => ({ id: c.id, ok: false, detail: `the browser run did not finish within ${Math.round(hard / 1000)} s (a page may hang; run node --import tsx qa/ui-check.ts to see where)` }))), hard);
    });
    return Promise.race([runUiCheck(opts), late]).finally(() => clearTimeout(timer));
  })();
  return uiMemo;
}

/** The static report HTML for the shipped demo in one language (with its rehearsal), rendered once; a copy goes to qa/reports/ui for the judges. */
const renderedLangMemo = new Map<Lang, Promise<{ s: Shipped; html: string; styles: string }>>();
function renderedLang(root: string, lang: Lang) {
  let p = renderedLangMemo.get(lang);
  if (!p) {
    p = (async () => {
      const [s, report] = await Promise.all([shippedDemo(root, lang), reportMod(root)]);
      const html = await inLang(root, lang, () => report.renderReport({ analysis: s.a, plan: s.plan, ...(s.summary ? { rehearsal: s.summary } : {}), status: "final" }));
      const styles = typeof report.reportStyles === "function" ? report.reportStyles() : "";
      try {
        const dir = join(root, "qa/reports/ui");
        mkdirSync(dir, { recursive: true });
        const name = lang === "en" ? "report-static.html" : `report-static.${lang}.html`;
        writeFileSync(join(dir, name), `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>What-IF demo report (static, ${lang})</title><style>${styles}</style><main>${html}</main></html>`);
      } catch {
        /* the copy for judges is a convenience */
      }
      return { s, html, styles };
    })();
    renderedLangMemo.set(lang, p);
  }
  return p;
}

/** The English static report of the shipped demo, with the modules (most visual checks read this). */
async function rendered(root: string): Promise<{ b: Bundle; report: ReportMod; html: string; styles: string }> {
  const [b, report, en] = await Promise.all([bundle(root), reportMod(root), renderedLang(root, "en")]);
  return { b, report, html: en.html, styles: en.styles };
}

/** Steps in a rendered report: data-step, id=step-N, a progress list or section.step (best signal wins). */
function countSteps(html: string): { n: number; how: string } | null {
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
  return best ? { n: best[1], how: best[0] } : null;
}

/** English UI phrases in a non-English render: visible text and the aria-label/title/alt/placeholder attributes. */
function englishLeaks(html: string): string[] {
  const attrs = [...html.matchAll(/\b(?:aria-label|title|alt|placeholder)=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1] ?? "")).join(" \n ");
  return englishHits(`${visibleText(html)}\n${attrs}`);
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
  {
    id: "engine-lang",
    component: "engine",
    title: "analyze(…, { lang }) writes the analysis in de/en/es/pl: Analysis.lang is set, the texts are translated, money is formatted per language (9,90 € in de, €9.90 in en)",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await rawEngine(root);
      const problems: string[] = [];
      const texts = (a: Analysis) => [a.breakEven?.plain, a.worstCase?.plain, ...(a.scenarios ?? []).map((s) => s.plain), ...(a.lessons ?? []), a.biggestUncertainty?.plain].filter((x): x is string => typeof x === "string" && !!x.trim());
      const by: Partial<Record<Lang, Analysis>> = {};
      for (const lang of LANGS) {
        try {
          by[lang] = e.analyze("lunch_offer", e.demoInputs("lunch_offer"), { demo: true, lang });
        } catch (err) {
          problems.push(`${lang}: analyze threw: ${msg(err).split("\n")[0]}`);
        }
      }
      const en = by.en;
      for (const lang of LANGS) {
        const a = by[lang];
        if (!a) continue;
        if ((a as Analysis & { lang?: string }).lang !== lang) problems.push(`${lang}: Analysis.lang is ${JSON.stringify((a as Analysis & { lang?: string }).lang)}`);
        const json = JSON.stringify(a);
        if (lang === "en") {
          if (!/€\d/.test(json)) problems.push("en: no money written as €9.90");
        } else {
          if (!/\d,\d{2}[\s  ]?€/.test(json)) problems.push(`${lang}: no money written as 9,90 €`);
          if (/€\d/.test(json)) problems.push(`${lang}: money written the English way (${/€\d[\d.,]*/.exec(json)?.[0]})`);
          if (en) {
            const mine = texts(a), base = texts(en);
            const same = mine.filter((t, i) => t === base[i]);
            if (!mine.length) problems.push(`${lang}: no plain texts`);
            else if (same.length > Math.floor(mine.length * 0.2)) problems.push(`${lang}: ${same.length} of ${mine.length} plain texts are still English, e.g. "${squash(same[0] ?? "").slice(0, 70)}"`);
          }
        }
      }
      return verdict(problems.slice(0, 10), `4 languages; de break-even: "${squash(by.de?.breakEven?.plain ?? "").slice(0, 90)}"`);
    },
  },
  {
    id: "engine-messages",
    component: "engine",
    title: "src/engine/messages.ts: every en key is translated in de, es and pl",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: (root) => catalogCheck(root, "src/engine/messages.ts"),
  },
  {
    id: "engine-staff-hours",
    component: "engine",
    title: "staff cost is extra_staff_hours_per_day × staff_hourly_cost (fallback €13.90 minimum wage, tagged a guess; demo 1 h at €18); extra_staff_cost_per_day is gone",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root);
      const t = e.TEMPLATES.lunch_offer;
      if (!t) return { ok: false, detail: "no lunch_offer template" };
      const keys = t.fields.map((f) => f.key);
      const problems: string[] = [];
      for (const k of ["extra_staff_hours_per_day", "staff_hourly_cost"]) if (!keys.includes(k)) problems.push(`lunch_offer has no field ${k}`);
      if (keys.includes("extra_staff_cost_per_day")) problems.push("lunch_offer still has extra_staff_cost_per_day (replaced by hours × hourly cost)");
      if (problems.length) return { ok: false, detail: problems.join("\n") };
      const demo = e.demoInputs("lunch_offer");
      if (Number(demo.extra_staff_hours_per_day) !== 1 || Number(demo.staff_hourly_cost) !== 18) problems.push(`demo staff: ${demo.extra_staff_hours_per_day} h at ${demo.staff_hourly_cost} (want 1 h at €18.00)`);
      const noCost: RawInputs = { ...demo, extra_staff_hours_per_day: 1 };
      delete noCost.staff_hourly_cost;
      const a = e.analyze("lunch_offer", noCost, { demo: false, business: "Café QA" });
      const hc = a.inputs.find((i) => i.key === "staff_hourly_cost");
      if (!hc) problems.push("staff_hourly_cost is not in the resolved inputs when the owner leaves it out");
      else {
        if (Math.abs(Number(hc.value) - 13.9) > 0.001) problems.push(`staff_hourly_cost falls back to ${hc.value} (want 13.90, the minimum wage since 1 Jan 2026)`);
        if (hc.source !== "assumption") problems.push(`the fallback hourly cost is tagged "${hc.source}" (want "assumption": a guess)`);
        if (!hc.note?.trim()) problems.push("the fallback hourly cost has no note (say real costs are higher once employer contributions are added)");
      }
      const net = (raw: RawInputs) => e.analyze("lunch_offer", raw, { demo: true }).scenarios.find((s) => s.id === "expected")?.netTest ?? NaN;
      const days = Number(e.analyze("lunch_offer", demo, { demo: true }).inputs.find((i) => i.key === "test_days")?.value ?? 10);
      const diff = net({ ...demo, extra_staff_hours_per_day: 2, staff_hourly_cost: 20 }) - net({ ...demo, extra_staff_hours_per_day: 0 });
      if (!(Math.abs(diff + 40 * days) <= 1)) problems.push(`2 h × €20 a day over ${days} test days moves the expected result by ${fmt(diff)} (want −${40 * days})`);
      return verdict(problems, `2 h × €20 over ${days} days = ${fmt(diff)}; fallback ${hc?.value} (${hc?.source})`);
    },
  },
  {
    id: "berlin-number-parsing",
    component: "engine",
    title: "German number writing parses: \"1.500 €\" → 1500, \"9,90\" → 9.9, \"ca. 40\" → 40 (lang de); English \"1,500\" → 1500 still works",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await rawEngine(root, ["checkInputs", "demoInputs"]);
      const problems: string[] = [];
      const cases: [Lang, string, string, number][] = [
        ["de", "cash_buffer", "1.500 €", 1500],
        ["de", "lunch_spend", "9,90", 9.9],
        ["de", "lunch_customers", "ca. 40", 40],
        ["de", "monthly_fixed_costs", "16.500", 16500],
        ["en", "cash_buffer", "1,500", 1500],
        ["en", "lunch_spend", "9.90", 9.9],
      ];
      const got: string[] = [];
      for (const lang of ["de", "en"] as const) {
        const mine = cases.filter((c) => c[0] === lang);
        const raw: RawInputs = { ...e.demoInputs("lunch_offer"), ...Object.fromEntries(mine.map((c) => [c[1], c[2]])) };
        let c: InputCheck;
        try {
          c = await inLang(root, lang, () => e.checkInputs("lunch_offer", raw, { lang }));
        } catch (err) {
          problems.push(`${lang}: checkInputs threw: ${msg(err).split("\n")[0]}`);
          continue;
        }
        for (const [, key, text, want] of mine) {
          const v = c.resolved.find((r) => r.key === key)?.value;
          got.push(`${lang} "${text}" → ${v}`);
          if (typeof v !== "number" || Math.abs(v - want) > 1e-9) problems.push(`${lang}: ${key} "${text}" became ${JSON.stringify(v)} (want ${want})${c.problems.length ? `; problems: ${c.problems.join(" ").slice(0, 120)}` : ""}`);
        }
      }
      return verdict(problems, got.join(", "));
    },
  },
  {
    id: "berlin-vat",
    component: "engine",
    title: "VAT: prices are gross and the engine works on net prices; vat_rate falls back to 10.6% (lunch) and 19% (price change) as guesses; more VAT means a smaller deal margin",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root);
      const problems: string[] = [];
      const info: string[] = [];
      for (const [t, fallback] of [["lunch_offer", 0.106], ["price_change", 0.19]] as const) {
        const keys = (e.TEMPLATES[t]?.fields ?? []).map((f) => f.key);
        if (!keys.includes("vat_rate")) {
          problems.push(`${t} has no vat_rate field`);
          continue;
        }
        const demo = e.demoInputs(t);
        const raw: RawInputs = { ...demo };
        delete raw.vat_rate;
        const a = e.analyze(t, raw, { demo: false, business: "Café QA" });
        const v = a.inputs.find((i) => i.key === "vat_rate");
        if (!v) problems.push(`${t}: vat_rate is not in the resolved inputs when left out`);
        else {
          if (Math.abs(Number(v.value) - fallback) > 0.0005) problems.push(`${t}: vat_rate falls back to ${v.value} (want ${fallback})`);
          if (v.source !== "assumption") problems.push(`${t}: the VAT fallback is tagged "${v.source}" (want "assumption")`);
          if (!/steuerberater|tax adviser|accountant/i.test(v.note ?? "") && t === "lunch_offer") problems.push(`${t}: the VAT fallback note does not say to ask the Steuerberater ("${(v.note ?? "").slice(0, 80)}")`);
        }
        const at = (rate: number) => e.analyze(t, { ...demo, vat_rate: rate }, { demo: true });
        const lo = at(0.07), hi = at(0.19);
        const nlo = lo.scenarios.find((s) => s.id === "expected")?.netTest ?? NaN, nhi = hi.scenarios.find((s) => s.id === "expected")?.netTest ?? NaN;
        if (t === "lunch_offer") {
          if (!(nhi < nlo)) problems.push(`lunch_offer: the expected result is ${fmt(nlo)} at 7% VAT and ${fmt(nhi)} at 19% (more VAT must leave less per deal)`);
          if (!(hi.breakEven.value >= lo.breakEven.value)) problems.push(`lunch_offer: break-even ${lo.breakEven.value} at 7% and ${hi.breakEven.value} at 19% (it cannot fall when VAT rises)`);
          if (!/\bVAT\b/.test(JSON.stringify(lo))) problems.push("lunch_offer: the analysis never says VAT (the owner should see that prices are counted without it)");
        } else if (!(Math.abs(nhi - nlo) > 0.5)) problems.push(`price_change: the VAT rate does not change the result (${fmt(nlo)} at 7%, ${fmt(nhi)} at 19%)`);
        info.push(`${t}: ${fmt(nlo)} at 7% → ${fmt(nhi)} at 19%`);
      }
      return verdict(problems, info.join("; "));
    },
  },
  {
    id: "berlin-facts",
    component: "engine",
    title: "Analysis.facts lists the public facts the numbers used (VAT rates, minimum wage), each with a source, an https URL and a date",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const e = await engine(root);
      const raw: RawInputs = { ...e.demoInputs("lunch_offer"), extra_staff_hours_per_day: 1 };
      delete raw.vat_rate;
      delete raw.staff_hourly_cost;
      const a = e.analyze("lunch_offer", raw, { demo: false, business: "Café QA" }) as Analysis & { facts?: Json[] };
      const facts = a.facts;
      if (!Array.isArray(facts)) return { ok: false, detail: "Analysis.facts is missing (want PublicFact[]: id, label, value, source, url, asOf)" };
      const problems: string[] = [];
      const text = (f: Json) => `${f?.id ?? ""} ${f?.label ?? ""} ${f?.source ?? ""}`;
      const vat = facts.filter((f) => /vat|mwst|ust\b|umsatzsteuer|mehrwert/i.test(text(f)));
      const wage = facts.filter((f) => /mindestlohn|minimum.?wage|min.?wage/i.test(text(f)));
      if (!vat.length) problems.push("no VAT fact (VAT 7% food / 19% drinks since 1 Jan 2026)");
      if (!wage.length) problems.push("no minimum-wage fact (€13.90 since 1 Jan 2026), although the hourly cost fell back to it");
      for (const f of facts) {
        const id = String(f?.id ?? f?.label ?? "?");
        for (const k of ["label", "value", "source"]) if (!String(f?.[k] ?? "").trim()) problems.push(`${id}: no ${k}`);
        if (!/^https:\/\/[^\s]+\.[a-z]{2,}/i.test(String(f?.url ?? ""))) problems.push(`${id}: url ${JSON.stringify(f?.url)} is not an https link`);
        const d = String(f?.asOf ?? "");
        if (!/^\d{4}-\d{2}-\d{2}/.test(d) || Number.isNaN(Date.parse(d))) problems.push(`${id}: asOf ${JSON.stringify(f?.asOf)} is not an ISO date`);
      }
      const demoFacts = (e.analyze("lunch_offer", e.demoInputs("lunch_offer"), { demo: true }) as Analysis & { facts?: Json[] }).facts ?? [];
      if (!demoFacts.length) problems.push("the demo analysis lists no public facts (its prices still count VAT)");
      const price = (e.analyze("price_change", e.demoInputs("price_change"), { demo: true }) as Analysis & { facts?: Json[] }).facts ?? [];
      if (!price.some((f) => /vat|mwst|ust\b|umsatzsteuer|mehrwert/i.test(text(f)))) problems.push("the price-change analysis lists no VAT fact");
      return verdict(problems.slice(0, 10), `${facts.length} facts: ${facts.map((f) => `${f?.label ?? f?.id} (${f?.asOf})`).join("; ")}`);
    },
  },
  {
    id: "berlin-vat-takeaway",
    component: "engine",
    title: "VAT honesty: in every language the engine texts give the 7% milk-drink rate for take-away only, and no text (engine, analysis, report or site) says milk drinks drunk in the café are 7% (they are 19%)",
    command: "node --import tsx qa/run.ts --no-loop --only engine",
    run: async (root) => {
      const m = await load<EngineMessagesMod>(root, "src/engine/messages.ts", ["ENGINE_MESSAGES"]);
      const problems: string[] = [];
      const ruleIn = new Set<Lang>();
      let clauses = 0;
      const scan = (where: string, lang: Lang, text: string, engineText: boolean) => {
        for (const p of milkVatProblems(text, lang)) {
          clauses++;
          if (p.ok) {
            if (engineText) ruleIn.add(lang);
          } else problems.push(`${where} (${lang}) ${p.why}: "${p.clause.slice(0, 150)}"`);
        }
      };
      for (const l of LANGS) for (const [k, v] of Object.entries(m.ENGINE_MESSAGES?.[l] ?? {})) for (const s of catalogTexts(v, l)) scan(`src/engine/messages${l === "en" ? "" : `.${l}`}.ts ${k}`, l, s, true);
      // What the analyses say (facts, notes, questions), in case a sentence is built outside the catalog.
      try {
        const e = await rawEngine(root);
        for (const l of LANGS)
          for (const t of ["lunch_offer", "price_change"]) {
            const raw: RawInputs = { ...e.demoInputs(t) };
            delete raw.vat_rate;
            for (const s of new Set(allStrings(e.analyze(t, raw, { demo: false, business: "Café QA", lang: l })))) scan(`analyze("${t}") without vat_rate`, l, s, false);
          }
      } catch (err) {
        problems.push(`the analyses could not be read: ${msg(err).split("\n")[0]}`);
      }
      // The report's and the site's catalogs (the landing's facts box).
      for (const [rel, name] of [["src/report/messages.ts", "REPORT_MESSAGES"], ["site/src/messages.ts", "SITE_MESSAGES"]] as const) {
        try {
          const c = (await load<Record<string, unknown>>(root, rel, [name]))[name] as CatalogLike;
          for (const l of LANGS) for (const [k, v] of Object.entries(c[l] ?? {})) for (const s of catalogTexts(v, l)) scan(`${rel} ${k}`, l, s, false);
        } catch (err) {
          problems.push(`${rel}: ${msg(err).split("\n")[0]}`);
        }
      }
      for (const l of LANGS) if (!ruleIn.has(l)) problems.push(`${l}: no engine text states the take-away rule (milk drinks with at least 75% milk: 7% only to take away; drunk in the café: 19%)`);
      return verdict([...new Set(problems)].slice(0, 10), `${clauses} milk-drink 7% clauses in the engine, analysis, report and site texts; every one says take-away, in ${[...ruleIn].join(", ")}`);
    },
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
      // v0.2: staff cost is hours × hourly cost (extra_staff_cost_per_day is gone; it is ignored if still sent).
      const canary: RawInputs = { monthly_fixed_costs: 23456, cash_buffer: 4321, offer_cost: 3.17, setup_cost: 247.31, extra_staff_hours_per_day: 1.5, staff_hourly_cost: 19.37, variable_cost_share: 0.291, marketing_per_week: 27.13 };
      const leaks = [/23[.,\s]?456/, /\b4[.,\s]?321\b/, /\b3[.,]17\b/, /\b247[.,]31\b/, /\b19[.,]37\b/, /\b29[.,]1\s?%|\b0[.,]291\b/, /\b27[.,]13\b/, /\b29[.,]06\b/];
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
  {
    id: "sim-messages",
    component: "rehearsal",
    title: "src/sim/messages.ts: every en key is translated in de, es and pl",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: (root) => catalogCheck(root, "src/sim/messages.ts"),
  },
  {
    id: "sim-lang",
    component: "rehearsal",
    title: "the rehearsal follows the analysis language: briefs ask for answers in German/Spanish/Polish, the rule-based text and the caveat are translated",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await rawEngine(root);
      const sim = await simMod(root);
      const problems: string[] = [];
      const name: Record<Lang, RegExp> = { de: /German|Deutsch/i, en: /English/i, es: /Spanish|Español|espanol|castellano/i, pl: /Polish|polsk/i };
      const runs: Partial<Record<Lang, { caveat: string; thought: string }>> = {};
      for (const lang of LANGS) {
        try {
          const a = e.analyze("lunch_offer", e.demoInputs("lunch_offer"), { demo: true, lang });
          const r0 = await inLang(root, lang, () => sim.startRehearsal(a, { seed: 3 }));
          const brief = sim.roundBriefs(r0)[0]?.prompt ?? "";
          if (lang !== "en" && !name[lang].test(brief)) problems.push(`${lang}: the round-1 brief does not tell the imagined customer to write in ${name[lang].source.split("|")[0]}`);
          const r = await inLang(root, lang, () => playAll(sim, r0));
          runs[lang] = { caveat: sim.summarize(r).caveat ?? "", thought: r.reactions[0]?.thought ?? "" };
        } catch (err) {
          problems.push(`${lang}: ${msg(err).split("\n")[0]}`);
        }
      }
      for (const lang of LANGS.filter((l) => l !== "en")) {
        const x = runs[lang], en = runs.en;
        if (!x || !en) continue;
        if (x.caveat === en.caveat) problems.push(`${lang}: the summary caveat is still English ("${x.caveat.slice(0, 60)}…")`);
        if (x.thought && x.thought === en.thought) problems.push(`${lang}: the rule-based customers still think in English ("${x.thought.slice(0, 60)}")`);
      }
      return verdict(problems, `de caveat: "${(runs.de?.caveat ?? "").slice(0, 90)}…"`);
    },
  },
  {
    id: "sim-honest-method",
    component: "rehearsal",
    title: "honesty: a rule-based rehearsal (summary, caveat and report) never says the customers were played by an AI, in any of the four languages",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await rawEngine(root);
      const sim = await simMod(root);
      const report = await reportMod(root).catch(() => null);
      const problems: string[] = [];
      const methods: string[] = [];
      for (const lang of LANGS) {
        try {
          const a = e.analyze("lunch_offer", e.demoInputs("lunch_offer"), { demo: true, lang });
          const r = await inLang(root, lang, () => playAll(sim, sim.startRehearsal(a, { seed: 11 })));
          const s = await inLang(root, lang, () => sim.summarize(r));
          methods.push(`${lang}: ${s.method}`);
          if (s.method !== "rule-based") problems.push(`${lang}: summary.method is "${s.method}" for a run played only by the rule-based stand-in`);
          const claims = aiPlayedClaims([s.caveat, ...(s.checkWithRealCustomers ?? [])].join("\n"), lang);
          if (claims.length) problems.push(`${lang}: the summary says an AI played the customers: ${claims[0]}`);
          if (report) {
            const html = await inLang(root, lang, () => report.renderReport({ analysis: a, rehearsal: s, status: "final" }));
            const inReport = aiPlayedClaims(visibleText(html), lang);
            if (inReport.length) problems.push(`${lang}: the report says an AI played these rule-based customers: ${inReport[0]}`);
          }
        } catch (err) {
          problems.push(`${lang}: ${msg(err).split("\n")[0]}`);
        }
      }
      // The shipped demo (what /r#demo shows) too.
      try {
        const { html, s } = await renderedLang(root, "en");
        if (s.summary?.method === "rule-based") {
          const c = aiPlayedClaims(visibleText(html), "en");
          if (c.length) problems.push(`the shipped demo report says an AI played its rule-based customers: ${c[0]}`);
        }
      } catch {
        /* covered above */
      }
      return verdict([...new Set(problems)].slice(0, 10), `no "played by an AI" for rule-based runs (${methods.join(", ")})`);
    },
  },
  {
    id: "sim-kiez-mix",
    component: "rehearsal",
    title: "the Kiez input changes the imagined customer mix (same seed, different Kiez, different people) and shows up in the rehearsal",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const e = await engine(root);
      const sim = await simMod(root);
      const problems: string[] = [];
      const keys = (e.TEMPLATES.lunch_offer?.fields ?? []).map((f) => f.key);
      if (!keys.includes("kiez")) return { ok: false, detail: "lunch_offer has no kiez field yet (docs/ARCHITECTURE.md: optional text choice from BERLIN_KIEZE)" };
      const kieze = ["Neukölln", "Charlottenburg", "Prenzlauer Berg", "Spandau", "Mitte"];
      const mixOf = (kiez: string, seed: number) => {
        const a = e.analyze("lunch_offer", { ...e.demoInputs("lunch_offer"), kiez }, { demo: true });
        const r = sim.startRehearsal(a, { seed });
        return { mix: r.personas.map((p) => p.segment).sort().join(","), json: JSON.stringify(r) };
      };
      let differing = 0;
      const seen: string[] = [];
      for (const seed of [1, 2, 3]) {
        const mixes = kieze.map((k) => mixOf(k, seed));
        const distinct = new Set(mixes.map((m) => m.mix)).size;
        if (distinct > 1) differing++;
        seen.push(`seed ${seed}: ${distinct} mixes`);
        if (seed === 1)
          for (const [i, k] of kieze.entries()) if (!(mixes[i]?.json ?? "").includes(k)) problems.push(`the rehearsal for ${k} never mentions ${k}`);
      }
      if (differing < 2) problems.push(`the Kiez barely changes who is imagined (${seen.join("; ")}): with ${kieze.length} Kieze and the same seed the segment mix should differ`);
      try {
        const k = await loadExport<unknown>(root, "BERLIN_KIEZE", ["src/engine/index.ts", "src/sim/index.ts"]);
        const list = Array.isArray(k.value) ? k.value : Object.keys(k.value as object);
        if (list.length < 18) problems.push(`BERLIN_KIEZE (${k.file}) has ${list.length} entries (want the 18 Kieze plus "other")`);
      } catch (err) {
        problems.push(msg(err));
      }
      return verdict(problems, `${seen.join("; ")}; every Kiez named in its rehearsal`);
    },
  },
  {
    id: "sim-berlin-events",
    component: "rehearsal",
    title: "BERLIN_EVENTS has the 8 owner \"what if\" events (BVG strike, rain week, 32 °C heatwave, Baustelle, school holidays, a rival café with an €8.50 lunch, a Kiez festival, a Christmas market), each with texts in de/en/es/pl",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const found = await loadExport<unknown>(root, "BERLIN_EVENTS", ["src/sim/index.ts", "src/sim/events.ts", "src/engine/index.ts"]);
      const raw = found.value;
      const entries: [string, Json][] = Array.isArray(raw) ? raw.map((x: Json, i: number) => [String(x?.id ?? `#${i}`), x]) : raw && typeof raw === "object" ? Object.entries(raw as object) : [];
      const textsOf = (x: Json): Partial<Record<Lang, string>> => {
        const t = x?.text ?? x?.texts ?? x?.label ?? x?.labels ?? x;
        if (typeof t === "function") return Object.fromEntries(LANGS.map((l) => [l, String(t(l) ?? "")]));
        if (t && typeof t === "object") return Object.fromEntries(LANGS.map((l) => [l, typeof t[l] === "string" ? t[l] : ""]));
        return {};
      };
      const problems: string[] = [];
      if (entries.length < 8) problems.push(`${entries.length} events (want 8)`);
      const topics: [string, RegExp][] = [
        ["BVG strike", /bvg|strike|streik/i],
        ["a week of rain", /rain|regen/i],
        ["heatwave 32 °C", /heat|hitze/i],
        ["Baustelle outside", /baustelle|construction|roadwork|building.?site/i],
        ["Berlin school holidays", /holiday|ferien|vacation/i],
        ["a new café two doors down, €8.50 lunch", /competitor|rival|new.?caf|two doors|8[.,]50/i],
        ["Kiez street festival", /festival|street.?party|stra(ss|ß)enfest|kiezfest/i],
        ["Christmas market", /christmas|weihnacht|xmas/i],
      ];
      const used = new Set<string>();
      for (const [label, re] of topics) {
        const hit = entries.find(([id, x]) => !used.has(id) && re.test(`${id} ${textsOf(x).en ?? ""}`));
        if (!hit) problems.push(`no event for "${label}"`);
        else used.add(hit[0]);
      }
      for (const [id, x] of entries) {
        const t = textsOf(x);
        const missing = LANGS.filter((l) => !t[l]?.trim());
        if (missing.length) problems.push(`${id}: no text in ${missing.join(", ")}`);
        else if (new Set(LANGS.map((l) => t[l])).size < 4) problems.push(`${id}: some languages repeat another language's text`);
      }
      const heat = entries.find(([id, x]) => /heat|hitze/i.test(`${id} ${textsOf(x).en}`));
      if (heat && !/32/.test(textsOf(heat[1]).de ?? "")) problems.push(`${heat[0]}: the German text does not say 32 °C`);
      return verdict(problems.slice(0, 10), `${entries.length} events in ${found.file}: ${entries.map(([id]) => id).join(", ")}`);
    },
  },
  {
    id: "sim-interview-unique",
    component: "rehearsal",
    title: "the shipped demos' interviews (/r#demo, /r#demo-price) give every imagined customer an answer of their own, in every language (no two persona answers the same once names are left out)",
    command: "node --import tsx qa/run.ts --no-loop --only rehearsal",
    run: async (root) => {
      const problems: string[] = [];
      const info: string[] = [];
      for (const lang of LANGS)
        for (const variant of ["demo", "demo-price"] as const) {
          let v: VariantRender;
          try {
            v = await variantRender(root, lang, variant);
          } catch (err) {
            problems.push(`${lang} /r#${variant}: ${msg(err).split("\n")[0]}`);
            continue;
          }
          const r = v.share.rehearsal;
          if (!r) {
            problems.push(`${lang} /r#${variant}: the shipped demo has no rehearsal`);
            continue;
          }
          if (!r.interviews?.length) {
            problems.push(`${lang} /r#${variant}: the shipped demo has no interview`);
            continue;
          }
          for (const iv of r.interviews) {
            const byText = new Map<string, string[]>();
            const names = iv.answers.map((x) => x.name || x.personaId).filter(Boolean);
            for (const ans of iv.answers) {
              let t = ans.answer ?? "";
              for (const n of names) t = t.split(n).join(" ");
              const norm = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
              byText.set(norm, [...(byText.get(norm) ?? []), ans.name || ans.personaId]);
            }
            for (const [t, who] of byText) if (who.length > 1) problems.push(`${lang} /r#${variant}: ${who.join(" and ")} give the same interview answer ("${t.slice(0, 80)}…")`);
            info.push(`${lang} ${variant}: ${byText.size}/${iv.answers.length} distinct`);
          }
        }
      return verdict(problems.slice(0, 10), info.join("; "));
    },
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
      const res = await toolCall(s, "whatif_run_scenarios", { template: "lunch_offer", inputs, demo: true, business: t.DEMO_BUSINESS, question: question(t, "lunch_offer"), lang: "en" }, 10);
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
      const start = await toolCall(s, "whatif_rehearsal_start", { template: "lunch_offer", inputs, demo: true, lang: "en" }, 20);
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
      const r1 = await s.call("tools/call", { name: "whatif_run_scenarios", arguments: { template: "lunch_offer", inputs, lang: "en" } }, 30);
      const say1 = r1.body?.result ? toolText(r1.body.result) : (r1.body?.error?.message ?? "");
      if (r1.status >= 500) problems.push(`missing input: HTTP ${r1.status}`);
      else if (!/price|offer_price/i.test(say1)) problems.push(`missing input: the answer does not say what to ask ("${say1.slice(0, 120)}")`);
      const r2 = await s.call("tools/call", { name: "whatif_run_scenarios", arguments: { template: "open_a_zoo", inputs: {}, lang: "en" } }, 31);
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
  {
    id: "mcp-lang",
    component: "mcp",
    title: "tools take an optional lang (default German): whatif_run_scenarios answers in German by default, in English with lang en, and the report link carries the language",
    command: "node scripts/dev.mjs  (then whatif_run_scenarios with and without lang)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const t = await templates(root);
      const st = await stateMod(root);
      const problems: string[] = [];
      const list = await s.call("tools/list", {}, 50);
      const tools = (list.body?.result?.tools ?? []) as Json[];
      for (const name of ["whatif_start", "whatif_run_scenarios", "whatif_rehearsal_start"]) {
        const tool = tools.find((x) => x?.name === name);
        if (tool && !tool.inputSchema?.properties?.lang) problems.push(`${name} has no lang input`);
      }
      const args = { template: "lunch_offer", inputs: t.demoInputs("lunch_offer"), demo: true };
      const call = async (lang: Lang | undefined, id: number) => {
        const res = await toolCall(s, "whatif_run_scenarios", lang ? { ...args, lang } : args, id);
        const url = findReportUrl(res);
        let tokenLang: unknown = "(no link)";
        if (url) {
          try {
            tokenLang = (st.decodeState(url.slice(url.indexOf("#") + 1)) as ShareState & { lang?: string }).lang;
          } catch (err) {
            tokenLang = `(bad token: ${msg(err)})`;
          }
        }
        return { text: toolText(res), tokenLang, isError: !!res.isError };
      };
      const def = await call(undefined, 51);
      const en = await call("en", 52);
      const pl = await call("pl", 53);
      if (def.isError || en.isError || pl.isError) problems.push(`run_scenarios returned an error: ${(def.isError ? def : en.isError ? en : pl).text.slice(0, 160)}`);
      if (def.text === en.text) problems.push("the answer without lang is the English one (the default is German)");
      if (en.text === pl.text) problems.push("lang pl answers in the same text as lang en");
      if (def.tokenLang !== "de" && def.tokenLang !== undefined) problems.push(`the default report link carries lang ${JSON.stringify(def.tokenLang)} (want "de")`);
      if (en.tokenLang !== "en") problems.push(`the report link for lang en carries lang ${JSON.stringify(en.tokenLang)}`);
      if (pl.tokenLang !== "pl") problems.push(`the report link for lang pl carries lang ${JSON.stringify(pl.tokenLang)}`);
      return verdict(problems, `default: "${squash(def.text).slice(0, 80)}…" (link lang ${def.tokenLang ?? "unset = de"})`);
    },
  },
  {
    id: "mcp-beta-codes",
    component: "mcp",
    title: "closed beta (WHATIF_BETA_CODES set), no or a wrong code: initialize (instructions with \"CLOSED BETA\"), tools/list and prompts/list answer 200; every tools/call answers 200 with isError, the German message first (\"Für diese Verbindung fehlt der Einladungscode\" / \"Dieser Einladungscode ist nicht gültig\", ?code=IHR-CODE), then the English one (\"closed beta for Berlin\", ?code=YOUR-CODE), the contact and structuredContent.beta { required, valid: false, reason, connector_url, how_to_connect, contact }; a valid code via ?code=, x-whatif-code or Bearer gives real results; GET ?code= says beta.valid (+ message); the code is never echoed or logged",
    command: "set WHATIF_BETA_CODES=test-code-123 && node scripts/dev.mjs --no-build  (then initialize, tools/list, prompts/list and tools/call on /api/mcp with and without ?code=)",
    timeoutMs: 200_000,
    run: async (root) => {
      const dev = await betaServer(root);
      const url = `${dev.base}/api/mcp`;
      const problems: string[] = [];
      const raws: [string, string][] = [];
      const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "what-if-qa", version: "1.0.0" } };
      const noAuth = (label: string, r: RpcReply) => {
        if (r.status === 401) problems.push(`${label}: HTTP 401 (never 401: OAuth-capable hosts start a sign-in and drop the message)`);
        const wa = r.headers.get("www-authenticate");
        if (wa) problems.push(`${label}: WWW-Authenticate: ${wa.slice(0, 60)}`);
      };
      // 1. Without a code the connection itself works: the host lists tools and prompts, and the instructions say why tools will refuse.
      const init = await rpc(url, "initialize", INIT, 60);
      raws.push(["initialize without a code", init.raw]);
      noAuth("initialize without a code", init);
      if (init.status !== 200 || !init.body?.result?.serverInfo) problems.push(`no code: initialize gives HTTP ${init.status} ${init.raw.slice(0, 100)}`);
      else if (!/CLOSED BETA/.test(String(init.body.result.instructions ?? ""))) problems.push(`no code: the initialize instructions do not end with the "CLOSED BETA: …" note ("…${String(init.body.result.instructions ?? "").slice(-90)}")`);
      const pv = init.body?.result?.protocolVersion as string | undefined;
      const headers: Record<string, string> = pv ? { "mcp-protocol-version": pv } : {};
      for (const [method, field] of [["tools/list", "tools"], ["prompts/list", "prompts"]] as const) {
        const r = await rpc(url, method, {}, 61, headers);
        raws.push([`${method} without a code`, r.raw]);
        noAuth(`${method} without a code`, r);
        if (r.status !== 200 || !Array.isArray(r.body?.result?.[field]) || !r.body.result[field].length) problems.push(`no code: ${method} gives HTTP ${r.status} and no ${field} (${r.raw.slice(0, 80)})`);
      }
      // 2. Every tool call without a valid code: HTTP 200, isError, German then English, the contact, structuredContent.beta.
      const calls = [
        { name: "whatif_start", arguments: { question: "Was wäre, wenn ich einen Mittagstisch anbiete?" } },
        { name: "whatif_run_scenarios", arguments: { template: "lunch_offer", demo: true } },
      ];
      let sample = "";
      for (const [label, u, reason, de, wrong] of [
        ["no code", url, "missing_code", /Für diese Verbindung fehlt der Einladungscode/i, ""],
        ["a wrong code", `${url}?code=wrong-code-999`, "invalid_code", /Dieser Einladungscode ist nicht gültig/i, "wrong-code-999"],
      ] as const) {
        for (const [i, call] of calls.entries()) {
          const where = `${label}, tools/call ${call.name}`;
          const r = await rpc(u, "tools/call", call, 62 + i, headers);
          raws.push([where, r.raw]);
          noAuth(where, r);
          if (r.body?.error) {
            problems.push(`${where}: a JSON-RPC error ${r.body.error.code} (want result.isError true): "${r.body.error.message.slice(0, 90)}"`);
            continue;
          }
          const res = r.body?.result;
          if (r.status !== 200 || !res) {
            problems.push(`${where}: HTTP ${r.status} ${r.raw.slice(0, 90)}`);
            continue;
          }
          const text = String(res.content?.[0]?.text ?? "");
          sample ||= text;
          if (res.isError !== true) {
            problems.push(`${where}: the tool ran (isError ${JSON.stringify(res.isError)}; "${squash(text).slice(0, 70)}"); without a valid code it must return isError with the beta message`);
            continue;
          }
          const want: [RegExp, string][] = [
            [de, `the German "${de.source}"`],
            [/\?code=IHR-CODE/, "?code=IHR-CODE"],
            [/closed beta for Berlin/i, "the English \"closed beta for Berlin\""],
            [/\?code=YOUR-CODE/, "?code=YOUR-CODE"],
          ];
          const missing = want.filter(([re]) => !re.test(text)).map(([, w]) => w);
          if (missing.length) problems.push(`${where}: content[0].text lacks ${missing.join(", ")} ("${squash(text).slice(0, 110)}")`);
          const iDe = text.search(de), iEn = text.search(/closed beta for Berlin/i);
          if (iDe >= 0 && iEn >= 0 && iDe > iEn) problems.push(`${where}: the English message comes before the German one`);
          if (!text.includes(BETA_CONTACT)) problems.push(`${where}: the message does not give the contact (WHATIF_BETA_CONTACT=${BETA_CONTACT})`);
          const b = res.structuredContent?.beta;
          const bad = [
            b?.required !== true && "required: true",
            b?.valid !== false && "valid: false",
            b?.reason !== reason && `reason: "${reason}"`,
            !(typeof b?.connector_url === "string" && /\/api\/mcp\?code=YOUR-CODE$/.test(b.connector_url)) && "connector_url …/api/mcp?code=YOUR-CODE",
            !(typeof b?.how_to_connect === "string" && /\/connect$/.test(b.how_to_connect)) && "how_to_connect …/connect",
            b?.contact !== BETA_CONTACT && `contact "${BETA_CONTACT}"`,
          ].filter(Boolean);
          if (bad.length) problems.push(`${where}: structuredContent.beta ${JSON.stringify(b ?? null).slice(0, 120)} (want ${bad.join(", ")})`);
          if (wrong && r.raw.includes(wrong)) problems.push(`${where}: the answer echoes the code that was sent`);
        }
      }
      // 3. A valid code gives real results, however the host sends it.
      const ok: string[] = [];
      for (const [label, u, h] of [
        ["?code=", `${url}?code=${BETA_CODE}`, {}],
        ["x-whatif-code", url, { "x-whatif-code": BETA_CODE }],
        ["Bearer", url, { authorization: `Bearer ${BETA_CODE}` }],
      ] as const) {
        const i = await rpc(u, "initialize", INIT, 66, h);
        if (i.status !== 200 || !i.body?.result?.serverInfo) problems.push(`code via ${label}: initialize gives HTTP ${i.status} ${i.raw.slice(0, 100)}`);
        else if (/CLOSED BETA/.test(String(i.body.result.instructions ?? ""))) problems.push(`code via ${label}: the instructions still carry the "CLOSED BETA" note`);
        let fine = true;
        for (const [n, call] of calls.entries()) {
          const r = await rpc(u, "tools/call", call, 67 + n, { ...headers, ...h });
          raws.push([`tools/call ${call.name} with the code via ${label}`, r.raw]);
          const res = r.body?.result;
          if (r.status !== 200 || !res) problems.push(`code via ${label}: tools/call ${call.name} gives HTTP ${r.status} ${r.raw.slice(0, 100)}`);
          else if (res.isError === true || res.structuredContent?.beta?.valid === false) problems.push(`code via ${label}: tools/call ${call.name} still returns the beta error ("${squash(toolText(res)).slice(0, 90)}")`);
          else continue;
          fine = false;
        }
        if (fine) ok.push(label);
      }
      // 4. GET lets the site check a code without storing it.
      const get = async (q: string) => {
        const res = await fetch(`${url}${q}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        const raw = await res.text();
        let j: Json = null;
        try {
          j = JSON.parse(raw);
        } catch {
          /* not JSON */
        }
        return { status: res.status, raw, beta: j?.beta };
      };
      const gGood = await get(`?code=${BETA_CODE}`);
      const gBad = await get("?code=wrong-code-999");
      const gNone = await get("");
      raws.push(["GET ?code=", gGood.raw], ["GET ?code=<wrong>", gBad.raw], ["GET without a code", gNone.raw]);
      if (gGood.beta?.required !== true || gGood.beta?.valid !== true) problems.push(`GET ?code=<valid>: beta ${JSON.stringify(gGood.beta)} (want { required: true, valid: true })`);
      for (const [label, g] of [["?code=<wrong>", gBad], ["without a code", gNone]] as const) {
        if (g.beta?.required !== true || g.beta?.valid !== false) problems.push(`GET ${label}: beta ${JSON.stringify(g.beta).slice(0, 100)} (want { required: true, valid: false })`);
        else if (typeof g.beta?.message !== "string" || !/einladungscode/i.test(g.beta.message)) problems.push(`GET ${label}: beta.message is missing or does not name the Einladungscode`);
      }
      if (gBad.raw.includes("wrong-code-999")) problems.push("GET ?code=<wrong>: the answer echoes the code that was sent");
      // 5. The code never comes back: not in any answer, report link or the server log.
      const echoed = [...raws, ["the dev server log", dev.out.join("")] as [string, string]].filter(([, s]) => (s ?? "").includes(BETA_CODE)).map(([w]) => w);
      if (echoed.length) problems.push(`the invite code is echoed or logged in ${echoed.slice(0, 4).join(", ")}`);
      return verdict([...new Set(problems)].slice(0, 12), `no code: initialize ("CLOSED BETA" note), tools/list and prompts/list answer 200; every tools/call is isError with "${squash(sample).slice(0, 60)}…" and structuredContent.beta; a valid code gives real results via ${ok.join(", ")}; GET reports beta.valid; the code is never echoed`);
    },
  },
  {
    id: "mcp-beta-oauth",
    component: "mcp",
    title: "closed beta: nothing on /api/mcp answers 401 or WWW-Authenticate; the OAuth paths (/.well-known/oauth-protected-resource[/api/mcp], /.well-known/oauth-authorization-server[/api/mcp], /.well-known/openid-configuration, /register, /authorize, /token, at the root and under /api/mcp/ and /mcp/) answer 404 JSON with the beta message and no WWW-Authenticate; an SDK client with an OAuth provider (as Claude Code and claude.ai use) connects without a code, lists the tools, starts no OAuth flow and gets the beta message from tools/call",
    command: "set WHATIF_BETA_CODES=test-code-123 && node scripts/dev.mjs --no-build  (then GET /.well-known/oauth-protected-resource, POST /register, and connect @modelcontextprotocol/sdk's Client with an authProvider)",
    timeoutMs: 200_000,
    run: async (root) => {
      const dev = await betaServer(root);
      const url = `${dev.base}/api/mcp`;
      const problems: string[] = [];
      // 1. OAuth discovery and endpoints: a 404 in JSON that carries the beta message, with no WWW-Authenticate, so no host goes looking for a sign-in.
      const endpoints = ["/register", "/authorize", "/token"];
      const known = ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"];
      const paths = [
        ...known,
        "/.well-known/oauth-protected-resource/api/mcp",
        "/.well-known/oauth-authorization-server/api/mcp",
        ...endpoints,
        ...["/api/mcp", "/mcp"].flatMap((pre) => [...known, ...endpoints].map((p) => `${pre}${p}`)),
      ];
      const probes: [string, string][] = [...paths.map((p) => ["GET", p] as [string, string]), ...paths.filter((p) => /\/(register|token)$/.test(p)).map((p) => ["POST", p] as [string, string])];
      for (const [method, p] of probes) {
        try {
          const res = await fetch(`${dev.base}${p}`, {
            method,
            headers: { accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
            ...(method === "POST" ? { body: JSON.stringify({ client_name: "what-if-qa", redirect_uris: ["http://127.0.0.1:9/callback"] }) } : {}),
            signal: AbortSignal.timeout(10_000),
          });
          const raw = await res.text();
          const why: string[] = [];
          if (res.status !== 404) why.push(`HTTP ${res.status} (want 404)`);
          if (res.headers.get("www-authenticate")) why.push(`WWW-Authenticate: ${res.headers.get("www-authenticate")?.slice(0, 60)}`);
          let json = true;
          try {
            JSON.parse(raw);
          } catch {
            json = false;
          }
          if (!json || !/json/i.test(res.headers.get("content-type") ?? "")) why.push(`not JSON (${res.headers.get("content-type") ?? "no content-type"}: "${raw.slice(0, 50)}")`);
          else if (!/einladungscode/i.test(raw) || !/closed beta/i.test(raw)) why.push(`no beta message in the body ("${raw.slice(0, 70)}")`);
          if (why.length) problems.push(`${method} ${p}: ${why.join(", ")}`);
        } catch (err) {
          problems.push(`${method} ${p}: ${msg(err).split("\n")[0]}`);
        }
      }
      // 2. No answer on /api/mcp itself starts OAuth: no 401, no WWW-Authenticate (without a code).
      for (const [method, params] of [["initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "what-if-qa", version: "1.0.0" } }], ["tools/list", {}], ["tools/call", { name: "whatif_start", arguments: { question: "What if I run a lunch deal?" } }]] as const) {
        const r = await rpc(url, method, params, 80);
        if (r.status === 401 || r.headers.get("www-authenticate")) problems.push(`${method} without a code: HTTP ${r.status}${r.headers.get("www-authenticate") ? `, WWW-Authenticate: ${r.headers.get("www-authenticate")?.slice(0, 60)}` : ""} (a 401 makes OAuth-capable hosts start a sign-in and drop the message)`);
      }
      // 3. The SDK client hosts use, with an OAuth provider that records whether it was asked to sign in.
      const asked: string[] = [];
      let sdkInfo = "";
      try {
        const { Client } = (await import("@modelcontextprotocol/sdk/client/index.js")) as Json;
        const { StreamableHTTPClientTransport } = (await import("@modelcontextprotocol/sdk/client/streamableHttp.js")) as Json;
        const redirect = "http://127.0.0.1:9/callback";
        const authProvider = {
          get redirectUrl() {
            return redirect;
          },
          get clientMetadata() {
            return { client_name: "what-if-qa", redirect_uris: [redirect] };
          },
          clientInformation: () => {
            asked.push("clientInformation");
            return undefined;
          },
          saveClientInformation: () => void asked.push("saveClientInformation"),
          tokens: () => undefined,
          saveTokens: () => void asked.push("saveTokens"),
          redirectToAuthorization: () => void asked.push("redirectToAuthorization"),
          saveCodeVerifier: () => void asked.push("saveCodeVerifier"),
          codeVerifier: () => "what-if-qa-verifier",
        };
        const client = new Client({ name: "what-if-qa", version: "1.0.0" });
        const transport = new StreamableHTTPClientTransport(new URL(url), { authProvider });
        const within = <T,>(p: Promise<T>, what: string) => Promise.race([p, sleep(20_000).then(() => Promise.reject(new Error(`${what} did not finish within 20 s`)))]);
        try {
          await within(client.connect(transport), "connect");
          const tools = (await within(client.listTools(), "listTools")) as Json;
          const res = (await within(client.callTool({ name: "whatif_start", arguments: { question: "Was wäre, wenn ich einen Mittagstisch anbiete?" } }), "callTool")) as Json;
          const text = toolText(res);
          if (res?.isError !== true) problems.push(`SDK client: callTool without a code ran the tool (want isError with the beta message)`);
          else if (!/einladungscode/i.test(text)) problems.push(`SDK client: the tool error does not name the Einladungscode ("${squash(text).slice(0, 100)}")`);
          sdkInfo = `SDK client: ${tools?.tools?.length ?? 0} tools, callTool → "${squash(text).slice(0, 60)}…"`;
        } finally {
          await client.close().catch(() => undefined);
        }
      } catch (err) {
        problems.push(`SDK client with an OAuth provider, no code: ${(msg(err).split("\n")[0] ?? "").slice(0, 200)}`);
      }
      if (asked.length) problems.push(`SDK client: the server made the client start OAuth (${[...new Set(asked)].join(", ")})`);
      return verdict([...new Set(problems)].slice(0, 12), `${probes.length} OAuth probes (${paths.length} paths) answer 404 JSON with the beta message; no 401 or WWW-Authenticate; ${sdkInfo}; no OAuth flow started`);
    },
  },
  {
    id: "mcp-beta-open",
    component: "mcp",
    title: "without WHATIF_BETA_CODES the server stays open: POST without a code works and GET says beta.required false",
    command: "node scripts/dev.mjs  (then GET /api/mcp)",
    timeoutMs: 150_000,
    run: async (root) => {
      const s = await mcp(root);
      const problems: string[] = [];
      const plain = await rpc(s.url, "tools/list", {}, 70, s.headers);
      if (plain.status !== 200 || !plain.body?.result) problems.push(`POST without a code: HTTP ${plain.status}`);
      const res = await fetch(s.url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      let beta: Json;
      try {
        beta = (JSON.parse(await res.text()) as Json)?.beta;
      } catch {
        beta = "(not JSON)";
      }
      if (beta !== undefined && beta?.required !== false) problems.push(`GET says beta ${JSON.stringify(beta)} while no codes are configured (want required: false)`);
      return verdict(problems, `open: POST without a code works; GET beta ${JSON.stringify(beta ?? "(not reported)")}`);
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
      const { html, b } = await rendered(root);
      const best = countSteps(html);
      if (!best) return { ok: false, detail: "no steps found (mark them with data-step=\"1\"…\"6\", ids step-1…step-6, an <ol class=\"steps\"> header, or <section class=\"step\">)" };
      return best.n === 6 ? { ok: true, detail: `6 steps (${best.how}); evidence from ${b.source}` } : { ok: false, detail: `${best.n} steps by ${best.how} (want 6: question, numbers, outcomes, the one number, rehearsal, your test)` };
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
      // The maths of every calculated figure the report shows (a guess has no working; a figure the report leaves out is not counted).
      const shown = b.a.scenarios.flatMap((s) => s.figures).filter((f) => f.source === "calculation" && !!f.label && text.includes(squash(f.label)));
      const must = [b.a.breakEven.maths, b.a.worstCase.maths].filter((m): m is string => !!m && !!m.trim());
      const maths = [...must, ...shown.map((f) => f.maths)].filter((m): m is string => !!m && !!m.trim());
      const present = maths.filter((m) => text.includes(squash(m)));
      const problems: string[] = [];
      if (toggles < 3) problems.push(`${toggles} "show the maths" toggles (want at least one per scenario: <details><summary>Show the maths</summary>…)`);
      for (const m of must) if (!text.includes(squash(m))) problems.push(`the ${m === b.a.breakEven.maths ? "break-even" : "worst-case"} maths is not in the report ("${squash(m).slice(0, 70)}")`);
      if (present.length < Math.ceil(maths.length * 0.8)) problems.push(`${present.length} of ${maths.length} maths strings of the shown calculated figures appear in the report, e.g. missing "${squash(maths.find((m) => !text.includes(squash(m))) ?? "").slice(0, 80)}"`);
      return verdict(problems, `${toggles} toggles; ${present.length}/${maths.length} maths strings of the shown calculated figures`);
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
      // The summary's own caveat, or a caveat block the report writes for this run's method (says "imagined" and what it is not).
      const blocks = [...html.matchAll(/<[a-z]+\b[^>]*(?:class|id)=["'][^"']*caveat[^"']*["'][^>]*>/gi)].map((m) => visibleText(elementAt(html, m.index ?? 0)));
      const ownCaveat = blocks.some((t) => /imagin/i.test(t) && NEGATION.test(t));
      if (!text.includes(squash(b.summary!.caveat)) && !ownCaveat) problems.push("neither the summary's caveat nor a caveat block (class/id \"caveat\", saying the customers are imagined and what they are not) is in the report");
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
    title: "the build has index.html, r.html, connect.html, try.html and bundled JS; every page has lang, viewport and a title; local assets resolve",
    command: "npm run build",
    run: (root) => {
      const st = join(root, ".vercel/output/static");
      if (!existsSync(st)) return { ok: false, detail: ".vercel/output/static does not exist (run npm run build)" };
      const problems: string[] = [];
      for (const p of ["index.html", "r.html", "connect.html", "try.html"]) if (!existsSync(join(st, p))) problems.push(`static/${p} is missing`);
      const js = listFiles(join(st, "assets"), (f) => /\.m?js$/.test(f));
      if (!js.length) problems.push("static/assets/ has no .js bundle");
      const pages = listFiles(st, (f) => /\.html$/.test(f));
      for (const p of pages) {
        const rel = posix(relative(st, p));
        const s = readFileSync(p, "utf8");
        if (!/<html\b[^>]*\blang=/i.test(s)) problems.push(`${rel}: no <html lang>`);
        if (!/<meta\b[^>]*name=["']viewport/i.test(s)) problems.push(`${rel}: no viewport meta`);
        if (!/<title\b[^>]*>[^<]+<\/title>/i.test(s)) problems.push(`${rel}: no title`);
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
  {
    id: "visual-langs",
    component: "visual",
    title: "the shipped demo renders as six steps in de, en, es and pl; the German report contains no English UI phrases (text, aria-label, title, alt)",
    command: "node --import tsx qa/run.ts --no-loop --only visual  (static copies: qa/reports/ui/report-static.<lang>.html)",
    run: async (root) => {
      const problems: string[] = [];
      const info: string[] = [];
      for (const lang of LANGS) {
        try {
          const { html } = await renderedLang(root, lang);
          const steps = countSteps(html);
          if (!steps || steps.n !== 6) problems.push(`${lang}: ${steps ? `${steps.n} steps (${steps.how})` : "no steps"} (want 6)`);
          if (lang !== "en") {
            const leaks = englishLeaks(html);
            if (lang === "de" && leaks.length) problems.push(`de: English UI text in the German report: ${leaks.slice(0, 6).map((x) => `"${x}"`).join(", ")}${leaks.length > 6 ? ` (+${leaks.length - 6})` : ""}`);
            info.push(`${lang}: ${leaks.length ? `${leaks.length} English phrases (${leaks.slice(0, 3).join(", ")})` : "no English phrases"}`);
          }
        } catch (err) {
          problems.push(`${lang}: ${msg(err).split("\n")[0]}`);
        }
      }
      return verdict(problems, `six steps in de, en, es, pl; ${info.join("; ")}`);
    },
  },
  {
    id: "visual-checklist-chip",
    component: "visual",
    title: "honesty: the \"check these with real customers\" card carries no \"Your number\" chip (it holds questions, not the owner's numbers)",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const problems: string[] = [];
      const seen: string[] = [];
      for (const lang of ["en", "de"] as const) {
        const { html, s } = await renderedLang(root, lang);
        if (!s.summary) return { ok: false, detail: s.simError ?? "the shipped demo has no rehearsal" };
        const first = s.summary.checkWithRealCustomers?.[0];
        let card = "";
        const byClass = /<[a-z]+\b[^>]*class=["'][^"']*\bwi-checkreal\b[^"']*["'][^>]*>/i.exec(html);
        if (byClass) card = elementAt(html, byClass.index);
        if (!card && first) {
          const i = html.indexOf(first.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").slice(0, 40));
          if (i >= 0) card = enclosing(html, i);
        }
        if (!card) {
          problems.push(`${lang}: the "check these with real customers" card was not found (class wi-checkreal, or the first question's text)`);
          continue;
        }
        const chips = [...card.matchAll(/<span\b[^>]*class=["'][^"']*\bwi-chip--([a-z]+)[^>]*>|data-source=["']([a-z]+)["']/gi)].map((m) => m[1] ?? m[2] ?? "");
        if (chips.includes("owner")) problems.push(`${lang}: the card wears a "Your number" chip (data-source="owner")`);
        seen.push(`${lang}: chips ${chips.length ? [...new Set(chips)].join(", ") : "none"}`);
      }
      return verdict(problems, seen.join("; "));
    },
  },
  {
    id: "visual-facts-card",
    component: "visual",
    title: "the report shows a \"Berlin facts used\" card: every public fact with its source, a link to the source and its date",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const e = await engine(root);
      const report = await reportMod(root);
      const raw: RawInputs = { ...e.demoInputs("lunch_offer"), extra_staff_hours_per_day: 1 };
      delete raw.vat_rate;
      delete raw.staff_hourly_cost;
      const problems: string[] = [];
      for (const lang of ["en", "de"] as const) {
        const a = e.analyze("lunch_offer", raw, { demo: false, business: "Café QA", lang }) as Analysis & { facts?: Json[] };
        if (!Array.isArray(a.facts) || !a.facts.length) return { ok: false, detail: "the analysis has no facts to show (see berlin-facts)" };
        const html = await inLang(root, lang, () => report.renderReport({ analysis: a }));
        const text = visibleText(html);
        for (const f of a.facts) {
          const id = String(f?.id ?? f?.label);
          const url = String(f?.url ?? "");
          if (url && !new RegExp(`href=["']${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&(amp;)?")}["']`).test(html)) problems.push(`${lang}: ${id}: no link to ${url}`);
          if (f?.source && !text.includes(squash(String(f.source)).slice(0, 30))) problems.push(`${lang}: ${id}: the source "${String(f.source).slice(0, 40)}" is not shown`);
          const year = /^(\d{4})/.exec(String(f?.asOf ?? ""))?.[1];
          if (year && !text.includes(year)) problems.push(`${lang}: ${id}: no date shown (${f.asOf})`);
        }
      }
      return verdict([...new Set(problems)].slice(0, 10), "every fact shown with its source, link and date (en, de)");
    },
  },
  {
    id: "report-messages",
    component: "visual",
    title: "src/report/messages.ts: every en key is translated in de, es and pl",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: (root) => catalogCheck(root, "src/report/messages.ts"),
  },
  {
    id: "site-messages",
    component: "visual",
    title: "site/src/messages.ts: every en key is translated in de, es and pl",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: (root) => catalogCheck(root, "site/src/messages.ts"),
  },
  {
    id: "site-no-placeholders",
    component: "visual",
    title: "the built site has no template placeholders left ({{SITE_URL}}, {{BETA_CONTACT}}, {{VERSION}} …) in its pages, scripts or styles",
    command: "npm run build",
    run: (root) => {
      const st = join(root, ".vercel/output/static");
      if (!existsSync(st)) return { ok: false, detail: ".vercel/output/static does not exist (run npm run build)" };
      const files = listFiles(st, (f) => TEXT_FILE.test(f) && !/[\\/]skill[\\/]/.test(f));
      const hits: string[] = [];
      for (const f of files) {
        const m = /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/.exec(readFileSync(f, "utf8"));
        if (m) hits.push(`${posix(relative(st, f))}: ${m[0]}`);
      }
      return verdict(hits.slice(0, 10), `${files.length} built files, no {{PLACEHOLDER}} left`);
    },
  },
  {
    id: "visual-no-double-signs",
    component: "visual",
    title: "no \"− −\", \"--€\" or \"+−\" in any rendered report: /r#demo, /r#demo-price, /r#demo-result and a /try report (the placeholder values), in de, en, es and pl, every slider position's text included",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const problems: string[] = [];
      let n = 0;
      for (const lang of LANGS)
        for (const variant of VARIANTS) {
          try {
            const v = await variantRender(root, lang, variant);
            n++;
            const hits = [...new Set([...signHits(visibleText(v.html)), ...v.strings.flatMap((s) => signHits(s))])];
            for (const h of hits.slice(0, 2)) problems.push(`${lang} ${variant === "try" ? "/try report" : `/r#${variant}`}: ${h}`);
          } catch (err) {
            problems.push(`${lang} ${variant}: ${msg(err).split("\n")[0]}`);
          }
        }
      return verdict(problems.slice(0, 10), `${n} reports (4 views × 4 languages) and their analyses: no double signs`);
    },
  },
  {
    id: "terms-chip-words",
    component: "visual",
    title: "one word per source (src/i18n/terms.ts): in each language the engine's sourceLabel, TERMS, the report's src.* and the site's c.src_* chip words are the same, and every chip in the rendered demo report reads that word",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      let terms: TermsMod;
      let eng: EngineMessagesMod;
      try {
        terms = await load<TermsMod>(root, "src/i18n/terms.ts", ["TERMS"]);
        eng = await load<EngineMessagesMod>(root, "src/engine/messages.ts", ["sourceLabel"]);
      } catch (err) {
        return { ok: false, detail: msg(err).split("\n")[0] ?? "" };
      }
      const problems: string[] = [];
      const catalogs: [string, string, (s: string) => string][] = [
        ["src/report/messages.ts", "REPORT_MESSAGES", (s) => `src.${s}`],
        ["site/src/messages.ts", "SITE_MESSAGES", (s) => `c.src_${s}`],
      ];
      const loaded: [string, CatalogLike, (s: string) => string][] = [];
      for (const [rel, name, key] of catalogs) {
        try {
          loaded.push([rel, (await load<Record<string, unknown>>(root, rel, [name]))[name] as CatalogLike, key]);
        } catch (err) {
          problems.push(`${rel}: ${msg(err).split("\n")[0]}`);
        }
      }
      let chips = 0;
      for (const l of LANGS) {
        for (const s of SOURCES) {
          const want = eng.sourceLabel(s, l);
          const term = terms.TERMS[l]?.[CHIP_TERM[s] ?? ""];
          if (want !== term) problems.push(`${l} ${s}: the engine's sourceLabel says "${want}", TERMS.${l}.${CHIP_TERM[s]} says "${term}"`);
          for (const [rel, c, key] of loaded) {
            const k = key(s);
            const v = c[l]?.[k] ?? c.en?.[k];
            if (typeof v === "string" && v !== want) problems.push(`${l} ${s}: ${rel} ${k} says "${v}"${c[l]?.[k] === undefined && l !== "en" ? " (English fallback)" : ""}, the engine "${want}"`);
          }
        }
        try {
          const { html } = await variantRender(root, l, "demo");
          const bad = new Set<string>();
          for (const m of html.matchAll(/<span\b[^>]*class=["'][^"']*\bwi-chip--([a-z]+)\b[^"']*["'][^>]*>/gi)) {
            const el = elementAt(html, m.index ?? 0).replace(/<span\b[^>]*class=["'][^"']*\bwi-sr\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, "").replace(/<svg[\s\S]*?<\/svg>/gi, "");
            const text = visibleText(el);
            const src = m[1] ?? "";
            if (!text || !SOURCES.includes(src)) continue;
            chips++;
            if (text !== eng.sourceLabel(src, l)) bad.add(`${l}: a "${src}" chip in the demo report says "${text}", the engine "${eng.sourceLabel(src, l)}"`);
          }
          problems.push(...bad);
        } catch (err) {
          problems.push(`${l}: the demo report did not render: ${msg(err).split("\n")[0]}`);
        }
      }
      return verdict([...new Set(problems)].slice(0, 12), `5 chip words × 4 languages agree across the engine, TERMS, the report and the site; ${chips} chips in the demo reports read them`);
    },
  },
  {
    id: "terms-report-words",
    component: "visual",
    title: "one word per idea in the rendered reports (every demo and a /try report, in each language): the German ones never say \"Break-even\" (an explicit gloss \"auf Englisch: Break-even\" aside) or \"Erdacht\", no language uses a competing word, and the demo report uses the TERMS words for break-even and imagined",
    command: "node --import tsx qa/run.ts --no-loop --only visual",
    run: async (root) => {
      const t = await termWords(root);
      if (!t.terms) return { ok: false, detail: `TERMS could not be read: ${t.error}` };
      const problems: string[] = [];
      for (const l of LANGS) {
        const w = t.terms[l];
        for (const variant of VARIANTS) {
          let v: VariantRender;
          try {
            v = await variantRender(root, l, variant);
          } catch (err) {
            problems.push(`${l} ${variant}: ${msg(err).split("\n")[0]}`);
            continue;
          }
          const text = ownerText(v.html);
          const where = variant === "try" ? "/try report" : `/r#${variant}`;
          for (const a of TERM_ALTERNATES[l] ?? []) {
            const m = a.re.exec(text);
            if (m) problems.push(`${l} ${where}: "${a.word}" where TERMS says "${w[a.use]}" ("…${squash(text.slice(Math.max(0, m.index - 35), m.index + m[0].length + 35))}…")`);
          }
          if (variant === "demo") {
            if (!hasTerm(text, w.breakEven)) problems.push(`${l} /r#demo never says the TERMS word for break-even, "${w.breakEven}"`);
            if (!hasTerm(text, w.imagined) && !hasTerm(text, w.imaginedCustomers)) problems.push(`${l} /r#demo never says the TERMS word for imagined, "${w.imagined}" / "${w.imaginedCustomers}"`);
          }
        }
      }
      return verdict(problems.slice(0, 12), `4 views × 4 languages: TERMS words used, no "Break-even"/"Erdacht" in German, no competing words (${Object.entries(TERM_ALTERNATES).filter(([, x]) => x.length).map(([l, x]) => `${l}: ${x.map((y) => y.word).join(", ")}`).join("; ")})`);
    },
  },
  ...UI_CHECKS.map(
    (c): CheckDef => ({
      id: c.id,
      component: "visual",
      title: c.title,
      command: "node --import tsx qa/ui-check.ts",
      // The shared browser run has its own deadline (UI_BUDGET_MS + 2 min, see ui()); this only guards against that failing.
      timeoutMs: UI_BUDGET_MS + 180_000,
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
    id: "skill-zip-no-placeholders",
    component: "skill",
    title: "no \"{{\" placeholder is left in the built skill zip (or the static skill/ copies)",
    command: "npm run build",
    run: async (root) => {
      const zipPath = join(root, ".vercel/output/static/what-if-skill.zip");
      if (!existsSync(zipPath)) return { ok: false, detail: ".vercel/output/static/what-if-skill.zip does not exist (run npm run build)" };
      const { files, error } = await unzipText(zipPath);
      if (error) return { ok: false, detail: error };
      const hits: string[] = [];
      const scan = (name: string, s: string) => {
        const i = s.indexOf("{{");
        if (i >= 0) hits.push(`${name}: "${squash(s.slice(Math.max(0, i - 20), i + 30))}"`);
      };
      for (const [n, s] of Object.entries(files)) scan(n, s);
      for (const f of listFiles(join(root, ".vercel/output/static/skill"), (x) => TEXT_FILE.test(x))) scan(`static/${posix(relative(join(root, ".vercel/output/static"), f))}`, readFileSync(f, "utf8"));
      return verdict(hits.slice(0, 10), `${Object.keys(files).length} text files in the zip, no "{{" left`);
    },
  },
  {
    id: "skill-zip-prod-url",
    component: "skill",
    title: "in a production-like build (WHATIF_SITE_URL=https://example.vercel.app) the skill zip's MCP URL is https and not localhost",
    command: "set WHATIF_SITE_URL=https://example.vercel.app && npm run build  (qa builds it in node_modules/.cache/what-if-qa/prod-build)",
    timeoutMs: 360_000,
    run: async (root) => {
      const b = await prodBuild(root);
      if (!b.zip) return { ok: false, detail: "the production-like build wrote no what-if-skill.zip" };
      const { strFromU8 } = (await import("fflate")) as typeof import("fflate");
      const problems: string[] = [];
      const urls: { file: string; url: string; scheme: string; host: string }[] = [];
      const local: string[] = [];
      for (const [n, d] of Object.entries(b.zip)) {
        if (n.endsWith("/") || !(TEXT_FILE.test(n) || !extname(n))) continue;
        const s = strFromU8(d);
        urls.push(...mcpUrls(s).map((u) => ({ file: n, ...u })));
        if (s.includes("{{")) problems.push(`${n} still has a "{{" placeholder`);
        if (/localhost|127\.0\.0\.1/.test(s)) local.push(n);
      }
      if (!urls.length) problems.push("no …/api/mcp URL in the zipped skill");
      for (const u of urls) {
        if (u.scheme !== "https") problems.push(`${u.file}: ${u.url} is not https`);
        if (LOCAL_HOST.test(u.host)) problems.push(`${u.file}: ${u.url} points at ${u.host}`);
      }
      if (!urls.some((u) => u.url.startsWith(`${PROD_URL}/api/mcp`))) problems.push(`no MCP URL uses the site URL the build was given (${PROD_URL})`);
      const hosts = [...new Set(urls.map((u) => u.url.replace(/[?#].*$/, "")))];
      return verdict([...new Set(problems)].slice(0, 10), `${urls.length} MCP URLs: ${hosts.join(", ")}${local.length ? ` (localhost also mentioned in ${local.join(", ")}, not as the MCP URL)` : ""}`);
    },
  },
  {
    id: "skill-zip-empty-contact",
    component: "skill",
    title: "with WHATIF_BETA_CONTACT empty (allowed), the built skill zip has no dangling contact text (\"Ask here: .\", \"To ask for one: .\", an empty link or mailto:) and no \"{{\"",
    command: "set WHATIF_SITE_URL=https://example.vercel.app && set WHATIF_BETA_CONTACT= && npm run build  (qa builds it in node_modules/.cache/what-if-qa/prod-build-nocontact)",
    timeoutMs: 360_000,
    run: async (root) => {
      const b = await prodBuild(root, "empty");
      if (!b.zip) return { ok: false, detail: "the production-like build without a contact wrote no what-if-skill.zip" };
      const { strFromU8 } = (await import("fflate")) as typeof import("fflate");
      const DANGLING: [RegExp, string][] = [
        [/\b(?:ask here|ask for (?:one|a code|an invite(?: code)?)|request (?:one|a code|an invite(?: code)?)|hier anfragen|fragen sie hier|pregunta aquí|zapytaj tutaj)\s*:[ \t]*(?:[.,;)]|$)/im, "a contact label with nothing after it"],
        [/\b(?:contact|kontakt)\s*:[ \t]*[.,;)]/i, "a contact label with nothing after it"],
        [/:[ \t]+[.,;](?=\s|$)/m, "a colon followed by nothing but a full stop"],
        [/\[[^\]\n]*\]\(\s*\)/, "a link without a target"],
        [/mailto:(?=[\s)"'>\]]|$)/m, "an empty mailto:"],
        [/<\s*>/, "empty angle brackets"],
      ];
      const problems: string[] = [];
      let files = 0;
      for (const [n, d] of Object.entries(b.zip)) {
        if (n.endsWith("/") || !(TEXT_FILE.test(n) || !extname(n))) continue;
        files++;
        const s = strFromU8(d);
        const at = s.indexOf("{{");
        if (at >= 0) problems.push(`${n}: a "{{" placeholder is left ("${squash(s.slice(Math.max(0, at - 20), at + 30))}")`);
        for (const [re, what] of DANGLING) {
          const m = re.exec(s);
          if (m) problems.push(`${n}: ${what} ("${squash(s.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30))}")`);
        }
      }
      return verdict([...new Set(problems)].slice(0, 10), `${files} text files in the zip built without a contact: no dangling contact text, no "{{"`);
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
        // The landing page is German by default now; accept the four languages.
        const t = visibleText(s);
        if (!/caf[eé]|kawiarn/i.test(t)) problems.push(`${where} does not say it is for café owners`);
        if (!/learn|teach|lesson|educat|understand|lern|versteh|aprend|enseñ|entend|uczy|nauk|zrozum/i.test(t)) problems.push(`${where} does not say what the owner learns`);
        if (!/what if|was wäre,? wenn|was,? wenn|qué pasa(r[ií]a)? si|y si\b|co jeśli|co gdyby|a gdyby/i.test(t)) problems.push(`${where} has no "what if…" example`);
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
    id: "devex-gitattributes",
    component: "docs-devex",
    title: ".gitattributes makes text files LF in every checkout (a Windows clone with core.autocrlf=true gets the same bytes)",
    command: "git check-attr text eol -- site/assets/site.css src/report/styles.ts test/report.test.ts",
    run: (root) => {
      const ga = readText(root, ".gitattributes");
      if (ga === null) return { ok: false, detail: ".gitattributes is missing (add `* text=auto eol=lf`)" };
      const sample = ["site/assets/site.css", "src/report/styles.ts", "test/report.test.ts", "skill/what-if/SKILL.md"].filter((f) => existsSync(join(root, f)));
      const r = spawnSync("git", ["check-attr", "text", "eol", "--", ...sample], { cwd: root, encoding: "utf8", windowsHide: true });
      if (r.status !== 0) return { ok: false, detail: `git check-attr failed: ${tail(`${r.stdout}${r.stderr}`, 300)}` };
      const attrs = new Map<string, Record<string, string>>();
      for (const line of r.stdout.split(/\r?\n/).filter(Boolean)) {
        const m = /^(.+?): (text|eol): (.+)$/.exec(line);
        if (!m) continue;
        const cur = attrs.get(m[1]!) ?? {};
        cur[m[2]!] = m[3]!;
        attrs.set(m[1]!, cur);
      }
      const problems: string[] = [];
      for (const f of sample) {
        const a = attrs.get(f) ?? {};
        if (a.eol !== "lf") problems.push(`${f}: eol is ${a.eol ?? "unset"} (want lf)`);
        if (a.text === "unset" || a.text === "unspecified" || a.text === undefined) problems.push(`${f}: text is ${a.text ?? "unset"} (want auto or set)`);
      }
      return verdict(problems, `${ga.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).slice(0, 3).join(" | ")}; ${sample.length} sample files resolve to eol=lf`);
    },
  },
  {
    id: "devex-crlf-tests",
    component: "docs-devex",
    title: "npm test passes on a CRLF checkout too (every text file converted to CRLF in a scratch copy): no test depends on line endings",
    command: "node --import tsx qa/run.ts --no-loop --only docs-devex  (copy in node_modules/.cache/what-if-qa/crlf)",
    timeoutMs: 300_000,
    run: (root) => {
      const tests = existsSync(join(root, "test")) ? readdirSync(join(root, "test")).filter((f) => f.endsWith(".test.ts")).sort() : [];
      if (!tests.length) return { ok: false, detail: "test/*.test.ts matches nothing" };
      // The same tests on an LF copy and a CRLF copy: only the failures the CRLF copy adds are line-ending problems.
      const runIn = (eol: "lf" | "crlf") => {
        const dir = scratchCopy(root, eol, eol);
        try {
          const r = proc(process.execPath, ["--import", "tsx", "--test", ...tests.map((t) => `test/${t}`)], dir, 4 * 60_000);
          const count = (re: RegExp) => Number(re.exec(r.out)?.[1] ?? 0);
          const failed = new Set([...r.out.matchAll(/^\s*(?:not ok \d+ - |✖ )(.+?)(?: \(\d[\d.]*m?s\))?$/gm)].map((m) => (m[1] ?? "").trim()).filter((n) => n && !/^failing tests:?$/i.test(n)));
          return { pass: count(/^\s*(?:#|ℹ)\s*pass (\d+)/m), fail: count(/^\s*(?:#|ℹ)\s*fail (\d+)/m), failed, out: r.out };
        } finally {
          rmSync(dir, { recursive: true, force: true });
          scratchDirs.delete(dir);
        }
      };
      const lf = runIn("lf");
      const crlf = runIn("crlf");
      if (lf.pass === 0) return { ok: false, detail: `cannot tell: the tests do not run on an LF copy either (${lf.fail} failed; see the *-tests checks)\n${tail(lf.out, 400)}` };
      const extra = [...crlf.failed].filter((n) => !lf.failed.has(n));
      if (!extra.length && crlf.pass >= lf.pass) return { ok: true, detail: `${tests.length} test files: ${crlf.pass} pass on CRLF as on LF${lf.fail ? ` (${lf.fail} fail on both: not a line-ending problem)` : ""}` };
      return {
        ok: false,
        detail: `on a CRLF checkout ${crlf.pass} pass and ${crlf.fail} fail (LF: ${lf.pass} pass, ${lf.fail} fail) — normalise \\r\\n before comparing file contents (e.g. readFileSync(f, "utf8").replace(/\\r\\n/g, "\\n"))${extra.length ? `\nfails only on CRLF: ${extra.slice(0, 6).join(" | ")}` : ""}\n${tail(crlf.out, 500)}`,
      };
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

/** Stops the dev servers and removes the scratch copies made by the checks. */
export function cleanup(): void {
  stopDev();
  try {
    removeScratch();
  } catch {
    /* a locked file on Windows; the next run starts by deleting the folder */
  }
}
