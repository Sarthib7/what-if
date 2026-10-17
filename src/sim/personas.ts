/**
 * Imagined customers for a Berlin neighbourhood café.
 *
 * MiroFish builds each agent in two layers: a structured profile and a short
 * narrative that ends with the agent's personal memory of the event. We do the
 * same at café scale: a persona card (routine, usual spend, price sensitivity,
 * attitude, activity level) and an 80–150-word story that ends with what this
 * person remembers about *this* café. Everything is assembled from templates
 * with a seeded PRNG, so the same seed always gives the same people.
 *
 * The people are fictional. Names are a Neukölln-style mix (German, Turkish,
 * Polish, Arabic and international first names) and stand for nobody real.
 */
import type { TemplateId } from "../engine/types.ts";
import type { Persona, SegmentId } from "./types.ts";
import { type Rng, between, intBetween, pick, rngFor, shuffle, weightedPick } from "./prng.ts";
import { fill, money } from "./rounds.ts";

export const SEGMENTS: SegmentId[] = ["office_worker", "freelancer", "student", "parent", "regular", "tourist", "retiree", "trades"];

export const SEGMENT_LABEL: Record<SegmentId, string> = {
  office_worker: "Office worker",
  freelancer: "Freelancer",
  student: "Student",
  parent: "Parent with small children",
  regular: "Regular",
  tourist: "Visitor",
  retiree: "Retired neighbour",
  trades: "Tradesperson",
};

/** Channels a persona can hear about the change through. Word-of-mouth channels make feed items count more. */
export const CHANNEL_PHRASE: Record<string, string> = {
  "walks past": "by walking past",
  Instagram: "on Instagram",
  "Google Maps": "on Google Maps",
  "a colleague or friend": "from colleagues and friends",
  "a neighbour": "from neighbours",
  "the board outside": "from the board outside",
  "the staff": "from chatting with the staff",
};
export const WORD_OF_MOUTH_CHANNELS = ["a colleague or friend", "a neighbour", "the staff"];

interface Alternative {
  text: string;
  /** Somewhere a person can go instead (for "went to … instead" sentences). */
  place?: string;
}

const LUNCH_ALT: Record<string, Alternative> = {
  bakery: { text: "the bakery on the corner", place: "the bakery on the corner" },
  spaeti: { text: "a sandwich from the Späti across the road", place: "the Späti across the road" },
  canteen: { text: "the canteen at work", place: "the canteen at work" },
  uni: { text: "the uni canteen", place: "the uni canteen" },
  doener: { text: "the döner place by the U-Bahn", place: "the döner place by the U-Bahn" },
  homemade: { text: "a home-made lunchbox" },
};

const COFFEE_ALT: Record<string, Alternative> = {
  bakery: { text: "the bakery on the corner", place: "the bakery on the corner" },
  spaeti: { text: "the Späti across the road", place: "the Späti across the road" },
  work: { text: "the machine at work", place: "the machine at work" },
  uni: { text: "the machine at uni", place: "the machine at uni" },
  chain: { text: "the chain café by the U-Bahn", place: "the chain café by the U-Bahn" },
  home: { text: "home, with a moka pot" },
};

const ALL_PLACES = [...Object.values(LUNCH_ALT), ...Object.values(COFFEE_ALT)].flatMap((a) => (a.place ? [a.place] : []));

/** Somewhere this persona would go instead (for rule-based thoughts). */
export function placeAlternative(p: Persona): string {
  return ALL_PLACES.find((pl) => p.alternatives.includes(pl)) ?? "the bakery on the corner";
}

type W<K extends string> = Partial<Record<K, number>>;

interface Archetype {
  segment: SegmentId;
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
  jobs: string[];
  lunchRoutine: string[];
  coffeeRoutine: string[];
  quirks: string[];
  extras: string[];
  represents: Record<TemplateId, string>;
}

