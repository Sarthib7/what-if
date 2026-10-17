# QA rubric

The QA bot (`qa/`) scores every part of What-IF from 1 to 10 and combines the parts into one weighted overall score. **Overall ≥ 8.5 passes.** Each `npm run qa` is one loop. On a fail we fix and run it again. **After the 5th failed loop the bot stops, whatever the score, and its last report is delivered as is.**

- Rubric: `qa/rubric.json` (version 2: loop 2, the Berlin closed beta)
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

## Loop 2: the Berlin closed beta (v0.2)

What-IF is now a closed beta for independent cafés in Berlin, with invite codes, in German (the default), English, Spanish and Polish (`docs/ARCHITECTURE.md`, last section). Loop 2 adds checks for exactly that contract, and checks for what the loop-1 judges found and the old checks missed:

| Loop-1 finding (judges) | Check that now catches it |
|---|---|
| The skill zip points at `http://localhost:3000/api/mcp` | `skill-zip-prod-url` (a production-like build with `WHATIF_SITE_URL=https://example.vercel.app`), `skill-zip-no-placeholders` |
| "1.500 €" is read as €1.50 | `berlin-number-parsing` |
| The caveat says "played by an AI" for a rule-based run | `sim-honest-method` (all four languages, summary and report) |
| A "Your number" chip on "Check these with real customers" | `visual-checklist-chip` |
| The phone report is about 24,000 px tall | `ui-report-height` (under 14 screens of 844 px at 390 px, with sections collapsed; reports the height) |
| The landing says seven steps, the report six | `ui-landing-steps` |
| "Print this test card" prints 15 pages | `ui-print-card` (at most 2 A4 pages) |
| Dimmed landing steps at about 3.1:1 while the contrast check passed | `ui-dark-mode` now applies the opacity of the element and its parents, uses 3:1 for large text and always measures the landing's method steps |
| The evidence used a private QA rehearsal (seed 42) | every screenshot and static report is built from the shipped demo (`src/report/demo.ts` `demoState`), in each language |
| `npm test` fails on a fresh Windows clone (CRLF) | `devex-gitattributes`, `devex-crlf-tests` |
| Selin cannot use her own numbers without an AI app | `ui-try`, `ui-try-keyboard`, `ui-try-invite` |

Changed by the v0.2 contract: staff cost is `extra_staff_hours_per_day × staff_hourly_cost` (`engine-staff-hours`; the brief-privacy canary in `sim-briefs-private` uses the new keys); the English-text checks call the engine and the MCP tools with `lang: "en"`, because the default language is now German; `product-pitch-surfaces` accepts the landing page in any of the four languages; `site-pages-built` also wants `try.html`.

Judges in loop 2 also check the four languages, the Berlin facts card and the closed-beta flow, and say for each of their loop-1 improvements whether it was fixed (`loop1` in their file, `qa/judges.md` §0, §2, §9). Selin now reads German first.

## Components

