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
