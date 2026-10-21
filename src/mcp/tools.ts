/**
 * The What-IF MCP tools (transport-agnostic).
 *
 * Every tool is stateless: the server stores nothing. An analysis is
 * recomputed from the owner's inputs on every call, and a rehearsal travels
 * as a compact `state` token (src/state.ts) that the host passes back.
 *
 * Every result has the same shape:
 *   content[0]  a short plain-language summary the model can relay, then
 *               the report link and a one-line coaching hint, in the owner's language;
 *   content[1]  (rehearsal tools only) the persona briefs, how to run them,
 *               and the state token, because some clients ignore structuredContent;
 *   structuredContent  the full JSON, with `lang` and (when there is one) `report_url`.
 *
 * Languages: every tool takes an optional `lang` (de default, en, es, pl; "German",
 * "Deutsch", "pl-PL" work too). It goes into the analysis, the rehearsal and every
 * report link. The framing sentences here come from ./messages.ts.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, type CallToolResult, type GetPromptResult, type ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  analyze,
  BERLIN_KIEZE,
  checkInputs,
  compareResult,
  demoBusiness,
  demoInputs,
  getTemplate,
  observedFields,
  parseNumber as parseOwnerNumber,
  planTest,
  TEMPLATES,
  whatChanged,
} from "../engine/index.ts";
import { setCurrency, signed } from "../engine/format.ts";
import type { Analysis, DecisionTemplate, FieldSpec, InputCheck, RawInputs, TemplateId } from "../engine/types.ts";
import { DEFAULT_LANG, getLang, isLang, LANG_NAMES, normaliseLang, setLang, type Lang, type Params } from "../i18n/index.ts";
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
import { BERLIN_EVENTS, findBerlinEvent } from "../sim/berlin.ts";
import type { PersonaBrief, ReactionMethod, Rehearsal, RehearsalSummary, SegmentId } from "../sim/types.ts";
import { decodeState, encodeState, reportUrl, type ShareState } from "../state.ts";
import { SERVER_INSTRUCTIONS, WHAT_IF_PROMPT } from "./instructions.ts";
import { betaAssistantNote, betaInstructionsNote, betaMessage, mcpT, type McpKey } from "./messages.ts";

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
  "What-IF helps café owners rehearse a business decision before they spend money: transparent scenario maths, an imagined-customer rehearsal, a small test plan, and a visual report that explains every number. Closed beta for Berlin cafés; German, English, Spanish and Polish.";

const TEMPLATE_IDS = ["lunch_offer", "price_change"] as const;

/**
 * The exact words a rehearsal tool gives the host about who plays the imagined customers.
 * `next` is what to call once every reply is in, so the interview never points at the submit tool.
 */
export function hostRunInstructions(next = "whatif_rehearsal_submit with all JSON replies"): string {
  return `If you can launch subagents (Claude Code / Cowork), launch one per brief IN PARALLEL with the brief as its whole prompt, then call ${next}. Otherwise play each persona yourself, one at a time, using only its brief, and use method 'in-context'.`;
}

export const HOST_RUN_INSTRUCTIONS = hostRunInstructions();

/** What the interview tool says instead: its answers go back to the interview tool, not to submit. */
export const INTERVIEW_RUN_INSTRUCTIONS = hostRunInstructions(
  "whatif_rehearsal_interview again with the same `state` and `question` and `answers` = all JSON replies",
);

/** The one line the host adds after a brief when it hands it to a subagent (matches skill/what-if/references/rehearsal.md). */
export const SUBAGENT_SUFFIX = "Do not use any tools. Reply with the JSON object only.";

const ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// ---------------------------------------------------------------------------
// Input schemas (forgiving: numbers or text; unknown keys are named, not used)
// ---------------------------------------------------------------------------

/** Every object input (inputs, before, after, observed, customer_mix, a reply) has at most this many keys. */
export const MAX_KEYS = 60;
/** Field names longer than this are refused. */
export const MAX_KEY_CHARS = 60;
/**
 * The whole call is capped too (keys and array items, nested). The SDK counts them before
 * anything is parsed, so a call with 25,000 keys is refused at once instead of being read.
 * A full rehearsal round (12 replies of about 10 keys) needs fewer than 200.
 */
export const MAX_INPUT_ELEMENTS = 1000;
/** Ignored keys named back to the model: the first few (with a "did you mean"), plus a count. */
export const MAX_IGNORED_SHOWN = 8;

/**
 * An object input: keys of at most `keyChars` characters, at most MAX_KEYS of them, each refusal
 * with a note that says what to send instead (the SDK relays the record's own message, so the key
 * note is set on the record). JSON Schema gets maxLength on the keys and maxProperties.
 */
function record<V extends z.ZodType>(value: V, keyChars = MAX_KEY_CHARS, keyNote = "use the keys whatif_start lists") {
  return z
    .record(z.string().max(keyChars), value, {
      error: (iss) => (iss.code === "invalid_key" ? `A field name has at most ${keyChars} characters; ${keyNote}.` : undefined),
    })
    .refine((o) => Object.keys(o).length <= MAX_KEYS, {
      error: `Too many keys: What-IF reads at most ${MAX_KEYS} in one object. Send only the fields it asked for (whatif_start and whatif_check_inputs list them).`,
    })
    .meta({ maxProperties: MAX_KEYS });
}

const templateArg = z
  .enum(TEMPLATE_IDS)
  .describe("Which decision is being rehearsed: 'lunch_offer' (a fixed-price weekday lunch deal) or 'price_change' (a new price for one item). whatif_start picks it.");

const valueArg = z.union([
  z.number(),
  z.string().max(100, { error: 'A value has at most 100 characters: send the number, e.g. 7.4, "32%" or "9,90 €".' }),
  z.null(),
]);

const inputsArg = record(valueArg).describe(
  "The owner's numbers so far, keyed by the field keys whatif_start lists, e.g. {\"weekday_customers\": 140, \"avg_spend\": 7.4}. Numbers or text such as \"32%\" or \"9,90 €\". Leave out anything the owner does not know. At most 60 keys.",
);

const demoArg = z.boolean().describe("true when these are the made-up demo café's numbers (they are then labelled 'Demo data'). With demo true, missing fields are filled from the demo café.");
const businessArg = z.string().max(200).describe("The business's name or a short description, e.g. 'Café Rosa, Neukölln'.");
const questionArg = z.string().max(500).describe("The owner's 'what if…' question in their own words.");
const currencyArg = z.string().max(3).describe("Currency code: EUR (default), USD, GBP or CHF.");
const langArg = z
  .string()
  .max(24)
  .describe("The owner's language for every text and the report: 'de' (default), 'en', 'es' or 'pl'. Pass the language the owner writes in; 'German', 'Deutsch', 'pl-PL' also work.");
const stateArg = z
  .string()
  .min(8)
  .max(62_000) // src/state.ts caps the token at 60,000 characters; a report link adds the site address
  .describe("The `state` token from the previous What-IF result, passed back unchanged (a report link ending in /r#<token> also works).");
const stateInsteadArg = stateArg.describe(
  "The `state` from the latest What-IF result (or its report_url). It carries the template, inputs, business, question, demo flag, language and any rehearsal, so you can leave those out; fields you do pass override it.",
);
const methodArg = z
  .enum(["subagent", "in-context", "rule-based"])
  .describe("How the replies were produced: 'subagent' (one subagent per brief), 'in-context' (you played each persona yourself), 'rule-based'.");
const replyArg = z.union([record(z.unknown(), MAX_KEY_CHARS, "send the JSON object the brief asks for"), z.string().max(4000, { error: "A reply has at most 4,000 characters; send the JSON object the brief asks for." })]);

// ---------------------------------------------------------------------------
// Language and messages
// ---------------------------------------------------------------------------

type T = (key: McpKey, p?: Params) => string;

const tr =
  (lang: Lang): T =>
  (key, p = {}) =>
    mcpT(key, p, lang);

/** Not given: the fallback (the state's language, else German). Given but unknown (e.g. "fr"): English. */
export function langOf(arg: unknown, fallback: Lang = DEFAULT_LANG): Lang {
  if (typeof arg !== "string" || !arg.trim()) return fallback;
  return normaliseLang(arg, "en");
}

function useLang(lang: Lang): T {
  setLang(lang);
  return tr(lang);
}

/** The template's field texts in the owner's language. */
function templateIn(id: string, lang: Lang): DecisionTemplate {
  return getTemplate(id, lang);
}