const ARCHETYPES: Record<SegmentId, Archetype> = {
  office_worker: {
    segment: "office_worker",
    age: [26, 54],
    lunchSpend: [0.85, 1.15],
    visitSpend: [1.0, 1.6],
    sensitivity: { low: 0.35, medium: 0.45, high: 0.2 },
    relationship: { regular: 0.25, occasional: 0.55, new: 0.2 },
    attitude: { fan: 0.25, neutral: 0.5, sceptical: 0.25 },
    activity: [0.75, 0.95],
    primary: ["walks past", "a colleague or friend"],
    secondary: ["Google Maps", "Instagram", "the board outside"],
    lunchAlts: ["canteen", "bakery", "doener", "homemade"],
    coffeeAlts: ["work", "bakery", "chain"],
    jobs: [
      "works in the HR team of a solar start-up two streets away",
      "is a project manager at a small architecture office nearby",
      "does the accounts for a housing cooperative round the corner",
      "works in customer support for a bike-sharing company nearby",
      "is a UX designer at an agency in a converted brewery down the road",
    ],
    lunchRoutine: [
      "Eats lunch out most weekdays around 12:30, usually something quick that can be carried back to the desk.",
      "Goes out for lunch with two colleagues at 12:15 on the dot; they take turns choosing the place.",
      "Has a short lunch break and spends too much of it deciding where to go.",
    ],
    coffeeRoutine: [
      "Picks up {a_item} on the way to the office most mornings, often while answering emails.",
      "Comes in for {a_item} after the ten o'clock meeting, sometimes bringing a colleague.",
    ],
    quirks: [
      "has exactly thirty minutes for lunch and hates queues",
      "orders the same thing until it disappears from the menu",
      "pays by card and never carries cash",
      "checks Google Maps before trying anywhere new",
      "often brings something back for a colleague",
    ],
    extras: ["Most days the office group chat decides where lunch happens.", "{S} likes knowing exactly what something costs before ordering."],
    represents: {
      lunch_offer: "Stands for: office workers within a five-minute walk who buy lunch most weekdays",
      price_change: "Stands for: office workers nearby who buy a coffee on the way in",
    },
  },
  freelancer: {
    segment: "freelancer",
    age: [24, 46],
    lunchSpend: [0.6, 0.95],
    visitSpend: [1.2, 2.2],
    sensitivity: { low: 0.15, medium: 0.5, high: 0.35 },
    relationship: { regular: 0.35, occasional: 0.5, new: 0.15 },
    attitude: { fan: 0.35, neutral: 0.45, sceptical: 0.2 },
    activity: [0.7, 0.9],
    primary: ["Instagram", "walks past"],
    secondary: ["Google Maps", "a colleague or friend", "the board outside"],
    lunchAlts: ["homemade", "bakery", "spaeti", "doener"],
    coffeeAlts: ["home", "chain", "bakery"],
    jobs: [
      "is a freelance illustrator who mostly draws for children's books",
      "translates video games from Polish into German",
      "is a sound designer for podcasts and small films",
      "writes grant applications for local charities",
      "builds websites for small shops and restaurants",
    ],
    lunchRoutine: [
      "Works from a laptop at the café two or three afternoons a week; lunch is often a bowl of soup and a long flat white.",
      "Works from home most days and goes out for lunch when a deadline is done or the flat feels too small.",
    ],
    coffeeRoutine: [
      "Works from the café a few afternoons a week, making {a_item} last for hours.",
      "Comes in mid-morning for {a_item} and a seat by the window to answer emails.",
    ],
    quirks: [
      "always takes the table by the power socket",
      "photographs food before eating it",
      "budgets day by day depending on when invoices are paid",
      "asks for oat milk in everything",
      "wears headphones and nods instead of talking",
    ],
    extras: ["Some months are good and some are thin, and it shows in what {s} orders.", "{S} counts the café as an office, which makes the coffee feel like rent."],
    represents: {
      lunch_offer: "Stands for: freelancers and remote workers who use the café as an office",
      price_change: "Stands for: freelancers and remote workers who use the café as an office",
    },
  },
  student: {
    segment: "student",
    age: [19, 27],
    lunchSpend: [0.45, 0.75],
    visitSpend: [1.0, 1.3],
    sensitivity: { low: 0.05, medium: 0.25, high: 0.7 },
    relationship: { regular: 0.1, occasional: 0.5, new: 0.4 },
    attitude: { fan: 0.25, neutral: 0.5, sceptical: 0.25 },
    activity: [0.6, 0.85],
    primary: ["Instagram", "walks past"],
    secondary: ["a colleague or friend", "Google Maps"],
    lunchAlts: ["spaeti", "doener", "homemade", "uni"],
    coffeeAlts: ["home", "spaeti", "uni"],
    jobs: [
      "is studying sociology and works weekend shifts at a bar",
      "is doing a master's in urban planning",
      "studies music and gives guitar lessons on the side",
      "is in the last year of a nursing apprenticeship",
      "studies computer science and lives in a shared flat round the corner",
    ],
    lunchRoutine: [
      "Passes the café on the way to the U-Bahn; eats out maybe twice a week and cooks big pots of pasta the rest of the time.",
      "Has lectures until noon, and lunch is whatever is cheapest between the station and the flat.",
    ],
    coffeeRoutine: [
      "Treats {r} to {a_item} once or twice a week between lectures.",
      "Comes in with flatmates on Sunday mornings and sometimes alone on weekdays for {a_item}.",
    ],
    quirks: [
      "splits everything with a flatmate",
      "knows every student discount in the area",
      "counts coins at the till",
      "is always wearing headphones",
      "orders the cheapest thing and makes it last",
    ],
    extras: ["Rent went up this year, so every euro outside it gets a second look.", "{S} likes places where nobody minds if you stay for one cheap drink."],
    represents: {
      lunch_offer: "Stands for: students and young people on a tight budget who eat out now and then",
      price_change: "Stands for: students on a tight budget for whom a coffee out is a small treat",
    },
  },
  parent: {
    segment: "parent",
    age: [29, 46],
    lunchSpend: [0.8, 1.3],
    visitSpend: [1.5, 2.5],
    sensitivity: { low: 0.2, medium: 0.5, high: 0.3 },
    relationship: { regular: 0.2, occasional: 0.6, new: 0.2 },
    attitude: { fan: 0.3, neutral: 0.5, sceptical: 0.2 },
    activity: [0.55, 0.8],
    primary: ["walks past"],
    secondary: ["Instagram", "a colleague or friend", "the board outside"],
    lunchAlts: ["homemade", "bakery"],
    coffeeAlts: ["home", "bakery"],
    jobs: [
      "is on parental leave with an eight-month-old",
      "works part-time at a pharmacy and picks up two children at three",
      "works from home on Mondays and Fridays and does the nursery run",
      "is a nurse on a reduced week while the youngest settles into nursery",
    ],
    lunchRoutine: [
      "Comes by with the pram after the morning walk; lunch out is a treat, usually something to share.",
      "Has lunch out once or twice a week between nursery drop-off and pick-up, always against the clock.",
    ],
    coffeeRoutine: [
      "Gets {a_item} after nursery drop-off, often with a pastry to share later.",
      "Meets another parent for {a_item} on Wednesday mornings, pram parked by the window.",
    ],
    quirks: ["needs space for a pram", "always asks whether things contain nuts", "is in a hurry after half past two", "orders for two and eats for one"],
    extras: ["A good day is one where nobody cries in public, including {o}.", "{S} chooses places by whether there is room for a pram inside."],
    represents: {
      lunch_offer: "Stands for: parents with small children who come by during the day",
      price_change: "Stands for: parents with small children who come by during the day",
    },
  },
  regular: {
    segment: "regular",
    age: [30, 72],
    lunchSpend: [0.9, 1.2],
    visitSpend: [1.0, 1.8],
    sensitivity: { low: 0.4, medium: 0.45, high: 0.15 },
    relationship: { regular: 1 },
    attitude: { fan: 0.6, neutral: 0.3, sceptical: 0.1 },
    activity: [0.85, 0.95],
    primary: ["the staff"],
    secondary: ["the board outside", "walks past"],
    lunchAlts: ["bakery", "homemade"],
    coffeeAlts: ["home", "bakery"],
    jobs: [
      "has lived on this street for eleven years",
      "runs the bookshop three doors down",
      "is a night-shift nurse who stops by on the way home",
      "teaches German at the language school nearby",
      "repairs bicycles in a workshop across the courtyard",
    ],
    lunchRoutine: [
      "Comes in almost every weekday, sits at the same window table and usually has the soup with bread.",
      "Has lunch here three or four times a week, usually the sandwich of the day and a mint tea.",
    ],
    coffeeRoutine: ["Has {a_item} at the counter almost every morning, often as the first customer.", "Stops in for {a_item} most days and knows the staff's names."],
    quirks: [
      "knows the staff by name and their days off",
      "dislikes changes to the menu",
      "always pays in cash and leaves the change",
      "reads the paper for an hour and keeps the same chair",
    ],
    extras: ["{S} has seen the café through two owners and a lot of staff.", "Friends know they can usually find {o} here."],
    represents: {
      lunch_offer: "Stands for: loyal regulars who come in almost every day",
      price_change: "Stands for: loyal regulars who buy the item most days",
    },
  },
  tourist: {
    segment: "tourist",
    age: [22, 62],
    lunchSpend: [1.0, 1.4],
    visitSpend: [1.4, 2.4],
    sensitivity: { low: 0.5, medium: 0.4, high: 0.1 },
    relationship: { new: 1 },
    attitude: { fan: 0.15, neutral: 0.7, sceptical: 0.15 },
    activity: [0.5, 0.62],
    primary: ["Google Maps"],
    secondary: ["walks past", "Instagram"],
    lunchAlts: ["doener", "spaeti", "bakery"],
    coffeeAlts: ["chain", "bakery"],
    jobs: [
      "is visiting from Lyon for a long weekend",
      "is in town from Kraków for a week of trade fairs",
      "is backpacking from Melbourne and staying in a hostel nearby",
      "is visiting a friend who lives round the corner, from Milan",
      "is on a city break from Leeds",
    ],
    lunchRoutine: [
      "Wanders the neighbourhood and picks lunch spots from map reviews and the look of the window.",
      "Eats out every day while in town and likes places that feel local.",
    ],
    coffeeRoutine: ["Stops for {a_item} while exploring the neighbourhood.", "Looks for a good {item} every morning before sightseeing."],
    quirks: ["reads every review before going in", "takes photos of chalkboards", "speaks English and a little German", "wants to eat 'like a local'"],
    extras: ["{S} will only be around for a few days.", "Prices back home make things here look cheap or expensive, depending on the day."],
    represents: {
      lunch_offer: "Stands for: visitors who find the café on a map or by walking past",
      price_change: "Stands for: visitors who find the café on a map or by walking past",
    },
  },
  retiree: {
    segment: "retiree",
    age: [64, 82],
    lunchSpend: [0.6, 0.9],
    visitSpend: [1.0, 1.6],
    sensitivity: { low: 0.1, medium: 0.4, high: 0.5 },
    relationship: { regular: 0.4, occasional: 0.5, new: 0.1 },
    attitude: { fan: 0.3, neutral: 0.4, sceptical: 0.3 },
    activity: [0.7, 0.92],
    primary: ["walks past", "the board outside"],
    secondary: ["a neighbour", "the staff"],
    lunchAlts: ["homemade", "bakery"],
    coffeeAlts: ["home", "bakery"],
    jobs: [
      "drove trams for thirty-five years and still knows every timetable",
      "is a retired primary-school teacher",
      "used to run a tailoring shop two streets away",
      "worked as a hospital cook and has opinions about soup",
    ],
    lunchRoutine: [
      "Goes out for lunch on Tuesdays and Thursdays and cooks at home the rest of the week; likes a proper bowl of soup.",
      "Eats a late lunch out once a week with a friend from the choir.",
    ],
    coffeeRoutine: ["Meets a friend for {a_item} on Tuesday and Thursday mornings.", "Takes {a_item} at the window after the morning walk, three times a week."],
    quirks: ["pays in coins", "reads the board outside carefully, with glasses", "notices when portions shrink", "comes with a friend from the choir"],
    extras: [
      "The pension goes up more slowly than prices, and {s} keeps a little notebook of what things cost.",
      "{S} has lived in the area long enough to remember when the café was a butcher's.",
    ],
    represents: {
      lunch_offer: "Stands for: older neighbours who eat out on a few fixed days a week",
      price_change: "Stands for: older neighbours on fixed incomes who come on set days",
    },
  },
  trades: {
    segment: "trades",
    age: [24, 58],
    lunchSpend: [0.9, 1.3],
    visitSpend: [1.0, 1.5],
    sensitivity: { low: 0.2, medium: 0.5, high: 0.3 },
    relationship: { regular: 0.15, occasional: 0.4, new: 0.45 },
    attitude: { fan: 0.2, neutral: 0.55, sceptical: 0.25 },
    activity: [0.6, 0.85],
    primary: ["walks past", "the board outside"],
    secondary: ["a colleague or friend"],
    lunchAlts: ["doener", "bakery", "spaeti"],
    coffeeAlts: ["bakery", "spaeti"],
    jobs: [
      "is an electrician rewiring flats on the next street for a few weeks",
      "is a painter on a renovation job nearby",
      "drives a delivery van for a local organic wholesaler",
      "is a plumber whose van is often parked outside",
    ],
    lunchRoutine: ["Grabs something filling at 11:45 between jobs and eats it in the van.", "Takes a proper lunch break at noon with two workmates and wants it fast."],
    coffeeRoutine: ["Picks up {a_item} to go before the first job of the day.", "Stops for {a_item} on the morning delivery round."],
    quirks: ["wants big portions", "always takes it to go", "comes with two workmates", "pays in cash and wants it fast"],
    extras: ["The job nearby ends in a few weeks, then it's another part of the city.", "{S} rates a place by how long it keeps {o} going in the afternoon."],
    represents: {
      lunch_offer: "Stands for: tradespeople and drivers working nearby who want something quick and filling",
      price_change: "Stands for: tradespeople and drivers who grab a coffee to go",
    },
  },
};

