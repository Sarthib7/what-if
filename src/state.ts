import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { RawInputs, TemplateId } from "./engine/types.ts";
import type { Lang } from "./i18n/index.ts";
import type { Persona, Reaction, Rehearsal, SegmentId } from "./sim/types.ts";

/**
 * Everything needed to redraw an analysis (and its rehearsal) in the browser.
 *
 * The server stores nothing: tools hand this back to the host as a compact
 * token, and report links carry it in the URL fragment (`/r#<token>`), which
 * browsers never send to the server.
 */
export interface ShareState {
  v: 1;
  template: TemplateId;
  inputs: RawInputs;
  business?: string;
  question?: string;
  demo?: boolean;
  currency?: string;
  /** Language for the report and every generated sentence (default "de" for the Berlin beta). */
  lang?: Lang;
  /** Who made the report: the AI coach (MCP), the /try form, or the site demo. Drives the "Who did what" card. */
  madeBy?: "coach" | "try" | "demo";
  rehearsal?: {
    seed: number;
    personas: number;
    rounds: number;
    events: { beforeRound: number; text: string }[];
    reactions: Reaction[];
    interviews: Rehearsal["interviews"];
    /** Set only when the rehearsal was started with a custom customer mix, so a rebuild picks the same people. */
    customerMix?: Partial<Record<SegmentId, number>>;
    /** The exact imagined customers, saved whenever an AI played them, so the link survives changes to persona generation. */
    cast?: Persona[];
    /** Who was around in each round, saved with the cast. */
    active?: Record<number, string[]>;
  };
  observed?: Record<string, number>;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += B64[c & 63]!;
  }
  return out;
}

function fromBase64Url(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const bytes: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error(BAD_LINK);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 255);
    }
  }
  return Uint8Array.from(bytes);
}

export function encodeState(s: ShareState): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify(s)), { level: 9 }));
}

/**
 * Tokens arrive from anyone (a public endpoint, a pasted link), so they are untrusted:
 * the token, the unpacked JSON and every text field are capped before anything uses them.
 */
export const STATE_LIMITS = {
  tokenChars: 60_000,
  jsonBytes: 200_000,
  inputs: 40,
  inputChars: 80,
  business: 200,
  question: 500,
  reactions: 12 * 5,
  events: 5,
  eventChars: 300,
  reactionChars: 800,
  interviews: 10,
  answers: 12,
} as const;

const BAD_LINK = "This What-IF link is damaged or cut off. Start again from the owner's numbers to make a fresh one.";

function inflateCapped(bytes: Uint8Array): Uint8Array {
  // A fixed output buffer: inflating anything bigger fails instead of growing without limit.
  const out = new Uint8Array(STATE_LIMITS.jsonBytes);
  const result = inflateSync(bytes, { out });
  if (result.length >= STATE_LIMITS.jsonBytes) throw new Error(BAD_LINK);
  return result;
}

const clip = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);

/** A saved persona from a link: every text capped, numbers finite, unknown fields kept only if small. */
function sanitisePersona(p: Persona): Persona {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p).slice(0, 30)) {
    if (k.length > 40) continue;
    if (typeof v === "string") out[k] = v.slice(0, k === "story" ? 1500 : 300);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 12).filter((x) => typeof x === "string").map((x: string) => x.slice(0, 120));
  }
  return out as unknown as Persona;
}

