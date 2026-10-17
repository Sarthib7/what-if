# What-IF — build plan

Built on 17 Oct 2026 by six parallel agents against [`ARCHITECTURE.md`](ARCHITECTURE.md), then integrated and scored by the QA bot. Product requirements: [`PRD.md`](PRD.md).

## Decisions made

| Decision | Why |
|---|---|
| **Skill + public remote MCP + website**; no plugin publishing yet | No time to publish a plugin. A remote MCP works in every chat app, and the skill adds the coaching layer where skills exist |
| **Stateless server**: state travels as a token, reports in the URL fragment | Vercel functions are stateless; no database to set up; strongest privacy story ("nothing is stored") |
| **Deterministic engine in TypeScript, shared by server and browser** | One source of truth for the maths; the report page recomputes from inputs, so links stay small |
| **Rehearsal = MiroFish ideas at café scale** (6 personas, 4 rounds, a feed, a diary, events, an interview) | Keeps what is educational and visual and drops what is heavy (Zep, GraphRAG, 72 rounds, two platforms). See `research/mirofish-notes.md` |
| **Host decides who plays the customers**: parallel subagents → in-context → rule-based | "Depends on the agent the user is using": Claude Code/Cowork fan out; other chats role-play; no model still works |
| **"what if" is the trigger** | Skill description + `whatif_start` tool description + server instructions all say: call this first when the user says "what if…" |
| **Two templates**: lunch offer (demo) and price change | The vision's MVP question, plus one more to show it generalises |
| **MCP SDK v1** (`@modelcontextprotocol/sdk` 1.32.1) | Stable; pairs with MCP Apps if we add inline UI later |
| **Vercel Build Output API** (esbuild → `.vercel/output`) | Deterministic bundling of TypeScript with `.ts` imports; no framework needed |
| **QA bot** with the team's rule: each part 1–10, pass ≥ 8.5, stop after the 5th failed loop | Objective quality gate; judges include a café-owner persona to refine the idea |

## Work split (parallel)

| Agent | Owns | Done when |
|---|---|---|
| Engine | `src/engine/*` (analysis, experiment, compare), `test/engine.test.ts` | demo numbers hand-checked; break-even invariant holds; deterministic |
| Rehearsal | `src/sim/*`, `test/sim.test.ts` | rule-based run completes; validation; rebuild from state; briefs self-contained |
| Report + site | `src/report/*`, `site/**`, `test/report.test.ts` | six visual steps; slider re-explains; works at 390 px and in dark mode |
| MCP + build | `src/mcp/{tools,http,stdio}.ts`, `scripts/*`, `vercel.json`, `package.json`, `test/mcp.test.ts` | 11 tools over HTTP; `.vercel/output` builds; dev server on :3000 |
| Skill + guidance | `skill/what-if/**`, `src/mcp/instructions.ts`, `README.md` | the skill triggers on "what if"; connect steps for each app |
| QA bot | `qa/*`, `docs/QA-RUBRIC.md` | dry run scores every component |

Lead (integration): contract and shared types (`src/engine/types.ts`, `src/sim/types.ts`, `src/state.ts`, templates and inputs), PRD and plan, integration, QA loops, commits.

## Milestones

1. **Initial commit:** vision, PRD, plan, architecture, research notes, shared types and templates.
2. **Modules land:** engine, rehearsal, report and site, MCP and build, skill, QA bot.
3. **Integration:** `npm run build && npm test`; local dev server; demo report; MCP smoke from a real client.
4. **QA loops:** run `npm run qa`; judges (Claude subagents, including the café-owner persona) score and propose improvements; fix; repeat until ≥ 8.5 (max 5 failed loops).
5. **Deploy:** import the repo in Vercel (no settings needed), or run `vercel --prod`. Set `WHATIF_SITE_URL` if a custom domain is used. Paste `https://<site>/api/mcp` into Claude as a custom connector and say "what if…".

## Later (after the hackathon)

- MCP Apps view so Claude Desktop and claude.ai draw the report inline in the chat.
- The plugin packaging (`.claude-plugin`, marketplace) around the same skill, plus a `whatif-customer` subagent definition.
- More templates: opening hours, hiring a part-timer, a loyalty card.
- Import a German till export (DSFinV-K) so the owner's real numbers arrive in one upload.
- An optional account, to keep the test history and calibrate guesses across tests.

---

## v0.2 — Berlin closed beta

Planned on 17 Oct 2026 after QA loop 1, and built by seven parallel agents against the "Berlin closed beta (v0.2)" section of [`ARCHITECTURE.md`](ARCHITECTURE.md). Product scope, the public facts with sources, the judges' findings and the success measures: [`PRD.md` §12](PRD.md#12-v02--berlin-closed-beta).

### Decisions made

