/**
 * The customer rehearsal state machine.
 *
 *   startRehearsal → (roundBriefs → model or ruleBasedReactions → submitRound)× rounds → summarize
 *                  ↘ injectEvent before any round        ↘ interviewBriefs / recordInterview after the run
 *
 * Everything is deterministic for (analysis, options, submitted reactions), so the
 * stateless MCP server and the website rebuild the same rehearsal from a share
 * token with rebuildRehearsal(). Nothing here touches the money maths.
 */
import type { Analysis } from "../engine/types.ts";
import type { ShareState } from "../state.ts";
import type {
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
import { CHANNEL_PHRASE, WORD_OF_MOUTH_CHANNELS, cleanMix, generatePersonas, placeAlternative, withArticle } from "./personas.ts";
import {
  ACTIONS,
  ACTION_TEXT,
  AWAY,
  type Cond,
  FEED_KIND,
  FRIEND,
  GROUPS,
  type Line,
  QUESTIONS,
  buildRounds,
  changeContext,
  difference,
  fill,
  money,
} from "./rounds.ts";

// ---------------------------------------------------------------- constants

/** Character limits for model-written text. Up to 1.5× the limit is trimmed at a word; beyond that it is rejected. */
export const LIMITS = { thought: 240, saysPublicly: 160, questionForOwner: 160, diary: 140, answer: 300, event: 280, question: 300 } as const;
const SLACK = 1.5;

export const CAVEAT =
  "These are imagined customers played by an AI from short descriptions. They show reactions worth checking, not what will happen. Nothing here is counted in the money maths.";

const METHODS: ReactionMethod[] = ["subagent", "in-context", "rule-based"];

export interface StartOptions {
  /** 4–12, default 6. */
  personas?: number;
  /** 3–5, default 4. */
  rounds?: number;
  seed?: number;
  /** An event that applies before round 1 ("It rains all week"). */
  event?: string;
  customerMix?: Partial<Record<SegmentId, number>>;
}

/** The rehearsal part of a ShareState, plus the optional customer mix needed to rebuild the same personas. */
export type ShareRehearsal = NonNullable<ShareState["rehearsal"]> & { customerMix?: Partial<Record<SegmentId, number>> };

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
  return s.replace(/\s+/g, " ").trim();
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
  const s = norm(v);
  if (!s) return undefined;
  if (s.length <= limit) return s;
  if (s.length <= Math.floor(limit * SLACK)) return cut(s, limit);
  problems.push(`"${field}" is ${s.length} characters; keep it to ${limit} or fewer.`);
  return undefined;
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
  const s = String(raw).trim().toLowerCase();
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
  return s.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z_]/g, "");
}

// ---------------------------------------------------------------- start

function drawActive(personas: Persona[], rounds: number, seed: number): Record<number, string[]> {
  const rng = rngFor(seed, "active");
  const need = Math.ceil(personas.length / 2);
  const out: Record<number, string[]> = {};
  for (let k = 1; k <= rounds; k++) {
    const on = new Set<string>();
    for (const p of personas) if (rng() < p.activityLevel) on.add(p.id);
    if (on.size < need) {
      const rest = personas.filter((p) => !on.has(p.id)).sort((x, y) => y.activityLevel - x.activityLevel);
      for (const p of rest) {
        if (on.size >= need) break;
        on.add(p.id);
      }
    }
    out[k] = personas.filter((p) => on.has(p.id)).map((p) => p.id);
  }
  return out;
}

/** People who are not around this round get an automatic "not around" (no model call). */
function recordAbsent(r: Rehearsal, round: number): void {
  for (const p of r.personas) {
    if (isActive(r, p.id, round) || reactionFor(r, p.id, round)) continue;
    r.reactions.push({ personaId: p.id, round, action: "not_around", thought: AWAY[p.segment] ?? "I wasn't around this time.", method: "rule-based" });
  }
}

/**
 * Starts a rehearsal: personas, rounds, who is around each round, and the café's own post in the feed.
 * Deterministic for (analysis, opts). The default seed is a hash of the analysis id.
 */
export function startRehearsal(a: Analysis, opts: StartOptions = {}): Rehearsal {
  const n = clampInt(opts.personas, 4, 12, 6);
  const roundCount = clampInt(opts.rounds, 3, 5, 4);
  const seed = typeof opts.seed === "number" && Number.isFinite(opts.seed) ? normaliseSeed(opts.seed) : hashString(a.id);
  const mix = cleanMix(opts.customerMix) ?? undefined;
  const ctx = changeContext(a);
  const personas = generatePersonas(
    { template: a.template, cafe: ctx.cafe, currency: ctx.currency, baseSpend: ctx.baseSpend, ...(a.template === "price_change" ? { item: ctx.item } : {}) },
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
    id: `rh_${hashString([a.id, seed, n, roundCount, JSON.stringify(mix ?? {})].join("|")).toString(36)}`,
    analysisId: a.id,
    template: a.template,
    business: a.business,
    question: a.question,
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
  const spend = r.template === "lunch_offer" ? `about ${money(p.usualSpend, s.currency)} on lunch` : `about ${money(p.usualSpend, s.currency)} per visit`;
  const channels = p.channels.map((c) => CHANNEL_PHRASE[c] ?? c);
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
    const label = actionOf(r, s.n, x.action)?.label ?? x.action;
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
    "- Write in plain, everyday English, in your own voice.",
  ].join("\n");
}

