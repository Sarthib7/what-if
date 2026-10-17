/**
 * The customer rehearsal state machine.
 *
 *   startRehearsal → (roundBriefs → model or ruleBasedReactions → submitRound)× rounds → summarize
 *                  ↘ injectEvent before any round        ↘ interviewBriefs / recordInterview after the run
 *
 * Everything is deterministic for (analysis, options, submitted reactions), so the
 * stateless MCP server and the website rebuild the same rehearsal from a share
 * token with rebuildRehearsal(). Nothing here touches the money maths.
 *
 * Language: every generated word follows the analysis language (Analysis.lang). Briefs
 * keep their instructions in English but tell the imagined customer to answer in the
 * owner's language, and show the situation and the feed in that language.
 */
import type { Analysis, TemplateId } from "../engine/types.ts";
import type { Lang } from "../i18n/index.ts";
import type { ShareState } from "../state.ts";
import type {
  ActionKind,
  FeedItem,
  Persona,
  PersonaBrief,
  Reaction,
  ReactionMethod,
  Rehearsal,
  RehearsalScene,
  RehearsalSummary,
  RoundAction,
  RoundSpec,
  SegmentId,
  SubmitOutcome,
} from "./types.ts";
import { type Rng, hashString, normaliseSeed, pick, rngFor, weightedPick } from "./prng.ts";
import { WORD_OF_MOUTH_CHANNELS, channelPhrase, cleanMix, generatePersonas, placeIdFor } from "./personas.ts";
import { EVENT_EFFECTS, berlinEventText, findBerlinEvent, normaliseKiez, type BerlinEventId } from "./berlin.ts";
import {
  ACTION_TEXT,
  AWAY,
  BEATS,
  BRIEF_LANGUAGE,
  CAVEATS,
  CHANGE_TEXT,
  CHECKS,
  CHEAPER,
  FALLBACK_THOUGHT,
  FRIEND,
  FUNNEL,
  MIX_NOTE,
  PLACES,
  QUESTIONS,
  SEGMENT_TAILS,
  UPTAKE_LABEL,
  VERDICTS,
  type Cond,
  type Line,
  type Tx,
  fillText,
  quote,
} from "./messages.ts";
import { ACTIONS, FEED_KIND, GROUPS, OWNER_TEXT_CAPS, actionKind, actionLabel, buildRounds, changeContext, difference, itemVars, money, tr } from "./rounds.ts";

// ---------------------------------------------------------------- constants

/** Character limits for model-written text. Up to 1.5× the limit is trimmed at a word; beyond that it is rejected. */
export const LIMITS = { thought: 240, saysPublicly: 160, questionForOwner: 160, diary: 140, answer: 300, event: 280, question: 300 } as const;
const SLACK = 1.5;
/** Raw text longer than this is cut before any processing (keeps every step linear and cheap). */
const RAW_CAP = 4000;

/** The caveat for an AI-played rehearsal, in English. Use caveatFor() for the one that matches a run. */
export const CAVEAT = CAVEATS.ai.en;

const METHODS: ReactionMethod[] = ["subagent", "in-context", "rule-based"];

export interface StartOptions {
  /** 4–12, default 6. */
  personas?: number;
  /** 3–5, default 4. */
  rounds?: number;
  seed?: number;
  /** An event that applies before round 1: free text ("It rains all week") or a Berlin event id ("rain_week"). */
  event?: string;
  customerMix?: Partial<Record<SegmentId, number>>;
}

/** The rehearsal part of a ShareState, plus the optional customer mix needed to rebuild the same personas. */
export type ShareRehearsal = NonNullable<ShareState["rehearsal"]> & { customerMix?: Partial<Record<SegmentId, number>> };

/** The caveat that matches who played the customers, plus the note that the mix is a rough guess. */
export function caveatFor(method: RehearsalSummary["method"], lang: Lang = "en", mixNote?: string): string {
  const base = tr(method === "rule-based" ? CAVEATS["rule-based"] : method === "mixed" ? CAVEATS.mixed : CAVEATS.ai, lang);
  return mixNote ? `${base} ${mixNote}` : base;
}

// ---------------------------------------------------------------- small helpers

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.min(max, Math.max(min, n));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function clone<T>(x: T): T {
  return structuredClone(x);
}

