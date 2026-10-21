# What-IF — architecture and build contract

This file is the contract the parallel build works against. Module owners implement exactly these signatures. Shared types live in `src/engine/types.ts` and `src/sim/types.ts` and change only additively (new optional fields).

## What we ship (hackathon)

1. **A public remote MCP server** at `https://<site>/api/mcp` (Streamable HTTP, stateless; closed beta: an invite code via `?code=`, see "Closed beta" below). Anyone can paste the URL into Claude (custom connector), ChatGPT (developer-mode connector), Cursor, VS Code, Claude Code (`claude mcp add --transport http what-if <url>`), or any MCP client.
2. **A skill** (`skill/what-if/`, downloadable as `what-if-skill.zip` from the site) that triggers on "what if…" questions, runs the coaching workflow, links to the MCP, and orchestrates the customer rehearsal (subagents where the host has them).
3. **A website on Vercel** (`site/`): landing page that teaches the method visually, "add to your AI" instructions with the MCP URL, the skill download, a live demo, and the **report viewer** that draws every analysis as an interactive, visual lesson.

No plugin packaging for now (no time to publish one). The skill folder is plugin-ready later.

## Principles that shape the code

1. **The maths is deterministic code, never the model.** `src/engine` computes every number; the model explains, asks and coaches.
2. **Every figure carries a source tag**: `owner`, `assumption` (a guess), `calculation`, `imagined` (rehearsal), `demo`. The report shows the tag beside the number.
3. **Every number can "show the maths"**: a `maths` string with the owner's numbers written into the formula.
4. **The rehearsal is imagined, not evidence.** It produces questions for real customers and descriptive counts ("3 of 6 imagined customers tried it"). It is never scaled up or fed into the scenario maths.
5. **Model output is validated.** Persona reactions go through `submitRound`, which rejects unknown actions, missing fields and over-long text, so the host can retry one persona.
6. **Every model step has a rule-based stand-in** (`ruleBasedReactions`), so the MCP, the site demo and the QA bot work without any model.
7. **The server stores nothing.** Tools are stateless: the rehearsal travels as a compact `state` token (deflate + base64url) that the host passes back each round. Report links put the data in the URL **fragment** (`/r#<token>`), which browsers never send to the server. The report page recomputes the analysis in the browser from the inputs with the same engine.
8. **Visual first.** Every tool result ends with a `report_url`; the coach is told to share it at each step. The report is the lesson: step-by-step pipeline, scenario bars, a break-even slider that re-explains itself, persona cards and a round-by-round timeline.

## Layout

```
src/engine/            templates, inputs, analysis, experiment, compare (pure TS, browser-safe)
src/sim/               personas, rounds, rehearsal state machine, validation, summary (pure TS, browser-safe)
src/report/            renderReport(): HTML string (pure TS, browser-safe) + client behaviour for sliders
src/state.ts           ShareState codec (fflate, browser-safe); treats tokens as untrusted (STATE_LIMITS)
src/i18n/              languages (index.ts: Lang, makeT, plural) and terms.ts: one word per idea per language, used by every surface
src/mcp/tools.ts       tool definitions + handlers (transport-agnostic)
src/mcp/instructions.ts server instructions and the what-if prompt (all model-facing guidance)
src/mcp/messages.ts    the server's own sentences in de/en/es/pl
src/mcp/http.ts        Vercel Node handler: stateless Streamable HTTP at /api/mcp (+ CORS, GET info)
src/mcp/stdio.ts       same tools over stdio for local use
site/                  static pages (index.html, connect.html, r.html …) + site/src/*.ts client entries
skill/what-if/         SKILL.md + references/*.md (zipped to site as what-if-skill.zip; {{SITE_URL}} templated)
scripts/build.mjs      esbuild → .vercel/output (Build Output API v3): static site, bundled client JS, api/mcp function, skill zip
scripts/dev.mjs        local server: static + /api/mcp on http://localhost:3000
test/*.test.ts         node:test via tsx
qa/                    QA bot: rubric, checks, judge files, loop state
docs/                  PRD, PLAN, research notes, QA rubric, this file
```

