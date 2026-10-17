/**
 * The What-IF MCP tools (transport-agnostic).
 *
 * Every tool is stateless: the server stores nothing. An analysis is
 * recomputed from the owner's inputs on every call, and a rehearsal travels
 * as a compact `state` token (src/state.ts) that the host passes back.
 *
 * Every result has the same shape:
 *   content[0]  a short plain-language summary the model can relay, then
 *               "Open the visual report: <url>" and a one-line coaching hint;
 *   content[1]  (rehearsal tools only) the persona briefs, how to run them,
 *               and the state token, because some clients ignore structuredContent;
 *   structuredContent  the full JSON.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, GetPromptResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  analyze,
  checkInputs,
  compareResult,
  DEMO_BUSINESS,
  demoInputs,
  getTemplate,
  OBSERVED_FIELDS,
  planTest,
  TEMPLATES,
  whatChanged,
} from "../engine/index.ts";
import { setCurrency, signed } from "../engine/format.ts";
import type { Analysis, FieldSpec, InputCheck, RawInputs, TemplateId } from "../engine/types.ts";
import {
  injectEvent,
  interviewBriefs,
  rebuildRehearsal,
  recordInterview,
  roundBriefs,
  autoplayRehearsal,
  startRehearsal,
  toShareRehearsal,
  submitRound,
  summarize,
} from "../sim/index.ts";
import type { PersonaBrief, ReactionMethod, Rehearsal, RehearsalSummary, SegmentId } from "../sim/types.ts";
import { decodeState, encodeState, reportUrl, type ShareState } from "../state.ts";
import { SERVER_INSTRUCTIONS, WHAT_IF_PROMPT } from "./instructions.ts";

declare const __WHATIF_VERSION__: string | undefined;

/** Inlined from package.json by scripts/build.mjs; npm sets npm_package_version when run from a script. */
export const VERSION: string =
  typeof __WHATIF_VERSION__ === "string" ? __WHATIF_VERSION__ : (globalThis.process?.env?.npm_package_version ?? "dev");

