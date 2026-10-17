import { getLang } from "../i18n/index.ts";
import { EPS, price, round } from "./format.ts";
import type { Values } from "./format.ts";
import type { Figure, ResolvedInput, Source, Unit } from "./types.ts";

/** Shared by the lunch and price models: one way to build a figure and tag its source. */
export function fig(id: string, label: string, value: number, unit: Unit, source: Source, maths: string): Figure {
  return { id, label, value: unit === "share" ? round(value, 4) : round(value, 2), unit, source, maths };
}

/** A figure built from inputs is demo data if any input is, a guess if any input is a guess, else a calculation. */
export function fromSources(src: Record<string, Source>, keys: string[]): Source {
  const s = keys.map((k) => src[k]);
  if (s.includes("demo")) return "demo";
  if (s.includes("assumption")) return "assumption";
  return "calculation";
}

export function valuesOf(inputs: ResolvedInput[]): Values {
  return Object.fromEntries(inputs.map((i) => [i.key, i.value]));
}

export function sourcesOf(inputs: ResolvedInput[]): Record<string, Source> {
  return Object.fromEntries(inputs.map((i) => [i.key, i.source]));
}

/** True when What-IF filled the value in (a fallback or derived from another answer), so it is worth asking about. */
export function filledIn(inputs: ResolvedInput[], key: string): boolean {
  const i = inputs.find((x) => x.key === key);
  if (!i) return false;
  if (i.filledBy) return i.filledBy === "fallback" || i.filledBy === "derived";
  return i.source === "assumption" && i.note !== undefined;
}

/** "€13.57 for regulars who switch + €23.00 for staff and promotion − €4.00 …" (zero parts left out; cents, for maths lines). */
export function sumText(parts: { amount: number; label: string }[]): string {
  const live = parts.filter((p) => Math.abs(p.amount) > EPS).sort((x, y) => Number(x.amount < 0) - Number(y.amount < 0));
  if (live.length === 0) return price(0);
  return live
    .map((p, i) => {
      const body = `${price(Math.abs(p.amount))} ${p.label}`;
      if (i === 0) return p.amount < 0 ? `−${body}` : body;
      return `${p.amount < 0 ? "−" : "+"} ${body}`;
    })
    .join(" ");
}

/** Lower-cases the first letter to continue a sentence, except in German (nouns keep their capital). */
export function continueSentence(s: string): string {
  if (getLang() === "de" || !s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