/** Default mixes: roughly who comes into a neighbourhood café at lunch, or buys a coffee. */
const DEFAULT_MIX: Record<TemplateId, Record<SegmentId, number>> = {
  lunch_offer: { office_worker: 3, regular: 2, freelancer: 2, student: 1.5, trades: 1.5, parent: 1.2, retiree: 1, tourist: 0.8 },
  price_change: { regular: 3, office_worker: 2.5, freelancer: 2, student: 2, parent: 1.2, retiree: 1.2, trades: 1, tourist: 0.8 },
};

type Gender = "f" | "m";
const NAMES: Record<"young" | "older", Record<Gender, string[]>> = {
  young: {
    f: ["Elif", "Lena", "Zeynep", "Kasia", "Agnieszka", "Yasmin", "Leila", "Priya", "Sofia", "Chiara", "Aiko", "Noor", "Ines", "Greta", "Derya", "Magda", "Hanna", "Amara", "Marta", "Selin", "Mira", "Ola"],
    m: ["Jonas", "Mehmet", "Emre", "Tomasz", "Piotr", "Karim", "Omar", "Lucas", "Mateo", "Felix", "Can", "Murat", "Dmitri", "Kwame", "Jan", "Bilal", "Rafael", "Henrik", "Yusuf", "Malte", "Kofi", "Arjun"],
  },
  older: {
    f: ["Helga", "Ingrid", "Fatma", "Dorota", "Renate", "Gülsen", "Anke", "Barbara", "Halina"],
    m: ["Wolfgang", "Hüseyin", "Klaus", "Bernd", "Jürgen", "Stanisław", "Uwe", "Rainer", "Ahmet"],
  },
};

