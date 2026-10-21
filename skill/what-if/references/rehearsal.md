# The customer rehearsal

A small, MiroFish-inspired simulation: a handful of **imagined** local customers react, round by round, to the owner's change. It helps the owner picture how different people might respond, and find the **questions to ask real customers**. It is never a forecast, never scaled up, and never fed into the scenario maths.

The What-IF server builds everything (personas, rounds, briefs, validation, summary). The host's job is to **play the personas**: in parallel subagents where it can, in turn where it cannot.

In the Berlin beta the cast fits the owner's **Kiez** (pass `kiez` in `inputs`): names, alternatives such as the Bäckerei, the Späti or the Kantine, and channels such as nebenan.de or the Kiez WhatsApp group. The mix is a rough, labelled guess, never a statistic. Every brief tells the imagined customer to write `thought`, `saysPublicly`, `questionForOwner` and `diary` in the analysis language (the `lang` you passed), so the report reads in the owner's language. Don't translate their answers.

## The pieces

| Piece | What it is |
|---|---|
| **Personas** | 6 by default (4–12). Each has a card (routine, usual spend, price sensitivity, relationship with the café, channels, alternatives, a quirk, an attitude of fan / neutral / sceptical, an activity level) and a short story of 80–150 words ending in their memory of this café. Segments include office workers, freelancers, students, parents, regulars, tourists, retirees and trades; the owner can set the mix with `customer_mix`. |
| **Activation** | Each round, a seeded draw decides who is around (based on activity level). People not around get an automatic "not around" with no model call. The same seed gives the same run. |
| **Rounds** | 4 by default (3–5), for example launch day, first week, second week, after the test. Each round has a situation and 4–6 allowed actions, always including a do-nothing option. |
| **Neighbourhood feed** | What people can see: the owner's announcement, word of mouth, reviews and posts from earlier rounds, and events. Public actions appear in the next round's feed. |
| **Diary** | One sentence each persona remembers into the next round. It is their memory. |
| **Events** | The owner can inject a change before any round: a BVG strike day, a week of rain, a new café two doors down with an €8.50 lunch… (the Berlin list is in `berlin.md`), or their own. |
| **Interview** | After the run, ask every imagined customer (or a few) one question. |
| **Summary** | A funnel of descriptive counts ("tried it: 3 of 6"), uptake per round, who told whom, quotes, questions for the owner, what to check with real customers, and a caveat. |

The brief for each persona already contains everything it needs: its card and story, its diary so far, the feed, the round's situation, the allowed actions and the exact JSON to return. **The brief is the whole prompt.**

## The loop

```
whatif_rehearsal_start(template, inputs, lang, …)  → personas, briefs (round 1), state, report_url
repeat:
    progress line to the owner
    play every brief                         (parallel subagents, or in turn)
    whatif_rehearsal_submit(state, reactions, method)
        errors?  → re-run only those personas → submit them with the new state
        done?    → leave the loop
    share report_url + one quoted highlight
    offer an event → whatif_rehearsal_event(state, event)   (optional)
    next briefs = the result's `next` (or the event result's briefs)
interview (optional): whatif_rehearsal_interview → briefs → play → call again with answers
debrief from the summary
```

Always pass the **newest** `state` token. It is the whole rehearsal so far; the server keeps nothing. Pass `lang` on every call too.

## Playing a round with subagents (Claude Code)

Claude Code has the **Agent** tool. For each round:

1. In **one** assistant message, make one Agent call per brief. Calls in the same message run in parallel (up to 20 at once by default, which covers the maximum of 12 personas).
2. For each call:
   - `subagent_type`: `"general-purpose"`
   - `description`: `"Imagined customer: <name>, round <n>"`
   - `prompt`: the brief's `prompt`, **verbatim**, followed by one line: `Do not use any tools. Reply with the JSON object only.`
   - `model`: optional. If the tool lets you pick a smaller, faster model (for example `"haiku"`), use it; the replies are short.
3. Add **nothing else** to the prompt: no business numbers, no other persona's reply, no summary of earlier rounds, no hint of what you hope will happen. Independence is the point.
4. Wait for every subagent. If they run in the background, wait for all completion notices. Never submit a partial round, and never invent a missing reply.
5. Parse each reply (see *The JSON contract*), put them in one array, and call `whatif_rehearsal_submit` with `method: "subagent"`.

