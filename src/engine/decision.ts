/**
 * One decision rule, used twice: planTest() prints it on the test card before the test,
 * compareResult() applies exactly the same numbers afterwards, so the verdict can never
 * disagree with the card.
 *
 * Lunch offer: the rule is about the days after the test. The setup is spent either way
 * (a sunk cost), so "keep" starts where each day pays its way (the ongoing break-even),
 * not where the test pays back its setup. Paying back the test is shown as a second line.
 */
import { ceilUp, EPS, n } from "./format.ts";
import type { Values } from "./format.ts";
import type { LunchModel } from "./lunch-offer.ts";
import type { PriceModel } from "./price-change.ts";
import type { DecisionThresholds } from "./types.ts";

export type Verdict = "keep" | "tweak" | "stop";

/** Extra lunch customers a day (measured average): keep from the ongoing break-even, tweak from half of it. Null when no number of customers can pay. */
export function lunchThresholds(m: LunchModel, v: Values): DecisionThresholds | null {
  if (!m.reachable || m.beOngoing === null || m.beOngoingExact === null || m.beTest === null) return null;
  const keepFrom = m.beOngoing;
  const tweakFrom = keepFrom === 0 ? 0 : Math.min(keepFrom, Math.max(1, ceilUp(m.beOngoingExact * 0.5)));
  const high = n(v, "extra_high"), wc = n(v, "weekday_customers");
  const testable = !(keepFrom > Math.max(3 * high, 10) || (wc > 0 && keepFrom > wc));
  return { unit: "customers/day", keepFrom, tweakFrom, payBackFrom: m.beTest, testable };
}

/**
 * Sales a week at the new price, measured against a baseline (default: the planned sales a week).
 * Price rise: keep while you still sell what keeps you level; tweak down to a drop of 1.5× the break-even.
 * Price cut: keep from the sales that make up for the cut; tweak from half of that rise.
 */
export function priceThresholds(m: PriceModel, baseline = m.units): DecisionThresholds | null {
  if (!m.reachable || m.beV === null) return null;
  const units = baseline;
  if (m.beV <= -1 + EPS) return { unit: "units/week", keepFrom: 0, tweakFrom: 0, testable: true };
  if (m.beV <= 0) {
    const keepFrom = units - Math.max(0, Math.floor(units * -m.beV + EPS));
    const tweakFrom = Math.min(keepFrom, ceilUp(units * (1 + 1.5 * m.beV)));
    return { unit: "units/week", keepFrom, tweakFrom, testable: true };
  }
  const keepFrom = units + Math.ceil(units * m.beV - EPS);
  const tweakFrom = Math.min(keepFrom, ceilUp(units * (1 + 0.5 * m.beV)));
  return { unit: "units/week", keepFrom, tweakFrom, testable: true };
}

/** The verdict for a measured value. No thresholds (the deal or price cannot pay at all): stop. */
export function verdictFor(th: DecisionThresholds | null, measured: number): Verdict {
  if (!th) return "stop";
  if (measured >= th.keepFrom - EPS) return "keep";
  if (measured >= th.tweakFrom - EPS && th.tweakFrom < th.keepFrom) return "tweak";
  return "stop";
}