function jsonBlock(p: Persona, spec: RoundSpec): string {
  const ids = spec.actions.map((a) => a.id);
  const publicIds = spec.actions.filter((a) => a.public).map((a) => a.id);
  const example: Record<string, string | number> = { personaId: p.id, round: spec.n, action: "<one action id>", thought: "<why, in first person>" };
  if (publicIds.length) example.saysPublicly = `<only if action is ${publicIds.join(" or ")}>`;
  example.questionForOwner = "<optional>";
  example.diary = "<one sentence you will remember>";
  const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs.join(""));
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
    `- diary (required): one sentence you will remember next time, at most ${LIMITS.diary} characters.`,
  ].join("\n");
}

function briefPrompt(r: Rehearsal, p: Persona, spec: RoundSpec): string {
  const s = sceneOf(r);
  const diary = diaryLines(r, p, spec.n);
  return [
    `You are playing ONE imagined customer in a "customer rehearsal" for ${s.cafe}, a neighbourhood café. The owner is thinking about a change and wants to see, before spending money, how different kinds of customers might react. You are not real data: you are one plausible person. React the way this person really would. This is round ${spec.n} of ${r.rounds.length}.`,
    cardBlock(r, p),
    ["YOUR DIARY SO FAR", ...(diary.length ? diary : ["- Nothing yet: this is the first round."])].join("\n"),
    feedBlock(r, p, spec.n),
    `THIS ROUND: ${spec.title}\n${spec.situation}`,
    ["CHOOSE EXACTLY ONE ACTION (use its id)", ...spec.actions.map((a) => `- ${a.id}: ${a.label}${a.public ? " (public: others will hear about it)" : ""}`)].join("\n"),
    realismBlock(r),
    jsonBlock(p, spec),
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
    r.feed.push({ round: x.round, personaId: x.personaId, name: p?.name ?? x.personaId, text: x.saysPublicly ?? `${a.label}.`, kind: FEED_KIND[x.action] ?? "word_of_mouth" });
    sortFeed(r);
  }
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
      errors.push({ personaId: pidRaw === undefined ? fallbackId : String(pidRaw), error: `Unknown personaId ${JSON.stringify(pidRaw ?? null)}. Use one of: ${personaList(r)}.` });
      return;
    }
    if (!spec || r.status === "done") {
      errors.push({ personaId: p.id, error: "The rehearsal is finished; nothing more to submit." });
      return;
    }
    if (o.round !== undefined && o.round !== null && o.round !== "" && Number(o.round) !== k) {
      errors.push({ personaId: p.id, error: `This reaction is for round ${String(o.round)}, but the rehearsal is waiting for round ${k}.` });
      return;
    }
    if (!isActive(r, p.id, k)) {
      errors.push({ personaId: p.id, error: `${p.name} (${p.id}) is not around in round ${k}; that was recorded automatically as not_around. Do not send a reaction for ${p.id} this round.` });
      return;
    }
    const problems: string[] = [];
    const actRaw = typeof o.action === "string" ? o.action : "";
    const wanted = normAction(actRaw);
    const action = wanted
      ? spec.actions.find((a) => a.id === wanted) ?? spec.actions.find((a) => normAction(a.label) === wanted)
      : undefined;
    if (!actRaw.trim()) problems.push(`Missing "action". Choose one of: ${spec.actions.map((a) => a.id).join(", ")}.`);
    else if (!action) problems.push(`Action "${actRaw}" is not allowed in round ${k}. Choose one of: ${spec.actions.map((a) => a.id).join(", ")}.`);
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
    const x: Omit<Reaction, "method"> = {
      personaId: p.id,
      round: k,
      action: action.id,
      thought,
      ...(saysPublicly ? { saysPublicly } : {}),
      ...(questionForOwner ? { questionForOwner } : {}),
      diary,
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
 * non-public action is dropped; a missing diary is taken from the thought.
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

function addEvent(r: Rehearsal, beforeRound: number, text: string): void {
  r.events.push({ beforeRound, text });
  r.feed.push({ round: beforeRound, name: "In the neighbourhood", text, kind: "event" });
  sortFeed(r);
}

/**
 * Records an owner-injected change ("rain all week", "the café opposite starts an €8.50 lunch").
 * It applies before the next round: the current round if nobody has reacted in it yet, otherwise the one after.
 */
export function injectEvent(r: Rehearsal, text: string): Rehearsal {
  const t = typeof text === "string" ? norm(text) : "";
  if (!t) throw new Error('Describe the event in a sentence, for example "It rains all week" or "The café opposite starts an €8.50 lunch".');
  if (r.status === "done") throw new Error("This rehearsal has finished, so there is no next round for the event. Start a new rehearsal with the event instead.");
  const started = r.reactions.some((x) => x.round === r.currentRound && isActive(r, x.personaId, x.round));
  const beforeRound = started ? r.currentRound + 1 : r.currentRound;
  if (beforeRound > r.rounds.length) throw new Error("The last round is already under way, so the event would never be seen. Start a new rehearsal with the event instead.");
  const next = clone(r);
  addEvent(next, beforeRound, cut(t, LIMITS.event));
  return next;
}

// ---------------------------------------------------------------- rule-based stand-in

interface EventMods {
  rain: boolean;
  competitor: boolean;
  buzz: boolean;
  busy: boolean;
  quiet: boolean;
}

function eventMods(r: Rehearsal, round: number): EventMods {
  const t = r.events.filter((e) => e.beforeRound <= round).map((e) => e.text.toLowerCase()).join(" \n ");
  return {
    rain: /\b(rain|rains|rainy|raining|storm|snow|downpour|drizzle|freezing|cold snap)\b/.test(t),
    competitor:
      /(opposite|across the (road|street)|next door|new caf|competitor|rival|cheaper|discount|chain|opens|opening|bakery|döner|doner)/.test(t) &&
      /(lunch|deal|offer|price|€|\$|£|cheap|coffee|menu|open)/.test(t),
    buzz: /(instagram|influencer|blog|newspaper|article|tiktok|featured|press|radio|\btv\b|went viral|recommend)/.test(t),
    busy: /(festival|market|fair|street party|\bfest\b|tourists|concert|marathon|sunny|sunshine|heat ?wave)/.test(t),
    quiet: /(construction|roadworks|road works|baustelle|scaffold|closed|strike|detour|diversion|school holiday|summer holiday|ferien|working from home|home office)/.test(t),
  };
}

const SENS_W: Record<Persona["priceSensitivity"], number> = { low: 0.25, medium: 0.6, high: 1 };
const SENS_MULT: Record<Persona["priceSensitivity"], number> = { low: 0.6, medium: 2, high: 4 };
const CONVENIENCE: Record<SegmentId, number> = { office_worker: 0.15, trades: 0.15, tourist: 0.1, freelancer: 0.05, parent: 0.05, regular: 0.05, student: 0, retiree: 0 };

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
  grumbled: boolean;
  accepted: boolean;
  heardPos: number;
  heardNeg: number;
  noticeP: number;
  /** Lunch: how good the deal looks to them (−1…1). */
  value: number;
  /** Price change: how much the change bothers them (−1…1). */
  pain: number;
  gShare: number;
  has: (c: string) => boolean;
}

