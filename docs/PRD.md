# What-IF — Product Requirements (hackathon MVP)

**Status:** building · **Date:** 17 Oct 2026 · **Source of truth for the idea:** [`vision.md`](../vision.md) · **How it is built:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · **Order of work:** [`PLAN.md`](PLAN.md)

## 1. One line

Say "**what if…**" to any AI chat, and What-IF turns your own café numbers into a few possible outcomes, the one number to remember, a rehearsal with imagined customers, and a small test, all drawn as a visual lesson you can follow and learn from.

## 2. Hackathon fit: AI education for everyone

- **Audience:** independent café owners, one of the audiences the challenge names (small-business owners). There is no analyst, no finance team, and often no AI experience.
- **What they learn about the decision:** what drives the result, what the break-even is, how much being wrong could cost, and which guess matters most.
- **What they learn about AI:** what came from them, what is maths, what is a guess and what is imagined. AI explains and simulates; it does not know the future, and its numbers should always show their working. Every screen labels these four sources.
- **How they learn:** visually and by doing. They move a slider and read *why this changed*. They watch imagined customers react round by round and see the caveat. They leave with a test they can run on Monday.

## 3. Users and jobs

| User | Job to be done | Success looks like |
|---|---|---|
| **Café owner** (primary; demo: *Café Lindenblatt*, Neukölln) | "Before I spend money on a lunch deal, show me what could happen and what to try first." | Can explain the break-even in their own words; picks a test; knows what to count |
| **Owner's helper** (family, staff, a friend who "does the computer") | Connects What-IF to the AI they already use | Connected in under 2 minutes from the website |
| **Hackathon judge** | Sees the idea, the education angle and a working thing in 60 seconds | Demo report link + one "what if" in a chat app |

## 4. What we ship

| # | Deliverable | Must | Notes |
|---|---|---|---|
| D1 | **Public remote MCP server** at `/api/mcp` (Streamable HTTP, stateless, no auth) | ✅ | Works in Claude (custom connector), Claude Code, ChatGPT developer mode, Cursor, VS Code, any MCP client |
| D2 | **Skill** `what-if` (download `what-if-skill.zip`) | ✅ | Triggers on "what if…"; links to the MCP; runs the coaching workflow; fans the rehearsal out to subagents where available |
| D3 | **Website on Vercel** | ✅ | Landing page teaching the method visually, "Add to your AI", skill download, demo, report viewer `/r#…` |
| D4 | Visual report (in the website) | ✅ | The lesson itself; see §7 |
| D5 | QA bot + rubric | ✅ | Scores every part 1–10; pass ≥ 8.5; max 5 failed loops |
| D6 | Claude plugin packaging / marketplace | ❌ later | No time to publish; the skill folder is plugin-ready |
| D7 | Live POS/bank/social integrations | ❌ later | The vision explicitly says not to imply these |

## 5. The flow (mirrors vision.md "core experience")

1. **Ask.** The owner writes "What if I run a weekday lunch offer?". The trigger is the words *what if*: the skill's description and the `whatif_start` tool description both say to start there.
2. **Understand the business.** One focused question at a time, each with *why it matters*. Rough numbers are fine, and demo values are offered. Anything What-IF fills in is labelled as a guess.
3. **Compare possibilities.** Cautious, expected and optimistic results. The **break-even** ("you need 9 extra lunch customers a day") comes first. Then the **worst case** ("the most this test can cost you is €560") and the **biggest uncertainty** (which guess swings the result most). A report link is shared at every step.
4. **Move one assumption.** The owner changes a guess (deal price, extra customers) and gets *why this changed*, explained as a mechanism, not just new numbers.
5. **Rehearse with imagined customers** (optional, MiroFish-inspired). Six imagined locals (an office worker, a student, a regular, a sceptic…) react over four rounds: launch day, first week, second week, after the test. They see a neighbourhood feed of word of mouth and reviews. The owner can inject an event ("it rains all week", "the café opposite starts an €8.50 lunch") and interview them afterwards. In Claude Code and Cowork, each imagined customer is a **parallel subagent**; elsewhere the model plays them one by one; with no model, a rule-based stand-in plays them. The output is **questions to check with real customers**, never a forecast.
6. **Choose a next step.** A small, reversible test: baseline week, 10 weekdays, what to count, check-ins on days 3 and 5 and at the end, and a **keep / tweak / stop** rule tied to the break-even. It also has a cost cap.
7. **Learn from the result.** The owner reports the counts. What-IF compares them with the scenarios, gives a verdict and says what was learned ("your guess was 8, reality 5; next time start from 5").

