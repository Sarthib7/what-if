/**
 * Small seeded random numbers, so every rehearsal can be replayed exactly:
 * the same seed gives the same imagined customers, the same "who is around"
 * draws and the same rule-based reactions, in the browser and on the server.
 */

export type Rng = () => number;

/** mulberry32: a tiny, fast 32-bit PRNG. Returns numbers in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Any number to an unsigned 32-bit seed (NaN and infinities become 0). */
export function normaliseSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.floor(Math.abs(seed)) >>> 0;
}

/** A sub-seed for one purpose ("personas", "active", a round and persona…), so streams do not affect each other. */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  return hashString(`${seed >>> 0}|${parts.join("|")}`);
}

/** A PRNG for one purpose under a rehearsal seed. */
export function rngFor(seed: number, ...parts: (string | number)[]): Rng {
  return mulberry32(deriveSeed(seed, ...parts));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() needs at least one item");
  return items[Math.floor(rng() * items.length)] as T;
}

/** Picks one item with probability proportional to its weight. Falls back to the first item if every weight is 0. */
export function weightedPick<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  if (entries.length === 0) throw new Error("weightedPick() needs at least one item");
  const total = entries.reduce((s, [, w]) => s + (w > 0 && Number.isFinite(w) ? w : 0), 0);
  if (total <= 0) return entries[0]![0];
  let x = rng() * total;
  for (const [item, w] of entries) {
    const ww = w > 0 && Number.isFinite(w) ? w : 0;
    if (x < ww) return item;
    x -= ww;
  }
  // Floating-point edge: return the last item with a positive weight.
  for (let i = entries.length - 1; i >= 0; i--) if ((entries[i]![1] ?? 0) > 0) return entries[i]![0];
  return entries[0]![0];
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Integer in [min, max], both inclusive. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
