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
  caveatFor,
  storyBeats,
  rehearsalTeaser,
  LIMITS,
  CAVEAT,
} from "./rehearsal.ts";
export type { StartOptions, ShareRehearsal, StoryBeat, RehearsalTeaser } from "./rehearsal.ts";
export { SEGMENTS, SEGMENT_LABEL, segmentLabel, channelPhrase, generatePersonas } from "./personas.ts";
export { ACTIONS, actionKind, actionLabel, buildRounds, changeContext, cafeName } from "./rounds.ts";
export {
  BERLIN_EVENTS,
  BERLIN_NAMES,
  KIEZ_MIX,
  SIM_KIEZE,
  DEMO_SEEDS,
  DEMO_EVENT_ID,
  DEMO_EVENT_ROUND,
  EVENT_EFFECTS,
  EVENT_ROUNDS,
  KIEZ_FLAVOUR,
  kiezFlavour,
  findBerlinEvent,
  berlinEventText,
  kiezWeights,
  normaliseKiez,
} from "./berlin.ts";
export type { BerlinEvent, BerlinEventId, EventEffect, KiezFlavour, SimKiez } from "./berlin.ts";
export { CAVEATS, REPRESENTS_PREFIX, BRIEF_LANGUAGE } from "./messages.ts";
export { mulberry32, hashString } from "./prng.ts";
export type * from "./types.ts";
