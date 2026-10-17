# Pitch videos — three versions, each under 2 minutes

Three **horizontal** videos (1920×1080, 30 fps, H.264, no audio), each **under 120 s**. They tell the same product three ways:

| | Version | Runs | Angle | Files |
|---|---|---|---|---|
| **A** | **Story** | ~1:58 | A Berlin café owner's pain first, then the product, then what it saves | `media/pitch/out/what-if-a-story.mp4` · `-guide.mp4` |
| **B** | **Demo first** | ~1:57 | The product in the first minute, then why it matters and how it teaches | `what-if-b-demo-first.mp4` · `-guide.mp4` |
| **C** | **Judges** | ~1:58 | The hackathon theme: how local businesses learn to use AI, four lessons, how it is built, the Berlin beta | `what-if-c-judges.mp4` · `-guide.mp4` |

Each has a **`-guide` twin** with the line to say burned into the frame, for recording the voice-over. Slides are full-frame, in the product's own design (warm paper background, the five source colours), with one progress line along the bottom. Every version ends on the same card: the What-IF mark, *Possibilities, not promises*, *Just say "what if…"*, *Closed beta · Berlin cafés · DE · EN · ES · PL*, and a QR code to the GitHub repo.

The guides are paced at about 2.2 spoken words per second. If your recording runs longer, shorten a pause or cut a line; the final file must stay under 120 s.

## What the claims rest on

- **Demo numbers** come from the engine with the demo café's inputs (`demoInputs("lunch_offer")`, Café Lindenblatt, Neukölln, a made-up café, labelled as demo data on screen):
  - break-even 11 extra lunch customers a day to pay back the 10-day test (7 a day once the setup is paid);
  - the owner's likely guess is 8;
  - outcomes over the test are −€385, −€118 and +€257;
  - the worst case is −€546, which is 36% of the €1,500 spare cash;
  - each extra customer leaves €5.35 after 10.6% VAT and ingredients;
  - the guess that matters most swings the result by €642.
- **Berlin facts:** food VAT 7% since 1 Jan 2026 and drinks 19% (Steueränderungsgesetz 2025, §12 Abs. 2 Nr. 15 UStG); minimum wage €13.90 since 1 Jan 2026, €14.60 from 1 Jan 2027.
- **Owners' worries about AI** (version C) come from Anthropic, ["What 1,000 small business owners taught us about AI"](https://claude.com/blog/what-1-000-small-business-owners-taught-us-about-ai) (10 Sept 2026):
  - accuracy;
  - data security, the most-cited barrier in its survey of 503 decision-makers;
  - 81% are open to AI.
- **The rehearsal footage** is a real run, saved in `media/pitch/assets/ai-rehearsal-state.json`. Claude subagents, one per imagined customer and per round, reacted to the demo deal, with the owner's event "a new café opens two doors down with an €8.50 lunch" before round 3, and then answered one interview question.
  - The six imagined customers: Noor, a parent and a sceptic; Chiara, an office worker and a fan; Paweł, a freelancer; Murat, a regular; Greta, a student; and Jan, a parent and a fan.
  - All 6 noticed the board and 3 tried the deal. After the rival opened, Noor, Paweł and Greta ate elsewhere, while Chiara, Murat and Jan kept coming.
  - Their questions included "a soup-and-drink deal for around €8?", "room for a pram?", "order ahead on WhatsApp?" and "a student option for €6–7?".
  - It is labelled *Imagined* and *played by AI agents*. Nothing from it feeds the maths.
- **The test count and the QA bot** (version C): `npm test` passes 227 tests. The judges are Claude reviewers, including a café-owner persona, and the scores live in `qa/judge/`.
- **Not claimed:**
  - no forecasts;
  - no "AI predicts";
  - no real café has used it yet, because the beta comes next;
  - no live URL until the Vercel deploy, so the QR code points to the GitHub repo.

## Version A — Story (owner first)

