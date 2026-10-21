/**
 * Berlin for the rehearsal: which kinds of customer a Kiez roughly has, the names
 * imagined customers get, and the owner's "what if" events (BVG strike, a week of
 * rain, a new café two doors down…).
 *
 * The Kiez mixes are a labelled rough guess drawn from everyday knowledge of the
 * neighbourhoods (Mitte: offices and visitors; Neukölln, Kreuzberg, Friedrichshain:
 * freelancers, students and young families; Prenzlauer Berg: parents; Charlottenburg,
 * Steglitz: retirees and office workers…). They are NOT statistics, and every summary
 * says so. Browser-safe: no Node APIs.
 */
import type { Lang } from "../i18n/index.ts";
import type { TemplateId } from "../engine/types.ts";
import type { SegmentId } from "./types.ts";

// ---------------------------------------------------------------- Kieze

/** The Kieze the rehearsal knows (matches the engine's BERLIN_KIEZE). Proper names: never translated. */
export const SIM_KIEZE = [
  "Neukölln", "Kreuzberg", "Friedrichshain", "Prenzlauer Berg", "Mitte", "Wedding", "Moabit", "Schöneberg", "Charlottenburg",
  "Friedenau", "Pankow", "Lichtenberg", "Treptow", "Tempelhof", "Steglitz", "Köpenick", "Spandau", "Weißensee",
] as const;

export type SimKiez = (typeof SIM_KIEZE)[number];

type Profile = Partial<Record<SegmentId, number>>;

/**
 * Rough weekday mix per Kiez, as multipliers on the template's base mix (1 = average).
 * A labelled assumption for imagined customers, never data about real people.
 */
export const KIEZ_MIX: Record<SimKiez, Profile> = {
  Neukölln: { freelancer: 1.8, student: 1.8, parent: 1.3, office_worker: 0.7, tourist: 0.8, retiree: 0.8, trades: 1 },
  Kreuzberg: { freelancer: 1.8, student: 1.5, parent: 1.3, tourist: 1.3, office_worker: 0.9, retiree: 0.7 },
  Friedrichshain: { freelancer: 1.7, student: 1.8, parent: 1.2, tourist: 1.2, office_worker: 1, retiree: 0.6 },
  "Prenzlauer Berg": { parent: 2.5, freelancer: 1.4, office_worker: 1, student: 0.6, retiree: 0.8, tourist: 0.9 },
  Mitte: { office_worker: 2.2, tourist: 2.5, freelancer: 1, student: 0.8, parent: 0.6, retiree: 0.6, trades: 1 },
  Wedding: { student: 1.6, trades: 1.4, freelancer: 1.2, parent: 1.1, office_worker: 0.8, retiree: 1, tourist: 0.5 },
  Moabit: { office_worker: 1.5, trades: 1.3, student: 1.1, retiree: 1.1, tourist: 0.6 },
  Schöneberg: { freelancer: 1.2, retiree: 1.3, office_worker: 1.2, parent: 1.1, tourist: 0.9 },
  Charlottenburg: { retiree: 2, office_worker: 1.6, tourist: 1.2, parent: 0.9, student: 0.8, freelancer: 0.8 },
  Friedenau: { parent: 1.6, retiree: 1.6, freelancer: 1.1, office_worker: 0.9, student: 0.7, tourist: 0.4 },
  Pankow: { parent: 1.8, retiree: 1.4, office_worker: 1, student: 0.7, freelancer: 1, tourist: 0.4 },
  Lichtenberg: { retiree: 1.5, trades: 1.5, student: 1.2, office_worker: 1, freelancer: 0.7, tourist: 0.4 },
  Treptow: { freelancer: 1.2, parent: 1.3, retiree: 1.2, trades: 1.2, tourist: 0.6 },
  Tempelhof: { parent: 1.3, retiree: 1.4, office_worker: 1.1, trades: 1.2, tourist: 0.5 },
  Steglitz: { retiree: 2.2, office_worker: 1.4, parent: 1.2, student: 0.8, freelancer: 0.6, tourist: 0.4 },
  Köpenick: { retiree: 2, parent: 1.3, trades: 1.3, office_worker: 0.8, student: 0.6, tourist: 0.7 },
  Spandau: { retiree: 1.8, trades: 1.5, parent: 1.3, office_worker: 1, student: 0.6, freelancer: 0.6, tourist: 0.4 },
  Weißensee: { parent: 1.6, retiree: 1.4, freelancer: 1, trades: 1.2, tourist: 0.3 },
};

