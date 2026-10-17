# QA rubric

The QA bot (`qa/`) scores every part of What-IF from 1 to 10 and combines the parts into one weighted overall score. **Overall ≥ 8.5 passes.** Each `npm run qa` is one loop. On a fail we fix and run it again. **After the 5th failed loop the bot stops, whatever the score, and its last report is delivered as is.**

- Rubric: `qa/rubric.json`
- Checks: `qa/checks.ts` (including the browser checks in `qa/ui-check.ts`)
- Runner: `qa/run.ts`
- Judge briefs: `qa/judges.md`
- Judge files: `qa/judge/` (format in `qa/judge/README.md`)
- Loop state: `qa/state.json`
- Reports: `qa/reports/`

## Scoring

```
automated  = 1 + 9 × passed / total            (skipped checks are left out)
             capped at 3 when a critical check fails
judge      = mean of qa/judge/<id>.json and qa/judge/<id>.<persona>.json
             (no judge file: judge = automated, so the loop never blocks)
component  = 0.6 × automated + 0.4 × judge     (product: 0.2 × automated + 0.8 × judge)
overall    = Σ weight × component               pass: overall ≥ 8.5
```

Components are rounded to one decimal and the overall score to two. The product idea is judged mostly by people (and persona judges), so its few automated checks count for 20% of its score. To use the plain 0.6 / 0.4 there too, delete `automatedWeight` and `judgeWeight` from the product entry in `qa/rubric.json`. The PRD also asks for every component ≥ 7. The report flags components below that, but the gate is the overall score.

## Components