function buildCtx(r: Rehearsal, p: Persona, k: number): Ctx {
  const scene = sceneOf(r);
  const ev = eventMods(r, k);
  const hist = r.reactions.filter((x) => x.personaId === p.id && x.round < k).sort((a, b) => a.round - b.round);
  const did = (set: ReadonlySet<string>) => hist.some((x) => set.has(x.action));
  const has = (c: string) => p.channels.includes(c);
  const lunch = r.template === "lunch_offer";
  const firstTry = hist.find((x) => GROUPS.lunchTried.has(x.action));
  const triedRound = firstTry ? firstTry.round : 0;
  const tried = !!firstTry;
  const cameBack = tried && hist.some((x) => x.round > triedRound && GROUPS.lunchReturn.has(x.action));
  let heardPos = 0, heardNeg = 0;
  for (const f of visibleFeed(r, k)) {
    if (!f.personaId || f.personaId === p.id) continue;
    const src = reactionFor(r, f.personaId, f.round);
    if (!src) continue;
    if (ACTIONS[src.action]?.positive) heardPos++;
    else heardNeg++;
  }
  const sens = SENS_W[p.priceSensitivity];
  let noticeP: number;
  let value = 0, pain = 0;
  if (lunch) {
    noticeP = 0.15;
    if (has("walks past")) noticeP += 0.25;
    if (has("the board outside")) noticeP += 0.3;
    if (has("Instagram")) noticeP += scene.promoted ? 0.2 : 0.1;
    if (has("Google Maps")) noticeP += 0.05;
    if (has("the staff")) noticeP += 0.2;
    if (heardPos + heardNeg > 0 && WORD_OF_MOUTH_CHANNELS.some(has)) noticeP += 0.2;
    noticeP += p.relationship === "regular" ? 0.25 : p.relationship === "occasional" ? 0.1 : 0;
    if (ev.buzz) noticeP += 0.2;
    if (ev.busy) noticeP += 0.1;
    if (ev.rain) noticeP -= 0.15;
    if (ev.quiet) noticeP -= 0.15;
    noticeP = clamp(noticeP, 0.08, 0.95);
    const saving = p.usualSpend > 0 ? (p.usualSpend - scene.price) / p.usualSpend : 0;
    value = saving * sens + CONVENIENCE[p.segment] + (p.attitude === "fan" ? 0.1 : p.attitude === "sceptical" ? -0.15 : 0) - (ev.competitor ? 0.25 * sens : 0) + (ev.buzz ? 0.05 : 0);
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
    grumbled: hist.some((x) => x.action === "grumbles"),
    accepted: hist.some((x) => x.action === "accepts"),
    heardPos, heardNeg, noticeP, value, pain, gShare, has,
  };
}