function norm(s: string): string {
  return s.slice(0, RAW_CAP).replace(/\s+/g, " ").trim();
}

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cuts text to `limit` characters at a word boundary, ending with "…". */
function cut(s: string, limit: number): string {
  if (s.length <= limit) return s;
  let out = s.slice(0, limit - 1);
  const sp = out.lastIndexOf(" ");
  if (sp > limit * 0.6) out = out.slice(0, sp);
  return `${out.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** Validates one optional text field: trims whitespace, trims slight overruns, rejects big ones. */
function fitText(v: unknown, field: string, limit: number, problems: string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    problems.push(`"${field}" must be a string.`);
    return undefined;
  }
  if (v.length > RAW_CAP) {
    problems.push(`"${field}" is ${v.length} characters; keep it to ${limit} or fewer.`);
    return undefined;
  }
  const s = norm(v);
  if (!s) return undefined;
  if (s.length <= limit) return s;
  if (s.length <= Math.floor(limit * SLACK)) return cut(s, limit);
  problems.push(`"${field}" is ${s.length} characters; keep it to ${limit} or fewer.`);
  return undefined;
}

function langOfR(r: Rehearsal): Lang {
  return r.lang ?? "en";
}

function personaById(r: Rehearsal, id: string): Persona | undefined {
  return r.personas.find((p) => p.id === id);
}

function specOf(r: Rehearsal, round: number): RoundSpec | undefined {
  return r.rounds.find((s) => s.n === round);
}

function actionOf(r: Rehearsal, round: number, id: string): RoundAction | undefined {
  return specOf(r, round)?.actions.find((a) => a.id === id) ?? ACTIONS[id];
}

function labelOf(r: Rehearsal, round: number, id: string): string {
  return specOf(r, round)?.actions.find((a) => a.id === id)?.label ?? actionLabel(id, langOfR(r));
}

function isActive(r: Rehearsal, personaId: string, round: number): boolean {
  return (r.active[round] ?? []).includes(personaId);
}

function reactionFor(r: Rehearsal, personaId: string, round: number): Reaction | undefined {
  return r.reactions.find((x) => x.personaId === personaId && x.round === round);
}

/** Active personas still without a reaction in the current round. */
function pending(r: Rehearsal): Persona[] {
  if (r.status === "done") return [];
  return r.personas.filter((p) => isActive(r, p.id, r.currentRound) && !reactionFor(r, p.id, r.currentRound));
}

function sceneOf(r: Rehearsal): RehearsalScene {
  if (r.scene) return r.scene;
  // Older rehearsals without a scene: a neutral fallback built from what the rehearsal knows.
  return { cafe: r.business || "the café", currency: "EUR", board: r.change, price: 0, oldPrice: 0, contents: r.change, item: "coffee", promoted: false, testLength: "two-week" };
}

/** Round from which a feed item is visible: customers' own posts from the next round, café posts and events at once. */
function visibleFrom(f: FeedItem): number {
  return f.personaId ? f.round + 1 : f.round;
}

/** Canonical feed order, so a rebuilt rehearsal has exactly the same feed. */
function sortFeed(r: Rehearsal): void {
  r.feed = r.feed
    .map((f, i) => ({ f, i }))
    .sort((a, b) => visibleFrom(a.f) - visibleFrom(b.f) || (a.f.personaId ? 1 : 0) - (b.f.personaId ? 1 : 0) || a.i - b.i)
    .map((x) => x.f);
}

function visibleFeed(r: Rehearsal, round: number): FeedItem[] {
  return r.feed.filter((f) => visibleFrom(f) <= round);
}

function parseItem(item: unknown): unknown {
  if (typeof item !== "string") return item;
  if (item.length > RAW_CAP * 4) return item;
  const s = item.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return item;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return item;
  }
}

function toList(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (x === undefined || x === null) return [];
  if (typeof x === "string") {
    const t = x.trim();
    if (t.startsWith("[")) {
      try {
        const v = JSON.parse(t);
        if (Array.isArray(v)) return v;
      } catch {
        /* fall through */
      }
    }
    return [x];
  }
  if (typeof x === "object" && Array.isArray((x as { reactions?: unknown }).reactions)) return (x as { reactions: unknown[] }).reactions;
  if (typeof x === "object" && Array.isArray((x as { answers?: unknown }).answers)) return (x as { answers: unknown[] }).answers;
  return [x];
}

function findPersona(r: Rehearsal, raw: unknown): Persona | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).slice(0, 80).trim().toLowerCase();
  if (!s) return undefined;
  return (
    r.personas.find((p) => p.id.toLowerCase() === s) ??
    r.personas.find((p) => p.name.toLowerCase() === s) ??
    (/^\d+$/.test(s) ? r.personas.find((p) => p.id === `p${s}`) : undefined)
  );
}

function personaList(r: Rehearsal): string {
  return r.personas.map((p) => `${p.id} (${p.name})`).join(", ");
}

function normAction(s: string): string {
  return s.slice(0, 120).trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z_]/g, "");
}

const LETTER = /\p{L}/u;

/** Whether `text` names `name` as a word (case-sensitive; non-letters on both sides). */
function mentions(text: string, name: string): boolean {
  if (!name) return false;
  for (let i = text.indexOf(name); i >= 0; i = text.indexOf(name, i + 1)) {
    const before = i > 0 ? text[i - 1]! : " ";
    const after = text[i + name.length] ?? " ";
    if (!LETTER.test(before) && !LETTER.test(after)) return true;
  }
  return false;
}

/** "pos" for actions that take up the change (not just noticing), "neg" for turning away, else null. */
function polarityOf(id: string): "pos" | "neg" | null {
  const a = ACTIONS[id];
  if (!a) return null;
  if (a.positive && !GROUPS.noticeOnly.has(id)) return "pos";
  if (GROUPS.negative.has(id)) return "neg";
  return null;
}

interface Speaker {
  id: string;
  name: string;
  text: string;
  round: number;
}

/** Other customers' public words this persona can see in round k, oldest first. */
function speakersFor(r: Rehearsal, viewerId: string, k: number): (Speaker & { pol: "pos" | "neg" | null })[] {
  return visibleFeed(r, k).flatMap((f) => {
    if (!f.personaId || f.personaId === viewerId || (f.kind !== "word_of_mouth" && f.kind !== "review")) return [];
    const src = reactionFor(r, f.personaId, f.round);
    const p = personaById(r, f.personaId);
    if (!src || !p) return [];
    return [{ id: p.id, name: p.name, text: f.text, round: f.round, pol: polarityOf(src.action) }];
  });
}

// ---------------------------------------------------------------- start

/**
 * Who is around each round (MiroFish activation, seeded): a draw below each persona's
 * activity level, topped up so that at least two thirds of the people are around in
 * every round, and everyone is around in at least two rounds (one when there are three).
 */
function drawActive(personas: Persona[], rounds: number, seed: number): Record<number, string[]> {
  const rng = rngFor(seed, "active");
  const need = Math.ceil((2 * personas.length) / 3);
  const sets: Set<string>[] = [];
  for (let k = 1; k <= rounds; k++) {
    const on = new Set<string>();
    for (const p of personas) if (rng() < p.activityLevel) on.add(p.id);
    if (on.size < need) {
      const rest = personas
        .filter((p) => !on.has(p.id))
        .map((p) => ({ p, key: rng() * (0.5 + p.activityLevel) }))
        .sort((x, y) => y.key - x.key);
      for (const { p } of rest) {
        if (on.size >= need) break;
        on.add(p.id);
      }
    }
    sets.push(on);
  }
  const minRounds = rounds >= 4 ? 2 : 1;
  for (const p of personas) {
    let times = sets.filter((s) => s.has(p.id)).length;
    while (times < minRounds) {
      // Add them to the round where they are missing that has the fewest people (earliest on a tie).
      let best = -1;
      for (let i = 0; i < sets.length; i++) if (!sets[i]!.has(p.id) && (best < 0 || sets[i]!.size < sets[best]!.size)) best = i;
      if (best < 0) break;
      sets[best]!.add(p.id);
      times++;
    }
  }
  const out: Record<number, string[]> = {};
  sets.forEach((on, i) => (out[i + 1] = personas.filter((p) => on.has(p.id)).map((p) => p.id)));
  return out;
}

/** People who are not around this round get an automatic "not around" (no model call). */
function recordAbsent(r: Rehearsal, round: number): void {
  const lang = langOfR(r);
  for (const p of r.personas) {
    if (isActive(r, p.id, round) || reactionFor(r, p.id, round)) continue;
    r.reactions.push({ personaId: p.id, round, action: "not_around", thought: fillText(tr(AWAY[p.segment], lang), {}, p.gender ?? "f"), method: "rule-based" });
  }
}

/**
 * Starts a rehearsal: personas, rounds, who is around each round, and the café's own post in the feed.
 * Deterministic for (analysis, opts). The default seed is a hash of the analysis id.
 * Uses the analysis language and, when the inputs have one, the Kiez for the persona mix.
 */
export function startRehearsal(a: Analysis, opts: StartOptions = {}): Rehearsal {
  const n = clampInt(opts.personas, 4, 12, 6);
  const roundCount = clampInt(opts.rounds, 3, 5, 4);
  const seed = typeof opts.seed === "number" && Number.isFinite(opts.seed) ? normaliseSeed(opts.seed) : hashString(a.id);
  const mix = cleanMix(opts.customerMix) ?? undefined;
  const ctx = changeContext(a);
  const lang = ctx.lang;
  const personas = generatePersonas(
    {
      template: a.template,
      cafe: ctx.cafe,
      currency: ctx.currency,
      baseSpend: ctx.baseSpend,
      lang,
      ...(ctx.kiez ? { kiez: ctx.kiez } : {}),
      ...(a.template === "price_change" ? { item: ctx.item } : {}),
    },
    n,
    seed,
    mix,
  );
  const rounds = buildRounds(ctx, roundCount);
  const scene: RehearsalScene = {
    cafe: ctx.cafe,
    currency: ctx.currency,
    board: ctx.board,
    price: ctx.template === "price_change" ? ctx.newPrice : ctx.offerPrice,
    oldPrice: ctx.oldPrice,
    contents: ctx.contents,
    item: ctx.item,
    promoted: ctx.promoted,
    testLength: ctx.testLength,
  };
  const r: Rehearsal = {
    id: `rh_${hashString([a.id, seed, n, roundCount, JSON.stringify(mix ?? {}), lang, ctx.kiez ?? ""].join("|")).toString(36)}`,
    analysisId: a.id,
    template: a.template,
    business: (a.business ?? "").slice(0, OWNER_TEXT_CAPS.business),
    question: (a.question ?? "").slice(0, LIMITS.question),
    change: ctx.change,
    seed,
    createdAt: a.createdAt,
    status: "running",
    currentRound: 1,
    rounds,
    personas,
    active: drawActive(personas, rounds.length, seed),
    reactions: [],
    interviews: [],
    feed: [{ round: 1, name: ctx.cafe, text: ctx.announcement, kind: "post" }],
    events: [],
    lang,
    ...(ctx.kiez ? { kiez: ctx.kiez } : {}),
    scene,
    ...(mix ? { customerMix: mix } : {}),
  };
  recordAbsent(r, 1);
  return opts.event && norm(opts.event) ? injectEvent(r, opts.event) : r;
}

// ---------------------------------------------------------------- briefs

const RELATIONSHIP_TEXT: Record<Persona["relationship"], string> = {
  regular: "a regular (you come in most days)",
  occasional: "an occasional customer",
  new: "new (you have hardly or never been inside)",
};
const ATTITUDE_TEXT: Record<Persona["attitude"], string> = {
  fan: "you like it",
  neutral: "neutral",
  sceptical: "sceptical",
};

function cardBlock(r: Rehearsal, p: Persona): string {
  const s = sceneOf(r);
  const lang = langOfR(r);
  const m = money(p.usualSpend, s.currency, lang);
  const spend = r.template === "lunch_offer" ? `about ${m} on lunch` : `about ${m} per visit`;
  const channels = p.channels.map((c) => channelPhrase(c, lang));
  return [
    "WHO YOU ARE",
    `Name: ${p.name} (persona id "${p.id}")`,
    `Age: ${p.age}`,
    `Kind of customer: ${p.segmentLabel}`,
    `Routine: ${p.routine}`,
    `Usual spend: ${spend}`,
    `Price sensitivity: ${p.priceSensitivity}`,
    `Relationship with ${s.cafe}: ${RELATIONSHIP_TEXT[p.relationship]}`,
    `How you felt about ${s.cafe} before the change: ${ATTITUDE_TEXT[p.attitude]}`,
    `How you usually hear about new things: ${channels.join(", ")}`,
    `Where you go instead: ${p.alternatives}`,
    `Quirk: ${p.quirk}`,
    `Your story: ${p.story}`,
  ].join("\n");
}

function diaryLines(r: Rehearsal, p: Persona, beforeRound: number): string[] {
  const out: string[] = [];
  for (const s of r.rounds) {
    if (s.n >= beforeRound) break;
    const x = reactionFor(r, p.id, s.n);
    if (!x) continue;
    if (x.action === "not_around" && !isActive(r, p.id, s.n)) {
      out.push(`- Round ${s.n} (${s.title}): you were not around.`);
      continue;
    }
    const label = labelOf(r, s.n, x.action);
    const said = x.saysPublicly ? ` You said: "${x.saysPublicly}"` : "";
    const diary = x.diary ? ` Your diary: "${x.diary}"` : "";
    out.push(`- Round ${s.n} (${s.title}): you chose "${label}".${said}${diary}`);
  }
  return out;
}

function feedLine(r: Rehearsal, f: FeedItem, viewer: Persona): string {
  const who = () => {
    if (!f.personaId) return f.name;
    if (f.personaId === viewer.id) return `you (${f.name})`;
    const p = personaById(r, f.personaId);
    return p ? `${p.name} (${p.segmentLabel.toLowerCase()})` : f.name;
  };
  switch (f.kind) {
    case "post":
      return `- ${f.name}, the café's own post: "${f.text}"`;
    case "event":
      return `- In the neighbourhood: ${f.text}`;
    case "review":
      return `- Online review by ${who()}: "${f.text}"`;
    default:
      return `- Word of mouth from ${who()}: "${f.text}"`;
  }
}

function feedBlock(r: Rehearsal, p: Persona, round: number): string {
  const items = visibleFeed(r, round)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => visibleFrom(b.f) - visibleFrom(a.f) || b.i - a.i)
    .slice(0, 6)
    .map(({ f }) => feedLine(r, f, p));
  return ["WHAT'S GOING AROUND THE NEIGHBOURHOOD (newest first)", ...(items.length ? items : ["- Nothing yet."])].join("\n");
}

function languageLine(r: Rehearsal, fields: string): string {
  const lang = langOfR(r);
  const name = BRIEF_LANGUAGE[lang];
  return lang === "en"
    ? `LANGUAGE: Write your answers in English: ${fields}.`
    : `LANGUAGE: Write your answers in ${name}: ${fields}. The situation, your card and the neighbourhood feed are in ${name} as well; only these instructions are in English. Keep the JSON keys and action ids exactly as shown.`;
}

function realismBlock(r: Rehearsal): string {
  const first =
    r.template === "price_change"
      ? "- Many people barely notice a small price change; others notice and carry on anyway. Both are normal."
      : "- Most people ignore most offers and signs. Noticing something is not the same as changing what you do.";
  return [
    "STAY REALISTIC",
    first,
    "- Habits are sticky: people mostly do what they did last time unless something gives them a real reason to change.",
    "- Stay within your budget and your character. Your usual spend and price sensitivity are real limits.",
    "- You do NOT know the café's costs, margins or takings, and you do not guess them.",
    "- You are not trying to please the owner. Do not be nice, or harsh, for its own sake.",
    '- "Not interested" is a perfectly good answer. If you would not realistically be anywhere near the café this time, choose not_around.',
    "- Only react to what you could actually see, hear or read: the situation and the neighbourhood feed above. Stay consistent with your diary.",
    `- Write in plain, everyday ${BRIEF_LANGUAGE[langOfR(r)]}, in your own voice.`,
  ].join("\n");
}

function jsonBlock(r: Rehearsal, p: Persona, spec: RoundSpec): string {
  const ids = spec.actions.map((a) => a.id);
  const publicIds = spec.actions.filter((a) => a.public).map((a) => a.id);
  const example: Record<string, string | number> = { personaId: p.id, round: spec.n, action: "<one action id>", thought: "<why, in first person>" };
  if (publicIds.length) example.saysPublicly = `<only if action is ${publicIds.join(" or ")}>`;
  example.questionForOwner = "<optional>";
  example.diary = "<one sentence you will remember>";
  const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs.join(""));
  const heard = [...new Set(speakersFor(r, p.id, spec.n).map((s) => s.name))];
  return [
    "REPLY WITH JSON ONLY",
    "Return exactly one JSON object and nothing else: no code fence, no text before or after it.",
    JSON.stringify(example),
    "Fields:",
    `- personaId: exactly "${p.id}".`,
    `- round: exactly ${spec.n}.`,
    `- action (required): one id from the list above: ${orList(ids)}.`,
    `- thought (required): first person, why you did it, at most ${LIMITS.thought} characters.`,
    publicIds.length
      ? `- saysPublicly (only if your action is ${orList(publicIds)}): the words you would say or write, at most ${LIMITS.saysPublicly} characters. Leave it out for any other action.`
      : "- saysPublicly: leave it out; no action this round is public.",
    `- questionForOwner (optional): one thing you would want to know from the café, at most ${LIMITS.questionForOwner} characters. Leave it out if nothing comes to mind.`,
    ...(heard.length
      ? [`- heardFrom (optional): if what someone said in the neighbourhood feed made you do this, their name (${orList(heard)}). Leave it out otherwise.`]
      : []),
    `- diary (required): one sentence you will remember next time, at most ${LIMITS.diary} characters.`,
  ].join("\n");
}

