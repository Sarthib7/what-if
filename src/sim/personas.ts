/**
 * Imagined customers for a Berlin neighbourhood café.
 *
 * MiroFish builds each agent in two layers: a structured profile and a short
 * narrative that ends with the agent's personal memory of the event. We do the
 * same at café scale: a persona card (routine, usual spend, price sensitivity,
 * attitude, activity level) and an 80–150-word story that ends with what this
 * person remembers about *this* café. Everything is assembled from templates
 * with a seeded PRNG, so the same seed always gives the same people, and the
 * same people in every language (only the words change).
 *
 * The mix of segments follows the café's Kiez when the owner gave one (a labelled
 * rough guess, src/sim/berlin.ts). The people are fictional; names are a Berlin mix.
 */
import type { Lang } from "../i18n/index.ts";
import type { TemplateId } from "../engine/types.ts";
import type { Persona, SegmentId } from "./types.ts";
import { type Rng, between, intBetween, pick, rngFor, shuffle, weightedPick } from "./prng.ts";
import { BASE_MIX, BERLIN_NAMES, kiezWeights, type SimKiez } from "./berlin.ts";
import {
  ARCHETYPE_TEXT,
  CHANNEL_TEXT,
  COFFEE_ALTS,
  LUNCH_ALTS,
  MEMORIES,
  OR,
  PLACES,
  PRONOUNS,
  REPRESENTS_PREFIX,
  SEGMENT_LABELS,
  STORY,
  fillText,
  joinWith,
  type AltText,
} from "./messages.ts";
import { itemVars, money, tr } from "./rounds.ts";

export { withArticle } from "./rounds.ts";

export const SEGMENTS: SegmentId[] = ["office_worker", "freelancer", "student", "parent", "regular", "tourist", "retiree", "trades"];

/** English segment labels (kept for older callers). Use segmentLabel(segment, lang, gender) for others. */
export const SEGMENT_LABEL: Record<SegmentId, string> = Object.fromEntries(SEGMENTS.map((s) => [s, SEGMENT_LABELS[s].en])) as Record<SegmentId, string>;

/** A segment's label in a language, with the right grammatical gender. */
export function segmentLabel(segment: SegmentId, lang: Lang = "en", gender: "f" | "m" = "f"): string {
  return fillText(tr(SEGMENT_LABELS[segment], lang), {}, gender);
}

/** English phrases for the channel ids (kept for older callers). */
export const CHANNEL_PHRASE: Record<string, string> = Object.fromEntries(Object.entries(CHANNEL_TEXT).map(([k, v]) => [k, v.en]));

/** A channel id as a phrase in a language ("on Instagram", "auf Instagram"…). */
export function channelPhrase(id: string, lang: Lang = "en"): string {
  const t = CHANNEL_TEXT[id];
  return t ? tr(t, lang) : id;
}

export const WORD_OF_MOUTH_CHANNELS = ["a colleague or friend", "a neighbour", "the staff", "nebenan.de", "the house WhatsApp group"];

type W<K extends string> = Partial<Record<K, number>>;

interface Archetype {
  age: [number, number];
  /** Lunch offer: usual lunch spend as a multiple of the café's lunch spend. */
  lunchSpend: [number, number];
  /** Price change: usual spend per visit as a multiple of the repriced item's price. */
  visitSpend: [number, number];
  sensitivity: W<Persona["priceSensitivity"]>;
  relationship: W<Persona["relationship"]>;
  attitude: W<Persona["attitude"]>;
  activity: [number, number];
  /** One channel from `primary`, one (sometimes two) from `secondary`. */
  primary: string[];
  secondary: string[];
  lunchAlts: string[];
  coffeeAlts: string[];
}