function rel(p: Persona, regular: number, occasional: number, newcomer: number): number {
  return p.relationship === "regular" ? regular : p.relationship === "occasional" ? occasional : newcomer;
}

function att(p: Persona, fan: number, neutral: number, sceptic: number): number {
  return p.attitude === "fan" ? fan : p.attitude === "neutral" ? neutral : sceptic;
}

/** How likely this person is to take this action now (unnormalised). */
function weight(id: string, c: Ctx): number {
  const { p, ev } = c;
  const sens = SENS_W[p.priceSensitivity];
  const sceptic = p.attitude === "sceptical", fan = p.attitude === "fan", regular = p.relationship === "regular";
  const heard = Math.min(1, c.heardPos);
  const pain = Math.max(0, c.pain);
  switch (id) {
    case "not_around":
      return p.segment === "tourist" && c.k >= 3 ? 0.5 + 0.2 * (c.k - 3) : 0;
    // lunch offer
    case "notices_offer":
      return c.noticeP;
    case "ignores":
      return 1 - c.noticeP;
    case "tries_deal":
      // Someone who missed the board on launch day still sees it when they come by at lunchtime.
      return (c.noticed || c.heardPos > 0 ? 1 : 0.5) * clamp(0.25 + c.value * 1.2, 0.03, 1.2);
    case "usual_order":
      return rel(p, 0.9, 0.45, 0.1) * (p.priceSensitivity === "low" ? 1.3 : 1);
    case "eats_elsewhere":
      return (
        (0.25 + (sceptic ? 0.3 : 0) + (p.relationship === "new" ? 0.15 : 0) + (ev.competitor ? 0.5 * sens : 0) + (!c.tried && c.k >= 3 ? 0.1 : 0)) *
        rel(p, 0.4, 1, 1.1) *
        (fan ? 0.6 : 1)
      );
    case "skips_lunch_out":
      return ({ low: 0.05, medium: 0.15, high: 0.45 } as const)[p.priceSensitivity] + (ev.rain ? 0.25 : 0) + (["student", "retiree", "parent", "freelancer"].includes(p.segment) ? 0.15 : 0);
    case "comes_back_for_deal":
      return c.tried ? clamp(0.35 + c.value * 1.5, 0.05, 1.2) : (c.noticed ? 0.2 : 0.08) + 0.2 * heard;
    case "back_to_usual":
      return c.tried ? 0.35 + (regular ? 0.3 : 0) : rel(p, 0.8, 0.4, 0.1);
    case "tells_a_friend":
      return c.tried ? 0.25 * att(p, 1.6, 1, 0.6) * (WORD_OF_MOUTH_CHANNELS.some(c.has) ? 1.4 : 1) : 0.03;
    case "keeps_coming":
      return c.tried ? clamp(0.3 + c.value * 1.4 + (c.cameBack ? 0.3 : 0), 0.05, 1.3) : rel(p, 0.7, 0.15, 0.05) + 0.25 * heard;
    case "posts_review":
      return c.tried ? 0.15 * (c.has("Google Maps") || c.has("Instagram") ? 2 : 1) * att(p, 1.3, 1, 1.2) : 0.02;
    case "complains":
      return (sceptic ? 0.3 : 0.03) + (regular && !c.tried ? 0.12 : 0) + (c.tried && c.value < 0 ? 0.15 : 0);
    case "forgets_about_it":
      return c.tried ? 0.15 : Math.max(0.1, 0.7 - (regular ? 0.3 : 0));
    case "still_comes_for_lunch":
      return c.cameBack ? 0.8 : c.tried ? 0.35 : rel(p, 0.6, 0.15, 0.05);
    case "comes_now_and_then":
      return c.tried ? 0.45 : 0.1 + 0.1 * heard;
    case "back_to_old_habits":
      return c.tried ? 0.3 : 0.8;
    case "recommends_it":
      return c.tried ? (fan ? 0.3 : 0.12) : 0.02;
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
      return pain * 0.6 * (c.grumbled ? 1.5 : 1);
    case "switches_to_cheaper_item":
      return pain * 0.45 * (p.segment === "student" || p.segment === "freelancer" ? 1.4 : 1);
    case "goes_elsewhere":
      return pain * 0.3 * (sceptic ? 1.8 : 1) + (ev.competitor ? 0.4 * sens : 0) + 0.05 * Math.min(2, c.heardNeg);
    case "keeps_buying":
      return !c.reduced ? clamp(1 - pain * 1.5, 0.15, 1) : 0.25;
    case "tells_friend_it_is_pricey":
      return c.grumbled || c.reduced ? 0.2 + pain : 0.03;
    case "forgot_about_it":
      return !c.noticed ? 0.8 : c.accepted ? 0.4 : 0.1;
    case "stays_away":
      return c.elsewhere ? 0.7 : c.reduced ? 0.2 + (ev.competitor ? 0.3 : 0) : 0.02 + (ev.competitor ? 0.3 * sens : 0);
    case "stays_a_customer":
      return !c.reduced ? clamp(1 - pain, 0.2, 1) : 0.3;
    case "buys_less_than_before":
      return c.reduced ? 0.45 : pain * 0.25;
    case "recommends_cafe_anyway":
      return (fan ? 0.25 : 0.05) + (!c.reduced ? 0.05 : 0);
    case "mentions_price_in_review":
      return ((sceptic ? 0.15 : 0.03) + (c.has("Google Maps") ? 0.1 : 0)) * (c.grumbled || c.reduced ? 2 : 1);
    case "still_buys_regularly":
      return !c.reduced ? 0.9 : 0.25;
    case "buys_now_and_then":
      return c.reduced ? 0.5 : 0.1;
    case "found_somewhere_cheaper":
      return c.elsewhere ? 0.7 : (ev.competitor ? 0.25 * sens : 0) + 0.03 + pain * 0.3;
    case "recommends_cafe":
      return fan ? 0.25 : 0.04;
    default:
      return 0.1;
  }
}