const REACTION_FIELDS = "thought, saysPublicly, questionForOwner and diary";

function briefPrompt(r: Rehearsal, p: Persona, spec: RoundSpec): string {
  const s = sceneOf(r);
  const diary = diaryLines(r, p, spec.n);
  const where = r.kiez ? `a neighbourhood café in Berlin-${r.kiez}` : "a neighbourhood café in Berlin";
  return [
    `You are playing ONE imagined customer in a "customer rehearsal" for ${s.cafe}, ${where}. The owner is thinking about a change and wants to see, before spending money, how different kinds of customers might react. You are not real data: you are one plausible person. React the way this person really would. This is round ${spec.n} of ${r.rounds.length}.`,
    languageLine(r, REACTION_FIELDS),
    cardBlock(r, p),
    ["YOUR DIARY SO FAR", ...(diary.length ? diary : ["- Nothing yet: this is the first round."])].join("\n"),
    feedBlock(r, p, spec.n),
    `THIS ROUND: ${spec.title}\n${spec.situation}`,
    ["CHOOSE EXACTLY ONE ACTION (use its id)", ...spec.actions.map((a) => `- ${a.id}: ${a.label}${a.public ? " (public: others will hear about it)" : ""}`)].join("\n"),
    realismBlock(r),
    jsonBlock(r, p, spec),
  ].join("\n\n");
}

/** Briefs for the current round: one self-contained prompt per active persona still waiting for a reaction. */
export function roundBriefs(r: Rehearsal): PersonaBrief[] {
  const spec = specOf(r, r.currentRound);
  if (r.status === "done" || !spec) return [];
  return pending(r).map((p) => ({
    personaId: p.id,
    name: p.name,
    round: spec.n,
    allowedActions: spec.actions.map((a) => a.id),
    prompt: briefPrompt(r, p, spec),
  }));
}

// ---------------------------------------------------------------- submit

function sameReaction(a: Reaction, b: Omit<Reaction, "method">): boolean {
  return a.action === b.action && a.thought === b.thought && (a.saysPublicly ?? "") === (b.saysPublicly ?? "") && (a.diary ?? "") === (b.diary ?? "");
}

function record(r: Rehearsal, x: Reaction): void {
  r.reactions.push(x);
  const a = actionOf(r, x.round, x.action);
  if (a?.public) {
    const p = personaById(r, x.personaId);
    r.feed.push({ round: x.round, personaId: x.personaId, name: p?.name ?? x.personaId, text: x.saysPublicly ?? `${labelOf(r, x.round, x.action)}.`, kind: FEED_KIND[x.action] ?? "word_of_mouth" });
    sortFeed(r);
  }
}

/**
 * Who this persona heard it from: the model's `heardFrom` when it names someone whose words were in
 * the feed they saw, otherwise the most recent such person they name in their own words. Rebuilt the
 * same way from stored reactions, so links survive a share token.
 */
function resolveHeardFrom(r: Rehearsal, p: Persona, k: number, raw: unknown, texts: (string | undefined)[]): string | undefined {
  const speakers = speakersFor(r, p.id, k);
  if (!speakers.length) return undefined;
  const ids = new Set(speakers.map((s) => s.id));
  if (raw !== undefined && raw !== null && raw !== "") {
    const named = findPersona(r, raw);
    if (named && named.id !== p.id && ids.has(named.id)) return named.id;
  }
  const words = texts.filter(Boolean).join(" \n ");
  for (let i = speakers.length - 1; i >= 0; i--) if (mentions(words, speakers[i]!.name)) return speakers[i]!.id;
  return undefined;
}

