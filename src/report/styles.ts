/**
 * The report's CSS. Design tokens live on :root (light), with a dark override
 * under prefers-color-scheme. site/assets/site.css repeats reportTokens()
 * verbatim (a test checks they match), so pages and reports share one palette.
 *
 * Calm and warm: paper background, ink text, thin marks, an 8px spacing scale.
 * Source chips use colour + icon + words (never colour alone).
 */

const TOKENS = `:root {
  color-scheme: light;
  --wi-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --wi-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --wi-s1: 4px; --wi-s2: 8px; --wi-s3: 16px; --wi-s4: 24px; --wi-s5: 32px; --wi-s6: 48px; --wi-s7: 64px;
  --wi-radius: 16px; --wi-radius-s: 10px;
  --wi-bg: #f6f3ed;
  --wi-surface: #fffdf9;
  --wi-surface-2: #f3eee6;
  --wi-surface-3: #ebe4d8;
  --wi-ink: #1d1a16;
  --wi-ink-2: #514a41;
  --wi-muted: #6f675c;
  --wi-line: #e7e0d4;
  --wi-line-2: #d3c9b9;
  --wi-link: #1f5fb8;
  --wi-focus: #2a78d6;
  --wi-brand: #e0a526;
  --wi-pos: #2f7d57; --wi-pos-ink: #1f6142; --wi-pos-wash: rgba(47, 125, 87, 0.11);
  --wi-neg: #c2452d; --wi-neg-ink: #9c3420; --wi-neg-wash: rgba(194, 69, 45, 0.09);
  --wi-warn: #a86b00; --wi-warn-wash: rgba(201, 133, 0, 0.12);
  --wi-src-owner: #2a78d6; --wi-src-owner-wash: rgba(42, 120, 214, 0.11);
  --wi-src-assumption: #c98500; --wi-src-assumption-wash: rgba(201, 133, 0, 0.13);
  --wi-src-calculation: #5b6475; --wi-src-calculation-wash: rgba(91, 100, 117, 0.11);
  --wi-src-imagined: #c2407a; --wi-src-imagined-wash: rgba(194, 64, 122, 0.10);
  --wi-src-demo: #14998a; --wi-src-demo-wash: rgba(20, 153, 138, 0.11);
  --wi-shadow: 0 1px 2px rgba(40, 30, 20, 0.05), 0 6px 24px rgba(40, 30, 20, 0.05);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --wi-bg: #141210;
    --wi-surface: #1c1a17;
    --wi-surface-2: #24211d;
    --wi-surface-3: #2e2a25;
    --wi-ink: #f3efe8;
    --wi-ink-2: #cbc3b7;
    --wi-muted: #a39a8d;
    --wi-line: #34302a;
    --wi-line-2: #4b453c;
    --wi-link: #86b6ef;
    --wi-focus: #5598e7;
    --wi-brand: #eab84a;
    --wi-pos: #4cb98a; --wi-pos-ink: #8ad8b3; --wi-pos-wash: rgba(76, 185, 138, 0.15);
    --wi-neg: #ef7b62; --wi-neg-ink: #f8a491; --wi-neg-wash: rgba(239, 123, 98, 0.14);
    --wi-warn: #eab84a; --wi-warn-wash: rgba(234, 184, 74, 0.13);
    --wi-src-owner: #5598e7; --wi-src-owner-wash: rgba(85, 152, 231, 0.17);
    --wi-src-assumption: #e0a526; --wi-src-assumption-wash: rgba(224, 165, 38, 0.16);
    --wi-src-calculation: #a3abbb; --wi-src-calculation-wash: rgba(163, 171, 187, 0.15);
    --wi-src-imagined: #e87ba4; --wi-src-imagined-wash: rgba(232, 123, 164, 0.15);
    --wi-src-demo: #3cc2b1; --wi-src-demo-wash: rgba(60, 194, 177, 0.15);
    --wi-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 6px 24px rgba(0, 0, 0, 0.25);
  }
}`;

