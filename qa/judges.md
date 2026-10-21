# What-IF QA judges

The QA bot (`qa/run.ts`) scores every component from automated checks and from judges. Judges are Claude reviewer subagents, or a human. Automated checks see what code can see: tests pass, a slider exists, no secrets. Judges score what checks cannot see: whether the maths is right, whether the report teaches, whether a café owner would trust it and try the test.

A component's score is `0.6 × automated + 0.4 × judge` (product uses `0.2 / 0.8`, see `qa/rubric.json`). The judge score is the mean of every judge file for that component. Without a judge file, the judge part falls back to the automated score.

## 0. Loop 3: what changed

Loop 3 judges the fixes for what the loop-2 judges found (§9). Every judge:

1. **Reads its loop-2 file first** (it is still in `qa/judge/`) and fills the **`loop2`** field: every loop-2 improvement, in its order, with `fixed`, `partly`, `not fixed` or `no longer applies` and the evidence you looked at in this loop (§2). Loop-2 findings that a check now covers are listed in §9 with the check id; confirm a fix with the evidence, not with the check's word alone.
2. **Uses the new evidence** (§1): the demo variants on a phone (`report-result-phone.png`, `report-price-phone.png`, and `report-ai-phone.png` when the site has `/r#demo-ai`), every `/try` screen on a phone (`try-phone-01.png` … with `try-phone.txt`), the finished `/try` report on a phone (`try-report-phone.png`, `try-report.txt`) and, when the report offers it, its rehearsal (`try-rehearsal-phone.png`, `try-rehearsal.txt`), a refused invite code (`try-beta-wrong-code.png`), and the landing, connect and `/try` texts in every language (`landing-en.txt`, `connect-es.txt`, `try-pl.txt`, …).
3. **Holds the product to one word per idea.** `src/i18n/terms.ts` (TERMS) names the words for break-even, imagined, the five source chips and the test verdicts in each language. The chat (MCP texts and skill), the landing page, `/try` and the report should use them. Checks `terms-chip-words`, `terms-report-words` and `ui-terms` catch the plain cases; you judge whether the words read naturally and teach.
4. **Knows the new closed-beta contract.** With invite codes set, the MCP server connects and lists its tools without a code; every tool call without a valid code returns the beta message as a tool error (German first, then English, with the contact and the `?code=` link), never a 401, so hosts with OAuth support (Claude Code, claude.ai) show it instead of a sign-in prompt (checks `mcp-beta-codes`, `mcp-beta-oauth`).

### Standing since loop 2 (v0.2, Berlin closed beta)

What-IF is a **closed beta for independent cafés in Berlin**, with **invite codes**, in **German (the default), English, Spanish and Polish**. Read the last section of `docs/ARCHITECTURE.md` ("Berlin closed beta (v0.2)") before you judge. Every judge also checks:

1. **The four languages.** The evidence is German first (`report-phone.png`, `report.txt`, `landing.txt` are the German pages). Also look at `report-en-phone.png`, `report-es-phone.png` and `report-pl-phone.png` with their `.txt` files, and `report-static.<lang>.html`. Look for English left in other languages, awkward or machine-like translation, the wrong number format (German: "9,90 €", "1.500 €") and a switcher (DE · EN · ES · PL) that keeps the same report.
2. **The Berlin facts card** ("Berlin facts used"): VAT (7% food / 19% drinks since 1 Jan 2026; milk drinks with at least 75% milk are 7% only to take away) and the minimum wage (€13.90 since 1 Jan 2026), each with a source, a link and a date. A fact without a source or date is a defect. A fact that is wrong is a wrong money figure (§4).
3. **The closed-beta flow:** `/try` with an invite code. The evidence is `try-beta-code.png` (the code screen), `try-beta-wrong-code.png`, `try-beta-first-question.png`, `try-phone-*.png` and `try-phone.txt` (every screen at 390 px), `try-walkthrough.txt` (the keyboard run), `try-report-phone.png`, `connect-beta.txt` and `connect-beta-phone.png` (the personal `…/api/mcp?code=` URL). Could a café owner go from an invite code to her own report, alone, on her phone?

## 1. Before you judge