/** Validates and records reactions for the current round (mutates r). Valid items are kept even when others fail. */
function apply(r: Rehearsal, items: unknown[], methodFor: (raw: Record<string, unknown>) => ReactionMethod): { accepted: number; errors: { personaId: string; error: string }[] } {
  const errors: { personaId: string; error: string }[] = [];
  let accepted = 0;
  const k = r.currentRound;
  const spec = specOf(r, k);
  items.forEach((item, i) => {
    const raw = parseItem(item);
    const fallbackId = `item ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({ personaId: fallbackId, error: "Not a JSON object. Send one object per persona, as the brief shows." });
      return;
    }
    const o = raw as Record<string, unknown>;
    const pidRaw = o.personaId ?? o.persona_id ?? o.id;
    const p = findPersona(r, pidRaw);
    if (!p) {
      errors.push({ personaId: pidRaw === undefined ? fallbackId : String(pidRaw).slice(0, 40), error: `Unknown personaId ${JSON.stringify(pidRaw === undefined || pidRaw === null ? null : String(pidRaw).slice(0, 40))}. Use one of: ${personaList(r)}.` });
      return;
    }
    if (!spec || r.status === "done") {
      errors.push({ personaId: p.id, error: "The rehearsal is finished; nothing more to submit." });
      return;
    }
    if (o.round !== undefined && o.round !== null && o.round !== "" && Number(o.round) !== k) {
      errors.push({ personaId: p.id, error: `This reaction is for round ${String(o.round).slice(0, 10)}, but the rehearsal is waiting for round ${k}.` });
      return;
    }
    if (!isActive(r, p.id, k)) {
      errors.push({ personaId: p.id, error: `${p.name} (${p.id}) is not around in round ${k}; that was recorded automatically as not_around. Do not send a reaction for ${p.id} this round.` });
      return;
    }
    const problems: string[] = [];
    const actRaw = typeof o.action === "string" ? o.action.slice(0, 120) : "";
    const wanted = normAction(actRaw);
    const action = wanted
      ? spec.actions.find((a) => a.id === wanted) ?? spec.actions.find((a) => normAction(a.label) === wanted || normAction(ACTIONS[a.id]?.label ?? "") === wanted)
      : undefined;
    if (!actRaw.trim()) problems.push(`Missing "action". Choose one of: ${spec.actions.map((a) => a.id).join(", ")}.`);
    else if (!action) problems.push(`Action "${actRaw.slice(0, 60)}" is not allowed in round ${k}. Choose one of: ${spec.actions.map((a) => a.id).join(", ")}.`);
    const thought = fitText(o.thought, "thought", LIMITS.thought, problems);
    if (thought === undefined && !problems.some((m) => m.startsWith('"thought"'))) problems.push(`Missing "thought": one first-person sentence on why, at most ${LIMITS.thought} characters.`);
    let saysPublicly = fitText(o.saysPublicly ?? o.says_publicly, "saysPublicly", LIMITS.saysPublicly, problems);
    const questionForOwner = fitText(o.questionForOwner ?? o.question_for_owner, "questionForOwner", LIMITS.questionForOwner, problems);
    let diary = fitText(o.diary, "diary", LIMITS.diary, problems);
    if (problems.length || !action || thought === undefined) {
      errors.push({ personaId: p.id, error: problems.join(" ") });
      return;
    }
    // Public words only belong to public actions; for anything else they are dropped, not an error.
    if (!action.public) saysPublicly = undefined;
    if (!diary) diary = cut(thought, LIMITS.diary);
    const heardFrom = resolveHeardFrom(r, p, k, o.heardFrom ?? o.heard_from, [thought, saysPublicly, diary]);
    const x: Omit<Reaction, "method"> = {
      personaId: p.id,
      round: k,
      action: action.id,
      thought,
      ...(saysPublicly ? { saysPublicly } : {}),
      ...(questionForOwner ? { questionForOwner } : {}),
      diary,
      ...(heardFrom ? { heardFrom } : {}),
    };
    const existing = reactionFor(r, p.id, k);
    if (existing) {
      if (!sameReaction(existing, x)) errors.push({ personaId: p.id, error: `${p.name} (${p.id}) already has a reaction for round ${k}; the first one is kept.` });
      return;
    }
    record(r, { ...x, method: methodFor(o) });
    accepted++;
  });
  return { accepted, errors };
}

/** Moves to the next round once every active persona has reacted; marks done after the last round. */
function advance(r: Rehearsal): void {
  while (r.status === "running" && pending(r).length === 0) {
    r.currentRound++;
    if (r.currentRound > r.rounds.length) {
      r.status = "done";
      r.currentRound = r.rounds.length + 1;
      break;
    }
    recordAbsent(r, r.currentRound);
  }
}

/**
 * Validates and records reactions for the current round. Valid reactions are kept even when
 * others in the same batch fail, so only the failed (or missing) personas need resending.
 * Rules: unknown persona, wrong round, inactive persona, unknown action or missing thought → error;
 * text up to 1.5× its limit is trimmed at a word ("…"), longer text is an error; saysPublicly on a
 * non-public action is dropped; a missing diary is taken from the thought; heardFrom is optional.
 */
export function submitRound(r: Rehearsal, reactions: unknown[], method: ReactionMethod = "subagent"): SubmitOutcome {
  const next = clone(r);
  const items = toList(reactions);
  const m: ReactionMethod = METHODS.includes(method) ? method : "subagent";
  if (next.status === "done") {
    return {
      rehearsal: next,
      accepted: 0,
      errors: items.map((_, i) => ({ personaId: `item ${i + 1}`, error: "The rehearsal is finished; nothing more to submit." })),
      done: true,
      next: [],
    };
  }
  const startRound = next.currentRound;
  const { accepted, errors } = apply(next, items, () => m);
  advance(next);
  const advanced = next.currentRound > startRound;
  if (!advanced) {
    const named = new Set(errors.map((e) => e.personaId));
    for (const p of pending(next)) {
      if (!named.has(p.id)) errors.push({ personaId: p.id, error: `Still waiting for ${p.name} (${p.id}) in round ${startRound}: send one reaction from the brief.` });
    }
  }
  // advance() mutates the status, which TypeScript's narrowing above cannot see.
  const done = (next.status as Rehearsal["status"]) === "done";
  return { rehearsal: next, accepted, errors, done, next: advanced && !done ? roundBriefs(next) : [] };
}

// ---------------------------------------------------------------- events

/** An event as stored: a Berlin event (by id, in the rehearsal language) or the owner's own words. */
function eventEntry(r: Rehearsal, text: string): { text: string; id?: string } {
  const ev = findBerlinEvent(text);
  if (ev) return { id: ev.id, text: berlinEventText(ev.id, langOfR(r)) ?? text };
  return { text: cut(norm(text), LIMITS.event) };
}

function addEvent(r: Rehearsal, beforeRound: number, text: string): void {
  const e = eventEntry(r, text);
  r.events.push({ beforeRound, text: e.text, ...(e.id ? { id: e.id } : {}) });
  r.feed.push({ round: beforeRound, name: tr(CHANGE_TEXT.eventFeedName, langOfR(r)), text: e.text, kind: "event" });
  sortFeed(r);
}

/**
 * Records an owner-injected change: free text ("rain all week") or a Berlin event id
 * ("rival_lunch", see BERLIN_EVENTS), shown in the rehearsal language. It applies before the
 * next round: the current round if nobody has reacted in it yet, otherwise the one after.
 */
export function injectEvent(r: Rehearsal, text: string): Rehearsal {
  const t = typeof text === "string" ? norm(text) : "";
  if (!t) throw new Error('Describe the event in a sentence, for example "It rains all week" or "The café opposite starts an €8.50 lunch", or use a Berlin event id such as "rain_week".');
  if (r.status === "done") throw new Error("This rehearsal has finished, so there is no next round for the event. Start a new rehearsal with the event instead.");
  const started = r.reactions.some((x) => x.round === r.currentRound && isActive(r, x.personaId, x.round));
  const beforeRound = started ? r.currentRound + 1 : r.currentRound;
  if (beforeRound > r.rounds.length) throw new Error("The last round is already under way, so the event would never be seen. Start a new rehearsal with the event instead.");
  const next = clone(r);
  addEvent(next, beforeRound, t);
  return next;
}

// ---------------------------------------------------------------- rule-based stand-in

interface EventMods {
  rain: boolean;
  heat: boolean;
  competitor: boolean;
  buzz: boolean;
  busy: boolean;
  quiet: boolean;
  works: boolean;
  wfh: boolean;
  holiday: boolean;
  /** First round the competitor event applies to (for "went to the new place" continuity). */
  competitorFrom: number;
}

const RE = {
  rain: /(\brain|storm|snow|downpour|drizzle|freezing|cold snap|regen|sturm|schnee|unwetter|lluvia|llueve|tormenta|nieve|deszcz|pada|burza|śnieg|ulewa|mróz)/,
  heat: /(heat ?wave|\bhot\b|\b3\d ?°|hitze|heiß|calor|upał)/,
  competitorWhere: /(opposite|across the (road|street)|next door|two doors|new caf|competitor|rival|chain|opens|opening|bakery|döner|doner|gegenüber|nebenan|neues café|neue café|konkurrenz|eröffnet|enfrente|al lado|café nuevo|nuevo café|competencia|abre |naprzeciwko|obok|nowa kawiarnia|konkurencja|otwiera)/,
  competitorWhat: /(lunch|deal|offer|price|€|\$|£|cheap|coffee|menu|open|mittag|angebot|preis|billig|kaffee|menú|precio|barato|café|oferta|cena|tani|kawa|zestaw)/,
  buzz: /(instagram|influencer|blog|newspaper|article|tiktok|featured|press|radio|\btv\b|viral|recommend|zeitung|artikel|presse|empfiehlt|periódico|artículo|prensa|recomienda|gazeta|artykuł|prasa|poleca)/,
  busy: /(festival|market|fair|street party|\bfest\b|tourists|concert|marathon|sunny|sunshine|straßenfest|markt|touristen|konzert|sonne|fiesta|mercado|turistas|concierto|festyn|jarmark|targ|turyści|koncert|słońce)/,
  works: /(construction|roadworks|road works|baustelle|scaffold|pavement|gehweg|gesperrt|obras|acera|budowa|remont|roboty|chodnik)/,
  wfh: /(strike|working from home|home office|homeoffice|streik|huelga|teletrabajo|strajk|praca zdalna|z domu)/,
  holiday: /(school holiday|summer holiday|ferien|vacaciones|ferie|wakacje)/,
  quiet: /(closed|detour|diversion|umleitung|cerrad|zamknięt)/,
};

function eventMods(r: Rehearsal, round: number): EventMods {
  const m: EventMods = { rain: false, heat: false, competitor: false, buzz: false, busy: false, quiet: false, works: false, wfh: false, holiday: false, competitorFrom: 0 };
  for (const e of r.events) {
    if (e.beforeRound > round) continue;
    const id = (e.id ?? findBerlinEvent(e.text)?.id) as BerlinEventId | undefined;
    const effects = id ? EVENT_EFFECTS[id] : undefined;
    const before = m.competitor;
    if (effects) for (const f of effects) m[f] = true;
    else {
      const t = e.text.toLowerCase().slice(0, LIMITS.event);
      if (RE.rain.test(t)) m.rain = true;
      if (RE.heat.test(t)) m.heat = true;
      if (RE.competitorWhere.test(t) && RE.competitorWhat.test(t)) m.competitor = true;
      if (RE.buzz.test(t)) m.buzz = true;
      if (RE.busy.test(t)) m.busy = true;
      if (RE.works.test(t)) m.works = m.quiet = true;
      if (RE.wfh.test(t)) m.wfh = m.quiet = true;
      if (RE.holiday.test(t)) m.holiday = m.quiet = true;
      if (RE.quiet.test(t)) m.quiet = true;
    }
    if (!before && m.competitor) m.competitorFrom = e.beforeRound;
  }
  return m;
}

const SENS_W: Record<Persona["priceSensitivity"], number> = { low: 0.25, medium: 0.6, high: 1 };
const SENS_MULT: Record<Persona["priceSensitivity"], number> = { low: 0.6, medium: 2, high: 4 };
const CONVENIENCE: Record<SegmentId, number> = { office_worker: 0.15, trades: 0.15, tourist: 0.1, freelancer: 0.05, parent: 0.05, regular: 0.05, student: 0, retiree: 0 };
const ELSEWHERE_ACTIONS = new Set(["eats_elsewhere", "goes_elsewhere", "stays_away", "found_somewhere_cheaper", "back_to_old_habits"]);

interface Ctx {
  r: Rehearsal;
  p: Persona;
  k: number;
  scene: RehearsalScene;
  ev: EventMods;
  hist: Reaction[];
  noticed: boolean;
  tried: boolean;
  triedRound: number;
  cameBack: boolean;
  reduced: boolean;
  elsewhere: boolean;
  /** Lunch: ate elsewhere or went back to old habits before. */
  wentElsewhere: boolean;
  /** Went elsewhere after the competitor event started. */
  wentToRival: boolean;
  grumbled: boolean;
  accepted: boolean;
  heardPos: number;
  heardNeg: number;
  speakers: ReturnType<typeof speakersFor>;
  noticeP: number;
  /** Lunch: how good the deal looks to them (−1…1). */
  value: number;
  /** Price change: how much the change bothers them (−1…1). */
  pain: number;
  gShare: number;
  has: (c: string) => boolean;
  trait: (t: string) => boolean;
}

function buildCtx(r: Rehearsal, p: Persona, k: number): Ctx {
  const scene = sceneOf(r);
  const ev = eventMods(r, k);
  const hist = r.reactions.filter((x) => x.personaId === p.id && x.round < k).sort((a, b) => a.round - b.round);
  const did = (set: ReadonlySet<string>) => hist.some((x) => set.has(x.action));
  const has = (c: string) => p.channels.includes(c);
  const trait = (t: string) => (p.traits ?? []).includes(t);
  const lunch = r.template === "lunch_offer";
  const firstTry = hist.find((x) => GROUPS.lunchUsed.has(x.action));
  const triedRound = firstTry ? firstTry.round : 0;
  const tried = !!firstTry;
  const cameBack = tried && hist.some((x) => x.round > triedRound && GROUPS.lunchReturn.has(x.action));
  const speakers = speakersFor(r, p.id, k);
  const heardPos = speakers.filter((s) => s.pol === "pos").length;
  const heardNeg = speakers.filter((s) => s.pol === "neg").length;
  const sens = SENS_W[p.priceSensitivity];
  let noticeP: number;
  let value = 0, pain = 0;
  if (lunch) {
    noticeP = 0.12;
    if (has("walks past")) noticeP += 0.2;
    if (has("the board outside")) noticeP += 0.25;
    if (has("Instagram")) noticeP += scene.promoted ? 0.18 : 0.08;
    if (has("Google Maps")) noticeP += 0.04;
    if (has("the staff")) noticeP += 0.18;
    if (heardPos + heardNeg > 0 && WORD_OF_MOUTH_CHANNELS.some(has)) noticeP += 0.2;
    noticeP += p.relationship === "regular" ? 0.2 : p.relationship === "occasional" ? 0.08 : 0;
    if (ev.buzz) noticeP += 0.2;
    if (ev.busy) noticeP += 0.1;
    if (ev.rain) noticeP -= 0.15;
    if (ev.quiet || ev.works) noticeP -= 0.15;
    noticeP = clamp(noticeP, 0.08, 0.95);
    const saving = p.usualSpend > 0 ? (p.usualSpend - scene.price) / p.usualSpend : 0;
    value =
      saving * sens + CONVENIENCE[p.segment] + (p.attitude === "fan" ? 0.12 : p.attitude === "sceptical" ? -0.15 : 0) - (ev.competitor ? 0.25 * sens : 0) + (ev.buzz ? 0.05 : 0) + (ev.rain ? 0.05 : 0) - (ev.heat ? 0.08 : 0);
    value = clamp(value, -1, 1);
  } else {
    noticeP = p.relationship === "regular" ? 0.8 : p.relationship === "occasional" ? 0.45 : 0.08;
    noticeP += p.priceSensitivity === "high" ? 0.15 : p.priceSensitivity === "low" ? -0.1 : 0;
    if (has("the staff")) noticeP += 0.05;
    noticeP = clamp(noticeP, 0.05, 0.95);
    const rise = scene.oldPrice > 0 ? (scene.price - scene.oldPrice) / scene.oldPrice : 0;
    pain = rise * SENS_MULT[p.priceSensitivity] * (p.relationship === "regular" ? 1.2 : 1) + (p.attitude === "sceptical" ? 0.08 : p.attitude === "fan" ? -0.05 : 0) + (ev.competitor ? 0.15 : 0);
    pain = clamp(pain, -1, 1);
  }
  const gShare = clamp(pain * 1.8 + (p.attitude === "sceptical" ? 0.25 : 0) - (p.attitude === "fan" ? 0.15 : 0), 0.02, 0.85);
  return {
    r, p, k, scene, ev, hist,
    noticed: did(lunch ? GROUPS.lunchNoticed : GROUPS.priceNoticed),
    tried, triedRound, cameBack,
    reduced: did(GROUPS.priceReduced),
    elsewhere: did(GROUPS.priceElsewhere),
    wentElsewhere: did(GROUPS.lunchElsewhere),
    wentToRival: ev.competitor && hist.some((x) => x.round >= ev.competitorFrom && ELSEWHERE_ACTIONS.has(x.action)),
    grumbled: hist.some((x) => x.action === "grumbles"),
    accepted: hist.some((x) => x.action === "accepts"),
    heardPos, heardNeg, speakers, noticeP, value, pain, gShare, has, trait,
  };
}

function rel(p: Persona, regular: number, occasional: number, newcomer: number): number {
  return p.relationship === "regular" ? regular : p.relationship === "occasional" ? occasional : newcomer;
}

function att(p: Persona, fan: number, neutral: number, sceptic: number): number {
  return p.attitude === "fan" ? fan : p.attitude === "neutral" ? neutral : sceptic;
}

/** Chance of a "first try" this round (lunch offer). */
function tryWeight(c: Ctx): number {
  const heard = Math.min(1, c.heardPos);
  return (c.noticed || heard ? 1 : 0.55) * clamp(0.36 + c.value * 1.3 + 0.45 * heard, 0.04, 1.4);
}

/** How likely this person is to take this action now (unnormalised). */
function weight(id: string, c: Ctx): number {
  const { p, ev } = c;
  const sens = SENS_W[p.priceSensitivity];
  const sceptic = p.attitude === "sceptical", fan = p.attitude === "fan", regular = p.relationship === "regular";
  const heard = Math.min(1, c.heardPos);
  const pain = Math.max(0, c.pain);
  const wom = WORD_OF_MOUTH_CHANNELS.some(c.has) ? 1.35 : 1;
  switch (id) {
    case "not_around": {
      let w = p.segment === "tourist" && c.k >= 3 ? 0.5 + 0.2 * (c.k - 3) : 0;
      if (ev.holiday && (p.segment === "parent" || p.segment === "student")) w += 0.8;
      if (ev.wfh) w += p.segment === "office_worker" ? 0.7 : p.segment === "freelancer" || p.segment === "student" ? 0.3 : 0;
      if (ev.heat && p.segment === "retiree") w += 0.3;
      return w;
    }
    // lunch offer
    case "notices_offer":
      return c.noticeP;
    case "ignores":
      return 1 - c.noticeP;
    case "tries_deal":
      if (c.tried) return 0.08;
      return tryWeight(c) * (c.k === 2 ? 1 - tellShare(c) : 0.8);
    case "tries_and_tells":
      return c.tried ? 0.05 : tryWeight(c) * tellShare(c);
    case "usual_order": {
      const base = rel(p, 0.85, 0.35, 0.1) * (p.priceSensitivity === "low" ? 1.25 : 1);
      if (c.k >= 4) return rel(p, 0.8, 0.28, 0.05) * (c.tried ? 0.4 : 1);
      return c.tried ? 0.2 + (regular ? 0.25 : 0) : base;
    }
    case "eats_elsewhere":
      if (c.k >= 4) return ((c.wentElsewhere ? 0.4 : 0.05) + (c.wentToRival ? 0.3 : 0) + (ev.competitor ? 0.25 * sens : 0) + (sceptic ? 0.1 : 0)) * (c.cameBack ? 0.3 : 1);
      return (
        (0.18 + (sceptic ? 0.28 : 0) + (p.relationship === "new" ? 0.12 : 0) + (ev.competitor ? 0.4 * sens : 0) + (c.wentElsewhere ? 0.2 : 0) + (ev.heat ? 0.1 : 0)) *
        rel(p, 0.4, 1, 1.1) *
        (fan ? 0.6 : 1) *
        (c.tried && c.value > 0.1 ? 0.6 : 1)
      );
    case "skips_lunch_out":
      return ({ low: 0.05, medium: 0.15, high: 0.4 } as const)[p.priceSensitivity] + (ev.rain ? 0.25 : 0) + (ev.heat ? 0.15 : 0) + (["student", "retiree", "parent", "freelancer"].includes(p.segment) ? 0.12 : 0);
    case "comes_back_for_deal":
      return c.tried ? clamp(0.75 + c.value * 1.5 + 0.2 * heard, 0.1, 1.5) : 0;
    case "back_to_usual":
      return c.tried ? 0.35 + (regular ? 0.3 : 0) : rel(p, 0.8, 0.4, 0.1);
    case "tells_a_friend":
      return c.tried ? 0.32 * att(p, 1.6, 1, 0.6) * wom : heard ? 0.14 * wom : 0.02;
    case "keeps_coming":
      return c.tried ? clamp(0.42 + c.value * 1.4 + (c.cameBack ? 0.35 : 0), 0.08, 1.4) : 0.03 + 0.25 * heard * (c.noticed ? 1 : 0.5) * att(p, 1.2, 1, 0.5);
    case "posts_review":
      return c.tried ? 0.15 * (c.has("Google Maps") || c.has("Instagram") ? 2 : 1) * att(p, 1.3, 1, 1.2) : 0.02;
    case "complains":
      return (sceptic ? 0.25 : 0.03) + (regular && !c.tried && !c.trait("takeaway") ? 0.1 : 0) + (c.tried && c.value < 0 ? 0.15 : 0);
    case "forgets_about_it":
      return c.tried ? 0.1 : regular ? 0.15 : 0.55;
    case "still_comes_for_lunch":
      return c.cameBack ? 0.9 : c.tried ? 0.4 : 0.03 + 0.2 * heard;
    case "comes_now_and_then":
      return c.tried ? 0.45 : 0.08 + 0.1 * heard;
    case "back_to_old_habits":
      return (c.tried ? 0.25 : 0.6) + (ev.competitor ? 0.3 * sens : 0) + (c.wentElsewhere ? 0.3 : 0);
    case "recommends_it":
      return c.tried ? (fan ? 0.3 : 0.12) * wom : 0.02;
    // price change
    case "accepts":
      return c.noticeP * (1 - c.gShare);
    case "grumbles":
      return c.noticeP * c.gShare;
    case "does_not_notice":
      return 1 - c.noticeP;
    case "buys_as_usual":
      // Habits are sticky: most people keep buying after a small rise.
      return clamp(1.2 - pain * 1.5, 0.15, 1.2) * (regular ? 1.2 : 1) * (fan ? 1.2 : 1) * (c.grumbled ? 0.7 : 1) * (!c.noticed ? 1.3 : 1);
    case "buys_less_often":
      if (c.k >= 3) return (c.reduced && !c.elsewhere ? 0.4 : pain * 0.3) * (c.grumbled ? 1.4 : 1) + 0.12 * Math.min(1, c.heardNeg);
      return pain * 0.45 * (c.grumbled ? 1.5 : 1) + 0.08 * Math.min(1, c.heardNeg);
    case "switches_to_cheaper_item":
      return pain * 0.35 * (p.segment === "student" || p.segment === "freelancer" ? 1.4 : 1);
    case "goes_elsewhere":
      return pain * 0.22 * (sceptic ? 1.8 : 1) + (ev.competitor ? 0.4 * sens : 0) + 0.06 * Math.min(2, c.heardNeg);
    case "keeps_buying":
      return c.elsewhere ? 0.1 : !c.reduced ? clamp(1 - pain * 1.5, 0.15, 1) : 0.25;
    case "tells_friend_it_is_pricey":
      return (c.grumbled || c.reduced ? 0.2 + pain : 0.03) * wom;
    case "forgot_about_it":
      return !c.noticed ? 0.8 : c.accepted ? 0.4 : 0.1;
    case "stays_away":
      return c.elsewhere ? 0.7 : c.reduced ? 0.2 + (ev.competitor ? 0.3 : 0) : 0.02 + (ev.competitor ? 0.3 * sens : 0);
    case "stays_a_customer":
      return c.elsewhere ? 0.05 : !c.reduced ? clamp(1 - pain, 0.2, 1) : 0.3;
    case "buys_less_than_before":
      return c.reduced && !c.elsewhere ? 0.45 : pain * 0.18 + 0.06 * Math.min(1, c.heardNeg);
    case "recommends_cafe_anyway":
      return ((fan ? 0.18 : 0.03) + (!c.reduced ? 0.04 : 0) + 0.08 * Math.min(1, c.heardPos)) * (c.elsewhere ? 0.2 : 1) * wom;
    case "mentions_price_in_review":
      return ((sceptic ? 0.15 : 0.03) + (c.has("Google Maps") ? 0.1 : 0)) * (c.grumbled || c.reduced ? 2 : 1);
    case "still_buys_regularly":
      return c.elsewhere ? 0.1 : !c.reduced ? 0.9 : 0.25;
    case "buys_now_and_then":
      return c.reduced && !c.elsewhere ? 0.5 : 0.1;
    case "found_somewhere_cheaper":
      return c.elsewhere ? 0.8 : (ev.competitor ? 0.25 * sens : 0) + 0.02 + pain * 0.15 + 0.06 * Math.min(1, c.heardNeg);
    case "recommends_cafe":
      return (fan ? 0.25 : 0.04) * (c.elsewhere ? 0.2 : 1);
    default:
      return 0.1;
  }
}

/** Share of first tries that are passed on straight away (round 2's public option). */
function tellShare(c: Ctx): number {
  return clamp(0.45 * att(c.p, 1.5, 1, 0.6) * (WORD_OF_MOUTH_CHANNELS.some(c.has) ? 1.3 : 1), 0, 0.7);
}

function conditions(c: Ctx, action: string, useRival: boolean, speaker: Speaker | undefined): Set<Cond> {
  const { p, scene, ev } = c;
  const s = new Set<Cond>();
  const lunch = c.r.template === "lunch_offer";
  if (lunch && scene.price < p.usualSpend - 0.2) s.add("cheaper");
  if (lunch && scene.price > p.usualSpend * 1.05) s.add("pricier");
  if (p.priceSensitivity === "high") s.add("sensitive");
  if (p.priceSensitivity === "low") s.add("relaxed");
  if (p.attitude === "fan") s.add("fan");
  if (p.attitude === "sceptical") s.add("sceptic");
  if (p.relationship === "regular") s.add("regular");
  if (p.relationship === "new") s.add("new");
  if (p.segment === "tourist") s.add("tourist");
  s.add(c.tried ? "tried" : "untried");
  if (speaker) s.add("heard");
  if (c.grumbled) s.add("grumbled");
  if (c.trait("takeaway")) s.add("takeaway");
  if (c.trait("hurry")) s.add("hurry");
  if (c.has("Instagram")) s.add("insta");
  if (ev.rain) s.add("rain");
  if (ev.heat) s.add("heat");
  if (ev.competitor && (!ELSEWHERE_ACTIONS.has(action) || useRival)) s.add("competitor");
  if (ev.buzz) s.add("buzz");
  if (ev.busy) s.add("busy");
  if (ev.quiet) s.add("quiet");
  if (ev.works) s.add("works");
  if (ev.wfh) s.add("wfh");
  if (ev.holiday) s.add("holiday");
  if (!lunch && scene.price < scene.oldPrice) s.add("drop");
  if (!lunch && scene.price > scene.oldPrice) s.add("rise");
  return s;
}

function fits(l: Line, conds: Set<Cond>): boolean {
  return (!l.when || l.when.every((w) => conds.has(w))) && (!l.not || !l.not.some((w) => conds.has(w)));
}

/**
 * Prefers a line written for this person's situation (and, when someone's words moved them, a line
 * that names that person); falls back to a line that fits anyone. Lines already used this round are
 * skipped while others remain, so people don't all say the same thing; when every fitting line is
 * taken, `tail` asks the caller to add a few words of the person's own.
 */
function chooseLine(
  rng: Rng,
  lines: Line[] | undefined,
  conds: Set<Cond>,
  used: Set<Line>,
  opts: { stale?: (l: Line) => boolean; topic?: string } = {},
): { line?: Line; tail: boolean } {
  if (!lines || !lines.length) return { tail: false };
  let all = lines.filter((l) => fits(l, conds));
  // Public words and the diary stay on the thought's topic when there are lines for it.
  if (opts.topic && all.some((l) => l.topic === opts.topic)) all = all.filter((l) => !l.topic || l.topic === opts.topic);
  const specific = all.filter((l) => l.when?.length);
  const generic = all.filter((l) => !l.when?.length);
  // Not a line used by someone else this round, and not what this person already thought before.
  const fresh = (ls: Line[]) => ls.filter((l) => !used.has(l) && !opts.stale?.(l));
  const fs = fresh(specific), fg = fresh(generic);
  const heardLines = fs.filter((l) => l.when!.includes("heard"));
  let from: Line[];
  let tail = false;
  if (heardLines.length && rng() < 0.9) from = heardLines;
  else if (fs.length && (!fg.length || rng() < 0.75)) from = fs;
  else if (fg.length) from = fg;
  else if (fs.length) from = fs;
  else {
    from = all.length ? all : [lines[0]!];
    tail = true;
  }
  const line = pick(rng, from);
  used.add(line);
  return { line, tail };
}

const COFFEE_WORDS = /(coffee|kaffee|café|cafe|kawa|flat white|latte|cappuccino|espresso|americano|cortado|macchiato|mocha|chai)/i;

function textVars(c: Ctx, rng: Rng, useRival: boolean, speaker: Speaker | undefined): Record<string, string> {
  const { p, scene } = c;
  const lang = langOfR(c.r);
  const place = PLACES[useRival ? "rival" : placeIdFor(p, c.r.template)]!;
  const cur = scene.currency;
  const lunch = c.r.template === "lunch_offer";
  const verdict = lunch && scene.price < p.usualSpend - 0.2 ? tr(VERDICTS.cheaper, lang) : tr(pick(rng, VERDICTS.other), lang);
  return {
    ...itemVars(scene.item),
    price: money(scene.price, cur, lang),
    old: money(scene.oldPrice, cur, lang),
    diff: difference(scene.price - scene.oldPrice, cur, lang),
    usual: money(p.usualSpend, cur, lang),
    alt_at: tr(place.at, lang),
    alt_to: tr(place.to, lang),
    Alt: ucFirst(tr(place.nom, lang)),
    Alt_at: ucFirst(tr(place.at, lang)),
    cafe: scene.cafe,
    contents: scene.contents,
    friend: tr(FRIEND[p.segment], lang),
    verdict,
    cheaper: tr(COFFEE_WORDS.test(scene.item) && !/filter/i.test(scene.item) ? CHEAPER.filter : CHEAPER.other, lang),
    speaker: speaker?.name ?? "",
  };
}

function render(t: Tx, lang: Lang, vars: Record<string, string>, p: Persona): string {
  return fillText(tr(t, lang), vars, p.gender ?? "f");
}

function withTail(text: string, p: Persona, lang: Lang, used: Set<Tx>, rng: Rng): string {
  const tails = SEGMENT_TAILS[p.segment].filter((t) => !used.has(t));
  if (!tails.length) return text;
  const t = pick(rng, tails);
  used.add(t);
  return `${text} ${tr(t, lang)}`;
}

function ruleReaction(r: Rehearsal, p: Persona, spec: RoundSpec, used: Set<Line>, usedTails: Set<Tx>, asked: Set<Tx>): Reaction {
  const lang = langOfR(r);
  const rng = rngFor(r.seed, "react", spec.n, p.id);
  const c = buildCtx(r, p, spec.n);
  const action = weightedPick(rng, spec.actions.map((a) => [a.id, weight(a.id, c)] as const));
  const useRival = c.ev.competitor && ELSEWHERE_ACTIONS.has(action) && (c.wentToRival || rng() < 0.8);
  const pol = polarityOf(action);
  const speaker = pol ? [...c.speakers].reverse().find((s) => s.pol === pol) : undefined;
  const conds = conditions(c, action, useRival, speaker);
  const vars = textVars(c, rng, useRival, speaker);
  const text = ACTION_TEXT[action];
  const before = new Set(c.hist.map((x) => x.thought));
  const th = chooseLine(rng, text?.thought, conds, used, { stale: (l) => before.has(cut(render(l.t, lang, vars, p), LIMITS.thought)) });
  let thought = th.line ? render(th.line.t, lang, vars, p) : tr(FALLBACK_THOUGHT, lang);
  if (th.tail || before.has(thought)) thought = withTail(thought, p, lang, usedTails, rng);
  thought = cut(thought, LIMITS.thought);
  const topic = th.line?.topic;
  const di = chooseLine(rng, text?.diary, conds, used, topic ? { topic } : {});
  const diary = di.line ? cut(render(di.line.t, lang, vars, p), LIMITS.diary) : undefined;
  const isPublic = !!spec.actions.find((a) => a.id === action)?.public;
  const sa = isPublic ? chooseLine(rng, text?.says, conds, used, topic ? { topic } : {}) : { tail: false };
  const saysPublicly = sa.line ? cut(render(sa.line.t, lang, vars, p), LIMITS.saysPublicly) : undefined;
  let questionForOwner: string | undefined;
  const askedBefore = r.reactions.some((x) => x.personaId === p.id && x.questionForOwner);
  const qChance = p.attitude === "sceptical" ? 0.45 : p.relationship === "new" ? 0.35 : 0.3;
  if (action !== "not_around" && !askedBefore && rng() < qChance) {
    const bank = QUESTIONS[r.template];
    const pool = rng() < 0.6 ? bank.bySegment[p.segment] ?? bank.general : bank.general;
    const fresh = pool.filter((q) => !asked.has(q));
    if (fresh.length) {
      const q = pick(rng, fresh);
      asked.add(q);
      questionForOwner = tr(q, lang);
    }
  }
  return {
    personaId: p.id,
    round: spec.n,
    action,
    thought,
    ...(saysPublicly ? { saysPublicly } : {}),
    ...(questionForOwner ? { questionForOwner } : {}),
    ...(diary ? { diary } : {}),
    method: "rule-based",
  };
}

/** Questions already asked in this rehearsal, as bank entries (so the stand-in does not repeat them). */
function askedQuestions(r: Rehearsal): Set<Tx> {
  const lang = langOfR(r);
  const texts = new Set(r.reactions.map((x) => x.questionForOwner).filter(Boolean));
  const bank = QUESTIONS[r.template];
  const all = [...bank.general, ...Object.values(bank.bySegment).flat()];
  return new Set(all.filter((q) => texts.has(tr(q, lang))));
}

/**
 * Deterministic stand-in for the model: reactions for every active persona still waiting in the
 * current round, from their traits (price sensitivity vs the price, channels → noticing, attitude,
 * earlier actions, word of mouth in the feed, injected events). Submit them with method "rule-based".
 * Within a round no two people think the same sentence; someone moved by another customer's words
 * names that person, which is how the summary draws who told whom.
 */
export function ruleBasedReactions(r: Rehearsal): Reaction[] {
  const spec = specOf(r, r.currentRound);
  if (r.status === "done" || !spec) return [];
  const used = new Set<Line>();
  const usedTails = new Set<Tx>();
  const asked = askedQuestions(r);
  return pending(r).map((p) => ruleReaction(r, p, spec, used, usedTails, asked));
}

/** Plays every remaining round with the rule-based stand-in (no model). */
export function autoplayRehearsal(r: Rehearsal): Rehearsal {
  let cur = r;
  for (let guard = 0; cur.status === "running" && guard < 20; guard++) {
    const out = submitRound(cur, ruleBasedReactions(cur), "rule-based");
    if (out.rehearsal.currentRound === cur.currentRound && out.rehearsal.status === cur.status) throw new Error(`Autoplay could not complete round ${cur.currentRound}: ${out.errors.map((e) => `${e.personaId}: ${e.error}`).join("; ")}`);
    cur = out.rehearsal;
  }
  return cur;
}

// ---------------------------------------------------------------- interviews

function interviewPrompt(r: Rehearsal, p: Persona, question: string): string {
  const s = sceneOf(r);
  const lang = langOfR(r);
  const lines = r.reactions
    .filter((x) => x.personaId === p.id)
    .sort((a, b) => a.round - b.round)
    .map((x) => {
      const spec = specOf(r, x.round);
      const title = spec ? spec.title : `Round ${x.round}`;
      if (x.action === "not_around") return `- Round ${x.round} (${title}): you were not around.`;
      const label = labelOf(r, x.round, x.action);
      return `- Round ${x.round} (${title}): you chose "${label}". You thought: "${x.thought}"${x.saysPublicly ? ` You said: "${x.saysPublicly}"` : ""}${x.diary ? ` Your diary: "${x.diary}"` : ""}`;
    });
  const stage = r.status === "done" ? "The rehearsal is over." : `The rehearsal has reached round ${r.currentRound} of ${r.rounds.length}.`;
  return [
    `You are playing ONE imagined customer of ${s.cafe}, a neighbourhood café in Berlin${r.kiez ? `-${r.kiez}` : ""}, in a "customer rehearsal". The owner tried out a change: ${r.change}. ${stage} The owner now has one question for you. Answer in character, honestly, from what you lived through below.`,
    languageLine(r, "your answer"),
    cardBlock(r, p),
    ["WHAT YOU DID AND THOUGHT", ...(lines.length ? lines : ["- You were not involved yet."])].join("\n"),
    `THE OWNER'S QUESTION\n"${question}"`,
    [
      "HOW TO ANSWER",
      `- Answer as this person would: plain, everyday ${BRIEF_LANGUAGE[lang]}, first person, your own reasons.`,
      "- You do NOT know the café's costs, margins or takings, and you do not guess them.",
      "- You are not trying to please the owner. If you would not care, say so; if you do not know, say that.",
      "- Stay consistent with what you did above.",
    ].join("\n"),
    [
      "REPLY WITH JSON ONLY",
      "Return exactly one JSON object and nothing else: no code fence, no text before or after it.",
      JSON.stringify({ personaId: p.id, answer: "<your answer, first person>" }),
      `- personaId: exactly "${p.id}".`,
      `- answer (required): at most ${LIMITS.answer} characters.`,
    ].join("\n"),
  ].join("\n\n");
}

function cleanQuestion(question: string): string {
  const q = typeof question === "string" ? norm(question) : "";
  if (!q) throw new Error('Ask the imagined customers one question, for example "What would make you come back next week?".');
  return cut(q, LIMITS.question);
}

/** Briefs to ask each imagined customer (or the given ones) one question after the run. */
export function interviewBriefs(r: Rehearsal, question: string, personaIds?: string[]): PersonaBrief[] {
  const q = cleanQuestion(question);
  let ps = r.personas;
  if (personaIds && personaIds.length && !(personaIds.length === 1 && String(personaIds[0]).toLowerCase() === "all")) {
    const found = personaIds.slice(0, 40).map((id) => ({ id, p: findPersona(r, id) }));
    const unknown = found.filter((x) => !x.p).map((x) => String(x.id).slice(0, 40));
    if (unknown.length) throw new Error(`Unknown persona id(s): ${unknown.join(", ")}. Use: ${personaList(r)}.`);
    const wanted = new Set(found.map((x) => x.p!.id));
    ps = r.personas.filter((p) => wanted.has(p.id));
  }
  return ps.map((p) => ({ personaId: p.id, name: p.name, round: r.currentRound, allowedActions: [], prompt: interviewPrompt(r, p, q) }));
}

/** Validates and records interview answers ({ personaId, answer }). A second answer from the same persona replaces the first. */
export function recordInterview(
  r: Rehearsal,
  question: string,
  answers: unknown[],
  method: ReactionMethod = "subagent",
): { rehearsal: Rehearsal; errors: { personaId: string; error: string }[] } {
  const q = cleanQuestion(question);
  const next = clone(r);
  const m: ReactionMethod = METHODS.includes(method) ? method : "subagent";
  const errors: { personaId: string; error: string }[] = [];
  const valid: { personaId: string; name: string; answer: string; method: ReactionMethod }[] = [];
  toList(answers).forEach((item, i) => {
    const raw = parseItem(item);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({ personaId: `item ${i + 1}`, error: 'Not a JSON object. Send {"personaId","answer"} per persona.' });
      return;
    }
    const o = raw as Record<string, unknown>;
    const pidRaw = o.personaId ?? o.persona_id ?? o.id;
    const p = findPersona(next, pidRaw);
    if (!p) {
      errors.push({ personaId: pidRaw === undefined ? `item ${i + 1}` : String(pidRaw).slice(0, 40), error: `Unknown personaId ${JSON.stringify(pidRaw === undefined || pidRaw === null ? null : String(pidRaw).slice(0, 40))}. Use one of: ${personaList(next)}.` });
      return;
    }
    const problems: string[] = [];
    const answer = fitText(o.answer, "answer", LIMITS.answer, problems);
    if (!answer) {
      errors.push({ personaId: p.id, error: problems.length ? problems.join(" ") : `Missing "answer": at most ${LIMITS.answer} characters, first person.` });
      return;
    }
    const at = valid.findIndex((v) => v.personaId === p.id);
    const entry = { personaId: p.id, name: p.name, answer, method: m };
    if (at >= 0) valid[at] = entry;
    else valid.push(entry);
  });
  if (valid.length) {
    let iv = next.interviews.find((x) => x.question.toLowerCase() === q.toLowerCase());
    if (!iv) {
      iv = { question: q, answers: [] };
      next.interviews.push(iv);
    }
    for (const v of valid) {
      const at = iv.answers.findIndex((x) => x.personaId === v.personaId);
      if (at >= 0) iv.answers[at] = v;
      else iv.answers.push(v);
    }
    const order = new Map(next.personas.map((p, i) => [p.id, i]));
    iv.answers.sort((a, b) => (order.get(a.personaId) ?? 0) - (order.get(b.personaId) ?? 0));
  }
  return { rehearsal: next, errors };
}