function conditions(c: Ctx): Set<Cond> {
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
  if (c.heardPos + c.heardNeg > 0) s.add("heard");
  if (c.grumbled) s.add("grumbled");
  if (ev.rain) s.add("rain");
  if (ev.competitor) s.add("competitor");
  if (ev.buzz) s.add("buzz");
  if (ev.busy) s.add("busy");
  if (ev.quiet) s.add("quiet");
  if (!lunch && scene.price < scene.oldPrice) s.add("drop");
  if (!lunch && scene.price > scene.oldPrice) s.add("rise");
  return s;
}

/**
 * Prefers a line written for this person's situation; falls back to a line that fits anyone.
 * Lines already used this round (in `avoid`) are skipped while others remain, so people don't all say the same thing.
 */
function chooseLine(rng: Rng, lines: Line[] | undefined, conds: Set<Cond>, avoid?: Set<string>): string | undefined {
  if (!lines || !lines.length) return undefined;
  const fresh = (ls: Line[]) => {
    const f = avoid ? ls.filter((l) => !avoid.has(l.t)) : ls;
    return f.length ? f : ls;
  };
  const specific = fresh(lines.filter((l) => l.when && l.when.every((w) => conds.has(w))));
  const generic = fresh(lines.filter((l) => !l.when));
  let t: string;
  if (specific.length && (!generic.length || rng() < 0.75)) t = pick(rng, specific).t;
  else if (generic.length) t = pick(rng, generic).t;
  else t = lines[0]!.t;
  avoid?.add(t);
  return t;
}

const COFFEE_WORDS = /(coffee|flat white|latte|cappuccino|espresso|americano|cortado|macchiato|mocha|chai)/i;

function textVars(c: Ctx, rng: Rng): Record<string, string> {
  const { p, scene } = c;
  const alt = placeAlternative(p);
  const item = scene.item;
  return {
    price: money(scene.price, scene.currency),
    old: money(scene.oldPrice, scene.currency),
    diff: difference(scene.price - scene.oldPrice, scene.currency),
    usual: money(p.usualSpend, scene.currency),
    alt,
    Alt: alt.charAt(0).toUpperCase() + alt.slice(1),
    cafe: scene.cafe,
    contents: scene.contents,
    item,
    Item: item.charAt(0).toUpperCase() + item.slice(1),
    a_item: withArticle(item),
    friend: FRIEND[p.segment] ?? "a friend",
    verdict: scene.price < p.usualSpend - 0.2 ? "good value" : pick(rng, ["decent", "good soup, small sandwich", "fine, nothing special"]),
    cheaper: COFFEE_WORDS.test(item) && !/filter/i.test(item) ? "a filter coffee" : "something cheaper",
  };
}