/**
 * Everyday flavour of a Kiez for the imagined customers: which kinds of places they go instead, an extra
 * way they hear about things, a few Kiez jobs, and one scene detail per round (src/sim/messages.ts
 * KIEZ_FLAVOUR_TEXT). Generic types only ("the Konditorei on the corner"), never real businesses. Like the
 * mix, a labelled rough guess.
 *   centre  offices, lobbies, canteens and visitors (Mitte)
 *   inner   Späti, Döner, Turkish bakery, falafel, Vietnamese (Neukölln, Kreuzberg, Friedrichshain, Wedding, Moabit)
 *   family  Kita runs, organic bakery, prams (Prenzlauer Berg, Pankow, Friedenau, Weißensee)
 *   west    retirees, Konditorei, the Italian place, the weekly market (Charlottenburg, Schöneberg, Steglitz)
 *   outer   S-Bahn commuters, the butcher's hot lunch, the Asia snack bar (Lichtenberg, Treptow, Tempelhof, Köpenick, Spandau)
 */
export type KiezFlavour = "centre" | "inner" | "family" | "west" | "outer";

export const KIEZ_FLAVOUR: Record<SimKiez, KiezFlavour> = {
  Mitte: "centre",
  Neukölln: "inner",
  Kreuzberg: "inner",
  Friedrichshain: "inner",
  Wedding: "inner",
  Moabit: "inner",
  "Prenzlauer Berg": "family",
  Pankow: "family",
  Friedenau: "family",
  Weißensee: "family",
  Charlottenburg: "west",
  Schöneberg: "west",
  Steglitz: "west",
  Lichtenberg: "outer",
  Treptow: "outer",
  Tempelhof: "outer",
  Köpenick: "outer",
  Spandau: "outer",
};

/** The flavour of a Kiez (undefined without a Kiez: a plain neighbourhood café). */
export function kiezFlavour(kiez: SimKiez | string | undefined): KiezFlavour | undefined {
  return kiez && kiez in KIEZ_FLAVOUR ? KIEZ_FLAVOUR[kiez as SimKiez] : undefined;
}

/** Base mix per template: roughly who comes into a neighbourhood café at lunch, or buys a coffee. */
export const BASE_MIX: Record<TemplateId, Record<SegmentId, number>> = {
  lunch_offer: { office_worker: 3, regular: 2, freelancer: 2, student: 1.5, trades: 1.5, parent: 1.2, retiree: 1, tourist: 0.8 },
  price_change: { regular: 3, office_worker: 2.5, freelancer: 2, student: 2, parent: 1.2, retiree: 1.2, trades: 1, tourist: 0.8 },
};