function observedFieldsIn(id: TemplateId, lang: Lang) {
  return observedFields(id, lang);
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

class UserError extends Error {}

function textResult(
  t: T,
  lang: Lang,
  summary: string,
  data: Record<string, unknown>,
  opts: { url?: string | null; urlLabel?: string; hint: string; extra?: string; isError?: boolean },
): CallToolResult {
  const lines = [summary.trim(), ""];
  if (opts.url) lines.push(`${opts.urlLabel ?? t("open_report")}: ${opts.url}`);
  lines.push(`${t("coaching_label")}: ${opts.hint}`);
  const content: CallToolResult["content"] = [{ type: "text", text: lines.join("\n") }];
  if (opts.extra) content.push({ type: "text", text: opts.extra.trim() });
  return {
    content,
    structuredContent: { lang, ...data, ...(opts.url !== undefined ? { report_url: opts.url } : {}) },
    ...(opts.isError ? { isError: true } : {}),
  };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Runs a handler and turns any thrown error into a plain-text tool error (in the language of the call). */
function safe<A extends { lang?: string }>(fn: (args: A) => CallToolResult): (args: A) => CallToolResult {
  return (args: A) => {
    try {
      return fn(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The call's language: its `lang`, else the one the handler had set (e.g. from the state).
      return errorResult(e instanceof UserError ? msg : tr(args?.lang ? langOf(args.lang) : getLang())("err_internal", { msg }));
    }
  };
}

function bullets(items: readonly string[] | undefined, max = 6): string {
  return (items ?? []).slice(0, max).map((s) => `- ${s}`).join("\n");
}

// ---------------------------------------------------------------------------
// Inputs: known fields only; unknown keys are named with a "did you mean"
// ---------------------------------------------------------------------------

export interface IgnoredKey {
  key: string;
  did_you_mean: string[];
}

/** Words owners and models use for the template fields. Only targets the template really has are suggested. */
const KEY_ALIASES: Record<string, string[]> = {
  weekday_customers: ["customers", "customers_per_day", "customers_a_day", "daily_customers", "customers_day", "guests", "guests_per_day", "covers", "footfall", "visitors", "kunden", "gaeste"],
  avg_spend: ["average_spend", "avg_ticket", "average_ticket", "ticket", "spend", "spend_per_customer", "basket", "average_basket", "bon", "receipt", "durchschnittsbon"],
  variable_cost_share: ["food_cost", "food_cost_share", "cost_share", "cogs", "cogs_share", "ingredient_share", "wareneinsatz"],
  monthly_fixed_costs: ["fixed_costs", "fixed_costs_per_month", "monthly_costs", "overheads", "rent", "fixkosten"],
  lunch_customers: ["lunch_guests", "lunch_covers", "customers_at_lunch", "lunch_customers_per_day"],
  lunch_spend: ["lunch_ticket", "lunch_avg_spend", "average_lunch_spend", "lunch_average_spend"],
  cash_buffer: ["buffer", "cash", "savings", "reserve", "reserves", "rucklage", "ruecklage"],
  offer_price: ["deal_price", "lunch_price", "menu_price", "offer", "price"],
  offer_cost: ["deal_cost", "cost_per_deal", "food_cost_per_deal", "offer_food_cost", "menu_cost"],
  setup_cost: ["setup", "one_off_cost", "one_off", "startup_cost", "launch_cost"],
  extra_staff_hours_per_day: ["staff_hours", "extra_hours", "extra_staff_hours", "hours_per_day"],
  staff_hourly_cost: ["hourly_wage", "wage", "hourly_rate", "staff_cost_per_hour", "stundenlohn"],
  extra_staff_cost_per_day: ["staff_cost", "extra_staff", "staff_cost_per_day"],
  marketing_per_week: ["marketing", "ads", "advertising", "promotion_cost", "werbung"],
  test_days: ["days", "test_length", "duration", "trial_days", "days_to_test"],
  extra_low: ["low", "extra_cautious", "cautious"],
  extra_likely: ["likely", "extra_customers", "extra_expected", "expected"],
  extra_high: ["high", "extra_optimistic", "optimistic"],
  switch_share: ["switch", "switchers", "share_switch", "cannibalisation", "cannibalization"],
  vat_rate: ["vat", "mwst", "ust", "tax", "tax_rate", "mehrwertsteuer"],
  kiez: ["neighbourhood", "neighborhood", "district", "area", "bezirk", "location"],
  item: ["product", "item_name", "name"],
  current_price: ["price", "old_price", "price_now", "today_price", "price_today"],
  new_price: ["price", "price_new", "proposed_price", "target_price", "next_price"],
  units_per_week: ["sales_per_week", "units", "cups_per_week", "weekly_sales", "sold_per_week", "units_week"],
  unit_cost: ["cost_per_unit", "cost", "item_cost", "cost_per_item"],
  volume_low: ["low", "cautious"],
  volume_likely: ["likely", "expected", "volume", "volume_change"],
  volume_high: ["high", "optimistic"],
  // measured values (whatif_log_result)
  baseline_lunch_customers: ["baseline", "before", "customers_before", "lunch_customers_before"],
  test_lunch_customers: ["during", "after", "customers_during", "lunch_customers_during", "lunch_customers_after"],
  redemptions_per_day: ["redemptions", "deals_sold", "deals_per_day", "sold_per_day", "offers_sold"],
  units_before_per_week: ["before", "baseline", "sales_before", "units_before"],
  units_after_per_week: ["after", "sales_after", "units_after"],
  days_run: ["days", "test_days", "days_tested"],
  actual_setup_cost: ["setup_cost", "real_setup_cost"],
};

const normKey = (k: string): string =>
  k
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

const WEAK_TOKENS = new Set(["per", "a", "the", "of", "day", "week", "month", "total", "avg", "average", "value", "number"]);

/** Up to two known keys the unknown one probably meant: an alias, a near-spelling, or a shared word. */
export function suggestKeys(key: string, known: readonly string[]): string[] {
  const k = normKey(key);
  const byAlias = known.filter((f) => KEY_ALIASES[f]?.includes(k));
  if (byAlias.length) return byAlias.slice(0, 2);
  const near = known.filter((f) => editDistance(k, f) <= Math.max(1, Math.min(3, Math.floor(f.length / 4))));
  if (near.length) return near.slice(0, 2);
  const words = k.split("_").filter((w) => w.length > 2 && !WEAK_TOKENS.has(w));
  const scored = known
    .map((f) => ({ f, n: f.split("_").filter((w) => words.includes(w)).length }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n);
  return scored.slice(0, 2).map((x) => x.f);
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

/**
 * Keeps the template's own fields; anything else is returned as ignored, with a suggestion.
 * Suggestions prefer fields that are still empty ("price" next to current_price means new_price).
 */
export function splitInputs(template: TemplateId, raw: RawInputs | undefined, alreadyGiven: readonly string[] = []): { inputs: RawInputs; ignored: IgnoredKey[] } {
  const known = getTemplate(template).fields.map((f) => f.key);
  const clean = cleanInputs(raw);
  const given = new Set([...alreadyGiven, ...Object.keys(clean).filter((k) => known.includes(k))]);
  const open = known.filter((k) => !given.has(k));
  const inputs: RawInputs = {};
  const ignored: IgnoredKey[] = [];
  for (const [k, v] of Object.entries(clean)) {
    if (known.includes(k)) inputs[k] = v;
    else ignored.push(ignoredKey(k, ignored.length, open, known));
  }
  return { inputs, ignored };
}

/** An unknown key; only the first MAX_IGNORED_SHOWN get a "did you mean" (the rest are only counted). */
function ignoredKey(k: string, index: number, open: readonly string[], known: readonly string[]): IgnoredKey {
  const key = k.slice(0, MAX_KEY_CHARS);
  if (index >= MAX_IGNORED_SHOWN) return { key, did_you_mean: [] };
  const fresh = suggestKeys(k, open);
  return { key, did_you_mean: fresh.length ? fresh : suggestKeys(k, known) };
}

/** What a result says about ignored keys: the first few, and how many there were. */
function ignoredView(ignored: readonly IgnoredKey[]): { ignored_inputs: IgnoredKey[]; ignored_count: number } {
  return { ignored_inputs: ignored.slice(0, MAX_IGNORED_SHOWN), ignored_count: ignored.length };
}

function ignoredLine(t: T, ignored: readonly IgnoredKey[], where: string): string {
  if (!ignored.length) return "";
  const shown = ignored
    .slice(0, MAX_IGNORED_SHOWN)
    .map((x) => (x.did_you_mean.length ? t("ignored_item_suggest", { key: x.key, options: x.did_you_mean.join(t("or_word")) }) : x.key));
  const more = ignored.length - shown.length;
  const list = [...shown, ...(more > 0 ? [t("ignored_more", { n: more })] : [])].join("; ");
  return t("ignored_keys", { list, template: where });
}

// ---------------------------------------------------------------------------
// Context: template + inputs + labels, from arguments or from a state token
// ---------------------------------------------------------------------------

interface Ctx {
  template: TemplateId;
  inputs: RawInputs;
  lang: Lang;
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
  ignored: IgnoredKey[];
}

interface CtxArgs {
  template?: TemplateId;
  inputs?: RawInputs;
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
  lang?: string;
  state?: string;
}

/**
 * Builds the context from the arguments. With `state`, the token supplies everything
 * and the arguments override it (inputs are merged). Sets the language for the call.
 */
function resolveCtx(a: CtxArgs, opts: { allowState?: boolean } = {}): { ctx: Ctx; prior?: ShareState; t: T } {
  const prior = opts.allowState && a.state?.trim() ? decodeToken(a.state, langOf(a.lang)) : undefined;
  const lang = langOf(a.lang, prior?.lang && isLang(prior.lang) ? prior.lang : DEFAULT_LANG);
  const t = useLang(lang);
  if (prior && a.template && a.template !== prior.template) throw new UserError(t("err_template_mismatch", { state: prior.template, given: a.template }));
  const template = prior?.template ?? a.template;
  if (!template) throw new UserError(t("err_need_template"));
  const { inputs: given, ignored } = splitInputs(template, a.inputs, prior ? Object.keys(prior.inputs) : []);
  const demo = a.demo ?? prior?.demo ?? false;
  const base = prior ? { ...prior.inputs, ...given } : given;
  const inputs = demo ? { ...demoInputs(template, lang), ...base } : base;
  const ctx: Ctx = { template, inputs, lang, ignored };
  const business = a.business?.trim() || prior?.business?.trim() || (demo ? demoBusiness(lang) : undefined);
  if (business) ctx.business = business;
  const question = a.question?.trim() || prior?.question?.trim();
  if (question) ctx.question = question;
  if (demo) ctx.demo = true;
  const currency = a.currency?.trim() || prior?.currency?.trim();
  if (currency) ctx.currency = currency.toUpperCase();
  return { ctx, ...(prior ? { prior } : {}), t };
}

/**
 * What a re-check or re-run keeps from the state it was given: the rehearsal and the
 * measured result, but only while the numbers are the same (new numbers make them stale).
 */
function carried(prior: ShareState | undefined, ctx: Ctx): Partial<Pick<ShareState, "rehearsal" | "observed">> {
  if (!prior || prior.template !== ctx.template) return {};
  const same = (a: RawInputs, b: RawInputs) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => String(a[k]) === String(b[k]));
  };
  if (!same(prior.inputs, ctx.inputs)) return {};
  return { ...(prior.rehearsal ? { rehearsal: prior.rehearsal } : {}), ...(prior.observed ? { observed: prior.observed } : {}) };
}

/** Key order matches decodeState's sanitised copy, so a token re-encodes to the same string. */
function shareOf(ctx: Ctx, extra: Partial<Pick<ShareState, "rehearsal" | "observed">> = {}): ShareState {
  const s: ShareState = { v: 1, template: ctx.template, inputs: ctx.inputs };
  if (ctx.business) s.business = ctx.business;
  if (ctx.question) s.question = ctx.question;
  if (ctx.demo) s.demo = true;
  if (ctx.currency) s.currency = ctx.currency;
  s.lang = ctx.lang;
  s.madeBy = "coach";
  if (extra.observed) s.observed = extra.observed;
  if (extra.rehearsal) s.rehearsal = extra.rehearsal;
  return s;
}

function ctxOf(s: ShareState, lang: Lang): Ctx {
  const ctx: Ctx = { template: s.template, inputs: s.inputs, lang, ignored: [] };
  if (s.business) ctx.business = s.business;
  if (s.question) ctx.question = s.question;
  if (s.demo) ctx.demo = true;
  if (s.currency) ctx.currency = s.currency;
  return ctx;
}

function describeNotReady(t: T, check: InputCheck, ignored: readonly IgnoredKey[], template: TemplateId): string {
  const parts: string[] = [];
  if (check.missing.length) {
    const first = check.missing[0]!;
    parts.push(t("nr_missing", { n: check.missing.length, list: check.missing.map((m) => m.label).join("; ") }));
    parts.push(t("nr_ask_next", { ask: first.ask, key: first.key, why: first.why }));
  }
  if (check.problems.length) parts.push(`${t("please_fix")}\n${bullets(check.problems, 8)}`);
  const ign = ignoredLine(t, ignored, template);
  if (ign) parts.push(ign);
  parts.push(t("nr_call_again"));
  return parts.join("\n");
}

/** Analyses the context, or throws a plain-language error naming the next question. */
function analyzeCtx(ctx: Ctx): Analysis {
  const t = useLang(ctx.lang);
  const check = checkInputs(ctx.template, ctx.inputs, { demo: ctx.demo });
  if (!check.ready) throw new UserError(describeNotReady(t, check, ctx.ignored, ctx.template));
  const opts: Parameters<typeof analyze>[2] = {
    lang: ctx.lang,
    ...(ctx.business ? { business: ctx.business } : {}),
    ...(ctx.question ? { question: ctx.question } : {}),
    ...(ctx.demo ? { demo: true } : {}),
    ...(ctx.currency ? { currency: ctx.currency } : {}),
  };
  const a = analyze(ctx.template, ctx.inputs, opts);
  setLang(ctx.lang);
  setCurrency(a.currency);
  return a;
}

/** Reads a state token or report link. Damage and size limits are checked by decodeState (src/state.ts). */
function decodeToken(token: string, lang: Lang): ShareState {
  let s = token.trim();
  const hash = s.lastIndexOf("#");
  if (hash >= 0) s = s.slice(hash + 1);
  s = s.replace(/^state[:=]\s*/i, "").replace(/^["'`]+|["'`]+$/g, "");
  try {
    return decodeState(s);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const t = tr(lang);
    const said = lang === "en" ? msg : /format/i.test(msg) ? t("err_old_link") : t("err_bad_link");
    throw new UserError(`${said} ${t("err_bad_link_hint")}`);
  }
}

interface Loaded {
  ctx: Ctx;
  analysis: Analysis;
  rehearsal: Rehearsal;
  share: ShareState;
  t: T;
}

function loadRehearsal(token: string, langArg?: string): Loaded {
  const share = decodeToken(token, langOf(langArg));
  const lang = langOf(langArg, share.lang && isLang(share.lang) ? share.lang : DEFAULT_LANG);
  const t = useLang(lang);
  if (!share.rehearsal) throw new UserError(t("err_no_rehearsal"));
  const ctx = ctxOf(share, lang);
  const analysis = analyzeCtx(ctx);
  const rehearsal = rebuildRehearsal(analysis, share.rehearsal);
  return { ctx, analysis, rehearsal, share, t };
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
// Reading the question for whatif_start
// ---------------------------------------------------------------------------

/** One pattern from a word list: "word" exact, "word*" a prefix, "*word*" anywhere in a word (German compounds). */
function words(list: readonly string[]): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const parts = list.map((w) => {
    const pre = w.startsWith("*"), post = w.endsWith("*");
    const body = esc(w.replace(/^\*|\*$/g, ""));
    return `${pre ? "\\p{L}*" : ""}${body}${post ? "\\p{L}*" : ""}`;
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

const count = (re: RegExp, s: string): number => s.match(re)?.length ?? 0;

const LUNCH = words([
  "lunch*", "mittag*", "*mittagstisch*", "*mittagsmenü*", "*mittagsangebot*", "*mittagessen*", "midday", "noon", "deal", "deals", "meal deal*", "set menu*",
  "set price", "fixed price", "fixed-price", "combo*", "bundle*", "special", "specials", "menu", "menus", "*menü*", "tagesgericht*", "tagesessen", "kombi*",
  "almuerzo*", "menú del día", "plato del día", "mediodía", "obiad*", "zestaw*", "lunchow*",
]);
/** "offer", "Angebot", "oferta", "promo": lunch-ish, but also used for discounts, so they count half. */
const LUNCH_WEAK = words(["offer", "offers", "*angebot*", "oferta*", "ofert*", "promo*", "promotion*", "aktion*", "promoción*", "promocj*"]);
/**
 * Other fixed-price offers that work like the lunch deal (one price, a time window, regulars may
 * switch): a happy hour, a breakfast deal. They use the lunch-offer template, so they count 1.5.
 */
const DEAL_LIKE = words([
  "happy hour*", "happy-hour*", "happyhour*", "hora feliz",
  "breakfast deal*", "breakfast combo*", "breakfast special*", "breakfast menu*", "breakfast offer*",
  "*frühstücksangebot*", "*frühstücksmenü*", "*frühstücksdeal*", "*frühstückskombi*",
  "menú de desayuno", "oferta de desayuno", "desayuno completo", "zestaw śniadaniow*", "oferta śniadaniow*",
]);
const HAPPY_HOUR = words(["happy hour*", "happy-hour*", "happyhour*", "hora feliz"]);
/** Words for lunch itself: with one of these, a "deal" is the lunch deal, not a happy hour or breakfast. */
const LUNCH_ITSELF = words([
  "lunch*", "mittag*", "*mittagstisch*", "*mittagsmenü*", "*mittagsangebot*", "*mittagessen*", "midday", "noon",
  "almuerzo*", "menú del día", "plato del día", "mediodía", "obiad*", "lunchow*",
]);
/** "10% off", "10 % Rabatt", "un 10 % de descuento", "10% zniżki": a discount, which is a price change. */
const PERCENT_OFF =
  /\d+(?:[.,]\d+)?\s*(?:%|percent|per cent|prozent|por ciento|procent\p{L}*)\s*(?:off|discount|rabatt|nachlass|weniger|günstiger|billiger|de descuento|descuento|de rebaja|menos|zniżki|rabatu|taniej|mniej)(?![\p{L}])/iu;
const DISCOUNT = words(["discount*", "rabatt*", "*rabatt", "nachlass", "descuento*", "rebaj*", "zniżk*", "rabat*"]);
const PRICE = words([
  "price*", "pricing", "raise", "raising", "increase*", "charge", "charging", "cent", "cents", "expensive", "cheaper", "cheap", "cost more", "put up", "bump",
  "reduce*", "lower my", "lower the", "discount*", "down to", "knock off", "mark up", "markup",
  "*preis*", "teurer", "billiger", "günstiger", "erhöh*", "senke", "senken", "senkung", "rabatt*", "*rabatt", "aufschlag*", "verlangen", "verlange",
  "precio*", "subir*", "subo", "bajar*", "rebaj*", "descuento*", "más caro", "más barato", "barat*", "céntimo*", "cobrar*", "cobro",
  "cena", "ceny", "cenę", "cenie", "cen", "cenow*", "podnie*", "podwyż*", "obniż*", "zniżk*", "rabat*", "drożej", "droższ*", "taniej", "tańsz*", "grosz*",
]);
/** The owner sets a price ("my price", "raise", "erhöhe", "subo"), not just "something increases". */
const PRICE_OWN = words([
  "price*", "pricing", "*preis*", "precio*", "cena", "ceny", "cenę", "cen", "cheaper", "teurer", "billiger", "günstiger", "taniej", "drożej",
  "más caro", "más barato", "discount*", "rabatt*", "descuento*", "zniżk*",
  "raise", "raising", "put up", "charge", "charging", "lower my", "lower the", "erhöhe", "senke", "verlange", "subo", "cobro", "podniosę", "obniżę",
]);
const MONEY = /(?:€|\beur\b|\beuro\b)\s*\d|\d+(?:[.,]\d+)?\s*(?:€|eur\b|euro|cents?\b|ct\b|cent\b|céntimos?|grosz\w*|zł)/iu;

type Topic = "hiring" | "hours" | "location" | "product" | "investment" | "delivery";
const TOPICS: Record<Topic, RegExp> = {
  hiring: words([
    "hire*", "hiring", "part-time*", "part time*", "staff*", "employ*", "take on", "worker*", "extra person", "minijob*", "mini-job*",
    "*aushilf*", "einstell*", "mitarbeiter*", "mehr personal", "personalkosten*", "angestellt*", "werkstudent*", "contrat*", "emplead*", "camarer*", "media jornada",
    "zatrudni*", "pracowni*", "kelner*", "pół etatu",
  ]),
  hours: words([
    "opening hours", "open on", "open sunday*", "sunday*", "open until", "open till", "open later", "open earlier", "open longer", "stay open",
    "close at", "close earlier", "close later", "closing time", "evening*", "late opening",
    "öffnungszeit*", "sonntag*", "länger öffnen", "länger auf", "länger offen", "früher öffnen", "früher schließen", "abends", "schließe", "zumachen", "öffne",
    "horario*", "domingo*", "abrir", "abro", "cerrar", "cierro", "por la noche",
    "godziny otwarcia", "niedziel*", "otwier*", "otworz*", "otwarte", "zamyk*", "zamkn*", "wieczor*",
  ]),
  location: words([
    "move to", "new location", "second location", "second café", "second cafe", "expand*", "relocat*", "sublet*", "rent out",
    "umzieh*", "umzug*", "zweite filiale", "filiale", "standort*", "zweites café", "zweiten laden", "untervermiet*",
    "mudar*", "segundo local", "nuevo local", "przeprowadz*", "drugi lokal", "nowy lokal",
  ]),
  product: words([
    "new product*", "new item*", "start selling", "sell a new", "add a new", "neues produkt", "neue produkte", "ins sortiment", "sortiment*", "auf die karte",
    "nuevo producto", "nuevos productos", "a la carta", "nowy produkt", "nowe produkty", "do oferty", "do menu",
  ]),
  investment: words([
    "renovat*", "new machine", "espresso machine", "equipment", "invest*", "refurbish*", "umbau*", "renovier*", "neue maschine", "siebträger*", "investier*",
    "reforma*", "inversión", "invertir", "inwest*", "remont*", "nowy ekspres",
  ]),
  delivery: words(["deliver*", "lieferando*", "wolt", "uber eats", "ubereats", "lieferdienst*", "lieferung*", "liefern", "entrega*", "a domicilio", "glovo", "dostawa", "dostawy", "dowóz*", "pyszne*"]),
};
/** "add … to the menu" is a new product, even though it says "menu". */
const ADD_TO_MENU = /\b(add|put)\b.{1,40}\b(to|on)\s+(the|my|our)\s+menu\b/iu;

type Outside = "weather" | "absurd" | "competitor" | "rent" | "costs" | "event";
const OUTSIDE: Record<Outside, RegExp> = {
  weather: words([
    "rain", "rains", "raining", "rainy", "snow*", "storm*", "heatwave*", "heat wave*", "the heat", "weather", "sunny", "windy", "thunder*",
    "regen", "regnet", "regnen", "regentag*", "regenwetter", "regenwoche*", "dauerregen", "platzregen", "schnee*", "schneit", "*hitze*", "kälte", "wetter*", "gewitter*", "sturm*", "sonnig",
    "lluvia*", "llueve", "llover", "nieve", "nieva", "calor", "ola de calor", "tormenta*",
    "deszcz*", "pada", "padać", "śnieg*", "upał*", "pogod*", "burz*",
  ]),
  absurd: words([
    "alien*", "ufo*", "zombie*", "dinosaur*", "martian*", "meteor*", "asteroid*", "apocalyp*", "end of the world",
    "außerirdisch*", "marsmensch*", "weltuntergang*", "apokalyp*", "extraterrestre*", "marcian*", "apocalipsis", "kosmit*", "ufoludk*", "apokalip*",
  ]),
  competitor: words([
    "competitor*", "competition", "rival*", "new café", "new cafe", "new bakery", "new coffee shop", "opens next door", "opens nearby", "opens across",
    "opens down the street", "two doors down", "starbucks",
    "konkurren*", "neues café", "neue bäckerei", "nebenan eröffnet", "eröffnet nebenan", "macht nebenan auf",
    "competencia", "competidor*", "nueva cafetería", "abre al lado", "konkurenc*", "konkurent*", "nowa kawiarnia", "obok otwiera",
  ]),
  rent: words(["landlord*", "rent", "rents", "vermieter*", "miete", "mieten", "mieterhöh*", "*miete", "alquiler*", "casero*", "arrendador*", "czynsz*", "wynajmując*"]),
  costs: words([
    "supplier*", "inflation*", "energy", "electricity", "milk price*", "bean price*", "coffee beans", "cost of milk", "wholesale",
    "lieferant*", "strompreis*", "energiepreis*", "milchpreis*", "kaffeebohnen", "großhandel*",
    "proveedor*", "inflación", "electricidad", "dostawc*", "inflacj*", "prąd*",
  ]),
  event: words([
    "strike*", "streik*", "huelga*", "strajk*", "bvg", "baustelle*", "construction", "road works", "roadworks", "obras", "budow*",
    "school holidays", "schulferien*", "ferien", "vacaciones", "wakacje*", "ferie", "festival*", "straßenfest*", "kiezfest*",
    "christmas market*", "weihnachtsmarkt*", "mercadillo navideño", "jarmark*", "pandemic", "pandemie*", "lockdown*", "pandemia*",
  ]),
};

/** The owner speaks about their own action: "I", "we", "my", "ich", "wir", "yo", "ja"… */
const FIRST_PERSON = words([
  "i", "i'm", "i'd", "i'll", "i've", "we", "we're", "we'd", "we'll", "my", "our", "mine", "ours", "me", "us",
  "ich", "wir", "mein*", "unser*", "mir", "mich", "uns",
  "yo", "mi", "mis", "nosotros", "nuestr*", "ofrezco", "pongo", "hago", "abro", "cierro", "contrato", "lanzo", "pruebo", "respondo", "subo", "cobro",
  "ja", "mój", "moj*", "nasz*", "mnie", "podniosę", "obniżę", "wprowadzę", "zrobię", "otworzę", "zaoferuję", "zatrudnię", "odpowiem",
]);

const RESULT_WORDS = words(["result", "results", "ergebnis*", "resultado*", "wynik*", "rezultat*"]);
const TEST_WORDS = words(["test", "tests", "trial", "testlauf*", "testwoche*", "testphase*", "probe*", "prueba*", "testu", "teście", "testem"]);
/** The owner is back or hands over numbers: "I'm back", "here are", "zurück", "hier sind", "estos son", "oto"… */
const BACK_WORDS = words([
  "back", "came back", "here are", "here is", "here's",
  "zurück", "wieder da", "hier sind", "hier ist", "anbei",
  "he vuelto", "vuelto", "volví", "estos son", "aquí están", "aquí tienes", "aquí van",
  "wróciłem", "wróciłam", "wróciliśmy", "oto", "po teście",
]);
/** The test is behind them: "we ran", "I did", "it is over", "gemacht", "vorbei", "terminé", "zrobiłam"… */
const DONE_WORDS = words([
  "ran", "did", "done", "finished", "over", "measured", "counted", "tested", "completed", "wrapped up",
  "gemacht", "durchgeführt", "gelaufen", "vorbei", "fertig", "zu ende", "abgeschlossen", "beendet", "gemessen", "gezählt", "getestet", "ausprobiert",
  "terminé", "terminó", "terminado", "terminamos", "acabé", "acabó", "acabamos", "hice", "hicimos", "hecho", "medí", "medimos", "conté", "probé", "probamos",
  "zrobiłam", "zrobiłem", "zrobiliśmy", "zrobiłyśmy", "skończył*", "zakończył*", "zmierzył*", "przetestowa*", "policzył*", "minął", "minęły", "minęło",
]);
/** A question about the future ("what if", "was wäre", "¿y si", "co jeśli", "should I"…): results need "back" words then. */
const HYPOTHETICAL = words([
  "what if", "what about", "should i", "should we", "is it worth", "can i expect", "could i expect",
  "was wäre", "was ist wenn", "was ist, wenn", "was passiert, wenn", "was passiert wenn", "lohnt es sich", "lohnt sich", "sollte ich", "sollten wir", "kann ich erwarten",
  "y si", "qué pasa si", "qué pasaría si", "me conviene", "debería", "puedo esperar",
  "co jeśli", "co jesli", "co gdyby", "a gdyby", "czy warto", "czy powinienem", "czy powinnam", "czy opłaca się",
]);
/** A count from the café: "47 Gäste", "47 lunch guests a day", "15 am Tag", "620 a week". */
const COUNTED =
  /\d+(?:[.,]\d+)?\s*(?:\p{L}+\s+){0,2}?(?:guests?|customers?|covers|people|lunches|deals|sold|gäste\p{L}*|kunden\p{L}*|personen|leute|angebote|verkauft\p{L}*|clientes|personas|comensales|menús|vendid\p{L}*|klient\p{L}*|gości|osób|osoby|zestaw\p{L}*|sprzedan\p{L}*|a day|per day|each day|am tag|pro tag|täglich|al día|por día|cada día|dziennie|na dzień|a week|per week|pro woche|in der woche|a la semana|por semana|tygodniowo|w tygodniu)(?![\p{L}])/iu;

/** Questions that use a template for something that works the same way (a happy hour, a discount). */
export type Similar = "happy_hour" | "breakfast" | "discount";

export type QuestionKind =
  | { kind: "decision"; id: TemplateId; fit: "good" | "similar"; like?: Similar; outside?: Outside }
  | { kind: "results"; id: TemplateId | null }
  | { kind: "unsupported"; topic: Topic; nearest: TemplateId | null }
  | { kind: "not_a_decision"; reason: Outside }
  | { kind: "unclear" };

/** Removes "milk price", "Strompreis"… so a supplier's price does not read as the owner's own price. */
const SUPPLIER_PRICE = /(milk|bean|coffee bean|energy|electricity)\s+price\p{L}*|\p{L}*(milch|strom|energie|bohnen)preis\p{L}*/giu;

/**
 * Reads the owner's question: a decision What-IF models (lunch offer, price change),
 * results coming back from a test, a decision it cannot model yet (hiring, hours, moving…),
 * something the owner does not control (weather, a competitor, the landlord, aliens), or unclear.
 * It never forces the lunch template on a question that is not about a lunch offer.
 */
export function classifyQuestion(question: string): QuestionKind {
  const q = question.slice(0, 500);
  // "Nachmittag" is not lunch; "deal with" is not a deal.
  const forLunch = q.replace(/nachmittag\p{L}*/giu, " ").replace(/\bdeal(s|t|ing)?\s+with\b/giu, " ");
  const dealLike = count(DEAL_LIKE, forLunch);
  const lunch = count(LUNCH, forLunch) + 0.5 * count(LUNCH_WEAK, forLunch) + 1.5 * dealLike;
  const percentOff = PERCENT_OFF.test(q);
  const price = count(PRICE, q) + (MONEY.test(q) ? 0.5 : 0) + (percentOff ? 1.5 : 0);
  const nearest: TemplateId | null = price > lunch ? "price_change" : lunch > 0 ? "lunch_offer" : null;

  // Back with real numbers from a test: point to whatif_log_result. A "what if" question needs
  // "back" words ("I'm back", "hier sind"); otherwise results alone, or a test that is done, or a count, do.
  const result = count(RESULT_WORDS, q) > 0;
  const test = count(TEST_WORDS, q) > 0;
  const back = count(BACK_WORDS, q) > 0;
  const done = count(DONE_WORDS, q) > 0;
  const counted = COUNTED.test(q);
  const returning =
    count(HYPOTHETICAL, q) > 0 ? (result || test) && back : result || (test && (done || back || counted)) || ((done || back) && counted);
  if (returning) return { kind: "results", id: nearest };

  const me = count(FIRST_PERSON, q) > 0;
  const outside = (Object.keys(OUTSIDE) as Outside[]).find((k) => count(OUTSIDE[k], q) > 0);
  // Something happens to the café ("it rains", "a new café opens") and the owner names no action of their own.
  if (outside && (!me || outside === "absurd")) return { kind: "not_a_decision", reason: outside };

  // A decision the owner controls but What-IF cannot model yet (hiring, hours, moving, new products…).
  const hits = (Object.keys(TOPICS) as Topic[]).map((k) => ({ k, n: count(TOPICS[k], q) + (k === "product" && ADD_TO_MENU.test(q) ? 2 : 0) }));
  const topic = hits.filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0];
  if (topic && topic.n >= lunch + price) return { kind: "unsupported", topic: topic.k, nearest };

  // "My landlord doubles the rent", "the milk price goes up": a cost the owner does not set,
  // unless they also name their own price or offer ("…so I raise my coffee price").
  if ((outside === "rent" || outside === "costs") && lunch === 0 && count(PRICE_OWN, q.replace(SUPPLIER_PRICE, " ")) === 0)
    return { kind: "not_a_decision", reason: outside };

  const where = outside ? { outside } : {};
  if (price > lunch) {
    const discount = percentOff || count(DISCOUNT, q) > 0;
    return discount ? { kind: "decision", id: "price_change", fit: "similar", like: "discount", ...where } : { kind: "decision", id: "price_change", fit: "good", ...where };
  }
  if (lunch > 0) {
    // A happy hour or a breakfast deal uses the lunch-offer template; say how its fields are read.
    if (dealLike > 0 && count(LUNCH_ITSELF, forLunch) === 0)
      return { kind: "decision", id: "lunch_offer", fit: "similar", like: count(HAPPY_HOUR, forLunch) > 0 ? "happy_hour" : "breakfast", ...where };
    return { kind: "decision", id: "lunch_offer", fit: "good", ...where };
  }
  if (outside) return { kind: "not_a_decision", reason: outside };
  return { kind: "unclear" };
}

/** Kept for older callers: the template a question maps to, or null when it is not a decision What-IF models. */
export function pickTemplate(question: string): { id: TemplateId | null; kind: QuestionKind["kind"] } {
  const k = classifyQuestion(question);
  return { id: k.kind === "decision" ? k.id : k.kind === "results" ? k.id : null, kind: k.kind };
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
// Berlin lists for whatif_start (events to rehearse, Kieze for the customer mix)
// ---------------------------------------------------------------------------

/** Owner-injected "what if"s for the rehearsal (src/sim/berlin.ts), never facts. */
function berlinEvents(lang: Lang): { id: string; text: string }[] {
  return BERLIN_EVENTS.map((e) => ({ id: e.id, text: e.text[lang] ?? e.text.en }));
}

/** The Kieze the rehearsal knows (src/engine/berlin.ts), proper names in every language. */
function berlinKieze(): string[] {
  return [...BERLIN_KIEZE];
}

// ---------------------------------------------------------------------------
// Text for rehearsal results
// ---------------------------------------------------------------------------

function briefsBlock(briefs: PersonaBrief[], state: string, heading: string, runInstructions: string, submitTool: string, submitNote: string): string {
  const out: string[] = [
    heading,
    runInstructions,
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

function summaryText(t: T, s: RehearsalSummary): string {
  const lines: string[] = [];
  lines.push(
    t(s.status === "done" ? "sum_done" : "sum_so_far", { people: s.personas.length, rounds: s.rounds.length, change: s.change }),
  );
  if (s.funnel.length) lines.push(t("sum_did", { list: s.funnel.map((f) => t("of_count", { label: f.label, count: f.count, of: f.of })).join("; ") }));
  const quotes = s.quotes.slice(0, 3);
  if (quotes.length) lines.push(`${t("sum_words")}\n${quotes.map((q) => `- ${t("quote", { text: q.text, name: q.name, round: q.round })}`).join("\n")}`);
  if (s.questionsForOwner.length) lines.push(`${t("sum_questions")}\n${bullets(s.questionsForOwner, 4)}`);
  if (s.checkWithRealCustomers.length) lines.push(`${t("sum_check")}\n${bullets(s.checkWithRealCustomers, 4)}`);
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

function personaList(r: Rehearsal, t: T) {
  return r.personas.map((p) => ({
    id: p.id,
    name: p.name,
    segment: p.segmentLabel,
    age: p.age,
    attitude: p.attitude,
    attitude_label: t(`att_${p.attitude}` as McpKey),
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

function clamp(n: number | undefined, lo: number, hi: number): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

declare const __WHATIF_BETA_CONTACT__: string | undefined;

/**
 * Where an owner asks for an invite code: WHATIF_BETA_CONTACT at run time, else the value the
 * build baked in (scripts/build.mjs), else "". Clipped so a stray value cannot flood a message.
 */
export function betaContact(): string {
  const env = globalThis.process?.env?.WHATIF_BETA_CONTACT;
  const built = typeof __WHATIF_BETA_CONTACT__ === "string" ? __WHATIF_BETA_CONTACT__ : "";
  return (env ?? built).trim().slice(0, 300);
}

/**
 * Fills {{SITE_URL}} and {{BETA_CONTACT}}. Without a contact, every line that holds
 * {{BETA_CONTACT}} is left out (as scripts/build.mjs does for the skill), so no "Ask here: ." remains.
 */
export function fillPlaceholders(text: string, site: string, contact = betaContact()): string {
  const kept = contact ? text : text.split("\n").filter((line) => !line.includes("{{BETA_CONTACT}}")).join("\n");
  return kept.split("{{SITE_URL}}").join(site).split("{{BETA_CONTACT}}").join(contact);
}

export interface WhatIfServerOptions {
  /**
   * Closed beta, and this request has no valid invite code. Everything still lists
   * (initialize, tools/list, prompts/list), so the host connects without an OAuth sign-in,
   * and every tools/call returns the closed-beta message as a tool error the owner sees.
   */
  locked?: { hadCode: boolean };
}

/** The tool result every call gets without a valid invite code: German and English, the contact, the link pattern. */
export function betaToolResult(site: string, hadCode: boolean, contact = betaContact()): CallToolResult {
  const message = betaMessage(hadCode, contact, site);
  const connector = `${site}/api/mcp?code=YOUR-CODE`;
  return {
    content: [{ type: "text", text: `${message}\n\n${betaAssistantNote(site)}` }],
    structuredContent: {
      beta: {
        required: true,
        valid: false,
        reason: hadCode ? "invalid_code" : "missing_code",
        connector_url: connector,
        how_to_connect: `${site}/connect`,
        ...(contact ? { contact } : {}),
      },
      message,
    },
    isError: true,
  };
}

export function createServer(siteUrl: string, opts: WhatIfServerOptions = {}): McpServer {
  const site = siteUrl.replace(/\/+$/, "");
  const contact = betaContact();
  const instructions = fillPlaceholders(SERVER_INSTRUCTIONS, site, contact) + (opts.locked ? `\n\n${betaInstructionsNote()}` : "");
  const server = new McpServer(
    { name: "what-if", title: "What-IF", version: VERSION, websiteUrl: site },
    { instructions, maxToolInputElements: MAX_INPUT_ELEMENTS },
  );

  // 1. whatif_start ---------------------------------------------------------
  server.registerTool(
    "whatif_start",
    {
      title: "Start a What-IF decision rehearsal",
      description:
        "Call this FIRST whenever the user asks a 'what if…' question about their business or a decision (e.g. 'what if I raise prices', 'what if I run a lunch deal', 'should I try a lunch special?', 'was wäre, wenn ich den Preis für Flat White erhöhe?'), or comes back with the results of a What-IF test. It returns `kind`, and what to do next depends on it: 'decision' = a template What-IF models (lunch_offer, also for a happy hour or breakfast deal; price_change, also for a discount), with the few numbers to ask the owner for (each with the question to ask and why it matters), demo values, a link to a visual demo report and the coaching steps; 'results' = the owner is back with test counts (go to whatif_log_result, the measured fields are listed); 'unsupported' = a decision What-IF cannot model yet (hiring, opening hours, moving, a new product): say so and use the by-hand method; 'not_a_decision' = something the owner does not choose (the weather, a competitor's move, the rent): answer briefly and offer a decision; 'unclear' = ask which decision they mean. Only 'decision' and 'results' carry a template. Pass the user's question in their own words and `lang` = the language they write in.",
      inputSchema: {
        question: questionArg,
        business: businessArg.optional(),
        template: templateArg.optional().describe("Optional: force a template instead of letting What-IF choose from the question."),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { question: string; business?: string; template?: TemplateId; lang?: string }) => {
      const lang = langOf(args.lang);
      const t = useLang(lang);
      const read: QuestionKind = args.template ? { kind: "decision", id: args.template, fit: "good" } : classifyQuestion(args.question);
      const events = berlinEvents(lang);
      const kieze = berlinKieze();
      const templateList = () =>
        Object.values(TEMPLATES).map((x) => {
          const tx = templateIn(x.id, lang);
          return { id: tx.id, title: tx.title, example_question: tx.exampleQuestion };
        });

      if (read.kind === "results") {
        const ids: TemplateId[] = read.id ? [read.id] : [...TEMPLATE_IDS];
        const observed = Object.fromEntries(
          ids.map((id) => [id, observedFieldsIn(id, lang).map((f) => ({ key: f.key, label: f.label, required: f.required }))]),
        );
        const lines = [t("res_head")];
        for (const id of ids) {
          const fields = observedFieldsIn(id, lang);
          lines.push(t("res_fields", { title: templateIn(id, lang).title, list: fields.map((f) => `${f.label} [${f.key}]${f.required ? "" : ` (${t("optional_word")})`}`).join("; ") }));
        }
        return textResult(
          t,
          lang,
          lines.join("\n"),
          { kind: "results", template: read.id, observed_fields: observed, tools_next: ["whatif_log_result"] },
          { url: null, hint: t("hint_results") },
        );
      }

      if (read.kind !== "decision") {
        const templates = templateList();
        const lines: string[] = [];
        let suggestions: string[] = [];
        let data: Record<string, unknown>;
        if (read.kind === "not_a_decision") {
          const what = t(`reason_${read.reason}` as McpKey);
          suggestions = read.reason === "absurd" ? templates.map((x) => x.example_question) : [t(`sug_${read.reason}_1` as McpKey), t(`sug_${read.reason}_2` as McpKey)];
          lines.push(t("nd_head", { what }), t("can_do"), t("nd_reframe"), bullets(suggestions, 3));
          if (read.reason !== "absurd") lines.push(t("nd_event"));
          data = { kind: "not_a_decision", template: null, reason: read.reason, explanation: t("nd_head", { what }) };
        } else if (read.kind === "unsupported") {
          const what = t(`topic_${read.topic}` as McpKey);
          lines.push(t("un_head", { what }), t("can_do"));
          if (read.nearest) {
            const near = templateIn(read.nearest, lang);
            lines.push(t(read.topic === "hiring" && read.nearest === "lunch_offer" ? "un_map_staff" : "un_map", { title: near.title, id: near.id }));
          }
          // "Otherwise…" only reads right after a line that offered the template.
          lines.push(t(read.nearest ? "un_by_hand" : "un_by_hand_only"));
          suggestions = templates.map((x) => x.example_question);
          data = { kind: "unsupported", template: null, topic: read.topic, nearest_template: read.nearest, explanation: t("un_head", { what }) };
        } else {
          suggestions = templates.map((x) => x.example_question);
          lines.push(t("uc_head"), t("can_do"), t("uc_ask"), bullets(suggestions, 3));
          data = { kind: "unclear", template: null, explanation: t("uc_head") };
        }
        return textResult(
          t,
          lang,
          lines.filter(Boolean).join("\n"),
          { ...data, suggestions, templates, berlin_events: events, tools_next: ["whatif_start"] },
          { url: null, hint: t(read.kind === "unsupported" ? "hint_unsupported" : "hint_not_decision") },
        );
      }

      const tpl = templateIn(read.id, lang);
      const required = tpl.fields.filter((f) => f.required);
      const optional = tpl.fields.filter((f) => !f.required);
      const demo = demoInputs(tpl.id, lang);
      const demoName = demoBusiness(lang);
      const demoShare: ShareState = {
        v: 1,
        template: tpl.id,
        inputs: demo,
        business: demoName,
        question: args.question.trim() || tpl.exampleQuestion,
        demo: true,
        lang,
      };
      const demoUrl = urlFor(site, demoShare);
      const others = Object.values(TEMPLATES)
        .filter((x) => x.id !== tpl.id)
        .map((x) => {
          const tx = templateIn(x.id, lang);
          return { id: tx.id, title: tx.title, example_question: tx.exampleQuestion };
        });
      setLang(lang);
      const first = required[0]!;
      const coaching = [t("coach_1"), t("coach_2"), t("coach_3"), t("coach_4"), t("coach_5")];
      const lines: string[] = [];
      lines.push(t("start_template", { title: tpl.title, id: tpl.id, summary: tpl.summary }));
      if (read.like) lines.push(t(`start_like_${read.like}` as McpKey));
      if (read.outside) lines.push(t("start_event_note", { what: t(`reason_${read.outside}` as McpKey) }));
      lines.push("");
      lines.push(t("start_numbers", { n: required.length }));
      required.forEach((f, i) => lines.push(`${i + 1}. ${f.ask} [${f.key}] (${t("why_word")}: ${f.why})`));
      if (optional.length) lines.push(t("start_optional", { list: optional.map((f) => `${f.label} [${f.key}]`).join("; ") }));
      if (kieze.length && tpl.fields.some((f) => f.key === "kiez")) lines.push(t("start_kiez", { list: kieze.join(", ") }));
      lines.push("");
      lines.push(t("start_first", { ask: first.ask }));
      lines.push(t("start_demo", { demo: demoName }));
      if (events.length) lines.push(t("start_events", { list: events.map((e) => e.text).join("; ") }));
      return textResult(
        t,
        lang,
        lines.join("\n"),
        {
          kind: "decision",
          template: tpl.id,
          title: tpl.title,
          summary: tpl.summary,
          fit: read.fit,
          ...(read.like ? { like: read.like, how_fields_are_used: t(`start_like_${read.like}` as McpKey) } : {}),
          example_question: tpl.exampleQuestion,
          ask_first: required.map(fieldView),
          optional_fields: optional.map(fieldView),
          next_question: { key: first.key, ask: first.ask, why: first.why },
          demo: { business: demoName, inputs: demo },
          other_templates: others,
          kieze,
          berlin_events: events,
          coaching,
          tools_next: ["whatif_check_inputs", "whatif_run_scenarios"],
        },
        { url: demoUrl, urlLabel: t("open_report_demo"), hint: t("hint_start") },
      );
    }),
  );

  // 2. whatif_check_inputs ---------------------------------------------------
  server.registerTool(
    "whatif_check_inputs",
    {
      title: "Check the owner's numbers and get the next question",
      description:
        "Checks the numbers gathered so far for a What-IF decision and returns the single most important missing item as `next_question` (with the exact question to ask and why it matters), any problems to fix, keys it ignored (with 'did you mean'), and which guesses What-IF would fill in. Call it after each answer the owner gives, until it says ready. Pass `template` + `inputs`, or the `state` from the last What-IF result plus only the new `inputs`. When ready it returns a `state`: pass that to whatif_run_scenarios.",
      inputSchema: {
        state: stateInsteadArg.optional(),
        template: templateArg.optional().describe("Which decision: 'lunch_offer' or 'price_change' (from whatif_start). Needed only without `state`."),
        inputs: inputsArg.optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: CtxArgs) => {
      const { ctx, prior, t } = resolveCtx(args, { allowState: true });
      const check = checkInputs(ctx.template, ctx.inputs, { demo: ctx.demo });
      const m = check.missing[0];
      const next = m
        ? { key: m.key, ask: m.ask, why: m.why, ...(m.fallback !== undefined ? { fallback: m.fallback } : {}) }
        : check.problems[0]
          ? { key: null, ask: t("ci_check_this", { problem: check.problems[0] }), why: t("ci_check_why") }
          : null;
      const guesses = check.resolved.filter((r) => r.source === "assumption" && r.note);
      const lines: string[] = [];
      if (check.ready) lines.push(t("ci_ready", { title: templateIn(ctx.template, ctx.lang).title, n: check.resolved.length }));
      else lines.push(t("ci_not_ready", { missing: check.missing.length, problems: check.problems.length }));
      if (next) lines.push(m ? t("ci_next_field", { ask: next.ask, key: m.key, why: m.why }) : t("ci_next", { ask: next.ask }));
      if (check.missing.length > 1) lines.push(t("ci_still", { list: check.missing.slice(1).map((x) => x.label).join("; ") }));
      if (check.problems.length) lines.push(`${t("ci_problems")}\n${bullets(check.problems, 6)}`);
      const ign = ignoredLine(t, ctx.ignored, ctx.template);
      if (ign) lines.push(ign);
      if (guesses.length && check.ready) lines.push(`${t("ci_guesses")}\n${bullets(guesses.map((g) => `${g.label}: ${g.note}`), 8)}`);
      else if (guesses.length) lines.push(t("ci_guesses_later", { n: guesses.length }));
      if (check.ready) lines.push(t("ci_run_next"));
      const share = check.ready ? shareOf(ctx, carried(prior, ctx)) : null;
      return textResult(
        t,
        ctx.lang,
        lines.join("\n"),
        { ...check, next_question: next, ...ignoredView(ctx.ignored), ...(share ? { state: encodeState(share) } : {}) },
        { url: share ? urlFor(site, share) : null, hint: t(check.ready ? "hint_check_ready" : "hint_check_more") },
      );
    }),
  );

  // 3. whatif_run_scenarios --------------------------------------------------
  server.registerTool(
    "whatif_run_scenarios",
    {
      title: "Run the What-IF scenarios",
      description:
        "Computes the decision's scenarios with deterministic maths (cautious, expected, optimistic), the break-even point, the worst case, the biggest uncertainty and lessons, and returns a visual report link and a `state` token. Pass `template` + `inputs`, or the `state` from whatif_check_inputs (or any later result). Pass the returned `state` (or the report link) to whatif_what_changed, whatif_rehearsal_start, whatif_plan_test and whatif_log_result instead of re-sending template and inputs. Use demo: true (inputs may be empty) to show the made-up demo café. Never compute these numbers yourself; relay these.",
      inputSchema: {
        state: stateInsteadArg.optional(),
        template: templateArg.optional().describe("Which decision: 'lunch_offer' or 'price_change' (from whatif_start). Needed only without `state`."),
        inputs: inputsArg.optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: CtxArgs) => {
      const { ctx, prior, t } = resolveCtx(args, { allowState: true });
      const a = analyzeCtx(ctx);
      const share = shareOf(ctx, carried(prior, ctx));
      const ign = ignoredLine(t, ctx.ignored, ctx.template);
      return textResult(
        t,
        ctx.lang,
        [analysisText(a, ctx.lang), ign, t("state_next")].filter(Boolean).join("\n"),
        { analysis: a, ...ignoredView(ctx.ignored), state: encodeState(share) },
        { url: urlFor(site, share), hint: t("hint_run") },
      );
    }),
  );

  // 4. whatif_what_changed ---------------------------------------------------
  server.registerTool(
    "whatif_what_changed",
    {
      title: "Explain what changed",
      description:
        "Re-runs the scenarios after the owner changes one or two numbers and explains, in plain words, why the result moved ('why this changed'). Pass `state` from the last result (or the inputs before the change as `before`) and `after` = only the fields that changed. Returns the new `state`.",
      inputSchema: {
        state: stateInsteadArg.optional(),
        template: templateArg.optional().describe("Needed only without `state`."),
        before: inputsArg.optional().describe("The inputs before the change (as passed to whatif_run_scenarios). Leave out when you pass `state`."),
        after: inputsArg.describe("The inputs after the change. Fields left out keep their earlier value."),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: CtxArgs & { before?: RawInputs; after: RawInputs }) => {
      const { ctx: beforeCtx, t } = resolveCtx({ ...args, inputs: args.before }, { allowState: true });
      const afterSplit = splitInputs(beforeCtx.template, args.after, Object.keys(beforeCtx.inputs));
      const afterCtx: Ctx = { ...beforeCtx, inputs: { ...beforeCtx.inputs, ...afterSplit.inputs }, ignored: [...beforeCtx.ignored, ...afterSplit.ignored] };
      const before = analyzeCtx(beforeCtx);
      const after = analyzeCtx(afterCtx);
      const change = whatChanged(before, after);
      setCurrency(after.currency);
      const exp = after.scenarios.find((s) => s.id === "expected");
      const lines: string[] = [];
      if (!change.changes.length) lines.push(t("wc_nothing"));
      else lines.push(t("wc_changed", { list: change.changes.map((c) => `${c.label} ${c.fromText} → ${c.toText}`).join("; ") }));
      if (change.plain.length) lines.push(`${t("wc_why")}\n${bullets(change.plain, 5)}`);
      if (exp) lines.push(t("wc_expected", { test: signed(exp.netTest), month: signed(exp.netMonth) }));
      lines.push(t("wc_break_even", { plain: after.breakEven.plain }));
      const ign = ignoredLine(t, afterCtx.ignored, afterCtx.template);
      if (ign) lines.push(ign);
      const share = shareOf(afterCtx);
      return textResult(
        t,
        afterCtx.lang,
        lines.join("\n"),
        { change, analysis: after, ...ignoredView(afterCtx.ignored), state: encodeState(share) },
        { url: urlFor(site, share), hint: t("hint_changed") },
      );
    }),
  );

  // 5. whatif_rehearsal_start ------------------------------------------------
  server.registerTool(
    "whatif_rehearsal_start",
    {
      title: "Start the imagined-customer rehearsal",
      description:
        "Starts a customer rehearsal: a handful of imagined customers (personas) react round by round to the owner's change. Pass `state` from whatif_run_scenarios (or template + inputs). Returns the personas, one ready-to-send brief per persona for round 1, and a `state` token. " +
        HOST_RUN_INSTRUCTIONS +
        " The rehearsal is imagined, not evidence: it produces questions to check with real customers, never forecasts.",
      inputSchema: {
        state: stateInsteadArg.optional(),
        template: templateArg.optional().describe("Needed only without `state`."),
        inputs: inputsArg.optional(),
        personas: z.number().describe("How many imagined customers, 4–12 (default 6).").optional(),
        rounds: z.number().describe("How many rounds, 3–5 (default 4).").optional(),
        seed: z.number().describe("Seed for repeatable personas (optional).").optional(),
        event: z
          .string()
          .max(300)
          .describe("Optional local event that applies from round 1, e.g. 'a new bakery opens next door' (or a Berlin event id from whatif_start).")
          .optional(),
        customer_mix: record(z.number(), 30, "use a segment id such as office_worker")
          .describe("Optional weights per customer segment: office_worker, freelancer, student, parent, regular, tourist, retiree, trades.")
          .optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: CtxArgs & { personas?: number; rounds?: number; seed?: number; event?: string; customer_mix?: Record<string, number> }) => {
      const { ctx, t } = resolveCtx(args, { allowState: true });
      const a = analyzeCtx(ctx);
      const personas = clamp(args.personas, 4, 12);
      const rounds = clamp(args.rounds, 3, 5);
      const event = eventText(args.event, ctx.lang);
      const r = startRehearsal(a, {
        ...(personas !== undefined ? { personas } : {}),
        ...(rounds !== undefined ? { rounds } : {}),
        ...(args.seed !== undefined && Number.isFinite(args.seed) ? { seed: Math.round(args.seed) } : {}),
        ...(event ? { event } : {}),
        ...(args.customer_mix ? { customerMix: args.customer_mix as Partial<Record<SegmentId, number>> } : {}),
      });
      setLang(ctx.lang);
      const briefs = roundBriefs(r);
      const { state, share } = stateFor(ctx, r);
      const away = r.personas.length - briefs.length;
      const lines = [
        t("rs_ready", { people: r.personas.length, rounds: r.rounds.length, change: r.change }),
        t("rs_who", { list: r.personas.map((p) => `${p.name} (${p.segmentLabel}, ${t(`att_${p.attitude}` as McpKey)})`).join("; ") }),
        t("rs_round1", { rounds: r.rounds.length, title: r.rounds[0]?.title ?? "", n: briefs.length }) + (away > 0 ? t("rs_away", { n: away }) : "") + ".",
        t("rs_imagined"),
      ];
      return textResult(
        t,
        ctx.lang,
        lines.join("\n"),
        {
          rehearsal_id: r.id,
          change: r.change,
          personas: personaList(r, t),
          round: r.currentRound,
          rounds: r.rounds.length,
          briefs: briefs.map(briefView),
          how_to_run: HOST_RUN_INSTRUCTIONS,
          state,
        },
        {
          url: urlFor(site, share),
          hint: t("hint_rehearsal_start"),
          extra: briefsBlock(
            briefs,
            state,
            `HOW TO RUN ROUND ${r.currentRound} OF ${r.rounds.length} (${briefs.length} imagined customers):`,
            HOST_RUN_INSTRUCTIONS,
            "whatif_rehearsal_submit",
            "Then call whatif_rehearsal_submit with `state` and `reactions` = every persona's JSON reply (objects or the raw reply text). Use method 'subagent' if subagents played them. No model available? Call whatif_rehearsal_autoplay instead.",
          ),
        },
      );
    }),
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
          .max(40)
          .describe("Every persona's reply for this round: the JSON object each brief asks for (it includes the persona id), or the raw reply text."),
        method: methodArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; reactions: unknown[]; method?: ReactionMethod; lang?: string }) => {
      const { ctx, rehearsal, t } = loadRehearsal(args.state, args.lang);
      if (rehearsal.status === "done") throw new UserError(t("err_rehearsal_done"));
      const replies = parseReplies(args.reactions);
      if (!replies.length) throw new UserError(t("err_no_reactions"));
      const outcome = submitRound(rehearsal, replies, args.method);
      setLang(ctx.lang);
      const r = outcome.rehearsal;
      const { state, share } = stateFor(ctx, r);
      const url = urlFor(site, share);
      const errorText = outcome.errors.map((e) => `- ${e.personaId}: ${e.error}`).join("\n");

      if (outcome.accepted === 0 && outcome.errors.length) {
        const retry = roundBriefs(r).filter((b) => outcome.errors.some((e) => e.personaId === b.personaId));
        return textResult(
          t,
          ctx.lang,
          t("sub_none", { round: r.currentRound, errors: errorText }),
          { accepted: 0, errors: outcome.errors, done: false, round: r.currentRound, next: [], retry_briefs: retry.map(briefView), state },
          {
            url,
            hint: t("hint_sub_none"),
            isError: true,
            ...(retry.length
              ? { extra: briefsBlock(retry, state, `RE-RUN THESE ${retry.length} BRIEF(S) FOR ROUND ${r.currentRound}:`, HOST_RUN_INSTRUCTIONS, "whatif_rehearsal_submit", "Submit only these personas' replies.") }
              : {}),
          },
        );
      }

      if (outcome.done) {
        const summary = summarize(r);
        setLang(ctx.lang);
        return textResult(
          t,
          ctx.lang,
          `${t("sub_done", { n: outcome.accepted })}\n${summaryText(t, summary)}`,
          { accepted: outcome.accepted, errors: outcome.errors, done: true, next: [], summary: compactSummary(summary), state },
          { url, hint: t("hint_sub_done"), extra: `state (for whatif_rehearsal_interview): ${state}` },
        );
      }

      if (outcome.errors.length) {
        const retry = roundBriefs(r).filter((b) => outcome.errors.some((e) => e.personaId === b.personaId));
        return textResult(
          t,
          ctx.lang,
          t("sub_partial", { n: outcome.accepted, k: outcome.errors.length, round: r.currentRound, errors: errorText }),
          { accepted: outcome.accepted, errors: outcome.errors, done: false, round: r.currentRound, next: [], retry_briefs: retry.map(briefView), state },
          {
            url,
            hint: t("hint_sub_partial"),
            extra: briefsBlock(retry, state, `RE-RUN THESE ${retry.length} BRIEF(S) FOR ROUND ${r.currentRound}:`, HOST_RUN_INSTRUCTIONS, "whatif_rehearsal_submit", "Submit only these personas' replies, with the new state."),
          },
        );
      }

      const next = outcome.next.length ? outcome.next : roundBriefs(r);
      const spec = r.rounds[r.currentRound - 1];
      return textResult(
        t,
        ctx.lang,
        t("sub_next", { n: outcome.accepted, round: r.currentRound, rounds: r.rounds.length, title: spec?.title ?? "", k: next.length }),
        { accepted: outcome.accepted, errors: [], done: false, round: r.currentRound, rounds: r.rounds.length, next: next.map(briefView), how_to_run: HOST_RUN_INSTRUCTIONS, state },
        {
          url,
          hint: t("hint_sub_next"),
          extra: briefsBlock(
            next,
            state,
            `HOW TO RUN ROUND ${r.currentRound} OF ${r.rounds.length} (${next.length} imagined customers):`,
            HOST_RUN_INSTRUCTIONS,
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
        "Adds something the owner wants to rehearse, e.g. 'it rains all week', 'a BVG strike day' or 'a competitor opens nearby' (or a Berlin event id from whatif_start); it applies before the next round. Imagined, never presented as a fact. Returns the new `state` and the updated briefs for that round.",
      inputSchema: { state: stateArg, event: z.string().min(3).max(300).describe("What happens, in one sentence, or a Berlin event id."), lang: langArg.optional() },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; event: string; lang?: string }) => {
      const { ctx, rehearsal, t } = loadRehearsal(args.state, args.lang);
      if (rehearsal.status === "done") throw new UserError(t("err_event_done"));
      const event = eventText(args.event, ctx.lang) ?? args.event.trim();
      const r = injectEvent(rehearsal, event);
      setLang(ctx.lang);
      const briefs = roundBriefs(r);
      const { state, share } = stateFor(ctx, r);
      return textResult(
        t,
        ctx.lang,
        t("ev_added", { round: r.currentRound, event, n: briefs.length }),
        { round: r.currentRound, events: r.events, briefs: briefs.map(briefView), how_to_run: HOST_RUN_INSTRUCTIONS, state },
        {
          url: urlFor(site, share),
          hint: t("hint_event"),
          extra: briefsBlock(
            briefs,
            state,
            `HOW TO RUN ROUND ${r.currentRound} OF ${r.rounds.length} (with the event):`,
            HOST_RUN_INSTRUCTIONS,
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
      inputSchema: { state: stateArg, lang: langArg.optional() },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; lang?: string }) => {
      const { ctx, rehearsal, t } = loadRehearsal(args.state, args.lang);
      const r = autoplayRehearsal(rehearsal);
      const summary = summarize(r);
      setLang(ctx.lang);
      const { state, share } = stateFor(ctx, r);
      return textResult(
        t,
        ctx.lang,
        `${t("ap_played")}\n${summaryText(t, summary)}`,
        { done: r.status === "done", summary: compactSummary(summary), state },
        { url: urlFor(site, share), hint: t("hint_autoplay"), extra: `state (for whatif_rehearsal_interview): ${state}` },
      );
    }),
  );

  // 9. whatif_rehearsal_interview --------------------------------------------
  server.registerTool(
    "whatif_rehearsal_interview",
    {
      title: "Interview the imagined customers",
      description:
        "Asks the imagined customers a follow-up question after (or during) the rehearsal. Without `answers` it returns one brief per persona; run them, then call this tool again with the same `state` and `question` and the JSON `answers` to record them in the report. " +
        INTERVIEW_RUN_INSTRUCTIONS,
      inputSchema: {
        state: stateArg,
        question: z.string().min(3).max(300).describe("The owner's question, e.g. 'What would make you come back next week?'"),
        persona_ids: z.array(z.string().max(8)).max(12).describe("Only ask these personas (ids from the persona list); default all.").optional(),
        answers: z.array(replyArg).max(24).describe("The personas' JSON replies to the interview briefs (second call only).").optional(),
        method: methodArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: { state: string; question: string; persona_ids?: string[]; answers?: unknown[]; method?: ReactionMethod; lang?: string }) => {
      const { ctx, rehearsal, t } = loadRehearsal(args.state, args.lang);
      const question = args.question.trim();
      if (!args.answers || args.answers.length === 0) {
        const briefs = interviewBriefs(rehearsal, question, args.persona_ids?.length ? args.persona_ids : undefined);
        setLang(ctx.lang);
        const { state, share } = stateFor(ctx, rehearsal);
        return textResult(
          t,
          ctx.lang,
          t("iv_briefs", { question, n: briefs.length }),
          { question, briefs: briefs.map(briefView), how_to_run: INTERVIEW_RUN_INSTRUCTIONS, state },
          {
            url: urlFor(site, share),
            hint: t("hint_iv_briefs"),
            extra: briefsBlock(
              briefs,
              state,
              `HOW TO RUN THE INTERVIEW (${briefs.length} imagined customers):`,
              INTERVIEW_RUN_INSTRUCTIONS,
              "whatif_rehearsal_interview",
              "Then call whatif_rehearsal_interview again with the same `state` and `question`, and `answers` = every persona's JSON reply.",
            ),
          },
        );
      }
      const replies = parseReplies(args.answers);
      const out = recordInterview(rehearsal, question, replies, args.method);
      setLang(ctx.lang);
      const { state, share } = stateFor(ctx, out.rehearsal);
      const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
      const iv = out.rehearsal.interviews.find((x) => squash(question).startsWith(squash(x.question)));
      const recorded = iv?.answers ?? [];
      const errs = out.errors.map((e) => `- ${e.personaId}: ${e.error}`).join("\n");
      if (!recorded.length && out.errors.length)
        return textResult(
          t,
          ctx.lang,
          t("iv_none", { errors: errs }),
          { question, recorded: [], errors: out.errors, state },
          { url: urlFor(site, share), hint: t("hint_iv_none"), isError: true },
        );
      const lines = [t("iv_recorded", { n: recorded.length, question })];
      lines.push(bullets(recorded.map((x) => `${x.name}: ${t("quoted", { text: x.answer })}`), 8));
      if (out.errors.length) lines.push(`${t("iv_could_not")}\n${errs}`);
      return textResult(
        t,
        ctx.lang,
        lines.join("\n"),
        { question, recorded, errors: out.errors, state },
        { url: urlFor(site, share), hint: t("hint_iv_recorded"), extra: `state: ${state}` },
      );
    }),
  );

  // 10. whatif_plan_test -----------------------------------------------------
  server.registerTool(
    "whatif_plan_test",
    {
      title: "Plan a small, low-risk test",
      description:
        "Turns the analysis into a small, reversible real-world test: how many days, what to prepare, what to measure and how, check-in days, a keep / tweak / stop rule, and a cost cap. Pass `state` from the latest result (it keeps any rehearsal in the report), or template + inputs.",
      inputSchema: {
        state: stateInsteadArg.optional(),
        template: templateArg.optional().describe("Needed only without `state`."),
        inputs: inputsArg.optional(),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: CtxArgs) => {
      const { ctx, prior, t } = resolveCtx(args, { allowState: true });
      const a = analyzeCtx(ctx);
      const plan = planTest(a);
      setLang(ctx.lang);
      const share = shareOf(ctx, prior?.rehearsal ? { rehearsal: prior.rehearsal } : {});
      const lines = [
        t("pt_title", { title: plan.title, days: plan.days }),
        plan.plain,
        plan.before.length ? `${t("pt_before")}\n${bullets(plan.before, 5)}` : "",
        plan.measure.length ? `${t("pt_measure")}\n${bullets(plan.measure.map((m) => `${m.what}: ${m.how}`), 5)}` : "",
        plan.checkIns.length ? `${t("pt_checkins")}\n${bullets(plan.checkIns.map((c) => t("pt_day", { day: c.day, look: c.look })), 5)}` : "",
        `${t("pt_rule")}\n- ${t("pt_keep")}: ${plan.decisionRule.keep}\n- ${t("pt_tweak")}: ${plan.decisionRule.tweak}\n- ${t("pt_stop")}: ${plan.decisionRule.stop}`,
        t("pt_cap", { cap: plan.costCap }),
        ignoredLine(t, ctx.ignored, ctx.template),
        t("pt_after"),
      ].filter(Boolean);
      return textResult(t, ctx.lang, lines.join("\n"), { plan, analysis_id: a.id, state: encodeState(share) }, { url: urlFor(site, share), hint: t("hint_plan") });
    }),
  );

  // 11. whatif_log_result ----------------------------------------------------
  server.registerTool(
    "whatif_log_result",
    {
      title: "Compare a real test result with the scenarios",
      description:
        "After the owner has run the test, compares what really happened with the cautious, expected and optimistic scenarios, gives a keep / tweak / stop verdict and what was learned. Pass `state` from the latest result (or template + inputs) and `observed`. Observed keys for lunch_offer: baseline_lunch_customers, test_lunch_customers, redemptions_per_day (optional days_run, actual_setup_cost); for price_change: units_before_per_week, units_after_per_week (optional days_run).",
      inputSchema: {
        state: stateInsteadArg.optional(),
        template: templateArg.optional().describe("Needed only without `state`."),
        inputs: inputsArg.optional(),
        observed: record(z.union([z.number(), z.string().max(40, { error: "A measured value has at most 40 characters: send the count, e.g. 47." })]), MAX_KEY_CHARS, "use the measured keys whatif_log_result lists").describe(
          "What the test measured, e.g. {\"baseline_lunch_customers\": 38, \"test_lunch_customers\": 47, \"redemptions_per_day\": 15}.",
        ),
        business: businessArg.optional(),
        question: questionArg.optional(),
        demo: demoArg.optional(),
        currency: currencyArg.optional(),
        lang: langArg.optional(),
      },
      annotations: ANNOTATIONS,
    },
    safe((args: CtxArgs & { observed: Record<string, number | string> }) => {
      const { ctx, prior, t } = resolveCtx(args, { allowState: true });
      const fields = observedFieldsIn(ctx.template, ctx.lang);
      const known = fields.map((f) => f.key);
      const observed: Record<string, number> = {};
      const bad: string[] = [];
      const ignored: IgnoredKey[] = [];
      for (const [rawKey, v] of Object.entries(args.observed ?? {})) {
        const k = rawKey.trim();
        if (!known.includes(k)) {
          ignored.push(ignoredKey(k, ignored.length, known, known));
          continue;
        }
        const n = typeof v === "number" ? v : parseOwnerNumber(String(v), ctx.lang).value;
        if (!Number.isFinite(n)) bad.push(t("lr_bad", { key: k, value: String(v).slice(0, 40) }));
        else observed[k] = n;
      }
      const missing = fields.filter((f) => f.required && observed[f.key] === undefined);
      const ign = ignoredLine(t, ignored, t("measured_values"));
      if (missing.length || bad.length)
        throw new UserError(
          [
            missing.length ? t("lr_need", { list: missing.map((f) => `${f.label} [${f.key}]`).join("; ") }) : "",
            bad.length ? `${t("please_fix")}\n${bullets(bad)}` : "",
            ign,
            t("lr_understands", { list: fields.map((f) => `${f.key}${f.required ? "" : ` (${t("optional_word")})`}`).join(", ") }),
          ]
            .filter(Boolean)
            .join("\n"),
        );
      const a = analyzeCtx(ctx);
      const result = compareResult(a, observed);
      setLang(ctx.lang);
      setCurrency(a.currency);
      const share = shareOf(ctx, { observed, ...(prior?.rehearsal ? { rehearsal: prior.rehearsal } : {}) });
      const closest =
        result.closestScenario === "below_cautious"
          ? t("lr_below")
          : result.closestScenario === "above_optimistic"
            ? t("lr_above")
            : t("lr_closest", { name: a.scenarios.find((s) => s.id === result.closestScenario)?.label ?? result.closestScenario });
      const lines = [
        result.plain,
        t("lr_line", { label: result.actualLabel, actual: result.actual, closest, net: signed(result.netTest) }),
        t("lr_verdict", { verdict: t(`verdict_${result.verdict}` as McpKey) }),
        result.learned.length ? `${t("lr_teaches")}\n${bullets(result.learned, 5)}` : "",
        ign,
      ].filter(Boolean);
      return textResult(
        t,
        ctx.lang,
        lines.join("\n"),
        { result, analysis_id: a.id, ignored_observed: ignored.slice(0, MAX_IGNORED_SHOWN), ignored_count: ignored.length, state: encodeState(share) },
        { url: urlFor(site, share), hint: t("hint_log") },
      );
    }),
  );

  // Prompt -------------------------------------------------------------------
  server.registerPrompt(
    "what-if",
    {
      title: "What if…?",
      description: "Rehearse a business decision with What-IF: scenarios, an imagined-customer rehearsal and a small test plan.",
      argsSchema: {
        question: z.string().max(500).describe("Your 'what if…' question, e.g. 'What if I run a weekday lunch offer?'").optional(),
        lang: z.string().max(24).describe("Your language: de (default), en, es or pl.").optional(),
      },
    },
    (args: { question?: string; lang?: string }): GetPromptResult => {
      const q = args.question?.trim();
      let text = fillPlaceholders(WHAT_IF_PROMPT, site, contact);
      const slot = /\{\{?\s*question\s*\}\}?/i;
      if (slot.test(text))
        text = q
          ? text.replace(new RegExp(slot.source, "gi"), () => q.replace(/"/g, "'"))
          : text.replace(new RegExp(`"?${slot.source}"?`, "gi"), "(not given yet: ask me what I am thinking of trying)");
      else if (q) text = `${text.trim()}\n\nMy question: ${q}`;
      if (args.lang?.trim()) {
        const lang = langOf(args.lang);
        text = `${text.trim()}\n\n${tr(lang)("prompt_lang", { name: LANG_NAMES[lang], code: lang })}`;
      }
      return {
        description: "What-IF decision coach",
        messages: [{ role: "user", content: { type: "text", text } }],
      };
    },
  );

  // Closed beta without a valid code: every tool call answers with the beta message, whatever
  // its arguments (this replaces the SDK's tools/call handler; listing stays as it is).
  if (opts.locked) {
    const hadCode = opts.locked.hadCode;
    server.server.setRequestHandler(CallToolRequestSchema, async () => betaToolResult(site, hadCode, contact));
  }

  return server;
}

/** A Berlin event (its id, or its text in any language) becomes its text in the owner's language; free text stays as typed. */
function eventText(raw: string | undefined, lang: Lang): string | undefined {
  const e = raw?.trim();
  if (!e) return undefined;
  const hit = findBerlinEvent(e);
  return hit ? (hit.text[lang] ?? hit.text.en) : e;
}

// ---------------------------------------------------------------------------
// Plain-language summary of an analysis
// ---------------------------------------------------------------------------

export function analysisText(a: Analysis, lang: Lang = a.lang && isLang(a.lang) ? a.lang : "en"): string {
  const t = useLang(lang);
  setCurrency(a.currency);
  const lines: string[] = [];
  lines.push(`${a.business}: ${a.question}`);
  if (a.demo) lines.push(t("at_demo"));
  lines.push(t("at_break_even", { plain: a.breakEven.plain }));
  lines.push(t("at_three"));
  for (const s of a.scenarios) lines.push(`- ${s.label}: ${s.plain || t("at_scenario", { test: signed(s.netTest), month: signed(s.netMonth) })}`);
  lines.push(t("at_worst", { plain: a.worstCase.plain }));
  lines.push(t("at_uncertainty", { plain: a.biggestUncertainty.plain }));
  if (a.warnings.length) lines.push(`${t("at_watch")}\n${bullets(a.warnings, 3)}`);
  const facts = a.facts ?? [];
  if (facts.length) lines.push(t("at_facts", { list: facts.slice(0, 4).map((f) => `${f.label} ${f.value} (${f.source}, ${f.asOf})`).join("; ") }));
  lines.push(t("at_next"));
  return lines.join("\n");
}