function ruleReaction(r: Rehearsal, p: Persona, spec: RoundSpec, used: Set<string>): Reaction {
  const rng = rngFor(r.seed, "react", spec.n, p.id);
  const c = buildCtx(r, p, spec.n);
  const action = weightedPick(rng, spec.actions.map((a) => [a.id, weight(a.id, c)] as const));
  const conds = conditions(c);
  const vars = textVars(c, rng);
  const text = ACTION_TEXT[action];
  const thought = cut(fill(chooseLine(rng, text?.thought, conds, used) ?? "No strong feelings either way.", vars), LIMITS.thought);
  const diaryLine = chooseLine(rng, text?.diary, conds, used);
  const diary = diaryLine ? cut(fill(diaryLine, vars), LIMITS.diary) : undefined;
  const isPublic = !!spec.actions.find((a) => a.id === action)?.public;
  const saysLine = isPublic ? chooseLine(rng, text?.says, conds, used) : undefined;
  const saysPublicly = saysLine ? cut(fill(saysLine, vars), LIMITS.saysPublicly) : undefined;
  let questionForOwner: string | undefined;
  const askedBefore = r.reactions.some((x) => x.personaId === p.id && x.questionForOwner);
  const qChance = p.attitude === "sceptical" ? 0.45 : p.relationship === "new" ? 0.35 : 0.3;
  if (action !== "not_around" && !askedBefore && rng() < qChance) {
    const bank = QUESTIONS[r.template];
    const pool = rng() < 0.6 ? bank.bySegment[p.segment] ?? bank.general : bank.general;
    const asked = new Set(r.reactions.map((x) => x.questionForOwner).filter(Boolean));
    const fresh = pool.filter((q) => !asked.has(q));
    if (fresh.length) questionForOwner = pick(rng, fresh);
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

/**
 * Deterministic stand-in for the model: reactions for every active persona still waiting in the
 * current round, from their traits (price sensitivity vs the price, channels → noticing, attitude,
 * earlier actions, word of mouth in the feed, injected events). Submit them with method "rule-based".
 */
export function ruleBasedReactions(r: Rehearsal): Reaction[] {
  const spec = specOf(r, r.currentRound);
  if (r.status === "done" || !spec) return [];
  const used = new Set<string>();
  return pending(r).map((p) => ruleReaction(r, p, spec, used));
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
  const lines = r.reactions
    .filter((x) => x.personaId === p.id)
    .sort((a, b) => a.round - b.round)
    .map((x) => {
      const spec = specOf(r, x.round);
      const title = spec ? spec.title : `Round ${x.round}`;
      if (x.action === "not_around") return `- Round ${x.round} (${title}): you were not around.`;
      const label = actionOf(r, x.round, x.action)?.label ?? x.action;
      return `- Round ${x.round} (${title}): you chose "${label}". You thought: "${x.thought}"${x.saysPublicly ? ` You said: "${x.saysPublicly}"` : ""}${x.diary ? ` Your diary: "${x.diary}"` : ""}`;
    });
  const stage = r.status === "done" ? "The rehearsal is over." : `The rehearsal has reached round ${r.currentRound} of ${r.rounds.length}.`;
  return [
    `You are playing ONE imagined customer of ${s.cafe}, a neighbourhood café, in a "customer rehearsal". The owner tried out a change: ${r.change}. ${stage} The owner now has one question for you. Answer in character, honestly, from what you lived through below.`,
    cardBlock(r, p),
    ["WHAT YOU DID AND THOUGHT", ...(lines.length ? lines : ["- You were not involved yet."])].join("\n"),
    `THE OWNER'S QUESTION\n"${question}"`,
    [
      "HOW TO ANSWER",
      "- Answer as this person would: plain, everyday English, first person, your own reasons.",
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
    const found = personaIds.map((id) => ({ id, p: findPersona(r, id) }));
    const unknown = found.filter((x) => !x.p).map((x) => x.id);
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
      errors.push({ personaId: pidRaw === undefined ? `item ${i + 1}` : String(pidRaw), error: `Unknown personaId ${JSON.stringify(pidRaw ?? null)}. Use one of: ${personaList(next)}.` });
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
      addEvent(r, Math.max(br, 1), cut(norm(e.text), LIMITS.event));
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

function funnelFor(r: Rehearsal): RehearsalSummary["funnel"] {
  const of = r.personas.length;
  const isPublic = (x: Reaction) => !!actionOf(r, x.round, x.action)?.public;
  if (r.template === "price_change") {
    return [
      { label: "Noticed the new price", count: countPersonas(r, (rs) => rs.some((x) => GROUPS.priceNoticed.has(x.action))), of },
      {
        label: "Kept buying as before",
        count: countPersonas(r, (rs) => rs.some((x) => x.action !== "not_around") && !rs.some((x) => GROUPS.priceReduced.has(x.action))),
        of,
      },
      { label: "Bought less or went elsewhere", count: countPersonas(r, (rs) => rs.some((x) => GROUPS.priceReduced.has(x.action))), of },
      { label: "Said something about it", count: countPersonas(r, (rs) => rs.some(isPublic)), of },
    ];
  }
  return [
    { label: "Noticed it", count: countPersonas(r, (rs) => rs.some((x) => GROUPS.lunchNoticed.has(x.action))), of },
    { label: "Tried it", count: countPersonas(r, (rs) => rs.some((x) => GROUPS.lunchTried.has(x.action))), of },
    {
      label: "Came back",
      count: countPersonas(r, (rs) => {
        const first = rs.find((x) => GROUPS.lunchTried.has(x.action));
        return !!first && rs.some((x) => x.round > first.round && GROUPS.lunchReturn.has(x.action));
      }),
      of,
    },
    { label: "Told someone", count: countPersonas(r, (rs) => rs.some(isPublic)), of },
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
    cands.push({ personaId: p.id, name: p.name, round: x.round, text: x.thought, score: 1 + model + (a?.positive || a?.public ? 0.3 : 0) + (len >= 50 && len <= 200 ? 0.3 : 0) + x.round / 20 });
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

function questionsFor(r: Rehearsal, sorted: Reaction[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of sorted) {
    if (!x.questionForOwner) continue;
    const key = x.questionForOwner.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(x.questionForOwner);
  }
  return out;
}

/**
 * Who told whom: when someone's public words are in the feed and a later persona who had not yet
 * acted that way now does (positive: tries, comes back, recommends…; negative: buys less, goes
 * elsewhere, grumbles…), link the most recent matching speaker to them.
 */
function linksFor(r: Rehearsal, sorted: Reaction[]): RehearsalSummary["links"] {
  const polarityOf = (x: Reaction): "pos" | "neg" | null => {
    const a = actionOf(r, x.round, x.action);
    if (!a) return null;
    if (a.positive && !GROUPS.noticeOnly.has(a.id)) return "pos";
    if (GROUPS.negative.has(a.id)) return "neg";
    return null;
  };
  const speakers = r.feed
    .filter((f) => f.personaId && (f.kind === "word_of_mouth" || f.kind === "review"))
    .flatMap((f) => {
      const src = reactionFor(r, f.personaId!, f.round);
      const pol = src ? polarityOf(src) : null;
      return src && pol ? [{ from: f.personaId!, round: f.round, pol }] : [];
    });
  const out: RehearsalSummary["links"] = [];
  for (const p of r.personas) {
    const mine = sorted.filter((x) => x.personaId === p.id && isActive(r, x.personaId, x.round));
    for (const pol of ["pos", "neg"] as const) {
      const first = mine.find((x) => polarityOf(x) === pol);
      if (!first) continue;
      const src = speakers.filter((sp) => sp.from !== p.id && sp.pol === pol && sp.round < first.round).pop();
      if (src && !out.some((l) => l.from === src.from && l.to === p.id)) out.push({ from: src.from, to: p.id, round: first.round });
    }
  }
  return out.sort((a, b) => a.round - b.round);
}

function checksFor(r: Rehearsal, funnel: RehearsalSummary["funnel"], questions: string[]): string[] {
  const s = sceneOf(r);
  const count = (pred: (x: Reaction) => boolean) => new Set(r.reactions.filter(pred).map((x) => x.personaId)).size;
  const by = (ids: string[]) => (x: Reaction) => ids.includes(x.action);
  const out: string[] = [];
  const quoted = questions.slice(0, 2).map((q) => `"${q}"`);
  if (r.template === "price_change") {
    const regulars = r.personas.filter((p) => p.relationship === "regular");
    const regReduced = regulars.filter((p) => r.reactions.some((x) => x.personaId === p.id && GROUPS.priceReduced.has(x.action))).length;
    out.push(`Watch the first ten ${s.item} customers after the change: do they look at the board, say something, or order something else?`);
    out.push(
      regulars.length
        ? `Ask three regulars directly whether ${money(s.price, s.currency)} for ${withArticle(s.item)} changes how often they come. ${regReduced} of ${regulars.length} imagined regulars bought less.`
        : `Ask three regulars directly whether ${money(s.price, s.currency)} for ${withArticle(s.item)} changes how often they come.`,
    );
    const grumbled = count(by(["grumbles", "tells_friend_it_is_pricey", "mentions_price_in_review"]));
    if (grumbled) out.push(`Ask staff to jot down any comments about the price in the first week: ${grumbled} imagined customer${grumbled === 1 ? "" : "s"} said something out loud or online.`);
    const switched = count(by(["switches_to_cheaper_item"]));
    if (switched) out.push(`Track sales of cheaper items alongside the ${s.item}: ${switched} imagined customer${switched === 1 ? "" : "s"} switched to something cheaper.`);
    const away = count((x) => GROUPS.priceElsewhere.has(x.action));
    if (away) out.push(`Check what the two nearest cafés charge for ${withArticle(s.item)}: ${away} imagined customer${away === 1 ? "" : "s"} went elsewhere.`);
    if (quoted.length) out.push(`Have a friendly answer ready for questions like ${quoted.join(" and ")}.`);
    out.push(`Compare weekly ${s.item} sales before and after the change, as the test plan says.`);
  } else {
    const regulars = r.personas.filter((p) => p.relationship === "regular");
    const regTried = regulars.filter((p) => r.reactions.some((x) => x.personaId === p.id && GROUPS.lunchTried.has(x.action))).length;
    out.push(
      regulars.length
        ? `Ask five regulars whether they would swap their usual lunch for the deal: that switching is what your sums depend on. ${regTried} of ${regulars.length} imagined regulars did.`
        : "Ask five regulars whether they would swap their usual lunch for the deal: that switching is what your sums depend on.",
    );
    const noticed = funnel[0]?.count ?? 0;
    if (noticed * 2 < r.personas.length) {
      out.push("Count how many passers-by stop to read the board during one lunch hour: most imagined customers did not take it in.");
    } else {
      const tally = new Map<string, number>();
      for (const p of r.personas) {
        if (!r.reactions.some((x) => x.personaId === p.id && GROUPS.lunchNoticed.has(x.action))) continue;
        for (const ch of p.channels) tally.set(ch, (tally.get(ch) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      out.push(`Ask new lunch customers how they heard about the deal (the board, Instagram, a colleague).${top ? ` The imagined ones who noticed it mostly hear about things ${CHANNEL_PHRASE[top] ?? top}.` : ""}`);
    }
    const tried = funnel[1]?.count ?? 0;
    const back = funnel[2]?.count ?? 0;
    if (tried) out.push(`In week two, count how many deal customers come back. Of the ${tried} imagined customer${tried === 1 ? "" : "s"} who tried it, ${back} came back.`);
    const elsewhere = r.personas.filter((p) => r.reactions.some((x) => x.personaId === p.id && ["eats_elsewhere", "skips_lunch_out", "back_to_old_habits"].includes(x.action)));
    if (elsewhere.length) {
      const places = [...new Set(elsewhere.map(placeAlternative))].slice(0, 2);
      out.push(`Check what ${places.join(" and ")} ${places.length === 1 ? "charges" : "charge"} for lunch: ${elsewhere.length} imagined customer${elsewhere.length === 1 ? "" : "s"} ate elsewhere or brought food from home instead.`);
    }
    if (quoted.length) out.push(`Listen for the questions real customers ask at the counter. Imagined ones asked ${quoted.join(" and ")}.`);
    if (count(by(["complains"]))) out.push("Ask staff to note comments about queues or the rest of the menu at lunchtime: an imagined customer complained.");
    out.push("Write down deals sold and total lunch customers every day of the test, so you can compare them with the scenarios.");
  }
  return out.slice(0, 5);
}

/** Everything the report and the coach need: descriptive counts of imagined people, quotes, questions, links, and what to check for real. */
export function summarize(r: Rehearsal): RehearsalSummary {
  const order = new Map(r.personas.map((p, i) => [p.id, i]));
  const sorted = r.reactions.slice().sort((a, b) => a.round - b.round || (order.get(a.personaId) ?? 0) - (order.get(b.personaId) ?? 0));
  const completed = r.rounds.filter((s) => s.n < r.currentRound);
  const modelMethods = new Set(sorted.filter((x) => isActive(r, x.personaId, x.round)).map((x) => x.method));
  const method: RehearsalSummary["method"] = modelMethods.size === 0 ? "rule-based" : modelMethods.size === 1 ? [...modelMethods][0]! : "mixed";
  const funnel = funnelFor(r);
  const questionsForOwner = questionsFor(r, sorted);
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
      return { personaId: x.personaId, round: x.round, action: x.action, actionLabel: a?.label ?? x.action, positive: !!a?.positive, thought: x.thought };
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
    interviews: clone(r.interviews),
    checkWithRealCustomers: checksFor(r, funnel, questionsForOwner),
    caveat: CAVEAT,
  };
}
