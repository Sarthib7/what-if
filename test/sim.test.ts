import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";
import { demoInputs } from "../src/engine/templates.ts";
import type { Analysis, TemplateId } from "../src/engine/types.ts";
import {
  CAVEAT,
  LIMITS,
  autoplayRehearsal,
  hashString,
  injectEvent,
  interviewBriefs,
  rebuildRehearsal,
  recordInterview,
  roundBriefs,
  ruleBasedReactions,
  startRehearsal,
  submitRound,
  summarize,
  toShareRehearsal,
} from "../src/sim/index.ts";
import type { Rehearsal } from "../src/sim/types.ts";
import { decodeState, encodeState } from "../src/state.ts";

const T = "2026-10-17T12:00:00.000Z";

/** A hand-made Analysis: the rehearsal only reads id, template, business, question, currency, createdAt and inputs. */
function fixture(template: TemplateId, id = `a-test-${template}`): Analysis {
  const inputs = demoInputs(template);
  return {
    id,
    template,
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
          assert.ok(!/[{}]/.test(p.story + p.routine), "no unfilled placeholders");
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

  test("at least half are around each round; the others are recorded as not around without a model", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = startRehearsal(price, { seed, personas: 4 + (seed % 9), rounds: 5 });
      for (let k = 1; k <= 5; k++) assert.ok(r.active[k]!.length >= Math.ceil(r.personas.length / 2), `round ${k}`);
      const absent = r.personas.filter((p) => !r.active[1]!.includes(p.id));
      for (const p of absent) {
        const x = r.reactions.find((y) => y.personaId === p.id && y.round === 1);
        assert.equal(x?.action, "not_around");
        assert.equal(x?.method, "rule-based");
      }
      assert.equal(roundBriefs(r).length, r.active[1]!.length, "briefs only for active personas");
    }
  });

  test("the change text and rounds follow the template", () => {
    const r = startRehearsal(lunch);
    assert.equal(r.change, "Lunch deal: soup, sandwich and a drink for €9.90, weekdays 11:30–14:30");
    assert.deepEqual(r.rounds.map((s) => s.title), ["Launch day: the board goes up", "First week, Tuesday 12:30", "Second week", "After the test"]);
    assert.ok(r.rounds[0]!.situation.includes('The board outside says: "Lunch deal — soup, sandwich and a drink for €9.90, weekdays 11:30–14:30"'));
    assert.deepEqual(r.rounds[1]!.actions.map((x) => x.id), ["tries_deal", "usual_order", "eats_elsewhere", "skips_lunch_out", "not_around"]);
    for (const s of r.rounds) assert.ok(s.actions.some((x) => x.id === "not_around"));
    assert.equal(r.rounds[2]!.actions.find((x) => x.id === "tells_a_friend")?.public, true);
    assert.equal(startRehearsal(lunch, { rounds: 5 }).rounds[4]!.title, "A month later");
    assert.equal(startRehearsal(lunch, { rounds: 3 }).rounds.length, 3);
    const p = startRehearsal(price);
    assert.equal(p.change, "Flat white now €4.20 (was €3.90)");
    assert.deepEqual(p.rounds.map((s) => s.title), ["Sees the new price", "Next visit", "Two weeks later", "After the test"]);
    assert.deepEqual(p.rounds[0]!.actions.map((x) => x.id), ["accepts", "grumbles", "does_not_notice", "not_around"]);
    assert.equal(p.rounds[0]!.actions.find((x) => x.id === "grumbles")?.public, true);
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
    assert.ok(b.prompt.includes("Most people ignore most offers"));
    assert.ok(b.prompt.includes("You do NOT know the café's costs"));
    assert.ok(b.prompt.includes('"Not interested" is a perfectly good answer'));
    assert.ok(b.prompt.includes(`{"personaId":"${p.id}","round":1,"action":"<one action id>","thought":"<why, in first person>","questionForOwner":"<optional>","diary":"<one sentence you will remember>"}`));
    for (const id of ["notices_offer", "ignores", "not_around"]) assert.ok(b.prompt.includes(`- ${id}: `));
    assert.deepEqual(b.allowedActions, ["notices_offer", "ignores", "not_around"]);
    assert.ok(b.prompt.trimEnd().endsWith(`at most ${LIMITS.diary} characters.`));
  });

  test("public rounds explain saysPublicly; the diary and the feed carry over", () => {
    let r = startRehearsal(lunch, { seed: 9 });
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    const briefs = roundBriefs(r);
    assert.equal(r.currentRound, 3);
    for (const b of briefs) {
      assert.ok(b.prompt.includes('"saysPublicly":"<only if action is tells_a_friend>"'));
      assert.ok(b.prompt.includes("YOUR DIARY SO FAR\n- Round 1 (Launch day: the board goes up)"));
      assert.ok(b.prompt.includes("Café Lindenblatt, the café's own post"));
    }
  });

  test("briefs never contain the owner's costs or private figures", () => {
    const leaks = {
      lunch_offer: ["€3.60", "3.6", "16,500", "16500", "€180", "1,500", "1500", "€18.00", "€25.00", "32%", "0.32", "€11.20", "140 customers", "38 lunch"],
      price_change: ["€0.95", "0.95", "620"],
    } as const;
    for (const a of [lunch, price]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        for (const prompt of allBriefPrompts(a, { seed, personas: 8, rounds: 5 })) {
          for (const leak of leaks[a.template]) assert.ok(!prompt.includes(leak), `brief for ${a.template} contains "${leak}"`);
        }
      }
    }
  });
});