// ---------------------------------------------------------------- share / rebuild

/** The compact rehearsal part of a ShareState. Automatic "not around" reactions are left out (they are rebuilt). */
export function toShareRehearsal(r: Rehearsal): ShareRehearsal {
  return {
    seed: r.seed,
    personas: r.personas.length,
    rounds: r.rounds.length,
    events: r.events.map((e) => ({ beforeRound: e.beforeRound, text: e.text })),
    reactions: r.reactions.filter((x) => isActive(r, x.personaId, x.round)).map((x) => ({ ...x })),
    interviews: clone(r.interviews),
    ...(r.customerMix ? { customerMix: { ...r.customerMix } } : {}),
  };
}

/**
 * Rebuilds a rehearsal from its share state: startRehearsal with the same seed and sizes, then
 * replays events and reactions round by round. Invalid stored items are skipped; replay stops at
 * the first round that is not complete. Deterministic, so the summary matches the original.
 * Rebuilt in another language, the generated texts (people, rounds, Berlin events) follow the
 * analysis language, while the imagined customers' own words stay as they were written.
 */
export function rebuildRehearsal(a: Analysis, s: ShareRehearsal): Rehearsal {
  const r = startRehearsal(a, { seed: s.seed, personas: s.personas, rounds: s.rounds, ...(s.customerMix ? { customerMix: s.customerMix } : {}) });
  const events = (Array.isArray(s.events) ? s.events : []).filter(
    (e): e is { beforeRound: number; text: string } => !!e && typeof e.text === "string" && !!norm(e.text) && Number.isFinite(Number(e.beforeRound)),
  );
  const reactions = (Array.isArray(s.reactions) ? s.reactions : []).filter((x): x is Reaction => !!x && typeof x === "object");
  const used = new Set<number>();
  const addDue = (upTo: number) =>
    events.forEach((e, i) => {
      const br = Math.max(1, Math.round(Number(e.beforeRound)));
      if (used.has(i) || br > upTo || br > r.rounds.length) return;
      used.add(i);
      addEvent(r, Math.max(br, 1), e.text);
    });
  while (r.status === "running") {
    const k = r.currentRound;
    addDue(k);
    const mine = reactions.filter((x) => Number(x.round) === k && isActive(r, String(x.personaId), k));
    apply(r, mine, (o) => (METHODS.includes(o.method as ReactionMethod) ? (o.method as ReactionMethod) : "subagent"));
    advance(r);
    if (r.currentRound === k) break;
  }
  if (r.status === "running") addDue(r.rounds.length);
  r.interviews = (Array.isArray(s.interviews) ? s.interviews : []).flatMap((iv) => {
    if (!iv || typeof iv.question !== "string" || !norm(iv.question) || !Array.isArray(iv.answers)) return [];
    const answers = iv.answers.flatMap((x) => {
      const p = x && findPersona(r, x.personaId);
      if (!p || typeof x.answer !== "string" || !norm(x.answer)) return [];
      return [{ personaId: p.id, name: p.name, answer: cut(norm(x.answer), LIMITS.answer), method: METHODS.includes(x.method) ? x.method : ("subagent" as ReactionMethod) }];
    });
    return answers.length ? [{ question: cut(norm(iv.question), LIMITS.question), answers }] : [];
  });
  return r;
}