const ARCHETYPES: Record<SegmentId, Archetype> = {
  office_worker: {
    age: [26, 54], lunchSpend: [0.85, 1.15], visitSpend: [1.0, 1.6],
    sensitivity: { low: 0.35, medium: 0.45, high: 0.2 }, relationship: { regular: 0.25, occasional: 0.55, new: 0.2 }, attitude: { fan: 0.25, neutral: 0.5, sceptical: 0.25 },
    activity: [0.75, 0.95],
    primary: ["walks past", "a colleague or friend"], secondary: ["Google Maps", "Instagram", "the board outside"],
    lunchAlts: ["canteen", "bakery", "doener", "vietnamese", "homemade"], coffeeAlts: ["work", "bakery", "chain"],
  },
  freelancer: {
    age: [24, 46], lunchSpend: [0.6, 0.95], visitSpend: [1.2, 2.2],
    sensitivity: { low: 0.15, medium: 0.5, high: 0.35 }, relationship: { regular: 0.35, occasional: 0.5, new: 0.15 }, attitude: { fan: 0.35, neutral: 0.45, sceptical: 0.2 },
    activity: [0.72, 0.9],
    primary: ["Instagram", "walks past"], secondary: ["Google Maps", "a colleague or friend", "the board outside", "nebenan.de"],
    lunchAlts: ["homemade", "bakery", "spaeti", "doener", "vietnamese"], coffeeAlts: ["home", "chain", "bakery"],
  },
  student: {
    age: [19, 27], lunchSpend: [0.45, 0.75], visitSpend: [1.0, 1.3],
    sensitivity: { low: 0.05, medium: 0.25, high: 0.7 }, relationship: { regular: 0.1, occasional: 0.5, new: 0.4 }, attitude: { fan: 0.25, neutral: 0.5, sceptical: 0.25 },
    activity: [0.65, 0.88],
    primary: ["Instagram", "walks past"], secondary: ["a colleague or friend", "Google Maps"],
    lunchAlts: ["spaeti", "doener", "homemade", "uni"], coffeeAlts: ["home", "spaeti", "uni"],
  },
  parent: {
    age: [29, 46], lunchSpend: [0.8, 1.3], visitSpend: [1.5, 2.5],
    sensitivity: { low: 0.2, medium: 0.5, high: 0.3 }, relationship: { regular: 0.2, occasional: 0.6, new: 0.2 }, attitude: { fan: 0.3, neutral: 0.5, sceptical: 0.2 },
    activity: [0.62, 0.85],
    primary: ["walks past"], secondary: ["Instagram", "a colleague or friend", "the board outside", "the house WhatsApp group"],
    lunchAlts: ["homemade", "bakery", "vietnamese"], coffeeAlts: ["home", "bakery"],
  },
  regular: {
    age: [30, 72], lunchSpend: [0.9, 1.2], visitSpend: [1.0, 1.8],
    sensitivity: { low: 0.4, medium: 0.45, high: 0.15 }, relationship: { regular: 1 }, attitude: { fan: 0.6, neutral: 0.3, sceptical: 0.1 },
    activity: [0.85, 0.95],
    primary: ["the staff"], secondary: ["the board outside", "walks past", "the house WhatsApp group"],
    lunchAlts: ["bakery", "homemade"], coffeeAlts: ["home", "bakery"],
  },
  tourist: {
    age: [22, 62], lunchSpend: [1.0, 1.4], visitSpend: [1.4, 2.4],
    sensitivity: { low: 0.5, medium: 0.4, high: 0.1 }, relationship: { new: 1 }, attitude: { fan: 0.15, neutral: 0.7, sceptical: 0.15 },
    activity: [0.55, 0.68],
    primary: ["Google Maps"], secondary: ["walks past", "Instagram"],
    lunchAlts: ["doener", "spaeti", "bakery", "vietnamese"], coffeeAlts: ["chain", "bakery"],
  },
  retiree: {
    age: [64, 82], lunchSpend: [0.6, 0.9], visitSpend: [1.0, 1.6],
    sensitivity: { low: 0.1, medium: 0.4, high: 0.5 }, relationship: { regular: 0.4, occasional: 0.5, new: 0.1 }, attitude: { fan: 0.3, neutral: 0.4, sceptical: 0.3 },
    activity: [0.72, 0.92],
    primary: ["walks past", "the board outside"], secondary: ["a neighbour", "the staff", "nebenan.de"],
    lunchAlts: ["homemade", "bakery"], coffeeAlts: ["home", "bakery"],
  },
  trades: {
    age: [24, 58], lunchSpend: [0.9, 1.3], visitSpend: [1.0, 1.5],
    sensitivity: { low: 0.2, medium: 0.5, high: 0.3 }, relationship: { regular: 0.15, occasional: 0.4, new: 0.45 }, attitude: { fan: 0.2, neutral: 0.55, sceptical: 0.25 },
    activity: [0.65, 0.88],
    primary: ["walks past", "the board outside"], secondary: ["a colleague or friend"],
    lunchAlts: ["doener", "bakery", "spaeti", "vietnamese"], coffeeAlts: ["bakery", "spaeti"],
  },
};

