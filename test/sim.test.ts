import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";
import { demoInputs } from "../src/engine/templates.ts";
import type { Analysis, TemplateId } from "../src/engine/types.ts";
import type { Lang } from "../src/i18n/index.ts";
import {
  BERLIN_EVENTS,
  CAVEAT,
  DEMO_SEEDS,
  LIMITS,
  actionKind,
  autoplayRehearsal,
  cafeName,
  caveatFor,
  hashString,
  injectEvent,
  interviewBriefs,
  normaliseKiez,
  rebuildRehearsal,
  recordInterview,
  rehearsalTeaser,
  roundBriefs,
  ruleBasedReactions,
  startRehearsal,
  storyBeats,
  submitRound,
  summarize,
  toShareRehearsal,
} from "../src/sim/index.ts";
import type { Rehearsal } from "../src/sim/types.ts";
import { decodeState, encodeState } from "../src/state.ts";

const T = "2026-10-17T12:00:00.000Z";
const LANGS: Lang[] = ["de", "en", "es", "pl"];

/** Money in de/es/pl uses a no-break space ("9,90 €"); compare with plain spaces. */
const nb = (s: string) => s.replace(/ /g, " ");

/** English words as whole words (Unicode-aware: "Nähe" does not contain the word "he"). */
function englishWord(words: string): RegExp {
  return new RegExp(`(?<![\\p{L}'])(${words})(?![\\p{L}'])`, "iu");
}

/** A hand-made Analysis: the rehearsal only reads id, template, lang, business, question, currency, createdAt and inputs. */
function fixture(template: TemplateId, id = `a-test-${template}`, lang: Lang = "en", over: Record<string, number | string> = {}): Analysis {
  const inputs: Record<string, number | string> = { ...demoInputs(template), ...over };
  // Tests without a Kiez exercise the plain neighbourhood mix; pass { kiez } to test the Berlin mix.
  if (!("kiez" in over)) delete inputs.kiez;
  return {
    id,
    template,
    lang,
    facts: [],
    createdAt: T,
    business: "Café Lindenblatt (demo café, Berlin-Neukölln)",
    question: template === "lunch_offer" ? "What if I run a weekday lunch offer?" : "What if I raise the price of a flat white by 30 cents?",
    demo: true,
    currency: "EUR",
    inputs: Object.entries(inputs).map(([key, value]) => ({ key, label: key, value, unit: typeof value === "number" ? "EUR" : "text", source: "demo", kind: "fact", why: "" })),
    current: [],
    scenarios: [],
    breakEven: { value: 0, unit: "customers/day", label: "", maths: "", plain: "", reachable: true },
    worstCase: { value: 0, maths: "", plain: "" },
    biggestUncertainty: { key: "", label: "", swing: 0, plain: "", ranking: [] },
    sensitivity: { key: "", label: "", unit: "customers/day", current: 0, breakEvenX: null, points: [] },
    lessons: [],
    nextQuestions: [],
    warnings: [],
  };
}

const lunch = fixture("lunch_offer");
const price = fixture("price_change");

/** A reaction a well-behaved model would send for this persona and round. */
function goodReaction(r: Rehearsal, personaId: string, action?: string) {
  const spec = r.rounds[r.currentRound - 1]!;
  return {
    personaId,
    round: r.currentRound,
    action: action ?? spec.actions[0]!.id,
    thought: "I walked past, read the board and thought about my budget for the week.",
    diary: "Saw the board this week.",
  };
}

function activeIds(r: Rehearsal): string[] {
  return r.active[r.currentRound] ?? [];
}

function playAll(r: Rehearsal, eventBefore3?: string): Rehearsal {
  let cur = r;
  while (cur.status === "running") {
    if (eventBefore3 && cur.currentRound === 3 && !cur.events.length) cur = injectEvent(cur, eventBefore3);
    const out = submitRound(cur, ruleBasedReactions(cur), "rule-based");
    assert.deepEqual(out.errors, []);
    cur = out.rehearsal;
  }
  return cur;
}

function allBriefPrompts(a: Analysis, opts: Parameters<typeof startRehearsal>[1] = {}): string[] {
  let r = startRehearsal(a, opts);
  const prompts: string[] = [];
  while (r.status === "running") {
    prompts.push(...roundBriefs(r).map((b) => b.prompt));
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
  }
  return prompts;
}