1. Run `npm run qa:dry`. It does not count as a loop. It refreshes the evidence. Every report screenshot and text is built from the **shipped demo** (`src/report/demo.ts`, what `/r#demo` shows), not from a private QA run:
   - `qa/reports/dry-run.md`: the scores, every failing check and the command to reproduce it.
   - `qa/reports/ui/*-desktop.png`, `*-phone.png` (390 px) and `*-dark.png`: the landing page, the connect page, the `/try` wizard and the demo report (German). Also `report-slider-moved.png` and, when the report has collapsible sections, `report-phone-collapsed.png`.
   - `qa/reports/ui/report-en-phone.png`, `report-es-phone.png`, `report-pl-phone.png` and `report-en.txt`, `report-es.txt`, `report-pl.txt`: the same demo in the other languages. `report-switched-en.txt`: the German report after choosing EN in its switcher.
   - `qa/reports/ui/landing.txt`, `connect.txt`, `try.txt` and `report.txt`: the visible text of each page.
   - `qa/reports/ui/try-walkthrough.txt`, `try-done-report.png`: the keyboard-only run through `/try` (desktop). `try-beta-code.png`, `try-beta-wrong-code.png`, `try-beta-first-question.png`, `connect-beta.txt`, `connect-beta-phone.png`: the closed-beta flow on a server with `WHATIF_BETA_CODES` set (test code `test-code-123`).
   - **Loop 3:** `try-phone-01.png` … `try-phone-NN.png` and `try-phone.txt`: every `/try` screen at 390 px, in order, with its text. `try-report-phone.png` and `try-report.txt`: the report that run ends on. `try-rehearsal-phone.png` and `try-rehearsal.txt`: the same report after pressing its rehearsal button (only when the report offers one; check `ui-try-rehearsal`).
   - **Loop 3:** `report-result-phone.png` / `report-result.txt` (`/r#demo-result`, the demo after the test), `report-price-phone.png` / `report-price.txt` (`/r#demo-price`, the flat white and the 2027 minimum wage) and, when the site has it, `report-ai-phone.png` / `report-ai.txt` (`/r#demo-ai`). The same pages in the other languages: `report-result-en.txt`, `report-price-es.txt`, … (check `ui-demo-variants`).
   - **Loop 3:** `landing-en.txt`, `landing-es.txt`, `landing-pl.txt`, and the same for `connect-*` and `try-*`: the site in each language.
   - `qa/reports/ui/report-static.html` (English) and `report-static.de.html`, `.es.html`, `.pl.html`: the demo report as `renderReport()` draws it.
2. If the evidence is missing (Playwright not installed), say so in `notes` and judge from the `report-static.*.html` files and the code.
3. If your judge file already exists, read it first. It holds the last loop's verdict. Say what changed since then, and fill `loop2` (§9).

## 2. Output

Write exactly one JSON file per judging task (the persona judges write two, see §6). Nothing else:

```json
{
  "score": 7.5,
  "notes": "≤ 200 words: what you checked, what is strong, what holds the score back. Cite evidence (file:line, screenshot, check id).",
  "improvements": [
    "Ranked by impact. Each one names where (file or screen), what to change, why (which criterion) and how to tell it worked."
  ],
  "loop2": [
    { "improvement": "your loop-2 improvement, shortened", "status": "fixed | partly | not fixed | no longer applies", "evidence": "file:line, screenshot or check id" }
  ]
}
```

`loop2` lists **every** improvement from your loop-2 file, in its order. A judge without a loop-2 file writes `"loop2": []`. An improvement marked `fixed` needs evidence you looked at in this loop, not the docs saying so. Drop the old `loop1` field when you overwrite your file (the bot reads `loop2` in loop 3; `qa/rubric.json` version 3).

- `score`: from 1 to 10, one decimal allowed.
- `improvements`: 3 to 6 items. Do not write vague ones like "improve the UX" or "add more tests". A good one: "src/report/steps.ts:212: the worst-case card says 'max loss'. Say 'the most this test can cost you: €410' and show it as a share of the spare cash. Selin did not know what 'max loss' covered."
- Extra fields are allowed and kept in the JSON report, for example the persona fields in §6. The bot reads only `score`, `notes` and `improvements` (or `issues`).

File names: `qa/judge/<component>.json` for the component reviewer, `qa/judge/<component>.<persona>.json` for a persona judge, and `qa/judge/refine.json` for the idea refinement (§7). Details are in `qa/judge/README.md`.

## 3. Rules for every judge

1. **Read only.** Do not edit code, docs, tests or other judges' files. Write only your own JSON file.
2. **Evidence, not impressions.** Every claim in `notes` points at a file and line, a screenshot, a page text or a check id.
3. **Score against the anchors in §4, not against effort.** The gate is 8.5 overall. An 8.5 means a hackathon judge would be convinced and only polish is left. Do not round up out of kindness. The fix loop needs honest numbers.
4. **Do not re-count the automated checks.** The bot already scores them. A failing check matters to you only if it changes what a user or judge experiences. Then say so.
5. **Judge the product as shipped.** Plans in docs, TODOs and "later" sections earn nothing.
6. **Honesty is part of quality.** Anything that presents a guess, an imagined reaction or a demo number as a fact lowers the score, wherever it appears.
7. **Keep notes short.** At most 200 words. Spend the words on the improvements.

## 4. Calibration anchors (all components)

| Score | Meaning |
|---:|---|
| 10 | Exemplary. Nothing material to change; others could copy it. |
| 9 | Excellent. One or two polish items. |
| 8 | Good. A few real but small issues; a judge would be convinced. |
| 7 | Solid, with gaps a user or judge will notice. |
| 6 | Works, but delivers only part of the core promise. |
| 5 | Half-built, or confusing where it matters. |
| 3–4 | Major problems: wrong numbers, a broken flow, misleading claims. |
| 1–2 | Missing or unusable. |

Hard caps, whatever else is good:

- A wrong money figure in the demo: engine ≤ 4, product ≤ 6.
- Owner-facing text that claims a prediction or certainty ("you will earn", "AI predicts"): product ≤ 6, and the component where it appears ≤ 6.
- The report breaks at 390 px, or is unreadable in dark mode: visual ≤ 6.
- Owner cost numbers leak into persona briefs, or imagined counts are scaled up to real customers: rehearsal ≤ 5.
- A tool that needs server memory, or a secret in the repo: mcp ≤ 5 / docs-devex ≤ 4.
- Loop 2 (v0.2):
  - A public fact (VAT rate, minimum wage) that is wrong, or used without a source and date: engine ≤ 5.
  - A rule-based rehearsal presented as played by an AI (or the reverse), anywhere the owner reads it: rehearsal ≤ 6, product ≤ 6.
  - The German report or `/try` shows English UI text an owner meets on the main path, or numbers in the English format: visual ≤ 7.
  - With invite codes set, a tool call without a valid code returns a result (not the beta message), or a code is logged, echoed or put in a report link: mcp ≤ 5. (Since loop 3, initialize, tools/list and prompts/list answer without a code on purpose.)
  - The closed-beta flow cannot be finished without help (no code screen, a valid code refused, `/try` stuck): visual ≤ 6, product ≤ 7.

## 5. Component reviewers

Each section lists what to read, what to do, the criteria (with their share of your score), red flags and what a 9 or better looks like. Write `qa/judge/<component>.json`.

### 5.1 engine: Scenario engine (maths)

**Read:** `src/engine/*.ts`, `test/engine.test.ts`, the engine part of `docs/ARCHITECTURE.md`, and `qa/reports/ui/report.txt` (how the numbers reach the owner).

**Do:** print the demo analysis and rebuild the break-even by hand from the `maths` strings. Check every step: what one deal earns, what switching regulars cost, the daily cost of the test (staff, promotion, setup spread over the test) and the break-even itself. Then try edge cases: a deal priced at its cost, `lunch_customers: 0`, `extra_likely` far above break-even, a price change with no lost sales.

```
node --import tsx -e "import('./src/engine/index.ts').then(e => console.log(JSON.stringify(e.analyze('lunch_offer', e.demoInputs('lunch_offer'), { demo: true }), null, 2)))"
```

| Criterion | Share |
|---|---:|
| Correctness: every figure matches your hand calculation; rounding never flips a sign or the verdict | 40% |
| Transparency: each figure's `maths` uses the owner's own numbers and matches its value; source tags are right (a guess is never tagged as a fact) | 20% |
| Edge cases: plain warnings, never NaN, ∞ or silent nonsense | 15% |
| Tests pin the demo numbers, the invariants and the edge cases | 15% |
| Code a reviewer can follow: names, one formula in one place | 10% |

**Red flags:** money computed outside `src/engine`; a `maths` string that does not reproduce its value; "expected" presented as what will happen; percentages without a base.

**9+:** you could not find a wrong number, every figure explains itself, and the tests would catch a formula change.

**Loop 2 also:** redo the demo break-even on **net prices**: deal price ÷ (1 + VAT) minus its cost, with the VAT the analysis used (the lunch fallback is 10.6%: 70% food at 7% + 30% drinks at 19%). Check that staff cost is hours × hourly cost (demo 1 h × €18.00; fallback €13.90, the minimum wage since 1 Jan 2026, tagged a guess with the payroll note). Check every entry of `analysis.facts`: is the value right, is the source the one ARCHITECTURE.md names, does the link open the right page, is the date right? Run the demo with `{ lang: "de" }` and read the maths strings as a German owner: "9,90 €", "1.500 €", decimal commas, no English left. Type "1.500 €", "9,90" and "ca. 40" into `checkInputs` (check `berlin-number-parsing`).

```
node --import tsx -e "import('./src/engine/index.ts').then(e => console.log(JSON.stringify(e.analyze('lunch_offer', e.demoInputs('lunch_offer'), { demo: true, lang: 'de' }), null, 2)))"
```

**Loop 3 also:** the milk-drink VAT rule in every language: 7% only to take away, 19% drunk in the café (check `berlin-vat-takeaway` reads the engine, report and site catalogs; you judge the wording and the facts card). Redo the `/try` case with the placeholder values (140 a day, 7,40 € average bill, 38 at lunch, a 9,90 € deal): every maths line and "Why this changed" in plain German, no "− −" (checks `visual-no-double-signs`, `ui-report-signs`), and a worst case that is a gain reads as one.

### 5.2 rehearsal: Customer rehearsal (simulation)

**Read:** `src/sim/*.ts`, `test/sim.test.ts`, `docs/research/mirofish-notes.md`, and the rehearsal section of `qa/reports/ui/report.txt`.

**Do:** print a round-1 brief and the summary of a rule-based run:

```
node --import tsx -e "Promise.all([import('./src/engine/index.ts'), import('./src/sim/index.ts')]).then(([e, s]) => { let r = s.startRehearsal(e.analyze('lunch_offer', e.demoInputs('lunch_offer'), { demo: true })); console.log(s.roundBriefs(r)[0].prompt); while (r.status !== 'done') r = s.submitRound(r, s.ruleBasedReactions(r), 'rule-based').rehearsal; console.log(JSON.stringify(s.summarize(r), null, 2)); })"
```

Read the brief as the subagent that will receive it. Could you answer well from it alone, and does it reveal anything a customer would not know?

