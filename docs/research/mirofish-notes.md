# MiroFish — how it simulates, and what What-IF borrows

Read-only study of [MiroFish](https://github.com/666ghj/MiroFish) at commit 7657031 (2 Oct 2026) and the [OASIS](https://github.com/camel-ai/oasis) engine it runs on. MiroFish is **AGPL-3.0**: What-IF borrows ideas, not code or prompts.

## Pipeline (MiroFish)

1. **Ingestion** — uploaded documents plus a natural-language "simulation requirement", chunked.
2. **Ontology** — one LLM call designs 10 entity types (8 specific + Person/Organization) and 6–10 edge types.
3. **Knowledge graph** — Zep Cloud extracts entities and time-stamped facts (GraphRAG).
4. **One agent per entity** that "can speak on social media".
5. **Personas** — one LLM call per entity: demographics, MBTI, social-media habits, stance, quirks, and a *personal memory* of the event.
6. **Simulation config** — time config (default 72 rounds of one simulated hour), round-0 posts, per-agent activity (activity level, active hours).
7. **Run** — OASIS runs a Twitter-like and a Reddit-like world in parallel. Each round, agents active this hour (schedule × random draw below `activity_level`) see a recommended feed and pick **one** action: post, like, repost, quote, follow, comment, or do nothing.
8. **ReportAgent** — a ReACT agent outlines a report, then writes each section with 3–5 tool calls over the graph; agents' words must be quoted; no invented numbers.
9. **Deep interaction** — after the run, chat with the ReportAgent, interview one agent, or survey several.

Memory: each agent keeps its full chat history (individual memory); actions are written back into the Zep graph (collective memory), read only by the graph view and the ReportAgent.

## What the code shows that the marketing does not

- Mid-run "variable injection" is not implemented (`scheduled_events` is always empty).
- Several generated knobs (stance, sentiment bias, influence weight) are shown in the UI but used nowhere.
- No validation or back-testing; results are called "a rehearsal of the future".
- Cost: roughly rounds × 2 worlds × active agents LLM calls, ~3.4k input tokens per agent action.

## The visual pattern worth copying

A 5-step progress header; persona cards with stance badges; a live, round-by-round timeline of action cards (avatar initial, name, action badge, `R{round}`); a report that fills in section by section beside its working trace; a force-directed graph. MiroFish has no charts at all.

## What What-IF borrows (and how it differs)

| MiroFish mechanism | What-IF version |
|---|---|
| Persona = structured profile + long narrative with "personal memory" | Persona card (routine, usual spend, price sensitivity, attitude, activity level) + an 80–150-word story ending in their memory of *this café* |
| Activation = active hours × `random() < activity_level` | Seeded draw per round, so reruns match; absent personas are recorded as "not around" with no model call |
| One action per round from a small menu, "do nothing" allowed | 4–6 café-specific actions per round, always including a do-nothing option; JSON validated by the server |
| Recommended feed each round | A "neighbourhood feed": the owner's announcement, word of mouth, reviews and events from earlier rounds |
| Variable injection (claimed, not built) | **Actually built**: the owner injects an event ("rain all week", "the café opposite starts a €8.50 lunch") before any round |
| Full chat history as memory; Zep for collective memory | A one-sentence diary per persona per round + the feed as collective memory; no external services |
| ReportAgent over a knowledge graph | The coach writes the debrief from the summary only, quoting personas, with a fixed "what this is not" caveat |
| Interview / survey after the run | `whatif_rehearsal_interview`: ask every imagined customer one question |
| 100s of agents, 72 rounds, two platforms, Zep, GraphRAG | 6 personas (4–12), 4 rounds (3–5), one café, no services: about 15–25 short subagent calls |
| "Rehearsal of the future" | "Imagined customers, not data": used to find questions to ask real customers; never scaled up, never fed into the maths |

## Educational additions MiroFish lacks

- Every rehearsal output is tagged **Imagined** next to the **Calculated** scenario numbers, so the owner learns the difference.
- Charts: engaged-per-round uptake curve, action counts per round, a small who-told-whom network.
- A "what a simulation can and cannot tell you" box, and a list of questions to check with real customers.