describe("start and personas", () => {
  test("same seed gives the same personas, active sets and briefs", () => {
    const a = startRehearsal(lunch, { seed: 42 });
    const b = startRehearsal(lunch, { seed: 42 });
    assert.deepEqual(a.personas, b.personas);
    assert.deepEqual(a.active, b.active);
    assert.deepEqual(roundBriefs(a), roundBriefs(b));
    assert.deepEqual(ruleBasedReactions(a), ruleBasedReactions(b));
    const c = startRehearsal(lunch, { seed: 43 });
    assert.notDeepEqual(a.personas.map((p) => p.name), c.personas.map((p) => p.name));
  });

  test("the default seed comes from the analysis id", () => {
    const r = startRehearsal(lunch);
    assert.equal(r.seed, hashString(lunch.id));
    assert.deepEqual(startRehearsal(lunch).personas, r.personas);
    assert.notDeepEqual(startRehearsal(fixture("lunch_offer", "a-other")).personas, r.personas);
  });

  test("sizes default to 6 personas and 4 rounds, and are clamped", () => {
    const r = startRehearsal(lunch);
    assert.equal(r.personas.length, 6);
    assert.equal(r.rounds.length, 4);
    assert.equal(startRehearsal(lunch, { personas: 2, rounds: 9 }).personas.length, 4);
    assert.equal(startRehearsal(lunch, { personas: 2, rounds: 9 }).rounds.length, 5);
    assert.equal(startRehearsal(lunch, { personas: 30, rounds: 1 }).personas.length, 12);
    assert.equal(startRehearsal(lunch, { personas: 30, rounds: 1 }).rounds.length, 3);
  });

  test("personas are varied, complete and two-layered (card + story ending in a café memory)", () => {
    for (const a of [lunch, price]) {
      for (let seed = 1; seed <= 60; seed++) {
        const n = 4 + (seed % 9);
        const r = startRehearsal(a, { seed, personas: n });
        assert.equal(r.personas.length, n);
        assert.equal(new Set(r.personas.map((p) => p.name)).size, n, "names are unique");
        assert.equal(new Set(r.personas.map((p) => p.id)).size, n, "ids are unique");
        assert.ok(r.personas.some((p) => p.relationship === "regular"), "at least one regular");
        assert.ok(r.personas.some((p) => p.attitude === "sceptical"), "at least one sceptic");
        for (const p of r.personas) {
          const words = p.story.split(/\s+/).length;
          assert.ok(words >= 80 && words <= 150, `story of ${p.name} has ${words} words`);
          assert.match(p.story, /What (she|he) remembers about Café Lindenblatt: [^.]+\.$/);
          assert.ok(p.represents.startsWith("Stands for: "));
          assert.ok(p.activityLevel >= 0.5 && p.activityLevel <= 0.95);
          assert.ok(p.age >= 18 && p.age <= 90);
          assert.ok(p.usualSpend > 0);
          assert.ok(p.channels.length >= 2);
          assert.ok(!/[{}]/.test(p.story + p.routine + p.quirk + p.alternatives + p.segmentLabel), "no unfilled placeholders");
        }
      }
    }
  });

  test("personas in German, Spanish and Polish are complete, in that language, and the same people", () => {
    const marks: Record<Exclude<Lang, "en">, RegExp> = { de: /Was (ihm|ihr) von Café Lindenblatt in Erinnerung ist: /, es: /Lo que recuerda de Café Lindenblatt: /, pl: /Co pamięta z Café Lindenblatt: / };
    const prefix: Record<Exclude<Lang, "en">, string> = { de: "Steht für: ", es: "Representa a: ", pl: "Reprezentuje: " };
    for (const t of ["lunch_offer", "price_change"] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const en = startRehearsal(fixture(t, `a-${t}`, "en"), { seed });
        for (const lang of ["de", "es", "pl"] as const) {
          const r = startRehearsal(fixture(t, `a-${t}`, lang), { seed });
          assert.equal(r.lang, lang);
          assert.deepEqual(r.personas.map((p) => [p.id, p.name, p.segment, p.age, p.attitude, p.usualSpend]), en.personas.map((p) => [p.id, p.name, p.segment, p.age, p.attitude, p.usualSpend]));
          assert.deepEqual(r.active, en.active);
          for (const p of r.personas) {
            const words = p.story.split(/\s+/).length;
            assert.ok(words >= 60 && words <= 160, `${lang} story of ${p.name} has ${words} words`);
            assert.match(p.story, marks[lang]);
            assert.ok(p.represents.startsWith(prefix[lang]));
            assert.ok(!/[{}]/.test(p.story + p.routine + p.quirk + p.alternatives + p.segmentLabel), "no unfilled placeholders");
            assert.ok(!englishWord("the|and|with|usually|she|he").test(p.story), `${lang}: English left in "${p.story}"`);
          }
        }
      }
    }
  });

  test("the default lunch mix includes several kinds of customer", () => {
    const r = startRehearsal(lunch, { seed: 5 });
    assert.ok(new Set(r.personas.map((p) => p.segment)).size >= 5);
    assert.ok(r.personas.some((p) => p.segment === "regular"));
  });

  test("customerMix weights are respected", () => {
    const only = startRehearsal(lunch, { seed: 3, personas: 6, customerMix: { student: 1 } });
    assert.ok(only.personas.every((p) => p.segment === "student"));
    assert.ok(only.personas.some((p) => p.relationship === "regular"), "still one regular customer");
    assert.ok(only.personas.some((p) => p.attitude === "sceptical"), "still one sceptic");
    const mix = startRehearsal(lunch, { seed: 3, personas: 8, customerMix: { office_worker: 3, student: 1 } });
    assert.equal(mix.personas.filter((p) => p.segment === "office_worker").length, 6);
    assert.equal(mix.personas.filter((p) => p.segment === "student").length, 2);
    assert.deepEqual(mix.customerMix, { office_worker: 3, student: 1 });
  });

  test("the Kiez changes the segment mix (a rough guess, said in the summary)", () => {
    const tally = (kiez: string) => {
      const c: Record<string, number> = {};
      for (let seed = 1; seed <= 40; seed++) {
        const r = startRehearsal(fixture("lunch_offer", "a-kiez", "en", { kiez }), { seed, personas: 8 });
        assert.equal(r.kiez, normaliseKiez(kiez));
        for (const p of r.personas) c[p.segment] = (c[p.segment] ?? 0) + 1;
      }
      return (...segs: string[]) => segs.reduce((s, x) => s + (c[x] ?? 0), 0);
    };
    const mitte = tally("Mitte"), neukoelln = tally("Berlin-Neukölln"), pberg = tally("Prenzlauer Berg"), steglitz = tally("Steglitz");
    assert.ok(mitte("office_worker", "tourist") > neukoelln("office_worker", "tourist") + 20, "Mitte: more office workers and visitors");
    assert.ok(neukoelln("freelancer", "student") > mitte("freelancer", "student") + 20, "Neukölln: more freelancers and students");
    assert.ok(pberg("parent") > mitte("parent") + 15, "Prenzlauer Berg: more parents");
    assert.ok(steglitz("retiree") > neukoelln("retiree") + 15, "Steglitz: more retirees");
    assert.equal(normaliseKiez("neukoelln"), "Neukölln");
    assert.equal(normaliseKiez("Prenzlberg"), "Prenzlauer Berg");
    assert.equal(normaliseKiez("WEISSENSEE"), "Weißensee");
    assert.equal(normaliseKiez("other"), undefined);
    assert.equal(normaliseKiez("Hamburg"), undefined);
    const s = summarize(autoplayRehearsal(startRehearsal(fixture("lunch_offer", "a-kiez", "de", { kiez: "Mitte" }), { seed: 4 })));
    assert.equal(s.kiez, "Mitte");
    assert.match(s.mixNote ?? "", /grobe Annahme für Mitte, keine Statistik/);
    assert.ok(s.caveat.endsWith(s.mixNote!));
    assert.match(summarize(autoplayRehearsal(startRehearsal(lunch, { seed: 4 }))).caveat, /rough guess .* not statistics/);
  });

  test("at least two thirds are around each round, everyone in at least two rounds; the others are recorded as not around without a model", () => {
    for (const a of [lunch, price]) {
      for (let seed = 1; seed <= 60; seed++) {
        const rounds = 3 + (seed % 3);
        const r = startRehearsal(a, { seed, personas: 4 + (seed % 9), rounds });
        for (let k = 1; k <= rounds; k++) assert.ok(r.active[k]!.length >= Math.ceil((2 * r.personas.length) / 3), `seed ${seed} round ${k}: ${r.active[k]!.length} of ${r.personas.length}`);
        for (const p of r.personas) {
          const times = Object.values(r.active).filter((ids) => ids.includes(p.id)).length;
          assert.ok(times >= (rounds >= 4 ? 2 : 1), `seed ${seed}: ${p.name} is around in ${times} rounds`);
        }
        const absent = r.personas.filter((p) => !r.active[1]!.includes(p.id));
        for (const p of absent) {
          const x = r.reactions.find((y) => y.personaId === p.id && y.round === 1);
          assert.equal(x?.action, "not_around");
          assert.equal(x?.method, "rule-based");
        }
        assert.equal(roundBriefs(r).length, r.active[1]!.length, "briefs only for active personas");
      }
    }
  });

  test("the change text and rounds follow the template", () => {
    const r = startRehearsal(lunch);
    assert.equal(r.change, "Lunch deal: soup, sandwich and a drink for €9.90, weekdays 11:30–14:30");
    assert.deepEqual(r.rounds.map((s) => s.title), ["Launch day: the board goes up", "First week, Tuesday 12:30", "Second week", "After the test"]);
    assert.ok(r.rounds[0]!.situation.includes('The board outside says: "Lunch deal — soup, sandwich and a drink for €9.90, weekdays 11:30–14:30"'));
    assert.deepEqual(r.rounds[1]!.actions.map((x) => x.id), ["tries_deal", "tries_and_tells", "usual_order", "eats_elsewhere", "skips_lunch_out", "not_around"]);
    // Round 3 lets someone try for the first time; round 4 lets someone stay at the other place.
    assert.ok(r.rounds[2]!.actions.some((x) => x.id === "tries_deal") && r.rounds[2]!.actions.some((x) => x.id === "comes_back_for_deal"));
    assert.ok(r.rounds[3]!.actions.some((x) => x.id === "eats_elsewhere") && r.rounds[3]!.actions.some((x) => x.id === "usual_order"));
    for (const s of r.rounds) {
      assert.ok(s.actions.some((x) => x.id === "not_around"));
      assert.ok(s.actions.length >= 3 && s.actions.length <= 7);
    }
    assert.equal(r.rounds[1]!.actions.find((x) => x.id === "tries_and_tells")?.public, true);
    assert.equal(r.rounds[2]!.actions.find((x) => x.id === "tells_a_friend")?.public, true);
    assert.equal(startRehearsal(lunch, { rounds: 5 }).rounds[4]!.title, "A month later");
    assert.equal(startRehearsal(lunch, { rounds: 3 }).rounds.length, 3);
    const p = startRehearsal(price);
    assert.equal(p.change, "Flat white now €4.20 (was €3.90)");
    assert.deepEqual(p.rounds.map((s) => s.title), ["Sees the new price", "Next visit", "Two weeks later", "After the test"]);
    assert.deepEqual(p.rounds[0]!.actions.map((x) => x.id), ["accepts", "grumbles", "does_not_notice", "not_around"]);
    assert.equal(p.rounds[0]!.actions.find((x) => x.id === "grumbles")?.public, true);
    assert.ok(p.rounds[3]!.actions.some((x) => x.id === "found_somewhere_cheaper"), "someone who left can stay away");
  });

  test("rounds, actions and the change are in the analysis language", () => {
    const de = startRehearsal(fixture("lunch_offer", "a-de", "de"));
    assert.equal(nb(de.change), "Mittagsangebot: Suppe, Sandwich und ein Getränk für 9,90 €, Mo–Fr 11:30–14:30");
    assert.equal(de.rounds[0]!.title, "Starttag: Die Tafel steht draußen");
    assert.ok(de.rounds[3]!.situation.includes("Ende des zweiwöchigen Tests"));
    assert.equal(de.rounds[1]!.actions[0]!.label, "Bestellt das Mittagsangebot");
    assert.equal(nb(de.feed[0]!.text), "Neu: Mittagsangebot — Suppe, Sandwich und ein Getränk für 9,90 €, Mo–Fr 11:30–14:30. (Gesponserter Beitrag, wird Leuten in der Nähe angezeigt.)");
    const es = startRehearsal(fixture("price_change", "a-es", "es"));
    assert.equal(nb(es.change), "Flat white ahora a 4,20 € (antes 3,90 €)");
    assert.equal(es.rounds[0]!.title, "El precio nuevo");
    const pl = startRehearsal(fixture("lunch_offer", "a-pl", "pl", { kiez: "Wedding" }));
    assert.ok(pl.rounds[0]!.situation.startsWith("Poniedziałek, 8:30 w dzielnicy Wedding."));
    assert.equal(pl.rounds[2]!.actions.find((a) => a.id === "comes_back_for_deal")!.label, "Wraca na zestaw");
  });
});

