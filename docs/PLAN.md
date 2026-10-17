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
