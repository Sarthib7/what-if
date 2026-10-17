# The visual report, and quick charts

The report is **the lesson**. Every tool result ends with a `report_url`; share it at every step as **[Open your visual report](report_url)**. The page redraws the whole analysis in the owner's browser from the numbers inside the link, so each new link is a fresh, complete report.

Paste the link exactly. It is long because it carries the data; never shorten, edit or rebuild it. If the app breaks long links, put the full URL on its own line.

The report opens in the language you passed as `lang` and has a **language switcher (DE · EN · ES · PL)**: the same link redraws in another language, with the numbers recomputed and the imagined customers' own words left as they were written. The report viewer needs no invite code, so the owner can share a link with a partner or their Steuerberater. Anyone with the link sees the numbers in it.

## What the report shows, step by step

The report is a six-step lesson with a progress header at the top. Talk the owner through the step that matters right now, not all six.

### 1. Your question

The question in the owner's words, the business name and the date. A **demo data** ribbon when it is the made-up café.

*How to talk about it:* "This is your question. Everything below answers only this, with everything else kept the same."

### 2. Your numbers

Every input with a **source chip**: *Your number*, *A guess*, *Calculated*, *Imagined*, *Demo data*. Values What-IF filled in show a note ("you did not say, so What-IF used 30%"). A legend explains the chips.

*How to talk about it:* "Look at the chips. 'Your number' is what you told me; 'a guess' is something nobody knows yet. If a guess looks wrong to you, tell me and we'll change it."
*Teaching question:* "Which of these could you check on your till this week?"

A **"Berlin facts used"** card lists every public fact the numbers rely on (VAT 7% on food and 19% on drinks since 1 Jan 2026, the €13.90 minimum wage), each with its source and date.

*How to talk about it:* "These are the only outside facts in your report, with where they come from. Everything else is yours, a guess, or calculated."

### 3. Possible outcomes

Three cards (cautious, expected, optimistic) and a bar chart with a zero line, for the test period and per month. Every number has a **show the maths** toggle that writes the formula out with the owner's numbers.

*How to talk about it:* "Three outcomes, because nobody knows the future. Bars below the line lose money, bars above earn. Tap 'show the maths' on any number to see exactly how it was worked out."
*Teaching question:* "What would have to be true for the optimistic one to happen?"

### 4. The one number to remember

The break-even, big. A **slider** for the main guess (extra customers a day, or the change in sales) with a live chart. Under it, **Why this changed** rewrites itself as the slider moves: the calculation for that position, in words.

*How to talk about it:* "Drag the slider slowly from 0 upwards and watch where the line crosses zero. That's your break-even. Read the sentence under it: it explains each position."
*Teaching question:* "Where do you think your café really is on that slider?"

### 5. Rehearsal (when there is one)

Persona cards (who each imagined customer is, with an attitude badge), a round-by-round **timeline grid** (one cell per person per round, showing their action), an **uptake chart** (engaged per round), the **neighbourhood feed**, a small **who-told-whom** network, interview answers, and a box: **what a simulation can and cannot tell you**. Everything here carries the *Imagined* chip.

*How to talk about it:* "Each row is one imagined person, each column one round. Follow one person across: that's their story. The box on the right says what this is good for: finding questions, not counting customers."
*Teaching question:* "Which of these people sounds most like your real lunch crowd?"

### 6. Your test and what you learned

A **printable test card** (baseline, days, what to count, check-ins, keep / tweak / stop, cost cap), the lessons, "use this method again" (the steps for the next decision), a short glossary and a privacy card. After `whatif_log_result`, it also shows the real result beside the three scenarios.

*How to talk about it:* "Print the test card and stick it by the till. The keep / tweak / stop rule is decided now, while you're calm."
*Teaching question:* "Who in your team will do the counting?"

## When to share which link

| After | Point the owner to |
|---|---|
| `whatif_start` | the demo report: "this is what you'll get" |
| `whatif_run_scenarios` | steps 3 and 4: outcomes and the slider |
| `whatif_what_changed` | step 4: the break-even moved, and why |
| each rehearsal round | step 5: the new column in the timeline |
| `whatif_plan_test` | step 6: the printable test card |
| `whatif_log_result` | step 6: reality beside the scenarios |

## Drawing a quick chart in the chat

If your host can render visuals (Claude artifacts, ChatGPT canvas, inline HTML or SVG), you may also draw a small chart right after `whatif_run_scenarios`. It is a preview; **the report link is still the lesson, so always share it too.**

Rules:

- Use **only the tool's figures** (`scenarios[].netTest` and `netMonth`, `breakEven`, `sensitivity.points`). Never compute new values for the chart.
- One chart, one message: "the three outcomes over the test".
- A visible **zero line**. Losses below, gains above.
- Label every bar with the tool's formatted figure and a sign, so colour is never the only signal.
- A title that says what it shows, and a footnote: "Calculated by What-IF from your numbers and guesses. Possibilities, not promises."
- One axis only. Keep it small and plain: no 3D, no gradients, no animation.
- Use colour for polarity only: blue for gains (`#2a78d6`), red for losses (`#e34948`); text in the host's normal ink colour.

### SVG template: three outcomes

Scale: take the largest gain `max` (0 if none) and the largest loss `min` (0 if none). With a plot area from y = 40 to y = 200 (160 px high), each euro is `160 / (max − min)` px, and the zero line sits at `y0 = 40 + max × 160 / (max − min)`. A gain bar runs from its top down to `y0`; a loss bar from `y0` down. This is only chart geometry: the money values themselves come from the tool.

Demo café over the 10-day test (−€385, −€118, €257): max 256.80, min −385.20, so 0.2492 px per euro and y0 ≈ 104.0. Write the title, labels and footnote in the owner's language.

```html
<svg viewBox="0 0 360 250" width="360" role="img" aria-labelledby="t d" style="font: 13px system-ui, sans-serif; color: inherit">
  <title id="t">Three possible outcomes over the 10-day test</title>
  <desc id="d">Cautious: minus 385 euros. Expected: minus 118 euros. Optimistic: plus 257 euros. Calculated by What-IF.</desc>
  <text x="0" y="18" fill="currentColor" font-weight="600">Result over the 10-day test</text>
  <!-- zero line -->
  <line x1="20" x2="340" y1="104" y2="104" stroke="currentColor" stroke-opacity="0.5" />
  <text x="342" y="108" fill="currentColor" font-size="11" text-anchor="end" dy="-6">€0</text>
  <!-- cautious: loss of 385.20 → 96.0 px below zero -->
  <rect x="45" y="104" width="70" height="96" rx="4" fill="#e34948" />
  <text x="80" y="216" fill="currentColor" text-anchor="middle">−€385</text>
  <!-- expected: loss of 117.70 → 29.3 px below zero -->
  <rect x="145" y="104" width="70" height="29.3" rx="4" fill="#e34948" />
  <text x="180" y="150" fill="currentColor" text-anchor="middle">−€118</text>
  <!-- optimistic: gain of 256.80 → 64.0 px above zero -->
  <rect x="245" y="40" width="70" height="64" rx="4" fill="#2a78d6" />
  <text x="280" y="34" fill="currentColor" text-anchor="middle">+€257</text>
  <!-- category labels -->
  <text x="80" y="236" fill="currentColor" text-anchor="middle" font-size="12">Cautious (3/day)</text>
  <text x="180" y="236" fill="currentColor" text-anchor="middle" font-size="12">Expected (8/day)</text>
  <text x="280" y="236" fill="currentColor" text-anchor="middle" font-size="12">Optimistic (15/day)</text>
</svg>
```

Below it, in plain text: "Calculated by What-IF from your numbers and guesses. Possibilities, not promises. [Open your visual report](report_url) to move the slider."

These demo figures follow `maths.md`; in a real session take every figure from the tool result. If they differ, the tool's numbers win.

### Break-even line (optional, second chart)

From `sensitivity.points` (each has `x` and `netTest`): plot `x` along the bottom, `netTest` up the side, a zero line, a dot where the line crosses zero labelled with the tool's break-even ("11 a day"), and a dashed marker at the owner's likely guess. Same rules as above. For a price change, `x` is the change in sales and the line crosses zero at the sales you can afford to lose.

### Plain-text fallback

In a text-only chat, a small text chart still helps. Use the tool's figures:

```
Result over the 10-day test (calculated)
                         loss │ gain
Cautious   (3/day)   ████████ │            −€385
Expected   (8/day)         ██ │            −€118
Optimistic (15/day)           │ █████      +€257
```

Keep the bar lengths roughly proportional (about one block per €50 here), and always add the figures.

## Talking about charts so people learn

- **Point first, then explain.** "See the middle bar, under the line? That's the expected case."
- **Connect the picture to the mechanism.** "It sits under zero because 8 is three short of the break-even of 11."
- **Invite a move.** "Drag the slider to 11 and watch the bar cross the line."
- **Name the source.** "These bars are calculated; the 8 they rest on is your guess."
- **One chart at a time.** Don't describe all six steps at once.