type Gender = "f" | "m";

export interface PersonaContext {
  template: TemplateId;
  /** The café's name as customers know it ("Café Lindenblatt"). */
  cafe: string;
  currency: string;
  /** Lunch offer: what a lunch customer spends now. Price change: the item's current price. */
  baseSpend: number;
  /** Price change: the item ("flat white"). */
  item?: string;
  /** Language the cards and stories are written in (default English). */
  lang?: Lang;
  /** The café's Kiez: shapes the segment mix (a rough guess). */
  kiez?: SimKiez;
}

function weighted<K extends string>(rng: Rng, w: W<K>): K {
  return weightedPick(rng, Object.entries(w) as [K, number][]);
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Valid customerMix weights, or null when none are usable. */
export function cleanMix(mix: Partial<Record<SegmentId, number>> | undefined): Partial<Record<SegmentId, number>> | null {
  if (!mix || typeof mix !== "object") return null;
  const out: Partial<Record<SegmentId, number>> = {};
  for (const s of SEGMENTS) {
    const v = (mix as Record<string, unknown>)[s];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[s] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Which segments the personas come from.
 * - An owner's mix: proportional (largest remainder).
 * - A Kiez: always one regular, then weighted draws from the Kiez mix where each draw makes that
 *   segment less likely (×0.35), so the Kiez shows (Mitte: more office workers and visitors) and
 *   the group stays varied.
 * - Neither: one regular, then distinct segments by the base mix.
 */
function chooseSegments(template: TemplateId, n: number, seed: number, mix: Partial<Record<SegmentId, number>> | null, kiez?: SimKiez): SegmentId[] {
  const rng = rngFor(seed, "segments");
  if (mix) {
    const entries = SEGMENTS.filter((s) => (mix[s] ?? 0) > 0).map((s) => [s, mix[s]!] as const);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    const quotas = entries.map(([s, w]) => ({ s, q: (n * w) / total, tie: rng() }));
    const counts = new Map(quotas.map(({ s, q }) => [s, Math.floor(q)]));
    let left = n - [...counts.values()].reduce((a, b) => a + b, 0);
    const byRemainder = quotas.slice().sort((a, b) => b.q - Math.floor(b.q) - (a.q - Math.floor(a.q)) || a.tie - b.tie);
    for (let i = 0; left > 0; i = (i + 1) % byRemainder.length, left--) {
      const s = byRemainder[i]!.s;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return entries.flatMap(([s]) => Array.from({ length: counts.get(s) ?? 0 }, () => s));
  }
  if (kiez) {
    const w = kiezWeights(template, kiez);
    w.regular *= 0.35;
    const out: SegmentId[] = ["regular"];
    while (out.length < n) {
      const s = weightedPick(rng, SEGMENTS.map((x) => [x, w[x]] as const));
      out.push(s);
      w[s] *= 0.35;
    }
    return out;
  }
  const weights = BASE_MIX[template];
  const out: SegmentId[] = ["regular"];
  let pool = SEGMENTS.filter((s) => s !== "regular");
  while (out.length < n && pool.length) {
    const s = weightedPick(rng, pool.map((x) => [x, weights[x]] as const));
    out.push(s);
    pool = pool.filter((x) => x !== s);
  }
  while (out.length < n) out.push(weightedPick(rng, SEGMENTS.map((x) => [x, weights[x]] as const)));
  return out;
}

interface Draft {
  segment: SegmentId;
  gender: Gender;
  name: string;
  age: number;
  usualSpend: number;
  priceSensitivity: Persona["priceSensitivity"];
  relationship: Persona["relationship"];
  attitude: Persona["attitude"];
  activityLevel: number;
  channels: string[];
  altIds: string[];
  job: number;
  routine: number;
  quirk: number;
  index: number;
}

/**
 * Generates `count` imagined customers. Deterministic for (ctx without lang, count, seed, mix):
 * the language only changes the words. Always includes at least one regular customer and one sceptic.
 */
export function generatePersonas(ctx: PersonaContext, count: number, seed: number, mix?: Partial<Record<SegmentId, number>>): Persona[] {
  const segments = chooseSegments(ctx.template, count, seed, cleanMix(mix), ctx.kiez);
  const nameRng = rngFor(seed, "names");
  const used = new Set<string>();
  const lunch = ctx.template === "lunch_offer";

  const drafts: Draft[] = segments.map((segment, index) => {
    const a = ARCHETYPES[segment];
    const t = ARCHETYPE_TEXT[segment];
    const rng = rngFor(seed, "persona", index, segment);
    const age = intBetween(rng, a.age[0], a.age[1]);
    const gender: Gender = nameRng() < 0.5 ? "f" : "m";
    const pool = BERLIN_NAMES[age >= 58 ? "older" : "young"][gender].filter((x) => !used.has(x));
    const fallbackPool = [...BERLIN_NAMES.young[gender], ...BERLIN_NAMES.older[gender]].filter((x) => !used.has(x));
    const name = pick(nameRng, pool.length ? pool : fallbackPool.length ? fallbackPool : [`Gast ${index + 1}`]);
    used.add(name);
    const factor = lunch ? between(rng, a.lunchSpend[0], a.lunchSpend[1]) : between(rng, a.visitSpend[0], a.visitSpend[1]);
    const usualSpend = Math.max(0.5, Math.round(ctx.baseSpend * factor * 10) / 10);
    const channels = [pick(rng, a.primary)];
    const secondary = shuffle(rng, a.secondary.filter((c) => !channels.includes(c)));
    channels.push(...secondary.slice(0, rng() < 0.35 ? 2 : 1));
    const altIds = shuffle(rng, lunch ? a.lunchAlts : a.coffeeAlts).slice(0, 2);
    return {
      segment,
      gender,
      name,
      age,
      usualSpend,
      priceSensitivity: weighted(rng, a.sensitivity),
      relationship: weighted(rng, a.relationship),
      attitude: weighted(rng, a.attitude),
      activityLevel: Math.round(between(rng, a.activity[0], a.activity[1]) * 100) / 100,
      channels,
      altIds,
      job: Math.floor(rng() * t.jobs.length),
      routine: Math.floor(rng() * (lunch ? t.lunchRoutine.length : t.coffeeRoutine.length)),
      quirk: Math.floor(rng() * t.quirks.length),
      index,
    };
  });

  // Variety guarantees: at least one regular customer and at least one sceptic.
  const fix = rngFor(seed, "fixups");
  if (!drafts.some((d) => d.relationship === "regular")) {
    const cands = drafts.filter((d) => d.segment !== "tourist");
    const d = pick(fix, cands.length ? cands : drafts);
    d.relationship = "regular";
  }
  if (!drafts.some((d) => d.attitude === "sceptical")) {
    const cands = drafts.filter((d) => d.segment !== "regular" && d.attitude !== "fan");
    const cands2 = drafts.filter((d) => d.segment !== "regular");
    const d = pick(fix, cands.length ? cands : cands2.length ? cands2 : drafts);
    d.attitude = "sceptical";
  }

  const ordered = shuffle(rngFor(seed, "order"), drafts);
  return ordered.map((d, i) => finish(d, i, ctx, seed));
}

function altText(id: string, lunch: boolean): AltText | undefined {
  return (lunch ? LUNCH_ALTS : COFFEE_ALTS)[id];
}

function finish(d: Draft, i: number, ctx: PersonaContext, seed: number): Persona {
  const lang: Lang = ctx.lang ?? "en";
  const t = ARCHETYPE_TEXT[d.segment];
  const lunch = ctx.template === "lunch_offer";
  const rng = rngFor(seed, "story", d.index, d.name);
  const g = d.gender;
  const vars: Record<string, string> = {
    ...PRONOUNS[lang][g],
    ...itemVars(ctx.item ?? (lang === "de" ? "Kaffee" : lang === "en" ? "coffee" : "café")),
    cafe: ctx.cafe,
    spend: money(d.usualSpend, ctx.currency, lang),
  };
  if (lang === "pl") vars.item = ctx.item ?? "kawę";
  const f = (s: string) => fillText(s, vars, g);
  const routineEntry = (lunch ? t.lunchRoutine : t.coffeeRoutine)[d.routine]!;
  const quirkEntry = t.quirks[d.quirk]!;
  const routine = f(tr(routineEntry.t, lang));
  const quirk = f(tr(quirkEntry.t, lang));
  const job = f(tr(t.jobs[d.job]!, lang));
  const alternatives = joinWith(
    d.altIds.map((id) => altText(id, lunch)).filter((x): x is AltText => !!x).map((x) => tr(x.text, lang)),
    tr(OR, lang),
  );
  const channels = joinWith(d.channels.map((c) => channelPhrase(c, lang)), tr(OR, lang));
  // English and German put the pronoun before the routine; Spanish and Polish drop it.
  const routineSentence = lang === "en" || lang === "de" ? `${vars.S} ${lcFirst(routine)}` : routine;
  const quirkSentence = lang === "en" || lang === "de" ? `${vars.S} ${quirk}.` : `${ucFirst(quirk)}.`;
  const memory = pick(rng, MEMORIES[d.relationship === "new" ? "new" : "known"][d.attitude]);
  const memorySentence = f(fillText(tr(STORY.memory, lang), { ...vars, memory: f(tr(memory, lang)) }, g));
  const head = [
    `${d.name}, ${d.age}, ${job}.`,
    routineSentence,
    f(tr(STORY.money[ctx.template][d.priceSensitivity], lang)),
    fillText(f(tr(STORY.alternatives[ctx.template], lang)), { alts: alternatives }),
    fillText(f(tr(STORY.channels, lang)), { channels }),
    quirkSentence,
  ];
  const extras = shuffle(rng, t.extras).map((e) => f(tr(e, lang)));
  const target = lang === "en" ? 80 : 72;
  let parts = [...head, memorySentence];
  for (const extra of extras) {
    if (wordCount(parts.join(" ")) >= target) break;
    parts = [...parts.slice(0, -1), extra, memorySentence];
  }
  let story = parts.join(" ");
  if (wordCount(story) > 150) story = [head[0], head[1], head[2], head[3], head[5], memorySentence].join(" ");

  const traits = [...new Set([...(routineEntry.tags ?? []), ...(quirkEntry.tags ?? []), ...(d.segment === "trades" ? ["takeaway"] : [])])];
  return {
    id: `p${i + 1}`,
    name: d.name,
    segment: d.segment,
    segmentLabel: segmentLabel(d.segment, lang, g),
    age: d.age,
    routine,
    usualSpend: d.usualSpend,
    priceSensitivity: d.priceSensitivity,
    relationship: d.relationship,
    channels: d.channels,
    alternatives,
    quirk: ucFirst(quirk),
    represents: `${tr(REPRESENTS_PREFIX, lang)}${tr(t.represents[ctx.template], lang)}`,
    attitude: d.attitude,
    activityLevel: d.activityLevel,
    story,
    gender: g,
    ...(traits.length ? { traits } : {}),
    altIds: d.altIds,
  };
}

/** Somewhere this persona would go instead: a place id from PLACES (never the home-made option). */
export function placeIdFor(p: Persona, template: TemplateId): keyof typeof PLACES {
  const lunch = template === "lunch_offer";
  for (const id of p.altIds ?? []) {
    const place = altText(id, lunch)?.place;
    if (place) return place;
  }
  return "bakery";
}

/** Somewhere this persona would go instead, as a phrase (English by default). */
export function placeAlternative(p: Persona, lang: Lang = "en", template: TemplateId = "lunch_offer"): string {
  if (!p.altIds) {
    // Older personas without ids: find an English place name in their alternatives.
    const known = Object.values(PLACES).map((pl) => pl.nom.en);
    return known.find((pl) => p.alternatives.includes(pl)) ?? PLACES.bakery!.nom.en;
  }
  return tr(PLACES[placeIdFor(p, template)]!.nom, lang);
}

/** Pronoun set for template text about a persona ("{S} went back…"). */
export function pronounsFor(p: Persona, lang: Lang = "en"): Record<string, string> {
  const f = p.gender ? p.gender === "f" : [...BERLIN_NAMES.young.f, ...BERLIN_NAMES.older.f].includes(p.name);
  return PRONOUNS[lang][f ? "f" : "m"];
}