const REPORT = `
.wi-report { font-family: var(--wi-font); color: var(--wi-ink); line-height: 1.55; font-size: 16px; max-width: 880px; margin: 0 auto; padding: 0 var(--wi-s3) var(--wi-s7); -webkit-text-size-adjust: 100%; overflow-wrap: anywhere; }
.wi-report *, .wi-report *::before, .wi-report *::after { box-sizing: border-box; }
.wi-report h1, .wi-report h2, .wi-report h3, .wi-report h4 { line-height: 1.2; margin: 0; letter-spacing: -0.01em; overflow-wrap: break-word; }
.wi-report p { margin: 0 0 var(--wi-s2); }
.wi-report a { color: var(--wi-link); }
.wi-report :focus-visible { outline: 3px solid var(--wi-focus); outline-offset: 2px; border-radius: 6px; }
.wi-report ul, .wi-report ol { padding-left: 1.25em; margin: 0 0 var(--wi-s2); }
.wi-report [hidden] { display: none !important; }
.wi-sr { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.wi-muted { color: var(--wi-muted); }
.wi-small { font-size: 14px; }
.wi-h3 { font-size: 19px; font-weight: 650; margin: 0 0 var(--wi-s2) !important; }
.wi-h4 { font-size: 15px; font-weight: 650; margin: 0 0 var(--wi-s2) !important; }
.wi-h5 { font-size: 14px; font-weight: 650; margin: var(--wi-s2) 0 var(--wi-s1) !important; }
.wi-pos { color: var(--wi-pos-ink); }
.wi-neg { color: var(--wi-neg-ink); }
.wi-zero { color: var(--wi-ink-2); }
.wi-card { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: var(--wi-s4); box-shadow: var(--wi-shadow); margin: 0 0 var(--wi-s3); }
.wi-two { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; margin-bottom: var(--wi-s3); }
.wi-two > * { margin: 0; min-width: 0; }
@media (min-width: 760px) { .wi-two { grid-template-columns: 1fr 1fr; } }

/* buttons */
.wi-btn { font: inherit; font-size: 15px; font-weight: 600; display: inline-flex; align-items: center; gap: var(--wi-s2); min-height: 44px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--wi-ink); background: var(--wi-ink); color: var(--wi-surface); cursor: pointer; text-decoration: none; }
.wi-btn:hover { filter: brightness(1.15); }
.wi-btn--ghost { background: transparent; color: var(--wi-ink); border-color: var(--wi-line-2); }
.wi-btn--ghost:hover { background: var(--wi-surface-2); filter: none; }
.wi-btn--ghost[aria-pressed="true"] { background: var(--wi-surface-3); border-color: var(--wi-ink-2); }
.wi-toolbar { display: flex; justify-content: flex-end; gap: var(--wi-s2); margin: 0 0 var(--wi-s3); }

/* chips */
.wi-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 9px 1px 6px; border-radius: 999px; font-size: 12.5px; font-weight: 600; line-height: 20px; white-space: nowrap; vertical-align: middle; color: var(--wi-ink); border: 1px solid transparent; letter-spacing: 0; }
.wi-chip-ico { flex: none; }
.wi-chip--owner { background: var(--wi-src-owner-wash); border-color: color-mix(in srgb, var(--wi-src-owner) 35%, transparent); }
.wi-chip--owner .wi-chip-ico { color: var(--wi-src-owner); }
.wi-chip--assumption { background: var(--wi-src-assumption-wash); border-color: color-mix(in srgb, var(--wi-src-assumption) 40%, transparent); }
.wi-chip--assumption .wi-chip-ico { color: var(--wi-src-assumption); }
.wi-chip--calculation { background: var(--wi-src-calculation-wash); border-color: color-mix(in srgb, var(--wi-src-calculation) 35%, transparent); }
.wi-chip--calculation .wi-chip-ico { color: var(--wi-src-calculation); }
.wi-chip--imagined { background: var(--wi-src-imagined-wash); border-color: color-mix(in srgb, var(--wi-src-imagined) 35%, transparent); }
.wi-chip--imagined .wi-chip-ico { color: var(--wi-src-imagined); }
.wi-chip--demo { background: var(--wi-src-demo-wash); border-color: color-mix(in srgb, var(--wi-src-demo) 35%, transparent); }
.wi-chip--demo .wi-chip-ico { color: var(--wi-src-demo); }
.wi-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--wi-surface-3); color: var(--wi-ink-2); }
.wi-badge--warn { background: var(--wi-warn-wash); color: var(--wi-ink); margin: var(--wi-s2) 0; }
.wi-badge--warn svg { color: var(--wi-warn); }

/* hero */
.wi-hero { padding: var(--wi-s5) 0 var(--wi-s3); }
.wi-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--wi-muted); margin: 0 0 var(--wi-s2) !important; }
.wi-title { font-size: clamp(30px, 6.2vw, 46px); font-weight: 750; letter-spacing: -0.025em !important; margin: 0 0 var(--wi-s3) !important; text-wrap: balance; }
.wi-hero-sub { font-size: 17px; color: var(--wi-ink-2); }
.wi-demo-ribbon { display: flex; flex-wrap: wrap; align-items: center; gap: var(--wi-s2) var(--wi-s3); background: var(--wi-src-demo-wash); border: 1px solid color-mix(in srgb, var(--wi-src-demo) 45%, transparent); border-radius: var(--wi-radius-s); padding: var(--wi-s2) var(--wi-s3); margin: 0 0 var(--wi-s4); font-size: 14.5px; }
.wi-demo-ribbon strong { letter-spacing: 0.12em; font-size: 12.5px; background: var(--wi-src-demo); color: #fff; padding: 2px 10px; border-radius: 999px; }

/* stepper */
.wi-stepper { position: sticky; top: 0; z-index: 20; margin: 0 calc(-1 * var(--wi-s3)); padding: var(--wi-s2) var(--wi-s3) 6px; background: color-mix(in srgb, var(--wi-bg) 88%, transparent); -webkit-backdrop-filter: saturate(1.4) blur(10px); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--wi-line); }
.wi-stepper-now { display: flex; justify-content: space-between; gap: var(--wi-s2); font-size: 13px; margin: 0 0 6px !important; color: var(--wi-ink-2); }
.wi-stepper-n { font-weight: 650; color: var(--wi-ink); }
.wi-stepper-done { color: var(--wi-muted); white-space: nowrap; }
.wi-st-list { list-style: none; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0; padding: 0 !important; margin: 0 0 6px !important; }
.wi-st { position: relative; text-align: center; }
.wi-st::before { content: ""; position: absolute; top: 14px; left: calc(-50% + 18px); right: calc(50% + 18px); height: 2px; background: var(--wi-line-2); border-radius: 2px; }
.wi-st:first-child::before { display: none; }
.wi-st.is-complete::before, .wi-st.is-current::before { background: var(--wi-ink-2); }
.wi-st a { display: flex; flex-direction: column; align-items: center; gap: 4px; text-decoration: none; color: var(--wi-ink-2); padding: 0 2px 2px; border-radius: 8px; }
.wi-st-dot { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; border: 2px solid var(--wi-line-2); background: var(--wi-surface); color: var(--wi-muted); }
.wi-st.is-complete .wi-st-dot { background: var(--wi-ink); border-color: var(--wi-ink); color: var(--wi-surface); }
.wi-st.is-current .wi-st-dot { border-color: var(--wi-brand); color: var(--wi-ink); box-shadow: 0 0 0 4px color-mix(in srgb, var(--wi-brand) 25%, transparent); }
.wi-st.is-optional .wi-st-dot { border-style: dashed; }
.wi-st-label { font-size: 12px; font-weight: 550; line-height: 1.2; }
.wi-st.is-viewing .wi-st-label { color: var(--wi-ink); font-weight: 700; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
.wi-st-bar { height: 3px; background: var(--wi-line); border-radius: 3px; overflow: hidden; }
.wi-st-bar span { display: block; height: 100%; background: var(--wi-ink-2); border-radius: 3px; }
@media (max-width: 560px) { .wi-st-label { display: none; } .wi-st.is-viewing .wi-st-dot { outline: 2px solid var(--wi-ink); outline-offset: 2px; } }

/* steps */
.wi-step { padding-top: var(--wi-s6); scroll-margin-top: 92px; }
.wi-step-head { margin: 0 0 var(--wi-s4); }
.wi-step-no { display: flex; flex-wrap: wrap; align-items: center; gap: var(--wi-s2); font-size: 13px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--wi-muted); margin: 0 0 var(--wi-s2) !important; }
.wi-step-no .wi-chip { text-transform: none; letter-spacing: 0; }
.wi-step-state { font-size: 11.5px; letter-spacing: 0.04em; padding: 1px 8px; border-radius: 999px; background: var(--wi-surface-3); color: var(--wi-ink-2); }
.wi-step-state.is-current { background: color-mix(in srgb, var(--wi-brand) 30%, transparent); color: var(--wi-ink); }
.wi-step-state.is-complete { background: var(--wi-ink); color: var(--wi-surface); }
.wi-step h2 { font-size: clamp(25px, 4.4vw, 32px); font-weight: 720; letter-spacing: -0.02em; margin: 0 0 var(--wi-s2); }
.wi-step-lede { font-size: 17px; color: var(--wi-ink-2); max-width: 64ch; margin: 0 !important; }

/* step 1 */
.wi-ask-label { font-size: 13px; color: var(--wi-muted); font-weight: 600; margin: 0 0 4px !important; }
.wi-ask-q { margin: 0 0 var(--wi-s2); font-size: 20px; font-weight: 600; line-height: 1.35; border-left: 3px solid var(--wi-brand); padding-left: var(--wi-s3); }
.wi-ask-biz { font-size: 15px; }
.wi-versus { display: grid; grid-template-columns: 1fr; gap: var(--wi-s2); margin-top: var(--wi-s3); align-items: stretch; }
@media (min-width: 640px) { .wi-versus { grid-template-columns: 1fr auto 1fr; } }
.wi-versus-opt { background: var(--wi-surface-2); border-radius: var(--wi-radius-s); padding: var(--wi-s3); }
.wi-versus-opt.is-change { background: color-mix(in srgb, var(--wi-brand) 14%, var(--wi-surface)); }
.wi-versus-opt p { margin: 0 !important; }
.wi-versus-tag { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--wi-muted); margin-bottom: 4px; }
.wi-versus-vs { align-self: center; justify-self: center; font-weight: 700; color: var(--wi-muted); font-size: 14px; }
.wi-tiles { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; margin: 0 0 var(--wi-s3); }
@media (min-width: 640px) { .wi-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.wi-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: var(--wi-s3) var(--wi-s3) 12px; text-decoration: none; color: inherit !important; box-shadow: var(--wi-shadow); transition: transform 0.15s ease, border-color 0.15s ease; }
.wi-tile:hover { transform: translateY(-1px); border-color: var(--wi-line-2); }
.wi-tile-label { font-size: 14px; color: var(--wi-ink-2); line-height: 1.35; }
.wi-tile-value { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.1; }
.wi-tile-value small { font-size: 15px; font-weight: 600; color: var(--wi-ink-2); letter-spacing: 0; }
.wi-tile-words { font-size: 13.5px; color: var(--wi-ink-2); }
.wi-tile-more { margin-top: auto; padding-top: 4px; font-size: 13px; color: var(--wi-muted); display: inline-flex; align-items: center; gap: 4px; }
.wi-callout { display: flex; gap: 12px; align-items: flex-start; border-radius: var(--wi-radius); padding: var(--wi-s3); margin: 0 0 var(--wi-s3); border: 1px solid var(--wi-line); background: var(--wi-surface); }
.wi-callout > svg { flex: none; margin-top: 2px; }
.wi-callout > div { min-width: 0; flex: 1; }
.wi-callout-title { font-weight: 650; margin-bottom: 4px !important; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.wi-callout ul { margin-bottom: 0; }
.wi-callout--warn { background: var(--wi-warn-wash); border-color: color-mix(in srgb, var(--wi-warn) 40%, transparent); }
.wi-callout--warn > svg { color: var(--wi-warn); }
.wi-callout--neg { background: var(--wi-neg-wash); border-color: color-mix(in srgb, var(--wi-neg) 30%, transparent); scroll-margin-top: 96px; }
.wi-callout--neg > svg { color: var(--wi-neg); }
.wi-callout--info > svg { color: var(--wi-src-owner); }

/* step 2 */
.wi-legend-wrap { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: var(--wi-s3) var(--wi-s4); margin: 0 0 var(--wi-s4); }
.wi-legend-title { font-weight: 650; font-size: 15px; margin-bottom: var(--wi-s2) !important; }
.wi-legend { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: 10px; }
.wi-legend li { display: grid; grid-template-columns: 128px 1fr; gap: var(--wi-s2) 12px; align-items: baseline; font-size: 14.5px; color: var(--wi-ink-2); }
.wi-legend .wi-chip { justify-self: start; }
@media (max-width: 480px) { .wi-legend li { grid-template-columns: 1fr; gap: 2px; } }
.wi-in-group { margin: 0 0 var(--wi-s4); }
.wi-in-group > .wi-small { margin-top: -4px; }
.wi-table { width: 100%; border-collapse: collapse; font-size: 15px; background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); overflow: hidden; border-spacing: 0; }
.wi-table th, .wi-table td { text-align: left; vertical-align: top; padding: 12px var(--wi-s3); border-top: 1px solid var(--wi-line); }
.wi-table thead th { border-top: 0; font-size: 12.5px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--wi-muted); background: var(--wi-surface-2); padding-top: 10px; padding-bottom: 10px; }
.wi-table tbody th { font-weight: 550; }
.wi-in-value .wi-num { font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wi-in-src { white-space: nowrap; width: 1%; }
.wi-in-label { display: block; }
.wi-note { display: flex; gap: 6px; font-size: 13px; color: var(--wi-ink-2); margin: 6px 0 0 !important; line-height: 1.4; }
.wi-note svg { flex: none; color: var(--wi-src-assumption); margin-top: 1px; width: 15px; height: 15px; }
.wi-why { margin-top: 4px; }
.wi-why summary, .wi-maths summary, .wi-story summary, .wi-tableview summary { cursor: pointer; font-size: 13.5px; font-weight: 600; color: var(--wi-link); list-style: none; display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; min-height: 28px; }
.wi-why summary::-webkit-details-marker, .wi-maths summary::-webkit-details-marker, .wi-story summary::-webkit-details-marker, .wi-tableview summary::-webkit-details-marker { display: none; }
.wi-why summary::before, .wi-maths summary::before, .wi-story summary::before, .wi-tableview summary::before { content: ""; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); margin-right: 4px; transition: transform 0.15s ease; }
.wi-why[open] summary::before, .wi-maths[open] summary::before, .wi-story[open] summary::before, .wi-tableview[open] summary::before { transform: rotate(45deg); }
.wi-why p { font-size: 14px; font-weight: 400; color: var(--wi-ink-2); margin: 2px 0 0 !important; max-width: 52ch; }
.wi-table--plain { font-size: 14px; box-shadow: none; }
.wi-table--plain th, .wi-table--plain td { padding: 8px 12px; font-variant-numeric: tabular-nums; }
.wi-table--plain tr.is-be { background: var(--wi-surface-2); font-weight: 650; }
@media (max-width: 640px) {
  .wi-inputs, .wi-inputs tbody, .wi-inputs tr, .wi-inputs th, .wi-inputs td { display: block; width: auto; }
  .wi-inputs thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .wi-inputs { border: 0; background: transparent; overflow: visible; }
  .wi-inputs tr { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius-s); padding: 12px var(--wi-s3); margin-bottom: var(--wi-s2); display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; }
  .wi-inputs th, .wi-inputs td { border: 0; padding: 0; }
  .wi-inputs tbody th { grid-column: 1 / -1; }
  .wi-inputs .wi-in-src { width: auto; align-self: start; justify-self: end; }
  .wi-table--plain th, .wi-table--plain td { padding: 6px 8px; }
}
.wi-figs { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: 0; background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); }
.wi-fig { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: baseline; padding: 12px var(--wi-s3); border-top: 1px solid var(--wi-line); }
.wi-fig:first-child { border-top: 0; }
.wi-fig-label { font-size: 14.5px; color: var(--wi-ink-2); }
.wi-fig-value { font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.wi-fig .wi-chip { justify-self: start; }
.wi-fig-chips { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.wi-fig--row { padding: 8px 0; }
.wi-working { margin-top: auto; padding-top: var(--wi-s3); }
.wi-working-h { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--wi-muted); margin: 0 !important; }
.wi-working-h .wi-chip { text-transform: none; letter-spacing: 0; font-weight: 600; }
.wi-scn-net + .wi-maths { margin: 0 0 4px; }
.wi-meter-wrap { margin: var(--wi-s2) 0 4px; max-width: 520px; }
.wi-meter { height: 12px; border-radius: 12px; background: var(--wi-surface); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wi-neg) 30%, var(--wi-line)); overflow: hidden; }
.wi-meter span { display: block; height: 100%; border-radius: 12px; background: var(--wi-neg); }
.wi-meter.is-over span { background: repeating-linear-gradient(45deg, var(--wi-neg) 0 8px, var(--wi-neg-ink) 8px 16px); }
.wi-meter-l { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; font-size: 14px; margin: 6px 0 0 !important; }
.wi-fig .wi-maths { grid-column: 1 / -1; }
.wi-figs--tight { border: 0; border-radius: 0; background: transparent; border-top: 1px solid var(--wi-line); margin-top: var(--wi-s3) !important; }
.wi-figs--tight .wi-fig { padding: 10px 0; }
.wi-maths-body { font-family: var(--wi-mono); font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--wi-surface-2); border: 1px solid var(--wi-line); border-radius: var(--wi-radius-s); padding: 12px 14px; margin: 4px 0 0; color: var(--wi-ink); }
.wi-when-open { display: none; }
.wi-maths[open] .wi-when-open { display: inline; }
.wi-maths[open] .wi-when-closed { display: none; }

/* step 3 */
.wi-scns { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; margin: 0 0 var(--wi-s3); }
.wi-scns-rest { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; }
@media (min-width: 700px) { .wi-scns-rest { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
details.wi-scns-more { background: transparent; border-style: dashed; }
.wi-scn { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: var(--wi-s4) var(--wi-s3) var(--wi-s3); box-shadow: var(--wi-shadow); min-width: 0; display: flex; flex-direction: column; }
.wi-scn.is-main { border: 2px solid var(--wi-ink); }
.wi-scn-head { display: flex; align-items: center; justify-content: space-between; gap: var(--wi-s2); margin-bottom: var(--wi-s2); flex-wrap: wrap; }
.wi-scn-name { font-size: 18px; font-weight: 700; }
.wi-scn-assume { font-size: 14.5px; color: var(--wi-ink-2); }
.wi-scn-assume strong { color: var(--wi-ink); }
.wi-scn-net { display: flex; flex-direction: column; margin: var(--wi-s2) 0 4px !important; }
.wi-scn-net-v { font-size: 34px; font-weight: 760; letter-spacing: -0.025em; line-height: 1.05; }
.wi-scn-net-l { font-size: 13.5px; color: var(--wi-ink-2); font-weight: 500; }
.wi-scn-month { font-size: 14px; color: var(--wi-ink-2); font-weight: 550; }
.wi-scn-plain { font-size: 14.5px; margin-top: var(--wi-s2) !important; }
.wi-chart { margin: 0 0 var(--wi-s3); }
.wi-chart figcaption { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-bottom: var(--wi-s2); }
.wi-chart-title { font-weight: 650; font-size: 16px; }
.wi-chart-sub { flex-basis: 100%; font-size: 14px; color: var(--wi-muted); }
.wi-chart-box { width: 100%; min-width: 0; }
.wi-chart-box svg { display: block; width: 100%; height: auto; overflow: visible; }
.wi-big-unc { font-size: 15px; }
.wi-tableview { margin-top: var(--wi-s2); }
.wi-tableview > table, .wi-tableview > ul, .wi-tableview > ol { margin-top: var(--wi-s2); }

/* svg marks */
.wi-svg { font-family: var(--wi-font); }
.wi-svg text { font-family: var(--wi-font); }
.wi-tick { font-size: 12px; fill: var(--wi-muted); font-variant-numeric: tabular-nums; }
.wi-axis-label { font-size: 12px; fill: var(--wi-muted); }
.wi-value { font-size: 13px; font-weight: 650; fill: var(--wi-ink); font-variant-numeric: tabular-nums; }
.wi-row-label { font-size: 13.5px; font-weight: 600; fill: var(--wi-ink); }
.wi-row-sub { font-weight: 400; fill: var(--wi-muted); }
.wi-bar-row.is-hl .wi-row-label { font-weight: 750; }
.wi-bar--pos { fill: var(--wi-pos); }
.wi-bar--neg { fill: var(--wi-neg); }
.wi-bar--zero { fill: var(--wi-muted); }
.wi-bar--accent { fill: var(--wi-src-assumption); }
.wi-bar--muted { fill: var(--wi-line-2); }
.wi-zero { stroke: var(--wi-ink-2); stroke-width: 1.5; }
.wi-grid { stroke: var(--wi-line); stroke-width: 1; }
.wi-axis { stroke: var(--wi-line-2); stroke-width: 1; }
.wi-axis--strong { stroke: var(--wi-ink-2); stroke-width: 1.5; }
.wi-ref { stroke-width: 1.5; }
.wi-ref--neg { stroke: var(--wi-neg); stroke-dasharray: 5 4; }
.wi-ref--be { stroke: var(--wi-ink); stroke-width: 2; }
.wi-ref-label { font-size: 12px; font-weight: 600; fill: var(--wi-neg-ink); }
.wi-ref-label--be { fill: var(--wi-ink); font-size: 12.5px; font-weight: 700; }
.wi-zone--pos { fill: var(--wi-pos-wash); }
.wi-zone--neg { fill: var(--wi-neg-wash); }
.wi-zone-label { font-size: 12px; font-weight: 600; fill: var(--wi-ink-2); }
.wi-line { fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.wi-line--pos { stroke: var(--wi-pos); }
.wi-line--neg { stroke: var(--wi-neg); }
.wi-guess { fill: var(--wi-surface); stroke: var(--wi-src-assumption); stroke-width: 3; }
.wi-guess-label { font-size: 12px; font-weight: 650; fill: var(--wi-ink-2); }
.wi-cursor-line { stroke: var(--wi-ink); stroke-width: 1; opacity: 0.45; }
.wi-cursor-dot { fill: var(--wi-ink); stroke: var(--wi-surface); stroke-width: 2; }
.wi-cursor-box { fill: var(--wi-ink); }
.wi-cursor-text { fill: var(--wi-surface); font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.wi-hit { cursor: ew-resize; touch-action: pan-y; }
.wi-col--active { fill: var(--wi-src-imagined-wash); stroke: color-mix(in srgb, var(--wi-src-imagined) 45%, transparent); stroke-width: 1; }
.wi-col--engaged { fill: var(--wi-src-imagined); }
.wi-net-ring { fill: none; stroke: var(--wi-line); stroke-width: 1; }
.wi-net-link { fill: none; stroke: var(--wi-ink-2); stroke-width: 1.5; opacity: 0.6; }
.wi-net-arrow { fill: var(--wi-ink-2); }
.wi-net-round rect { fill: var(--wi-surface); stroke: var(--wi-line-2); stroke-width: 1; }
.wi-net-round text { font-size: 10.5px; font-weight: 650; fill: var(--wi-ink-2); }
.wi-net-dot { stroke-width: 2; }
.wi-net-initial { font-size: 13px; font-weight: 750; fill: var(--wi-ink); }
.wi-net-name { font-size: 12px; font-weight: 550; fill: var(--wi-ink-2); }
.wi-net-node.is-quiet { opacity: 0.5; }
.wi-mark-stem { stroke: var(--wi-line-2); stroke-width: 1; }
.wi-mark-guess { fill: var(--wi-src-assumption); stroke: var(--wi-surface); stroke-width: 2; }
.wi-mark-label { font-size: 12.5px; font-weight: 600; fill: var(--wi-ink-2); }
.wi-mark-actual { fill: var(--wi-ink); stroke: var(--wi-surface); stroke-width: 3; }
.wi-mark-actual-label { font-size: 13.5px; font-weight: 750; fill: var(--wi-ink); }
.wi-pulse-text { animation: wi-fade 1.6s ease-in-out infinite; }
.wi-row-label, .wi-value, .wi-ref-label, .wi-guess-label, .wi-mark-label, .wi-mark-actual-label, .wi-axis-label, .wi-net-name { paint-order: stroke; stroke: var(--wi-surface); stroke-width: 4px; stroke-linejoin: round; }

/* step 4 */
.wi-breakeven { text-align: center; padding: var(--wi-s5) var(--wi-s4); background: linear-gradient(180deg, color-mix(in srgb, var(--wi-brand) 12%, var(--wi-surface)), var(--wi-surface) 70%); }
.wi-be-label { font-size: 16px; font-weight: 600; color: var(--wi-ink-2); display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; }
.wi-be-value { margin: var(--wi-s2) 0 !important; display: flex; justify-content: center; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.wi-be-big { font-size: clamp(64px, 16vw, 112px); font-weight: 780; letter-spacing: -0.045em; line-height: 0.95; }
.wi-be-small { font-size: clamp(18px, 3.4vw, 24px); font-weight: 600; color: var(--wi-ink-2); }
.wi-be-plain { font-size: 17px; max-width: 56ch; margin: 0 auto var(--wi-s2) !important; }
.wi-be-vs { display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 15px; color: var(--wi-ink-2); }
.wi-breakeven .wi-maths { text-align: left; max-width: 620px; margin: var(--wi-s2) auto 0; }
.wi-breakeven .wi-maths summary { margin: 0 auto; display: flex; justify-content: center; }
.wi-explorer-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wi-explorer-head .wi-h3 { margin: 0 !important; }
.wi-explorer > .wi-small { margin: 6px 0 var(--wi-s3) !important; }
.wi-slider-row { margin: var(--wi-s3) 0 var(--wi-s2); }
.wi-slider-row.is-aligned .wi-slider, .wi-slider-row.is-aligned .wi-slider-scale { margin-left: calc(var(--wi-plot-l, 15px) - 15px); width: calc(100% - var(--wi-plot-l, 15px) - var(--wi-plot-r, 15px) + 30px); }
.wi-slider-row.is-aligned .wi-slider-scale { padding: 0 6px; }
.wi-slider-label { display: block; font-weight: 650; font-size: 15px; margin-bottom: 6px; }
.wi-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; margin: 0; cursor: pointer; }
.wi-slider::-webkit-slider-runnable-track { height: 8px; border-radius: 8px; background: linear-gradient(90deg, var(--wi-neg-wash), var(--wi-surface-3) 50%, var(--wi-pos-wash)), var(--wi-surface-3); border: 1px solid var(--wi-line-2); }
.wi-slider::-moz-range-track { height: 8px; border-radius: 8px; background: var(--wi-surface-3); border: 1px solid var(--wi-line-2); }
.wi-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -12px; border-radius: 50%; background: var(--wi-surface); border: 3px solid var(--wi-ink); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); }
.wi-slider::-moz-range-thumb { width: 26px; height: 26px; border-radius: 50%; background: var(--wi-surface); border: 3px solid var(--wi-ink); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); }
.wi-slider:focus-visible { outline: none; }
.wi-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px var(--wi-focus); }
.wi-slider:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 4px var(--wi-focus); }
.wi-slider-scale { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--wi-muted); font-variant-numeric: tabular-nums; }
.wi-readout { display: block; background: var(--wi-surface-2); border-radius: var(--wi-radius-s); padding: 12px var(--wi-s3); margin: 0 0 var(--wi-s3); }
.wi-readout-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin: 0 0 4px !important; }
.wi-readout-x { font-size: 15px; color: var(--wi-ink-2); flex-basis: 100%; }
.wi-readout-x strong { color: var(--wi-ink); font-size: 17px; }
.wi-readout-net { font-size: 28px; font-weight: 760; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.wi-readout-net small { display: block; font-size: 14px; font-weight: 550; color: var(--wi-ink-2); letter-spacing: 0; }
.wi-readout-month { font-size: 14px; color: var(--wi-ink-2); }
.wi-readout-vs { font-size: 14px; color: var(--wi-ink-2); margin: 0 !important; }
.wi-whybox { border-left: 3px solid var(--wi-brand); padding: 2px 0 2px var(--wi-s3); margin: 0 0 var(--wi-s2); }
.wi-whybox p { margin: 0 !important; font-size: 16px; }

/* step 5 */
.wi-running { display: flex; gap: 14px; align-items: flex-start; padding: var(--wi-s3); border-radius: var(--wi-radius); background: var(--wi-src-imagined-wash); border: 1px solid color-mix(in srgb, var(--wi-src-imagined) 35%, transparent); margin: 0 0 var(--wi-s3); }
.wi-running p { margin: 0 0 2px !important; }
.wi-pulse { flex: none; width: 14px; height: 14px; margin-top: 5px; border-radius: 50%; background: var(--wi-src-imagined); animation: wi-pulse 1.6s ease-in-out infinite; }
@keyframes wi-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--wi-src-imagined) 50%, transparent); } 50% { box-shadow: 0 0 0 9px transparent; } }
@keyframes wi-fade { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.wi-caveat { border: 2px solid var(--wi-ink); border-radius: var(--wi-radius); padding: var(--wi-s4); margin: 0 0 var(--wi-s3); background: var(--wi-surface); }
.wi-caveat .wi-h3 { display: flex; gap: 8px; align-items: center; }
.wi-caveat-cols { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; }
@media (min-width: 640px) { .wi-caveat-cols { grid-template-columns: 1fr 1fr; } }
.wi-caveat-cols ul { margin: 0 !important; font-size: 15px; }
.wi-caveat-cols li { margin-bottom: 4px; }
.wi-caveat-k { font-weight: 700; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 4px !important; }
.wi-caveat-k.is-can { color: var(--wi-pos-ink); }
.wi-caveat-k.is-cannot { color: var(--wi-neg-ink); }
.wi-caveat-note { margin: var(--wi-s3) 0 0 !important; padding-top: 12px; border-top: 1px solid var(--wi-line); font-size: 14.5px; color: var(--wi-ink-2); }
.wi-reh-change { font-size: 16px; }
.wi-reh-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.wi-reh-meta span { font-size: 13px; font-weight: 600; background: var(--wi-surface-2); padding: 2px 10px; border-radius: 999px; }
.wi-reh-flow { list-style: none; padding: 0 !important; margin: var(--wi-s2) 0 0 !important; display: flex; flex-wrap: wrap; gap: 6px; counter-reset: flow; }
.wi-reh-flow li { counter-increment: flow; font-size: 13px; font-weight: 600; color: var(--wi-ink-2); display: inline-flex; align-items: center; gap: 6px; }
.wi-reh-flow li::before { content: counter(flow); width: 20px; height: 20px; display: inline-grid; place-items: center; font-size: 11.5px; border-radius: 50%; background: var(--wi-src-imagined-wash); color: var(--wi-ink); }
.wi-reh-flow li + li::after { content: none; }
.wi-reh-flow li:not(:last-child)::after { content: "→"; color: var(--wi-muted); margin-left: 2px; }
.wi-sub { margin: 0 0 var(--wi-s4); min-width: 0; }
.wi-two > .wi-sub { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: var(--wi-s3); box-shadow: var(--wi-shadow); }
.wi-sub-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: var(--wi-s2); }
.wi-sub-head .wi-h3 { margin: 0 !important; }
.wi-funnel { list-style: none; padding: 0 !important; margin: 0 0 var(--wi-s2) !important; display: grid; gap: 12px; }
.wi-funnel li { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; }
.wi-funnel-label { font-size: 14.5px; grid-column: 1 / -1; }
.wi-dots { display: flex; flex-wrap: wrap; gap: 5px; }
.wi-dots i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--wi-src-imagined) 55%, transparent); }
.wi-dots i.is-on { background: var(--wi-src-imagined); border-color: var(--wi-src-imagined); }
.wi-funnel-n { font-weight: 650; font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wi-chart-legend, .wi-tl-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--wi-ink-2); margin: 0 0 var(--wi-s2); }
.wi-chart-legend span, .wi-tl-legend span { display: inline-flex; align-items: center; gap: 6px; }
.wi-sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; }
.wi-sw.is-active { background: var(--wi-src-imagined-wash); border: 1px solid color-mix(in srgb, var(--wi-src-imagined) 45%, transparent); }
.wi-sw.is-engaged { background: var(--wi-src-imagined); }
.wi-sw.is-pos { background: var(--wi-pos-wash); border: 1px solid color-mix(in srgb, var(--wi-pos) 45%, transparent); }
.wi-sw.is-neutral { background: var(--wi-surface-3); border: 1px solid var(--wi-line-2); }
.wi-sw.is-away { border: 1.5px dashed var(--wi-line-2); }
.wi-personas { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: var(--wi-s3); grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); }
.wi-persona { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: var(--wi-s3); box-shadow: var(--wi-shadow); min-width: 0; }
.wi-persona-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.wi-persona-id { flex: 1; min-width: 0; }
.wi-persona-name { font-size: 16.5px; font-weight: 700; }
.wi-persona-seg { font-size: 13.5px; color: var(--wi-muted); margin: 0 !important; }
.wi-att { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 650; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--wi-line-2); color: var(--wi-ink-2); white-space: nowrap; }
.wi-att.is-fan { border-color: color-mix(in srgb, var(--wi-pos) 50%, transparent); background: var(--wi-pos-wash); }
.wi-att.is-fan svg { color: var(--wi-pos); }
.wi-att.is-sceptical { border-color: color-mix(in srgb, var(--wi-neg) 45%, transparent); background: var(--wi-neg-wash); }
.wi-att.is-sceptical svg { color: var(--wi-neg); }
.wi-persona-facts { display: grid; gap: 0; margin: 0 0 10px; background: var(--wi-surface-2); border-radius: 10px; padding: 4px 10px; }
.wi-persona-facts div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 4px 0; min-width: 0; }
.wi-persona-facts div + div { border-top: 1px solid var(--wi-line); }
.wi-persona-facts dt { font-size: 13px; color: var(--wi-muted); font-weight: 550; flex: none; }
.wi-persona-facts dd { margin: 0; font-size: 13.5px; font-weight: 650; line-height: 1.3; text-align: right; }
.wi-persona-rep { font-size: 14px; }
.wi-story p, .wi-story-facts { font-size: 14px; color: var(--wi-ink-2); }
.wi-story-facts { list-style: none; padding: 0 !important; margin: 6px 0 0 !important; display: grid; gap: 2px; }
.wi-avatar { flex: none; --seg: var(--wi-src-imagined); width: 44px; height: 44px; border-radius: 50%; display: inline-grid; place-items: center; font-weight: 750; font-size: 18px; color: var(--wi-ink); background: color-mix(in srgb, var(--seg) 24%, var(--wi-surface)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--seg) 60%, transparent); }
.wi-avatar--sm { width: 30px; height: 30px; font-size: 13.5px; }
.wi-avatar--event { --seg: var(--wi-brand); }
.wi-seg-office_worker { --seg: #2a78d6; }
.wi-seg-freelancer { --seg: #1baf7a; }
.wi-seg-student { --seg: #eb6834; }
.wi-seg-parent { --seg: #e87ba4; }
.wi-seg-regular { --seg: #c98500; }
.wi-seg-tourist { --seg: #7d6fe0; }
.wi-seg-retiree { --seg: #3f9b3f; }
.wi-seg-trades { --seg: #e34948; }
.wi-net-dot { --seg: var(--wi-src-imagined); fill: color-mix(in srgb, var(--seg) 24%, var(--wi-surface)); stroke: color-mix(in srgb, var(--seg) 70%, transparent); }
.wi-tabs { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: var(--wi-surface-3); border-radius: 999px; margin: 0 0 var(--wi-s3); max-width: 100%; }
.wi-tabs [role="tab"] { font: inherit; font-size: 14px; font-weight: 600; border: 0; background: transparent; color: var(--wi-ink-2); padding: 8px 14px; border-radius: 999px; cursor: pointer; min-height: 40px; }
.wi-tabs [role="tab"][aria-selected="true"] { background: var(--wi-surface); color: var(--wi-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.wi-panel { margin: 0 0 var(--wi-s4); min-width: 0; }
.wi-tl-wrap { width: 100%; }
.wi-timeline { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 4px; margin: 0 -4px; width: calc(100% + 8px); }
.wi-timeline thead th { font-weight: 600; text-align: center; vertical-align: bottom; padding: 0 2px 4px; }
.wi-timeline thead th:first-child { width: 26%; }
.wi-tl-r { display: block; font-size: 13px; font-weight: 750; }
.wi-tl-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 11.5px; color: var(--wi-muted); line-height: 1.25; font-weight: 500; }
.wi-tl-event { margin-left: 2px; }
.wi-timeline tbody th { text-align: left; font-weight: 600; font-size: 13.5px; padding: 0 2px; }
.wi-tl-who { display: flex; align-items: center; gap: 6px; min-width: 0; }
.wi-tl-who > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wi-timeline td { padding: 0; vertical-align: top; height: 1px; }
.wi-cell { font: inherit; display: flex; align-items: center; justify-content: center; text-align: center; width: 100%; height: 100%; min-height: 44px; padding: 6px 4px; border-radius: 8px; font-size: 12px; line-height: 1.2; font-weight: 600; border: 1px solid transparent; color: var(--wi-ink); background: var(--wi-surface-2); overflow-wrap: break-word; word-break: normal; hyphens: auto; -webkit-hyphens: auto; }
button.wi-cell { cursor: pointer; }
button.wi-cell:hover { border-color: var(--wi-ink-2); }
.wi-cell.is-pos { background: var(--wi-pos-wash); border-color: color-mix(in srgb, var(--wi-pos) 40%, transparent); }
.wi-cell.is-neutral { background: var(--wi-surface-3); }
.wi-cell.is-away { background: transparent; border: 1.5px dashed var(--wi-line-2); color: var(--wi-muted); font-weight: 500; }
.wi-cell.is-elsewhere { background: color-mix(in srgb, var(--wi-elsewhere) 13%, var(--wi-surface)); border: 1.5px solid color-mix(in srgb, var(--wi-elsewhere) 70%, transparent); flex-direction: column; gap: 1px; }
.wi-cell-ico { font-size: 13px; line-height: 1; color: var(--wi-elsewhere); font-weight: 800; }
.wi-cell.is-future { background: transparent; color: var(--wi-muted); border: 1px solid var(--wi-line); }
.wi-cell.is-running { background: var(--wi-src-imagined-wash); color: var(--wi-ink-2); animation: wi-fade 1.6s ease-in-out infinite; }
.wi-cell.is-selected { outline: 2.5px solid var(--wi-ink); outline-offset: 1px; }
.wi-tl-events { list-style: none; padding: 0 !important; font-size: 14px; }
.wi-thought { min-height: 64px; background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius-s); padding: 12px var(--wi-s3); margin: var(--wi-s2) 0; }
.wi-thought p { margin: 0 !important; }
.wi-thought-who { font-size: 13.5px; font-weight: 650; color: var(--wi-ink-2); margin-bottom: 4px !important; }
.wi-thought-text { font-size: 16px; font-style: italic; }
.wi-allthoughts { font-size: 14px; padding-left: 0 !important; list-style: none; }
.wi-allthoughts ul { padding-left: 1.1em; }
.wi-feed { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: 10px; }
.wi-feed-item { display: flex; gap: 12px; align-items: flex-start; background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius-s); padding: 12px 14px; }
.wi-feed-item > div { min-width: 0; }
.wi-feed-item.is-event { background: color-mix(in srgb, var(--wi-brand) 12%, var(--wi-surface)); }
.wi-feed-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; color: var(--wi-muted); margin: 0 0 2px !important; }
.wi-feed-meta strong { color: var(--wi-ink); }
.wi-feed-round { font-weight: 650; }
.wi-feed-text { margin: 0 !important; font-size: 15px; }
.wi-net-box { max-width: 520px; margin: 0 auto; }
.wi-netlist { font-size: 14px; }
.wi-quotes { display: grid; gap: var(--wi-s2); grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.wi-quote { margin: 0; display: flex; gap: 10px; align-items: flex-start; background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius-s); padding: 12px 14px; }
.wi-quote blockquote { margin: 0 0 4px; font-size: 15px; font-style: italic; }
.wi-quote figcaption { font-size: 13px; color: var(--wi-muted); }
.wi-qlist { font-size: 15.5px; }
.wi-qlist li { margin-bottom: 6px; }
.wi-checklist { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: 8px; }
.wi-checklist li { position: relative; padding-left: 28px; font-size: 15px; }
.wi-checklist li::before { content: ""; position: absolute; left: 2px; top: 4px; width: 16px; height: 16px; border-radius: 5px; border: 2px solid var(--wi-line-2); background: var(--wi-surface); }
.wi-checkreal { border-color: color-mix(in srgb, var(--wi-src-owner) 35%, var(--wi-line)); }
.wi-interview { margin: 0 0 var(--wi-s3); }
.wi-interview-q { font-weight: 650; font-size: 16px; }
.wi-answers { list-style: none; padding: 0 !important; display: grid; gap: 8px; }
.wi-answers li { display: flex; gap: 10px; align-items: flex-start; }
.wi-answers li > div { background: var(--wi-surface-2); border-radius: 4px 14px 14px 14px; padding: 8px 12px; min-width: 0; }
.wi-answers p { margin: 0 !important; font-size: 15px; }
.wi-answer-name { font-size: 13px !important; font-weight: 650; color: var(--wi-ink-2); }
.wi-empty p:last-child { margin-bottom: 0 !important; }

/* step 6 */
.wi-testcard { border: 2px solid var(--wi-ink); padding: var(--wi-s4); }
.wi-tc-head { display: grid; grid-template-columns: 1fr auto; gap: 0 var(--wi-s3); align-items: start; margin-bottom: var(--wi-s2); }
.wi-tc-head .wi-eyebrow { grid-column: 1 / -1; }
.wi-tc-title { font-size: 22px; font-weight: 720; }
.wi-tc-days-badge { font-size: 14px; font-weight: 700; padding: 4px 12px; border-radius: 999px; background: var(--wi-ink); color: var(--wi-surface); white-space: nowrap; margin: 0 !important; }
.wi-tc-plain { font-size: 16px; color: var(--wi-ink-2); }
.wi-tc-grid { display: grid; gap: var(--wi-s3) var(--wi-s4); grid-template-columns: 1fr; margin: var(--wi-s3) 0; }
@media (min-width: 700px) { .wi-tc-grid { grid-template-columns: 1fr 1fr; } }
.wi-tc-block { min-width: 0; margin-bottom: var(--wi-s2); }
.wi-tc-measure { list-style: none; padding: 0 !important; display: grid; gap: 8px; }
.wi-tc-measure li { display: grid; gap: 0; font-size: 15px; border-left: 3px solid var(--wi-src-owner); padding-left: 10px; }
.wi-tc-measure span { color: var(--wi-ink-2); font-size: 14px; }
.wi-tc-days { list-style: none; padding: 0 !important; display: grid; gap: 6px; }
.wi-tc-days li { display: grid; grid-template-columns: 64px 1fr; gap: 8px; font-size: 15px; }
.wi-tc-day { font-weight: 700; font-size: 13px; background: var(--wi-surface-2); border-radius: 6px; text-align: center; padding: 2px 0; height: fit-content; }
.wi-rule { display: grid; gap: var(--wi-s2); grid-template-columns: 1fr; }
@media (min-width: 640px) { .wi-rule { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.wi-rule-item { display: flex; gap: 10px; align-items: flex-start; border-radius: var(--wi-radius-s); padding: 12px; border: 1px solid var(--wi-line); }
.wi-rule-item svg { flex: none; margin-top: 2px; }
.wi-rule-item p { margin: 0 !important; font-size: 14.5px; }
.wi-rule-item strong { display: block; font-size: 15px; }
.wi-rule-item.is-keep { background: var(--wi-pos-wash); }
.wi-rule-item.is-keep svg { color: var(--wi-pos); }
.wi-rule-item.is-tweak { background: var(--wi-warn-wash); }
.wi-rule-item.is-tweak svg { color: var(--wi-warn); }
.wi-rule-item.is-stop { background: var(--wi-neg-wash); }
.wi-rule-item.is-stop svg { color: var(--wi-neg); }
.wi-tc-cap { font-size: 15px; background: var(--wi-surface-2); border-radius: var(--wi-radius-s); padding: 10px 14px; }
.wi-tc-actions { display: flex; justify-content: flex-end; margin-top: var(--wi-s2); }
.wi-result-top { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; margin: 0 0 var(--wi-s3); }
@media (min-width: 700px) { .wi-result-top { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.wi-result-top > p { margin: 0 !important; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; background: var(--wi-surface-2); border-radius: var(--wi-radius-s); padding: 12px 14px; }
.wi-result-top strong { font-size: 26px; font-weight: 760; letter-spacing: -0.02em; }
.wi-verdict { flex-direction: row !important; align-items: center !important; gap: 10px !important; }
.wi-verdict span { display: flex; flex-direction: column; font-size: 22px; font-weight: 750; }
.wi-verdict small { font-size: 12.5px; font-weight: 600; color: var(--wi-muted); }
.wi-verdict svg { width: 30px; height: 30px; }
.wi-verdict.is-keep { background: var(--wi-pos-wash) !important; } .wi-verdict.is-keep svg { color: var(--wi-pos); }
.wi-verdict.is-tweak { background: var(--wi-warn-wash) !important; } .wi-verdict.is-tweak svg { color: var(--wi-warn); }
.wi-verdict.is-stop { background: var(--wi-neg-wash) !important; } .wi-verdict.is-stop svg { color: var(--wi-neg); }
.wi-observed { list-style: none; padding: 0 !important; display: grid; gap: 4px; font-size: 14px; }
.wi-observed li { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--wi-line); padding: 4px 0; }

/* closing */
.wi-lessons { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: 10px; }
.wi-lessons li { display: flex; gap: 10px; align-items: flex-start; font-size: 16px; }
.wi-lessons svg { flex: none; margin-top: 4px; color: var(--wi-pos); }
.wi-nextq { list-style: none; padding: 0 !important; display: grid; gap: 8px; margin: 0 0 var(--wi-s3) !important; }
.wi-nextq li { background: var(--wi-surface); border: 1px solid var(--wi-line-2); border-left: 3px solid var(--wi-brand); border-radius: 10px; padding: 8px 14px; font-size: 15px; }
.wi-method-steps { list-style: none; padding: 0 !important; display: grid; gap: var(--wi-s2); grid-template-columns: 1fr; margin: var(--wi-s2) 0 var(--wi-s3) !important; }
@media (min-width: 700px) { .wi-method-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.wi-method-steps li { display: flex; gap: 12px; align-items: flex-start; background: var(--wi-surface-2); border-radius: var(--wi-radius-s); padding: 12px 14px; position: relative; }
.wi-method-steps p { margin: 2px 0 0 !important; font-size: 14px; color: var(--wi-ink-2); }
.wi-method-n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--wi-ink); color: var(--wi-surface); display: grid; place-items: center; font-weight: 750; font-size: 14px; }
.wi-glossary dl { margin: 0; display: grid; gap: 10px; }
.wi-glossary dt { font-weight: 700; font-size: 15px; }
.wi-glossary dd { margin: 0; font-size: 14.5px; color: var(--wi-ink-2); }
.wi-privacy > svg { color: var(--wi-src-owner); margin-bottom: 6px; }
.wi-privacy p { font-size: 15px; }
.wi-footnote { font-size: 13.5px; color: var(--wi-muted); margin-top: var(--wi-s4) !important; text-align: center; max-width: 68ch; margin-left: auto !important; margin-right: auto !important; }
.wi-nojs-hidden { display: none; }
.wi-print-clone { display: none; }

/* disclosures added for the phone: warnings, facts, privacy, rehearsal views, interviews */
details.wi-warn-d { display: block; padding: 0; }
details.wi-warn-d > summary { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px var(--wi-s3); cursor: pointer; list-style: none; font-weight: 650; }
details.wi-warn-d > summary > svg { color: var(--wi-warn); flex: none; }
details.wi-warn-d > ul { margin: 0 var(--wi-s3) var(--wi-s3) !important; }
details.wi-warn-d > summary::-webkit-details-marker, .wi-facts summary::-webkit-details-marker, .wi-privacy summary::-webkit-details-marker { display: none; }
details.wi-warn-d > summary::after, .wi-facts summary::after, .wi-privacy summary::after { content: ""; flex: none; margin-left: auto; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); transition: transform 0.15s ease; }
details.wi-warn-d[open] > summary::after, .wi-facts details[open] > summary::after, .wi-privacy details[open] > summary::after { transform: rotate(-135deg); }
.wi-facts summary, .wi-privacy summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; min-height: 36px; }
.wi-facts details[open] > summary { margin-bottom: 4px; }
.wi-privacy summary .wi-h3 { display: inline-flex; align-items: center; gap: 8px; margin: 0 !important; }
.wi-privacy summary .wi-h3 svg { color: var(--wi-src-owner); }
.wi-privacy details[open] > summary { margin-bottom: 8px; }
details.wi-more > summary > span, .wi-people-sum { flex: 1; min-width: 0; }
details.wi-interview .wi-answers { margin-top: 12px; }
details.wi-worst-more { margin-top: 8px; background: transparent; border-color: color-mix(in srgb, var(--wi-neg) 25%, var(--wi-line)); }
details.wi-unc-more { margin-top: 4px; }

/* ---- compact on a phone: the idea first, the working on request ---- */
.wi-who-list li { display: block; }
.wi-who-list li > .wi-chip, .wi-who-list li > .wi-who-ai { margin-right: 8px; vertical-align: 1px; }
.wi-who-list li > span:last-child { display: inline; }
.wi-ai-lines li { display: block; }
.wi-ai-lines li > .wi-chip { margin-right: 8px; vertical-align: 1px; }
.wi-scn-plain { font-size: 14px; color: var(--wi-ink-2); margin: 4px 0 8px !important; }
.wi-tc-more { margin-top: var(--wi-s3); }
.wi-tc-more .wi-tc-grid { margin-top: 0; }
.wi-lessons-more { margin-top: var(--wi-s2); }
.wi-lessons-more > summary, .wi-nextq-more > summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--wi-link); min-height: 36px; display: inline-flex; align-items: center; }
.wi-lessons-more .wi-lessons { margin-top: 10px !important; }
@media (max-width: 639px) {
  .wi-step-lede { font-size: 16px; }
  .wi-step-head { margin-bottom: var(--wi-s3); }
  .wi-ask-q { font-size: 18px; }
  .wi-versus { margin-top: 12px; gap: 6px; }
  .wi-versus-opt { padding: 10px 12px; }
  .wi-versus-vs { font-size: 13px; }
  .wi-tiles { gap: 8px; }
  .wi-tile { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; padding: 10px 14px; }
  .wi-tile-label { flex-basis: 100%; font-size: 13.5px; }
  .wi-tile-value { font-size: 26px; }
  .wi-tile-cover { flex-basis: auto; }
  .wi-tile-more { margin: 0 0 0 auto; padding: 0; }
  .wi-scns { gap: 10px; }
  .wi-scn { padding: 14px 14px 10px; }
  .wi-scn-head { margin-bottom: 2px; }
  .wi-scn-net { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 4px 0 2px !important; }
  .wi-scn-net-v { font-size: 28px; }
  .wi-breakeven { padding: var(--wi-s3); }
  .wi-be-big { font-size: 64px; }
  .wi-predict-row .wi-btn { min-height: 42px; padding: 8px 14px; font-size: 14.5px; }
  .wi-method-steps { gap: 6px; }
  .wi-method-steps li { padding: 8px 12px; }
  .wi-card { margin-bottom: 12px; }
  .wi-step { padding-top: var(--wi-s5); }
  .wi-caveat { padding: 14px; }
  .wi-caveat .wi-h3 { font-size: 17px; }
  .wi-caveat-cols { gap: 6px; }
  .wi-caveat-cols ul { font-size: 14px; }
  .wi-caveat-note { margin-top: 10px !important; padding-top: 8px; font-size: 14px; }
  .wi-sub { margin-bottom: var(--wi-s3); }
  .wi-funnel { gap: 8px; }
  .wi-cell { min-height: 40px; }
  .wi-thought { min-height: 0; padding: 8px 12px; }
  .wi-method-steps p { font-size: 13.5px; }
  .wi-privacy p { font-size: 14px; }
  .wi-tc-plain { font-size: 15px; }
  .wi-rule { gap: 6px; }
  .wi-rule-item { padding: 8px 10px; }
  /* the question is the page title right above; the card keeps the comparison */
  .wi-ask-label, .wi-ask-q { display: none; }
  .wi-ask { padding: 12px 14px; }
  .wi-versus { margin-top: 0; }
  .wi-title { font-size: 27px; margin-bottom: 12px !important; }
  .wi-hero { padding: var(--wi-s4) 0 var(--wi-s2); }
  .wi-demo-ribbon { margin-bottom: var(--wi-s3); }
  .wi-step { padding-top: var(--wi-s4); }
  .wi-step h2 { font-size: 24px; }
  .wi-step-lede { font-size: 15.5px; }
  .wi-toolbar, .wi-reh-flow { display: none !important; }
  .wi-breakeven .wi-be-plain { font-size: 15.5px; }
  .wi-method-steps li { gap: 10px; }
  .wi-method-n { width: 24px; height: 24px; font-size: 13px; }
  .wi-lessons li { font-size: 15px; }
  .wi-who-list li, .wi-ai-lines li { font-size: 14.5px; }
  .wi-kv dt { font-size: 14px; }
  .wi-kv > div { padding: 5px 0; }
  .wi-method-steps { gap: 4px; margin-bottom: 8px !important; }
  .wi-method-steps li { background: transparent; padding: 4px 0; }
  .wi-method > .wi-small { display: none; }
  .wi-footnote { font-size: 12.5px; margin-top: var(--wi-s3) !important; }
  .wi-two { gap: 10px; }
  .wi-explorer > .wi-small { display: none; }
  .wi-tc-title { font-size: 19px; }
  .wi-tc-head { margin-bottom: 4px; }
  .wi-callout--info { padding: 10px 14px; font-size: 15px; }
  .wi-checkreal .wi-small { margin-bottom: 6px !important; }
  .wi-step-lede { font-size: 15px; line-height: 1.45; }
  .wi-card, .wi-caveat, .wi-testcard { padding: 14px; }
  .wi-inputs .wi-in-src { grid-column: 1 / -1; justify-self: start; white-space: normal; display: flex; flex-wrap: wrap; gap: 4px; }
  .wi-bridge { margin-top: 4px !important; }
}
/* ---- Berlin beta additions ---- */
.wi-report { --wi-elsewhere: color-mix(in srgb, var(--wi-neg) 45%, var(--wi-warn)); }

/* hero: language switcher */
.wi-hero-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--wi-s2) var(--wi-s3); margin: 0 0 var(--wi-s2); }
.wi-hero-top .wi-eyebrow { margin: 0 !important; }
.wi-lang ul { list-style: none; display: flex; align-items: center; gap: 2px; padding: 3px !important; margin: 0 !important; background: var(--wi-surface-3); border-radius: 999px; }
.wi-lang li + li::before { content: "·"; color: var(--wi-muted); margin: 0 1px; }
.wi-lang li { display: inline-flex; align-items: center; }
.wi-lang-btn { font: inherit; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; min-width: 40px; min-height: 36px; padding: 4px 10px; border: 0; border-radius: 999px; background: transparent; color: var(--wi-ink-2); cursor: pointer; }
.wi-lang-btn:hover { color: var(--wi-ink); background: color-mix(in srgb, var(--wi-surface) 60%, transparent); }
.wi-lang-btn[aria-pressed="true"] { background: var(--wi-surface); color: var(--wi-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14); cursor: default; }
.wi-demo-ribbon a { font-weight: 650; }

/* who did what */
.wi-who { padding: var(--wi-s3) var(--wi-s4); }
.wi-who .wi-h3 { font-size: 17px; }
.wi-who-list { list-style: none; padding: 0 !important; margin: 0 0 10px !important; display: grid; gap: 8px; }
.wi-who-list li { font-size: 15px; line-height: 1.5; }
.wi-who-ai { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 24px; border-radius: 999px; background: var(--wi-surface-3); color: var(--wi-ink); }
.wi-who-ai svg { width: 16px; height: 16px; }
.wi-who-list li.is-ai { padding-top: 8px; border-top: 1px solid var(--wi-line); }
.wi-who-rule, .wi-rule-box { margin: 0 !important; font-size: 14.5px; font-weight: 600; background: color-mix(in srgb, var(--wi-brand) 16%, var(--wi-surface)); border-radius: var(--wi-radius-s); padding: 8px 12px; }
@media (max-width: 480px) { .wi-who { padding: var(--wi-s3); } }

/* step 1: break-even tile covered until the owner guesses */
.wi-tile-cover { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 650; color: var(--wi-ink-2); min-height: 33px; }
.wi-tile-cover[hidden], .wi-be-cover[hidden] { display: none; }
.wi-tile-q, .wi-be-q { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; border: 2px dashed var(--wi-line-2); font-weight: 800; font-size: 18px; color: var(--wi-ink); }

/* step 2: compact numbers */
.wi-labels-note { display: flex; gap: 8px; align-items: flex-start; font-size: 14.5px; color: var(--wi-ink-2); margin: 0 0 var(--wi-s3) !important; }
.wi-labels-note svg { flex: none; color: var(--wi-src-owner); margin-top: 2px; }
.wi-nums { display: grid; gap: var(--wi-s3); grid-template-columns: 1fr; margin: 0 0 var(--wi-s3); }
@media (min-width: 720px) { .wi-nums { grid-template-columns: 1fr 1fr; } }
.wi-nums-col { background: var(--wi-surface); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); padding: 12px var(--wi-s3); box-shadow: var(--wi-shadow); min-width: 0; }
.wi-nums-col.is-guess { border-color: color-mix(in srgb, var(--wi-src-assumption) 45%, var(--wi-line)); background: color-mix(in srgb, var(--wi-src-assumption) 6%, var(--wi-surface)); }
.wi-nums-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; margin-bottom: 6px; }
.wi-nums-head .wi-h4 { margin: 0 !important; }
.wi-kv-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.wi-nums-col > .wi-small { margin: 0 0 6px !important; }
.wi-kv { margin: 0; display: grid; }
.wi-kv > div { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 12px; padding: 6px 0; border-top: 1px solid var(--wi-line); }
.wi-kv > div:first-child { border-top: 0; }
.wi-kv dt { font-size: 14.5px; color: var(--wi-ink-2); min-width: 0; }
.wi-kv dd { margin: 0; display: inline-flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 4px; text-align: right; }
.wi-kv .wi-num { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
details.wi-more { margin: 0 0 var(--wi-s2); border: 1px solid var(--wi-line); border-radius: var(--wi-radius-s); background: var(--wi-surface); }
details.wi-more > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px var(--wi-s3); font-weight: 650; font-size: 15px; color: var(--wi-ink); }
details.wi-more > summary::-webkit-details-marker { display: none; }
details.wi-more > summary::before { content: ""; flex: none; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s ease; margin-right: 2px; }
details.wi-more[open] > summary::before { transform: rotate(45deg); }
details.wi-more[open] > summary { border-bottom: 1px solid var(--wi-line); }
details.wi-more > :not(summary) { margin-left: var(--wi-s3); margin-right: var(--wi-s3); }
details.wi-more > :not(summary):first-of-type { margin-top: 12px; }
details.wi-more > :last-child { margin-bottom: var(--wi-s3); }
details.wi-more .wi-in-group { margin-bottom: var(--wi-s3); }

/* Berlin facts */
.wi-facts { padding: 12px var(--wi-s3); box-shadow: none; background: var(--wi-surface-2); }
.wi-facts-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.wi-facts-head svg { color: var(--wi-src-owner); flex: none; }
.wi-facts-head .wi-h4 { margin: 0 !important; }
.wi-facts > .wi-small { margin: 0 0 6px !important; }
.wi-facts-list { list-style: none; padding: 0 !important; margin: 0 !important; display: grid; gap: 6px; }
.wi-facts-list li { display: grid; grid-template-columns: 1fr auto; gap: 0 12px; font-size: 14px; }
.wi-fact-v { text-align: right; white-space: nowrap; }
.wi-fact-src { grid-column: 1 / -1; font-size: 12.5px; color: var(--wi-muted); }
.wi-fact-link { display: inline-flex; align-items: center; gap: 3px; }

/* step 3: the working, collapsed */
details.wi-working { margin-top: auto; padding-top: var(--wi-s2); }
details.wi-working > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--wi-muted); }
details.wi-working > summary::-webkit-details-marker { display: none; }
details.wi-working > summary::before { content: ""; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s ease; }
details.wi-working[open] > summary::before { transform: rotate(45deg); }
details.wi-working > summary .wi-chip { text-transform: none; letter-spacing: 0; }
.wi-working-net { display: grid; gap: 0; font-size: 14px; color: var(--wi-ink-2); padding-top: 4px; }
.wi-worst-range { font-size: 14.5px; font-weight: 600; }

/* point-of-use word hints */
.wi-hints { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 16px; margin-top: var(--wi-s2); }
details.wi-hint { margin-top: 4px; }
details.wi-hint > summary { cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 6px; min-height: 32px; font-size: 13.5px; font-weight: 600; color: var(--wi-link); }
details.wi-hint > summary::-webkit-details-marker { display: none; }
details.wi-hint > summary::before { content: "?"; display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid currentColor; font-size: 11.5px; font-weight: 800; }
details.wi-hint > p { margin: 2px 0 6px !important; font-size: 14.5px; color: var(--wi-ink-2); max-width: 60ch; text-align: left; }
.wi-hints details.wi-hint[open] { flex-basis: 100%; }

/* step 4: predict, then check */
.wi-predict { border: 2px dashed color-mix(in srgb, var(--wi-brand) 70%, var(--wi-line-2)); border-radius: var(--wi-radius-s); background: var(--wi-surface); padding: 14px var(--wi-s3); margin: 0 0 4px; text-align: left; }
.wi-btn--link { background: transparent; border-color: transparent; color: var(--wi-link); text-decoration: underline; text-underline-offset: 3px; padding-left: 8px; padding-right: 8px; }
.wi-btn--link:hover { filter: none; background: var(--wi-surface-2); }
.wi-predict-q { display: block; font-size: 16px; font-weight: 600; margin: 0 0 var(--wi-s2); }
.wi-predict-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--wi-s2); margin: 0 0 var(--wi-s2); }
.wi-predict-field { display: inline-flex; align-items: center; gap: 6px; }
.wi-input { font: inherit; font-size: 18px; font-weight: 700; width: 104px; min-height: 44px; padding: 6px 12px; border-radius: var(--wi-radius-s); border: 1.5px solid var(--wi-line-2); background: var(--wi-surface); color: var(--wi-ink); font-variant-numeric: tabular-nums; }
.wi-input:focus-visible { outline: 3px solid var(--wi-focus); outline-offset: 1px; }
.wi-predict-unit { font-size: 15px; color: var(--wi-ink-2); font-weight: 600; }
.wi-predict-out { font-size: 16px; font-weight: 600; margin: 0 0 6px !important; }
.wi-predict-out:empty { display: none; }
.wi-predict-out.is-shown { background: var(--wi-surface-2); border-left: 3px solid var(--wi-brand); border-radius: 6px; padding: 8px 12px; }
.wi-predict .wi-small { margin: 0 !important; }
.wi-be-label { font-size: 16px; font-weight: 600; color: var(--wi-ink-2); display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 var(--wi-s2); }
.wi-be-cover { display: flex; justify-content: center; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: var(--wi-ink-2); margin: var(--wi-s3) 0 !important; }
.wi-be-cover .wi-be-q { width: 56px; height: 56px; font-size: 30px; }
.wi-be-ongoing { max-width: 56ch; margin: var(--wi-s3) auto 0; padding: 10px 14px; border-radius: var(--wi-radius-s); background: var(--wi-surface-2); text-align: left; }
.wi-be-ongoing p { margin: 0 0 4px !important; }
.wi-be-ongoing-k { display: block; font-size: 12.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--wi-muted); }
.wi-be-ongoing strong { font-size: 18px; }
.wi-ref--on { stroke: var(--wi-ink-2); stroke-width: 1.75; stroke-dasharray: 5 4; }
.wi-ref-label--on { fill: var(--wi-ink-2); font-size: 12.5px; font-weight: 650; }
.wi-diff { font-weight: 650; margin: 0 0 6px !important; }
.wi-diff:empty { display: none; }

/* step 5 */
.wi-bridge { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; background: var(--wi-surface-2); border-radius: var(--wi-radius-s); padding: 10px 14px; margin: 0 0 var(--wi-s3) !important; }
.wi-bridge svg { flex: none; margin-top: 2px; color: var(--wi-src-imagined); }
.wi-caveat .wi-hint { margin-top: 6px; }
.wi-tl-rounds { list-style: none; padding: 0 !important; margin: 0 0 var(--wi-s2) !important; display: grid; gap: 2px; font-size: 13.5px; color: var(--wi-ink-2); }
.wi-tl-rounds strong { display: inline-block; min-width: 28px; color: var(--wi-ink); }
.wi-tl-ev-note { color: var(--wi-ink); font-weight: 600; }
.wi-sw.is-elsewhere { background: color-mix(in srgb, var(--wi-elsewhere) 18%, var(--wi-surface)); border: 1.5px solid var(--wi-elsewhere); }
.wi-sw.is-away { opacity: 0.7; }
details.wi-people > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px var(--wi-s3); border: 1px solid var(--wi-line); border-radius: var(--wi-radius); background: var(--wi-surface); }
details.wi-people > summary::-webkit-details-marker { display: none; }
details.wi-people > summary::before { content: ""; flex: none; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s ease; }
details.wi-people[open] > summary::before { transform: rotate(45deg); }
details.wi-people[open] > summary { margin-bottom: var(--wi-s3); }
.wi-people-sum { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-width: 0; }
.wi-people-sum .wi-h3 { margin: 0 !important; font-size: 17px; }
.wi-people-av { display: inline-flex; }
.wi-people-av .wi-avatar + .wi-avatar { margin-left: -7px; }
.wi-people-av .wi-avatar { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--seg) 60%, transparent), 0 0 0 2px var(--wi-surface); }

/* closing: one AI lesson */
.wi-ai-lesson { border: 2px solid var(--wi-ink); }
.wi-ai-lesson .wi-h3 { display: flex; align-items: center; gap: 8px; }
.wi-ai-lines { list-style: none; padding: 0 !important; margin: 0 0 var(--wi-s2) !important; display: grid; gap: 8px; }
.wi-ai-lines li { font-size: 15px; line-height: 1.5; }
.wi-glossary details > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; min-height: 36px; }
.wi-glossary details > summary::-webkit-details-marker { display: none; }
.wi-glossary details > summary::before { content: ""; flex: none; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s ease; }
.wi-glossary details[open] > summary::before { transform: rotate(45deg); }
.wi-glossary details > summary .wi-h3 { margin: 0 !important; }
.wi-glossary details[open] dl { margin-top: var(--wi-s2); }


@media (max-width: 480px) {
  .wi-card, .wi-caveat, .wi-testcard { padding: var(--wi-s3); }
  .wi-breakeven { padding: var(--wi-s4) var(--wi-s3); }
  /* Phones: a little less air between steps and cards keeps the whole lesson within ~13 screens. */
  .wi-step { padding-top: var(--wi-s3); }
  .wi-card, .wi-callout, details.wi-more, .wi-scns { margin-bottom: 10px; }
  .wi-sub { margin-bottom: 12px; }
  .wi-step-head { margin-bottom: var(--wi-s2); }
  .wi-scn-net-v { font-size: 30px; }
  .wi-timeline thead th:first-child { width: 22%; }
  .wi-tl-who .wi-avatar { display: none; }
  .wi-cell { font-size: 11.5px; padding: 6px 3px; }
}
@media (prefers-reduced-motion: reduce) {
  .wi-report *, .wi-report *::before, .wi-report *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}

/* ---- Berlin beta, loop 3 ---- */
/* who did what: the list one tap away on a phone, what the AI did always in view */
.wi-who-d > summary { cursor: pointer; list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-height: 40px; }
.wi-who-d > summary::-webkit-details-marker { display: none; }
.wi-who-d > summary::before { content: ""; flex: none; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s ease; }
.wi-who-d[open] > summary::before { transform: rotate(45deg); }
.wi-who-d > summary .wi-h3 { margin: 0 !important; }
.wi-who-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.wi-who-d[open] .wi-who-chips { display: none; }
.wi-who-d[open] > summary { margin-bottom: 8px; }
.wi-who-ai-line { display: flex; gap: 8px; align-items: flex-start; font-size: 15px; line-height: 1.5; margin: 8px 0 0 !important; padding-top: 8px; border-top: 1px solid var(--wi-line); }
.wi-who-ai-line .wi-who-ai { flex: none; margin-top: 1px; }
/* a worst case with no loss: calm, never the red alarm */
.wi-callout--ok { background: var(--wi-surface-2); border-color: var(--wi-line-2); scroll-margin-top: 96px; }
.wi-callout--ok > svg { color: var(--wi-pos); }
.wi-ref--worst-ok { stroke: var(--wi-ink-2); stroke-dasharray: 5 4; }
.wi-ref-label--ok { fill: var(--wi-ink-2); }
/* step 1: the second number, and what was filled in */
.wi-tile-on { flex-basis: 100%; font-weight: 600; }
.wi-filled-warn p:last-child { margin-bottom: 0 !important; }
.wi-kv-filled { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--wi-line-2); }
.wi-kv-sub { font-size: 13px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--wi-muted); margin: 0 !important; }
details.wi-filled-more > summary { cursor: pointer; min-height: 32px; display: flex; align-items: center; }
.wi-kv-filled .wi-kv dd .wi-chip { margin-left: 2px; }
/* step 3: the minimum-wage rise against what the price brings */
.wi-wage-plain { font-size: 15px; }
/* step 4: the two numbers under the slider chart */
.wi-ex-two { font-size: 14px; color: var(--wi-ink-2); margin: 6px 0 0 !important; }
/* step 5: start a rehearsal; how far it spread, in view */
.wi-reh-start { margin-top: 12px; }
.wi-reh-start .wi-btn { white-space: normal; text-align: left; }
.wi-reh-start .wi-btn[disabled] { opacity: 0.75; cursor: progress; }
.wi-reh-start-msg { margin: 8px 0 0 !important; color: var(--wi-neg-ink); }
.wi-reh-start-msg:empty { display: none; }
.wi-spread { margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--wi-line); }
.wi-spread .wi-sub-head .wi-h3 { font-size: 17px; }
.wi-spread .wi-funnel { gap: 6px; }
.wi-spread .wi-funnel li { grid-template-columns: minmax(0, 1fr) auto auto; gap: 2px 10px; }
.wi-spread .wi-funnel-label { grid-column: auto; font-size: 14.5px; line-height: 1.3; }
.wi-spread .wi-dots i { width: 12px; height: 12px; }
.wi-spread .wi-dots { gap: 4px; flex-wrap: nowrap; }
.wi-funnel-note { margin: 4px 0 0 !important; }
details.wi-views[open] > summary { border-bottom: 1px solid var(--wi-line); }
.wi-answer-av { display: inline-flex; flex: none; }
.wi-answer-av .wi-avatar + .wi-avatar { margin-left: -8px; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--seg) 60%, transparent), 0 0 0 2px var(--wi-surface); }
/* step 6: two numbers on the card, the tally (paper only), practice questions */
.wi-tc-two { font-size: 14px; font-weight: 600; color: var(--wi-ink-2); margin: 0 0 8px !important; }
.wi-tally-wrap { display: none; }
.wi-sc-list { list-style: none; padding: 0 !important; display: grid; gap: 14px; }
.wi-sc-text { font-weight: 600; margin-bottom: 6px !important; }
.wi-sc-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.wi-sc-opt { min-height: 40px; padding: 6px 14px; }
.wi-sc-opt.is-right { background: var(--wi-pos-wash); border-color: var(--wi-pos); }
.wi-sc-opt.is-wrong { background: var(--wi-warn-wash); border-color: var(--wi-warn); }
.wi-sc-out { font-size: 15px; margin: 6px 0 0 !important; }
.wi-sc-out:empty { display: none; }
.wi-sc-out.is-right { color: var(--wi-pos-ink); }
@media (max-width: 639px) {
  /* the plan text and the keep box already name both numbers; the one-line summary is for wider screens and paper */
  .wi-tc-two { display: none; }
  /* the business is in the report's eyebrow just above */
  .wi-ask-biz { display: none; }
  .wi-who { padding: 12px 14px; }
  .wi-who-ai-line { font-size: 14.5px; }
  .wi-spread .wi-funnel-label { font-size: 14px; }
}

/* print: the whole report on paper, or only the test card */
@media print {
  :root { color-scheme: light; --wi-bg: #fff; --wi-surface: #fff; --wi-surface-2: #f4f1ec; --wi-surface-3: #ebe6de; --wi-ink: #000; --wi-ink-2: #333; --wi-muted: #555; --wi-line: #ccc; --wi-line-2: #999; --wi-shadow: none; }
  .wi-report { max-width: none; padding: 0; font-size: 11.5pt; }
  .wi-noprint, .wi-stepper, .wi-tabs, .wi-thought, .wi-hit, .wi-cursor, .wi-slider-row, .wi-toolbar { display: none !important; }
  .wi-panel[hidden] { display: block !important; }
  .wi-card, .wi-scn, .wi-persona, .wi-callout, .wi-caveat, .wi-chart, .wi-rule-item, .wi-tc-block { break-inside: avoid; box-shadow: none; }
  .wi-step { padding-top: 18pt; break-before: auto; }
  .wi-tile { box-shadow: none; }
  a { color: inherit !important; text-decoration: none; }
  /* only the test card: a detached copy at the top of <body>; everything else leaves the layout (one page, not fifteen) */
  html.wi-print-card body > *:not(.wi-print-clone) { display: none !important; }
  html.wi-print-card .wi-print-clone { display: block !important; max-width: none; padding: 0; margin: 0; }
  /* the card on one A4 page, every word at 10 pt or more, with a blank daily tally to fill in at the till */
  html.wi-print-card .wi-print-clone .wi-testcard { margin: 0; border: 1.25pt solid #000; box-shadow: none; padding: 5pt 8pt; font-size: 10pt; line-height: 1.15; }
  html.wi-print-card .wi-print-clone .wi-testcard * { break-inside: auto; }
  html.wi-print-card .wi-print-clone .wi-testcard .wi-eyebrow, html.wi-print-card .wi-print-clone .wi-tc-days-badge, html.wi-print-card .wi-print-clone .wi-tc-day { font-size: 10pt; }
  html.wi-print-card .wi-print-clone .wi-tc-title { font-size: 13pt; }
  html.wi-print-card .wi-print-clone .wi-tc-head .wi-eyebrow { margin-bottom: 0 !important; }
  html.wi-print-card .wi-print-clone .wi-tc-cap, html.wi-print-card .wi-print-clone .wi-tc-two, html.wi-print-card .wi-print-clone .wi-checklist li, html.wi-print-card .wi-print-clone .wi-tc-measure li, html.wi-print-card .wi-print-clone .wi-tc-days li, html.wi-print-card .wi-print-clone .wi-rule-item p, html.wi-print-card .wi-print-clone .wi-rule-item strong, html.wi-print-card .wi-print-clone .wi-tc-measure span { font-size: 10pt; line-height: 1.15; }
  /* the plan's summary repeats the rule and the lists below it: on paper the card keeps the lists */
  html.wi-print-card .wi-print-clone .wi-tc-plain { display: none; }
  html.wi-print-card .wi-print-clone .wi-h4 { font-size: 10.5pt; margin-bottom: 1.5pt !important; }
  html.wi-print-card .wi-print-clone .wi-tc-actions { display: none !important; }
  html.wi-print-card .wi-print-clone .wi-tc-head { margin-bottom: 1pt; }
  html.wi-print-card .wi-print-clone .wi-tc-grid { gap: 1pt 10pt; grid-template-columns: 1fr 1fr; margin: 1pt 0; }
  html.wi-print-card .wi-print-clone .wi-tc-block { margin-bottom: 2pt; }
  html.wi-print-card .wi-print-clone .wi-checklist { gap: 0.5pt; }
  html.wi-print-card .wi-print-clone .wi-checklist li { padding-left: 13pt; }
  html.wi-print-card .wi-print-clone .wi-checklist li::before { width: 8pt; height: 8pt; top: 2pt; border-radius: 2pt; border-width: 1pt; }
  html.wi-print-card .wi-print-clone .wi-tc-measure, html.wi-print-card .wi-print-clone .wi-tc-days { gap: 0.5pt; }
  html.wi-print-card .wi-print-clone .wi-tc-measure li { padding-left: 6pt; border-left-width: 2pt; }
  html.wi-print-card .wi-print-clone .wi-tc-days li { grid-template-columns: 36pt 1fr; gap: 4pt; }
  /* keep / tweak / stop as three full-width rows: the word, then its line */
  html.wi-print-card .wi-print-clone .wi-rule { grid-template-columns: 1fr; gap: 2pt; }
  html.wi-print-card .wi-print-clone .wi-rule-item { padding: 2.5pt 6pt; gap: 5pt; align-items: baseline; }
  html.wi-print-card .wi-print-clone .wi-rule-item svg { width: 10pt; height: 10pt; align-self: center; }
  html.wi-print-card .wi-print-clone .wi-rule-item strong { display: inline; margin-right: 4pt; }
  html.wi-print-card .wi-print-clone .wi-tc-two { margin: 0 0 2pt !important; }
  html.wi-print-card .wi-print-clone .wi-tc-cap { padding: 2.5pt 6pt; margin: 2pt 0 0 !important; }
  html.wi-print-card .wi-print-clone p { margin-bottom: 2pt !important; }
  .wi-tally-wrap { display: grid !important; grid-template-columns: 1fr auto; align-items: baseline; gap: 0 8pt; break-inside: avoid; margin-top: 4pt; }
  .wi-tally-wrap > .wi-h4 { grid-row: 1; grid-column: 1; }
  .wi-tally-wrap > .wi-tally { grid-column: 1 / -1; }
  .wi-tally { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10pt; margin: 0 0 2pt; }
  .wi-tally th, .wi-tally td { border: 0.75pt solid #000; padding: 1.5pt 3pt; text-align: center; font-weight: 600; line-height: 1.15; }
  .wi-tally th:first-child { width: 30%; text-align: left; }
  .wi-tally thead th { background: #f0ede7; }
  .wi-tally tbody td { height: 20pt; }
  .wi-tally .wi-tally-avg { background: #f7f5f1; }
  .wi-tally-base { grid-row: 1; grid-column: 2; font-size: 10pt; margin: 0 !important; }
  @page { margin: 8mm; }
  .wi-lang, .wi-predict, .wi-hint > summary { display: none !important; }
}
`;

/** Design tokens only (light + dark), shared verbatim with site/assets/site.css. */
export function reportTokens(): string {
  return TOKENS;
}

/** Everything the report needs: tokens, light/dark, layout, charts and print. */
export function reportStyles(): string {
  return `${TOKENS}\n${REPORT}`;
}