function fold(s: string): string {
  return s
    .slice(0, 60)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

const KIEZ_ALIASES: Record<string, SimKiez> = {
  prenzlberg: "Prenzlauer Berg",
  pberg: "Prenzlauer Berg",
  xberg: "Kreuzberg",
  fhain: "Friedrichshain",
  nkolln: "Neukölln",
  neukoelln: "Neukölln",
  koepenick: "Köpenick",
  weissensee: "Weißensee",
  schoeneberg: "Schöneberg",
  charlottenburgwilmersdorf: "Charlottenburg",
  wilmersdorf: "Charlottenburg",
  steglitzzehlendorf: "Steglitz",
  tempelhofschoeneberg: "Tempelhof",
  treptowkoepenick: "Treptow",
  friedrichshainkreuzberg: "Friedrichshain",
  gesundbrunnen: "Wedding",
  tiergarten: "Moabit",
};

const KIEZ_BY_FOLD = new Map<string, SimKiez>(SIM_KIEZE.map((k) => [fold(k), k]));

/** "Neukölln", "neukoelln", "Berlin-Neukölln", "Prenzlberg"… → the Kiez; "other", unknown or empty → undefined. */
export function normaliseKiez(x: unknown): SimKiez | undefined {
  if (typeof x !== "string") return undefined;
  let f = fold(x);
  if (f.startsWith("berlin")) f = f.slice(6);
  if (!f || f === "other" || f === "andere" || f === "otro" || f === "inny") return undefined;
  return KIEZ_BY_FOLD.get(f) ?? KIEZ_ALIASES[f];
}

/** Segment weights for a template in a Kiez (base mix × the Kiez profile). */
export function kiezWeights(template: TemplateId, kiez: SimKiez | undefined): Record<SegmentId, number> {
  const base = BASE_MIX[template];
  const prof = kiez ? KIEZ_MIX[kiez] : {};
  const out = {} as Record<SegmentId, number>;
  for (const s of Object.keys(base) as SegmentId[]) out[s] = base[s] * (prof[s] ?? 1);
  return out;
}

// ---------------------------------------------------------------- names

/**
 * First names for imagined Berliners: German, Turkish, Arabic, Polish, Spanish,
 * Vietnamese and international. Fictional people; names that are also common words
 * in one of the four languages (Can, Mai, Ola…) are left out so a name in a thought
 * is always a person.
 */
export const BERLIN_NAMES: Record<"young" | "older", Record<"f" | "m", string[]>> = {
  young: {
    f: [
      "Elif", "Lena", "Zeynep", "Kasia", "Agnieszka", "Yasmin", "Leila", "Priya", "Sofia", "Chiara", "Aiko", "Noor", "Ines", "Greta", "Derya",
      "Magda", "Hanna", "Amara", "Marta", "Linh", "Lucía", "Rania", "Huong", "Paula", "Nesrin", "Zofia", "Clara", "Fatima",
    ],
    m: [
      "Jonas", "Mehmet", "Emre", "Tomasz", "Piotr", "Karim", "Omar", "Lucas", "Mateo", "Felix", "Murat", "Dmitri", "Kwame", "Jan", "Bilal",
      "Rafael", "Henrik", "Yusuf", "Malte", "Kofi", "Arjun", "Minh", "Duc", "Javier", "Samir", "Paweł", "Bartek", "Lukas",
    ],
  },
  older: {
    f: ["Helga", "Ingrid", "Fatma", "Dorota", "Renate", "Gülsen", "Anke", "Barbara", "Halina", "Carmen", "Hoa", "Monika", "Leyla"],
    m: ["Wolfgang", "Hüseyin", "Klaus", "Bernd", "Jürgen", "Stanisław", "Uwe", "Rainer", "Ahmet", "Thanh", "Mahmoud", "Andrzej", "Manuel"],
  },
};

// ---------------------------------------------------------------- events

export interface BerlinEvent {
  id: string;
  text: Record<Lang, string>;
}

/**
 * Owner-injected "what if"s for a Berlin café, in the four languages. They are
 * things to rehearse, never facts about what will happen.
 */
export const BERLIN_EVENTS: readonly BerlinEvent[] = [
  {
    id: "bvg_strike",
    text: {
      en: "BVG strike: no U-Bahn, trams or buses for a day, so many people work from home.",
      de: "BVG-Streik: Einen Tag lang fahren keine U-Bahnen, Trams und Busse, viele arbeiten von zu Hause.",
      es: "Huelga de la BVG: un día sin metro, tranvías ni autobuses, así que mucha gente trabaja desde casa.",
      pl: "Strajk BVG: przez jeden dzień nie jeżdżą metro, tramwaje ani autobusy, więc wiele osób pracuje z domu.",
    },
  },
  {
    id: "rain_week",
    text: {
      en: "It rains all week.",
      de: "Es regnet die ganze Woche.",
      es: "Llueve toda la semana.",
      pl: "Przez cały tydzień pada deszcz.",
    },
  },
  {
    id: "heatwave",
    text: {
      en: "Heatwave: 32 °C all week.",
      de: "Hitzewelle: die ganze Woche 32 °C.",
      es: "Ola de calor: 32 °C toda la semana.",
      pl: "Fala upałów: przez cały tydzień 32 °C.",
    },
  },
  {
    id: "baustelle",
    text: {
      en: "Roadworks (a Baustelle) outside: the pavement is half closed for a week.",
      de: "Baustelle vor der Tür: Der Gehweg ist eine Woche lang halb gesperrt.",
      es: "Obras delante de la puerta: la acera está medio cortada durante una semana.",
      pl: "Roboty drogowe przed wejściem: chodnik jest przez tydzień w połowie zamknięty.",
    },
  },
  {
    id: "school_holidays",
    text: {
      en: "Berlin school holidays start: many families and students are away.",
      de: "In Berlin beginnen die Schulferien: Viele Familien und Studierende sind verreist.",
      es: "Empiezan las vacaciones escolares en Berlín: muchas familias y estudiantes están fuera.",
      pl: "W Berlinie zaczynają się ferie szkolne: wiele rodzin i studentów wyjechało.",
    },
  },
  {
    id: "rival_lunch",
    text: {
      en: "A new café opens two doors down with an €8.50 lunch.",
      de: "Zwei Häuser weiter eröffnet ein neues Café mit Mittagstisch für 8,50 €.",
      es: "Abre un café nuevo dos portales más allá con un menú del día de 8,50 €.",
      pl: "Dwa budynki dalej otwiera się nowa kawiarnia z lunchem za 8,50 €.",
    },
  },
  {
    id: "street_festival",
    text: {
      en: "A big Kiez street festival from Friday to Sunday: the street is full of people.",
      de: "Großes Straßenfest im Kiez von Freitag bis Sonntag: Die Straße ist voller Menschen.",
      es: "Gran fiesta de barrio de viernes a domingo: la calle está llena de gente.",
      pl: "Duży festyn uliczny w okolicy od piątku do niedzieli: ulica jest pełna ludzi.",
    },
  },
  {
    id: "christmas_market",
    text: {
      en: "The Christmas market opens on the square round the corner.",
      de: "Auf dem Platz um die Ecke öffnet der Weihnachtsmarkt.",
      es: "Abre el mercado navideño en la plaza de la esquina.",
      pl: "Na placu za rogiem otwiera się jarmark bożonarodzeniowy.",
    },
  },
];

export type BerlinEventId = "bvg_strike" | "rain_week" | "heatwave" | "baustelle" | "school_holidays" | "rival_lunch" | "street_festival" | "christmas_market";

const EVENT_BY_ID = new Map(BERLIN_EVENTS.map((e) => [e.id, e]));

/** The Berlin event an id or any of its translations names, if any. */
export function findBerlinEvent(idOrText: string): BerlinEvent | undefined {
  const s = idOrText.trim();
  const byId = EVENT_BY_ID.get(s.toLowerCase().replace(/[\s-]+/g, "_"));
  if (byId) return byId;
  const low = s.toLowerCase();
  return BERLIN_EVENTS.find((e) => Object.values(e.text).some((t) => t.toLowerCase() === low));
}

/** An event's text in a language. */
export function berlinEventText(id: string, lang: Lang): string | undefined {
  return EVENT_BY_ID.get(id)?.text[lang];
}

export type EventEffect = "rain" | "heat" | "competitor" | "buzz" | "busy" | "quiet" | "works" | "wfh" | "holiday" | "festival" | "xmas";

/**
 * What a Berlin event does to the rule-based stand-in (free-text events are read by keywords instead).
 * wfh: commuters stay home, people who live in the Kiez are around more. works: the board is half hidden
 * and prams and take-away customers avoid the pavement. busy: more people on the street (noticing, visitors,
 * queues); festival and xmas add their own food stalls.
 */
export const EVENT_EFFECTS: Record<BerlinEventId, readonly EventEffect[]> = {
  bvg_strike: ["wfh"],
  rain_week: ["rain"],
  heatwave: ["heat"],
  baustelle: ["works"],
  school_holidays: ["quiet", "holiday"],
  rival_lunch: ["competitor"],
  street_festival: ["busy", "festival"],
  christmas_market: ["busy", "xmas"],
};

/**
 * How many rounds a Berlin event lasts, from the round it comes before: a day or a weekend is one round,
 * a week two (rounds 1-2 are the first week, 3-4 the second), the holidays, the new café and the
 * Christmas market stay. Free-text events stay too.
 */
export const EVENT_ROUNDS: Record<BerlinEventId, number> = {
  bvg_strike: 1,
  rain_week: 2,
  heatwave: 2,
  baustelle: 2,
  school_holidays: 99,
  rival_lunch: 99,
  street_festival: 1,
  christmas_market: 99,
};

// ---------------------------------------------------------------- demo

/**
 * Seeds for the site's demo rehearsal (src/report/demo.ts): with these, the rule-based
 * run tells a story in every language (someone notices, tries, comes back and tells a
 * friend; someone stays sceptical). Languages share the seed: the same seed gives the
 * same people and the same story in de, en, es and pl.
 *   lunch 8 (Neukölln, the new café before round 3): Fatima and Leyla notice the board; Noor tries
 *   it; Thanh tries it and tells his neighbours, and Fatima, Sofia and Leyla hear it from him; Thanh,
 *   Murat and Noor keep coming; sceptical Leyla tries the new café two doors down.
 *   price 17: Lukas and Felix grumble out loud; Amara and Hanna hear it and buy less; Hoa and Felix
 *   recommend the café anyway; Rafael and Lukas keep buying.
 */
export const DEMO_SEEDS: Record<TemplateId, number> = { lunch_offer: 8, price_change: 17 };

/** The demo's owner event and the round it is injected before (lunch offer only). */
export const DEMO_EVENT_ID: BerlinEventId = "rival_lunch";
export const DEMO_EVENT_ROUND = 3;
