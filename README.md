# What-IF

**Rehearse a business decision before you spend money.**

What-IF helps independent café owners try out a decision before it costs them anything. Say "what if…" to the AI you already use. What-IF asks for a few of your own numbers, one at a time, and works out the break-even, the worst case and three possible outcomes with transparent maths. It can rehearse the idea with a handful of imagined customers, and it ends with a small, cheap test you could start on Monday. Every step opens as a visual report that teaches as it explains: what drives the result, which numbers are facts and which are guesses, and how to find out cheaply.

> Small businesses don't need another dashboard full of numbers. They need to know what to try next. What-IF helps independent café owners use AI to explore a decision before they spend money. Ask, "What if I run a weekday lunch offer?" and compare a few possible outcomes using simple business numbers. What-IF explains what drives each scenario, lets the owner test an assumption, and suggests a low-risk next step. It doesn't claim to predict the future. It helps owners understand their options and make a more informed move.

Built for the hackathon theme **AI education for everyone**. The audience is small-business owners: no analyst, no finance team, often no AI experience.

## The 60-second demo

1. Open the site and click the demo report. It is a made-up Berlin café, Café Lindenblatt, clearly labelled as demo data.
2. Read **the one number to remember**: about 9 extra lunch customers a day for a 10-day lunch-deal test to pay for itself.
3. Drag the **break-even slider**. The sentence under it rewrites itself and explains why the result changed.
4. Tap **show the maths** on any figure. You see the formula with the café's numbers in it.
5. Scroll to the **rehearsal**: six imagined customers over four rounds, the "what a simulation can and cannot tell you" box, and the printable **test card** with its keep / tweak / stop rule.

Then try it live: connect What-IF to Claude (below) and type *"What if I run a weekday lunch offer?"*

## Use it in your AI

What-IF is a public remote MCP server. One address works in every app:

```
https://YOUR-SITE/api/mcp
```

`YOUR-SITE` is filled in after the Vercel deploy (for example `what-if.vercel.app`). The site's **Connect** page shows the real address with copy buttons.

| App | How |
|---|---|
| Claude.ai / Claude Desktop / Cowork | Settings → Connectors → **Add custom connector** → paste the URL → turn it on in the chat's tools menu |
| Claude Code | `claude mcp add --transport http what-if https://YOUR-SITE/api/mcp` |
| ChatGPT | Settings → Apps & Connectors → Advanced → **Developer mode**, then create a connector with the URL (no authentication) |
| Cursor | `.cursor/mcp.json`: `{ "mcpServers": { "what-if": { "url": "https://YOUR-SITE/api/mcp" } } }` |
| VS Code | `.vscode/mcp.json`: `{ "servers": { "what-if": { "type": "http", "url": "https://YOUR-SITE/api/mcp" } } }` |

**The skill** adds the full coaching workflow where skills exist. Download `what-if-skill.zip` from the site, then:

- Claude.ai / Desktop / Cowork: Settings → Capabilities → Skills → **Upload skill**.
- Claude Code: unzip it into `~/.claude/skills/` (you get `~/.claude/skills/what-if/SKILL.md`).

Step-by-step instructions for each app: [`skill/what-if/references/connect.md`](skill/what-if/references/connect.md).

## Just say "what if…"

- "What if I run a weekday lunch offer to bring in more customers?"
- "What if I raise the price of a flat white by 30 cents?"
- "What if I do soup and a sandwich for €9.50 at lunch?"
- "What if I put my cakes down to €3 after 4 pm?"
- "What if I open on Sunday mornings?" (What-IF says what it can model today and maps it to the closest template, openly.)
- "What if I hire a part-timer for the lunch rush?" (same)

What-IF models two decisions today, the **weekday lunch offer** and the **price change on one item**, and is honest about anything beyond them.

## How it works

```text
 "What if I run a weekday lunch offer?"
                 │
                 ▼
  whatif_start ─────────── picks a template, lists the few numbers it needs
                 │
  one question at a time ─ each with "why it matters"; rough numbers are fine
                 │
                 ▼
  engine (deterministic TypeScript, never the model)
  break-even · cautious / expected / optimistic · worst case · biggest uncertainty
                 │
                 ▼
  report_url ──► https://YOUR-SITE/r#<your numbers>
                 (the data stays after the #; the page redraws it in your browser)
                 │
  ┌──────────────┴─────────── optional: rehearse with imagined customers ──────┐
  │  whatif_rehearsal_start → briefs for round 1                               │
  │  each round:                                                               │
  │    Claude Code / Cowork:  one subagent per persona, all in parallel        │
  │    other chat apps:       the model plays each persona in turn             │
  │    no model:              simple rules (whatif_rehearsal_autoplay)         │
  │      → JSON reactions → whatif_rehearsal_submit (validated, retry one)     │
  │      → neighbourhood feed + diaries → next round                           │
  │  owner events ("it rains all week") · interview after the run              │
  └──────────────┬─────────────────────────────────────────────────────────────┘
                 ▼
  whatif_plan_test ──────── 10-day test · what to count · keep / tweak / stop
                 │
  whatif_log_result ─────── real counts vs the scenarios: what you learned
```