function sanitise(s: Partial<ShareState>): ShareState {
  const inputs: RawInputs = {};
  for (const [k, v] of Object.entries(s.inputs ?? {}).slice(0, STATE_LIMITS.inputs)) {
    if (k.length > 60) continue;
    if (typeof v === "number" && Number.isFinite(v)) inputs[k] = v;
    else if (typeof v === "string") inputs[k] = v.slice(0, STATE_LIMITS.inputChars);
  }
  const out: ShareState = { v: 1, template: s.template as TemplateId, inputs };
  const business = clip(s.business, STATE_LIMITS.business);
  const question = clip(s.question, STATE_LIMITS.question);
  if (business !== undefined) out.business = business;
  if (question !== undefined) out.question = question;
  if (typeof s.demo === "boolean") out.demo = s.demo;
  const currency = clip(s.currency, 3);
  if (currency !== undefined) out.currency = currency;
  if (typeof s.lang === "string") out.lang = s.lang;
  if (s.madeBy === "coach" || s.madeBy === "try" || s.madeBy === "demo") out.madeBy = s.madeBy;
  if (s.observed && typeof s.observed === "object") {
    out.observed = Object.fromEntries(
      Object.entries(s.observed).filter(([k, v]) => k.length <= 60 && typeof v === "number" && Number.isFinite(v)).slice(0, 10),
    );
  }
  const r = s.rehearsal;
  if (r && typeof r === "object") {
    const text = (v: unknown, max: number) => clip(v, max) ?? "";
    out.rehearsal = {
      seed: Number.isFinite(r.seed) ? Math.trunc(r.seed) : 1,
      personas: Number.isFinite(r.personas) ? Math.min(12, Math.max(4, Math.trunc(r.personas))) : 6,
      rounds: Number.isFinite(r.rounds) ? Math.min(5, Math.max(3, Math.trunc(r.rounds))) : 4,
      events: (Array.isArray(r.events) ? r.events : []).slice(0, STATE_LIMITS.events).map((e) => ({
        beforeRound: Number.isFinite(e?.beforeRound) ? Math.trunc(e.beforeRound) : 1,
        text: text(e?.text, STATE_LIMITS.eventChars),
      })),
      reactions: (Array.isArray(r.reactions) ? r.reactions : []).slice(0, STATE_LIMITS.reactions).map((x) => {
        const c: Reaction = {
          personaId: text(x?.personaId, 8),
          round: Number.isFinite(x?.round) ? Math.trunc(x.round) : 0,
          action: text(x?.action, 40),
          thought: text(x?.thought, STATE_LIMITS.reactionChars),
          method: x?.method === "subagent" || x?.method === "in-context" ? x.method : "rule-based",
        };
        const says = clip(x?.saysPublicly, STATE_LIMITS.reactionChars);
        const q = clip(x?.questionForOwner, STATE_LIMITS.reactionChars);
        const d = clip(x?.diary, STATE_LIMITS.reactionChars);
        if (says) c.saysPublicly = says;
        if (q) c.questionForOwner = q;
        if (d) c.diary = d;
        const heard = clip(x?.heardFrom, 60);
        if (heard) c.heardFrom = heard;
        return c;
      }),
      interviews: (Array.isArray(r.interviews) ? r.interviews : []).slice(0, STATE_LIMITS.interviews).map((iv) => ({
        question: text(iv?.question, STATE_LIMITS.eventChars),
        answers: (Array.isArray(iv?.answers) ? iv.answers : []).slice(0, STATE_LIMITS.answers).map((a) => ({
          personaId: text(a?.personaId, 8),
          name: text(a?.name, 60),
          answer: text(a?.answer, STATE_LIMITS.reactionChars),
          method: a?.method === "subagent" || a?.method === "in-context" ? a.method : "rule-based",
        })),
      })),
    };
    if (Array.isArray(r.cast)) {
      const cast = r.cast.slice(0, 12).filter((p): p is Persona => !!p && typeof p === "object" && typeof p.id === "string").map(sanitisePersona);
      if (cast.length) out.rehearsal.cast = cast;
    }
    if (r.active && typeof r.active === "object") {
      const active: Record<number, string[]> = {};
      for (const [k, v] of Object.entries(r.active).slice(0, 5)) {
        const n = Math.trunc(Number(k));
        if (Number.isFinite(n) && Array.isArray(v)) active[n] = v.slice(0, 12).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 8));
      }
      out.rehearsal.active = active;
    }
    if (r.customerMix && typeof r.customerMix === "object") {
      const mix: Partial<Record<SegmentId, number>> = {};
      for (const [k, v] of Object.entries(r.customerMix).slice(0, 8)) if (typeof v === "number" && Number.isFinite(v)) mix[k as SegmentId] = v;
      out.rehearsal.customerMix = mix;
    }
  }
  return out;
}

export function decodeState(token: string): ShareState {
  const clean = token.trim().replace(/^#/, "");
  if (clean.length > STATE_LIMITS.tokenChars) throw new Error(BAD_LINK);
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(inflateCapped(fromBase64Url(clean))));
  } catch {
    throw new Error(BAD_LINK);
  }
  const s = parsed as Partial<ShareState>;
  if (!s || s.v !== 1 || (s.template !== "lunch_offer" && s.template !== "price_change") || typeof s.inputs !== "object" || s.inputs === null)
    throw new Error("This What-IF link is not in a format this version understands.");
  return sanitise(s);
}

export function reportUrl(siteUrl: string, s: ShareState): string {
  return `${siteUrl.replace(/\/+$/, "")}/r#${encodeState(s)}`;
}