Shape of one round with five active personas (one message, five calls):

```
Agent({ subagent_type: "general-purpose", description: "Imagined customer: Jonas, round 2", prompt: briefs[0].prompt + "\n\nDo not use any tools. Reply with the JSON object only." })
Agent({ subagent_type: "general-purpose", description: "Imagined customer: Mira, round 2",  prompt: briefs[1].prompt + "\n\nDo not use any tools. Reply with the JSON object only." })
… one per brief …
```

## Playing a round with subagents (Cowork)

Cowork has the same kind of subagent tool (called Agent or Task, depending on the version). Use it exactly as above: one general-purpose subagent per brief, all launched in the same turn, brief verbatim plus the one-line suffix, wait for all, submit with `method: "subagent"`. Subagents inherit the session's tools, which is why the suffix says not to use any.

## Playing a round without subagents (any chat app)

Claude.ai, ChatGPT, Cursor and most chat apps cannot launch subagents. Play the personas yourself (`method: "in-context"`):

- One persona at a time, in the order of the briefs.
- Read **only** that persona's brief. Answer as that person would, in their voice, from their routine, spend and attitude.
- Don't carry anything from one persona to the next. They only know what is in their own brief (including the feed).
- Write the reactions straight into the `whatif_rehearsal_submit` call. Don't paste raw JSON into the chat.
- Keep the owner's view to one progress line and one highlight per round.

## The rule-based stand-in

`whatif_rehearsal_autoplay` plays all remaining rounds with simple, deterministic rules: no model at all. Use it when:

- the owner is short on time ("just show me the result"),
- the host cannot role-play reliably,
- something keeps failing.

Tell the owner: "I've let simple rules play the remaining rounds, so this part is even more rough than usual." The summary will show the method as rule-based or mixed.

## The JSON contract

Each persona returns **one JSON object** per round:

```json
{
  "personaId": "p2",
  "round": 2,
  "action": "try_deal",
  "thought": "Soup and a sandwich for under ten euros is fair if it's quick. I've got 30 minutes.",
  "saysPublicly": "Tried the new lunch deal at Lindenblatt. Good soup, no queue.",
  "questionForOwner": "Is there a vegetarian option every day?",
  "diary": "Tried the deal on Tuesday; I'd go again if it stays quick."
}
```

| Field | Rule |
|---|---|
| `personaId` | copied from the brief |
| `round` | copied from the brief |
| `action` | exactly one of the brief's `allowedActions` (the id, not the label) |
| `thought` | required; short, first person, one or two sentences |
| `saysPublicly` | optional; what they tell others or post. It enters the feed if the action is public |
| `questionForOwner` | optional; a question they would ask the owner |
| `diary` | optional but encouraged; one sentence to remember next round |

The server rejects unknown actions, missing fields and over-long text. The brief states the exact limits; if the brief and this page ever differ, **the brief wins**.

Parsing replies:

- Strip code fences (```` ```json ````) and any text around the first `{` … last `}`.
- If it still doesn't parse, treat it as an error for that persona and retry it.
- Never edit a persona's answer to make it pass, apart from removing fences. Retry instead.

## Errors and retries

`whatif_rehearsal_submit` returns `accepted`, `errors` (a list of `{ personaId, error }`), `done`, `next` and a new `state`. Accepted reactions are kept in the new state.

1. If `errors` is empty: carry on with `next`.
2. If not: re-run **only** the personas in `errors`, with the same brief plus one line: `Your previous answer was rejected: <error>. Reply again with the corrected JSON object only.` Launch them in parallel again.
3. Submit only those corrected reactions, with the **new** `state`.
4. After two failed retries for one persona, play that persona yourself from its brief and submit it on its own with `method: "in-context"`.
5. If the whole round keeps failing, call `whatif_rehearsal_autoplay` and say so.

Never retry personas that were accepted: that would give them two answers.

## Events between rounds

After each round except the last, you may offer (once or twice per run, not every round):

> Want to throw something at them before next week? For example: a BVG strike day, a week of rain, or a new café two doors down with an €8.50 lunch.

> Wollen Sie den ausgedachten Gästen vor der nächsten Woche etwas zumuten? Zum Beispiel einen BVG-Streiktag, eine Woche Regen oder ein neues Café zwei Türen weiter mit Mittagstisch für 8,50 €.

The Berlin events (`whatif_start` lists them with translated texts): a BVG strike day, a week of rain, a heatwave (32 °C), a Baustelle outside with the pavement half closed, the Berlin school holidays, a new café two doors down with an €8.50 lunch, a big Kiez street festival weekend, the Christmas market opening nearby. They are shocks to rehearse, never facts or forecasts: don't say when the next strike is or what the weather will do.

Call `whatif_rehearsal_event` with `state`, `lang` and the `event` (the tool's wording, or the owner's own words). It returns a new `state`; the event appears in the next round's situation and feed. Use the newest `state` and the briefs that come back with it (or from the next tool result) for the next round, not older ones.

Teaching moment: "This is the useful part of a rehearsal: you can try a shock safely, before it happens for real."

## The interview after the run

> Want to ask them all one question? For example: "What would make you come back next week?" or "What would you have paid?"

1. Call `whatif_rehearsal_interview` with `state` and `question` (and `persona_ids` to ask only some). It returns one brief per persona.
2. Play them like a round: parallel subagents (same rules, same suffix), or in turn.
3. Each answer is a JSON object as the brief asks, usually `{ "personaId": "p2", "answer": "…" }`.
4. Call `whatif_rehearsal_interview` again with the same `state` and `question`, plus `answers` (the array) and the method if asked. It records them and returns a new `state` and `report_url`.

## Progress lines

One line per round, before you play it. Use the round's title, its number and the number of briefs:

- "Round 1/4: 6 imagined customers seeing the sign on launch day…"
- "Round 2/4: 5 imagined customers deciding at Tuesday lunch…"
- "Round 3/4: 4 imagined customers in the second week (it's raining)…"
- "Round 4/4: 6 imagined customers looking back after the test…"

After each round: the new report link, plus one highlight with a quote and the *imagined* label. "Herr Becker (imagined regular) switched to the deal and told nobody."

Write the progress lines in the owner's language: "Runde 2/4: 5 ausgedachte Gäste entscheiden am Dienstagmittag…", "Ronda 2/4: 5 clientes imaginados deciden el martes a mediodía…", "Runda 2/4: 5 wyobrażonych klientów decyduje we wtorek w porze lunchu…". Use the report's words for the rehearsal and its people (de "Probelauf", "ausgedachte Gäste"; es "ensayo", "clientes imaginados"; pl "próba", "wyobrażeni klienci"; table in `berlin.md`).

## The debrief

Write it **only from the summary** the tool returns. Don't add reactions that didn't happen, and don't draw conclusions the summary does not support.

Structure:

1. **What they did**, as counts of imagined people: "4 of 6 noticed it; 3 of 6 tried it at least once; 1 told a colleague." Never percentages. Never "so 50% of your customers…".
2. **What they said**: two or three short quotes, each with name, who they stand for, and *(imagined)*.
3. **Questions they raised**: from `questionsForOwner`.
4. **What to check with real customers**: from `checkWithRealCustomers`. This is the useful output.
5. **The caveat**, in the summary's words. For example: "These are imagined customers, not data. Use them to find questions, not answers."

Then link it back to the test: "The test plan counts real customers; these questions are what to ask them at the till."

## What it can and cannot tell you

| It can | It cannot |
|---|---|
| Show the range of ways different kinds of people might react | Tell you how many real customers will come |
| Surface objections and questions (price, speed, vegetarian, queues) | Give probabilities or forecasts |
| Show how word of mouth might travel | Know anything about your neighbourhood beyond what you told What-IF |
| Let you try a shock safely (rain, a competitor's deal) | Know what a real competitor will do |
| Give you questions to ask real customers | Replace a survey, a conversation or a test |
| Make the decision feel concrete | Change the maths: scenario numbers come only from the calculation |

Cost and time: with 6 personas and 4 rounds, about 15–25 short subagent calls (only active personas are called), usually two or three minutes.

## Credit

The idea of rehearsing with personas, activation, a feed, injected events and interviews comes from [MiroFish](https://github.com/666ghj/MiroFish) (AGPL-3.0). What-IF borrows ideas only, not code or prompts, and works at café scale: a handful of personas, a few rounds, no external services.