describe("briefs", () => {
  test("each prompt is self-contained and ends with the exact JSON to return", () => {
    const r = startRehearsal(lunch, { seed: 9 });
    const [b] = roundBriefs(r);
    assert.ok(b);
    const p = r.personas.find((x) => x.id === b.personaId)!;
    assert.ok(b.prompt.includes(p.story), "story");
    assert.ok(b.prompt.includes(`Name: ${p.name} (persona id "${p.id}")`), "card");
    assert.ok(b.prompt.includes("THIS ROUND: Launch day: the board goes up"));
    assert.ok(b.prompt.includes("Lunch deal — soup, sandwich and a drink for €9.90"), "the change");
    assert.ok(b.prompt.includes("Write your answers in English"));
    assert.ok(b.prompt.includes("Most people ignore most offers"));
    assert.ok(b.prompt.includes("You do NOT know the café's costs"));
    assert.ok(b.prompt.includes('"Not interested" is a perfectly good answer'));
    assert.ok(b.prompt.includes(`{"personaId":"${p.id}","round":1,"action":"<one action id>","thought":"<why, in first person>","questionForOwner":"<optional>","diary":"<one sentence you will remember>"}`));
    for (const id of ["notices_offer", "ignores", "not_around"]) assert.ok(b.prompt.includes(`- ${id}: `));
    assert.deepEqual(b.allowedActions, ["notices_offer", "ignores", "not_around"]);
    assert.ok(b.prompt.trimEnd().endsWith(`at most ${LIMITS.diary} characters.`));
  });

  test("briefs tell the persona to answer in the owner's language and show the scene in it", () => {
    const want: Record<Lang, [string, string, string]> = {
      de: ["Write your answers in German (Deutsch)", "THIS ROUND: Starttag: Die Tafel steht draußen", "Auf der Tafel steht: „Mittagsangebot — Suppe, Sandwich und ein Getränk für 9,90 €"],
      en: ["Write your answers in English", "THIS ROUND: Launch day: the board goes up", 'The board outside says: "Lunch deal — soup'],
      es: ["Write your answers in Spanish (Español)", "THIS ROUND: Día de estreno: sale la pizarra", "La pizarra dice: «Menú del día — sopa, bocadillo y bebida por 9,90 €"],
      pl: ["Write your answers in Polish (Polski)", "THIS ROUND: Pierwszy dzień: tablica stoi przed wejściem", "Na tablicy: „Zestaw lunchowy — zupa, kanapka i napój za 9,90 €"],
    };
    for (const lang of LANGS) {
      const a = fixture("lunch_offer", "a-lang", lang, { kiez: "Neukölln" });
      const prompts = allBriefPrompts(a, { seed: 3 }).map(nb);
      assert.ok(prompts.length > 10);
      for (const p of prompts) {
        assert.ok(p.includes(want[lang][0]), `${lang}: language line`);
        assert.ok(p.includes("Berlin-Neukölln"), `${lang}: the Kiez`);
      }
      assert.ok(prompts[0]!.includes(want[lang][1]), `${lang}: round title`);
      assert.ok(prompts[0]!.includes(want[lang][2]), `${lang}: the board`);
      const later = prompts.at(-1)!;
      assert.ok(later.includes("WHAT'S GOING AROUND THE NEIGHBOURHOOD"));
      const r = autoplayRehearsal(startRehearsal(a, { seed: 3 }));
      const iv = interviewBriefs(r, "Was würde Sie wiederbringen?")[0]!.prompt;
      assert.ok(iv.includes(want[lang][0]), `${lang}: interview language line`);
    }
  });

  test("public rounds explain saysPublicly and heardFrom; the diary and the feed carry over", () => {
    let r = startRehearsal(lunch, { seed: 9 });
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    const briefs = roundBriefs(r);
    assert.equal(r.currentRound, 3);
    const speakers = r.feed.filter((f) => f.personaId);
    for (const b of briefs) {
      assert.ok(b.prompt.includes('"saysPublicly":"<only if action is tells_a_friend>"'));
      assert.ok(b.prompt.includes("YOUR DIARY SO FAR\n- Round 1 (Launch day: the board goes up)"));
      assert.ok(b.prompt.includes("Café Lindenblatt, the café's own post"));
      if (speakers.some((f) => f.personaId !== b.personaId)) assert.ok(b.prompt.includes("- heardFrom (optional)"));
    }
  });

  test("briefs never contain the owner's costs or private figures, in any language", () => {
    const leaks: Record<"en" | "de", Record<TemplateId, string[]>> = {
      en: {
        lunch_offer: ["€3.60", "3.6", "16,500", "16500", "€180", "1,500", "1500", "€18.00", "€25.00", "32%", "0.32", "€11.20", "140 customers", "38 lunch"],
        price_change: ["€0.95", "0.95", "620"],
      },
      de: {
        lunch_offer: ["3,60", "16.500", "16500", "180,00", "1.500", "1500", "18,00", "25,00", "32 %", "0,32", "11,20"],
        price_change: ["0,95", "620"],
      },
    };
    for (const lang of ["en", "de"] as const) {
      for (const t of ["lunch_offer", "price_change"] as const) {
        const a = fixture(t, `a-leak-${t}`, lang);
        for (const seed of [1, 2, 3, 4, 5]) {
          for (const prompt of allBriefPrompts(a, { seed, personas: 8, rounds: 5 })) {
            for (const leak of leaks[lang][t]) assert.ok(!prompt.includes(leak), `${lang} brief for ${t} contains "${leak}"`);
          }
        }
      }
    }
  });

  test("a 10,000-character business name builds briefs fast, and owner text is capped", () => {
    const huge = `${"(".repeat(5000)}${" ".repeat(4999)}x`;
    const warm = startRehearsal(lunch, { seed: 1 });
    roundBriefs(warm);
    const a = { ...fixture("lunch_offer", "a-huge"), business: huge };
    const t0 = performance.now();
    const r = startRehearsal(a, { seed: 1 });
    const briefs = roundBriefs(r);
    const ms = performance.now() - t0;
    assert.ok(ms < 50, `took ${ms.toFixed(1)} ms`);
    assert.ok(briefs.length > 0);
    assert.ok(r.business.length <= 200);
    assert.ok((r.scene?.cafe.length ?? 0) <= 60);
    const t1 = performance.now();
    assert.equal(cafeName(`Café ${"(a".repeat(50_000)})`).length <= 60, true);
    assert.ok(performance.now() - t1 < 50);
    const long = startRehearsal(fixture("price_change", "a-long", "en", { item: "x".repeat(10_000) }), { seed: 2 });
    assert.ok(long.scene!.item.length <= 40);
    assert.ok(long.change.length < 200);
  });
});