`SITE_URL` comes from the env at build time (`WHATIF_SITE_URL`, else `VERCEL_PROJECT_PRODUCTION_URL`, else `http://localhost:3000`).

## Module signatures

### `src/engine/index.ts`

```ts
export { checkInputs, show } from "./inputs.ts";
export { TEMPLATES, getTemplate, demoInputs, DEMO_BUSINESS } from "./templates.ts";
export function analyze(template: TemplateId, raw: RawInputs, opts?: { business?: string; question?: string; demo?: boolean; currency?: string; id?: string }): Analysis; // throws if not ready (message lists missing fields/problems)
export function whatChanged(before: Analysis, after: Analysis): ChangeExplanation;
export function planTest(a: Analysis): TestPlan;
export function compareResult(a: Analysis, observed: Record<string, number>): TestResult;
export const OBSERVED_FIELDS: Record<TemplateId, { key: string; label: string; required: boolean }[]>;
```

`analyze` must be deterministic for the same inputs (pass `id` to fix the id; default id is a hash of the inputs).

Observed keys — `lunch_offer`: `baseline_lunch_customers`, `test_lunch_customers` (average per day during the test), `redemptions_per_day`, optional `days_run`, `actual_setup_cost`. `price_change`: `units_before_per_week`, `units_after_per_week`, optional `days_run`.

### `src/sim/index.ts`

```ts
export function startRehearsal(a: Analysis, opts?: { personas?: number /* 4–12, default 6 */; rounds?: number /* 3–5, default 4 */; seed?: number; event?: string; customerMix?: Partial<Record<SegmentId, number>> }): Rehearsal; // deterministic for (analysis inputs, opts)
export function roundBriefs(r: Rehearsal): PersonaBrief[];            // briefs for r.currentRound (active personas only)
export function submitRound(r: Rehearsal, reactions: unknown[], method?: ReactionMethod): SubmitOutcome; // validates; advances when every active persona has a valid reaction
export function injectEvent(r: Rehearsal, text: string): Rehearsal;   // owner-injected change before the next round
export function ruleBasedReactions(r: Rehearsal): Reaction[];         // deterministic stand-in for the current round
export function summarize(r: Rehearsal): RehearsalSummary;
export function interviewBriefs(r: Rehearsal, question: string, personaIds?: string[]): PersonaBrief[];
export function recordInterview(r: Rehearsal, question: string, answers: unknown[], method?: ReactionMethod): { rehearsal: Rehearsal; errors: { personaId: string; error: string }[] };
```

### `src/state.ts` (written first; browser-safe)

