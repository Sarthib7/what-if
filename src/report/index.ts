/**
 * The visual report: every analysis drawn as a six-step lesson, in the
 * analysis language (German, English, Spanish or Polish).
 *
 *   1. Your question (+ who did what)   4. The number to remember (guess first, then break-even + slider)
 *   2. Your numbers (+ Berlin facts)    5. Rehearsal with imagined customers
 *   3. Possible outcomes                6. Your test (+ result), then "What you learned"
 *
 * Pure and browser-safe: renderReport() returns an HTML string (all user and
 * model text escaped; the only external links are the public facts' sources),
 * reportStyles() the CSS, and mountReport() renders into an element and wires
 * the interactive parts.
 */
import { wireReport } from "./mount.ts";
import type { MountOptions } from "./mount.ts";
import { stepStates, useReport } from "./model.ts";
import type { ReportInput } from "./model.ts";
import { step5 } from "./rehearsal.ts";
import { closing, hero, step1, step2, step3, step4, step6, stepper } from "./sections.ts";

export type { ReportInput, StepState } from "./model.ts";
export type { MountOptions } from "./mount.ts";
export { STEPS, stepStates, reportLang } from "./model.ts";
export { reportStyles, reportTokens } from "./styles.ts";
export { printTestCard } from "./mount.ts";
export { chip, esc } from "./html.ts";
export { REPORT_MESSAGES } from "./messages.ts";

export function renderReport(input: ReportInput): string {
  const a = input.analysis;
  const lang = useReport(a);
  const states = stepStates(input);
  const s = (i: number) => states[i] ?? "upcoming";
  return `<div class="wi-report" data-wi-report lang="${lang}" data-lang="${lang}" data-template="${a.template === "price_change" ? "price_change" : "lunch_offer"}">
${hero(input)}
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

/**
 * Renders the report into `root` and wires the sliders, tabs, toggles, the
 * predict-then-check box and the language switcher. The switcher (DE · EN · ES · PL)
 * shows only when `onLanguage` is given (here or as `input.onLanguage`); it is called
 * with the picked language, and the page re-renders the same link in it.
 */
export function mountReport(root: HTMLElement, input: ReportInput, opts: MountOptions = {}): void {
  wireReport(root, input, renderReport, opts);
}
