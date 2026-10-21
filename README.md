# What-IF

**Closed beta for Berlin cafés · Deutsch · English · Español · Polski**

**Rehearse a business decision before you spend money.**

> **Live:** (after deploy: the site, the demo report and `https://<site>/api/mcp`).
> **No deploy yet?** `npm ci && npm run dev` → open http://localhost:3000 → click **Demo ansehen** (English: **See the demo**).

What-IF helps independent café owners in Berlin try out a decision before it costs them anything. Say "what if…" (or "was wäre, wenn…", "¿y si…?", "co jeśli…") to the AI you already use. What-IF asks for a few of your own numbers, one at a time, and works out the break-even, the worst case and three possible outcomes with transparent maths. It can rehearse the idea with a handful of imagined customers from your Kiez, and it ends with a small, cheap test you could start on Monday. Every step opens as a visual report that teaches as it explains: what drives the result, which numbers are facts and which are guesses, and how to find out cheaply. The report, the questions and the coaching come in German (the default), English, Spanish or Polish.

> Small businesses don't need another dashboard full of numbers. They need to know what to try next. What-IF helps independent café owners use AI to explore a decision before they spend money. Ask, "What if I run a weekday lunch offer?" and compare a few possible outcomes using simple business numbers. What-IF explains what drives each scenario, lets the owner test an assumption, and suggests a low-risk next step. It doesn't claim to predict the future. It helps owners understand their options and make a more informed move.

Built for the hackathon theme **AI education for everyone**. The audience is small-business owners: no analyst, no finance team, often no AI experience.

## The 60-second demo

1. **Landing page** (`/`): what What-IF does, step by step, with the "Closed beta · Berlin" badge.
2. **Demo report** (click **Demo ansehen**, in English **See the demo**): Café Lindenblatt, a made-up café in Berlin-Neukölln, clearly labelled as demo data.
   - Read **the one number to remember**: the extra lunch customers a day a 10-day lunch-deal test needs to pay for itself.
   - Drag the **break-even slider**. The sentence under it rewrites itself and explains why the result changed.
   - Tap **show the maths** on any figure: the formula with the café's numbers in it, prices net of VAT.
   - Check **Berlin facts used**: VAT (7% on food since 1 Jan 2026, 19% on drinks) and the €13.90 minimum wage, each with its source and date.
   - Scroll to the **rehearsal** (six imagined customers over four rounds, and what a simulation can and cannot tell you) and the printable **test card** with its keep / tweak / stop rule.
   - Switch **DE · EN · ES · PL** at the top: the same link, redrawn in another language.
3. **Try with your numbers** (`/try`, needs an invite code): one question per screen, in your language, with "why it matters" on each. It ends in your own report. No AI app needed.

Then try it live in your AI app (below) and type *"Was wäre, wenn ich einen Mittagstisch anbiete?"* or *"What if I run a weekday lunch offer?"*

## For judges

The demo reports and every report link (`/r#…`) need no code: open the site and click **Demo ansehen** (English: **See the demo**), or go straight to one of the four demos:

- `/r#demo`: the weekday lunch deal at Café Lindenblatt (demo data), all six steps.
- `/r#demo-price`: a price change on one item, the flat white from €3.90 to €4.20.
- `/r#demo-result`: the same lunch deal after the test, with made-up counts next to the three guesses.
- `/r#demo-ai`: the lunch deal's rehearsal as played by Claude subagents, one per imagined customer, saved and labelled as an AI-played rehearsal.

`/try` and the MCP connector need an invite code while the beta is closed; a judges' code comes with the hackathon submission and is never committed to this repo.

## Getting an invite

What-IF is a closed beta for independent cafés in Berlin. Each café gets a personal invite code.

- Ask the person who told you about What-IF, or use **Request an invite** (German: **Einladung anfragen**) on the site's Connect page (it shows the beta contact when one is set).
- Your code goes into your AI app's connector address as `?code=YOUR-CODE`, and into `/try`. The site remembers it in your browser only.
- Report links (`/r#…`) need no code. They carry their own numbers, so you can share them, for example with your Steuerberater.

## Use it in your AI

Your personal MCP address (a remote MCP server over Streamable HTTP):

```
https://<site>/api/mcp?code=YOUR-CODE
```

The site's **Connect** page (`/connect`) builds it from your code, with copy buttons. Opening it in a browser shows a JSON info page: `"valid": true` means the code works. Without a valid code the server still connects and lists its tools, but every tool call answers with a tool error that says, in German and English, that What-IF is a closed beta for Berlin cafés and how to ask for a code; the sign-in paths answer 404 and nothing answers 401, so AI apps don't start a sign-in. If your app asks you to sign in or says unauthorised, the link is missing your invite code: use `https://<site>/api/mcp?code=YOUR-CODE`.