// ---------------------------------------------------------------- summary

function countPersonas(r: Rehearsal, test: (rs: Reaction[]) => boolean): number {
  return r.personas.filter((p) => test(r.reactions.filter((x) => x.personaId === p.id).sort((a, b) => a.round - b.round))).length;
}

/** Whether this person came back to the deal after a first try (lunch offer). */
function cameBackAfterTry(rs: Reaction[]): boolean {
  const first = rs.find((x) => GROUPS.lunchUsed.has(x.action));
  return !!first && rs.some((x) => x.round > first.round && GROUPS.lunchUsed.has(x.action));
}

function funnelFor(r: Rehearsal): RehearsalSummary["funnel"] {
  const of = r.personas.length;
  const lang = langOfR(r);
  const labels = FUNNEL[r.template].map((t) => tr(t, lang));
  const isPublic = (x: Reaction) => !!actionOf(r, x.round, x.action)?.public;
  if (r.template === "price_change") {
    return [
      { label: labels[0]!, count: countPersonas(r, (rs) => rs.some((x) => GROUPS.priceNoticed.has(x.action))), of },
      { label: labels[1]!, count: countPersonas(r, (rs) => rs.some((x) => x.action !== "not_around") && !rs.some((x) => GROUPS.priceReduced.has(x.action))), of },
      { label: labels[2]!, count: countPersonas(r, (rs) => rs.some((x) => GROUPS.priceReduced.has(x.action))), of },
      { label: labels[3]!, count: countPersonas(r, (rs) => rs.some(isPublic)), of },
    ];
  }
  return [
    { label: labels[0]!, count: countPersonas(r, (rs) => rs.some((x) => GROUPS.lunchNoticed.has(x.action))), of },
    { label: labels[1]!, count: countPersonas(r, (rs) => rs.some((x) => GROUPS.lunchUsed.has(x.action))), of },
    { label: labels[2]!, count: countPersonas(r, cameBackAfterTry), of },
    { label: labels[3]!, count: countPersonas(r, (rs) => rs.some(isPublic)), of },
  ];
}

