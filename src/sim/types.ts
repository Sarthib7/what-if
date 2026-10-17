/**
 * The customer rehearsal: a small, MiroFish-inspired simulation in which a
 * handful of imagined customers react, round by round, to the owner's change.
 *
 * Everything here is tagged "imagined". It is used to surface questions to ask
 * real customers, never as a forecast and never fed into the scenario maths.
 */
import type { TemplateId } from "../engine/types.ts";
import type { Lang } from "../i18n/index.ts";

export type SegmentId =
  | "office_worker"
  | "freelancer"
  | "student"
  | "parent"
  | "regular"
  | "tourist"
  | "retiree"
  | "trades";

export interface Persona {
  id: string;
  name: string;
  segment: SegmentId;
  segmentLabel: string;
  age: number;
  routine: string;
  /** What they usually spend on lunch (or on the repriced item), in the analysis currency. */
  usualSpend: number;
  priceSensitivity: "low" | "medium" | "high";
  relationship: "regular" | "occasional" | "new";
  channels: string[];
  alternatives: string;
  quirk: string;
  /** The kind of real customer this imagined one stands for. */
  represents: string;
  /** How they feel about the café before the change (MiroFish "stance"). */
  attitude: "fan" | "neutral" | "sceptical";
  /** 0–1: chance they are around in a given round (MiroFish activation). Seeded, so reruns match. */
  activityLevel: number;
  /** 80–150 words: who they are, ending with their personal memory of this café. */
  story: string;
  /** Grammatical gender for the generated text (German, Spanish and Polish need it). */
  gender?: "f" | "m";
  /** Language-neutral tags the rule-based stand-in respects ("takeaway", "hurry", "pram"…). */
  traits?: string[];
  /** Ids of the places they go instead ("bakery", "doener", "canteen"…), in the order of `alternatives`. */
  altIds?: string[];
}

/** How the report should draw an action: away (not around), went elsewhere, engaged with the change, or neutral. */
export type ActionKind = "away" | "elsewhere" | "engaged" | "neutral";

export interface RoundAction {
  id: string;
  label: string;
  /** Public actions (telling a friend, a review) appear in the neighbourhood feed for the next round. */
  public: boolean;
  /** Counts toward "engaged with the change" in the funnel. */
  positive: boolean;
  /** How the report should draw it (see ActionKind). */
  kind?: ActionKind;
}

export interface RoundSpec {
  n: number;
  title: string;
  situation: string;
  actions: RoundAction[];
}

export type ReactionMethod = "subagent" | "in-context" | "rule-based";

export interface Reaction {
  personaId: string;
  round: number;
  action: string;
  thought: string;
  saysPublicly?: string;
  questionForOwner?: string;
  /** One sentence the persona remembers into the next round (its diary). */
  diary?: string;
  /** Persona id whose public words (in the feed this persona saw) made them do it. Given by the model, or found in the persona's own words. */
  heardFrom?: string;
  method: ReactionMethod;
}

export interface FeedItem {
  round: number;
  personaId?: string;
  name: string;
  text: string;
  kind: "word_of_mouth" | "review" | "post" | "event";
}

export interface Rehearsal {
  id: string;
  analysisId: string;
  template: TemplateId;
  business: string;
  question: string;
  /** One-line description of the change, as customers would see it ("Lunch deal: soup, sandwich and drink for €9.90"). */
  change: string;
  seed: number;
  createdAt: string;
  status: "running" | "done";
  /** The round waiting for reactions (1-based). Equals rounds.length + 1 when done. */
  currentRound: number;
  rounds: RoundSpec[];
  personas: Persona[];
  /** Per round, which personas are around (seeded activation). Absent personas get an automatic "not around" reaction. */
  active: Record<number, string[]>;
  reactions: Reaction[];
  /** Post-run interview answers (MiroFish "deep interaction"). */
  interviews: { question: string; answers: { personaId: string; name: string; answer: string; method: ReactionMethod }[] }[];
  feed: FeedItem[];
  /** Owner-injected events. `id` is set for the Berlin events (BERLIN_EVENTS), so they can be shown in another language. */
  events: { beforeRound: number; text: string; id?: string }[];
  /** Language every generated text in this rehearsal is written in (personas, rounds, rule-based reactions). */
  lang?: Lang;
  /** The Berlin Kiez the persona mix was drawn for (a rough guess, never statistics). */
  kiez?: string;
  /** What customers can see of the change (never costs). Set by startRehearsal and rebuilt with it. */
  scene?: RehearsalScene;
  /** Segment weights the personas were drawn with, when the owner gave a mix (needed to rebuild the same people). */
  customerMix?: Partial<Record<SegmentId, number>>;
}

/** The customer-visible side of the change, used to write briefs and rule-based reactions. */
export interface RehearsalScene {
  cafe: string;
  currency: string;
  /** Exactly what the sign says. */
  board: string;
  /** The deal price (lunch offer) or the new price (price change). */
  price: number;
  /** Price change: the old price. Lunch offer: same as `price`. */
  oldPrice: number;
  /** Lunch offer: what is in the deal. Price change: the item. */
  contents: string;
  /** Price change: the item ("flat white"). Lunch offer: "lunch". */
  item: string;
  /** Whether the owner pays to promote it (never how much). */
  promoted: boolean;
  /** "two-week". */
  testLength: string;
}

export interface PersonaBrief {
  personaId: string;
  name: string;
  round: number;
  allowedActions: string[];
  /** Ready-to-send prompt for one persona subagent (or for in-context role play). */
  prompt: string;
}

export interface SubmitOutcome {
  rehearsal: Rehearsal;
  accepted: number;
  errors: { personaId: string; error: string }[];
  done: boolean;
  /** Briefs for the next round, empty when done or when errors must be fixed first. */
  next: PersonaBrief[];
}

export interface RehearsalSummary {
  id: string;
  analysisId: string;
  business: string;
  question: string;
  change: string;
  status: Rehearsal["status"];
  method: ReactionMethod | "mixed";
  personas: Persona[];
  rounds: RoundSpec[];
  /** One cell per persona per round, for the timeline grid. */
  grid: { personaId: string; round: number; action: string; actionLabel: string; positive: boolean; thought: string; kind?: ActionKind }[];
  perRound: { round: number; title: string; counts: { action: string; label: string; count: number }[] }[];
  /** Descriptive counts of imagined people, e.g. "noticed it: 4 of 6". Never scaled up to customers. */
  funnel: { label: string; count: number; of: number }[];
  quotes: { personaId: string; name: string; round: number; text: string }[];
  questionsForOwner: string[];
  feed: FeedItem[];
  events: Rehearsal["events"];
  /** Who told whom: word-of-mouth links for the small network view. `text` is what the teller said (as it appeared in the feed). */
  links: { from: string; to: string; round: number; text?: string }[];
  /** Positive (engaged) actions per round, for the uptake chart. */
  uptake: { round: number; engaged: number; active: number }[];
  /** What "engaged" means for this template, in the rehearsal language ("Noticed or used the deal", "Still buying at the new price"). */
  uptakeLabel?: string;
  /** Language of every generated text in the summary. */
  lang?: Lang;
  /** The Kiez the persona mix was drawn for. */
  kiez?: string;
  /** One sentence: the mix of people is a rough guess for this Kiez, not statistics. Also part of the caveat. */
  mixNote?: string;
  interviews: Rehearsal["interviews"];
  /** What to check with real customers, derived from the rehearsal. */
  checkWithRealCustomers: string[];
  caveat: string;
}