| App | How |
|---|---|
| Claude.ai / Claude Desktop / Cowork | Settings → Connectors → **Add custom connector** → paste the address → turn it on in the chat's tools menu |
| Claude Code | `claude mcp add --transport http what-if "https://<site>/api/mcp?code=YOUR-CODE"` (keep the quotes), or `claude mcp add --transport http what-if https://<site>/api/mcp --header "x-whatif-code: YOUR-CODE"` |
| ChatGPT | Settings → Apps & Connectors → Advanced → **Developer mode**, then create a connector with the address (no authentication) |
| Cursor | `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project): `{ "mcpServers": { "what-if": { "url": "https://<site>/api/mcp?code=YOUR-CODE" } } }` |
| VS Code | `.vscode/mcp.json`: `{ "servers": { "what-if": { "type": "http", "url": "https://<site>/api/mcp?code=YOUR-CODE" } } }` |
| Any MCP client | the address above, or the plain `/api/mcp` with header `x-whatif-code: YOUR-CODE` or `Authorization: Bearer YOUR-CODE` |

**The skill** adds the full coaching workflow where skills exist. Download `what-if-skill.zip` from the site, then:

- Claude.ai / Desktop / Cowork: Settings → Capabilities → Skills → **Upload skill** (don't unzip it).
- Claude Code: unzip it into `~/.claude/skills/` so you get `~/.claude/skills/what-if/SKILL.md`. On Windows: `Expand-Archive what-if-skill.zip -DestinationPath "$HOME\.claude\skills" -Force`.

**No skills in your app** (ChatGPT, Cursor, VS Code…)? Paste the starter prompt from the Connect page, in German, English, Spanish or Polish, or pick the server's `what-if` prompt if your app lists MCP prompts. **No AI app at all?** Use `/try`.

Step-by-step instructions for each app and the four starter prompts: [`skill/what-if/references/connect.md`](skill/what-if/references/connect.md).

## Just say "what if…"

- "Was wäre, wenn ich den Flat White von 3,90 € auf 4,20 € erhöhe?"
- "What if I run a weekday lunch offer to bring in more customers?"
- "¿Y si hago un menú del día por 9,90 €?"
- "Co jeśli obniżę cenę ciasta do 3 € po 16:00?"
- "Was wäre, wenn ich meine Preise anpasse, weil der Mindestlohn 2027 auf 14,60 € steigt?" (a price change; the wage rise is a dated fact, never pricing advice)
- "What if I open on Sunday mornings?" or "What if I hire a part-timer?" What-IF says honestly that it cannot model these yet and walks through the method on paper.
- "What if it rains all week?" That is not the owner's decision, so What-IF answers briefly and asks what the owner might do about it.

What-IF models two decisions today, a **fixed-price offer** (the weekday lunch deal) and a **price change on one item**, and is honest about anything beyond them. Prices are what customers pay, including VAT; staff cost is extra hours a day × cost per hour.

## How it works

```text
 "Was wäre, wenn ich einen Mittagstisch anbiete?"      (de · en · es · pl)
                 │
                 ▼
  whatif_start ─────────── picks a template (or none, for a near miss), lists the few numbers it needs
                 │
  one question at a time ─ each with "why it matters"; rough numbers are fine; read back
                 │
                 ▼
  engine (deterministic TypeScript, never the model)
  net prices (VAT) · break-even · cautious / expected / optimistic · worst case · biggest uncertainty
                 │
                 ▼
  report_url ──► https://<site>/r#<your numbers>
                 (the data stays after the #; the page redraws it in your browser, in your language)
                 │
  ┌──────────────┴─────────── optional: rehearse with imagined customers ──────┐
  │  whatif_rehearsal_start → briefs for round 1 (cast fits your Kiez)         │
  │  each round:                                                               │
  │    Claude Code / Cowork:  one subagent per persona, all in parallel        │
  │    other chat apps:       the model plays each persona in turn             │
  │    no model:              simple rules (whatif_rehearsal_autoplay)         │
  │      → JSON reactions → whatif_rehearsal_submit (validated, retry one)     │
  │      → neighbourhood feed + diaries → next round                           │
  │  Berlin events (BVG strike, a week of rain…) · interview after the run     │
  └──────────────┬─────────────────────────────────────────────────────────────┘
                 ▼
  whatif_plan_test ──────── 10-day test · what to count · keep / tweak / stop · cost cap
                 │
  whatif_log_result ─────── real counts vs the scenarios: what you learned
```

The server is stateless. The rehearsal travels as a compact `state` token that the AI hands back each round, so nothing is stored anywhere.

## Why it is educational

- **Four source labels on every number:** *Your number*, *A guess*, *Calculated*, *Imagined* (plus *Demo data*). The owner learns which parts of an AI answer are solid and which are guesses.
- **Show the maths:** every figure opens to its formula with the owner's own numbers written in. The AI explains; code calculates.
- **Dated public facts, with sources:** VAT and the minimum wage are the only outside facts, each shown with its source and date. No invented local statistics.
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
- **Respectful use of data.** Ask only what the scenario needs. The server stores nothing; invite codes are never logged.

What-IF is not a fortune teller, not a substitute for a Steuerberater, accountant or adviser, and not financial, tax or legal advice.

## Project structure

```text
src/engine/     templates, inputs, VAT and staff-hours maths, test plan, result comparison (pure TS, browser-safe)
src/sim/        imagined-customer rehearsal: personas, Kiez, rounds, Berlin events, validation, summary (pure TS)
src/report/     renderReport(): the visual lesson as HTML, plus slider behaviour
src/i18n/       languages (de, en, es, pl): translator, plurals, locales
src/state.ts    compact share-state codec for report links and rehearsal tokens
src/mcp/        MCP tools, server instructions, HTTP handler (/api/mcp, invite codes) and stdio entry
site/           landing page, connect page, /try wizard, report viewer (/r#…)
skill/what-if/  SKILL.md + references/ (zipped to the site as what-if-skill.zip)
scripts/        build (esbuild → .vercel/output) and local dev server
test/           node:test suites
qa/             QA bot: rubric, checks, judge verdicts, loop state
docs/           PRD, plan, architecture, research notes
```

The contract between modules is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The idea is in [`vision.md`](vision.md).

## Local development

Needs **Node 22 or newer** (the test runner's globbing, `fs.watch` in watch mode and the Vercel function all assume it).

```bash
npm install          # or npm ci for a clean install
npm run dev          # site + MCP on http://localhost:3000 (MCP at http://localhost:3000/api/mcp)
npm run dev:watch    # the same, rebuilding on changes
npm run build        # Vercel Build Output in .vercel/output (static site, skill zip, /api/mcp function) + dist/whatif-stdio.mjs
npm run typecheck    # tsc --noEmit over the whole repo
npm test             # engine, rehearsal, report and MCP tests
```

Locally the beta is open: with `WHATIF_BETA_CODES` unset, no code is needed. To try the closed beta, set codes before `npm run dev` (Git Bash: `export WHATIF_BETA_CODES="BERLIN-CAFE-01"`; PowerShell: `$env:WHATIF_BETA_CODES = "BERLIN-CAFE-01"`). All settings are listed in [`.env.example`](.env.example).

**Try the MCP locally**

- Over HTTP: `claude mcp add --transport http what-if-local http://localhost:3000/api/mcp` (add `?code=…` if you set codes).
- Over stdio: `npm run build && claude mcp add what-if-stdio -- node dist/whatif-stdio.mjs`, or without a build `npm run start:stdio`. Report links point to `WHATIF_SITE_URL` if set; otherwise run `npm run dev` so they open on localhost.

**QA bot**

```bash
npx playwright install chromium   # once, for the browser (ui-*) checks
npm run qa:dry                    # dry run: every check, never counts as a loop (qa/reports/dry-run.*)
npm run qa                        # a counted loop: scores every part 1–10; passes at 8.5 or more
```

`npm run qa` counts a loop in `qa/state.json`. After the 5th failed loop the bot stops for good; delete `qa/state.json` to start a new series. Use `qa:dry` while working, so you never burn a loop by accident.

## Deploy to Vercel

1. Import this repository in Vercel. No build settings are needed; the build writes `.vercel/output`.
2. Set the environment variables (Project → Settings → Environment Variables), then redeploy:

   | Variable | What it does | Example |
   |---|---|---|
   | `WHATIF_BETA_CODES` | the invite codes, comma-separated, each at least 6 characters (case does not matter). **Unset = open**, for local dev and tests. | `BERLIN-CAFE-01,LINDEN-2026` |
   | `WHATIF_BETA_CONTACT` | where owners ask for a code: an email or a URL. Shown in the closed-beta tool error, on the site and in the skill; empty hides the "ask for an invite" button. | `beta@example.com` |
   | `WHATIF_SITE_URL` | the public address used in report links, the skill zip and the Connect page. Unset: a Vercel build uses `https://$VERCEL_PROJECT_PRODUCTION_URL`, the MCP function uses each request's host, local builds use `http://localhost:3000`. | `https://whatif.example.com` |

3. Check it: open `https://<site>/api/mcp?code=<one of your codes>` in a browser. The JSON info page should say `"valid": true`.
4. Give each café its own code and its personal address `https://<site>/api/mcp?code=<code>`. Never commit real codes.

## Credits

- [MiroFish](https://github.com/666ghj/MiroFish) inspired the customer rehearsal: personas, activation, a feed, injected events and interviews. MiroFish is AGPL-3.0; What-IF borrows ideas only, no code or prompts. See [`docs/research/mirofish-notes.md`](docs/research/mirofish-notes.md).
- Built with the [Model Context Protocol](https://modelcontextprotocol.io) TypeScript SDK and Claude.
- Public facts: § 12 (2) Nr. 15 UStG (Steueränderungsgesetz 2025) and the Fünfte Mindestlohnanpassungsverordnung; sources and dates are in the report's "Berlin facts used" card and in [`skill/what-if/references/berlin.md`](skill/what-if/references/berlin.md).

## License

MIT. See [`LICENSE`](LICENSE).