function quotesFor(r: Rehearsal, order: Map<string, number>): RehearsalSummary["quotes"] {
  type Cand = { personaId: string; name: string; round: number; text: string; score: number };
  const cands: Cand[] = [];
  for (const x of r.reactions) {
    if (x.action === "not_around" || !isActive(r, x.personaId, x.round)) continue;
    const p = personaById(r, x.personaId);
    if (!p) continue;
    const model = x.method !== "rule-based" ? 0.5 : 0;
    const a = actionOf(r, x.round, x.action);
    if (x.saysPublicly) cands.push({ personaId: p.id, name: p.name, round: x.round, text: x.saysPublicly, score: 3 + model });
    const len = x.thought.length;
    cands.push({ personaId: p.id, name: p.name, round: x.round, text: x.thought, score: 1 + model + (a?.positive || a?.public ? 0.3 : 0) + (len >= 50 && len <= 200 ? 0.3 : 0) + x.round / 20 + (x.heardFrom ? 0.4 : 0) });
  }
  const byScore = cands.sort((a, b) => b.score - a.score || a.round - b.round || (order.get(a.personaId) ?? 0) - (order.get(b.personaId) ?? 0));
  const chosen: Cand[] = [];
  const texts = new Set<string>();
  for (const c of byScore) {
    if (chosen.length >= 6) break;
    if (chosen.some((x) => x.personaId === c.personaId) || texts.has(c.text)) continue;
    chosen.push(c);
    texts.add(c.text);
  }
  for (const c of byScore) {
    if (chosen.length >= 6) break;
    if (chosen.includes(c) || texts.has(c.text)) continue;
    chosen.push(c);
    texts.add(c.text);
  }
  return chosen
    .sort((a, b) => a.round - b.round || (order.get(a.personaId) ?? 0) - (order.get(b.personaId) ?? 0))
    .map(({ personaId, name, round, text }) => ({ personaId, name, round, text }));
}

function questionsFor(sorted: Reaction[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of sorted) {
    if (!x.questionForOwner) continue;
    const key = x.questionForOwner.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(x.questionForOwner);
  }
  return out;
}

/**
 * Who told whom, from the customers' own words: a link for every reaction whose `heardFrom`
 * names someone whose public words were in the feed that person saw (the model's own heardFrom,
 * or a name in the persona's thought, diary or public words). `text` is what the teller said.
 */
function linksFor(r: Rehearsal, sorted: Reaction[]): RehearsalSummary["links"] {
  const out: RehearsalSummary["links"] = [];
  for (const x of sorted) {
    if (!x.heardFrom || x.heardFrom === x.personaId || !isActive(r, x.personaId, x.round)) continue;
    if (out.some((l) => l.from === x.heardFrom && l.to === x.personaId)) continue;
    const said = speakersFor(r, x.personaId, x.round).filter((s) => s.id === x.heardFrom).pop();
    if (!said) continue;
    out.push({ from: x.heardFrom, to: x.personaId, round: x.round, text: said.text });
  }
  return out;
}