| Criterion | Share |
|---|---:|
| Personas: realistic Neukölln locals who differ in ways that matter here (price sensitivity, routine, attitude), not caricatures | 20% |
| Story across rounds (launch day, first week, second week, after); the feed and the diaries carry it forward | 20% |
| Briefs: self-contained, short, a clear JSON schema, nothing private (costs, break-even, other personas' thoughts) | 20% |
| Honest summary: descriptive counts of imagined people, never scaled up, a clear caveat, questions to check with real customers | 20% |
| Owner events change behaviour plausibly; validation is strict but lets the host retry one persona | 10% |
| Code clarity; MiroFish ideas borrowed without AGPL code or prompts | 10% |

**Red flags:** "40% of your customers would…"; imagined results feeding the scenario maths; stereotyped personas; a brief that tells the persona what to answer.

**9+:** reading the timeline feels like watching a neighbourhood react, and the owner leaves with sharper questions for real customers, not a forecast.

**Loop 2 also:** run the rehearsal for two different Kieze (`kiez: "Neukölln"` and `kiez: "Charlottenburg"`) and judge whether the people, names, alternatives (Bäckerei, Späti, Döner, Kantine…) and channels (Instagram, Google Maps, nebenan.de, the Kiez WhatsApp group) feel like that Kiez, and whether the mix is labelled a rough guess, not statistics. Inject two `BERLIN_EVENTS` (a BVG strike, the rival café's €8.50 lunch) and read whether behaviour changes plausibly. Read one German brief and one German rule-based round: do the imagined customers think in natural German (Sie/du as a local would), and does the brief ask for answers in German? Check that the summary says truthfully who played the customers (check `sim-honest-method`).

**Loop 3 also:** the demo interviews (`report.txt`, `report-price.txt`): check `sim-interview-unique` says no two imagined customers give the same answer; you judge whether each answer fits that persona's own rounds (the place she went, her quirk) and reads like a person. Read one Spanish and one Polish step 5 for one word per idea (TERMS: "clientes imaginados", "wyobrażeni klienci").

### 5.3 mcp: Public MCP server and build

**Read:** `src/mcp/*.ts`, `src/state.ts`, `scripts/build.mjs`, `scripts/dev.mjs`, `test/mcp.test.ts`, and the tools table in `docs/ARCHITECTURE.md`.

**Do:** run `node scripts/dev.mjs` and list the tools (or read `src/mcp/tools.ts`). Read each description as a model that has never seen What-IF. Would you call `whatif_start` on "what if I hire a part-timer?" Would you know what to do next after every result?

| Criterion | Share |
|---|---:|
| Tool descriptions make the right call obvious, starting with whatif_start on "what if…" | 25% |
| Stateless and safe as a public endpoint: input limits, no storage, no outbound calls, CORS, nothing secret in tokens | 20% |
| Input schemas a model can fill from a chat; sensible optional fields | 15% |
| Result shape: plain text first, structuredContent, report_url at every step | 15% |
| Errors tell the model what to ask the owner next | 15% |
| A self-contained Vercel bundle; the stdio server matches HTTP | 10% |

**Red flags:** server memory between calls; owner data in query strings or logs; descriptions that promise predictions; unbounded strings or arrays.

**9+:** a model in any MCP host could coach a full session from the tool descriptions and results alone.

**Loop 2 also:** read the tool descriptions for `lang`: will a model pass the language the owner writes in, and is German the default?

**Loop 3 also:** the new closed-beta contract. Start a server with `WHATIF_BETA_CODES=test-code-123` (`node scripts/dev.mjs --no-build` after a build). Without a code, initialize, tools/list and prompts/list answer; the instructions end with a "CLOSED BETA" note; every tool call returns the beta message as `isError` (German first, then English, the contact, `?code=IHR-CODE` / `?code=YOUR-CODE`) and `structuredContent.beta`. The OAuth paths answer 404 JSON, never a 401 or WWW-Authenticate (checks `mcp-beta-codes`, `mcp-beta-oauth`, which also connects the official SDK client with an OAuth provider). Judge what an owner sees: would Claude Code `/mcp` and claude.ai "Add custom connector" now show the message instead of a sign-in, and would the model relay it in her language and stop there, without repeating the code? Look for codes in logs, report links, error texts and the GET info.

### 5.4 visual: Visual report and website

**Read:** the screenshots in `qa/reports/ui/` (phone first, then desktop, then dark), `report.txt`, `landing.txt`, `connect.txt`, `report-static.html`, `src/report/*.ts`, `site/*.html` and `site/src/*.ts`, and §7 of `docs/PRD.md`.

| Criterion | Share |
|---|---:|
| The six steps each teach one idea, in an order that builds (question, numbers, outcomes, the one number, rehearsal, test) | 25% |
| Charts: readable, honest axes, a zero line, labelled in words; no chart that needs a legend hunt | 15% |
| The slider and "Why this changed" explain a mechanism, not just new numbers | 15% |
| Landing page teaches the method in under a minute; the connect page gets a non-technical helper connected in two minutes | 15% |
| Source chips and legend make "yours / calculated / a guess / imagined / demo" obvious | 10% |
| Rehearsal visuals: persona cards, timeline grid, uptake, who told whom, interview | 10% |
| Polish: phone width, dark mode, accessibility, speed, print of the test card | 10% |

**Red flags:** walls of numbers; jargon (sensitivity, elasticity, contribution margin) without a plain word beside it; colour as the only signal; a slider with no visible effect; demo data not labelled.

**9+:** someone who has never seen a break-even chart understands it from the report, on a phone.

**Loop 2 also:** judge the German report first (`report-phone.png`), then compare one screen each in English, Spanish and Polish. Check the switcher on every page, the "Berlin facts used" card, the phone length (check `ui-report-height` reports the pixels; loop 1 was 23,943 px), the printed test card (check `ui-print-card`; loop 1 printed 15 pages) and the `/try` wizard: one question per screen, "why it matters" on every screen, demo values as placeholders, rough numbers welcome, keyboard-only (check `ui-try-keyboard`, `try-walkthrough.txt`), and the invite-code screen (`try-beta-code.png`).

**Loop 3 also:** `/try` on a phone, screen by screen (`try-phone-*.png`), and the report it ends on (`try-report-phone.png`): does step 5 offer a rule-based rehearsal, and after pressing it (`try-rehearsal-phone.png`) does the stepper reach 6 of 6 with the caveat saying fixed rules played the customers (check `ui-try-rehearsal`)? The demo after the test (`report-result-phone.png`) and the price demo (`report-price-phone.png`) at 390 px. One word per idea across landing, `/try` and report, in every language (checks `terms-chip-words`, `terms-report-words`, `ui-terms`).

The persona judges in §6 also write `visual.<persona>.json`.

### 5.5 skill: Skill

**Read:** `skill/what-if/SKILL.md`, `skill/what-if/references/*.md`, `src/mcp/instructions.ts` and `docs/research/mcp-and-skill-formats.md`.

**Do:** run four conversations in your head and follow the skill step by step:

1. "What if I run a weekday lunch deal?" in Claude Code, with subagents and the MCP connected.
2. The same in claude.ai, with the MCP connected and no subagents.
3. The same with the skill alone and no MCP.
4. A near-miss: "what if it rains tomorrow?" (not a business decision), and "what if I raise my coffee price?" (the second template).

| Criterion | Share |
|---|---:|
| Coaching: one focused question at a time, each with why it matters; offers the demo; rough numbers welcome | 20% |
| Rehearsal orchestration: parallel subagents with only their brief, in-context role play otherwise, rule-based as last resort; retries per persona | 20% |
| Trigger precision: fires on "what if…" business decisions, behaves sensibly on near-misses | 20% |
| Never computes money itself; shares the report link at every step; keeps the imagined/calculated distinction in its own words | 15% |
| Progressive disclosure: SKILL.md short and scannable, references read on demand | 15% |
| Connect instructions per app (claude.ai, Claude Code, ChatGPT, Cursor, VS Code) | 10% |

**Red flags:** the model told to estimate numbers; long SKILL.md walls; instructions that contradict the tool results; no path when the MCP is not connected.

**9+:** you could hand the zip to a café owner's nephew, and their first "what if" would go well.

**Loop 2 also:** run conversation 1 in German ("Was wäre, wenn ich einen Mittagstisch anbiete?") and one in Polish or Spanish: does the skill answer in the owner's language and pass `lang`? Read how it explains the invite code and the personal connector URL (`…/api/mcp?code=…`), and what it says when the server answers 401. Unzip the built zip from a production-like build (check `skill-zip-prod-url`): the MCP URL must be https and not localhost, with no `{{…}}` left.

**Loop 3 also:** a build without `WHATIF_BETA_CONTACT` must still read well (check `skill-zip-empty-contact`: no "Ask here: ."). Read what the skill tells the model when a tool returns the closed-beta message (no 401 any more: the tools answer with `isError` and `structuredContent.beta`), and whether its label words match the chips (TERMS, `src/i18n/terms.ts`) in all four languages.

### 5.6 product: Product idea (reviewer)

**Read:** `vision.md` (especially "What-IF is not"), `docs/PRD.md`, `README.md`, the landing page and the demo report (screenshots and text), and any persona files already written (`qa/judge/product.*.json`).

| Criterion | Share |
|---|---:|
| Fit with "AI education for everyone": the owner learns about the decision and about AI (what is theirs, maths, a guess, imagined; AI explains and simulates, it does not know the future) | 25% |
| The learning is visual and hands-on (moving a guess, watching imagined customers, a test to run) | 20% |
| Honest: possibilities, not promises; a small reversible test first; demo data labelled | 15% |
| More useful than a general chatbot with a template: owner's numbers, transparent maths, a workflow that ends in an experiment, a feedback loop | 15% |
| Feasible: a real owner could run the test on Monday and report back | 15% |
| A judge gets it in 60 seconds | 10% |

**9+:** the idea is clearly about teaching, not just answering; the persona judges agree; you would not change the core.

**Loop 2 also:** is the Berlin focus a real improvement for the owner (VAT and the minimum wage taught as dated facts, the Kiez, Berlin events), or decoration? Does a closed beta with invite codes fit the product and the hackathon (who gets a code, how, and what she can do without one)? Can Selin now use her own numbers without an AI app (`/try`)?

After the persona files exist, also write `qa/judge/refine.json` (§7).

### 5.7 docs-devex: Docs and developer experience

**Read:** `README.md`, `docs/*.md`, `package.json`, `scripts/`, `.gitignore`, `qa/` and `docs/QA-RUBRIC.md`.

**Do:** follow the README as a new contributor on a clean machine. Where it is cheap, run the commands here: `npm install`, `npm run build`, `npm test`, `node scripts/dev.mjs`, `npm run qa:dry`. Compare `docs/ARCHITECTURE.md` with the code.

| Criterion | Share |
|---|---:|
| A judge understands what it is and how to try it in 60 seconds | 25% |
| Setup is complete and honest; one command each for dev, test, build and QA; it works on Windows and Unix | 25% |
| The docs match the code: tools, layout, commands, limits | 20% |
| Structure, naming, scripts | 15% |
| The QA bot is reproducible and its report is actionable | 15% |

**Red flags:** commands that do not exist; claimed features that are not built; stale paths; secrets; machine-specific paths.

**Loop 2 also:** does the README explain the closed beta (what a code is, how to ask for one, `WHATIF_BETA_CODES` and `WHATIF_BETA_CONTACT` in Vercel, and that unset means open)? Does a fresh Windows clone pass `npm test` (checks `devex-gitattributes`, `devex-crlf-tests`)? Does ARCHITECTURE.md match the code for languages, catalogs, facts, codes and `/try`?

## 6. Persona judges (product and visual)

Each persona writes **two** files: `qa/judge/product.<persona>.json` (would this idea work and teach, from where they sit) and `qa/judge/visual.<persona>.json` (does the report and site work for them). Same JSON as §2, with the extra fields listed for each persona. The notes are written in the persona's own voice. The improvements are concrete and say which screen they are about.

### 6.1 Selin (persona id `selin`): café owner

Selin, 46, has run a 28-seat café in Neukölln for nine years. Two part-time staff; she is open 7:30 to 18:00. She knows her numbers from the till's daily Z-report and a notebook: about 140 customers on a weekday, rent, wages. She has no finance training and has never heard "contribution margin". She uses WhatsApp and Instagram daily and has used ChatGPT twice, to write an Instagram post. She worries about cash, time and her regulars, and about looking cheap. She reads on her phone, between customers.

**Selin reads German first.** She runs her café in German: her till, her Steuerberater, her suppliers and most regulars speak German. Her English is fluent but plain, so she opens What-IF in German and switches to English only when the German is unclear. She is in the closed beta: a friend from the Kiez WhatsApp group passed her an invite code (`test-code-123` in the evidence). She has no AI app with connectors; she uses `/try`.

**How to judge as Selin:** use only what she would see, in this order: `landing-phone.png` and `landing.txt` (German), `try-beta-code.png`, `try-beta-wrong-code.png` and `try-beta-first-question.png` (the invite code), `try-phone-01.png` … with `try-phone.txt` (every question on her phone), `try-report-phone.png` and `try-report.txt` (her own report), `try-rehearsal-phone.png` when it exists (her own rehearsal), `report-phone.png` and `report.txt` (the German demo), `report-result-phone.png` (the demo after the test), `connect-beta-phone.png` and `connect-beta.txt`. If the German loses her, look at `report-en-phone.png` as she would, and say so. Never the code. Read in order and stop where she would give up. Note the exact words that lost her, in the language she read them in.

**Answer, in her voice:**
- What did you understand? Can you say the break-even in your own words, the most the test could cost you, and which guess matters most?
- What confused you? Quote the words.
- Do you believe the numbers? Why or why not?
- What did you learn about AI: what did it calculate, what did it guess, and what did it imagine?
- Would you run the test next Monday? What would stop you?
- **German first:** does the German read like a person wrote it for you ("Sie", short sentences, no finance jargon without a plain word)? Quote any English left, any awkward or wrong German, and any number in the wrong format ("€9.90" instead of "9,90 €").
- **The Berlin facts:** do you understand why the report takes VAT out of your prices and what the minimum wage has to do with your staff cost? Would you show the facts card to your Steuerberater?
- **The invite code and `/try`:** could you get from the code to your own report alone, between customers? Where did you hesitate?

**Extra fields:** `"understood": ["…"]`, `"confused": ["exact words or section"]`, `"wouldTry": "yes | maybe | no, because …"`, `"learnedAboutAI": "…"`, `"germanFirst": "how the German read, with quotes"`, `"englishLeft": ["English words met on the German path"]`, `"betaFlow": "code → own report: done alone | needed help at …"`.

**Scores:** product: would she use it for a real decision and come away wiser? Visual: could she follow it on her phone without help?

### 6.2 Hackathon judge (persona id `hackathon`): "AI education for everyone"

A judge for the "AI education for everyone" track with five minutes per project. They score:

- impact on the named audience (small-business owners);
- educational quality: does the user learn something transferable?;
- use of AI: is AI used where it adds value, and are its limits taught?;
- execution and demo;
- originality.

**Read:** `README.md` (give it 60 seconds), then the landing page, the demo report and the connect page (screenshots), and the learning loop after the test (`report-result-phone.png`, `report-result.txt`). Optionally `vision.md`. Loop 2: the demo is German by default; use the switcher evidence (`report-en-phone.png`, `report-switched-en.txt`) and judge whether four languages and a closed beta for Berlin cafés make the impact on the named audience more credible, and whether `/try` lets a judge try it in a minute.

**Answer:**
- Does the owner learn something **transferable about AI**? For example: sources are labelled; maths is done by code, not the model; imagined customers are not data; AI explains and simulates but does not know the future.
- Does the owner learn something **transferable about the decision**? For example: break-even, worst case, the guess that matters most, testing small before spending.
- Is the learning **visual**, and is it active rather than passive reading?
- Is it more than "ChatGPT with a template"? What is original?
- Would you believe a real owner tried it?
- Loop 2: is the Berlin focus (VAT and the minimum wage as dated public facts, the Kiez, Berlin events) a teaching gain or just localisation? Is a closed beta with invite codes a sensible way to reach real owners?

**Extra fields:** `"pitchIn60s": "what you would tell the other judges"`, `"standout": "…"`, `"weakest": "…"`.

### 6.3 Learning-design educator (persona id `educator`)

A learning designer who teaches money skills to small-business owners at a Volkshochschule (adult education) and designs self-paced digital lessons. Lens: scaffolding, cognitive load, worked examples, active learning with feedback, misconceptions, transfer.

**Read:** the demo report (screenshots and `report.txt`, German; `report-en.txt` for English), the landing page, `try-walkthrough.txt`, and `src/report/` where the copy lives (the catalogs in `src/report/messages.ts` and `site/src/messages.ts`).

**Answer:**
- **Scaffolding:** does it go from concrete (my numbers, one deal) to the general rule (break-even), with a worked example in the owner's own numbers?
- **Cognitive load:** one idea per step? How many numbers appear at once? Is there jargon without a plain word? Do the charts carry the load, or add to it?
- **Active learning and feedback:** does moving the slider lead to an explanation of the mechanism ("Why this changed")? Is there a moment where the owner predicts and then checks?
- **Misconceptions about AI predictions:** which does the report prevent, and which might it create? For example: "the AI predicted my sales"; "the expected scenario is what will happen"; "imagined customers are a survey"; "break-even means profit"; "more customers is always better".
- **Transfer:** "use this method again", a glossary, a test card the owner can run and report back on.
- **Loop 2, language and facts:** is the German as plain as the English (same cognitive load, no new jargon; a word such as "Deckungsbeitrag" avoided or explained once)? Does the facts card teach that some numbers are public, dated rules (not guesses, not the owner's own numbers), and do the source chips keep that distinction? Does `/try` scaffold the inputs (one question per screen, why it matters, a worked example as the placeholder)?

**Extra fields:** `"misconceptionsRisked": ["…"]`, `"scaffoldingGaps": ["…"]`, `"languageLoad": "how the German (and one of es/pl) compares with the English"`.

## 7. Refine the idea (`qa/judge/refine.json`)

Written by the product reviewer after the three persona files exist. It is **not scored**: the report lists it under "Refine the idea".

Propose the **three highest-impact improvements to the product idea itself**: what What-IF is and does, not code fixes or polish. Rank them by impact on the owner's learning and on the hackathon theme. Each must respect vision.md's "What-IF is not" list. Base them on the persona findings: cite who raised what.

```json
{
  "notes": "≤ 120 words: the pattern behind the three proposals, citing the persona files.",
  "improvements": [
    "1. What: one sentence. Why: the persona finding, vision principle or hackathon criterion it serves. Smallest version: what could ship in a day. Risk: what could go wrong.",
    "2. …",
    "3. …"
  ]
}
```

## 8. Launching the judges from Claude Code

Run `npm run qa:dry` first, then launch the subagents in parallel. That means seven component reviewers and three persona judges; the persona judges write two files each. When the persona judges have finished, run the refine step. Then run the counting loop with `npm run qa`.

Prompt template, one per judge:

> You are the **<role>** judge for What-IF, QA loop 3. Read `qa/judges.md`: §0 Loop 3 (and the standing loop-2 criteria), §1 Evidence, §2 Output, §3 Rules, §4 Calibration, §<section> for your role and §9 Loop-2 findings. The evidence is `qa/reports/dry-run.md` and `qa/reports/ui/` (German first; the other languages are `report-<lang>-*`, `landing-<lang>.txt`, …; the phone run of `/try` is `try-phone-*`). First read your loop-2 verdict `qa/judge/<file>.json`, then overwrite it. Do not edit any other file. Write `{ "score", "notes", "improvements", "loop2" }` there, plus any extra fields your section lists. Then reply with your score, your top three improvements and how many loop-2 improvements are fixed.

The report marks judge files written before the last counted loop as **stale**. Re-run every judge before each loop.

## 9. Loop-2 findings to re-check in loop 3

The loop-2 judges found things the automated checks missed. Each is now covered by a check (the report shows it as `ok` or `FAIL`, with the numbers) or stays with the judges. Confirm a fix with the evidence, not with the check's word alone, and record it in `loop2`. The loop-1 checks of §9 in loop 2 (`skill-zip-prod-url`, `berlin-number-parsing`, `sim-honest-method`, `visual-checklist-chip`, `ui-report-height`, `ui-landing-steps`, `ui-print-card`, `devex-crlf-tests`, `ui-try-*` …) all still run.

| Loop-2 finding (judges) | Now checked by | Judges look at |
|---|---|---|
| Milk drinks "7% since 1 Jan 2026", although only take-away milk drinks are 7% and every drink in the café is 19% (engine, capped at 5) | `berlin-vat-takeaway` (engine, analysis, report and site texts, all four languages; each language's engine texts must state the take-away rule) | the facts card and the flat-white VAT note in every language; the legal basis and the links (judges only) |
| Three pairs of word-for-word identical interview answers; Noor names a café she never visited (visual, Selin, educator, hackathon, rehearsal, product) | `sim-interview-unique` (the shipped `/r#demo` and `/r#demo-price`, all four languages) | whether each answer fits that persona's own rounds and quirk |
| A `/try` report ends step 5 with "Bitten Sie Ihren KI-Coach", a dead end for owners without an AI app (visual, hackathon, educator, product) | `ui-try-rehearsal` (the report offers a rehearsal button; pressing it draws step 5 with the rule-based caveat) | `try-report-phone.png`, `try-rehearsal-phone.png`: 6 of 6, the grid, no "Coach" wording |
| "Break-even" vs "Gewinnschwelle", "Erdacht" vs "Ausgedacht"; chip words that differ between landing, `/try` and report; ES "suposición"/"estimación", PL "Wymyślone"/"Wyobrażone" (visual, Selin, educator, skill) | `terms-chip-words` (engine sourceLabel = TERMS = report `src.*` = site `c.src_*`), `terms-report-words` (rendered reports), `ui-terms` (every German page and `/try` screen, every language's landing and report, every chip on every page) | whether one word per idea reads naturally; the skill's label words (judges only); "Aufhören"/"Beenden", "Startkosten"/"Einrichtung" (judges only) |
| "8 × 5,35 € pro Angebot − −10,03 € pro Tag" and an alarm card for a positive worst case with the `/try` placeholder values (visual) | `visual-no-double-signs` (every demo and the `/try` report, every language, every slider text), `ui-report-signs` (every report the browser drew, folded sections opened) | the worst-case card when the worst case is a gain (judges only) |
| An empty `WHATIF_BETA_CONTACT` ships "Ask here: ." in the skill (skill) | `skill-zip-empty-contact` (a production-like build without a contact) | the lines that replace the contact |
| The closed-beta 401 is dropped by OAuth-capable hosts: "HTTP 404 … /register" instead of the message (mcp, skill) | `mcp-beta-codes` (new contract: initialize, tools/list and prompts/list without a code; every tools/call `isError` with the German, then English message, the contact and `structuredContent.beta`), `mcp-beta-oauth` (OAuth paths 404 JSON, no 401 or WWW-Authenticate, the official SDK client with an OAuth provider) | what Claude Code `/mcp` and claude.ai show without a code; what the skill tells the model to say |
| The evidence showed only 2 of 9 `/try` screens at phone width, and no `/r#demo-result` (Selin, hackathon) | the evidence itself: `try-phone-*.png`, `try-report-phone.png`, `report-result-phone.png`, `report-price-phone.png` (`ui-try-rehearsal`, `ui-demo-variants`) | every screen, in order |
| `npm run qa -- --skip` counted a loop (docs-devex) | `qa/run.ts`: any `--skip` or `--only` run is a dry run and says so | `npm run qa -- --skip engine-tests` leaves `qa/state.json` alone |
| The landing's break-even mini chart puts the dot off the line and clips "Gewinnschwelle:"; "vorsichtig" runs into "−385 €" (visual, Selin, educator) | judges only | a zoom of `landing-phone.png` |
| The predict box and its answer ("Break-even: 11", "Trägt sich: 7") share one phone screen; "one number" is two (11 and 7) (educator, hackathon, Selin) | judges only | `report-phone.png` at the predict box; the step-4 caption |
| On a phone, step 5's visuals and the facts card are folded; grid cells break German words; the round chart says "1 of 6" in German (visual, Selin) | judges only (`ui-report-height` still caps the length) | `report-phone.png`, step 5 |
| `/try` asks 6 numbers; setup, staff hours and spare cash are assumed (Selin, educator) | judges only | `try-phone.txt`, the review screen |
| The facts link to home pages; the price demo asks about the 2027 minimum wage that its maths never uses (engine, educator) | judges only | `berlin.ts`, `report-price.txt` |
| check_inputs → run_scenarios drops `state`; results phrasings and happy hour classify as unclear (mcp, skill) | judges only (`test/mcp.test.ts`) | `src/mcp/tools.ts` |
| maths.md's by-hand keep / tweak / stop rule differs from decision.ts (skill) | judges only | a by-hand card against `planTest` |
| Persona text repeats within a run; contradictory rule-based lines; 3 of 8 events change nothing; Kiez flavour is only the mix (rehearsal) | judges only (`test/sim.test.ts`) | a sweep of seeds and Kieze |
| No live URL or judges' code in the README; stale ARCHITECTURE tools table; no CI (docs-devex, hackathon, mcp) | judges only | `README.md`, `docs/ARCHITECTURE.md`, `.github/` |