| # | Component | Weight | Automated checks | Judge criteria |
|---|---|---:|---|---|
| 1 | **Scenario engine (maths)**: `src/engine` | 15% | type-check; `test/engine.test.ts` (critical); the ARCHITECTURE.md API; **demo break-even: at the break-even net_test ≥ 0, one customer less < 0** (critical); price-change break-even within €1; every Figure has a source tag and a `maths` string with numbers in it, with no NaN; deterministic, with no input mutation; missing inputs give one focused question; whatChanged, planTest and compareResult work; browser-safe. **v0.2:** `analyze(…, { lang })` sets `Analysis.lang`, translates the texts and formats money per language ("9,90 €" / "€9.90") (`engine-lang`); `src/engine/messages.ts` has every `en` key in de/es/pl; staff cost = hours × hourly cost with the €13.90 minimum-wage fallback tagged a guess, demo 1 h at €18; "1.500 €" → 1500, "9,90" → 9.9, "ca. 40" → 40 in German; VAT fallback 10.6% (lunch) / 19% (price change) tagged a guess, and more VAT leaves a smaller deal margin; `Analysis.facts` lists the VAT and minimum-wage facts with a source, an https URL and an ISO date | the formulas match a hand calculation on net prices; the public facts are right and dated; transparent maths with the owner's numbers in the owner's format; edge cases give plain warnings; tests pin the numbers; readable code |
| 2 | **Customer rehearsal (simulation)**: `src/sim` | 15% | type-check; `test/sim.test.ts` (critical); **a rule-based run reaches done, 6 × 4 by default, one reaction per active persona per round** (critical); distinct two-layer personas; **briefs hold the JSON schema and none of the owner's cost numbers**; rebuildRehearsal from an encoded ShareState reproduces the summary; validation rejects bad reactions and waits for a retry; deterministic; honest summary (caveat, counts never scaled up, analysis untouched); browser-safe. **v0.2:** `src/sim/messages.ts` complete in de/es/pl; briefs ask for answers in the analysis language and the rule-based text and caveat are translated (`sim-lang`); a rule-based run never claims an AI played the customers, in any language (`sim-honest-method`); the Kiez changes the persona mix and appears in the rehearsal, `BERLIN_KIEZE` has the 18 Kieze (`sim-kiez-mix`); `BERLIN_EVENTS` has the 8 events with texts in four languages (`sim-berlin-events`) | realistic, varied locals of the chosen Kiez; a story across rounds; plausible Berlin events; self-contained briefs in the owner's language; a descriptive, honest summary that says truthfully who played the customers; MiroFish ideas without AGPL code |
| 3 | **Public MCP server and build**: `src/mcp`, `scripts`, `src/state.ts` | 15% | type-check; `test/mcp.test.ts` (critical); ShareState round-trip, fragment links, plain errors, short links; **`npm run build`** (critical); the Vercel function is complete, self-contained (imported from a copy outside the repo) and answers MCP; on the live dev server: **initialize** (critical), **every tool listed, whatif_start says "what if", the what-if prompt** (critical), run_scenarios returns text, structuredContent and a decodable `/r#` link; stateless rehearsal start → submit → autoplay; helpful errors with no 500s (missing input, unknown template, bad JSON, 2 MB body); CORS; a friendly GET page; the stdio server. **v0.2:** tools take `lang`, the default answer is German and the report link carries the language (`mcp-lang`); on a second dev server with `WHATIF_BETA_CODES=test-code-123`: POST without a code → 401 with a German + English message naming the contact, a wrong code → 401, `?code=`, `x-whatif-code` and `Authorization: Bearer` → 200, GET `?code=` → `beta.valid`, the code never echoed or logged (`mcp-beta-codes`); without the variable the server stays open (`mcp-beta-open`) | descriptions that make the right call obvious and pass the owner's language; inputs a model can fill from chat; text-first results with a report link; safe as a public endpoint, invite codes included; errors that say what to ask; bundle and stdio parity |
| 4 | **Visual report and website**: `src/report`, `site` | 20% | type-check (site/ included); `test/report.test.ts` (critical); six steps; source chips (≥ 4 of 5 in the demo, "Your number" for the owner's own numbers); a labelled slider; "show the maths" toggles, with the maths strings present; the caveat and the "can and cannot tell you" box; a privacy card; **no external scripts, styles, fonts or images**; **text from the link is HTML-escaped** (critical); browser-safe; built pages (index, r, connect, try, `assets/*.js`, lang, viewport, title, local assets resolve). **v0.2, static:** the shipped demo renders six steps in de/en/es/pl and the German render has no English UI phrases in its text or aria-label/title/alt (`visual-langs`); no "Your number" chip on the real-customer questions; a "Berlin facts used" card with each source, link and date; `src/report/messages.ts` and `site/src/messages.ts` complete; no `{{PLACEHOLDER}}` left in the built site. **In Chromium** (`qa/ui-check.ts`): no sideways scroll at 390 px; the slider rewrites "Why this changed" (twice, in the report's language); dark mode with contrast ≥ 4.5 (3 for large text), opacity included, the landing's method steps included (light too); one h1 per page; named controls; the report draws from its link within 2 s; no script errors or failed loads; the landing page links to Connect, and Connect shows the MCP URL and a working skill zip. **v0.2:** a DE · EN · ES · PL switcher on landing, connect, try and report, and EN re-renders the German report in English; the German demo report has `html lang="de"` and no English UI phrases; the phone report is under 14 screens with sections collapsed (the height is reported); the landing counts the report's six steps; the printed test card is at most 2 A4 pages; `/try` shows its first question, can be finished with the keyboard alone and ends on a drawn report; on the beta server `/try` asks for the invite code, refuses a wrong one, accepts the right one, remembers it, and `/connect` then shows the personal `…/api/mcp?code=` URL | six steps that each teach one idea, in four languages; honest, readable charts; a slider that explains the mechanism; the facts card; a landing page that teaches in a minute; from invite code to own report without help; chips and legend; rehearsal visuals; phone, dark, print and accessibility polish. Persona judges: Selin (reads German first), a hackathon judge, an educator |
| 5 | **Skill**: `skill/what-if`, `src/mcp/instructions.ts` | 10% | **frontmatter valid for upload** (allowed keys only, name = folder, description ≤ 1024 chars, mentions "what if") (critical); body < 500 lines and contains `{{SITE_URL}}/api/mcp`; every linked reference exists, none orphaned, the five topics covered; workflow (whatif_start first, no hand-made maths, the report link, subagents, imagined, connecting, one question at a time); the built zip has `what-if/SKILL.md` and references with the URL filled in; SERVER_INSTRUCTIONS. **v0.2:** no `{{` left in the built zip (`skill-zip-no-placeholders`); a production-like build (`WHATIF_SITE_URL=https://example.vercel.app`, built in a scratch copy) gives https MCP URLs on that host, never localhost (`skill-zip-prod-url`) | trigger precision; coaching one question at a time with the why, in the owner's language; never computes money; the report link at every step; rehearsal orchestration by host; connect steps per app with the invite code; progressive disclosure |
| 6 | **Product idea**: vision, PRD, README, site | 15% | the theme and the target user are named in vision.md and the PRD; the README and landing page (any of the four languages) name the audience, the learning and a what-if example; the demo covers the full loop (lessons, a capped test with keep/tweak/stop, questions for real customers, learning from the result); no "will" in scenario text and no overclaiming; demo data labelled everywhere | fit with "AI education for everyone" (learning about the decision and about AI); the Berlin focus and the closed beta; visual, hands-on learning; honesty; more than a chatbot; feasible for a real owner with her own numbers; clear in 60 s. Persona judges plus the reviewer, who also writes the three refinements of the idea |
| 7 | **Docs and developer experience** | 10% | the whole repo type-checks; README, PRD, PLAN, ARCHITECTURE and this file present; **the README shows usage: a what-if example, the MCP URL, connector steps, the skill** (critical); the README has install, dev, test, build and qa commands; every documented command exists; every package.json script target exists; the code matches the ARCHITECTURE.md layout; **no secrets or .env files** (critical); .gitignore covers node_modules, .vercel and the UI screenshots; the lockfile is committed. **v0.2:** `.gitattributes` gives text files eol=lf (`git check-attr`); the tests pass on a CRLF copy of the repo as they do on an LF copy (`devex-crlf-tests`: only failures that CRLF adds count) | 60-second understanding, the closed beta included; complete, honest setup on Windows and Unix; docs match the code; structure; a reproducible QA bot |