```ts
export interface ShareState { v: 1; template: TemplateId; inputs: RawInputs; business?: string; question?: string; demo?: boolean; currency?: string;
  rehearsal?: { seed: number; personas: number; rounds: number; events: { beforeRound: number; text: string }[]; reactions: Reaction[]; interviews: Rehearsal["interviews"] };
  observed?: Record<string, number>; }
export function encodeState(s: ShareState): string;   // deflate-raw + base64url
export function decodeState(token: string): ShareState; // throws a plain error on a bad token
export function reportUrl(siteUrl: string, s: ShareState): string; // `${siteUrl}/r#${encodeState(s)}`
// v0.2 adds: lang?, madeBy? ("coach" | "try" | "demo"), rehearsal.customerMix?, reactions[].heardFrom?.
// decodeState treats tokens as untrusted: STATE_LIMITS caps the token (60,000 chars), the unpacked JSON
// (200 KB) and every field (inputs, business 200, question 500, reactions, events, interviews).
```

A rehearsal is rebuilt from a `ShareState` by `startRehearsal(analysis, { seed, personas, rounds })`, then replaying `events` and `reactions` in order (`src/sim/index.ts` exports `rebuildRehearsal(a: Analysis, s: NonNullable<ShareState["rehearsal"]>): Rehearsal` for this).

### `src/report/index.ts` (browser-safe)

```ts
export function renderReport(input: { analysis: Analysis; plan?: TestPlan; rehearsal?: RehearsalSummary; result?: TestResult; status?: "running" | "final" }): string; // HTML fragment for <main>, no <html> wrapper
export function reportStyles(): string;   // CSS (tokens, light/dark) used by the site
export function mountReport(root: HTMLElement, input: Parameters<typeof renderReport>[0]): void; // renders + wires the break-even slider, tabs, "show the maths" toggles
```

## MCP tools (server name `what-if`)

All tools are stateless. Every result has a short plain-language text block first (for the model to relay), then JSON in `structuredContent`, and a `report_url` the coach should share.

Every tool takes an optional `lang` (`de` default; "German", "Deutsch", "pl-PL" … are understood). Tools after the first accept **either** `template` + `inputs` **or** the `state` token a previous result returned. Unknown input keys come back in `ignored_inputs` with a "did you mean". `report_url` never contains the invite code.

| Tool | Input | Returns |
|---|---|---|
| `whatif_start` | `question`, `business?`, `template?`, `lang?` | `kind`: `decision` (template, fields with `ask`/`why`, demo values, demo `report_url`, Kieze, Berlin events), `unsupported` (hiring, opening hours … → honest "not yet"), `not_a_decision` (weather, a competitor alone, rent …), `results` (back with test results → `whatif_log_result`) or `unclear`; `template: null` for every non-decision. **Its description tells the model to call it first whenever the user writes "what if…" about a business decision.** |
| `whatif_check_inputs` | `state` or `template` + `inputs`, `demo?`, `business?`, `question?`, `currency?`, `lang?` | `InputCheck` + `next_question` (the single most important missing item); `state` once ready |
| `whatif_run_scenarios` | `state` or `template` + `inputs` (or `demo: true`), `business?`, `question?`, `currency?`, `lang?` | scenarios, both break-evens, worst case, biggest uncertainty, lessons, `state`, `report_url` |
| `whatif_what_changed` | `state` or `template` + `before`, and `after` (only the changed fields are enough) | `ChangeExplanation` + new `state` and `report_url` |
| `whatif_rehearsal_start` | `state` or `template` + `inputs`, `personas?`, `rounds?`, `seed?`, `event?` (text or a Berlin event id), `customer_mix?`, `business?`, `question?`, `demo?`, `currency?` | personas, round-1 briefs (one ready prompt per imagined customer), `state`, `report_url`, host run instructions (parallel subagents where available) |
| `whatif_rehearsal_submit` | `state`, `reactions[]`, `method?` | accepted, errors and `retry_briefs` (only the failed personas), next briefs or done with the summary, new `state`, `report_url` |
| `whatif_rehearsal_event` | `state`, `event` (text or id) | new `state` and refreshed briefs that include the event |
| `whatif_rehearsal_autoplay` | `state` | plays the remaining rounds with the rule-based stand-in (no model), summary, `state`, `report_url` |
| `whatif_rehearsal_interview` | `state`, `question`, `persona_ids?`, `answers?` | without answers: briefs; with `{personaId, answer}` answers: the recorded interview, new `state` |
| `whatif_plan_test` | `state` or `template` + `inputs` | `TestPlan` (one keep / tweak / stop rule shared with the verdict) + `report_url` |
| `whatif_log_result` | `state` or `template` + `inputs`, `observed` | `TestResult` + `report_url` |

The server also exposes MCP `instructions` (how to coach, the "what if" trigger, share the report link at every step) and a prompt `what-if` for clients that list prompts.

## Host behaviour (who plays the imagined customers)

| Host | Rehearsal runs as |
|---|---|
| Claude Code, Cowork | one subagent per active persona per round, launched in parallel; each gets only its brief |
| Any chat app with the MCP connected (Claude.ai, ChatGPT, Cursor…) | the model plays each persona in turn from its brief only and submits with `method: "in-context"` |
| Skill without the MCP connected | the skill tells the user how to connect it (URL + per-app steps); meanwhile it can follow `references/maths.md` by hand |
| No model (site demo, QA) | `whatif_rehearsal_autoplay` / `ruleBasedReactions` |

## Berlin closed beta (v0.2) — contract additions

What-IF now targets **independent cafés in Berlin**, as a **closed beta with invite codes**, in **four languages: German (default), English, Spanish, Polish**.

### Languages (`src/i18n/index.ts`, written)

- `Lang = "de" | "en" | "es" | "pl"`; `setLang`, `getLang`, `normaliseLang`, `makeT(catalog)`, `plural(n, forms)` (Polish needs one/few/many), `LOCALE`.
- Every module keeps its owner-facing strings in its own catalog file (e.g. `src/engine/messages.ts`, `src/sim/messages.ts`, `src/report/messages.ts`, `site/src/messages.ts`) with `en` complete and `de`, `es`, `pl` translated. **No owner-facing English string literals outside catalogs.** Plain, warm, café-owner language in every language (German: "Sie", short sentences; avoid finance jargon or explain it once).
- `src/engine/format.ts` formats money and percentages by the current language via `Intl` ("9,90 €" in de/es/pl, "€9.90" in en).
- `analyze(..., { lang })` sets the language for the whole analysis; `Analysis.lang` records it. `startRehearsal` / `summarize` / `renderReport` use the analysis language. Persona briefs tell the imagined customer to write `thought`, `saysPublicly`, `questionForOwner`, `diary` in that language (the brief instructions themselves may stay in English).
- `ShareState.lang` carries the language in report links; the report page also has a language switcher (DE · EN · ES · PL) that re-renders the same link in another language (numbers are recomputed, guesses unchanged; imagined customers' own words stay as they were written).
- MCP tools take an optional `lang` (default `"de"`); the coach passes the language the owner writes in.

### Berlin specifics (engine + sim)

- **VAT (Mehrwertsteuer)**: prices the owner enters are what customers pay (gross). Since **1 Jan 2026** food in restaurants and cafés is taxed at **7%** (eat-in and take-away); **drinks stay at 19%**, every drink served in the café included (only take-away milk drinks with ≥ 75% milk are 7%, an older rule in Anlage 2 UStG, unchanged in 2026). Source: Steueränderungsgesetz 2025 / §12 (2) Nr. 15 UStG; BMF letter of 22 Dec 2025 accepts a flat 30% drinks share for combined offers like buffets. The engine works on net prices: `net = gross / (1 + vat)`.
  - Lunch offer: new optional field `vat_rate` ("VAT in your lunch prices, blended"), fallback **10.6%** (70% food at 7% + 30% drinks at 19%), tagged as a guess with that explanation and "ask your Steuerberater for your real split". Used for both the deal and today's lunch spend. `variable_cost_share` stays a share of the price customers pay.
  - Price change: new optional field `vat_rate`, fallback **19%** (coffee drinks), with the 7% food / milk-drink note.
- **Staff cost**: `extra_staff_cost_per_day` is replaced by `extra_staff_hours_per_day` (choice, default 0) × `staff_hourly_cost` (fact, fallback **€13.90** = statutory minimum wage since 1 Jan 2026, €14.60 from 1 Jan 2027, tagged as a guess with the note "your real cost per hour is higher once employer contributions are added; check your payroll"). Demo: 1 hour at €18.00.
- **Kiez**: new optional field `kiez` (text choice from `BERLIN_KIEZE`: Neukölln, Kreuzberg, Friedrichshain, Prenzlauer Berg, Mitte, Wedding, Moabit, Schöneberg, Charlottenburg, Friedenau, Pankow, Lichtenberg, Treptow, Tempelhof, Steglitz, Köpenick, Spandau, Weißensee; plus "other"). Demo: Neukölln. The rehearsal uses it for the persona mix (a labelled rough guess, never statistics), names, alternatives (Bäckerei, Späti, Döner, Kantine, Mensa…), channels (Instagram, Google Maps, nebenan.de, the Kiez WhatsApp group, the board outside) and scene details.
- **Berlin events** for the rehearsal (owner-injected "what if"s, never presented as facts): `BERLIN_EVENTS` with ids and translated texts — BVG strike day, a week of rain, a heatwave (32 °C), a Baustelle outside (pavement half closed), Berlin school holidays, a new café opens two doors down with an €8.50 lunch, a big Kiez street festival weekend, the Christmas market opens nearby. `whatif_start` and the site list them.
- **Public facts card**: `Analysis.facts: PublicFact[]` lists every public fact the numbers used (VAT rates, minimum wage) with source, URL and date. The report shows them in a "Berlin facts used" card. Sources: BMF / Bundesrat (Steueränderungsgesetz 2025, VAT 7% food from 1 Jan 2026), Mindestlohnkommission / Bundesregierung (Fünfte Mindestlohnanpassungsverordnung, €13.90 from 1 Jan 2026). Never add a fact without a source and date.

### Closed beta: invite codes

- `WHATIF_BETA_CODES` (Vercel env, comma-separated, each ≥ 6 chars). **Unset = open** (local dev, tests).
- MCP: when set, every POST to `/api/mcp` needs a valid code via `?code=XXXX` in the URL (what owners paste into their AI app), or header `x-whatif-code`, or `Authorization: Bearer XXXX`. Without a valid code, `initialize`, `tools/list` and `prompts/list` still answer (the instructions end with a CLOSED BETA note), and every `tools/call` answers HTTP 200 with `isError: true` and the message, German first then English: What-IF is a closed beta for Berlin cafés, the connector link must end in `?code=…`, and how to ask for a code (`WHATIF_BETA_CONTACT`; "ask the person who invited you" if unset); `structuredContent.beta` = `{ required, valid: false, reason, connector_url, how_to_connect, contact? }`. OAuth discovery paths (`/.well-known/oauth-*`, `/register`, `/authorize`, `/token`) answer 404 JSON with the same message. **Never 401 and never `WWW-Authenticate`**: real MCP clients treat a 401 as a sign-in prompt and the owner would never see the message. Constant-time comparison; codes never logged or echoed.
- `GET /api/mcp?code=XXXX` (browser / site) returns the info JSON plus `beta: { required, valid }`, so the site can check a code without storing anything.
- Site: a "Closed beta · Berlin" badge; the connect page and the new **"Try with your numbers"** page (`/try`) ask for the invite code (remembered in localStorage), check it via the GET above, and build the personal connector URL `https://<site>/api/mcp?code=XXXX`. The report viewer `/r#…` stays open (links are shared and carry their own data).
- `WHATIF_BETA_CONTACT` is templated into the site and skill like `{{SITE_URL}}` (as `{{BETA_CONTACT}}`; hide the request button when empty).