| Time | You say | On screen |
|---:|---|---|
| 0:00 | "This is Café Lindenblatt in Neukölln: a small café, loyal regulars, and quiet lunchtimes." | A drawn café front, *Neukölln, Berlin*, a clock at 12:30, a few cups. *Demo café* label |
| 0:07 | "The owner wonders: what if I run a weekday lunch deal? Soup, sandwich and a drink for 9.90." | Thought bubble *Was wäre, wenn…?*, then the board *Lunch deal · soup · sandwich · drink · 9,90 €* |
| 0:14.5 | "Decisions like this are made on gut feeling. There's no analyst, wages are going up, and a chatbot sounds sure of itself, but can't show where its numbers come from." | *Gut feeling* · *No analyst* · *Minimum wage €13.90 → €14.60 (2027)* · a chat bubble "Sure! Revenue will rise 23%" crossed out with *Where does this number come from?* |
| 0:27 | "So she asks the AI she already uses: what if I run a lunch deal? What-IF takes over." | A neutral chat window. She types it, and a *What-IF* tool chip lights up |
| 0:34 | "It asks one question at a time, and says why each number matters. Rough numbers are fine." | `try-question` shot: the question, *Why it matters*, "about 40" |
| 0:41 | "Every number wears a label: hers, calculated by code, a guess, or imagined. That's the first lesson about AI: always ask where a number comes from." | The four chips land one by one, then the legend shot, then *Woher kommt diese Zahl?* |
| 0:52 | "Then the one number to remember. To pay back the test, she needs eleven extra lunch customers a day. Her guess was eight." | A big **11** with *a day*, then *your guess: 8*, then the slider shots stepping |
| 1:01 | "If nobody new comes, the test could cost 546 euros: a third of the cash she can spare." | The worst-case box shot, with the cash meter at 36% |
| 1:08 | "Before spending a cent, she rehearses it with six imagined locals, each played by an AI. They notice the board, try the deal, or go to the cheaper café." | Persona cards from the AI run, then the round-by-round grid filling, then the event *A new café opens two doors down: €8.50 lunch* |
| 1:20 | "They're not data. But they raise questions she hadn't thought of: a cheaper soup and drink, room for prams." | The caveat shot, then three imagined questions: *A soup-and-drink deal for about €8?* · *Is there ever room for a pram?* · *Can I order ahead on WhatsApp?* |
| 1:29 | "She ends with a small test: ten weekdays, a tally by the till, and a rule she agrees on before she starts: keep, tweak or stop." | The test card shot. *Keep · Tweak · Stop* |
| 1:38.5 | "That saves her money, because she sees the worst case first, and hours of guesswork. And it teaches a method for every decision after this one." | Three cards: *Saves money: worst case first* · *Saves time: minutes, not a spreadsheet* · *Teaches: numbers → break-even → small test* |
| 1:49 | "What-IF. Closed beta for Berlin cafés, in four languages. Just say: what if…" | End card |

## Version B — Demo first

| Time | You say | On screen |
|---:|---|---|
| 0:00 | "Watch a Berlin café owner type one sentence: what if I run a lunch deal?" | The chat window, the sentence typed in German, then English |
| 0:06 | "What-IF answers inside the AI she already uses: Claude, ChatGPT, any app that speaks MCP." | The tool chip, then the app names as words (no logos) around the What-IF mark |
| 0:12.5 | "One question at a time, each with the reason it matters." | `try-question` shot |
| 0:17.5 | "Then a visual report, in German, English, Spanish or Polish, where every number says where it came from." | The report top shot, flipping DE → EN → ES → PL, then the chips |
| 0:25 | "Three possible outcomes: a slow start, her guess, and a strong one. No fake prediction." | The outcomes shot |
| 0:31.5 | "She drags the slider and reads why the result moves: each extra customer leaves 5 euros 35 after VAT and ingredients. Break-even: eleven a day." | The slider shots stepping 0 → 15, "Why this changed" readable, a big **11** |
| 0:42 | "Then a rehearsal. Six imagined locals, each one its own AI agent running in parallel, react over four rounds. She can throw in a BVG strike, or a rival café's 8.50 lunch." | Six agent cards spinning up in parallel, then the grid filling round by round, then the event card *The café opposite starts an €8.50 lunch* |
| 0:55 | "Imagined, not data. They hand her questions to ask real customers." | The caveat shot |
| 1:00 | "It ends with a ten-day test she can start on Monday, with the check-ins in her calendar." | The test card shot and a calendar with days 3, 5 and 10 marked |
| 1:07 | "When she comes back with real counts, she sees where reality landed, and what she learned." | The result shot |
| 1:13.5 | "Why we built it: local businesses are told to use AI, but nobody shows them how, or when not to trust it." | *Use AI!* … *But how? And when not to trust it?* |
| 1:22 | "What-IF teaches it inside a real decision. Code does the maths. AI explains and plays roles. Guesses are labelled. And the method works again next time." | Four lines with the source colours, then *numbers → break-even → small test* |
| 1:33 | "It saves money, because the worst case comes first, and time, because it takes minutes instead of a spreadsheet." | *Saves money* · *Saves time* with the −€546 worst case |
| 1:41 | "We start with a closed beta for independent cafés in Berlin. No AI app? Use the website." | The connect shot and the /try phone shot side by side |
| 1:48 | "What-IF. Possibilities, not promises. Just say: what if…" | End card |

