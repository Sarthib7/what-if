/**
 * The site's live demo: a ShareState for the made-up café, with a rehearsal
 * played by the rule-based stand-in (no model), so "See it work" needs no
 * server and no AI. Browser-safe.
 */
import { analyze, DEMO_BUSINESS, demoInputs, getTemplate } from "../engine/index.ts";
import type { TemplateId } from "../engine/types.ts";
import { autoplayRehearsal, injectEvent, ruleBasedReactions, startRehearsal, submitRound, toShareRehearsal } from "../sim/index.ts";
import { encodeState } from "../state.ts";
import type { ShareState } from "../state.ts";

export const DEMO_EVENT = "The café opposite starts an €8.50 lunch deal.";

export function demoState(template: TemplateId = "lunch_offer", opts: { rehearsal?: boolean; seed?: number } = {}): ShareState {
  const t = getTemplate(template);
  const inputs = demoInputs(template);
  const state: ShareState = { v: 1, template, inputs, demo: true, business: DEMO_BUSINESS, question: t.exampleQuestion, currency: "EUR" };
  if (opts.rehearsal === false) return state;
  try {
    const a = analyze(template, inputs, { demo: true, business: DEMO_BUSINESS, question: t.exampleQuestion, currency: "EUR" });
    // Seeds picked for a readable demo: lunch 23 (4 noticed, 3 tried, 2 came back, word of mouth), price change 8.
    let r = startRehearsal(a, { seed: opts.seed ?? (template === "lunch_offer" ? 23 : 8) });
    // Play two rounds, then show "variable injection": the owner adds an event before round 3.
    for (let guard = 0; guard < 4 && r.status !== "done" && r.currentRound < 3; guard++) {
      const out = submitRound(r, ruleBasedReactions(r), "rule-based");
      if (out.rehearsal.currentRound === r.currentRound) break;
      r = out.rehearsal;
    }
    if (template === "lunch_offer" && r.status !== "done" && r.currentRound === 3) r = injectEvent(r, DEMO_EVENT);
    r = autoplayRehearsal(r);
    state.rehearsal = toShareRehearsal(r);
  } catch {
    // The rehearsal is optional: the demo still shows steps 1–4 and 6 without it.
  }
  return state;
}

export function demoToken(template: TemplateId = "lunch_offer"): string {
  return encodeState(demoState(template));
}
