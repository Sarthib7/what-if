import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { RawInputs, TemplateId } from "./engine/types.ts";
import type { Reaction, Rehearsal, SegmentId } from "./sim/types.ts";

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
  rehearsal?: {
    seed: number;
    personas: number;
    rounds: number;
    events: { beforeRound: number; text: string }[];
    reactions: Reaction[];
    interviews: Rehearsal["interviews"];
    /** Set only when the rehearsal was started with a custom customer mix, so a rebuild picks the same people. */
    customerMix?: Partial<Record<SegmentId, number>>;
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
    if (v < 0) throw new Error("This What-IF link is damaged (unexpected character). Ask the coach for a fresh link.");
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

export function decodeState(token: string): ShareState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(inflateSync(fromBase64Url(token.trim().replace(/^#/, "")))));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("This What-IF link")) throw e;
    throw new Error("This What-IF state could not be read. It may be cut off; ask the coach for a fresh link.");
  }
  const s = parsed as Partial<ShareState>;
  if (!s || s.v !== 1 || typeof s.template !== "string" || typeof s.inputs !== "object" || s.inputs === null)
    throw new Error("This What-IF state is not in a format this version understands.");
  return s as ShareState;
}

export function reportUrl(siteUrl: string, s: ShareState): string {
  return `${siteUrl.replace(/\/+$/, "")}/r#${encodeState(s)}`;
}
