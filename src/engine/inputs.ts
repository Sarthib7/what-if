import { num, pct, price, signedPct } from "./format.ts";
import { getTemplate } from "./templates.ts";
import type { FieldSpec, InputCheck, MissingInput, RawInputs, ResolvedInput, Source } from "./types.ts";

/**
 * Turns whatever the owner has said so far into a complete, labelled input set,
 * or tells the coach which single question to ask next.
 *
 * Owner-given facts are tagged "owner", guesses "assumption", demo values "demo".
 * A missing optional value gets a sensible fallback, tagged as a guess with a note,
 * so the owner can see exactly what What-IF assumed on their behalf.
 */
export function checkInputs(templateId: string, raw: RawInputs, opts: { demo?: boolean } = {}): InputCheck {
  const t = getTemplate(templateId);
  const resolved: ResolvedInput[] = [];
  const missing: MissingInput[] = [];
  const problems: string[] = [];
  const given = new Map<string, number | string>();

  for (const f of t.fields) {
    const v = normalise(f, raw[f.key], problems);
    if (v !== undefined) given.set(f.key, v);
  }

  for (const f of t.fields) {
    const v = given.get(f.key);
    if (v !== undefined) {
      resolved.push(entry(f, v, opts.demo ? "demo" : f.kind === "assumption" ? "assumption" : "owner"));
      continue;
    }
    const derived = derive(templateId, f.key, given);
    if (derived) {
      given.set(f.key, derived.value);
      resolved.push(entry(f, derived.value, "assumption", derived.note));
      continue;
    }
    if (f.required) {
      missing.push({ key: f.key, label: f.label, ask: f.ask, why: f.why, fallback: f.fallback });
      continue;
    }
    if (f.fallback !== undefined) {
      given.set(f.key, f.fallback);
      resolved.push(entry(f, f.fallback, "assumption", `You did not say, so What-IF used ${show(f, f.fallback)}. Change it if you know better.`));
    }
  }

  problems.push(...crossChecks(templateId, given));
  return { template: t.id, ready: missing.length === 0 && problems.length === 0, missing, problems, resolved };
}

function entry(f: FieldSpec, value: number | string, source: Source, note?: string): ResolvedInput {
  return { key: f.key, label: f.label, value, unit: f.unit, source, kind: f.kind, why: f.why, ...(note ? { note } : {}) };
}

/** Accepts "32" or "32%" for a share, "€9,90" for money; rejects out-of-range values with a plain reason. */
function normalise(f: FieldSpec, v: RawInputs[string], problems: string[]): number | string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (f.unit === "text") return String(v).trim() || undefined;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const s = cleanNumber(String(v));
    const isPct = s.endsWith("%");
    n = Number(isPct ? s.slice(0, -1) : s);
    if (isPct) n /= 100;
  }
  if (!Number.isFinite(n)) {
    problems.push(`"${f.label}" should be a number; got "${v}".`);
    return undefined;
  }
  if (f.unit === "share" && Math.abs(n) > 1 && Math.abs(n) <= 100) n /= 100;
  if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
    problems.push(`"${f.label}" of ${show(f, n)} looks off; expected between ${show(f, f.min ?? n)} and ${show(f, f.max ?? n)}.`);
    return undefined;
  }
  return n;
}

/**
 * "€9,90" → "9.90", "1,500" / "€16,500" → "1500" / "16500", "1.500,50" → "1500.50",
 * "−12 %" (typographic minus, as What-IF itself writes it) → "-12%", "9.90 EUR" → "9.90".
 */
function cleanNumber(raw: string): string {
  let s = raw.replace(/[−–]/g, "-").replace(/(EUR|USD|GBP|CHF)/gi, "").replace(/[€$£\s]/g, "");
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (comma >= 0) s = /^[+-]?[1-9]\d{0,2}(,\d{3})+%?$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  return s;
}