| # | Component | Weight | Automated checks | Judge criteria |
|---|---|---:|---|---|
| 1 | **Scenario engine (maths)**: `src/engine` | 15% | type-check; `test/engine.test.ts` (critical); the ARCHITECTURE.md API; **demo break-even: at the break-even net_test ≥ 0, one customer less < 0** (critical); price-change break-even within €1; every Figure has a source tag and a `maths` string with numbers in it, with no NaN; deterministic, with no input mutation; missing inputs give one focused question; whatChanged, planTest and compareResult work; browser-safe | the formulas match a hand calculation of the demo café; transparent maths with the owner's numbers; edge cases give plain warnings; tests pin the numbers; readable code |
| 2 | **Customer rehearsal (simulation)**: `src/sim` | 15% | type-check; `test/sim.test.ts` (critical); **a rule-based run reaches done, 6 × 4 by default, one reaction per active persona per round** (critical); distinct two-layer personas; **briefs hold the JSON schema and none of the owner's cost numbers**; rebuildRehearsal from an encoded ShareState reproduces the summary; validation rejects bad reactions and waits for a retry; deterministic; honest summary (caveat, counts never scaled up, analysis untouched); browser-safe | realistic, varied locals; a story across rounds through the feed and the diaries; plausible events; self-contained briefs; descriptive, honest summary; MiroFish ideas without AGPL code |
| 3 | **Public MCP server and build**: `src/mcp`, `scripts`, `src/state.ts` | 15% | type-check; `test/mcp.test.ts` (critical); ShareState round-trip, fragment links, plain errors, short links; **`npm run build`** (critical); the Vercel function is complete, self-contained (imported from a copy outside the repo) and answers MCP; on the live dev server: **initialize** (critical), **every tool listed, whatif_start says "what if", the what-if prompt** (critical), run_scenarios returns text, structuredContent and a decodable `/r#` link; stateless rehearsal start → submit → autoplay; helpful errors with no 500s (missing input, unknown template, bad JSON, 2 MB body); CORS; a friendly GET page; the stdio server | descriptions that make the right call obvious; inputs a model can fill from chat; text-first results with a report link; safe as a public endpoint; errors that say what to ask; bundle and stdio parity |
| 4 | **Visual report and website**: `src/report`, `site` | 20% | type-check (site/ included); `test/report.test.ts` (critical); six steps; source chips (≥ 4 of 5 in the demo, "Your number" for the owner's own numbers); a labelled slider; "show the maths" toggles, with the maths strings present; the caveat and the "can and cannot tell you" box; a privacy card; **no external scripts, styles, fonts or images**; **text from the link is HTML-escaped** (critical); browser-safe; built pages (index, r, connect, `assets/*.js`, lang, viewport, title, local assets resolve). **In Chromium** (`qa/ui-check.ts`): no sideways scroll at 390 px; the slider rewrites "Why this changed" (twice); dark mode with contrast ≥ 4.5 (light too); one h1 per page; named controls; the report draws from its link within 2 s; no script errors or failed loads; the landing page links to Connect, and Connect shows the MCP URL and a working skill zip | six steps that each teach one idea; honest, readable charts; a slider that explains the mechanism; a landing page that teaches in a minute; connected in two minutes; chips and legend; rehearsal visuals; phone, dark and accessibility polish. Persona judges: Selin, a hackathon judge, an educator |
| 5 | **Skill**: `skill/what-if`, `src/mcp/instructions.ts` | 10% | **frontmatter valid for upload** (allowed keys only, name = folder, description ≤ 1024 chars, mentions "what if") (critical); body < 500 lines and contains `{{SITE_URL}}/api/mcp`; every linked reference exists, none orphaned, the five topics covered; workflow (whatif_start first, no hand-made maths, the report link, subagents, imagined, connecting, one question at a time); the built zip has `what-if/SKILL.md` and references with the URL filled in; SERVER_INSTRUCTIONS | trigger precision; coaching one question at a time with the why; never computes money; the report link at every step; rehearsal orchestration by host; connect steps per app; progressive disclosure |
| 6 | **Product idea**: vision, PRD, README, site | 15% | the theme and the target user are named in vision.md and the PRD; the README and landing page name the audience, the learning and a what-if example; the demo covers the full loop (lessons, a capped test with keep/tweak/stop, questions for real customers, learning from the result); no "will" in scenario text and no overclaiming; demo data labelled everywhere | fit with "AI education for everyone" (learning about the decision and about AI); visual, hands-on learning; honesty; more than a chatbot; feasible for a real owner; clear in 60 s. Persona judges plus the reviewer, who also writes the three refinements of the idea |
| 7 | **Docs and developer experience** | 10% | the whole repo type-checks; README, PRD, PLAN, ARCHITECTURE and this file present; **the README shows usage: a what-if example, the MCP URL, connector steps, the skill** (critical); the README has install, dev, test, build and qa commands; every documented command exists; every package.json script target exists; the code matches the ARCHITECTURE.md layout; **no secrets or .env files** (critical); .gitignore covers node_modules, .vercel and the UI screenshots; the lockfile is committed | 60-second understanding; complete, honest setup on Windows and Unix; docs match the code; structure; a reproducible QA bot |

The bot lists every check with its id, component, critical flag and reproduce command:

```
node --import tsx qa/run.ts --list
```

## Judges

Judges are Claude reviewer subagents (or a human) that read the code, the last report, the screenshots and the page text. Each writes `{ "score": 1–10, "notes": "…", "improvements": ["…"] }` to `qa/judge/`.

- **One reviewer per component** writes `qa/judge/<id>.json`. Its brief is in `qa/judges.md` §5.
- **Persona judges for product and visual** write `qa/judge/product.<persona>.json` and `qa/judge/visual.<persona>.json`. The personas (§6):
  - **Selin**: owner of a small Neukölln café, with no finance background. She reads the demo report on her phone and says what she understood, what confused her and whether she would try the test.
  - **A hackathon judge** for "AI education for everyone". Does the owner learn something transferable about AI and about the decision? Is the learning visual?
  - **A learning-design educator**: scaffolding, cognitive load, and misconceptions about AI predictions.
- **Refine the idea** (§7): the product reviewer proposes the three highest-impact improvements to the idea itself and writes them to `qa/judge/refine.json`. It is not scored; it is listed in the report.

Judge files written before the last counted loop are marked **stale** in the report. Re-run the judges before every loop.

## Loop rules

1. `npm run qa` runs every check, merges the judge files and writes `qa/reports/loop-N.json` and `qa/reports/latest.md`. It records the loop in `qa/state.json`.
2. Overall ≥ 8.5: **PASS**.
3. Otherwise **FAIL**: fix what the report lists (failing checks first, critical ones at the top, each with its reproduce command; then the biggest gains and the judges' improvements), re-run the judges, and run the next loop.
4. After the **5th failed loop** the bot sets `stopped` in `qa/state.json` and marks the report as final. Further `npm run qa` calls refuse to run. To start a new series, delete `qa/state.json`.
5. **Dry runs never count:** `npm run qa:dry` (= `--no-loop`) and any `--only` run write `qa/reports/dry-run.json` and `qa/reports/dry-run.md`. They work even after the bot has stopped.

## How to run

```
npm run qa:dry                          # dry run: every check, nothing counted
npm run qa                              # one counted loop
npm run qa -- --only visual             # one component (never counted)
npm run qa -- --skip build,ui-names     # skip checks by id, or a whole component by its id
node --import tsx qa/run.ts --list      # list the checks
node --import tsx qa/ui-check.ts        # the browser checks alone (starts scripts/dev.mjs on a free port)
node --import tsx qa/ui-check.ts --url http://localhost:3000   # against a running server
```

What the bot needs:

- **Node 18 or newer** and `npm install`. Everything else runs in-process or as a child process, with timeouts. A module that does not exist yet fails its checks with a plain reason instead of crashing the run.
- **The dev server:** `scripts/dev.mjs` is started once per run on a free port (`PORT`) and stopped at the end. When the build check succeeded, the server reuses that build (`--no-build`).
- **The browser checks** need Playwright: `playwright@1.56.1` as a devDependency (Chromium build 1194). Without it, each `ui-*` check fails with the install command. `UI_CHROMIUM` can point at a Chromium binary, and `QA_PLAYWRIGHT_MODULE` at a playwright package folder elsewhere on disk.

Outputs:

- `qa/reports/latest.md` (or `dry-run.md`): the table, warnings, failing checks with their commands, the biggest gains, the judges' notes and improvements, the refinements and the loop history.
- `qa/reports/loop-N.json` (or `dry-run.json`): the same data as JSON.
- `qa/reports/ui/` (ignored by git): screenshots at desktop, phone and dark, the visible text of each page, and `report-static.html`, all for the judges.

Machine paths are replaced with `<repo>` and `<home>` in the reports.