| Decision | Why |
|---|---|
| **Berlin cafés first, as a closed beta with invite codes** (`WHATIF_BETA_CODES`; unset = open) | Loop 1 had no real owner. Ten invited cafés in one city can show whether owners understand, test and come back; codes keep the beta small without accounts or storage |
| **Four languages: German (default), English, Spanish, Polish** | The owners we are inviting speak them; every module keeps its strings in its own catalog (`src/i18n`), English complete as the fallback |
| **Prices incl. VAT, maths on net prices; staff cost as hours × cost per hour** | Owners know the price on the board, not the net price; VAT (7% food since 1 Jan 2026, 19% drinks) and the €13.90 minimum wage are dated public facts with sources, shown in a "Berlin facts used" card |
| **Kiez and Berlin events only in the rehearsal** | They make the imagined customers concrete without pretending to be statistics; never in the maths |
| **`/try` for owners without an AI app** | Selin (the café-owner persona) could not get her own numbers in without "Developer mode"; `/try` builds the same report in the browser |
| **Near misses answered, not forced** (`template: null`); **hiring and opening hours "not yet"** | The skill and MCP judges found the rain, the rent and the part-timer squeezed into the lunch template; honesty about scope is part of the lesson |
| **The model writes numbers plainly and reads them back** | "1.500 €" must become 1500, and the owner should see that it did |
| **Skill: about 140 lines plus references** | Progressive disclosure; the Berlin facts, both example dialogues and the by-hand path live in `references/` |
| **Recruit around one dated decision**: the minimum wage step to €14.60 on 1 Jan 2027 (price-change template) | A real, dated question every owner with staff faces; shown as a fact, never as pricing advice |

### Work split (parallel)

| Area | v0.2 deliverable | Done when |
|---|---|---|
| Languages | `src/i18n` (written first) | `Lang`, `makeT`, plurals, locales; every module has its own catalog |
| Engine | `vat_rate`, staff hours × hourly cost, `kiez`, `Analysis.facts`, German number parsing, honest worst case, sunk-cost-free decision rule, formatting by language | the demo recomputes in all four languages; "1.500 €" parses as 1500; each fact has a source and date |
| Rehearsal | Kiez-based persona mix, `BERLIN_EVENTS`, briefs that ask for answers in the analysis language, a caveat that follows the method | a rule-based run completes in each language; no "played by an AI" when no AI played |
| Report | "Berlin facts used" card, language switcher, "who did what" line | the same link renders in DE · EN · ES · PL with the numbers recomputed |
| Site | beta badge, invite-code check, `/try` wizard, starter prompts on the Connect page | an owner reaches her own report from her phone without an AI app |
| MCP + build | invite codes (`?code=`, header, Bearer; 401 in DE/EN), `lang` on every tool, `template: null` for near misses, `{{BETA_CONTACT}}` templating, `.env.example` | a wrong code gets 401; `GET /api/mcp?code=` reports `valid`; the skill zip points at an https site |
| Skill + docs | `skill/what-if/**` (four-language triggers, near-miss rule, read-backs, Berlin, by-hand path, price-change example, `references/berlin.md`), `src/mcp/instructions.ts`, README, PRD and PLAN v0.2 sections | SKILL.md ≤ 160 lines; instructions ≤ ~2,800 characters; README leads with the beta and has the env vars |
| QA bot | checks for languages, codes, `/try`, the skill zip URL; judges re-run | loop 2 scores every component |

Lead: contract (ARCHITECTURE v0.2 section, shared types), `LICENSE`, `.gitattributes`, integration, QA loops, commits.

### Milestones

1. **Contract:** ARCHITECTURE v0.2 section, `src/i18n`, shared type additions (`Analysis.lang`, `Analysis.facts`, `ShareState.lang`). Done.
2. **Modules land:** engine, rehearsal, report, site, MCP + build, skill + docs, QA checks.
3. **Integration:** `npm run typecheck && npm test && npm run build`; local dev server with and without `WHATIF_BETA_CODES`; the demo in four languages; one "was wäre, wenn…" conversation end to end in a real client.
4. **QA loop 2:** `npm run qa:dry` while fixing, then one counted `npm run qa`; the same rule (each part 1–10, pass ≥ 8.5, stop after the fifth failed loop).
5. **Deploy:** Vercel with `WHATIF_SITE_URL`, `WHATIF_BETA_CODES` (one code per café) and `WHATIF_BETA_CONTACT`; check `https://<site>/api/mcp?code=<code>` says valid; put the live links at the top of the README.
6. **Beta wave 1 (before 1 Jan 2027):** German invite cards with the question, `/try` and a personal code; one 30-minute session per café in German on the owner's phone with her Z-report; at least 3 cafés on `/try` alone; consented, dated notes.
7. **Review:** the success measures in PRD §12.5, as counts of cafés; decide what v0.3 builds.

### Later (after the beta)

- Model hiring and opening hours properly (today: the method on paper).
- A calendar file (.ics) for the test's check-in days, generated in the browser.
- A "log your result" screen at the end of `/try`, so owners without an AI app close the loop too.
- What the minimum-wage step could cost a week, beside the price-change result (tagged as a guess until checked against payroll).
- More cities and kinds of business, once the Berlin beta shows owners come back.
