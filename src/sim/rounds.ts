/**
 * The change as customers see it, and the rounds of the rehearsal.
 *
 * Each round is a concrete, sensory moment ("Tuesday of the first week, 12:30…")
 * with a small menu of café-specific actions, always including "not around".
 * Public actions (telling a friend, a review, grumbling out loud) go into the
 * neighbourhood feed that later rounds see. Positive actions count toward
 * "engaged with the change": for a lunch offer, noticing or using the deal;
 * for a price change, still buying at the new price.
 *
 * This file also holds the words the rule-based stand-in uses, so a run
 * without any model still reads like people.
 */
import type { Analysis, TemplateId } from "../engine/types.ts";
import type { FeedItem, RoundAction, RoundSpec } from "./types.ts";

// ---------------------------------------------------------------- text helpers

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " };

/** A price with cents, in the analysis currency ("€9.90"). */
export function money(n: number, currency = "EUR"): string {
  return `${SYMBOL[currency] ?? "€"}${Math.abs(n).toFixed(2)}`;
}

/** A small difference in words ("30 cents"), or money when it is a euro or more. */
export function difference(n: number, currency = "EUR"): string {
  const abs = Math.abs(n);
  if (abs >= 1 - 1e-9) return money(abs, currency);
  const c = Math.round(abs * 100);
  return currency === "GBP" ? `${c}p` : `${c} cents`;
}

/** Replaces {name} placeholders; unknown ones are left as they are. */
export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

const NUMBER_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

// ---------------------------------------------------------------- the change

export interface ChangeContext {
  template: TemplateId;
  /** The café's name as customers know it. */
  cafe: string;
  currency: string;
  /** Exactly what the sign says. */
  board: string;
  /** One line for the report ("Lunch deal: soup, sandwich and a drink for €9.90, weekdays 11:30–14:30"). */
  change: string;
  /** The café's own post at the top of the neighbourhood feed. */
  announcement: string;
  /** The owner is paying to promote it (only whether, never how much). */
  promoted: boolean;
  /** "two-week": the test length as an adjective. */
  testLength: string;
  offerPrice: number;
  contents: string;
  hours: string;
  item: string;
  oldPrice: number;
  newPrice: number;
  /** What personas' usual spend is scaled from: the lunch spend, or the item's current price. */
  baseSpend: number;
}