export const TOOL_NAMES = [
  "whatif_start",
  "whatif_check_inputs",
  "whatif_run_scenarios",
  "whatif_what_changed",
  "whatif_rehearsal_start",
  "whatif_rehearsal_submit",
  "whatif_rehearsal_event",
  "whatif_rehearsal_autoplay",
  "whatif_rehearsal_interview",
  "whatif_plan_test",
  "whatif_log_result",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const SERVER_DESCRIPTION =
  "What-IF helps café owners rehearse a business decision before they spend money: transparent scenario maths, an imagined-customer rehearsal, a small test plan, and a visual report that explains every number.";

const TEMPLATE_IDS = ["lunch_offer", "price_change"] as const;

/** The exact words every rehearsal tool gives the host about who plays the imagined customers. */
export const HOST_RUN_INSTRUCTIONS =
  "If you can launch subagents (Claude Code / Cowork), launch one per brief IN PARALLEL with the brief as its whole prompt, then call whatif_rehearsal_submit with all JSON replies. Otherwise play each persona yourself, one at a time, using only its brief, and submit with method 'in-context'.";

/** The one line the host adds after a brief when it hands it to a subagent (matches skill/what-if/references/rehearsal.md). */
export const SUBAGENT_SUFFIX = "Do not use any tools. Reply with the JSON object only.";

const ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// ---------------------------------------------------------------------------
// Input schemas (forgiving: numbers or text, unknown keys ignored by the engine)
// ---------------------------------------------------------------------------

const templateArg = z
  .enum(TEMPLATE_IDS)
  .describe("Which decision is being rehearsed: 'lunch_offer' (a fixed-price weekday lunch deal) or 'price_change' (a new price for one item). whatif_start picks it.");

const inputsArg = z
  .record(z.string(), z.union([z.number(), z.string(), z.null()]))
  .describe(
    "The owner's numbers so far, keyed by the field keys whatif_start lists, e.g. {\"weekday_customers\": 140, \"avg_spend\": 7.4}. Numbers or text such as \"32%\" or \"€9,90\". Leave out anything the owner does not know.",
  );

const demoArg = z.boolean().describe("true when these are the made-up demo café's numbers (they are then labelled 'Demo data'). With demo true, missing fields are filled from the demo café.");
const businessArg = z.string().max(200).describe("The business's name or a short description, e.g. 'Café Rosa, Leipzig'.");
const questionArg = z.string().max(500).describe("The owner's 'what if…' question in their own words.");
const currencyArg = z.string().max(3).describe("Currency code: EUR (default), USD, GBP or CHF.");
const stateArg = z
  .string()
  .min(8)
  .describe("The `state` token from the previous What-IF result, passed back unchanged (a report link ending in /r#<token> also works).");
const methodArg = z
  .enum(["subagent", "in-context", "rule-based"])
  .describe("How the replies were produced: 'subagent' (one subagent per brief), 'in-context' (you played each persona yourself), 'rule-based'.");
const replyArg = z.union([z.record(z.string(), z.unknown()), z.string()]);

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

class UserError extends Error {}

function textResult(
  summary: string,
  data: Record<string, unknown>,
  opts: { url?: string | null; urlLabel?: string; hint: string; extra?: string; isError?: boolean },
): CallToolResult {
  const lines = [summary.trim(), ""];
  if (opts.url) lines.push(`${opts.urlLabel ?? "Open the visual report"}: ${opts.url}`);
  lines.push(`Coaching: ${opts.hint}`);
  const content: CallToolResult["content"] = [{ type: "text", text: lines.join("\n") }];
  if (opts.extra) content.push({ type: "text", text: opts.extra.trim() });
  return {
    content,
    structuredContent: { ...data, ...(opts.url !== undefined ? { report_url: opts.url } : {}) },
    ...(opts.isError ? { isError: true } : {}),
  };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Runs a handler and turns any thrown error into a plain-text tool error. */
function safe<A>(fn: (args: A) => CallToolResult): (args: A) => CallToolResult {
  return (args: A) => {
    try {
      return fn(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResult(e instanceof UserError ? msg : `What-IF could not do that: ${msg}`);
    }
  };
}

function bullets(items: readonly string[] | undefined, max = 6): string {
  return (items ?? []).slice(0, max).map((s) => `- ${s}`).join("\n");
}

// ---------------------------------------------------------------------------
// Inputs, analysis and share state
// ---------------------------------------------------------------------------

interface Ctx {
  template: TemplateId;
  inputs: RawInputs;
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
}

function cleanInputs(raw: RawInputs | undefined): RawInputs {
  const out: RawInputs = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k.trim()] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

function makeCtx(a: { template: TemplateId; inputs?: RawInputs; business?: string; question?: string; demo?: boolean; currency?: string }): Ctx {
  const given = cleanInputs(a.inputs);
  const inputs = a.demo ? { ...demoInputs(a.template), ...given } : given;
  const ctx: Ctx = { template: a.template, inputs };
  const business = a.business?.trim() || (a.demo ? DEMO_BUSINESS : undefined);
  if (business) ctx.business = business;
  if (a.question?.trim()) ctx.question = a.question.trim();
  if (a.demo) ctx.demo = true;
  if (a.currency?.trim()) ctx.currency = a.currency.trim().toUpperCase();
  return ctx;
}

function shareOf(ctx: Ctx, extra: Partial<Pick<ShareState, "rehearsal" | "observed">> = {}): ShareState {
  const s: ShareState = { v: 1, template: ctx.template, inputs: ctx.inputs };
  if (ctx.business) s.business = ctx.business;
  if (ctx.question) s.question = ctx.question;
  if (ctx.demo) s.demo = true;
  if (ctx.currency) s.currency = ctx.currency;
  if (extra.rehearsal) s.rehearsal = extra.rehearsal;
  if (extra.observed) s.observed = extra.observed;
  return s;
}

function ctxOf(s: ShareState): Ctx {
  const ctx: Ctx = { template: s.template, inputs: s.inputs };
  if (s.business) ctx.business = s.business;
  if (s.question) ctx.question = s.question;
  if (s.demo) ctx.demo = true;
  if (s.currency) ctx.currency = s.currency;
  return ctx;
}

function describeNotReady(check: InputCheck): string {
  const parts: string[] = [];
  if (check.missing.length) {
    const first = check.missing[0]!;
    parts.push(`Not ready yet: ${check.missing.length} number${check.missing.length === 1 ? "" : "s"} still missing (${check.missing.map((m) => m.label).join("; ")}).`);
    parts.push(`Ask the owner next: "${first.ask}" (field \`${first.key}\`; why: ${first.why})`);
  }
  if (check.problems.length) parts.push(`Please fix:\n${bullets(check.problems, 8)}`);
  parts.push("Then call this tool again with the corrected inputs (whatif_check_inputs gives the next question).");
  return parts.join("\n");
}

/** Analyses the context, or throws a plain-language error naming the next question. */
function analyzeCtx(ctx: Ctx): Analysis {
  getTemplate(ctx.template);
  const check = checkInputs(ctx.template, ctx.inputs, { demo: ctx.demo });
  if (!check.ready) throw new UserError(describeNotReady(check));
  const a = analyze(ctx.template, ctx.inputs, {
    ...(ctx.business ? { business: ctx.business } : {}),
    ...(ctx.question ? { question: ctx.question } : {}),
    ...(ctx.demo ? { demo: true } : {}),
    ...(ctx.currency ? { currency: ctx.currency } : {}),
  });
  setCurrency(a.currency);
  return a;
}

function decodeToken(token: string): ShareState {
  let t = token.trim();
  const hash = t.lastIndexOf("#");
  if (hash >= 0) t = t.slice(hash + 1);
  t = t.replace(/^state[:=]\s*/i, "").replace(/^["'`]+|["'`]+$/g, "");
  try {
    return decodeState(t);
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : String(e));
  }
}

interface Loaded {
  ctx: Ctx;
  analysis: Analysis;
  rehearsal: Rehearsal;
  share: ShareState;
}

function loadRehearsal(token: string): Loaded {
  const share = decodeToken(token);
  if (!share.rehearsal)
    throw new UserError("This state token has no rehearsal in it. Start one with whatif_rehearsal_start, then pass back the state it returns.");
  const ctx = ctxOf(share);
  const analysis = analyzeCtx(ctx);
  const rehearsal = rebuildRehearsal(analysis, share.rehearsal);
  return { ctx, analysis, rehearsal, share };
}

/** Seed, sizes, events, reactions (minus the automatic "not around" ones), interviews and the customer mix. */
function stateFor(ctx: Ctx, r: Rehearsal): { state: string; share: ShareState } {
  const share = shareOf(ctx, { rehearsal: toShareRehearsal(r) });
  return { state: encodeState(share), share };
}

function urlFor(siteUrl: string, share: ShareState): string {
  return reportUrl(siteUrl, share);
}

// ---------------------------------------------------------------------------
// Template choice for whatif_start
// ---------------------------------------------------------------------------

const LUNCH_WORDS = /\b(lunch|lunches|lunchtime|deal|deals|offer|offers|menu|special|specials|combo|meal|meals|midday|noon|promotion|promo|bundle|set price|fixed[- ]price|mittag\w*)\b/gi;
const PRICE_WORDS = /\b(price|prices|pricing|priced|raise|raising|increase|increasing|charge|charging|cents?|expensive|cheaper|cost more|put up|bump|preis\w*)\b/gi;

export function pickTemplate(question: string): { id: TemplateId; fit: "good" | "closest" } {
  const lunch = question.match(LUNCH_WORDS)?.length ?? 0;
  const price = question.match(PRICE_WORDS)?.length ?? 0;
  if (price > lunch) return { id: "price_change", fit: "good" };
  if (lunch > 0) return { id: "lunch_offer", fit: "good" };
  return { id: "lunch_offer", fit: "closest" };
}

function fieldView(f: FieldSpec) {
  return {
    key: f.key,
    label: f.label,
    unit: f.unit,
    kind: f.kind,
    required: f.required,
    ask: f.ask,
    why: f.why,
    example: f.example,
    ...(f.fallback !== undefined ? { fallback: f.fallback } : {}),
  };
}

// ---------------------------------------------------------------------------
// Text for rehearsal results
// ---------------------------------------------------------------------------

function briefsBlock(briefs: PersonaBrief[], state: string, heading: string, submitTool: string, submitNote: string): string {
  const out: string[] = [
    heading,
    HOST_RUN_INSTRUCTIONS,
    `Subagent prompt = the brief verbatim plus one line: "${SUBAGENT_SUFFIX}" Add nothing else (no business numbers, no other persona's reply).`,
    submitNote,
    "",
  ];
  briefs.forEach((b, i) => {
    out.push(`=== Brief ${i + 1} of ${briefs.length}: ${b.name} (personaId ${b.personaId}, round ${b.round}) ===`);
    out.push(b.prompt.trim());
    out.push(`=== end of brief ${i + 1} ===`, "");
  });
  out.push(`state (pass back unchanged to ${submitTool}): ${state}`);
  return out.join("\n");
}

function summaryText(s: RehearsalSummary): string {
  const lines: string[] = [];
  const people = s.personas.length;
  lines.push(`Rehearsal ${s.status === "done" ? "finished" : "so far"}: ${people} imagined customers, ${s.rounds.length} rounds. Change: ${s.change}`);
  if (s.funnel.length) lines.push(`What they did: ${s.funnel.map((f) => `${f.label} ${f.count} of ${f.of}`).join("; ")}.`);
  const quotes = s.quotes.slice(0, 3);
  if (quotes.length) lines.push(`In their words:\n${quotes.map((q) => `- "${q.text}" (${q.name}, round ${q.round})`).join("\n")}`);
  if (s.questionsForOwner.length) lines.push(`Questions they would ask you:\n${bullets(s.questionsForOwner, 4)}`);
  if (s.checkWithRealCustomers.length) lines.push(`Check with real customers:\n${bullets(s.checkWithRealCustomers, 4)}`);
  lines.push(s.caveat);
  return lines.join("\n");
}

function compactSummary(s: RehearsalSummary) {
  return {
    status: s.status,
    method: s.method,
    funnel: s.funnel,
    uptake: s.uptake,
    quotes: s.quotes.slice(0, 8),
    questionsForOwner: s.questionsForOwner,
    checkWithRealCustomers: s.checkWithRealCustomers,
    caveat: s.caveat,
  };
}

function personaList(r: Rehearsal) {
  return r.personas.map((p) => ({
    id: p.id,
    name: p.name,
    segment: p.segmentLabel,
    age: p.age,
    attitude: p.attitude,
    relationship: p.relationship,
    represents: p.represents,
  }));
}

function briefView(b: PersonaBrief) {
  return { personaId: b.personaId, name: b.name, round: b.round, allowedActions: b.allowedActions, prompt: b.prompt };
}

/** Accepts reply objects, raw JSON text, fenced JSON, or one string holding a JSON array. */
export function parseReplies(items: unknown): unknown[] {
  const list = Array.isArray(items) ? items : [items];
  const out: unknown[] = [];
  for (const item of list) {
    if (typeof item !== "string") {
      out.push(item);
      continue;
    }
    const parsed = parseLooseJson(item);
    if (Array.isArray(parsed)) out.push(...parsed);
    else out.push(parsed ?? item);
  }
  return out;
}

function parseLooseJson(text: string): unknown {
  const t = text.trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  for (const [open, close] of [["[", "]"], ["{", "}"]] as const) {
    const a = t.indexOf(open), b = t.lastIndexOf(close);
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        /* try the next shape */
      }
    }
  }
  return undefined;
}

function parseNumber(v: number | string): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(v.replace(/[€$£\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number | undefined, lo: number, hi: number): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

export function createServer(siteUrl: string): McpServer {
  const site = siteUrl.replace(/\/+$/, "");
  const server = new McpServer(
    { name: "what-if", title: "What-IF", version: VERSION, websiteUrl: site },
    { instructions: SERVER_INSTRUCTIONS.split("{{SITE_URL}}").join(site) },
  );

  // 1. whatif_start ---------------------------------------------------------
  server.registerTool(
    "whatif_start",
    {
      title: "Start a What-IF decision rehearsal",
      description:
        "Call this FIRST whenever the user asks a 'what if…' question about their business or a decision (e.g. 'what if I raise prices', 'what if I run a lunch deal', 'should I try a lunch special?', 'what happens if I charge 30 cents more for coffee'). It picks the decision template, lists the few numbers to ask the owner for (each with the question to ask and why it matters), gives demo values and a link to a visual demo report, and explains the coaching steps. Pass the user's question in their own words.",
      inputSchema: {
        question: questionArg,
        business: businessArg.optional(),
        template: templateArg.optional().describe("Optional: force a template instead of letting What-IF choose from the question."),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { question: string; business?: string; template?: TemplateId }) => {
      const picked = args.template ? { id: args.template, fit: "good" as const } : pickTemplate(args.question);
      const t = getTemplate(picked.id);
      const required = t.fields.filter((f) => f.required);
      const optional = t.fields.filter((f) => !f.required);
      const demo = demoInputs(t.id);
      const demoShare: ShareState = {
        v: 1,
        template: t.id,
        inputs: demo,
        business: DEMO_BUSINESS,
        question: picked.fit === "good" ? args.question.trim() : t.exampleQuestion,
        demo: true,
      };
      const demoUrl = urlFor(site, demoShare);
      const others = Object.values(TEMPLATES)
        .filter((x) => x.id !== t.id)
        .map((x) => ({ id: x.id, title: x.title, example_question: x.exampleQuestion }));
      const first = required[0]!;
      const coaching = [
        "Reflect the question back in one sentence and say What-IF will compare a cautious, an expected and an optimistic outcome; it does not predict the future.",
        "Ask for the numbers ONE at a time, in the order given, saying why each matters. Accept rough answers; 'I don't know' is fine for optional ones (a labelled guess is used).",
        "After each answer call whatif_check_inputs; it returns the next question. When ready, call whatif_run_scenarios and share the report link.",
        "Explain break-even and the worst case in plain words, then offer: rehearse with imagined customers (whatif_rehearsal_start), try another number (whatif_what_changed), or plan a small test (whatif_plan_test).",
        "Every figure has a source tag: the owner's number, a guess, a calculation, imagined, or demo. Keep them apart when you talk.",
      ];
      const lines: string[] = [];
      lines.push(`Decision template: ${t.title} (${t.id}). ${t.summary}`);
      if (picked.fit === "closest")
        lines.push(
          `What-IF has worked models for two decisions today: ${Object.values(TEMPLATES).map((x) => x.title.toLowerCase()).join(" and ")}. This question is closest to "${t.title}". If neither fits, say so to the owner and coach with the same method (scenarios, break-even, a small test) without inventing numbers.`,
        );
      lines.push("");
      lines.push(`Numbers to ask for, one at a time (${required.length} needed):`);
      required.forEach((f, i) => lines.push(`${i + 1}. ${f.ask} [${f.key}] (why: ${f.why})`));
      lines.push(`Optional (a labelled guess is used if the owner does not know): ${optional.map((f) => `${f.label} [${f.key}]`).join("; ")}.`);
      lines.push("");
      lines.push(`Start by asking: "${first.ask}"`);
      lines.push(`Or show how it works first with the demo café (${DEMO_BUSINESS}, made-up numbers labelled as demo data): call whatif_run_scenarios with demo: true.`);
      return textResult(
        lines.join("\n"),
        {
          template: t.id,
          title: t.title,
          summary: t.summary,
          fit: picked.fit,
          example_question: t.exampleQuestion,
          ask_first: required.map(fieldView),
          optional_fields: optional.map(fieldView),
          next_question: { key: first.key, ask: first.ask, why: first.why },
          demo: { business: DEMO_BUSINESS, inputs: demo },
          other_templates: others,
          coaching,
          tools_next: ["whatif_check_inputs", "whatif_run_scenarios"],
        },
        {
          url: demoUrl,
          urlLabel: "Open the visual report (demo café, made-up numbers)",
          hint: "Ask one question at a time and say why it matters; share the demo report if the owner wants to see where this is going.",
        },
      );
    }),
  );

  // 2. whatif_check_inputs ---------------------------------------------------
  server.registerTool(
    "whatif_check_inputs",
    {
      title: "Check the owner's numbers and get the next question",
      description:
        "Checks the numbers gathered so far for a What-IF decision and returns the single most important missing item as `next_question` (with the exact question to ask and why it matters), any problems to fix, and which guesses What-IF would fill in. Call it after each answer the owner gives, until it says ready.",
      inputSchema: { template: templateArg, inputs: inputsArg, demo: demoArg.optional() },
      annotations: ANNOTATIONS,
    },
    safe((args: { template: TemplateId; inputs: RawInputs; demo?: boolean }) => {
      const ctx = makeCtx(args);
      const check = checkInputs(ctx.template, ctx.inputs, { demo: ctx.demo });
      const m = check.missing[0];
      const next = m
        ? { key: m.key, ask: m.ask, why: m.why, ...(m.fallback !== undefined ? { fallback: m.fallback } : {}) }
        : check.problems[0]
          ? { key: null, ask: `Check this with the owner: ${check.problems[0]}`, why: "The scenarios would be wrong with this number." }
          : null;
      const guesses = check.resolved.filter((r) => r.source === "assumption" && r.note);
      const lines: string[] = [];
      if (check.ready) lines.push(`Ready: every number the ${getTemplate(ctx.template).title.toLowerCase()} needs is in (${check.resolved.length} values).`);
      else lines.push(`Not ready yet: ${check.missing.length} missing, ${check.problems.length} to fix.`);
      if (next) lines.push(`Next question: "${next.ask}"${m ? ` [${m.key}] (why: ${m.why})` : ""}`);
      if (check.missing.length > 1) lines.push(`Still missing after that: ${check.missing.slice(1).map((x) => x.label).join("; ")}.`);
      if (check.problems.length) lines.push(`Problems:\n${bullets(check.problems, 6)}`);
      if (guesses.length && check.ready)
        lines.push(`Guesses What-IF filled in (tell the owner; they can correct them):\n${bullets(guesses.map((g) => `${g.label}: ${g.note}`), 8)}`);
      else if (guesses.length)
        lines.push(`${guesses.length} optional value${guesses.length === 1 ? "" : "s"} will use a labelled guess unless the owner knows better (see resolved).`);
      if (check.ready) lines.push("Next step: call whatif_run_scenarios with the same template and inputs.");
      const url = check.ready ? urlFor(site, shareOf(ctx)) : null;
      return textResult(
        lines.join("\n"),
        { ...check, next_question: next },
        {
          url,
          hint: check.ready
            ? "Read the filled-in guesses back to the owner before running the scenarios."
            : "Ask only the next question, in the owner's words, and say why it matters.",
        },
      );
    }),
  );

  // 3. whatif_run_scenarios --------------------------------------------------
  server.registerTool(
    "whatif_run_scenarios",
    {
      title: "Run the What-IF scenarios",
      description:
        "Computes the decision's scenarios with deterministic maths (cautious, expected, optimistic), the break-even point, the worst case, the biggest uncertainty and lessons, and returns a visual report link to share. Use demo: true (inputs may be empty) to show the made-up demo café. Never compute these numbers yourself; relay these.",
      inputSchema: {
        template: templateArg,
        inputs: inputsArg.optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { template: TemplateId; inputs?: RawInputs; business?: string; question?: string; demo?: boolean; currency?: string }) => {
      const ctx = makeCtx(args);
      const a = analyzeCtx(ctx);
      const url = urlFor(site, shareOf(ctx));
      return textResult(
        analysisText(a),
        { analysis: a },
        {
          url,
          hint: "Share the link, explain break-even in one sentence, then ask which guess the owner feels least sure about.",
        },
      );
    }),
  );

  // 4. whatif_what_changed ---------------------------------------------------
  server.registerTool(
    "whatif_what_changed",
    {
      title: "Explain what changed",
      description:
        "Re-runs the scenarios after the owner changes one or two numbers and explains, in plain words, why the result moved ('why this changed'). Pass the inputs before the change and after it (after may contain only the fields that changed).",
      inputSchema: {
        template: templateArg,
        before: inputsArg.describe("The inputs before the change (as passed to whatif_run_scenarios)."),
        after: inputsArg.describe("The inputs after the change. Fields left out keep their 'before' value."),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { template: TemplateId; before: RawInputs; after: RawInputs; business?: string; question?: string; demo?: boolean; currency?: string }) => {
      const beforeCtx = makeCtx({ ...args, inputs: args.before });
      const afterCtx = makeCtx({ ...args, inputs: { ...cleanInputs(args.before), ...cleanInputs(args.after) } });
      const before = analyzeCtx(beforeCtx);
      const after = analyzeCtx(afterCtx);
      const change = whatChanged(before, after);
      setCurrency(after.currency);
      const exp = after.scenarios.find((s) => s.id === "expected");
      const lines: string[] = [];
      if (!change.changes.length) lines.push("Nothing changed between the two sets of numbers.");
      else lines.push(`Changed: ${change.changes.map((c) => `${c.label} ${c.fromText} → ${c.toText}`).join("; ")}.`);
      if (change.plain.length) lines.push(`Why the result moved:\n${bullets(change.plain, 5)}`);
      if (exp) lines.push(`Expected result now: ${signed(exp.netTest)} over the test, ${signed(exp.netMonth)} a month after it.`);
      lines.push(`Break-even now: ${after.breakEven.plain}`);
      return textResult(
        lines.join("\n"),
        { change, analysis: after },
        { url: urlFor(site, shareOf(afterCtx)), hint: "Ask the owner what this tells them about which number matters most." },
      );
    }),
  );

  // 5. whatif_rehearsal_start ------------------------------------------------
  server.registerTool(
    "whatif_rehearsal_start",
    {
      title: "Start the imagined-customer rehearsal",
      description:
        "Starts a customer rehearsal: a handful of imagined customers (personas) react round by round to the owner's change. Returns the personas, one ready-to-send brief per persona for round 1, and a `state` token. " +
        HOST_RUN_INSTRUCTIONS +
        " The rehearsal is imagined, not evidence: it produces questions to check with real customers, never forecasts.",
      inputSchema: {
        template: templateArg,
        inputs: inputsArg.optional(),
        personas: z.number().describe("How many imagined customers, 4–12 (default 6).").optional(),
        rounds: z.number().describe("How many rounds, 3–5 (default 4).").optional(),
        seed: z.number().describe("Seed for repeatable personas (optional).").optional(),
        event: z.string().max(300).describe("Optional local event that applies from round 1, e.g. 'a new bakery opens next door'.").optional(),
        customer_mix: z
          .record(z.string(), z.number())
          .describe("Optional weights per customer segment: office_worker, freelancer, student, parent, regular, tourist, retiree, trades.")
          .optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe(
      (args: {
        template: TemplateId;
        inputs?: RawInputs;
        personas?: number;
        rounds?: number;
        seed?: number;
        event?: string;
        customer_mix?: Record<string, number>;
        business?: string;
        question?: string;
        demo?: boolean;
        currency?: string;
      }) => {
        const ctx = makeCtx(args);
        const a = analyzeCtx(ctx);
        const personas = clamp(args.personas, 4, 12);
        const rounds = clamp(args.rounds, 3, 5);
        const r = startRehearsal(a, {
          ...(personas !== undefined ? { personas } : {}),
          ...(rounds !== undefined ? { rounds } : {}),
          ...(args.seed !== undefined && Number.isFinite(args.seed) ? { seed: Math.round(args.seed) } : {}),
          ...(args.event?.trim() ? { event: args.event.trim() } : {}),
          ...(args.customer_mix ? { customerMix: args.customer_mix as Partial<Record<SegmentId, number>> } : {}),
        });
        const briefs = roundBriefs(r);
        const { state, share } = stateFor(ctx, r);
        const url = urlFor(site, share);
        const lines = [
          `Rehearsal ready: ${r.personas.length} imagined customers, ${r.rounds.length} rounds. Change they react to: ${r.change}`,
          `Who they are: ${r.personas.map((p) => `${p.name} (${p.segmentLabel}, ${p.attitude})`).join("; ")}.`,
          `Round 1 of ${r.rounds.length}: ${r.rounds[0]?.title ?? ""}. ${briefs.length} brief${briefs.length === 1 ? "" : "s"} to run (below)${
            briefs.length < r.personas.length ? `; ${r.personas.length - briefs.length} not around this round (handled automatically)` : ""
          }.`,
          "These people are imagined. Their reactions are questions to check with real customers, not a forecast.",
        ];
        return textResult(
          lines.join("\n"),
          {
            rehearsal_id: r.id,
            change: r.change,
            personas: personaList(r),
            round: r.currentRound,
            rounds: r.rounds.length,
            briefs: briefs.map(briefView),
            how_to_run: HOST_RUN_INSTRUCTIONS,
            state,
          },
          {
            url,
            hint: "Tell the owner who the imagined customers are, run the briefs, and share the link as the timeline fills in.",
            extra: briefsBlock(
              briefs,
              state,
              `HOW TO RUN ROUND ${r.currentRound} OF ${r.rounds.length} (${briefs.length} imagined customers):`,
              "whatif_rehearsal_submit",
              "Then call whatif_rehearsal_submit with `state` and `reactions` = every persona's JSON reply (objects or the raw reply text). Use method 'subagent' if subagents played them. No model available? Call whatif_rehearsal_autoplay instead.",
            ),
          },
        );
      },
    ),
  );

  // 6. whatif_rehearsal_submit -----------------------------------------------
  server.registerTool(
    "whatif_rehearsal_submit",
    {
      title: "Submit one round of imagined-customer reactions",
      description:
        "Submits the imagined customers' JSON replies for the current round. Returns which were accepted, errors for any persona whose reply was invalid (re-run only those briefs and submit again), then either the next round's briefs or, when the rehearsal is done, its summary. Always pass the newest `state`. " +
        HOST_RUN_INSTRUCTIONS,
      inputSchema: {
        state: stateArg,
        reactions: z
          .array(replyArg)
          .describe("Every persona's reply for this round: the JSON object each brief asks for (it includes the persona id), or the raw reply text."),
        method: methodArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; reactions: unknown[]; method?: ReactionMethod }) => {
      const { ctx, rehearsal } = loadRehearsal(args.state);
      if (rehearsal.status === "done")
        throw new UserError("This rehearsal has already finished. Use whatif_rehearsal_interview to ask the imagined customers a question, or share the report.");
      const replies = parseReplies(args.reactions);
      if (!replies.length) throw new UserError("No reactions were sent. Pass `reactions` as an array with each persona's JSON reply.");
      const outcome = submitRound(rehearsal, replies, args.method);
      const r = outcome.rehearsal;
      const { state, share } = stateFor(ctx, r);
      const url = urlFor(site, share);
      const errorText = outcome.errors.map((e) => `- ${e.personaId}: ${e.error}`).join("\n");

      if (outcome.accepted === 0 && outcome.errors.length) {
        const retry = roundBriefs(r).filter((b) => outcome.errors.some((e) => e.personaId === b.personaId));
        return textResult(
          `None of the replies could be used, so round ${r.currentRound} has not moved on.\nWhat was wrong:\n${errorText}\nFix those replies (re-run the briefs below if needed) and call whatif_rehearsal_submit again with the same state.`,
          { accepted: 0, errors: outcome.errors, done: false, round: r.currentRound, next: [], retry_briefs: retry.map(briefView), state },
          {
            url,
            hint: "Each reply must be the JSON object its brief asks for, with one of the allowed actions.",
            isError: true,
            ...(retry.length ? { extra: briefsBlock(retry, state, `RE-RUN THESE ${retry.length} BRIEF(S) FOR ROUND ${r.currentRound}:`, "whatif_rehearsal_submit", "Submit only these personas' replies.") } : {}),
          },
        );
      }

      if (outcome.done) {
        const summary = summarize(r);
        return textResult(
          `Accepted ${outcome.accepted} repl${outcome.accepted === 1 ? "y" : "ies"}. The rehearsal is done.\n${summaryText(summary)}`,
          { accepted: outcome.accepted, errors: outcome.errors, done: true, next: [], summary: compactSummary(summary), state },
          {
            url,
            hint: "Share the link, read out one or two quotes, then turn the open questions into a small real test (whatif_plan_test).",
            extra: `state (for whatif_rehearsal_interview): ${state}`,
          },
        );
      }

      if (outcome.errors.length) {
        const retry = roundBriefs(r).filter((b) => outcome.errors.some((e) => e.personaId === b.personaId));
        return textResult(
          `Accepted ${outcome.accepted}; ${outcome.errors.length} need another try before round ${r.currentRound} can finish:\n${errorText}`,
          { accepted: outcome.accepted, errors: outcome.errors, done: false, round: r.currentRound, next: [], retry_briefs: retry.map(briefView), state },
          {
            url,
            hint: "Re-run only the personas listed, then submit their replies with the new state.",
            extra: briefsBlock(retry, state, `RE-RUN THESE ${retry.length} BRIEF(S) FOR ROUND ${r.currentRound}:`, "whatif_rehearsal_submit", "Submit only these personas' replies, with the new state."),
          },
        );
      }

      const next = outcome.next.length ? outcome.next : roundBriefs(r);
      const spec = r.rounds[r.currentRound - 1];
      return textResult(
        `Accepted ${outcome.accepted} repl${outcome.accepted === 1 ? "y" : "ies"}. Round ${r.currentRound} of ${r.rounds.length} is next${spec ? `: ${spec.title}` : ""}. ${next.length} brief${next.length === 1 ? "" : "s"} to run (below).`,
        { accepted: outcome.accepted, errors: [], done: false, round: r.currentRound, rounds: r.rounds.length, next: next.map(briefView), how_to_run: HOST_RUN_INSTRUCTIONS, state },
        {
          url,
          hint: "Give the owner a one-line update on the round, and offer to add a local event before the next one (whatif_rehearsal_event).",
          extra: briefsBlock(
            next,
            state,
            `HOW TO RUN ROUND ${r.currentRound} OF ${r.rounds.length} (${next.length} imagined customers):`,
            "whatif_rehearsal_submit",
            "Then call whatif_rehearsal_submit with this new `state` and every persona's JSON reply.",
          ),
        },
      );
    }),
  );

  // 7. whatif_rehearsal_event ------------------------------------------------
  server.registerTool(
    "whatif_rehearsal_event",
    {
      title: "Add a local event to the rehearsal",
      description:
        "Adds something the owner wants to rehearse, e.g. 'it rains all week' or 'a competitor opens nearby'; it applies before the next round. Returns the new `state` and the updated briefs for that round.",
      inputSchema: { state: stateArg, event: z.string().min(3).max(300).describe("What happens, in one sentence.") },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; event: string }) => {
      const { ctx, rehearsal } = loadRehearsal(args.state);
      if (rehearsal.status === "done") throw new UserError("This rehearsal has already finished, so there is no next round for the event. Start a new rehearsal with `event` set instead.");
      const r = injectEvent(rehearsal, args.event.trim());
      const briefs = roundBriefs(r);
      const { state, share } = stateFor(ctx, r);
      return textResult(
        `Added before round ${r.currentRound}: "${args.event.trim()}". The ${briefs.length} brief${briefs.length === 1 ? "" : "s"} below now include it.`,
        { round: r.currentRound, events: r.events, briefs: briefs.map(briefView), how_to_run: HOST_RUN_INSTRUCTIONS, state },
        {
          url: urlFor(site, share),
          hint: "Ask the owner what they expect the event to change, then run the round and compare.",
          extra: briefsBlock(
            briefs,
            state,
            `HOW TO RUN ROUND ${r.currentRound} OF ${r.rounds.length} (with the event):`,
            "whatif_rehearsal_submit",
            "Then call whatif_rehearsal_submit with this new `state` and every persona's JSON reply.",
          ),
        },
      );
    }),
  );

  // 8. whatif_rehearsal_autoplay ---------------------------------------------
  server.registerTool(
    "whatif_rehearsal_autoplay",
    {
      title: "Finish the rehearsal without a model",
      description:
        "Plays every remaining round of the rehearsal with the rule-based stand-in (no model, repeatable), then returns the summary, the new `state` and the report link. Use it when you cannot play the personas, to show a quick demo, or to finish a rehearsal early.",
      inputSchema: { state: stateArg },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string }) => {
      const { ctx, rehearsal } = loadRehearsal(args.state);
      const r = autoplayRehearsal(rehearsal);
      const summary = summarize(r);
      const { state, share } = stateFor(ctx, r);
      return textResult(
        `Played the remaining rounds with the rule-based stand-in (no model).\n${summaryText(summary)}`,
        { done: r.status === "done", summary: compactSummary(summary), state },
        {
          url: urlFor(site, share),
          hint: "Say these reactions came from simple rules, not people; use them to pick what to ask real customers.",
          extra: `state (for whatif_rehearsal_interview): ${state}`,
        },
      );
    }),
  );

  // 9. whatif_rehearsal_interview --------------------------------------------
  server.registerTool(
    "whatif_rehearsal_interview",
    {
      title: "Interview the imagined customers",
      description:
        "Asks the imagined customers a follow-up question after (or during) the rehearsal. Without `answers` it returns one brief per persona; run them, then call again with the same question and the JSON `answers` to record them in the report. " +
        HOST_RUN_INSTRUCTIONS,
      inputSchema: {
        state: stateArg,
        question: z.string().min(3).max(300).describe("The owner's question, e.g. 'What would make you come back next week?'"),
        persona_ids: z.array(z.string()).describe("Only ask these personas (ids from the persona list); default all.").optional(),
        answers: z.array(replyArg).describe("The personas' JSON replies to the interview briefs (second call only).").optional(),
        method: methodArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; question: string; persona_ids?: string[]; answers?: unknown[]; method?: ReactionMethod }) => {
      const { ctx, rehearsal } = loadRehearsal(args.state);
      const question = args.question.trim();
      if (!args.answers || args.answers.length === 0) {
        const briefs = interviewBriefs(rehearsal, question, args.persona_ids?.length ? args.persona_ids : undefined);
        const { state, share } = stateFor(ctx, rehearsal);
        return textResult(
          `Interview question: "${question}". ${briefs.length} brief${briefs.length === 1 ? "" : "s"} below, one per imagined customer.`,
          { question, briefs: briefs.map(briefView), how_to_run: HOST_RUN_INSTRUCTIONS, state },
          {
            url: urlFor(site, share),
            hint: "Remind the owner these answers are imagined; the useful part is the questions they suggest for real customers.",
            extra: briefsBlock(
              briefs,
              state,
              `HOW TO RUN THE INTERVIEW (${briefs.length} imagined customers):`,
              "whatif_rehearsal_interview",
              "Then call whatif_rehearsal_interview again with the same `state` and `question`, and `answers` = every persona's JSON reply.",
            ),
          },
        );
      }
      const replies = parseReplies(args.answers);
      const out = recordInterview(rehearsal, question, replies, args.method);
      const { state, share } = stateFor(ctx, out.rehearsal);
      const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
      const iv = out.rehearsal.interviews.find((x) => squash(question).startsWith(squash(x.question)));
      const recorded = iv?.answers ?? [];
      const errs = out.errors.map((e) => `- ${e.personaId}: ${e.error}`).join("\n");
      if (!recorded.length && out.errors.length)
        return textResult(
          `None of the answers could be recorded:\n${errs}\nFix them and call whatif_rehearsal_interview again with the same state, question and answers.`,
          { question, recorded: [], errors: out.errors, state },
          { url: urlFor(site, share), hint: "Each answer must be the JSON object its brief asks for.", isError: true },
        );
      const lines = [`Recorded ${recorded.length} imagined answer${recorded.length === 1 ? "" : "s"} to "${question}":`];
      lines.push(bullets(recorded.map((x) => `${x.name}: "${x.answer}"`), 8));
      if (out.errors.length) lines.push(`Could not record:\n${errs}`);
      return textResult(
        lines.join("\n"),
        { question, recorded, errors: out.errors, state },
        {
          url: urlFor(site, share),
          hint: "Turn the most surprising answer into one question to ask three real customers this week.",
          extra: `state: ${state}`,
        },
      );
    }),
  );

  // 10. whatif_plan_test -----------------------------------------------------
  server.registerTool(
    "whatif_plan_test",
    {
      title: "Plan a small, low-risk test",
      description:
        "Turns the analysis into a small, reversible real-world test: how many days, what to prepare, what to measure and how, check-in days, a keep / tweak / stop rule, and a cost cap. Pass `state` from a rehearsal to keep it in the report.",
      inputSchema: {
        template: templateArg,
        inputs: inputsArg.optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        state: stateArg.optional().describe("Optional: the latest rehearsal `state`, so the report link keeps the rehearsal."),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { template: TemplateId; inputs?: RawInputs; business?: string; question?: string; demo?: boolean; currency?: string; state?: string }) => {
      const ctx = makeCtx(args);
      const a = analyzeCtx(ctx);
      const plan = planTest(a);
      const prior = args.state ? decodeToken(args.state) : undefined;
      const share = shareOf(ctx, prior?.rehearsal ? { rehearsal: prior.rehearsal } : {});
      const lines = [
        `Test plan: ${plan.title} (${plan.days} days).`,
        plan.plain,
        plan.before.length ? `Before you start:\n${bullets(plan.before, 5)}` : "",
        plan.measure.length ? `Measure:\n${bullets(plan.measure.map((m) => `${m.what}: ${m.how}`), 5)}` : "",
        plan.checkIns.length ? `Check-ins:\n${bullets(plan.checkIns.map((c) => `Day ${c.day}: ${c.look}`), 5)}` : "",
        `Decision rule:\n- Keep: ${plan.decisionRule.keep}\n- Tweak: ${plan.decisionRule.tweak}\n- Stop: ${plan.decisionRule.stop}`,
        `Cost cap: ${plan.costCap}`,
        "After the test, call whatif_log_result with what was measured.",
      ].filter(Boolean);
      return textResult(lines.join("\n"), { plan, analysis_id: a.id }, {
        url: urlFor(site, share),
        hint: "Agree the start date and who counts what, and ask the owner to come back with the numbers.",
      });
    }),
  );

  // 11. whatif_log_result ----------------------------------------------------
  server.registerTool(
    "whatif_log_result",
    {
      title: "Compare a real test result with the scenarios",
      description:
        "After the owner has run the test, compares what really happened with the cautious, expected and optimistic scenarios, gives a keep / tweak / stop verdict and what was learned. Observed keys for lunch_offer: baseline_lunch_customers, test_lunch_customers, redemptions_per_day (optional days_run, actual_setup_cost); for price_change: units_before_per_week, units_after_per_week (optional days_run).",
      inputSchema: {
        template: templateArg,
        inputs: inputsArg.optional(),
        observed: z
          .record(z.string(), z.union([z.number(), z.string()]))
          .describe("What the test measured, e.g. {\"baseline_lunch_customers\": 38, \"test_lunch_customers\": 47, \"redemptions_per_day\": 15}."),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        state: stateArg.optional().describe("Optional: the latest rehearsal `state`, so the report link keeps the rehearsal."),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: {
      template: TemplateId;
      inputs?: RawInputs;
      observed: Record<string, number | string>;
      business?: string;
      question?: string;
      demo?: boolean;
      currency?: string;
      state?: string;
    }) => {
      const ctx = makeCtx(args);
      const fields = OBSERVED_FIELDS[ctx.template];
      const observed: Record<string, number> = {};
      const bad: string[] = [];
      for (const [k, v] of Object.entries(args.observed ?? {})) {
        const n = parseNumber(v);
        if (n === undefined) bad.push(`"${k}" should be a number; got "${v}".`);
        else observed[k.trim()] = n;
      }
      const missing = fields.filter((f) => f.required && observed[f.key] === undefined);
      if (missing.length || bad.length)
        throw new UserError(
          [
            missing.length ? `To compare the test with the scenarios I still need: ${missing.map((f) => `${f.label} [${f.key}]`).join("; ")}.` : "",
            bad.length ? `Please fix:\n${bullets(bad)}` : "",
            `Measured values this template understands: ${fields.map((f) => `${f.key}${f.required ? "" : " (optional)"}`).join(", ")}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      const a = analyzeCtx(ctx);
      const result = compareResult(a, observed);
      setCurrency(a.currency);
      const prior = args.state ? decodeToken(args.state) : undefined;
      const share = shareOf(ctx, { observed, ...(prior?.rehearsal ? { rehearsal: prior.rehearsal } : {}) });
      const closest =
        result.closestScenario === "below_cautious"
          ? "below even the cautious scenario"
          : result.closestScenario === "above_optimistic"
            ? "above the optimistic scenario"
            : `closest to the ${result.closestScenario} scenario`;
      const lines = [
        result.plain,
        `${result.actualLabel}: ${result.actual} (${closest}). Result over the test: ${signed(result.netTest)}.`,
        `Verdict: ${result.verdict.toUpperCase()}.`,
        result.learned.length ? `What this teaches:\n${bullets(result.learned, 5)}` : "",
      ].filter(Boolean);
      return textResult(lines.join("\n"), { result, analysis_id: a.id }, {
        url: urlFor(site, share),
        hint: "Celebrate that they tested before committing, then ask what they will change next time.",
      });
    }),
  );

  // Prompt -------------------------------------------------------------------
  server.registerPrompt(
    "what-if",
    {
      title: "What if…?",
      description: "Rehearse a business decision with What-IF: scenarios, an imagined-customer rehearsal and a small test plan.",
      argsSchema: { question: z.string().describe("Your 'what if…' question, e.g. 'What if I run a weekday lunch offer?'").optional() },
    },
    (args: { question?: string }): GetPromptResult => {
      const q = args.question?.trim();
      let text = WHAT_IF_PROMPT.split("{{SITE_URL}}").join(site);
      const slot = /\{\{?\s*question\s*\}\}?/i;
      if (slot.test(text))
        text = q
          ? text.replace(new RegExp(slot.source, "gi"), () => q.replace(/"/g, "'"))
          : text.replace(new RegExp(`"?${slot.source}"?`, "gi"), "(not given yet: ask me what I am thinking of trying)");
      else if (q) text = `${text.trim()}\n\nMy question: ${q}`;
      return {
        description: "What-IF decision coach",
        messages: [{ role: "user", content: { type: "text", text } }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Plain-language summary of an analysis
// ---------------------------------------------------------------------------

export function analysisText(a: Analysis): string {
  setCurrency(a.currency);
  const lines: string[] = [];
  lines.push(`${a.business}: ${a.question}`);
  if (a.demo) lines.push("Demo data: these are made-up numbers for a demo café.");
  lines.push(`Break-even (the one number to remember): ${a.breakEven.plain}`);
  lines.push("Three possible outcomes (calculated from the owner's numbers and guesses):");
  for (const s of a.scenarios) lines.push(`- ${s.label}: ${s.plain || `${signed(s.netTest)} over the test; ${signed(s.netMonth)} a month.`}`);
  lines.push(`Worst case: ${a.worstCase.plain}`);
  lines.push(`Biggest uncertainty: ${a.biggestUncertainty.plain}`);
  if (a.warnings.length) lines.push(`Watch out:\n${bullets(a.warnings, 3)}`);
  lines.push(
    "Next step: let the owner move one guess (whatif_what_changed), rehearse it with imagined customers (whatif_rehearsal_start), or plan a small test (whatif_plan_test).",
  );
  return lines.join("\n");
}