### "Try with your numbers" (`/try`, site)

Selin (persona judge) could not use her own numbers without an AI app. `/try` is a one-question-per-screen wizard in the four languages: invite code (when the beta is on) → what to try (weekday lunch deal, price change, or "I already ran my test" to log a result) → Kiez → the required facts (including what a lunch guest spends today) → "What does the test cost you?" (setup, staff hours at an hourly cost defaulting to the dated minimum wage, promotion, spare cash) → the likely guess → a review screen listing every number asked and every value What-IF assumed, each editable → builds a `ShareState` (lang, inputs, demo:false, madeBy "try") → `/r#token`. The report offers a rule-based rehearsal (no AI) and a "log your result" step that writes `observed` into the same link. No server storage.

### Demos and saved casts (v0.3)

- Four demo links need no code: `/r#demo` (lunch deal, rule-based rehearsal), `/r#demo-price` (flat white +20 cents against the 2027 minimum wage, via the optional price-change input `minimum_wage_hours_per_week`), `/r#demo-result` (after the test, with made-up counts) and `/r#demo-ai` (a rehearsal played by Claude subagents, saved in `src/report/demo-ai.json`).
- `ShareState.rehearsal.cast` and `.active` hold the exact imagined customers whenever an AI played them (method `subagent` or `in-context`); `rebuildRehearsal` uses them verbatim, so saved AI links survive changes to persona generation.