const PRONOUNS: Record<Gender, Record<string, string>> = {
  f: { S: "She", s: "she", o: "her", p: "her", P: "Her", r: "herself" },
  m: { S: "He", s: "he", o: "him", p: "his", P: "His", r: "himself" },
};

/** What this person remembers about the café (the last line of the story). */
const MEMORIES: Record<"known" | "new", Record<Persona["attitude"], string[]>> = {
  known: {
    fan: [
      "the rainy afternoon {s} was locked out of {p} flat and the staff let {o} wait inside for two hours with free refills",
      "the barista remembering {p} order after only the second visit",
      "a birthday when the staff put a candle in {p} slice of cake without being asked",
      "the first warm week of spring, sitting by the open window and watching the street wake up",
    ],
    neutral: [
      "a good soup on a cold day, though {s} can't remember what kind",
      "bumping into an old friend there by chance and staying an hour longer than planned",
      "decent coffee, slightly too loud music and a table that always wobbles",
      "being served quickly once when {s} was in a hurry, which {s} noticed because it doesn't happen everywhere",
    ],
    sceptical: [
      "waiting twelve minutes for a sandwich in the lunch rush and nearly missing a meeting",
      "paying more than expected for a small coffee and wondering who it was for",
      "a 'special' that tasted a lot like yesterday's quiche warmed up",
      "standing at the counter while two of the staff finished their conversation first",
    ],
  },
  new: {
    fan: ["one very good cinnamon bun on {p} first and only visit, eaten standing at the window", "a friend's photo of the counter, with a note saying 'you'd like this place'"],
    neutral: ["walking past it twice and noticing the plants in the window, but never going in", "a photo of the counter on Google Maps, with a queue in it"],
    sceptical: ["a three-star review on Google Maps that complained about slow service", "peering in once, seeing every table taken and walking on"],
  },
};