describe("submitRound validation", () => {
  test("bad items get per-persona errors; good items in the same batch are kept", () => {
    // A seed where round 1 has at least five people around and at least one away.
    let seed = 1;
    while (!((n) => n >= 6 && n < 8)(startRehearsal(lunch, { seed, personas: 8 }).active[1]!.length)) seed++;
    const r = startRehearsal(lunch, { seed, personas: 8 });
    const ids = activeIds(r);
    const inactive = r.personas.find((p) => !ids.includes(p.id));
    assert.ok(ids.length >= 4 && inactive, "fixture has active and inactive personas");
    const [a, b, c, d] = ids as [string, string, string, string];
    const out = submitRound(r, [
      goodReaction(r, a),
      { ...goodReaction(r, b), action: "buys_a_yacht" },
      { ...goodReaction(r, c), thought: "" },
      { ...goodReaction(r, d), round: 3 },
      { ...goodReaction(r, inactive.id) },
      { ...goodReaction(r, "p99") },
      42,
    ]);
    assert.equal(out.accepted, 1);
    assert.equal(out.done, false);
    assert.deepEqual(out.next, []);
    assert.equal(out.rehearsal.currentRound, 1);
    const err = (id: string) => out.errors.find((e) => e.personaId === id)?.error ?? "";
    assert.match(err(b), /Action "buys_a_yacht" is not allowed in round 1\. Choose one of: notices_offer, ignores, not_around\./);
    assert.match(err(c), /Missing "thought"/);
    assert.match(err(d), /for round 3, but the rehearsal is waiting for round 1/);
    assert.match(err(inactive.id), /is not around in round 1/);
    assert.match(err("p99"), /Unknown personaId "p99"/);
    assert.match(err("item 7"), /Not a JSON object/);
    for (const id of ids.slice(4)) assert.match(err(id), /Still waiting for/);
    assert.ok(out.rehearsal.reactions.some((x) => x.personaId === a && x.round === 1 && x.method === "subagent"));
    // Resubmitting only the failed personas completes the round.
    const fix = submitRound(out.rehearsal, ids.slice(1).map((id) => goodReaction(out.rehearsal, id, "ignores")), "in-context");
    assert.deepEqual(fix.errors, []);
    assert.equal(fix.rehearsal.currentRound, 2);
    assert.ok(fix.next.length > 0 && fix.next.every((x) => x.round === 2));
  });

  test("slightly long text is trimmed at a word; far too long text is rejected", () => {
    const r = startRehearsal(lunch, { seed: 11 });
    const [a, b] = activeIds(r) as [string, string];
    const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
    const out = submitRound(r, [
      { ...goodReaction(r, a), thought: words(45), diary: words(25) }, // ~300 and ~170 characters: trimmed
      { ...goodReaction(r, b), thought: words(80) }, // ~560 characters: rejected
    ]);
    const kept = out.rehearsal.reactions.find((x) => x.personaId === a && x.round === 1)!;
    assert.ok(kept.thought.length <= LIMITS.thought && kept.thought.endsWith("…"));
    assert.ok(kept.diary!.length <= LIMITS.diary && kept.diary!.endsWith("…"));
    assert.match(out.errors.find((e) => e.personaId === b)!.error, /"thought" is \d+ characters; keep it to 240 or fewer\./);
  });

  test("public words are kept only for public actions; text replies, names, labels and missing diaries are handled", () => {
    let r = startRehearsal(lunch, { seed: 11 });
    while (r.currentRound < 3) r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    const [a, b, c] = activeIds(r) as [string, string, string];
    const nameOfC = r.personas.find((p) => p.id === c)!.name;
    const out = submitRound(r, [
      { ...goodReaction(r, a, "tells_a_friend"), saysPublicly: "The soup at the corner café is good now." },
      { ...goodReaction(r, b, "usual_order"), saysPublicly: "Nobody should hear this." },
      `Sure! \`\`\`json\n${JSON.stringify({ personaId: nameOfC, round: 3, action: "Has the usual order instead", thought: "Same as always." })}\n\`\`\``,
    ]);
    assert.equal(out.accepted, 3, JSON.stringify(out.errors));
    const get = (id: string) => out.rehearsal.reactions.find((x) => x.personaId === id && x.round === 3)!;
    assert.equal(get(a).saysPublicly, "The soup at the corner café is good now.");
    assert.equal(get(b).saysPublicly, undefined);
    assert.equal(get(c).action, "usual_order");
    assert.equal(get(c).diary, "Same as always.");
    const feed = out.rehearsal.feed.filter((f) => f.personaId);
    assert.ok(feed.some((f) => f.personaId === a && f.kind === "word_of_mouth" && f.text === "The soup at the corner café is good now." && f.round === 3));
    assert.ok(!feed.some((f) => f.personaId === b));
  });

  test("submitRound does not change the rehearsal it is given; a finished rehearsal rejects more", () => {
    const r = startRehearsal(price, { seed: 2 });
    const before = structuredClone(r);
    submitRound(r, ruleBasedReactions(r), "rule-based");
    assert.deepEqual(r, before);
    const done = autoplayRehearsal(r);
    const out = submitRound(done, [goodReaction(r, activeIds(r)[0]!)]);
    assert.equal(out.done, true);
    assert.equal(out.accepted, 0);
    assert.match(out.errors[0]!.error, /finished/);
  });

  test("a resent identical reaction is ignored; a different one is reported and the first kept", () => {
    const r = startRehearsal(lunch, { seed: 11, personas: 8 });
    const [a, b] = activeIds(r) as [string, string];
    const first = submitRound(r, [goodReaction(r, a), goodReaction(r, b)]).rehearsal;
    const again = submitRound(first, [goodReaction(r, a), { ...goodReaction(r, b), action: "ignores" }]);
    assert.equal(again.accepted, 0);
    assert.ok(!again.errors.some((e) => e.personaId === a));
    assert.match(again.errors.find((e) => e.personaId === b)!.error, /already has a reaction/);
    assert.equal(again.rehearsal.reactions.find((x) => x.personaId === b && x.round === 1)!.action, "notices_offer");
  });

  test("heardFrom is kept only when it names someone whose words were in the feed; names in the words count too", () => {
    let r = startRehearsal(lunch, { seed: 9 });
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    // Round 2: the first active persona tells someone (public), the rest do their usual.
    const [teller, ...rest] = activeIds(r) as [string, ...string[]];
    r = submitRound(r, [{ ...goodReaction(r, teller, "tries_and_tells"), saysPublicly: "The deal is good." }, ...rest.map((id) => goodReaction(r, id, "usual_order"))], "subagent").rehearsal;
    assert.equal(r.currentRound, 3);
    const tellerName = r.personas.find((p) => p.id === teller)!.name;
    const others = activeIds(r).filter((id) => id !== teller);
    const [x, y, z] = others as [string, string, string];
    const out = submitRound(r, [
      { ...goodReaction(r, x, "tries_deal"), heardFrom: tellerName },
      { ...goodReaction(r, y, "tries_deal"), heardFrom: r.personas.find((p) => p.id === z)!.name },
      { ...goodReaction(r, z, "tries_deal"), thought: `${tellerName} said it was good, so I tried it.` },
    ], "subagent").rehearsal;
    const get = (id: string) => out.reactions.find((q) => q.personaId === id && q.round === 3)!;
    assert.equal(get(x).heardFrom, teller);
    assert.equal(get(y).heardFrom, undefined, "z said nothing public, so y cannot have heard it from z");
    assert.equal(get(z).heardFrom, teller);
    const s = summarize(autoplayRehearsal(out));
    assert.ok(s.links.some((l) => l.from === teller && l.to === x && l.round === 3 && l.text === "The deal is good."));
    assert.ok(s.links.some((l) => l.from === teller && l.to === z));
    assert.ok(!s.links.some((l) => l.to === y && l.round === 3));
  });
});