describe("submitRound validation", () => {
  test("bad items get per-persona errors; good items in the same batch are kept", () => {
    // A seed where round 1 has at least five people around and at least one away.
    let seed = 1;
    while (!((n) => n >= 5 && n < 8)(startRehearsal(lunch, { seed, personas: 8 }).active[1]!.length)) seed++;
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

  test("public words are kept only for public actions; text replies, names and missing diaries are handled", () => {
    let r = startRehearsal(lunch, { seed: 11 });
    while (r.currentRound < 3) r = submitRound(r, ruleBasedReactions(r), "rule-based").rehearsal;
    const [a, b, c] = activeIds(r) as [string, string, string];
    const nameOfC = r.personas.find((p) => p.id === c)!.name;
    const out = submitRound(r, [
      { ...goodReaction(r, a, "tells_a_friend"), saysPublicly: "The soup at the corner café is good now." },
      { ...goodReaction(r, b, "back_to_usual"), saysPublicly: "Nobody should hear this." },
      `Sure! \`\`\`json\n${JSON.stringify({ personaId: nameOfC, round: 3, action: "Back to the usual order", thought: "Same as always." })}\n\`\`\``,
    ]);
    assert.equal(out.accepted, 3, JSON.stringify(out.errors));
    const get = (id: string) => out.rehearsal.reactions.find((x) => x.personaId === id && x.round === 3)!;
    assert.equal(get(a).saysPublicly, "The soup at the corner café is good now.");
    assert.equal(get(b).saysPublicly, undefined);
    assert.equal(get(c).action, "back_to_usual");
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
      assert.equal(s.perRound.length, 4);
      assert.equal(s.uptake.length, 4);
      for (const u of s.uptake) assert.ok(u.engaged <= u.active && u.active === r.active[u.round]!.length);
      assert.equal(s.funnel.length, 4);
      for (const f of s.funnel) assert.ok(f.of === r.personas.length && f.count >= 0 && f.count <= f.of);
      assert.ok(s.quotes.length > 0 && s.quotes.length <= 6);
      assert.ok(s.checkWithRealCustomers.length >= 3 && s.checkWithRealCustomers.length <= 5);
      assert.equal(s.caveat, CAVEAT);
      assert.equal(new Set(s.questionsForOwner.map((q) => q.toLowerCase())).size, s.questionsForOwner.length);
      for (const l of s.links) assert.ok(r.personas.some((p) => p.id === l.from) && r.personas.some((p) => p.id === l.to) && l.from !== l.to);
      for (const x of r.reactions) {
        assert.ok(x.thought.length > 0 && x.thought.length <= LIMITS.thought);
        assert.ok(!/\{\w+\}/.test(`${x.thought} ${x.diary ?? ""} ${x.saysPublicly ?? ""}`), "no unfilled placeholders");
      }
    });
  }

  test("funnel labels are descriptive counts for each template", () => {
    assert.deepEqual(summarize(autoplayRehearsal(startRehearsal(lunch))).funnel.map((f) => f.label), ["Noticed it", "Tried it", "Came back", "Told someone"]);
    assert.deepEqual(
      summarize(autoplayRehearsal(startRehearsal(price))).funnel.map((f) => f.label),
      ["Noticed the new price", "Kept buying as before", "Bought less or went elsewhere", "Said something about it"],
    );
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

  test("summary counts follow a scripted run", () => {
    let r = startRehearsal(lunch, { seed: 21, personas: 4 });
    // Everyone around plays one fixed path; absent people are recorded automatically.
    const path = ["notices_offer", "tries_deal", "tells_a_friend", "keeps_coming"];
    while (r.status === "running") {
      const k = r.currentRound;
      r = submitRound(r, activeIds(r).map((id) => ({ ...goodReaction(r, id, path[k - 1]), ...(k === 3 ? { saysPublicly: `Tell everyone (${id}).` } : {}) })), "in-context").rehearsal;
    }
    const s = summarize(r);
    const ever = (action: string) => new Set(r.reactions.filter((x) => x.action === action).map((x) => x.personaId)).size;
    assert.equal(s.method, "in-context");
    assert.equal(s.funnel[1]!.count, ever("tries_deal"));
    assert.equal(s.funnel[3]!.count, ever("tells_a_friend"));
    assert.equal(s.perRound[1]!.counts.find((c) => c.action === "tries_deal")!.count, r.active[2]!.length);
    assert.equal(s.uptake[0]!.engaged, r.active[1]!.length);
    assert.equal(s.feed.filter((f) => f.kind === "word_of_mouth").length, r.active[3]!.length);
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
test("works with the real engine's demo analysis", { skip: !engineReady && "src/engine/index.ts not written yet" }, async () => {
  const eng = await import("../src/engine/index.ts");
  for (const t of ["lunch_offer", "price_change"] as const) {
    const a = eng.analyze(t, eng.demoInputs(t), { demo: true, createdAt: T });
    const r = autoplayRehearsal(startRehearsal(a));
    const s = summarize(r);
    assert.equal(s.status, "done");
    assert.equal(s.analysisId, a.id);
    assert.deepEqual(rebuildRehearsal(a, toShareRehearsal(r)), r);
  }
});