The bot lists every check (106 in loop 2) with its id, component, critical flag and reproduce command:

```
node --import tsx qa/run.ts --list
```

## Judges

Judges are Claude reviewer subagents (or a human) that read the code, the last report, the screenshots and the page text. Each writes `{ "score": 1–10, "notes": "…", "improvements": ["…"], "loop1": [ … ] }` to `qa/judge/`.

- **One reviewer per component** writes `qa/judge/<id>.json`. Its brief is in `qa/judges.md` §5.
- **Persona judges for product and visual** write `qa/judge/product.<persona>.json` and `qa/judge/visual.<persona>.json`. The personas (§6):
  - **Selin**: owner of a small Neukölln café, with no finance background. **She reads German first.** She has an invite code and no AI app: she goes through `/try` on her phone, reads the German demo report and says what she understood, what confused her (in the words she read), whether any English was left, and whether she would try the test.
  - **A hackathon judge** for "AI education for everyone". Does the owner learn something transferable about AI and about the decision? Is the learning visual? Does the Berlin closed beta make the impact credible?
  - **A learning-design educator**: scaffolding, cognitive load (in German as much as in English), and misconceptions about AI predictions.
- **Loop-1 follow-up** (§9): every judge reads its loop-1 file first and lists each of its loop-1 improvements in `loop1` with `fixed`, `partly`, `not fixed` or `no longer applies`, and the evidence. The report shows the counts and warns about files without `loop1`.
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
node --import tsx qa/ui-check.ts        # the browser checks alone (starts scripts/dev.mjs and a beta server on free ports)
node --import tsx qa/ui-check.ts --url http://localhost:3000   # against a running server (the beta checks are then skipped as failing)
```

What the bot needs:

- **Node 22 or newer** and `npm install`. Everything else runs in-process or as a child process, with timeouts. A module that does not exist yet, or does not load while someone is changing it, fails its checks with a plain reason instead of crashing the run.
- **The dev servers:** `scripts/dev.mjs` is started once per run on a free port (`PORT`, with `WHATIF_BETA_CODES` removed from its environment so it is open) and stopped at the end. When the build check succeeded, the server reuses that build (`--no-build`). The closed-beta checks start a second `scripts/dev.mjs --no-build` with `WHATIF_BETA_CODES=test-code-123` and `WHATIF_BETA_CONTACT=beta-qa@example.org` (test values, not real codes).
- **Scratch copies:** the production-like build (`skill-zip-prod-url`) and the LF/CRLF test runs (`devex-crlf-tests`) copy `src`, `site`, `skill`, `scripts`, `test`, `package.json` and `tsconfig.json` to `node_modules/.cache/what-if-qa/` (packages resolve from the repo's `node_modules`; git and tsc ignore it) and delete them afterwards. The real `.vercel/output` is never rebuilt by them.
- **The build check rebuilds `.vercel/output`** (`npm run build` deletes it first). A dev server someone else is running from it sees the new build, or none if the build fails.
- **The browser checks** need Playwright: `playwright@1.56.1` as a devDependency, then `npx playwright install chromium` (Chromium build 1194). Without it, each `ui-*` check fails with the install command. `UI_CHROMIUM` can point at a Chromium binary, and `QA_PLAYWRIGHT_MODULE` at a playwright package folder elsewhere on disk. `ui-print-card` uses `page.pdf()`, which needs headless Chromium (the default).

Outputs:

- `qa/reports/latest.md` (or `dry-run.md`): the table, warnings, failing checks with their commands, the biggest gains, the judges' notes, improvements and loop-1 follow-up, the refinements and the loop history.
- `qa/reports/loop-N.json` (or `dry-run.json`): the same data as JSON.
- `qa/reports/ui/` (ignored by git), all from the shipped demo (`src/report/demo.ts`), German first: screenshots of landing, connect, try and report at desktop, phone and dark; `report-en|es|pl-phone.png` and `.txt`; `report-slider-moved.png`, `report-phone-collapsed.png`, `report-switched-en.txt`; `try-walkthrough.txt` and `try-done-report.png` (the keyboard run); `try-beta-code.png`, `try-beta-first-question.png`, `connect-beta.txt` and `connect-beta-phone.png` (the closed beta); the visible text of each page; and `report-static.html` (en) and `report-static.de|es|pl.html`, all for the judges.

Machine paths are replaced with `<repo>` and `<home>` in the reports.