## 6. Functional requirements

| ID | Requirement |
|---|---|
| F1 | Two decision templates: **weekday lunch offer** (the demo) and **price change on one item** (proves it is not hard-coded). Each field has a plain label, a focused question, *why it matters*, and a fallback for when the owner does not know. |
| F2 | All money maths in deterministic code with tests. Every figure has a source tag and a "show the maths" string with the owner's numbers in it. |
| F3 | Break-even, worst case (and its share of the cash the owner can spare), biggest uncertainty (a tornado over the guesses), a sensitivity series for a slider, lessons, next questions and warnings. |
| F4 | *What changed*: compare two input sets and explain the mechanism in one or two sentences. |
| F5 | Rehearsal: 4–12 personas (default 6), 3–5 rounds (default 4). Seeded activation, so reruns match. Two-layer personas (a card plus a short story ending in their memory of this café). A per-persona diary, a neighbourhood feed, owner-injected events and a post-run interview. Server-side validation of every reaction; the rule-based stand-in; and a summary with a funnel, uptake, who told whom, quotes, questions and a caveat. |
| F6 | Test plan with a keep/tweak/stop rule; logging the result with a verdict and what was learned. |
| F7 | MCP: 11 stateless tools (see ARCHITECTURE.md), server `instructions`, a `what-if` prompt, CORS for browser clients, and a friendly info response for a browser GET. Every result: plain text first, then structured JSON, then `report_url`. |
| F8 | Report links hold the data in the URL fragment; the page recomputes everything in the browser. The server stores nothing. |
| F9 | Skill: valid frontmatter for claude.ai upload, under 500 lines, references for coaching, rehearsal, maths, connecting and visuals. `{{SITE_URL}}` is templated at build. |
| F10 | Website: landing, connect, report viewer, skill zip, live demo built in the browser (no model needed). |

## 7. Visual learning requirements (the heart of the demo)