export interface PersonaContext {
  template: TemplateId;
  /** The café's name as customers know it ("Café Lindenblatt"). */
  cafe: string;
  currency: string;
  /** Lunch offer: what a lunch customer spends now. Price change: the item's current price. */
  baseSpend: number;
  /** Price change: the item ("flat white"). */
  item?: string;
}

function weighted<K extends string>(rng: Rng, w: W<K>): K {
  return weightedPick(rng, Object.entries(w) as [K, number][]);
}

export function withArticle(item: string): string {
  return /^[aeiou]/i.test(item.trim()) ? `an ${item}` : `a ${item}`;
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinOr(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
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

/** Which segments the personas come from: proportional to the mix if given, otherwise a varied default. */
function chooseSegments(template: TemplateId, n: number, seed: number, mix: Partial<Record<SegmentId, number>> | null): SegmentId[] {
  const rng = rngFor(seed, "segments");
  if (mix) {
    // Largest-remainder apportionment of n people across the given weights.
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
  const weights = DEFAULT_MIX[template];
  // Always one regular; then distinct segments by weight; above eight, repeats by weight.
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
  alts: Alternative[];
  job: string;
  routineTpl: string;
  quirk: string;
  index: number;
}

/**
 * Generates `count` imagined customers. Deterministic for (ctx, count, seed, mix).
 * Always includes at least one regular customer and at least one sceptic.
 */
export function generatePersonas(ctx: PersonaContext, count: number, seed: number, mix?: Partial<Record<SegmentId, number>>): Persona[] {
  const segments = chooseSegments(ctx.template, count, seed, cleanMix(mix));
  const nameRng = rngFor(seed, "names");
  const used = new Set<string>();

  const drafts: Draft[] = segments.map((segment, index) => {
    const a = ARCHETYPES[segment];
    const rng = rngFor(seed, "persona", index, segment);
    const age = intBetween(rng, a.age[0], a.age[1]);
    const gender: Gender = nameRng() < 0.5 ? "f" : "m";
    const pool = NAMES[age >= 58 ? "older" : "young"][gender].filter((x) => !used.has(x));
    const fallbackPool = [...NAMES.young[gender], ...NAMES.older[gender]].filter((x) => !used.has(x));
    const name = pick(nameRng, pool.length ? pool : fallbackPool.length ? fallbackPool : [`Guest ${index + 1}`]);
    used.add(name);
    const factor = ctx.template === "lunch_offer" ? between(rng, a.lunchSpend[0], a.lunchSpend[1]) : between(rng, a.visitSpend[0], a.visitSpend[1]);
    const usualSpend = Math.max(0.5, Math.round(ctx.baseSpend * factor * 10) / 10);
    const channels = [pick(rng, a.primary)];
    const secondary = shuffle(rng, a.secondary.filter((c) => !channels.includes(c)));
    channels.push(...secondary.slice(0, rng() < 0.35 ? 2 : 1));
    const altIds = shuffle(rng, ctx.template === "lunch_offer" ? a.lunchAlts : a.coffeeAlts).slice(0, 2);
    const alts = altIds.map((id) => (ctx.template === "lunch_offer" ? LUNCH_ALT[id] : COFFEE_ALT[id])).filter((x): x is Alternative => !!x);
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
      alts,
      job: pick(rng, a.jobs),
      routineTpl: pick(rng, ctx.template === "lunch_offer" ? a.lunchRoutine : a.coffeeRoutine),
      quirk: pick(rng, a.quirks),
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

function finish(d: Draft, i: number, ctx: PersonaContext, seed: number): Persona {
  const a = ARCHETYPES[d.segment];
  const rng = rngFor(seed, "story", d.index, d.name);
  const vars: Record<string, string> = {
    ...PRONOUNS[d.gender],
    item: ctx.item ?? "coffee",
    a_item: withArticle(ctx.item ?? "coffee"),
    cafe: ctx.cafe,
    spend: money(d.usualSpend, ctx.currency),
  };
  const routine = fill(d.routineTpl, vars);
  const lunch = ctx.template === "lunch_offer";

  const money_: Record<Persona["priceSensitivity"], string> = lunch
    ? {
        high: "Money is tight, so {s} notices every price; lunch out usually comes to about {spend}.",
        medium: "{S} doesn't count every cent but has a feel for what lunch should cost, usually about {spend}.",
        low: "Price rarely decides it for {o}; time, habit and taste do. Lunch out usually comes to about {spend}.",
      }
    : {
        high: "Money is tight, so {s} notices every price; a visit usually comes to about {spend}.",
        medium: "{S} doesn't count every cent but has a feel for what things should cost; a visit usually comes to about {spend}.",
        low: "Price rarely decides it for {o}; habit and taste do. A visit usually comes to about {spend}.",
      };
  const alternatives = joinOr(d.alts.map((x) => x.text));
  const altSentence = lunch ? `On days {s} doesn't eat here, it's usually ${alternatives}.` : `Otherwise {s} gets coffee at ${alternatives}.`;
  const channelSentence = `{S} usually hears about new things ${joinOr(d.channels.map((c) => CHANNEL_PHRASE[c] ?? c))}.`;
  const memory = pick(rng, MEMORIES[d.relationship === "new" ? "new" : "known"][d.attitude]);
  const memorySentence = `What {s} remembers about {cafe}: ${memory}.`;

  const head = [`${d.name}, ${d.age}, ${d.job}.`, `{S} ${lcFirst(routine)}`, money_[d.priceSensitivity], altSentence, channelSentence, `{S} ${d.quirk}.`];
  const extras = shuffle(rng, a.extras);
  let parts = [...head, memorySentence];
  for (const extra of extras) {
    if (wordCount(fill(parts.join(" "), vars)) >= 80) break;
    parts = [...parts.slice(0, -1), extra, memorySentence];
  }
  let story = fill(parts.join(" "), vars);
  if (wordCount(story) > 150) story = fill([head[0], head[1], head[2], head[3], head[5], memorySentence].join(" "), vars);

  return {
    id: `p${i + 1}`,
    name: d.name,
    segment: d.segment,
    segmentLabel: SEGMENT_LABEL[d.segment],
    age: d.age,
    routine,
    usualSpend: d.usualSpend,
    priceSensitivity: d.priceSensitivity,
    relationship: d.relationship,
    channels: d.channels,
    alternatives,
    quirk: ucFirst(d.quirk),
    represents: a.represents[ctx.template],
    attitude: d.attitude,
    activityLevel: d.activityLevel,
    story,
  };
}

/** Pronoun set for template text about a persona ("{S} went back…"). Derived from the name lists. */
export function pronounsFor(p: Persona): Record<string, string> {
  const f = [...NAMES.young.f, ...NAMES.older.f].includes(p.name);
  return PRONOUNS[f ? "f" : "m"];
}