function derive(templateId: string, key: string, given: Map<string, number | string>): { value: number; note: string } | undefined {
  const n = (k: string) => (typeof given.get(k) === "number" ? (given.get(k) as number) : undefined);
  if (templateId === "lunch_offer") {
    const likely = n("extra_likely");
    if (key === "extra_low" && likely !== undefined) {
      const v = Math.floor(likely * 0.4);
      return { value: v, note: `Cautious guess set to ${v} (about 40% of your likely guess) because you gave one number. A range is more honest.` };
    }
    if (key === "extra_high" && likely !== undefined) {
      const v = Math.max(likely + 1, Math.ceil(likely * 1.8));
      return { value: v, note: `Optimistic guess set to ${v} (about 1.8× your likely guess) because you gave one number.` };
    }
    const spend = n("avg_spend");
    if (key === "lunch_spend" && spend !== undefined) {
      return { value: spend, note: `You did not say what lunch customers spend, so What-IF used your average spend of ${price(spend)}. Lunch is often higher; check your till.` };
    }
  }
  if (templateId === "price_change") {
    const likely = n("volume_likely");
    if (key === "volume_low" && likely !== undefined) {
      const v = Math.max(-1, likely - 0.08);
      return { value: v, note: `Cautious guess set to ${signedPct(v)} (8 points below your likely guess).` };
    }
    if (key === "volume_high" && likely !== undefined) {
      const v = Math.min(0.05, likely + 0.04);
      return { value: v, note: `Optimistic guess set to ${signedPct(v)} (4 points above your likely guess).` };
    }
  }
  return undefined;
}

function crossChecks(templateId: string, g: Map<string, number | string>): string[] {
  const n = (k: string) => g.get(k) as number | undefined;
  const out: string[] = [];
  if (templateId === "lunch_offer") {
    const p = n("offer_price"), c = n("offer_cost");
    if (p !== undefined && c !== undefined && c >= p)
      out.push(`The deal's ingredients (${price(c)}) cost as much as its price (${price(p)}), so every deal sold loses money. Raise the price or trim what is in it.`);
    const lo = n("extra_low"), li = n("extra_likely"), hi = n("extra_high");
    if (lo !== undefined && li !== undefined && lo > li) out.push(`The cautious guess (${num(lo)}) is above the likely guess (${num(li)}); swap them.`);
    if (hi !== undefined && li !== undefined && hi < li) out.push(`The optimistic guess (${num(hi)}) is below the likely guess (${num(li)}); swap them.`);
    const lunch = n("lunch_customers"), day = n("weekday_customers");
    if (lunch !== undefined && day !== undefined && lunch > day) out.push(`Lunch customers (${num(lunch)}) cannot be more than customers for the whole day (${num(day)}).`);
  }
  if (templateId === "price_change") {
    const a = n("current_price"), b = n("new_price"), c = n("unit_cost");
    if (a !== undefined && b !== undefined && a === b) out.push("The new price is the same as the current price.");
    if (c !== undefined && b !== undefined && c >= b) out.push(`The item costs ${price(c)} to make, more than the new price of ${price(b)}.`);
    const lo = n("volume_low"), li = n("volume_likely"), hi = n("volume_high");
    if (lo !== undefined && li !== undefined && lo > li) out.push("The cautious guess is above the likely guess; swap them.");
    if (hi !== undefined && li !== undefined && hi < li) out.push("The optimistic guess is below the likely guess; swap them.");
  }
  return out;
}

export function show(f: Pick<FieldSpec, "unit">, v: number | string): string {
  if (typeof v === "string") return v;
  switch (f.unit) {
    case "EUR":
      return price(v);
    case "EUR/day":
      return `${price(v)} a day`;
    case "EUR/week":
      return `${price(v)} a week`;
    case "EUR/month":
      return `${price(v)} a month`;
    case "share": {
      const digits = Number.isInteger(Math.round(v * 1e6) / 1e4) ? 0 : 1;
      return v < 0 ? `−${pct(-v, digits)}` : pct(v, digits);
    }
    case "customers/day":
      return `${num(v)} a day`;
    case "units/week":
      return `${num(v)} a week`;
    case "days":
      return `${num(v)} days`;
    default:
      return String(v);
  }
}

/** Reads a resolved input as a number (throws if the template is not ready). */
export function valueOf(inputs: ResolvedInput[], key: string): number {
  const i = inputs.find((x) => x.key === key);
  if (!i || typeof i.value !== "number") throw new Error(`Input "${key}" is missing`);
  return i.value;
}
