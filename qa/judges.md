# What-IF QA judges

The QA bot (`qa/run.ts`) scores every component from automated checks and from judges. Judges are Claude reviewer subagents, or a human. Automated checks see what code can see: tests pass, a slider exists, no secrets. Judges score what checks cannot see: whether the maths is right, whether the report teaches, whether a café owner would trust it and try the test.

A component's score is `0.6 × automated + 0.4 × judge` (product uses `0.2 / 0.8`, see `qa/rubric.json`). The judge score is the mean of every judge file for that component. Without a judge file, the judge part falls back to the automated score.

## 1. Before you judge

1. Run `npm run qa:dry`. It does not count as a loop. It refreshes the evidence:
   - `qa/reports/dry-run.md`: the scores, every failing check and the command to reproduce it.
   - `qa/reports/ui/*-desktop.png`, `*-phone.png` (390 px) and `*-dark.png`: the landing page, the connect page and the demo report. Also `report-slider-moved.png`.
   - `qa/reports/ui/landing.txt`, `connect.txt` and `report.txt`: the visible text of each page.
   - `qa/reports/ui/report-static.html`: the demo report as `renderReport()` draws it.
2. If the evidence is missing (Playwright not installed), say so in `notes` and judge from `report-static.html` and the code.
3. If your judge file already exists, read it first. It holds the last loop's verdict. Say what changed since then.

## 2. Output

Write exactly one JSON file per judging task (the persona judges write two, see §6). Nothing else:

```json
{
  "score": 7.5,
  "notes": "≤ 200 words: what you checked, what is strong, what holds the score back. Cite evidence (file:line, screenshot, check id).",
  "improvements": [
    "Ranked by impact. Each one names where (file or screen), what to change, why (which criterion) and how to tell it worked."
  ]
}
```

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

## 6. Persona judges (product and visual)

Each persona writes **two** files: `qa/judge/product.<persona>.json` (would this idea work and teach, from where they sit) and `qa/judge/visual.<persona>.json` (does the report and site work for them). Same JSON as §2, with the extra fields listed for each persona. The notes are written in the persona's own voice. The improvements are concrete and say which screen they are about.

### 6.1 Selin (persona id `selin`): café owner

Selin, 46, has run a 28-seat café in Neukölln for nine years. Two part-time staff; she is open 7:30 to 18:00. She knows her numbers from the till's daily Z-report and a notebook: about 140 customers on a weekday, rent, wages. She has no finance training and has never heard "contribution margin". She uses WhatsApp and Instagram daily and has used ChatGPT twice, to write an Instagram post. She worries about cash, time and her regulars, and about looking cheap. Her English is fluent and plain. She reads on her phone, between customers.

**How to judge as Selin:** use only what she would see: `landing-phone.png`, `report-phone.png`, `connect-phone.png`, `report.txt` and `landing.txt`. Never the code. Read in order and stop where she would give up. Note the exact words that lost her.

**Answer, in her voice:**
- What did you understand? Can you say the break-even in your own words, the most the test could cost you, and which guess matters most?
- What confused you? Quote the words.
- Do you believe the numbers? Why or why not?
- What did you learn about AI: what did it calculate, what did it guess, and what did it imagine?
- Would you run the test next Monday? What would stop you?

**Extra fields:** `"understood": ["…"]`, `"confused": ["exact words or section"]`, `"wouldTry": "yes | maybe | no, because …"`, `"learnedAboutAI": "…"`.

**Scores:** product: would she use it for a real decision and come away wiser? Visual: could she follow it on her phone without help?

### 6.2 Hackathon judge (persona id `hackathon`): "AI education for everyone"

A judge for the "AI education for everyone" track with five minutes per project. They score:

- impact on the named audience (small-business owners);
- educational quality: does the user learn something transferable?;
- use of AI: is AI used where it adds value, and are its limits taught?;
- execution and demo;
- originality.

**Read:** `README.md` (give it 60 seconds), then the landing page, the demo report and the connect page (screenshots). Optionally `vision.md`.

**Answer:**
- Does the owner learn something **transferable about AI**? For example: sources are labelled; maths is done by code, not the model; imagined customers are not data; AI explains and simulates but does not know the future.
- Does the owner learn something **transferable about the decision**? For example: break-even, worst case, the guess that matters most, testing small before spending.
- Is the learning **visual**, and is it active rather than passive reading?
- Is it more than "ChatGPT with a template"? What is original?
- Would you believe a real owner tried it?

**Extra fields:** `"pitchIn60s": "what you would tell the other judges"`, `"standout": "…"`, `"weakest": "…"`.

### 6.3 Learning-design educator (persona id `educator`)

A learning designer who teaches money skills to small-business owners at a Volkshochschule (adult education) and designs self-paced digital lessons. Lens: scaffolding, cognitive load, worked examples, active learning with feedback, misconceptions, transfer.

**Read:** the demo report (screenshots and `report.txt`), the landing page, and `src/report/` where the copy lives.

**Answer:**
- **Scaffolding:** does it go from concrete (my numbers, one deal) to the general rule (break-even), with a worked example in the owner's own numbers?
- **Cognitive load:** one idea per step? How many numbers appear at once? Is there jargon without a plain word? Do the charts carry the load, or add to it?
- **Active learning and feedback:** does moving the slider lead to an explanation of the mechanism ("Why this changed")? Is there a moment where the owner predicts and then checks?
- **Misconceptions about AI predictions:** which does the report prevent, and which might it create? For example: "the AI predicted my sales"; "the expected scenario is what will happen"; "imagined customers are a survey"; "break-even means profit"; "more customers is always better".
- **Transfer:** "use this method again", a glossary, a test card the owner can run and report back on.

**Extra fields:** `"misconceptionsRisked": ["…"]`, `"scaffoldingGaps": ["…"]`.

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

> You are the **<role>** judge for What-IF, QA loop <N>. Read `qa/judges.md`: §2 Output, §3 Rules, §4 Calibration, and §<section> for your role. The evidence is `qa/reports/dry-run.md` and `qa/reports/ui/`. Do not edit any file except `qa/judge/<file>.json`. Write `{ "score", "notes", "improvements" }` there, plus any extra fields your section lists. Then reply with your score and your top three improvements.

The report marks judge files written before the last counted loop as **stale**. Re-run every judge before each loop.
