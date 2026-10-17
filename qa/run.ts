/**
 * What-IF QA bot.
 *
 *   npm run qa                         one QA loop: every check, judges merged, report, loop counted
 *   npm run qa:dry                     dry run (= --no-loop): never counts; writes qa/reports/dry-run.*
 *   npm run qa -- --skip build,ui-names    skip checks (by id, or a whole component by its id)
 *   npm run qa -- --only engine        one component; never counts as a loop
 *   node --import tsx qa/run.ts --list list the checks (markdown table)
 *
 * Scoring (qa/rubric.json, docs/QA-RUBRIC.md):
 *   automated = 1 + 9 × passed / total, capped at 3 when a critical check fails
 *   component = automatedWeight × automated + judgeWeight × judge   (0.6 / 0.4 unless the component overrides)
 *   judge     = mean of qa/judge/<id>.json and qa/judge/<id>.<judge>.json; none → falls back to automated
 *   overall   = Σ weight × component; pass at >= 8.5
 *
 * Loops: state in qa/state.json. After the 5th failed loop the bot stops for good
 * (whatever the score) and says so; delete qa/state.json to start a new series.
 * Reports: qa/reports/loop-N.json and qa/reports/latest.md (every failing check
 * with the command that reproduces it).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, cleanup, type CheckResult } from "./checks.ts";

interface Component {
  id: string;
  title: string;
  weight: number;
  judge: string;
  paths?: string[];
  automatedWeight?: number;
  judgeWeight?: number;
  /** Judge files expected for this component: "reviewer" is qa/judge/<id>.json, others qa/judge/<id>.<name>.json. */
  judges?: string[];
}
interface Rubric {
  name?: string;
  passScore: number;
  maxLoops: number;
  automatedWeight: number;
  judgeWeight: number;
  criticalCap?: number;
  componentTarget?: number;
  components: Component[];
}
interface LoopEntry {
  n: number;
  at: string;
  overall: number;
  passed: boolean;
  failing?: string[];
}
interface State {
  loops: LoopEntry[];
  stopped?: boolean;
  stoppedAt?: string;
}
interface JudgeEntry {
  file: string;
  judge: string;
  score: number;
  notes?: string;
  improvements: string[];
  at: string;
  stale: boolean;
}
interface ComponentScore {
  id: string;
  title: string;
  weight: number;
  automatedWeight: number;
  judgeWeight: number;
  automated: number;
  passed: number;
  total: number;
  criticalFailed: string[];
  judge: number | null;
  judges: JudgeEntry[];
  score: number;
  checks: CheckResult[];
}

const qaDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(qaDir, "..");
const rubric = JSON.parse(readFileSync(join(qaDir, "rubric.json"), "utf8")) as Rubric;
const statePath = join(qaDir, "state.json");
const state: State = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as State) : { loops: [] };
const cap = rubric.criticalCap ?? 3;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- arguments ----------
const argv = process.argv.slice(2);
/** `--name value`, or "true" for a bare flag. */
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  return next === undefined || next.startsWith("--") ? "true" : next;
};
if (opt("help") || opt("h")) {
  console.log("usage: node --import tsx qa/run.ts [--no-loop] [--only <component>] [--skip <id,id>] [--list]");
  process.exit(0);
}
if (opt("list")) {
  console.log("| Check | Component | Critical | What it checks | Reproduce |\n|---|---|---|---|---|");
  for (const c of CHECKS) console.log(`| \`${c.id}\` | ${c.component} | ${c.critical ? "yes" : ""} | ${c.title.replace(/\|/g, "\\|")} | \`${(c.command ?? "").replace(/\|/g, "\\|")}\` |`);
  process.exit(0);
}
const skip = new Set((opt("skip") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const only = opt("only");
const componentIds = rubric.components.map((c) => c.id);
if (only && !componentIds.includes(only)) {
  console.error(`--only ${only}: no such component. Components: ${componentIds.join(", ")}`);
  process.exit(2);
}
const unknownSkips = [...skip].filter((s) => !componentIds.includes(s) && !CHECKS.some((c) => c.id === s));
if (unknownSkips.length) console.warn(`warning: --skip names no check or component: ${unknownSkips.join(", ")}`);
const partial = !!only;
const dry = opt("no-loop") === "true" || partial;

const weightSum = rubric.components.reduce((s, c) => s + c.weight, 0);
if (Math.abs(weightSum - 1) > 0.001) console.warn(`warning: component weights sum to ${weightSum}, not 1`);

const failedLoops = state.loops.filter((l) => !l.passed).length;
if (state.stopped && !dry) {
  const last = state.loops[state.loops.length - 1];
  console.log(`QA bot is stopped: ${failedLoops} failed loops reached the limit of ${rubric.maxLoops} (final score ${last?.overall ?? "?"}; report qa/reports/latest.md).`);
  console.log("Delete qa/state.json to start a new series. Dry runs (npm run qa:dry) still work.");
  process.exit(2);
}
const loopNo = state.loops.length + 1;
const label = dry ? `dry run${partial ? ` (--only ${only}, not counted)` : ""}` : `loop ${loopNo} (failed loops so far: ${failedLoops} of max ${rubric.maxLoops})`;
console.log(`\n${rubric.name ?? "What-IF"} QA bot — ${label}; pass >= ${rubric.passScore}${state.stopped ? " (series stopped; this dry run does not count)" : ""}\n`);

// ---------- keep machine paths out of reports ----------
const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
const variants = (dir: string) => [dir, dir.replace(/\\/g, "/"), dir.replace(/\\/g, "\\\\")].filter((v) => v.length > 3);
function scrub(text: string): string {
  let out = text;
  for (const v of variants(root)) out = out.split(v).join("<repo>");
  if (home) for (const v of variants(home)) out = out.split(v).join("<home>");
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([p, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)} s`)), ms)))]).finally(() => clearTimeout(timer));
}

process.on("unhandledRejection", (e) => console.error(`\n(unhandled rejection inside a check: ${(e as Error)?.message ?? e})`));
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

// ---------- run the checks ----------
const results: CheckResult[] = [];
const t0run = Date.now();
try {
  for (const c of CHECKS) {
    if (only && c.component !== only) continue;
    if (skip.has(c.id) || skip.has(c.component)) {
      results.push({ id: c.id, component: c.component, title: c.title, ok: false, skipped: true, critical: c.critical, detail: "skipped (--skip)", command: c.command, durationMs: 0 });
      console.log(`- ${c.id}: skipped`);
      continue;
    }
    const t0 = Date.now();
    process.stdout.write(`• ${c.id}: ${c.title.slice(0, 90)}${c.title.length > 90 ? "…" : ""} … `);
    let r: { ok: boolean; detail: string };
    try {
      r = await withTimeout(Promise.resolve().then(() => c.run(root)), c.timeoutMs ?? 180_000);
    } catch (e) {
      r = { ok: false, detail: (e as Error)?.message ?? String(e) };
    }
    const durationMs = Date.now() - t0;
    console.log(`${r.ok ? "ok" : "FAIL"} (${(durationMs / 1000).toFixed(1)}s)${r.ok ? "" : `\n    ${scrub(r.detail).split("\n")[0]?.slice(0, 200)}`}`);
    results.push({ id: c.id, component: c.component, title: c.title, ok: r.ok, critical: c.critical, detail: scrub(r.detail), command: c.command, durationMs });
  }
} finally {
  cleanup();
}

// ---------- judges ----------
const judgeDir = join(qaDir, "judge");
const lastLoopAt = state.loops[state.loops.length - 1]?.at;
const warnings: string[] = [];

function readJudges(comp: Component): JudgeEntry[] {
  if (!existsSync(judgeDir)) return [];
  const out: JudgeEntry[] = [];
  for (const f of readdirSync(judgeDir).filter((x) => x.endsWith(".json")).sort()) {
    if (f !== `${comp.id}.json` && !f.startsWith(`${comp.id}.`)) continue;
    const path = join(judgeDir, f);
    let j: { score?: unknown; notes?: unknown; improvements?: unknown; issues?: unknown };
    try {
      j = JSON.parse(readFileSync(path, "utf8")) as typeof j;
    } catch (e) {
      warnings.push(`qa/judge/${f} is not valid JSON (${(e as Error).message}); ignored`);
      continue;
    }
    const score = Number(j.score);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      warnings.push(`qa/judge/${f} has no score from 1 to 10 (got ${JSON.stringify(j.score)}); ignored`);
      continue;
    }
    const list = Array.isArray(j.improvements) ? j.improvements : Array.isArray(j.issues) ? j.issues : [];
    const mtime = statSync(path).mtime;
    out.push({
      file: `qa/judge/${f}`,
      judge: f === `${comp.id}.json` ? "reviewer" : f.slice(comp.id.length + 1, -".json".length),
      score,
      notes: typeof j.notes === "string" ? j.notes : undefined,
      improvements: list.map((x) => (typeof x === "string" ? x : JSON.stringify(x))),
      at: mtime.toISOString(),
      stale: !!lastLoopAt && mtime.getTime() < Date.parse(lastLoopAt),
    });
  }
  return out;
}

// ---------- scores ----------
const scoredComponents = rubric.components.filter((c) => !only || c.id === only);
const components: ComponentScore[] = scoredComponents.map((comp) => {
  const checks = results.filter((r) => r.component === comp.id);
  const counted = checks.filter((r) => !r.skipped);
  const passed = counted.filter((r) => r.ok).length;
  const criticalFailed = counted.filter((r) => r.critical && !r.ok).map((r) => r.id);
  let automated = counted.length ? 1 + 9 * (passed / counted.length) : 1;
  if (criticalFailed.length) automated = Math.min(automated, cap);
  automated = round1(automated);
  const judges = readJudges(comp);
  const judge = judges.length ? round1(judges.reduce((s, j) => s + j.score, 0) / judges.length) : null;
  const aw = comp.automatedWeight ?? rubric.automatedWeight;
  const jw = comp.judgeWeight ?? rubric.judgeWeight;
  const score = round1(aw * automated + jw * (judge ?? automated));
  if (!judges.length) warnings.push(`${comp.id}: no judge file (qa/judge/${comp.id}.json); the judge part fell back to the automated score`);
  const expected = comp.judges ?? ["reviewer"];
  const absent = expected.filter((name) => !judges.some((j) => j.judge === name));
  if (judges.length && absent.length) warnings.push(`${comp.id}: missing judge files ${absent.map((n) => (n === "reviewer" ? `${comp.id}.json` : `${comp.id}.${n}.json`)).join(", ")}`);
  const stale = judges.filter((j) => j.stale).map((j) => j.file);
  if (stale.length) warnings.push(`${comp.id}: judge files written before the last loop (${stale.join(", ")}); re-run the judges`);
  if (!counted.length) warnings.push(`${comp.id}: no checks ran`);
  return { id: comp.id, title: comp.title, weight: comp.weight, automatedWeight: aw, judgeWeight: jw, automated, passed, total: counted.length, criticalFailed, judge, judges, score, checks };
});
const totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;
const overall = round2(components.reduce((s, c) => s + c.weight * c.score, 0) / (partial ? totalWeight : 1));
const passed = !partial && overall >= rubric.passScore;
const target = rubric.componentTarget;
if (target !== undefined) for (const c of components) if (c.score < target) warnings.push(`${c.id}: ${c.score} is below the PRD target of ${target} per component (informational; the gate is the overall score)`);
const skipped = results.filter((r) => r.skipped).map((r) => r.id);
if (skipped.length) warnings.push(`skipped checks are left out of the scores: ${skipped.join(", ")}`);

// ---------- loop state ----------
const at = new Date().toISOString();
let stopNow = false;
if (!dry) {
  state.loops.push({ n: loopNo, at, overall, passed, failing: results.filter((r) => !r.ok && !r.skipped).map((r) => r.id) });
  const failed = state.loops.filter((l) => !l.passed).length;
  if (!passed && failed >= rubric.maxLoops) {
    state.stopped = true;
    state.stoppedAt = at;
    stopNow = true;
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}
const failedSoFar = state.loops.filter((l) => !l.passed).length;

// ---------- refine-the-idea proposals ----------
let refine: { notes?: string; improvements: string[]; at: string } | null = null;
const refinePath = join(judgeDir, "refine.json");
if (existsSync(refinePath)) {
  try {
    const j = JSON.parse(readFileSync(refinePath, "utf8")) as { notes?: unknown; improvements?: unknown };
    refine = { notes: typeof j.notes === "string" ? j.notes : undefined, improvements: (Array.isArray(j.improvements) ? j.improvements : []).map((x) => (typeof x === "string" ? x : JSON.stringify(x))), at: statSync(refinePath).mtime.toISOString() };
  } catch (e) {
    warnings.push(`qa/judge/refine.json is not valid JSON (${(e as Error).message})`);
  }
}

// ---------- reports ----------
const reportsDir = join(qaDir, "reports");
mkdirSync(reportsDir, { recursive: true });
const verdictWord = partial ? "PARTIAL (not gated)" : passed ? "PASS" : "FAIL";
const report = {
  loop: dry ? null : loopNo,
  dryRun: dry,
  only: only ?? null,
  at,
  durationSec: Math.round((Date.now() - t0run) / 1000),
  overall,
  passed,
  passScore: rubric.passScore,
  maxLoops: rubric.maxLoops,
  failedLoops: failedSoFar,
  stopped: !!state.stopped,
  warnings,
  components: components.map(({ checks, ...c }) => ({ ...c, checks })),
};
const base = dry ? "dry-run" : `loop-${loopNo}`;
writeFileSync(join(reportsDir, `${base}.json`), scrub(JSON.stringify(report, null, 2)) + "\n");

const md: string[] = [];
const title = dry ? `dry run${partial ? ` (--only ${only})` : ""}` : `loop ${loopNo} of max ${rubric.maxLoops}`;
md.push(`# ${rubric.name ?? "What-IF"} QA — ${title} — overall **${overall.toFixed(2)} / 10** — ${verdictWord} (pass ≥ ${rubric.passScore})`, "");
const counted = results.filter((r) => !r.skipped);
md.push(`${at} · ${counted.length} checks: ${counted.filter((r) => r.ok).length} passed, ${counted.filter((r) => !r.ok).length} failed, ${skipped.length} skipped · ${Math.round((Date.now() - t0run) / 1000)} s · failed loops so far: ${failedSoFar} of ${rubric.maxLoops}${dry ? " (this dry run does not count)" : ""}`, "");
if (stopNow || (state.stopped && !dry)) md.push(`> **STOPPED.** ${failedSoFar} failed loops reached the limit of ${rubric.maxLoops}. This is the final report, delivered as is. Delete \`qa/state.json\` to start a new series.`, "");
else if (passed && !dry) md.push("> **PASS.** The overall score reached the gate.", "");
const unjudged = components.filter((c) => !c.judges.length);
if (unjudged.length) md.push(`> **${unjudged.length} of ${components.length} components have no judge file**, so their score is automated only (${unjudged.map((c) => c.id).join(", ")}). Run the judges in qa/judges.md before a counted loop.`, "");
md.push("| Component | Weight | Automated | Judge | Score |", "|---|---:|---:|---:|---:|");
for (const c of components) {
  const crit = c.criticalFailed.length ? ` capped (${c.criticalFailed.join(", ")})` : "";
  const jw = c.automatedWeight !== rubric.automatedWeight ? ` · ${c.automatedWeight}/${c.judgeWeight}` : "";
  md.push(`| ${c.title} | ${Math.round(c.weight * 100)}%${jw} | ${c.automated} (${c.passed}/${c.total})${crit} | ${c.judge ?? "–"}${c.judges.length ? ` (${c.judges.map((j) => j.judge).join(", ")})` : ""} | **${c.score}** |`);
}
md.push(`| **Overall** | ${partial ? `${Math.round(totalWeight * 100)}% (renormalised)` : "100%"} | | | **${overall.toFixed(2)}** |`, "");
md.push(`Score = ${rubric.automatedWeight} × automated + ${rubric.judgeWeight} × judge (components marked a/j use their own split). Automated = 1 + 9 × passed/total, capped at ${cap} by a failing critical check. A missing judge falls back to the automated score. See docs/QA-RUBRIC.md.`, "");

if (warnings.length) {
  md.push("## Warnings", "");
  for (const w of warnings) md.push(`- ${w}`);
  md.push("");
}

const failing = results.filter((r) => !r.ok && !r.skipped).sort((a, b) => Number(!!b.critical) - Number(!!a.critical));
md.push(`## Failing checks (${failing.length})`, "");
if (!failing.length) md.push("None.", "");
failing.forEach((r, i) => {
  md.push(`${i + 1}. **${r.id}** (${r.component}${r.critical ? ", critical" : ""}): ${r.title}`);
  if (r.command) md.push(`   - reproduce: \`${r.command}\``);
  const lines = r.detail.trim().split("\n").filter((l) => l.trim()).slice(0, 10);
  for (const l of lines) md.push(`   - ${l.length > 400 ? l.slice(0, 400) + "…" : l}`);
});
md.push("");

if (!partial) {
  md.push("## Biggest gains", "", "What each component would add to the overall score if all its checks passed (judge unchanged).", "", "| Component | Now | All checks pass | Overall gain |", "|---|---:|---:|---:|");
  const gains = components
    .map((c) => {
      const ideal = round1(c.automatedWeight * 10 + c.judgeWeight * (c.judge ?? 10));
      return { c, ideal, gain: round2(c.weight * (ideal - c.score)) };
    })
    .filter((g) => g.gain > 0)
    .sort((a, b) => b.gain - a.gain);
  for (const g of gains) md.push(`| ${g.c.title} | ${g.c.score} | ${g.ideal} | +${g.gain.toFixed(2)} |`);
  if (!gains.length) md.push("| (none) | | | |");
  md.push("");
}

md.push("## Components", "");
for (const c of components) {
  md.push(`### ${c.title} — ${c.score}`, "");
  md.push(`Automated ${c.automated} (${c.passed}/${c.total} checks${c.criticalFailed.length ? `; capped at ${cap} by ${c.criticalFailed.join(", ")}` : ""}). Judge ${c.judge ?? "none (fell back to automated)"}.`, "");
  for (const j of c.judges) {
    md.push(`**Judge: ${j.judge}** (${j.score}/10, ${j.file}, ${j.at.slice(0, 16).replace("T", " ")}${j.stale ? ", stale" : ""})`, "");
    if (j.notes) md.push(j.notes, "");
    if (j.improvements.length) {
      md.push("Improvements:");
      for (const x of j.improvements.slice(0, 8)) md.push(`- ${x}`);
      md.push("");
    }
  }
  for (const r of c.checks) md.push(`- ${r.skipped ? "skip" : r.ok ? "ok" : "FAIL"} \`${r.id}\`${r.critical ? " (critical)" : ""}: ${r.title}${r.ok ? ` — ${r.detail.split("\n")[0]?.slice(0, 160)}` : ""}`);
  md.push("");
}

if (refine) {
  md.push("## Refine the idea (qa/judge/refine.json)", "");
  if (refine.notes) md.push(refine.notes, "");
  refine.improvements.forEach((x, i) => md.push(`${i + 1}. ${x}`));
  md.push("");
}

if (state.loops.length) {
  md.push("## Loop history", "", "| Loop | At | Overall | Result | Failing checks |", "|---:|---|---:|---|---|");
  for (const l of state.loops) md.push(`| ${l.n} | ${l.at.slice(0, 16).replace("T", " ")} | ${l.overall.toFixed(2)} | ${l.passed ? "pass" : "fail"} | ${(l.failing ?? []).length} |`);
  md.push("");
}

writeFileSync(join(reportsDir, `${dry ? "dry-run" : "latest"}.md`), scrub(md.join("\n")));

// ---------- console summary ----------
console.log(`\n${"Component".padEnd(34)} ${"Weight".padStart(6)} ${"Auto".padStart(5)} ${"Judge".padStart(5)} ${"Score".padStart(5)}`);
for (const c of components) console.log(`${c.title.padEnd(34)} ${`${Math.round(c.weight * 100)}%`.padStart(6)} ${String(c.automated).padStart(5)} ${String(c.judge ?? "-").padStart(5)} ${String(c.score).padStart(5)}`);
console.log(`${"Overall".padEnd(34)} ${"".padStart(6)} ${"".padStart(5)} ${"".padStart(5)} ${overall.toFixed(2).padStart(5)}  ${verdictWord}`);
console.log(`\n${failing.length} failing checks. Full report: qa/reports/${dry ? "dry-run" : "latest"}.md`);
if (stopNow) console.log(`\nSTOP: ${failedSoFar} failed loops reached the limit of ${rubric.maxLoops}. Final score ${overall.toFixed(2)}. The bot will not run another loop.`);
else if (!dry) console.log(passed ? "\nPASS: the gate is reached." : `\nFAIL: ${rubric.maxLoops - failedSoFar} failed loop(s) left before the bot stops.`);
process.exit(passed ? 0 : stopNow ? 2 : 1);