## Version C — Judges (AI education for everyone)

| Time | You say | On screen |
|---:|---|---|
| 0:00 | "AI education for everyone. We chose the people who need it most: owners of local businesses." | *AI education for everyone* → *for the owners of local businesses* |
| 0:07 | "They're open to AI, but they worry it gets numbers wrong, and about their data. Anthropic heard exactly that from a thousand small-business owners this year." | **81%** *open to AI* · *Worry: accuracy* · *Worry: data security*. Source line: Anthropic, Sept 2026 |
| 0:18 | "Their hardest moments are money decisions: a lunch deal, a price, an extra shift. Made on gut feeling, with no analyst." | Three decision cards and *Gut feeling · No analyst* |
| 0:26.5 | "What-IF turns a 'what if' into a lesson, with the owner's own numbers." | The What-IF mark, *a "what if" becomes a lesson* |
| 0:32 | "Lesson one: where numbers come from. Every figure is labelled: theirs, calculated, a guess, or imagined. Code does the maths, never the model." | **1** · the chips and legend shot · *Code does the maths. Never the model.* |
| 0:42 | "Lesson two: the one number to remember. Predict it, then check. Drag the slider, read why it changes." | **2** · predict shot, then revealed, then slider stepping |
| 0:50 | "Lesson three: what a simulation can and cannot tell you. Inspired by MiroFish, Claude subagents play six imagined locals over four rounds. Good questions, never a forecast." | **3** · six parallel agent cards, the grid, the caveat |
| 1:01.5 | "Lesson four: test small before you spend, with keep, tweak or stop agreed in advance. Then compare with reality." | **4** · test card, then the result shot |
| 1:09.5 | "For the owner, that means money not lost on a guess, 546 euros at stake in our demo, and hours not spent in a spreadsheet." | *Saves money* −€546 · *Saves time* |
| 1:19 | "How it's built: a public MCP server and a skill, so it works in the AI app owners already use, and a website for those who have none. Nothing is stored; the numbers live in the link." | A diagram: chat app ⇄ MCP (11 tools) → report link `/r#…`; skill; website `/try`; *stateless* |
| 1:33 | "We checked it with a QA bot: 227 tests, plus judges played by Claude, including a Neukölln café owner." | *227 tests* · *QA bot: every part scored 1–10, pass at 8.5* · judge persona cards |
| 1:40.5 | "Next: a closed beta with ten Berlin cafés, in four languages. Each runs one real test, and comes back with real counts." | Map pin Berlin, *10 cafés*, DE · EN · ES · PL, the connect shot |
| 1:49 | "What-IF. Possibilities, not promises. Just say: what if…" | End card |

## Re-rendering

```bash
node media/pitch/render.mjs --only a,b,c,ga,gb,gc --fps 30   # all six files
node media/pitch/render.mjs --only a --stills 10,55,90         # PNG stills
```

Open `media/pitch/src/pitch.html?v=a&t=55` in a browser to look at one frame. The scenes and their timing live in `media/pitch/src/pitch.js`. The product screenshots in `media/pitch/assets/shots/` are real captures of the built site (`npm run build`).