describe("full runs", () => {
  for (const a of [lunch, price]) {
    test(`${a.template}: rule-based play runs to done with a complete summary`, () => {
      let r = startRehearsal(a, { seed: 7 });
      let rounds = 0;
      while (r.status === "running") {
        const out = submitRound(r, ruleBasedReactions(r), "rule-based");
        assert.deepEqual(out.errors, []);
        r = out.rehearsal;
        rounds++;
      }
      assert.equal(rounds, 4);
      assert.equal(r.currentRound, 5);
      assert.deepEqual(roundBriefs(r), []);
      assert.deepEqual(ruleBasedReactions(r), []);
      for (const p of r.personas) for (let k = 1; k <= 4; k++) assert.equal(r.reactions.filter((x) => x.personaId === p.id && x.round === k).length, 1);
      const s = summarize(r);
      assert.equal(s.status, "done");
      assert.equal(s.method, "rule-based");
      assert.equal(s.grid.length, r.personas.length * 4);
      assert.ok(s.grid.every((g) => g.kind === actionKind(g.action)));
      assert.equal(s.perRound.length, 4);
      assert.equal(s.uptake.length, 4);
      for (const u of s.uptake) assert.ok(u.engaged <= u.active && u.active === r.active[u.round]!.length);
      assert.equal(s.funnel.length, 4);
      for (const f of s.funnel) assert.ok(f.of === r.personas.length && f.count >= 0 && f.count <= f.of);
      assert.ok(s.quotes.length > 0 && s.quotes.length <= 6);
      assert.ok(s.checkWithRealCustomers.length >= 3 && s.checkWithRealCustomers.length <= 5);
      assert.equal(s.caveat, caveatFor("rule-based", "en", s.mixNote));
      assert.equal(new Set(s.questionsForOwner.map((q) => q.toLowerCase())).size, s.questionsForOwner.length);
      for (const l of s.links) assert.ok(r.personas.some((p) => p.id === l.from) && r.personas.some((p) => p.id === l.to) && l.from !== l.to);
      for (const x of r.reactions) {
        assert.ok(x.thought.length > 0 && x.thought.length <= LIMITS.thought);
        assert.ok(!/\{\w+\}|\{g:/.test(`${x.thought} ${x.diary ?? ""} ${x.saysPublicly ?? ""}`), "no unfilled placeholders");
      }
    });
  }

  test("funnel labels are descriptive counts for each template and language", () => {
    assert.deepEqual(summarize(autoplayRehearsal(startRehearsal(lunch))).funnel.map((f) => f.label), ["Noticed it", "Tried it", "Came back", "Told someone"]);
    assert.deepEqual(
      summarize(autoplayRehearsal(startRehearsal(price))).funnel.map((f) => f.label),
      ["Noticed the new price", "Kept buying as before", "Bought less or went elsewhere", "Said something about it"],
    );
    assert.deepEqual(summarize(autoplayRehearsal(startRehearsal(fixture("lunch_offer", "a", "de")))).funnel.map((f) => f.label), ["Haben es bemerkt", "Haben es probiert", "Sind wiedergekommen", "Haben davon erzählt"]);
    assert.equal(summarize(autoplayRehearsal(startRehearsal(fixture("price_change", "a", "pl")))).uptakeLabel, "Dalej kupują po nowej cenie");
  });

  test("model and rule-based reactions mix: the stand-in fills only the personas still missing", () => {
    const r = startRehearsal(lunch, { seed: 4 });
    const [a] = activeIds(r) as [string];
    const one = submitRound(r, [goodReaction(r, a)], "subagent").rehearsal;
    const fill = ruleBasedReactions(one);
    assert.equal(fill.length, activeIds(r).length - 1);
    assert.ok(!fill.some((x) => x.personaId === a));
    const done = autoplayRehearsal(submitRound(one, fill, "rule-based").rehearsal);
    assert.equal(summarize(done).method, "mixed");
  });

  test("summary counts follow a scripted run; coming back needs an earlier try", () => {
    let r = startRehearsal(lunch, { seed: 21, personas: 4 });
    // Everyone around plays one fixed path; absent people are recorded automatically.
    const path = ["notices_offer", "tries_deal", "tells_a_friend", "keeps_coming"];
    while (r.status === "running") {
      const k = r.currentRound;
      r = submitRound(r, activeIds(r).map((id) => ({ ...goodReaction(r, id, path[k - 1]), ...(k === 3 ? { saysPublicly: `Tell everyone (${id}).` } : {}) })), "in-context").rehearsal;
    }
    const s = summarize(r);
    const ever = (...actions: string[]) => new Set(r.reactions.filter((x) => actions.includes(x.action)).map((x) => x.personaId)).size;
    assert.equal(s.method, "in-context");
    assert.equal(s.funnel[1]!.count, ever("tries_deal", "keeps_coming"));
    const backIds = r.personas.filter((p) => r.reactions.some((x) => x.personaId === p.id && x.action === "tries_deal") && r.reactions.some((x) => x.personaId === p.id && x.action === "keeps_coming"));
    assert.equal(s.funnel[2]!.count, backIds.length);
    assert.equal(s.funnel[3]!.count, ever("tells_a_friend"));
    assert.equal(s.perRound[1]!.counts.find((c) => c.action === "tries_deal")!.count, r.active[2]!.length);
    assert.equal(s.uptake[0]!.engaged, r.active[1]!.length);
    assert.equal(s.feed.filter((f) => f.kind === "word_of_mouth").length, r.active[3]!.length);
  });

  test("not noticing, carrying on as usual and going elsewhere are not counted as engagement", () => {
    let r = startRehearsal(price, { seed: 3 });
    r = submitRound(r, activeIds(r).map((id) => goodReaction(r, id, "does_not_notice")), "in-context").rehearsal;
    assert.equal(summarize(r).uptake[0]!.engaged, 0);
    let l = startRehearsal(lunch, { seed: 3 });
    l = submitRound(l, activeIds(l).map((id) => goodReaction(l, id, "ignores")), "in-context").rehearsal;
    l = submitRound(l, activeIds(l).map((id) => goodReaction(l, id, "usual_order")), "in-context").rehearsal;
    l = submitRound(l, activeIds(l).map((id) => goodReaction(l, id, "eats_elsewhere")), "in-context").rehearsal;
    const s = summarize(l);
    assert.deepEqual(s.uptake.map((u) => u.engaged), [0, 0, 0]);
    assert.equal(s.funnel[2]!.count, 0);
    assert.ok(s.grid.filter((g) => g.action === "eats_elsewhere").every((g) => g.kind === "elsewhere" && !g.positive));
    assert.equal(actionKind("not_around"), "away");
    assert.equal(actionKind("goes_elsewhere"), "elsewhere");
    assert.equal(actionKind("stays_away"), "elsewhere");
    assert.equal(actionKind("tries_deal"), "engaged");
    assert.equal(actionKind("usual_order"), "neutral");
  });

  test("same seed, same story in every language (determinism per language, and across languages)", () => {
    for (const t of ["lunch_offer", "price_change"] as const) {
      for (const seed of [1, 7, 36, 66]) {
        const runs = LANGS.map((lang) => playAll(startRehearsal(fixture(t, `a-${t}`, lang, { kiez: "Neukölln" }), { seed }), t === "lunch_offer" ? "rival_lunch" : undefined));
        for (const [i, lang] of LANGS.entries()) {
          const again = playAll(startRehearsal(fixture(t, `a-${t}`, lang, { kiez: "Neukölln" }), { seed }), t === "lunch_offer" ? "rival_lunch" : undefined);
          assert.deepEqual(again, runs[i], `${lang}: rerun differs`);
        }
        const shape = (r: Rehearsal) => r.reactions.map((x) => [x.personaId, x.round, x.action, x.heardFrom ?? "", !!x.saysPublicly, !!x.questionForOwner]);
        for (const r of runs.slice(1)) assert.deepEqual(shape(r), shape(runs[0]!));
      }
    }
  });

  test("rule-based words in German, Spanish and Polish are in that language", () => {
    const english = englishWord("the|and|with|didn't|don't|I'm|I'll|it's|you|lunch deal|wasn't");
    for (const lang of ["de", "es", "pl"] as const) {
      for (const t of ["lunch_offer", "price_change"] as const) {
        for (let seed = 1; seed <= 25; seed++) {
          const r = playAll(startRehearsal(fixture(t, `a-${t}`, lang, { kiez: "Kreuzberg" }), { seed }), t === "lunch_offer" ? "rival_lunch" : undefined);
          const s = summarize(r);
          for (const x of r.reactions) {
            const text = `${x.thought} | ${x.diary ?? ""} | ${x.saysPublicly ?? ""} | ${x.questionForOwner ?? ""}`;
            assert.ok(!english.test(text), `${lang} ${t} seed ${seed}: "${text}"`);
            assert.ok(!/\{\w+\}|\{g:/.test(text), `${lang}: placeholder left in "${text}"`);
          }
          for (const line of [...s.checkWithRealCustomers, s.caveat, ...s.funnel.map((f) => f.label), s.uptakeLabel ?? ""]) assert.ok(!english.test(line), `${lang}: "${line}"`);
          for (const spec of r.rounds) assert.ok(!english.test(`${spec.title} ${spec.situation} ${spec.actions.map((a) => a.label).join(" ")}`), `${lang}: round ${spec.n}`);
        }
      }
    }
  });
});

describe("the rule-based stand-in reads like people", () => {
  const runs = (t: TemplateId, event?: string) =>
    Array.from({ length: 60 }, (_, i) => playAll(startRehearsal(fixture(t, `a-${t}`, "en", { kiez: "Neukölln" }), { seed: i + 1 }), event));

  test("no two people think the same sentence in a round, and nobody repeats their own earlier thought", () => {
    for (const r of [...runs("lunch_offer", "rival_lunch"), ...runs("price_change")]) {
      for (const spec of r.rounds) {
        const th = r.reactions.filter((x) => x.round === spec.n && x.action !== "not_around").map((x) => x.thought);
        assert.equal(new Set(th).size, th.length, `seed ${r.seed} round ${spec.n}: ${th.join(" / ")}`);
      }
      for (const p of r.personas) {
        const th = r.reactions.filter((x) => x.personaId === p.id && x.action !== "not_around").map((x) => x.thought);
        assert.equal(new Set(th).size, th.length, `seed ${r.seed}: ${p.name} repeats a thought`);
      }
    }
  });

  test("lines fit the person's past and traits; the diary names the same place as the thought", () => {
    const usedDeal = new Set(["tries_deal", "tries_and_tells", "comes_back_for_deal", "keeps_coming", "still_comes_for_lunch", "comes_now_and_then"]);
    const places = ["the new café two doors down", "the bakery on the corner", "the Späti across the road", "the canteen at work", "the Mensa at uni", "the döner place by the U-Bahn", "the Vietnamese place round the corner"];
    for (const r of runs("lunch_offer", "rival_lunch")) {
      for (const x of r.reactions) {
        const p = r.personas.find((q) => q.id === x.personaId)!;
        const before = r.reactions.filter((y) => y.personaId === p.id && y.round < x.round);
        if (/Back to my normal order|I've had the deal|Had the deal once|Came back for the deal|Picked up the deal to go again/.test(x.thought)) {
          assert.ok(before.some((y) => usedDeal.has(y.action)), `seed ${r.seed}: ${p.name} "${x.thought}" without an earlier try`);
        }
        if ((p.traits ?? []).includes("takeaway")) assert.ok(!/window tables/.test(`${x.thought} ${x.saysPublicly ?? ""}`), `seed ${r.seed}: take-away ${p.name} complains about tables`);
        if (x.action === "eats_elsewhere") {
          const inThought = places.find((pl) => x.thought.includes(pl));
          const inDiary = places.find((pl) => (x.diary ?? "").includes(pl));
          if (inThought && inDiary) assert.equal(inDiary, inThought, `seed ${r.seed}: ${x.thought} / ${x.diary}`);
          if (/new place|new café/.test(x.thought) && inDiary) assert.equal(inDiary, places[0]);
        }
      }
    }
  });

  test("a believable spread: some notice, some try, some come back, word of mouth travels, and the rival café matters", () => {
    const avg = (rs: Rehearsal[], i: number) => rs.reduce((s, r) => s + summarize(r).funnel[i]!.count, 0) / rs.length;
    const links = (rs: Rehearsal[]) => rs.reduce((s, r) => s + summarize(r).links.length, 0) / rs.length;
    const plain = runs("lunch_offer");
    const rival = runs("lunch_offer", "rival_lunch");
    const pc = runs("price_change");
    assert.ok(avg(plain, 0) >= 3 && avg(plain, 0) <= 5.5, `noticed ${avg(plain, 0)}`);
    assert.ok(avg(plain, 1) >= 2 && avg(plain, 1) <= 4, `tried ${avg(plain, 1)}`);
    assert.ok(avg(plain, 2) >= 0.8, `came back ${avg(plain, 2)}`);
    assert.ok(avg(plain, 3) >= 1, `told ${avg(plain, 3)}`);
    assert.ok(links(plain) >= 1, `links per run ${links(plain)}`);
    assert.ok(avg(rival, 1) < avg(plain, 1), "the new café two doors down costs tries");
    const elsewhere = (rs: Rehearsal[]) => rs.reduce((s, r) => s + r.reactions.filter((x) => x.round >= 3 && x.action === "eats_elsewhere").length, 0);
    assert.ok(elsewhere(rival) > elsewhere(plain) * 1.15, "more people eat elsewhere after the event");
    // Price change: most keep buying, some buy less, people talk.
    assert.ok(avg(pc, 1) >= 3, `kept buying ${avg(pc, 1)}`);
    assert.ok(avg(pc, 2) >= 1 && avg(pc, 2) <= 3, `bought less ${avg(pc, 2)}`);
    assert.ok(links(pc) >= 1, `price links per run ${links(pc)}`);
    // Every link is traceable: the listener names the teller in their own words.
    for (const r of [...plain, ...pc]) {
      const s = summarize(r);
      for (const l of s.links) {
        const x = r.reactions.find((y) => y.personaId === l.to && y.round === l.round)!;
        const teller = r.personas.find((p) => p.id === l.from)!.name;
        assert.ok(`${x.thought} ${x.diary ?? ""} ${x.saysPublicly ?? ""}`.includes(teller), `seed ${r.seed}: link ${l.from}->${l.to} not in their words`);
        assert.ok(l.text && r.feed.some((f) => f.personaId === l.from && f.text === l.text));
      }
    }
  });

  test("the demo seeds tell the whole story in every language", () => {
    for (const lang of LANGS) {
      const r = playAll(startRehearsal(fixture("lunch_offer", "a-demo", lang, { kiez: "Neukölln" }), { seed: DEMO_SEEDS.lunch_offer }), "rival_lunch");
      const s = summarize(r);
      const kinds = storyBeats(s).map((b) => b.kind);
      for (const k of ["noticed", "tried", "cameBack", "told", "heardFrom", "sceptic"] as const) assert.ok(kinds.includes(k), `${lang}: no ${k} beat`);
      assert.ok(s.funnel[1]!.count >= 2 && s.funnel[2]!.count >= 1 && s.links.length >= 1);
      const teaser = rehearsalTeaser(s);
      assert.equal(teaser.people.length, 6);
      assert.ok(teaser.links.every((l) => l.fromName && l.toName));
      const p = summarize(playAll(startRehearsal(fixture("price_change", "a-demo", lang, { kiez: "Neukölln" }), { seed: DEMO_SEEDS.price_change })));
      assert.ok(p.funnel[2]!.count >= 1 && p.funnel[3]!.count >= 1 && p.links.length >= 1, `${lang}: price demo`);
    }
  });
});

describe("caveat", () => {
  test("the caveat says who played the customers", () => {
    const rb = summarize(autoplayRehearsal(startRehearsal(lunch, { seed: 2 })));
    assert.equal(rb.method, "rule-based");
    assert.doesNotMatch(rb.caveat, /played by an AI/);
    assert.match(rb.caveat, /no AI/);
    assert.match(rb.caveat, /imagined/);
    let r = startRehearsal(lunch, { seed: 2 });
    while (r.status === "running") r = submitRound(r, activeIds(r).map((id) => goodReaction(r, id, r.rounds[r.currentRound - 1]!.actions.at(-2)!.id)), "subagent").rehearsal;
    const ai = summarize(r);
    assert.equal(ai.method, "subagent");
    assert.match(ai.caveat, /played by an AI/);
    assert.ok(ai.caveat.startsWith(CAVEAT));
    assert.match(caveatFor("in-context"), /played by an AI/);
    assert.match(caveatFor("mixed"), /partly by an AI and partly by simple fixed rules/);
    assert.match(caveatFor("rule-based", "de"), /keine KI/);
    assert.match(caveatFor("subagent", "es"), /interpretado por una IA/);
    assert.match(caveatFor("rule-based", "pl"), /nie odgrywała ich żadna AI/);
    for (const lang of LANGS) for (const m of ["rule-based", "subagent", "mixed"] as const) assert.ok(caveatFor(m, lang).length > 60);
  });
});

describe("events", () => {
  test("an injected event appears in the next round's briefs, not before", () => {
    let r = startRehearsal(lunch, { seed: 8 });
    const text = "The café opposite starts an €8.50 lunch deal";
    assert.ok(!roundBriefs(r).some((b) => b.prompt.includes(text)));
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    r = injectEvent(r, text);
    assert.deepEqual(r.events, [{ beforeRound: 2, text }]);
    const briefs = roundBriefs(r);
    assert.ok(briefs.length > 0);
    for (const b of briefs) assert.ok(b.prompt.includes(`- In the neighbourhood: ${text}`));
    assert.ok(r.feed.some((f) => f.kind === "event" && f.round === 2 && f.text === text));
    const later = autoplayRehearsal(r);
    assert.deepEqual(summarize(later).events, [{ beforeRound: 2, text }]);
  });

  test("an event during a round applies from the next one; events need text and a next round", () => {
    const r = startRehearsal(price, { seed: 8 });
    const [a] = activeIds(r) as [string];
    const mid = injectEvent(submitRound(r, [goodReaction(r, a)]).rehearsal, "It rains all week");
    assert.equal(mid.events[0]!.beforeRound, 2);
    assert.ok(!roundBriefs(mid).some((b) => b.prompt.includes("It rains all week")));
    assert.throws(() => injectEvent(r, "   "), /Describe the event/);
    assert.throws(() => injectEvent(autoplayRehearsal(r), "Too late"), /finished/);
  });

  test("an event passed to startRehearsal applies before round 1", () => {
    const r = startRehearsal(lunch, { seed: 8, event: "Rain all week" });
    assert.deepEqual(r.events, [{ beforeRound: 1, text: "Rain all week" }]);
    for (const b of roundBriefs(r)) assert.ok(b.prompt.includes("- In the neighbourhood: Rain all week"));
  });

  test("Berlin events by id, in the rehearsal language, and back in another language after a rebuild", () => {
    const ids = BERLIN_EVENTS.map((e) => e.id);
    assert.deepEqual(ids, ["bvg_strike", "rain_week", "heatwave", "baustelle", "school_holidays", "rival_lunch", "street_festival", "christmas_market"]);
    for (const e of BERLIN_EVENTS) for (const lang of LANGS) assert.ok(e.text[lang].length > 10, `${e.id} ${lang}`);
    const rival = BERLIN_EVENTS.find((e) => e.id === "rival_lunch")!;
    const de = fixture("lunch_offer", "a-ev", "de");
    let r = startRehearsal(de, { seed: 5 });
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    r = injectEvent(r, "rival_lunch");
    assert.deepEqual(r.events, [{ beforeRound: 2, text: rival.text.de, id: "rival_lunch" }]);
    assert.equal(r.feed.find((f) => f.kind === "event")!.name, "Im Kiez");
    for (const b of roundBriefs(r)) assert.ok(b.prompt.includes(`- In the neighbourhood: ${rival.text.de}`));
    // The English text of the same event is recognised as the event too.
    const en = injectEvent(startRehearsal(lunch, { seed: 5 }), rival.text.en);
    assert.equal(en.events[0]!.id, "rival_lunch");
    // The site's language switcher: the same share data rebuilt in Spanish shows the event in Spanish.
    r = autoplayRehearsal(r);
    const es = rebuildRehearsal(fixture("lunch_offer", "a-ev", "es"), toShareRehearsal(r));
    assert.deepEqual(es.events, [{ beforeRound: 2, text: rival.text.es, id: "rival_lunch" }]);
    assert.equal(es.status, "done");
    // Events change what the stand-in does: after a BVG strike some office workers stay home.
    const strike = (eventId?: string) =>
      Array.from({ length: 40 }, (_, i) => playAll(startRehearsal(fixture("lunch_offer", "a-st", "en", { kiez: "Mitte" }), { seed: i + 1, ...(eventId ? { event: eventId } : {}) })))
        .reduce((s, x) => s + x.reactions.filter((y) => y.action === "not_around" && x.active[y.round]!.includes(y.personaId)).length, 0);
    assert.ok(strike("bvg_strike") > strike() + 10);
  });
});

describe("rebuild from share state", () => {
  test("rebuildRehearsal reproduces the same rehearsal and summary, through the real state codec", () => {
    let r = startRehearsal(lunch, { seed: 13, personas: 7, rounds: 5, customerMix: { office_worker: 2, regular: 1, student: 1 } });
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    r = injectEvent(r, "A food blogger posts about the deal on Instagram");
    // Round 2: one persona played by a subagent, the rest rule-based.
    const [a] = activeIds(r) as [string];
    r = submitRound(r, [goodReaction(r, a, "tries_deal")], "subagent").rehearsal;
    r = injectEvent(r, "Roadworks block the pavement for a week");
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    r = autoplayRehearsal(r);
    const ask = interviewBriefs(r, "What would make you come back next week?");
    r = recordInterview(r, "What would make you come back next week?", ask.map((b) => ({ personaId: b.personaId, answer: `A shorter queue, says ${b.name}.` })), "subagent").rehearsal;

    const token = encodeState({ v: 1, template: "lunch_offer", inputs: demoInputs("lunch_offer"), rehearsal: toShareRehearsal(r) });
    const share = decodeState(token).rehearsal!;
    assert.ok(share.reactions.length < r.reactions.length, "automatic not-around reactions are left out of the token");
    const back = rebuildRehearsal(lunch, share);
    assert.deepEqual(summarize(back), summarize(r));
    assert.deepEqual(back, r);
  });

  test("every language rebuilds to the same rehearsal through the codec, Berlin events and word-of-mouth links included", () => {
    for (const lang of LANGS) {
      const a = fixture("lunch_offer", `a-rb-${lang}`, lang, { kiez: "Friedrichshain" });
      const r = playAll(startRehearsal(a, { seed: DEMO_SEEDS.lunch_offer }), "rival_lunch");
      const token = encodeState({ v: 1, template: "lunch_offer", inputs: demoInputs("lunch_offer"), lang, rehearsal: toShareRehearsal(r) });
      const back = rebuildRehearsal(a, decodeState(token).rehearsal!);
      assert.deepEqual(back, r, lang);
      assert.deepEqual(summarize(back), summarize(r), lang);
    }
  });

  test("a rehearsal saved mid-round rebuilds to the same place, events included", () => {
    let r = startRehearsal(price, { seed: 5 });
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    const [a] = activeIds(r) as [string];
    r = submitRound(r, [goodReaction(r, a)], "in-context").rehearsal;
    r = injectEvent(r, "A new chain café opens by the U-Bahn");
    const back = rebuildRehearsal(price, JSON.parse(JSON.stringify(toShareRehearsal(r))));
    assert.deepEqual(back, r);
    assert.deepEqual(roundBriefs(back), roundBriefs(r));
  });

  test("tampered share data is skipped rather than crashing", () => {
    const r = autoplayRehearsal(startRehearsal(lunch, { seed: 3 }));
    const share = toShareRehearsal(r);
    const bad = { ...share, reactions: [...share.reactions.slice(0, 2), { personaId: "p77", round: 1, action: "x", thought: "", method: "subagent" }] } as typeof share;
    const back = rebuildRehearsal(lunch, bad);
    assert.equal(back.currentRound, 1);
    assert.equal(back.status, "running");
  });
});

describe("interviews", () => {
  test("briefs ask one question with the persona's whole story; answers are validated and recorded", () => {
    const r = autoplayRehearsal(startRehearsal(lunch, { seed: 6 }));
    const q = "Would you pay €10.50 for the same deal?";
    const all = interviewBriefs(r, q);
    assert.equal(all.length, r.personas.length);
    const b = all[0]!;
    const p = r.personas.find((x) => x.id === b.personaId)!;
    assert.ok(b.prompt.includes(p.story));
    assert.ok(b.prompt.includes(`THE OWNER'S QUESTION\n"${q}"`));
    assert.ok(b.prompt.includes("WHAT YOU DID AND THOUGHT\n- Round 1"));
    assert.ok(b.prompt.includes(`{"personaId":"${p.id}","answer":"<your answer, first person>"}`));
    assert.ok(b.prompt.includes("You do NOT know the café's costs"));
    assert.deepEqual(interviewBriefs(r, q, ["p2", "p1"]).map((x) => x.personaId), ["p1", "p2"]);
    assert.throws(() => interviewBriefs(r, q, ["p42"]), /Unknown persona id\(s\): p42/);
    assert.throws(() => interviewBriefs(r, "  "), /Ask the imagined customers one question/);

    const out = recordInterview(r, q, [
      { personaId: "p1", answer: "Probably not. €9.90 already felt like the top of my budget." },
      { personaId: "p2", answer: "" },
      { personaId: "p3", answer: "x".repeat(600) },
      { personaId: "nobody", answer: "Hi" },
      JSON.stringify({ personaId: "p4", answer: "Yes, if the soup stays this good." }),
    ], "in-context");
    assert.deepEqual(out.errors.map((e) => e.personaId), ["p2", "p3", "nobody"]);
    assert.equal(out.rehearsal.interviews.length, 1);
    assert.deepEqual(out.rehearsal.interviews[0]!.answers.map((x) => [x.personaId, x.method]), [["p1", "in-context"], ["p4", "in-context"]]);
    const again = recordInterview(out.rehearsal, q, [{ personaId: "p1", answer: "Changed my mind: yes." }]).rehearsal;
    assert.equal(again.interviews[0]!.answers.find((x) => x.personaId === "p1")!.answer, "Changed my mind: yes.");
    assert.deepEqual(summarize(again).interviews, again.interviews);
    assert.equal(r.interviews.length, 0, "the input rehearsal is unchanged");
  });
});

const engineReady = existsSync(new URL("../src/engine/index.ts", import.meta.url));
test("works with the real engine's demo analysis, in every language", { skip: !engineReady && "src/engine/index.ts not written yet" }, async () => {
  const eng = await import("../src/engine/index.ts");
  for (const t of ["lunch_offer", "price_change"] as const) {
    for (const lang of LANGS) {
      const a = eng.analyze(t, eng.demoInputs(t), { demo: true, createdAt: T, lang } as Parameters<typeof eng.analyze>[2]);
      const r = autoplayRehearsal(startRehearsal(a));
      const s = summarize(r);
      assert.equal(s.status, "done");
      assert.equal(s.analysisId, a.id);
      assert.equal(s.lang, a.lang ?? "en");
      assert.deepEqual(rebuildRehearsal(a, toShareRehearsal(r)), r);
    }
  }
});