function checksFor(r: Rehearsal, funnel: RehearsalSummary["funnel"], questions: string[]): string[] {
  const s = sceneOf(r);
  const lang = langOfR(r);
  const C = CHECKS[lang];
  const count = (pred: (x: Reaction) => boolean) => new Set(r.reactions.filter(pred).map((x) => x.personaId)).size;
  const by = (ids: string[]) => (x: Reaction) => ids.includes(x.action);
  const out: string[] = [];
  const quoted = questions.slice(0, 2).map((q) => quote(q, lang));
  const iv = itemVars(s.item);
  const aItem = lang === "de" ? iv.einen_item! : lang === "es" ? iv.un_item! : lang === "pl" ? s.item : iv.a_item!;
  const price = money(s.price, s.currency, lang);
  const regulars = r.personas.filter((p) => p.relationship === "regular");
  if (r.template === "price_change") {
    const regReduced = regulars.filter((p) => r.reactions.some((x) => x.personaId === p.id && GROUPS.priceReduced.has(x.action))).length;
    out.push(C.watchItem(s.item));
    out.push(C.askRegularsPrice(price, aItem, regReduced, regulars.length));
    const grumbled = count(by(["grumbles", "tells_friend_it_is_pricey", "mentions_price_in_review"]));
    if (grumbled) out.push(C.staffPriceNotes(grumbled));
    const switched = count(by(["switches_to_cheaper_item"]));
    if (switched) out.push(C.trackCheaper(s.item, switched));
    const away = count((x) => GROUPS.priceElsewhere.has(x.action));
    if (away) out.push(C.checkRivals(aItem, away));
    if (quoted.length) out.push(C.friendlyAnswer(quoted));
    out.push(C.compareWeekly(s.item));
  } else {
    const regTried = regulars.filter((p) => r.reactions.some((x) => x.personaId === p.id && GROUPS.lunchUsed.has(x.action))).length;
    out.push(C.askRegularsSwitch(regTried, regulars.length));
    const noticed = funnel[0]?.count ?? 0;
    if (noticed * 2 < r.personas.length) out.push(C.countPassersby());
    else {
      const tally = new Map<string, number>();
      for (const p of r.personas) {
        if (!r.reactions.some((x) => x.personaId === p.id && GROUPS.lunchNoticed.has(x.action))) continue;
        for (const ch of p.channels) tally.set(ch, (tally.get(ch) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      out.push(C.askHowHeard(top ? channelPhrase(top, lang) : undefined));
    }
    const tried = funnel[1]?.count ?? 0;
    const back = funnel[2]?.count ?? 0;
    if (tried) out.push(C.weekTwo(tried, back));
    const elsewhere = r.personas.filter((p) => r.reactions.some((x) => x.personaId === p.id && ["eats_elsewhere", "skips_lunch_out", "back_to_old_habits"].includes(x.action)));
    if (elsewhere.length) {
      const competitor = eventMods(r, r.rounds.length).competitor;
      const ids = [...new Set([...(competitor ? (["rival"] as const) : []), ...elsewhere.map((p) => placeIdFor(p, r.template))])].slice(0, 2);
      out.push(C.checkPlaces(ids.map((id) => tr(PLACES[id]!.nom, lang)), elsewhere.length));
    }
    if (quoted.length) out.push(C.listen(quoted));
    if (count(by(["complains"]))) out.push(C.staffQueue());
    out.push(C.writeDown());
  }
  return out.slice(0, 5);
}

/** The sentence saying the mix of people is a rough guess (for the Kiez, the owner's mix, or a neighbourhood café). */
function mixNoteFor(r: Rehearsal): string {
  const lang = langOfR(r);
  if (r.customerMix) return tr(MIX_NOTE.custom, lang);
  if (r.kiez) return fillText(tr(MIX_NOTE.kiez, lang), { kiez: r.kiez });
  return tr(MIX_NOTE.berlin, lang);
}

/** Everything the report and the coach need: descriptive counts of imagined people, quotes, questions, links, and what to check for real. */
export function summarize(r: Rehearsal): RehearsalSummary {
  const order = new Map(r.personas.map((p, i) => [p.id, i]));
  const sorted = r.reactions.slice().sort((a, b) => a.round - b.round || (order.get(a.personaId) ?? 0) - (order.get(b.personaId) ?? 0));
  const completed = r.rounds.filter((s) => s.n < r.currentRound);
  const modelMethods = new Set(sorted.filter((x) => isActive(r, x.personaId, x.round)).map((x) => x.method));
  const method: RehearsalSummary["method"] = modelMethods.size === 0 ? "rule-based" : modelMethods.size === 1 ? [...modelMethods][0]! : "mixed";
  const funnel = funnelFor(r);
  const questionsForOwner = questionsFor(sorted);
  const lang = langOfR(r);
  const mixNote = mixNoteFor(r);
  return {
    id: r.id,
    analysisId: r.analysisId,
    business: r.business,
    question: r.question,
    change: r.change,
    status: r.status,
    method,
    personas: clone(r.personas),
    rounds: clone(r.rounds),
    grid: sorted.map((x) => {
      const a = actionOf(r, x.round, x.action);
      return { personaId: x.personaId, round: x.round, action: x.action, actionLabel: labelOf(r, x.round, x.action), positive: !!a?.positive, thought: x.thought, kind: actionKind(x.action) };
    }),
    perRound: completed.map((s) => ({
      round: s.n,
      title: s.title,
      counts: s.actions.map((a) => ({ action: a.id, label: a.label, count: sorted.filter((x) => x.round === s.n && x.action === a.id).length })),
    })),
    funnel,
    quotes: quotesFor(r, order),
    questionsForOwner,
    feed: clone(r.feed),
    events: clone(r.events),
    links: linksFor(r, sorted),
    uptake: completed.map((s) => ({
      round: s.n,
      engaged: sorted.filter((x) => x.round === s.n && isActive(r, x.personaId, s.n) && !!actionOf(r, s.n, x.action)?.positive).length,
      active: (r.active[s.n] ?? []).length,
    })),
    uptakeLabel: tr(UPTAKE_LABEL[r.template], lang),
    interviews: clone(r.interviews),
    checkWithRealCustomers: checksFor(r, funnel, questionsForOwner),
    caveat: caveatFor(method, lang, mixNote),
    lang,
    ...(r.kiez ? { kiez: r.kiez } : {}),
    mixNote,
  };
}

// ---------------------------------------------------------------- story beats (landing teaser, report strip)

export interface StoryBeat {
  kind: "noticed" | "tried" | "cameBack" | "kept" | "boughtLess" | "told" | "heardFrom" | "sceptic";
  round: number;
  personaId: string;
  name: string;
  /** A short line in the rehearsal language ("Elif tried it", "Jonas heard it from Elif"). */
  text: string;
  /** What they thought (or, for heardFrom, what the teller said). */
  quote: string;
}

export interface RehearsalTeaser {
  people: { id: string; name: string; initial: string; segmentLabel: string; attitude: Persona["attitude"] }[];
  funnel: RehearsalSummary["funnel"];
  beats: StoryBeat[];
  links: (RehearsalSummary["links"][number] & { fromName: string; toName: string })[];
  caveat: string;
}

/**
 * The few moments that tell the rehearsal's story (first to notice, first to try, first to come
 * back, first to tell someone, who heard it from whom, who stayed sceptical), taken from a summary.
 * The site builds its landing teaser from the same demo summary as the report, so they always match.
 */
export function storyBeats(s: RehearsalSummary): StoryBeat[] {
  const lang: Lang = s.lang ?? "en";
  const nameOf = (id: string) => s.personas.find((p) => p.id === id)?.name ?? id;
  const grid = s.grid.filter((g) => g.action !== "not_around");
  type Cell = RehearsalSummary["grid"][number];
  const featured = new Set<string>();
  /** The first matching cell, preferring someone not yet in the story. */
  const first = (pred: (g: Cell) => boolean): Cell | undefined => {
    const all = grid.filter(pred);
    return all.find((g) => !featured.has(g.personaId)) ?? all[0];
  };
  const out: StoryBeat[] = [];
  const add = (kind: StoryBeat["kind"], cell: Cell | undefined) => {
    if (!cell) return;
    featured.add(cell.personaId);
    out.push({ kind, round: cell.round, personaId: cell.personaId, name: nameOf(cell.personaId), text: fillText(tr(BEATS[kind], lang), { name: nameOf(cell.personaId) }), quote: cell.thought });
  };
  const isPublic = (g: Cell) => !!s.rounds.find((r) => r.n === g.round)?.actions.find((a) => a.id === g.action)?.public;
  const lunch = s.rounds.some((r) => r.actions.some((a) => a.id === "notices_offer" || a.id === "tries_deal"));
  // The sceptic first, so the other beats go to other people where possible.
  const scepticCell = (() => {
    const neg = (g: Cell) => GROUPS.negative.has(g.action) || g.kind === "elsewhere";
    const p = s.personas.find((x) => x.attitude === "sceptical" && grid.some((g) => g.personaId === x.id && neg(g)));
    return p ? grid.filter((g) => g.personaId === p.id && neg(g)).pop() : undefined;
  })();
  if (scepticCell) featured.add(scepticCell.personaId);
  if (lunch) {
    const back = s.personas
      .map((p) => {
        const rs = grid.filter((g) => g.personaId === p.id);
        const f = rs.find((g) => GROUPS.lunchUsed.has(g.action));
        return f ? rs.find((g) => g.round > f.round && GROUPS.lunchUsed.has(g.action)) : undefined;
      })
      .filter((g): g is Cell => !!g)
      .sort((a, b) => a.round - b.round)[0];
    const triedBy = back ? grid.find((g) => g.personaId === back.personaId && GROUPS.lunchUsed.has(g.action)) : undefined;
    add("noticed", first((g) => g.action === "notices_offer"));
    add("tried", triedBy ?? first((g) => GROUPS.lunchUsed.has(g.action)));
    add("cameBack", back);
  } else {
    add("noticed", first((g) => GROUPS.noticeOnly.has(g.action) || g.action === "grumbles"));
    add("kept", first((g) => ["keeps_buying", "stays_a_customer", "still_buys_regularly"].includes(g.action)));
    add("boughtLess", first((g) => GROUPS.priceReduced.has(g.action)));
  }
  add("told", first((g) => isPublic(g) && !!ACTIONS[g.action]?.positive) ?? first(isPublic));
  const link = s.links[0];
  if (link) {
    out.push({
      kind: "heardFrom",
      round: link.round,
      personaId: link.to,
      name: nameOf(link.to),
      text: fillText(tr(BEATS.heardFrom, lang), { to: nameOf(link.to), from: nameOf(link.from) }),
      quote: link.text ?? "",
    });
  }
  if (scepticCell) {
    featured.delete(scepticCell.personaId);
    add("sceptic", scepticCell);
  }
  return out.sort((a, b) => a.round - b.round);
}

/** Everything a landing-page teaser needs, from the same summary the report draws. */
export function rehearsalTeaser(s: RehearsalSummary): RehearsalTeaser {
  const nameOf = (id: string) => s.personas.find((p) => p.id === id)?.name ?? id;
  return {
    people: s.personas.map((p) => ({ id: p.id, name: p.name, initial: p.name.charAt(0), segmentLabel: p.segmentLabel, attitude: p.attitude })),
    funnel: s.funnel,
    beats: storyBeats(s),
    links: s.links.map((l) => ({ ...l, fromName: nameOf(l.from), toName: nameOf(l.to) })),
    caveat: s.caveat,
  };
}

/** Re-exported for callers that only import the rehearsal module. */
export { actionKind, normaliseKiez };
export type { ActionKind, TemplateId };
