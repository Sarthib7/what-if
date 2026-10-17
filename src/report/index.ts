/**
 * The visual report: every analysis drawn as a six-step lesson.
 *
 *   1. Your question            4. The one number to remember (break-even + slider)
 *   2. Your numbers (sources)   5. Rehearsal with imagined customers
 *   3. Possible outcomes        6. Your test (+ result), then "What you learned"
 *
 * Pure and browser-safe: renderReport() returns an HTML string (all user and
 * model text escaped, no external URLs), reportStyles() the CSS, and
 * mountReport() renders into an element and wires the interactive parts.
 */
import { setCurrency } from "../engine/format.ts";
import { wireReport } from "./mount.ts";
import { stepStates } from "./model.ts";
import type { ReportInput } from "./model.ts";
import { step5 } from "./rehearsal.ts";
import { closing, hero, step1, step2, step3, step4, step6, stepper } from "./sections.ts";

export type { ReportInput, StepState } from "./model.ts";
export { STEPS, stepStates } from "./model.ts";
export { reportStyles, reportTokens } from "./styles.ts";
export { printTestCard } from "./mount.ts";
export { chip, esc } from "./html.ts";

export function renderReport(input: ReportInput): string {
  const a = input.analysis;
  setCurrency(a.currency || "EUR");
  const states = stepStates(input);
  const s = (i: number) => states[i] ?? "upcoming";
  return `<div class="wi-report" data-wi-report data-template="${a.template === "price_change" ? "price_change" : "lunch_offer"}">
${hero(a)}
${stepper(states)}
${step1(input, s(0))}
${step2(input, s(1))}
${step3(input, s(2))}
${step4(input, s(3))}
${step5(input, s(4))}
${step6(input, s(5))}
${closing(input)}
</div>`;
}

export function mountReport(root: HTMLElement, input: ReportInput): void {
  setCurrency(input.analysis.currency || "EUR");
  wireReport(root, input, renderReport);
}