The server is stateless. The rehearsal travels as a compact `state` token that the AI hands back each round, so nothing is stored anywhere.

## Why it is educational

- **Four source labels on every number:** *Your number*, *A guess*, *Calculated*, *Imagined* (plus *Demo data*). The owner learns which parts of an AI answer are solid and which are guesses.
- **Show the maths:** every figure opens to its formula with the owner's own numbers written in. The AI explains; code calculates.
- **The one number to remember:** a big break-even and a slider. Move it and *Why this changed* explains the mechanism in a sentence.
- **One question at a time:** each question says why it matters, so the owner learns what drives a decision while answering.
- **The biggest uncertainty:** which guess swings the result most, and so what the test should measure.
- **An imagined-customer rehearsal, with caveats:** personas react round by round, inspired by MiroFish. Every result is tagged *Imagined*, counted as "3 of 6 imagined customers", never scaled up and never fed into the maths. It produces questions to ask real customers.
- **A test, not a verdict:** a small, reversible test with a stop rule decided in advance, then a comparison with what really happened. Guesses get better over time.

## Principles

- **Possibilities, not promises.** Ranges, not one certain outcome.
- **Constructive honesty.** Supportive, without hiding a difficult signal.
- **Evidence beside advice.** Every figure shows where it came from. No invented local statistics or competitor data.
- **Clear calculations.** Transparent, reproducible maths in code. AI explains; it does not make up financial outputs.
- **Small actions first.** Low-cost, reversible tests before big commitments.
- **Respectful use of data.** Ask only what the scenario needs. The server stores nothing.

What-IF is not a fortune teller, not a substitute for an accountant or adviser, and not financial, tax or legal advice.

## Project structure

```text
src/engine/     templates, inputs, analysis, test plan, result comparison (pure TS, browser-safe)
src/sim/        imagined-customer rehearsal: personas, rounds, validation, summary (pure TS)
src/report/     renderReport(): the visual lesson as HTML, plus slider behaviour
src/state.ts    compact share-state codec for report links and rehearsal tokens
src/mcp/        MCP tools, server instructions, HTTP handler (/api/mcp) and stdio entry
site/           landing page, connect page, report viewer (/r#…), live demo
skill/what-if/  SKILL.md + references/ (zipped to the site as what-if-skill.zip)
scripts/        build (esbuild → .vercel/output) and local dev server
test/           node:test suites
qa/             QA bot: rubric, checks, loop state
docs/           PRD, plan, architecture, research notes
```

The contract between modules is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The idea is in [`vision.md`](vision.md).

## Local development

```bash
npm install
npm run dev      # site + MCP on http://localhost:3000 (MCP at http://localhost:3000/api/mcp)
npm run build    # Vercel Build Output in .vercel/output (static site, skill zip, /api/mcp function)
npm test         # engine, rehearsal, report and MCP tests
npm run qa       # QA bot: scores every part 1–10; passes at 8.5 or more
```

To try the local MCP in Claude Code: `claude mcp add --transport http what-if-local http://localhost:3000/api/mcp`.

## Deploy to Vercel

1. Import this repository in Vercel. No settings are needed; the build writes `.vercel/output`.
2. Optional: set `WHATIF_SITE_URL` (for example `https://whatif.example.com`) if you use a custom domain. Otherwise the production Vercel URL is used.
3. Your MCP address is `https://<your-project>.vercel.app/api/mcp`. Paste it into Claude as a custom connector and say "what if…".

## Credits

- [MiroFish](https://github.com/666ghj/MiroFish) inspired the customer rehearsal: personas, activation, a feed, injected events and interviews. MiroFish is AGPL-3.0; What-IF borrows ideas only, no code or prompts. See [`docs/research/mirofish-notes.md`](docs/research/mirofish-notes.md).
- Built with the [Model Context Protocol](https://modelcontextprotocol.io) TypeScript SDK and Claude.

## License

MIT