function inputNum(a: Analysis, key: string): number | undefined {
  const v = a.inputs.find((i) => i.key === key)?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function inputStr(a: Analysis, key: string): string | undefined {
  const v = a.inputs.find((i) => i.key === key)?.value;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** "Café Lindenblatt (demo café, Berlin-Neukölln)" → "Café Lindenblatt". */
export function cafeName(business: string): string {
  const name = (business || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return name || "the café";
}

function lengthAdjective(days: number, perWeek: number): string {
  const weeks = days / perWeek;
  if (Number.isInteger(weeks) && weeks >= 1 && weeks < NUMBER_WORD.length) return `${NUMBER_WORD[weeks]}-week`;
  return `${Math.round(days)}-day`;
}

/** Reads the change from the analysis inputs. Uses only what a customer could see; never costs. */
export function changeContext(a: Analysis): ChangeContext {
  const cafe = cafeName(a.business);
  const currency = a.currency || "EUR";
  const m = (n: number) => money(n, currency);
  const promoted = (inputNum(a, "marketing_per_week") ?? 0) > 0;
  const hours = "11:30–14:30";
  if (a.template === "price_change") {
    const item = inputStr(a, "item") ?? "flat white";
    const Item = item.charAt(0).toUpperCase() + item.slice(1);
    const oldPrice = inputNum(a, "current_price") ?? 3.9;
    const newPrice = inputNum(a, "new_price") ?? oldPrice;
    const cut = newPrice < oldPrice;
    const board = cut ? `${Item} ${m(newPrice)} (was ${m(oldPrice)})` : `${Item} ${m(newPrice)}`;
    return {
      template: a.template,
      cafe,
      currency,
      board,
      change: `${Item} now ${m(newPrice)} (was ${m(oldPrice)})`,
      announcement: cut ? `Good news: our ${item} is now ${m(newPrice)} (was ${m(oldPrice)}).` : `New price on the board by the till: ${Item} ${m(newPrice)}.`,
      promoted,
      testLength: lengthAdjective(inputNum(a, "test_days") ?? 14, 7),
      offerPrice: newPrice,
      contents: item,
      hours,
      item,
      oldPrice,
      newPrice,
      baseSpend: oldPrice,
    };
  }
  const offerPrice = inputNum(a, "offer_price") ?? 9.9;
  const contents = inputStr(a, "offer_description") ?? inputStr(a, "offer_contents") ?? inputStr(a, "offer_items") ?? "soup, sandwich and a drink";
  const board = `Lunch deal — ${contents} for ${m(offerPrice)}, weekdays ${hours}`;
  const baseSpend = inputNum(a, "lunch_spend") ?? inputNum(a, "avg_spend") ?? 10;
  return {
    template: a.template,
    cafe,
    currency,
    board,
    change: `Lunch deal: ${contents} for ${m(offerPrice)}, weekdays ${hours}`,
    announcement: promoted
      ? `New: lunch deal — ${contents} for ${m(offerPrice)}, weekdays ${hours}. (Sponsored post, shown to people nearby.)`
      : `New from Monday: lunch deal — ${contents} for ${m(offerPrice)}, weekdays ${hours}.`,
    promoted,
    testLength: lengthAdjective(inputNum(a, "test_days") ?? 10, 5),
    offerPrice,
    contents,
    hours,
    item: "lunch",
    oldPrice: offerPrice,
    newPrice: offerPrice,
    baseSpend,
  };
}

// ---------------------------------------------------------------- actions

function act(id: string, label: string, flags: { public?: boolean; positive?: boolean } = {}): RoundAction {
  return { id, label, public: !!flags.public, positive: !!flags.positive };
}

/** Every action any round can offer. */
export const ACTIONS: Record<string, RoundAction> = Object.fromEntries(
  [
    act("not_around", "Not around this time"),
    // lunch offer
    act("notices_offer", "Notices the offer", { positive: true }),
    act("ignores", "Doesn't pay attention to it"),
    act("tries_deal", "Orders the lunch deal", { positive: true }),
    act("usual_order", "Has the usual order instead"),
    act("eats_elsewhere", "Has lunch somewhere else"),
    act("skips_lunch_out", "Skips lunch out (home-made or nothing)"),
    act("comes_back_for_deal", "Comes back for the deal", { positive: true }),
    act("back_to_usual", "Back to the usual order"),
    act("tells_a_friend", "Tells a friend or colleague about it", { public: true, positive: true }),
    act("keeps_coming", "Keeps coming at lunchtime", { positive: true }),
    act("posts_review", "Posts a review or comment online", { public: true, positive: true }),
    act("complains", "Complains about it (to staff or online)", { public: true }),
    act("forgets_about_it", "Forgets about it"),
    act("still_comes_for_lunch", "Still comes for lunch most weeks", { positive: true }),
    act("comes_now_and_then", "Has the deal now and then", { positive: true }),
    act("back_to_old_habits", "Back to old lunch habits"),
    act("recommends_it", "Recommends the deal to someone", { public: true, positive: true }),
    // price change
    act("accepts", "Notices and accepts it", { positive: true }),
    act("grumbles", "Grumbles about it out loud", { public: true }),
    act("does_not_notice", "Doesn't notice", { positive: true }),
    act("buys_as_usual", "Buys as usual", { positive: true }),
    act("buys_less_often", "Buys it less often"),
    act("switches_to_cheaper_item", "Switches to something cheaper"),
    act("goes_elsewhere", "Gets it somewhere else"),
    act("keeps_buying", "Keeps buying it", { positive: true }),
    act("tells_friend_it_is_pricey", "Tells a friend it has got pricey", { public: true }),
    act("forgot_about_it", "Has forgotten about the change", { positive: true }),
    act("stays_away", "Stays away"),
    act("stays_a_customer", "Stays a customer as before", { positive: true }),
    act("buys_less_than_before", "Buys less than before"),
    act("recommends_cafe_anyway", "Recommends the café anyway", { public: true, positive: true }),
    act("mentions_price_in_review", "Mentions the price in a review", { public: true }),
    act("still_buys_regularly", "Still buys it regularly", { positive: true }),
    act("buys_now_and_then", "Buys it now and then"),
    act("found_somewhere_cheaper", "Has found somewhere cheaper"),
    act("recommends_cafe", "Recommends the café to someone", { public: true, positive: true }),
  ].map((a) => [a.id, a]),
);

/** Where a public action shows up in the neighbourhood feed. */
export const FEED_KIND: Record<string, FeedItem["kind"]> = {
  tells_a_friend: "word_of_mouth",
  posts_review: "review",
  complains: "word_of_mouth",
  recommends_it: "word_of_mouth",
  grumbles: "word_of_mouth",
  tells_friend_it_is_pricey: "word_of_mouth",
  recommends_cafe_anyway: "word_of_mouth",
  mentions_price_in_review: "review",
  recommends_cafe: "word_of_mouth",
};

/** Action groups the summary counts with (descriptive only). */
export const GROUPS = {
  /** Lunch offer: did something that clearly shows they took in the deal (not just carrying on as usual). */
  lunchNoticed: new Set(["notices_offer", "tries_deal", "comes_back_for_deal", "tells_a_friend", "posts_review", "complains", "comes_now_and_then", "recommends_it"]),
  lunchTried: new Set(["tries_deal", "comes_back_for_deal"]),
  /** Counts as coming back when it follows a first try in an earlier round. */
  lunchReturn: new Set(["comes_back_for_deal", "keeps_coming", "still_comes_for_lunch", "comes_now_and_then"]),
  priceNoticed: new Set([
    "accepts", "grumbles", "buys_less_often", "switches_to_cheaper_item", "goes_elsewhere", "tells_friend_it_is_pricey", "stays_away",
    "buys_less_than_before", "recommends_cafe_anyway", "mentions_price_in_review", "found_somewhere_cheaper", "buys_now_and_then", "forgot_about_it",
  ]),
  priceReduced: new Set(["buys_less_often", "switches_to_cheaper_item", "goes_elsewhere", "stays_away", "buys_less_than_before", "buys_now_and_then", "found_somewhere_cheaper"]),
  priceElsewhere: new Set(["goes_elsewhere", "stays_away", "found_somewhere_cheaper"]),
  /** Turning away from the café or the change (for "who told whom" links of the negative kind). */
  negative: new Set([
    "eats_elsewhere", "complains", "back_to_old_habits", "grumbles", "buys_less_often", "switches_to_cheaper_item", "goes_elsewhere",
    "tells_friend_it_is_pricey", "stays_away", "buys_less_than_before", "mentions_price_in_review", "buys_now_and_then", "found_somewhere_cheaper",
  ]),
  /** Positive actions that are only noticing, not acting (do not count as being won over by word of mouth). */
  noticeOnly: new Set(["notices_offer", "accepts", "does_not_notice", "forgot_about_it"]),
} as const;

// ---------------------------------------------------------------- rounds

function acts(...ids: string[]): RoundAction[] {
  return ids.map((id) => {
    const a = ACTIONS[id];
    if (!a) throw new Error(`Unknown action ${id}`);
    return { ...a };
  });
}

type Draft = Omit<RoundSpec, "n">;

function lunchRounds(c: ChangeContext, count: number): Draft[] {
  const r1: Draft = {
    title: "Launch day: the board goes up",
    situation: `Monday, 8:30. A chalkboard goes up on the pavement outside ${c.cafe}. The board outside says: "${c.board}". The same offer is chalked above the counter${
      c.promoted ? ", and a sponsored Instagram post shows a photo of the board to people nearby." : ", and the café posts a photo of the board on Instagram."
    }`,
    actions: acts("notices_offer", "ignores", "not_around"),
  };
  const r2: Draft = {
    title: "First week, Tuesday 12:30",
    situation: `Tuesday of the first week, 12:30. The lunch rush is starting and the board outside still says: "${c.board}". Through the window: a short queue, a pot of red lentil soup steaming on the counter, sandwiches stacked under glass.`,
    actions: acts("tries_deal", "usual_order", "eats_elsewhere", "skips_lunch_out", "not_around"),
  };
  const r3: Draft = {
    title: "Second week",
    situation: `Wednesday of the second week, 12:45. The deal is still on the board outside ${c.cafe}: "${c.board}". Most tables are taken, the coffee machine is hissing, and two people in work boots are waiting for their order to go.`,
    actions: acts("comes_back_for_deal", "back_to_usual", "tells_a_friend", "eats_elsewhere", "not_around"),
  };
  const r4: Draft = {
    title: "After the test",
    situation: `Friday at the end of the ${c.testLength} test, 12:30. A note has appeared under the board: "Lunch deal: we're deciding whether to keep it. Tell us what you think!" The rest of the menu is the same as always.`,
    actions: acts("keeps_coming", "posts_review", "complains", "forgets_about_it", "not_around"),
  };
  const r5: Draft = {
    title: "A month later",
    situation: `A month later, a grey Wednesday at 12:30. The owner has kept the deal and the board still says: "${c.board}". Some lunchtime faces are new; some are the same as ever.`,
    actions: acts("still_comes_for_lunch", "comes_now_and_then", "back_to_old_habits", "recommends_it", "not_around"),
  };
  if (count <= 3) {
    const end: Draft = {
      title: "Second week and the end of the test",
      situation: `The second week of the ${c.testLength} test, Thursday 12:45. The deal is still on the board outside ${c.cafe}: "${c.board}". A note has appeared under it: "We're deciding whether to keep it. Tell us what you think!"`,
      actions: acts("comes_back_for_deal", "back_to_usual", "tells_a_friend", "complains", "forgets_about_it", "not_around"),
    };
    return [r1, r2, end];
  }
  return count === 4 ? [r1, r2, r3, r4] : [r1, r2, r3, r4, r5];
}

function priceRounds(c: ChangeContext, count: number): Draft[] {
  const m = (n: number) => money(n, c.currency);
  const r1: Draft = {
    title: "Sees the new price",
    situation: `Monday morning at ${c.cafe}. The menu board above the till has been updated: "${c.board}". Last week it said ${m(c.oldPrice)}. Nothing else on the board has changed, and nobody at the counter mentions it.`,
    actions: acts("accepts", "grumbles", "does_not_notice", "not_around"),
  };
  const r2: Draft = {
    title: "Next visit",
    situation: `A few days later, 8:45, a queue of three at the till. The board still says "${c.board}". The smell of fresh croissants, the grinder going, and the barista asking the person in front: "The usual?"`,
    actions: acts("buys_as_usual", "buys_less_often", "switches_to_cheaper_item", "goes_elsewhere", "not_around"),
  };
  const r3: Draft = {
    title: "Two weeks later",
    situation: `Two weeks after the change, mid-morning. The board still says "${c.board}"; by now it is simply the price. At the table by the door, two people are comparing where to get coffee in the neighbourhood.`,
    actions: acts("keeps_buying", "tells_friend_it_is_pricey", "forgot_about_it", "stays_away", "not_around"),
  };
  const r4: Draft = {
    title: "After the test",
    situation: `The end of the ${c.testLength} test: the owner keeps the new price. Thursday, 9:00, a queue of four at the till; the board still reads "${c.board}". A new review card holder has appeared next to the tip jar.`,
    actions: acts("stays_a_customer", "buys_less_than_before", "recommends_cafe_anyway", "mentions_price_in_review", "not_around"),
  };
  const r5: Draft = {
    title: "A month later",
    situation: `A month after the change. "${c.board}" is just the price now; new customers have never known anything else. A wet Tuesday morning, the window fogged up.`,
    actions: acts("still_buys_regularly", "buys_now_and_then", "found_somewhere_cheaper", "recommends_cafe", "not_around"),
  };
  if (count <= 3) {
    const end: Draft = {
      title: "Two weeks later: the end of the test",
      situation: `Two weeks after the change, the end of the ${c.testLength} test. The board still says "${c.board}"; the owner is keeping it. At the table by the door, two people are comparing where to get coffee in the neighbourhood.`,
      actions: acts("keeps_buying", "tells_friend_it_is_pricey", "forgot_about_it", "stays_away", "recommends_cafe_anyway", "not_around"),
    };
    return [r1, r2, end];
  }
  return count === 4 ? [r1, r2, r3, r4] : [r1, r2, r3, r4, r5];
}

/** The rounds for this change: 3–5 (default 4). */
export function buildRounds(c: ChangeContext, count: number): RoundSpec[] {
  const n = Math.min(5, Math.max(3, Math.round(count)));
  const drafts = c.template === "price_change" ? priceRounds(c, n) : lunchRounds(c, n);
  return drafts.map((d, i) => ({ n: i + 1, ...d }));
}

// ---------------------------------------------------------------- words for the rule-based stand-in

export type Cond =
  | "cheaper" | "pricier" | "sensitive" | "relaxed" | "fan" | "sceptic" | "regular" | "new" | "tried" | "untried" | "heard"
  | "rain" | "competitor" | "buzz" | "busy" | "quiet" | "drop" | "rise" | "tourist" | "grumbled";

export interface Line {
  t: string;
  /** All conditions must hold. Lines without conditions fit anyone. */
  when?: Cond[];
}

export interface ActionText {
  thought: Line[];
  diary: Line[];
  says?: Line[];
}

const L = (t: string, ...when: Cond[]): Line => (when.length ? { t, when } : { t });

/**
 * Placeholders: {price} deal price or new price, {old} old price, {diff} the rise in words, {usual} usual spend,
 * {alt}/{Alt} somewhere else, {cafe}, {contents}, {item}, {Item}, {a_item}, {friend}, {verdict}, {cheaper}.
 */
export const ACTION_TEXT: Record<string, ActionText> = {
  not_around: {
    thought: [L("Already gone home; I was only in town for a few days.", "tourist"), L("Not around this time.")],
    diary: [L("Wasn't around.")],
  },
  notices_offer: {
    thought: [
      L("{price} for {contents}? That's less than my usual {usual}. Noted.", "cheaper"),
      L("Saw the board. {price} is more than I usually spend on lunch, but it's a full meal. Maybe one day.", "pricier"),
      L("New board outside. I'll ask the staff what's in the sandwich next time I'm in.", "regular"),
      L("I'd already seen it mentioned somewhere, and there's the board. A fixed price at least tells you what you'll pay.", "buzz"),
      L("Someone mentioned it, and now I see the board. Fine, noted.", "heard"),
      L("Noticed the lunch deal on my way past. Filed under 'maybe'."),
      L("A lunch deal at {cafe}. Could be handy on a busy day."),
      L("Read the board while waiting at the crossing. A fixed-price lunch, good to know."),
    ],
    diary: [L("{cafe} has a lunch deal now: {price}."), L("Saw the lunch deal board. Maybe try it.")],
  },
  ignores: {
    thought: [
      L("Saw a chalkboard, didn't read it. Lunch out isn't in my budget this week.", "sensitive"),
      L("Head down in the rain, hood up. I didn't look at anything.", "rain"),
      L("There are chalkboards everywhere round here. I don't read them all.", "new"),
      L("Didn't really look at the board. Other things on my mind this morning."),
      L("Walked straight past. I'd already decided where I was eating today."),
      L("Saw the board out of the corner of my eye. Didn't stop."),
      L("Busy morning. If there was a new sign, it didn't register."),
    ],
    diary: [L("Nothing much to remember about {cafe} this week."), L("Busy week; didn't notice anything new.")],
  },
  tries_deal: {
    thought: [
      L("{price} for {contents} is less than my usual {usual}, so why not. Quick, and I know what I'm paying.", "cheaper"),
      L("It's more than I usually spend, but I was hungry and it's a proper meal. Just this once.", "pricier"),
      L("Tried the deal instead of my usual. The soup was good; the sandwich was a bit small.", "regular"),
      L("Someone said the deal was decent, so I gave it a go.", "heard"),
      L("Fixed price, no decisions, out in twenty minutes. That's all I want from lunch."),
      L("Tried the lunch deal. Fast and filling, nothing special, but fine for a weekday."),
    ],
    diary: [L("Had the lunch deal at {cafe}: {verdict}.")],
  },
  usual_order: {
    thought: [
      L("I know what I like. My usual is my usual, deal or no deal.", "regular"),
      L("Had my usual. The deal looks fine; I just didn't feel like soup.", "relaxed"),
      L("The deal isn't cheaper than what I normally get, so why change.", "pricier"),
      L("Looked at the deal, then ordered my usual anyway. Habit."),
      L("Stuck to what I always order. Didn't feel like changing."),
      L("Ordered what I always have. The deal is fine, it just isn't what I came for."),
    ],
    diary: [L("Had my usual at {cafe}; skipped the deal.")],
  },
  eats_elsewhere: {
    thought: [
      L("Everyone's talking about the new place, so I went to compare. Cheaper, too.", "competitor"),
      L("{Alt} is cheaper. {price} is a lot for me on a normal weekday.", "sensitive"),
      L("I'm not sure {cafe} is quick enough at lunch. Went to {alt} instead.", "sceptic"),
      L("Ended up at {alt} today. Nothing against the café, it just happened."),
      L("Went to {alt}. Quicker, and I wasn't in the mood for soup."),
      L("Went to {alt}. It's on my way and I didn't think twice."),
    ],
    diary: [L("Ate at {alt} instead.")],
  },
  skips_lunch_out: {
    thought: [
      L("Brought lunch from home. Eating out every day adds up.", "sensitive"),
      L("With this weather I stayed in and ate what I had.", "rain"),
      L("Too busy for a proper break today; ate at my desk."),
      L("No lunch out this week. Leftovers from last night."),
    ],
    diary: [L("Home-made lunch this week; saved a bit.")],
  },
  comes_back_for_deal: {
    thought: [
      L("Back for the deal. Cheaper than my usual and quick; it could become my Wednesday thing.", "tried", "cheaper"),
      L("People keep mentioning the deal, so I finally tried it. Not bad at all.", "untried", "heard"),
      L("Finally gave the deal a go. Should have done it last week.", "untried"),
      L("Came back for the deal. Same as last time, which is the point.", "tried"),
      L("Went for the lunch deal today. Easy choice, and that counts at lunchtime."),
    ],
    diary: [L("Back for the lunch deal; it's becoming a habit.", "tried"), L("Tried the lunch deal at last.", "untried"), L("Had the lunch deal at {cafe}.")],
  },
  back_to_usual: {
    thought: [
      L("Tried the deal last week; this week I wanted my usual again. The deal's fine, my usual is better.", "tried"),
      L("Same as always. The deal isn't for me.", "regular"),
      L("Back to my normal order. Nothing wrong with the deal, it's just not my thing."),
    ],
    diary: [L("Back to my usual order at {cafe}.")],
  },
  tells_a_friend: {
    thought: [
      L("I like this place and want it to do well, so I told {friend} about the deal.", "fan"),
      L("Told {friend} about the deal. Cheap enough for a weekday, and quick.", "cheaper"),
      L("Mentioned the deal to {friend}, with a warning to go before the rush.", "sceptic"),
      L("Told {friend} about the lunch deal. We might go together next week."),
    ],
    says: [
      L("If you're near {cafe}, the lunch deal is decent: {contents} for {price}.", "cheaper"),
      L("{cafe} does a lunch deal now. Good soup. Go before half twelve, it gets busy.", "sceptic"),
      L("Lunch at {cafe} is {price} now for {contents}. Not bad."),
      L("Try the lunch deal at {cafe}, it's quick if you're on a short break."),
    ],
    diary: [L("Told {friend} about the lunch deal.")],
  },
  complains: {
    thought: [
      L("Lunch got busy and my usual took ages. I told the staff, politely.", "regular"),
      L("The sandwich was smaller than it looked on the board. I said so.", "tried"),
      L("{price} for that? I said what I thought.", "pricier"),
      L("Since the deal started it's crowded at noon. Someone should say it, so I did."),
    ],
    says: [
      L("Since the lunch deal, the window tables are always taken.", "regular"),
      L("The sandwich in the deal is small for the price.", "tried"),
      L("The deal's fine, but the queue at 12:30 is too long now."),
    ],
    diary: [L("Told them the deal sandwich was small.", "tried"), L("Complained about the lunchtime crowd.")],
  },
  posts_review: {
    thought: [
      L("Left a short review on Google Maps. People nearby should know about the deal.", "fan"),
      L("Wrote an honest review: good soup, slow at the busiest time.", "sceptic"),
      L("Posted a quick review. The deal was good value, so why not say so.", "cheaper"),
      L("Left a few lines online about the lunch deal."),
    ],
    says: [
      L("Solid weekday lunch deal: {contents} for {price}. Quick and friendly.", "cheaper"),
      L("Good soup, small sandwich, fair price. Gets busy around 12:30.", "sceptic"),
      L("Nice neighbourhood café with a decent lunch deal at {price}."),
    ],
    diary: [L("Posted a review of {cafe}.")],
  },
  keeps_coming: {
    thought: [
      L("The deal is part of my week now. Twice a week, probably.", "tried", "cheaper"),
      L("I keep coming like always. Deal or not, this is my café.", "regular"),
      L("Heard enough good things to keep it on my list for lunch.", "heard", "untried"),
      L("I'll keep coming at lunchtime, at least while the deal lasts."),
      L("Still coming at lunchtime. The board is part of the furniture now."),
    ],
    diary: [L("Lunch at {cafe} a couple of times a week now.")],
  },
  forgets_about_it: {
    thought: [
      L("Never got round to trying it. It slipped my mind.", "untried"),
      L("Had it once, then forgot about it. Nothing against it.", "tried"),
      L("Honestly, I forgot the deal existed. Lunch is whatever's closest."),
      L("The deal never really stuck in my head. I eat wherever is nearest when I'm hungry."),
    ],
    diary: [L("Forgot about the lunch deal.")],
  },
  still_comes_for_lunch: {
    thought: [
      L("Still my lunch place most weeks. The deal made it an easy habit.", "tried"),
      L("Same as ever. I come for lunch, deal or no deal.", "regular"),
      L("Still come here for lunch most weeks."),
    ],
    diary: [L("Still lunch at {cafe} most weeks.")],
  },
  comes_now_and_then: {
    thought: [L("Now and then, when I'm near and short of time. It's a good fallback.", "tried"), L("I go for the deal now and then. Not every week.")],
    diary: [L("The lunch deal now and then.")],
  },
  back_to_old_habits: {
    thought: [
      L("Back to bringing lunch from home. Cheaper.", "sensitive"),
      L("The novelty wore off. Back to {alt} most days.", "tried"),
      L("Back to my old routine. The deal never really became my thing."),
    ],
    diary: [L("Back to my old lunch routine.")],
  },
  recommends_it: {
    thought: [L("Recommended the deal to {friend}. It's been reliable.", "tried"), L("Told {friend} it's worth a try. I like the place.")],
    says: [L("The lunch deal at {cafe} is reliable: {contents} for {price}."), L("If you need a quick lunch, {cafe} is a safe bet.")],
    diary: [L("Recommended the lunch deal to {friend}.")],
  },
  // ---- price change
  accepts: {
    thought: [
      L("Oh, it's cheaper now. Nice.", "drop"),
      L("{price} instead of {old}. Everything's gone up; still worth it for the coffee here.", "relaxed", "rise"),
      L("Noticed the new price. Fair enough, they're good to me here.", "fan"),
      L("{diff} more. I'm not changing cafés over that.", "rise"),
      L("Saw the new price. Still a fair price for round here."),
      L("Noticed the board. Prices go up everywhere; this one's still fine."),
    ],
    diary: [L("{Item} is {price} now. Fine.")],
  },
  grumbles: {
    thought: [
      L("{price}? That's {diff} more every time, and I come most days. Said so to the barista, half joking.", "regular"),
      L("Prices keep going up and the cups don't get bigger. Said it out loud.", "sceptic"),
      L("Every euro counts for me. I grumbled, then paid.", "sensitive"),
      L("I grumbled about the new price. Then I paid, like everyone does."),
    ],
    says: [
      L("{price} for {a_item} now. It adds up when you come every day.", "regular"),
      L("{diff} more for the same {item}. Hm.", "rise"),
      L("Another price rise? It's getting pricey here."),
    ],
    diary: [L("Grumbled about the {item} going up to {price}.")],
  },
  does_not_notice: {
    thought: [
      L("I don't know what it cost before. Seems normal for round here.", "new"),
      L("Didn't look at the board. Tapped my card and went."),
      L("Ordered my {item} and paid. Didn't notice anything different."),
      L("I just ordered. I couldn't tell you what's on the board."),
      L("Paid by card without looking at the amount."),
    ],
    diary: [L("Usual {item}, nothing special.")],
  },
  buys_as_usual: {
    thought: [
      L("Ordered the usual. The price is the price; I like it here.", "fan"),
      L("Same order as always. It's {diff} more, I'll live.", "relaxed", "rise"),
      L("Bought my {item} as usual. Didn't think about it much."),
      L("Same as always: one {item}, a quick chat, out the door."),
      L("Usual order. I barely looked at the board."),
    ],
    diary: [L("Usual {item} at {cafe}.")],
  },
  buys_less_often: {
    thought: [
      L("I'll make coffee at home on some days now. {diff} every time adds up.", "sensitive", "rise"),
      L("Still come, just not every day. The new price made me count.", "regular"),
      L("Skipping it on a couple of days a week now. Not a protest, just a budget."),
    ],
    diary: [L("Buying the {item} less often since it went up.")],
  },
  switches_to_cheaper_item: {
    thought: [
      L("Switched to {cheaper}. Same café, smaller bill.", "sensitive"),
      L("Looked at the board and picked {cheaper}. The {item} isn't worth {price} to me."),
      L("Had {cheaper} instead. Honestly fine."),
    ],
    diary: [L("Switched to {cheaper} instead of the {item}.")],
  },
  goes_elsewhere: {
    thought: [
      L("The new place everyone mentions is cheaper, so I went there.", "competitor"),
      L("Went to {alt} instead. If it's going to cost that much, I'll shop around.", "sceptic"),
      L("{Alt} does it for less. Tried them this time.", "sensitive"),
      L("Got my coffee at {alt} today. Wanted to compare."),
    ],
    diary: [L("Got it at {alt} instead.")],
  },
  keeps_buying: {
    thought: [
      L("Still buying it. I stopped thinking about the price after a few days.", "relaxed"),
      L("Still my place. The {item} is good, and that matters more.", "fan"),
      L("Keep buying it as before. The price is just the price now."),
      L("Still buying it. Coffee is the one treat I don't count."),
    ],
    diary: [L("Still buying the {item} here.")],
  },
  tells_friend_it_is_pricey: {
    thought: [L("Told {friend} the {item} here has got pricey. Just saying.", "grumbled"), L("Mentioned to {friend} that prices went up. People should know.")],
    says: [L("{cafe} put the {item} up to {price}. Getting pricey."), L("The {item} at {cafe} costs {price} now, just so you know.")],
    diary: [L("Told {friend} {cafe} has got pricier.")],
  },
  forgot_about_it: {
    thought: [L("What price change? I just pay.", "relaxed"), L("I've forgotten what it used to cost. It's just the price now."), L("Honestly, I couldn't tell you what it used to cost.")],
    diary: [L("Don't think about the price anymore.")],
  },
  stays_away: {
    thought: [
      L("Not going back for a while. The new place is cheaper.", "competitor"),
      L("Haven't been back since. {Alt} is fine and cheaper.", "sensitive"),
      L("Staying away for now. It's a small thing, but it bugged me."),
    ],
    diary: [L("Stayed away from {cafe}.")],
  },
  stays_a_customer: {
    thought: [L("Still coming as before. Good coffee, nice people, that's what counts.", "fan"), L("Still a customer. The price change is old news."), L("Nothing's changed for me. I still come in like before.")],
    diary: [L("Still buying at {cafe} as before.")],
  },
  buys_less_than_before: {
    thought: [L("I come less than before. Two or three times a week instead of every day.", "regular"), L("Buying less than before. I notice the difference.")],
    diary: [L("Buying less at {cafe} than before.")],
  },
  recommends_cafe_anyway: {
    thought: [
      L("It's a bit more now, but I still told {friend} it's the best {item} round here.", "fan"),
      L("Recommended the café to {friend}. The price is fine for what you get."),
    ],
    says: [L("Still the best {item} round here, even at {price}."), L("Go to {cafe}, the staff are lovely. A bit pricier than it was, still worth it.")],
    diary: [L("Recommended {cafe} to {friend}.")],
  },
  mentions_price_in_review: {
    thought: [L("Left a review. Good coffee, but the price went up and people should know.", "sceptic"), L("Wrote a short review and mentioned the price.")],
    says: [L("Nice café, but the {item} is {price} now. Pricey for the area."), L("Good {item}, friendly staff, prices creeping up.")],
    diary: [L("Mentioned the price in a review of {cafe}.")],
  },
  still_buys_regularly: {
    thought: [L("Still buy it most days. I don't think about the price anymore.", "regular"), L("Still buying it regularly. The change is long forgotten.")],
    diary: [L("Still buying the {item} regularly.")],
  },
  buys_now_and_then: {
    thought: [L("Now and then, as a treat. Not my daily thing anymore.", "sensitive"), L("I buy it now and then, less than I used to.")],
    diary: [L("The {item} at {cafe} now and then.")],
  },
  found_somewhere_cheaper: {
    thought: [L("The new place does it for less. That's where I go now.", "competitor"), L("{Alt} is my coffee stop now. Cheaper, and it's on my way.")],
    diary: [L("Switched to {alt} for coffee.")],
  },
  recommends_cafe: {
    thought: [L("Recommended {cafe} to {friend}. Good coffee is worth a bit more.", "fan"), L("Told {friend} about {cafe}. It's still my favourite.")],
    says: [L("{cafe} still does the best {item} round here."), L("If you're nearby, {cafe} is worth it.")],
    diary: [L("Recommended {cafe} to {friend}.")],
  },
};

/** Who a persona would tell, by segment. */
export const FRIEND: Record<string, string> = {
  office_worker: "a colleague",
  freelancer: "a friend from the co-working space",
  student: "my flatmate",
  parent: "another parent from nursery",
  regular: "my neighbour",
  tourist: "the friend I'm travelling with",
  retiree: "my friend from the choir",
  trades: "my workmates",
};

/** Auto-recorded thought for someone not around this round (no model call). */
export const AWAY: Record<string, string> = {
  office_worker: "I wasn't around: working from home that week.",
  freelancer: "I wasn't around: deadline week, working from home.",
  student: "I wasn't around: exams, at uni all day.",
  parent: "I wasn't around: a sick child at home.",
  regular: "I wasn't around: away for a few days.",
  tourist: "I wasn't around: exploring another part of the city.",
  retiree: "I wasn't around: visiting family.",
  trades: "I wasn't around: on a job across town.",
};

/** Questions an imagined customer might want answered, by template and segment. */
export const QUESTIONS: Record<TemplateId, { general: string[]; bySegment: Record<string, string[]> }> = {
  lunch_offer: {
    general: ["Is there a vegetarian option every day?", "Can I swap the drink for a coffee?", "Will the deal still be on after this month?"],
    bySegment: {
      office_worker: ["Can I order the deal ahead and pick it up at 12:30?", "Can we order five deals at once for a team lunch?"],
      freelancer: ["Can I have the deal and keep my table for the afternoon?", "Is there a vegan option in the deal?"],
      student: ["Is there a student price for the deal?", "Can I skip the drink and pay less?"],
      parent: ["Is there a smaller portion for children?", "What's in the soup? Any nuts?"],
      regular: ["Will my usual stay on the menu?", "Does the soup change every day?"],
      tourist: ["Is there a menu in English?", "Which soup is it today?"],
      retiree: ["Is the soup the same size as before?", "Will the deal still be on next month?"],
      trades: ["Can I get the deal to take away?", "Can I get a bigger sandwich for a bit more?"],
    },
  },
  price_change: {
    general: ["Why did the price go up?", "Did the large size go up too?", "Is the coffee the same as before?"],
    bySegment: {
      office_worker: ["Is there a discount if we order for the office?"],
      freelancer: ["Is the oat milk extra on top of the new price?"],
      student: ["Is there a student price?"],
      parent: ["Did the children's drinks go up too?"],
      regular: ["Do regulars get anything, like a stamp card?", "Will it go up again soon?"],
      tourist: ["Is that the price for a small or a large?"],
      retiree: ["Will it go up again this year?"],
      trades: ["Is it cheaper if I bring my own cup?"],
    },
  },
};