The report is a 6-step lesson with a visible progress header (borrowed from MiroFish's step screens):

1. **Your question**, with a demo-data ribbon when relevant.
2. **Your numbers**: each with a source chip (*Your number · A guess · Calculated · Imagined · Demo data*) and a legend that teaches the difference.
3. **Possible outcomes**: three cards and a bar chart with a zero line; every number can show its maths.
4. **The one number to remember**: a big break-even and a slider with a live chart. Below it, ***Why this changed*** rewrites itself as the slider moves.
5. **Rehearsal**: persona cards, a round-by-round timeline grid (MiroFish's action timeline as a grid), an uptake chart, the feed, a who-told-whom network, interview answers, and a box on *what a simulation can and cannot tell you*.
6. **Your test and what you learned**: a printable test card, lessons, *use this method again*, a glossary and a privacy card.

Constraints: no chart libraries (inline SVG), works at 390 px with no sideways scroll, dark mode, accessible names, one heading per page, renders in under 2 s.

## 8. Principles (from vision.md, made testable)

| Principle | How we enforce it |
|---|---|
| Possibilities, not promises | Scenarios are ranges; the rehearsal caveat; no "will" in outcome text |
| Constructive honesty | Warnings when the likely guess is below break-even or the worst case exceeds half the spare cash |
| Evidence beside advice | Source chips on every figure; never invent local statistics |
| Clear calculations | Engine tests; the QA check that every figure has a `maths` string |
| Small actions first | Every flow ends in a 10-day test with a cost cap |
| Respectful use of data | Stateless server; data only in the link fragment; privacy card |

## 9. Out of scope (hackathon)

- Accounts and storage.
- Integrations (POS, bank, social).
- Authentication on the MCP.
- More templates than two.
- Agent swarms bigger than 12.
- Knowledge graphs.
- Plugin marketplace publishing.
- Languages other than English.

## 10. Success measures

- **Demo:** from "what if" to a visual report in under 3 minutes in Claude, and in under 5 with the rehearsal.
- **Real-owner test** (vision.md): after seeing the report, the owner can explain the break-even and the biggest uncertainty, and names the test they would run.
- **QA bot:** overall ≥ 8.5 with every component ≥ 7.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Chat apps truncate long report links | Compact state (deflate + base64url); the rehearsal adds about 3–6 KB; the link still works without the rehearsal |
| A host ignores `structuredContent` | Briefs and key numbers are also in the text block |
| A model invents numbers | Instructions and the skill say "never compute money yourself; the tools do the maths"; numbers are shown with their source |
| The rehearsal is read as a forecast | The Imagined chip everywhere; the caveat box; descriptive counts only, never scaled up or fed into the maths |
| A public MCP is abused | Stateless, read-only, no external calls, small payload limits |
| MiroFish licence (AGPL-3.0) | Ideas only; no code or prompts copied (see `research/mirofish-notes.md`) |

---

## 12. v0.2 — Berlin closed beta

**Status:** building · **Date:** 17 Oct 2026 · **Contract:** [`ARCHITECTURE.md`](ARCHITECTURE.md), section "Berlin closed beta (v0.2)" · **Inputs:** the QA loop 1 judge verdicts in `qa/judge/*.json`, including the café-owner persona (Selin), the educator, the hackathon judge and `refine.json`.

Sections 1–11 describe the hackathon MVP and stay valid. Where this section differs (languages, access to the MCP), this section wins.

### 12.1 Why Berlin, why closed

Loop 1 found the decision lesson strong but unproven: no real café had used What-IF, the AI's part was hard to see, and the loop from guess to count was described but never shown. A small closed beta with one city, one kind of business and a handful of invited owners is the cheapest way to find out whether owners understand, test and come back. Berlin gives real, dated public facts (VAT, minimum wage) to put beside the owner's own numbers, and the demo café already lives in Neukölln.

### 12.2 Scope

| Area | In v0.2 |
|---|---|
| **Who** | Independent cafés in Berlin (owner-run, one site). First wave: **10 invited cafés**. |
| **Languages** | **German (default), English, Spanish, Polish**: the report, the site, `/try`, tool texts, the skill's replies and the starter prompts. German uses "Sie", short sentences and no unexplained finance terms. The AI replies in the language the owner writes in and passes `lang` to every tool. |
| **Access** | **Invite codes** (`WHATIF_BETA_CODES`; unset = open, for local dev and tests). Owners paste a personal connector address `https://<site>/api/mcp?code=XXXX`. A wrong or missing code gets HTTP 401 in German and English with how to ask for one (`WHATIF_BETA_CONTACT`). Report links `/r#…` stay open. |
| **No AI app** | **`/try`** ("Try with your numbers"): one question per screen (Kiez, the 6 required facts, the plan, the likely guess), "why it matters" on each, demo values as placeholders; it ends in the owner's own report. Needs the invite code. Nothing stored. |
| **Berlin maths** | Prices are what customers pay **including VAT**; the engine works on net prices. Staff cost = **extra hours a day × cost per hour**. The report shows a **"Berlin facts used"** card with the source and date of each public fact. |
| **Kiez** | Optional `kiez` (18 Kieze plus "other"). Used only by the rehearsal (persona mix, names, alternatives, channels, scene), as a labelled rough guess, never as statistics. |
| **Rehearsal events** | Berlin events the owner can inject: a BVG strike day, a week of rain, a heatwave (32 °C), a Baustelle outside, the school holidays, a new café two doors down with an €8.50 lunch, a street festival weekend, the Christmas market opening. Shocks to rehearse, never facts or forecasts. |
| **Templates** | Weekday lunch offer and price change on one item. The price change is the natural template for the dated wage step (12.6). |
| **Near misses** | A "what if" that is not the owner's decision (the weather, a competitor alone, a rent rise) is answered briefly and turned into a decision; `whatif_start` may return `template: null`. |
| **Not yet** | **Hiring and opening hours**: What-IF says "not yet" and walks through the method on paper (cost per day against extra customers a day, every figure labelled, a cheap test with a stop rule) instead of squeezing them into the lunch template. |
| **Skill and instructions** | Triggers on "what if…", "was wäre, wenn…", "¿y si…?", "co jeśli…" and on coming back with test results; the near-miss rule; numbers turned into plain numbers and read back in the owner's format ("1.500 €, richtig?"); a by-hand path with keep / tweak / stop and a cost cap; starter prompts in four languages for apps without skills. |

### 12.3 Public facts the numbers use

Checked 17 Oct 2026. Never add a fact without a source and a date; never add local statistics (rents, footfall, Kiez demographics, average prices).

| Fact | Value | Since | Source |
|---|---|---|---|
| VAT on food in restaurants and cafés (eat-in and take-away) | 7% | 1 Jan 2026 | § 12 (2) Nr. 15 UStG, Steueränderungsgesetz 2025 (Bundestag 4 Dec 2025, Bundesrat 19 Dec 2025, promulgated 23 Dec 2025): https://www.gesetze-im-internet.de/ustg_1980/__12.html |
| VAT on drinks | 19% | unchanged | excluded from § 12 (2) Nr. 15 UStG |
| Milk drinks with at least 75% milk | 7% | unchanged | § 12 (2) Nr. 1 UStG with Anlage 2 |
| Combined offers (a menu or buffet with a drink) | a flat 30% of the price may count as the drinks share | 1 Jan 2026 | BMF letter of 22 Dec 2025 (III C 2 – S 7220/00023/014/027), UStAE 10.1 (12) |
| Statutory minimum wage | €13.90 gross an hour | 1 Jan 2026 | Fünfte Mindestlohnanpassungsverordnung of 5 Nov 2025, after the Mindestlohnkommission's decision of 27 Jun 2025: https://www.bundesregierung.de/breg-de/aktuelles/mindestlohn-steigt-2391010 |
| Statutory minimum wage, next step | €14.60 gross an hour | 1 Jan 2027 | the same ordinance |

How the engine uses them: the lunch offer's optional `vat_rate` falls back to **10.6%** (70% food at 7% + 30% drinks at 19%), the price change's to **19%** (coffee drinks; 7% noted for food and milk drinks); `staff_hourly_cost` falls back to **€13.90**, tagged as a guess with "your real cost per hour is higher once employer contributions are added; check your payroll". Where a VAT split or payroll is involved, the text says "ask your Steuerberater". The demo uses 1 extra staff hour at €18.00.

### 12.4 What the loop-1 judges found, and how v0.2 answers it

These answers are v0.2 requirements; QA loop 2 checks whether each one landed.

| Finding (judge) | v0.2 answer | Where |
|---|---|---|
| No public MCP; the skill and README point to placeholders or a dead domain (skill, docs-devex, hackathon) | Deploy on Vercel with `WHATIF_SITE_URL`; the build warns when the skill zip would point at localhost or a non-https address; the README has a "Live" line and a local fallback | build, README |
| The trigger is too narrow, there is no near-miss rule, and nothing triggers when the owner returns with results (skill) | Four-language triggers, a results trigger and the near-miss rule; `whatif_start` returns `template: null` for non-decisions | skill, instructions, MCP |
| "1.500 €" is read as €1.50 (skill) | The model turns words into plain numbers and reads them back in the owner's format; the parser handles German formats | skill, instructions, engine |
| Only Claude apps can use the skill, `unzip` is missing on Windows, and the by-hand path has no stop rule (skill) | Starter prompts in four languages and the server's `what-if` prompt; Windows `Expand-Archive`; a complete by-hand path with the questions, keep / tweak / stop and the cost cap | skill (`connect.md`, `maths.md`) |
| SKILL.md is too long and every example is about lunch (skill) | SKILL.md cut to about 140 lines with detail in references; a price-change example and dialogue | skill |
| A Windows clone fails a test on CRLF, so QA depends on the checkout (docs-devex) | A root `.gitattributes` (`eol=lf`); tests normalise line endings | repo, tests |
| The README misses `qa:dry`, the Playwright install, the Node version and stdio; no licence file; the Cursor path differs from the Connect page (docs-devex) | The README's local-dev section is rewritten (Node 22+, `qa:dry` first, the loop warning, Playwright, typecheck, dev:watch, stdio); `LICENSE` added; both Cursor paths | README, repo |
| There is no route to her own numbers without "Developer mode" or an MCP URL (Selin) | `/try` in four languages, no AI app needed; the Connect page puts the plain Claude steps first | site |
| "Played by an AI" sits next to "with no AI" (Selin, educator, hackathon) | The rehearsal caveat follows the method that actually played the customers | sim, report |
| The worst case is taught as a ceiling, although it rests on the switching guess (educator) | The worst case says what it rests on ("if nobody new comes and 30% of your regulars switch, a guess") | engine, report, skill |
| Keep / tweak / stop counts money already spent (educator) | The rule separates "pays its way going forward" from "paid back the test"; the skill teaches the same | engine, skill |
| −€56.02 does not match the maths line, and the stop line counts discounts she cannot see (Selin) | Consistent rounding in maths lines; a stop line built from what is on the tally sheet and in the receipts envelope | engine, report |
| The AI's work is invisible, there is no lesson about AI and no proof of use (hackathon, refine) | A "who did what" line in the report; one AI lesson in "What you learned"; the beta's dated session notes (12.6) are the proof of use | report, beta |
| The loop from guess to count is never shown (educator, hackathon, refine) | The skill offers `whatif_log_result` when the owner comes back and suggests calendar reminders for the check-ins; the beta counts who comes back (12.5) | skill, beta |

### 12.5 What the beta must prove (success measures)

Written down before the first invite. Every measure is a **count of cafés** ("4 of 10"), never a percentage, and results are **never turned into a benchmark across cafés**.

| Measure | How we know | Aim for the first wave |
|---|---|---|
| Invited cafés run one session on their own numbers | session notes, or the owner's own report link | 10 of 10 |
| Explain their break-even and their biggest uncertainty **in their own words** | the dated session note, written with the owner's consent | at least 7 of 10 |
| Say the test is something they could run next week | session note | at least 7 of 10 |
| **Start** the test from their card | the owner tells us at the first check-in | at least 5 of 10 |
| **Come back with counts** and log a result (`whatif_log_result` or `/try`) | the owner chooses to send her result link to the beta contact | at least 4 of 10 |
| Use `/try` alone, without a session (comparison group) | invite cards marked "/try only" | at least 3 of 10 |
| No invented facts | transcripts and reports reviewed: every outside figure is one of the dated facts in 12.3 | 0 invented facts |

The QA gate still applies to every release: each part scored 1–10, overall ≥ 8.5 passes, stop after the fifth failed loop.

### 12.6 Recruitment and serving plan

- **The dated Berlin hook.** The minimum wage rises from **€13.90 to €14.60 on 1 Jan 2027**. Every owner with staff faces it, so the beta opens with "Was wäre, wenn ich meine Preise anpasse?" (the price-change template) next to the lunch deal. The wage step is shown as a **dated fact, never as pricing advice**; payroll and VAT questions go to "fragen Sie Ihre Steuerberaterin oder Ihren Steuerberater". A small figure for what the wage step could cost a week (hours paid at the minimum wage × €0.70, tagged as a guess until checked against payroll) is a candidate for the engine, not a v0.2 promise.
- **A German invite card** per café: the question ("Was wäre, wenn …?"), the `/try` link, the Connect page and a **personal invite code**. Spanish, English and Polish versions on request.
- **One 30-minute session in German** per café, on the owner's own phone, with her own Z-report from the till: connect (or `/try`), one decision, the report, the test card.
- **At least 3 cafés use `/try` alone**, with no session, to compare with the founder-led sessions (which inflate understanding).
- **Consented, dated notes** after each session: what she understood, the break-even she found, whether she will run the test, and whether a helper was present. Never invent or polish a quote.
- **Coming back.** The "keep this" note and calendar reminders for day 3, day 5 and the last day; the owner decides whether to send her result link to the beta contact. Nothing is collected silently; the server stores nothing.

### 12.7 Out of scope for v0.2 ("not yet")

- Modelling hiring and opening hours (the method on paper only).
- More templates, other cities, other kinds of business.
- Accounts, stored results, till (POS) imports such as DSFinV-K.
- Benchmarks or league tables across cafés.
- Any local statistic beyond the dated facts in 12.3.

### 12.8 Beta risks

| Risk | Mitigation |
|---|---|
| It reads like tax or pay advice | Facts shown with source and date; "not a substitute for a Steuerberater"; never a recommendation to raise prices |
| Owners don't come back after the test, and the stateless design means we never see results | The keep-this note, calendar reminders, a voluntary result link to the beta contact, a check-in message from the person who invited them |
| Founder-led sessions make understanding look better than it is | Note whether a helper was present; compare with the `/try`-alone cafés |
| A code leaks | One code per café; remove it from `WHATIF_BETA_CODES` and redeploy; codes are never logged or echoed |
| Facts change (VAT, wage) | Every fact is dated; re-check 12.3 before each wave |
| Translations sound stiff or wrong | A native speaker reviews German, Spanish and Polish before the first invites |
