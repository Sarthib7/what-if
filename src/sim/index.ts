/**
 * The customer rehearsal (MiroFish-inspired, café-sized). Browser-safe: no Node APIs.
 * See docs/ARCHITECTURE.md, "src/sim/index.ts", for the contract.
 */
export {
  startRehearsal,
  roundBriefs,
  submitRound,
  injectEvent,
  ruleBasedReactions,
  summarize,
  interviewBriefs,
  recordInterview,
  rebuildRehearsal,
  toShareRehearsal,
  autoplayRehearsal,
  LIMITS,
  CAVEAT,
} from "./rehearsal.ts";
export type { StartOptions, ShareRehearsal } from "./rehearsal.ts";
export { SEGMENTS, SEGMENT_LABEL, generatePersonas } from "./personas.ts";
export { ACTIONS, buildRounds, changeContext } from "./rounds.ts";
export { mulberry32, hashString } from "./prng.ts";
export type * from "./types.ts";
