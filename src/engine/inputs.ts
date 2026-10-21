import { getLang, isLang, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { normaliseKiez } from "./berlin.ts";
import { num, pct, price, signedPct } from "./format.ts";
import { msg as t } from "./messages.ts";
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
export function checkInputs(templateId: string, raw: RawInputs, opts: { demo?: boolean; lang?: Lang } = {}): InputCheck {
  if (opts.lang && isLang(opts.lang)) setLang(opts.lang);
  const lang = getLang();
  const t0 = getTemplate(templateId, lang);
  const resolved: ResolvedInput[] = [];
  const missing: MissingInput[] = [];
  const problems: string[] = [];
  const given = new Map<string, number | string>();
  const notes = new Map<string, string>();
  const aliased = new Set<string>();
  const input: RawInputs = { ...(raw ?? {}) };

  for (const f of t0.fields) {
    const r = normalise(f, input[f.key], problems, lang);
    if (r === undefined) continue;
    given.set(f.key, r.value);
    if (r.note) notes.set(f.key, r.note);
  }

  // Older report links carried "extra_staff_cost_per_day" (a daily cost); read it as hours × cost per hour.
  if (t0.id === "lunch_offer" && !given.has("extra_staff_hours_per_day")) {
    const old = input.extra_staff_cost_per_day;
    if (old !== undefined && old !== null && old !== "") {
      const cost = typeof old === "number" ? old : parseNumber(String(old), lang).value;
      if (Number.isFinite(cost) && cost >= 0) {
        const rate = given.get("staff_hourly_cost");
        if (cost === 0) given.set("extra_staff_hours_per_day", 0);
        else if (typeof rate === "number" && rate > 0) given.set("extra_staff_hours_per_day", Math.round((cost / rate) * 100) / 100);
        else {
          given.set("extra_staff_hours_per_day", 1);
          given.set("staff_hourly_cost", cost);
          aliased.add("staff_hourly_cost");
        }
        aliased.add("extra_staff_hours_per_day");
        const note = t("note.staffAlias", { cost: price(cost), hours: num(given.get("extra_staff_hours_per_day") as number, 2), rate: price((given.get("staff_hourly_cost") as number | undefined) ?? cost) });
        notes.set("extra_staff_hours_per_day", note);
        if (aliased.has("staff_hourly_cost")) notes.set("staff_hourly_cost", note);
      } else problems.push(t("problem.notNumber", { label: t0.fields.find((f) => f.key === "extra_staff_hours_per_day")!.label, raw: String(old) }));
    }
  }

  for (const f of t0.fields) {
    const v = given.get(f.key);
    if (v !== undefined) {
      const source: Source = opts.demo ? "demo" : f.kind === "assumption" ? "assumption" : "owner";
      resolved.push(entry(f, v, source, notes.get(f.key), aliased.has(f.key) ? "alias" : undefined));
      continue;
    }
    const derived = derive(t0.id, f.key, given);
    if (derived) {
      given.set(f.key, derived.value);
      resolved.push(entry(f, derived.value, "assumption", derived.note, "derived"));
      continue;
    }
    if (f.required) {
      missing.push({ key: f.key, label: f.label, ask: f.ask, why: f.why, fallback: f.fallback });
      continue;
    }
    if (f.fallback !== undefined) {
      given.set(f.key, f.fallback);
      resolved.push(entry(f, f.fallback, "assumption", fallbackNote(t0.id, f, f.fallback, given), "fallback"));
    }
  }

  problems.push(...crossChecks(t0.id, given));
  return { template: t0.id, ready: missing.length === 0 && problems.length === 0, missing, problems, resolved };
}

function entry(f: FieldSpec, value: number | string, source: Source, note?: string, filledBy?: ResolvedInput["filledBy"]): ResolvedInput {
  return { key: f.key, label: f.label, value, unit: f.unit, source, kind: f.kind, why: f.why, ...(note ? { note } : {}), ...(filledBy ? { filledBy } : {}) };
}

function fallbackNote(templateId: string, f: FieldSpec, v: number | string, given: Map<string, number | string>): string {
  const value = show(f, v);
  if (f.key === "vat_rate") return t(templateId === "lunch_offer" ? "note.vatLunch" : "note.vatPrice", { value });
  if (f.key === "staff_hourly_cost") {
    const hours = given.get("extra_staff_hours_per_day");
    return t(typeof hours === "number" && hours > 0 ? "note.minWage" : "note.minWageUnused", { value, next: price(14.6) });
  }
  return t("note.fallback", { value });
}

// ---------------------------------------------------------------------------
// Numbers as owners type them
// ---------------------------------------------------------------------------

export interface ParsedNumber {
  /** NaN when no number could be read. */
  value: number;
  /** The text had a % sign (or "Prozent", "percent"…). */
  percent: boolean;
  /** More than one number in the text ("30 40"). */
  several?: boolean;
  /** "1.500": one separator followed by exactly three digits. `alt` is the other reading. */
  ambiguous?: { alt: number };
}

const GROUP = /\s(?=\d{3}(?!\d))/;
const TOKEN = /[+-]?\s?\d+(?:(?:[.,'’]|\s(?=\d{3}(?!\d)))\d+)*/g;

/**
 * Reads a number the way a café owner types it, in their language:
 * "1.500", "1.500 €", "16.500", "1 500", "1,500", "9,90", "9.90", "€9,90", "ca. 40", "etwa 40",
 * "about 40", "~40", "40 Kunden", "30 %", "30%", "0,3", "1/3", "16k", "−12 %".
 *
 * One separator followed by exactly three digits after a group of 1–3 digits ("1.500", "1,500")
 * is a thousands separator in German, Spanish and Polish (either mark), and "," is one in English;
 * otherwise the separator is the decimal mark. The other reading is returned as `ambiguous.alt`.
 */
export function parseNumber(text: string, lang: Lang = getLang()): ParsedNumber {
  let s = String(text).normalize("NFKC").replace(/[−–—]/g, "-").trim();
  const percent = /%|\bprozent\b|\bpercent\b|\bper ?cent\b|\bpor ?ciento\b|\bprocent/i.test(s);
  const thousand = /\d\s*(?:k|tsd\.?|tausend|mil|tys\.?)(?![\p{L}])/iu.test(s);
  // Words (ca., etwa, about, Kunden, EUR…), currency and percent signs go; digits, separators, signs and "/" stay.
  s = s.replace(/\p{L}+\.?/gu, " ").replace(/[€$£%~≈*]/g, " ").replace(/\s+/g, " ").trim();
  const frac = /^([+-]?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(s);
  if (frac) {
    const a = Number(frac[1]!.replace(",", ".")), b = Number(frac[2]!.replace(",", "."));
    return { value: b !== 0 ? a / b : NaN, percent };
  }
  const tokens = s.match(TOKEN) ?? [];
  if (tokens.length === 0) return { value: NaN, percent };
  if (tokens.length > 1) return { value: NaN, percent, several: true };
  const tok = tokens[0]!.trim().replace(/^([+-])\s+/, "$1");
  const sign = tok.startsWith("-") ? -1 : 1;
  let body = tok.replace(/^[+-]\s?/, "");
  const grouped = GROUP.test(body) || /['’]/.test(body);
  body = body.replace(/[\s'’]/g, "");
  let value: number;
  let ambiguous: ParsedNumber["ambiguous"];
  const commas = (body.match(/,/g) ?? []).length, dots = (body.match(/\./g) ?? []).length;
  if (commas && dots) {
    const dec = body.lastIndexOf(",") > body.lastIndexOf(".") ? "," : ".";
    const other = dec === "," ? "." : ",";
    const [int, frac2] = [body.slice(0, body.lastIndexOf(dec)), body.slice(body.lastIndexOf(dec) + 1)];
    value = Number(`${int.split(other).join("")}.${frac2}`);
    if (int.includes(dec)) value = NaN;
  } else if (commas + dots === 0) value = Number(body);
  else {
    const sep = commas ? "," : ".";
    const parts = body.split(sep);
    if (parts.length > 2) value = /^[1-9]\d{0,2}$/.test(parts[0]!) && parts.slice(1).every((p) => p.length === 3) ? Number(parts.join("")) : NaN;
    else {
      const [lead, tail] = [parts[0]!, parts[1]!];
      const asDecimal = Number(`${lead}.${tail}`);
      const asThousands = Number(`${lead}${tail}`);
      if (!grouped && tail.length === 3 && /^[1-9]\d{0,2}$/.test(lead)) {
        const thousands = lang !== "en" || sep === ",";
        value = thousands ? asThousands : asDecimal;
        ambiguous = { alt: sign * (thousands ? asDecimal : asThousands) * (thousand ? 1000 : 1) };
      } else value = asDecimal;
    }
  }
  value = sign * value * (thousand ? 1000 : 1);
  return { value, percent, ...(ambiguous ? { ambiguous } : {}) };
}

/** Applies the percent sign and the share rule (30 → 30%) to a parsed number. */
function asFieldValue(f: FieldSpec, x: number, percent: boolean): number {
  let v = percent ? x / 100 : x;
  if (f.unit === "share" && Math.abs(v) > 1 && Math.abs(v) <= 100) v /= 100;
  return v;
}

const inRange = (f: FieldSpec, v: number) => !((f.min !== undefined && v < f.min - 1e-12) || (f.max !== undefined && v > f.max + 1e-12));

/** Accepts "32" or "32%" for a share, "9,90 €" for money; rejects out-of-range values with a plain reason. */
function normalise(f: FieldSpec, v: RawInputs[string], problems: string[], lang: Lang): { value: number | string; note?: string } | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (f.unit === "text") {
    const s = f.key === "kiez" ? normaliseKiez(String(v)) : String(v).trim();
    return s ? { value: s } : undefined;
  }
  let x: number;
  let note: string | undefined;
  if (typeof v === "number") x = asFieldValue(f, v, false);
  else {
    const p = parseNumber(String(v), lang);
    if (p.several) {
      problems.push(t("problem.several", { label: f.label, raw: String(v) }));
      return undefined;
    }
    x = asFieldValue(f, p.value, p.percent);
    if (p.ambiguous && Number.isFinite(x)) {
      const alt = asFieldValue(f, p.ambiguous.alt, p.percent);
      if (!inRange(f, x) && inRange(f, alt)) {
        note = t("note.readRange", { raw: String(v).trim(), value: show(f, alt), alt: show(f, x) });
        x = alt;
      } else note = t("note.read", { raw: String(v).trim(), value: show(f, x), alt: show(f, alt) });
    }
  }
  if (!Number.isFinite(x)) {
    problems.push(t("problem.notNumber", { label: f.label, raw: String(v) }));
    return undefined;
  }
  if (!inRange(f, x)) {
    problems.push(t("problem.range", { label: f.label, value: show(f, x), min: show(f, f.min ?? x), max: show(f, f.max ?? x) }));
    return undefined;
  }
  return note ? { value: x, note } : { value: x };
}

function derive(templateId: string, key: string, given: Map<string, number | string>): { value: number; note: string } | undefined {
  const n = (k: string) => (typeof given.get(k) === "number" ? (given.get(k) as number) : undefined);
  if (templateId === "lunch_offer") {
    const likely = n("extra_likely");
    if (key === "extra_low" && likely !== undefined) {
      const v = Math.floor(likely * 0.4);
      return { value: v, note: t("note.deriveLow", { v: num(v) }) };
    }
    if (key === "extra_high" && likely !== undefined) {
      const v = Math.max(likely + 1, Math.ceil(likely * 1.8));
      return { value: v, note: t("note.deriveHigh", { v: num(v) }) };
    }
    const spend = n("avg_spend");
    if (key === "lunch_spend" && spend !== undefined) return { value: spend, note: t("note.deriveLunchSpend", { v: price(spend) }) };
  }
  if (templateId === "price_change") {
    const likely = n("volume_likely");
    if (key === "volume_low" && likely !== undefined) {
      const v = Math.round(Math.max(-1, likely - 0.08) * 1e4) / 1e4;
      return { value: v, note: t("note.deriveVolumeLow", { v: signedPct(v) }) };
    }
    if (key === "volume_high" && likely !== undefined) {
      // A price rise rarely wins sales: cap the optimistic guess at +5% then, but never below the likely guess.
      const a = n("current_price"), b = n("new_price");
      const cut = a !== undefined && b !== undefined && b < a;
      const v = Math.round(Math.max(likely, Math.min(cut ? 1 : 0.05, likely + 0.04)) * 1e4) / 1e4;
      return { value: v, note: t("note.deriveVolumeHigh", { v: signedPct(v) }) };
    }
  }
  return undefined;
}

function crossChecks(templateId: string, g: Map<string, number | string>): string[] {
  const n = (k: string) => (typeof g.get(k) === "number" ? (g.get(k) as number) : undefined);
  const out: string[] = [];
  if (templateId === "lunch_offer") {
    const p = n("offer_price"), c = n("offer_cost"), vat = n("vat_rate");
    if (p !== undefined && c !== undefined) {
      const net = Math.round((p / (1 + (vat ?? 0.106))) * 100) / 100;
      if (c >= net - 1e-9) out.push(t("problem.dealAtCost", { cost: price(c), price: price(p), net: price(net) }));
    }
    const lo = n("extra_low"), li = n("extra_likely"), hi = n("extra_high");
    if (lo !== undefined && li !== undefined && lo > li) out.push(t("problem.lowAboveLikely", { lo: num(lo), li: num(li) }));
    if (hi !== undefined && li !== undefined && hi < li) out.push(t("problem.highBelowLikely", { hi: num(hi), li: num(li) }));
    const lunch = n("lunch_customers"), day = n("weekday_customers");
    if (lunch !== undefined && day !== undefined && lunch > day) out.push(t("problem.lunchAboveDay", { lunch: num(lunch), day: num(day) }));
  }
  if (templateId === "price_change") {
    const a = n("current_price"), b = n("new_price"), c = n("unit_cost"), vat = n("vat_rate");
    if (a !== undefined && b !== undefined && Math.abs(a - b) < 1e-9) out.push(t("problem.samePrice"));
    if (c !== undefined && b !== undefined) {
      const net = Math.round((b / (1 + (vat ?? 0.19))) * 100) / 100;
      if (c >= net - 1e-9) out.push(t("problem.costAboveNew", { cost: price(c), price: price(b), net: price(net) }));
    }
    const lo = n("volume_low"), li = n("volume_likely"), hi = n("volume_high");
    if (lo !== undefined && li !== undefined && lo > li) out.push(t("problem.lowAboveLikely", { lo: signedPct(lo), li: signedPct(li) }));
    if (hi !== undefined && li !== undefined && hi < li) out.push(t("problem.highBelowLikely", { hi: signedPct(hi), li: signedPct(li) }));
  }
  return out;
}

/** A value in its unit, in the current language: "9,90 € pro Tag", "30 %", "10 Tage". */
export function show(f: Pick<FieldSpec, "unit">, v: number | string): string {
  if (typeof v === "string") return v === "other" ? t("kiez.other") : v;
  switch (f.unit) {
    case "EUR":
      return price(v);
    case "EUR/day":
      return t("unit.perDay", { v: price(v) });
    case "EUR/week":
      return t("unit.perWeek", { v: price(v) });
    case "EUR/month":
      return t("unit.perMonth", { v: price(v) });
    case "share": {
      const digits = Number.isInteger(Math.round(v * 1e6) / 1e4) ? 0 : 1;
      return v < 0 ? `−${pct(-v, digits)}` : pct(v, digits);
    }
    case "customers/day":
      return t("unit.perDay", { v: num(v) });
    case "units/week":
      return t("unit.perWeek", { v: num(v) });
    case "days":
      return t("unit.days", { n: v });
    case "hours/day":
      return t("unit.hoursPerDay", { n: v });
    case "hours/week":
      return t("unit.hoursPerWeek", { n: v });
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
