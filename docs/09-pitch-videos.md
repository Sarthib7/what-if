# Pitch deck and video

What shipped for the hackathon:

| File | What it is |
|---|---|
| `media/pitch/what-if-deck.html` | **The pitch deck**: 8 minimal slides on a dark indigo-to-peach gradient. Open it in Chrome or Edge. ← → (or space, or a click) moves between slides, F goes full screen, and `#4` in the address bar jumps to slide 4. Works offline. |
| `media/pitch/what-if-pitch.pdf` | The same 8 slides as a 16:9 PDF, as a backup. |
| `media/pitch/what-if-pitch-2min.mp4` | **The 2:00 video** (1920×1080, 30 fps, H.264, no audio). It shows the deck slides and, between them, the product working on the live server: the real chat, the report, the slider, the AI-played customers, the test card, four languages, the connect page and the website. |

The sources are in `media/pitch/deck/`. Each step re-runs on its own:

- `deck.html` holds the slides.
- `python build-deck.py` turns it into `what-if-deck.html`.
- `node make-pdf.mjs` makes the PDF.
- `node shots.mjs` saves the slide frames used by the video.
- `video.html` is the video timeline: slides plus framed product clips, each with one caption and one line of explanation.
- `node render-video.mjs` renders it frame by frame with Playwright and pipes the frames to ffmpeg. With `--stills 20,60` it saves stills instead.

## The slides

1. **What if:** "Rehearse a decision before you spend money."
2. **Small businesses decide on gut feeling.** No analyst, no time, and AI that can't show where its numbers come from.
3. **Just ask: "what if…?"** Next to it is the real answer from the live server.
4. **48:** fewer cappuccinos a week, and she still earns as much. €3.50 → €3.80; her guess is −5%; the worst case over the test is −€28.
5. **Every number shows where it came from:** Yours · Calculated · A guess · Imagined.
6. **Rehearse with imagined customers:** four regulars played by AI over four rounds, plus one quote.
7. **Test small. Then decide.** Two weeks of counting cups: keep at 402 a week or more, stop below 378.
8. **What if:** "Possibilities, not promises." It also shows the live MCP URL and GitHub.

## What the claims rest on

- **The live session** is a real run through the public MCP server (`whatif_start` → `check_inputs` × 6 → `run_scenarios` → `what_changed` → `rehearsal_start` / `submit` × 4 with one event → `plan_test`).
  - The owner, "Lena, Café Morgenrot, Kreuzberg", is an **example**, not a real business. Her numbers: 450 cappuccinos a week at €0.85 for milk, coffee and cup; a likely −5% (cautious −12%, optimistic 0%); a 14-day test.
  - The server returned:
    - break-even −10.7%, so she can sell up to 48 fewer a week;
    - outcomes over the test of −€28, +€120 and +€225 (per month −€60, +€259 and +€487);
    - the biggest uncertainty swings the result by €253;
    - the test card says keep at 402 a week or more and stop below 378.
  - The four imagined customers (Barbara, Omar, Aiko, Samir) were played by an AI from their briefs. They are labelled *Imagined* and are never counted in the maths.
  - The transcript is in `media/pitch/assets/live/transcript-current-build.json` and the final report link in `final-report-token.txt`.
- **Berlin facts:**
  - food VAT 7% since 1 Jan 2026 and drinks 19% (§12 Abs. 2 Nr. 15 UStG);
  - minimum wage €13.90 since 1 Jan 2026, €14.60 from 1 Jan 2027.
- **Quality:** the pushed build (0c9f3d9) passes 297 tests, and the QA bot's 117 automated checks pass.
- **The live URL** (`…trycloudflare.com`) is a Cloudflare quick tunnel from a laptop. It changes if the tunnel restarts. Update slide 8 and `video.html` when the permanent (Vercel) URL exists.

The demo café in the report itself is the separate Café Lindenblatt, Neukölln, with a weekday lunch deal at €9.90. It is labelled as demo data, and the open-the-demo links use it.
