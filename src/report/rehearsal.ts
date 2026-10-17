/**
 * Step 5: the rehearsal with imagined customers (MiroFish-inspired, but small
 * and honest). Persona cards, a round-by-round timeline, an uptake chart, the
 * neighbourhood feed, a who-told-whom network, the questions it raised, and a
 * prominent "what a simulation can and cannot tell you" box.
 *
 * Everything here carries the Imagined chip. Text written by imagined
 * customers is untrusted: it is always escaped.
 */
import { price } from "../engine/format.ts";
import type { Persona, RehearsalSummary } from "../sim/types.ts";
import { networkSvg, uptakeSvg } from "./charts.ts";
import { chip, esc, firstName, ICONS, initial } from "./html.ts";
import type { ReportInput, StepState } from "./model.ts";
import { CHART_W, openStep, stepHead } from "./sections.ts";

const METHOD_WORDS: Record<RehearsalSummary["method"], string> = {
  subagent: "Each imagined customer was played by its own AI helper that saw only that customer's brief.",
  "in-context": "The AI played each imagined customer in turn, from that customer's brief only.",
  "rule-based": "Played by simple fixed rules, with no AI, so you can see how a rehearsal works.",
  mixed: "Played by a mix of AI role-play and simple fixed rules.",
};

const ATTITUDE: Record<Persona["attitude"], { word: string; icon: string }> = {
  fan: { word: "Fan", icon: ICONS.heart },
  neutral: { word: "Neutral", icon: ICONS.minus },
  sceptical: { word: "Sceptical", icon: ICONS.brow },
};

const SENSITIVITY: Record<Persona["priceSensitivity"], string> = {
  low: "not fussed about price",
  medium: "watches the price",
  high: "very price-conscious",
};

const RELATIONSHIP: Record<Persona["relationship"], string> = {
  regular: "a regular",
  occasional: "now and then",
  new: "never been in",
};

const FEED_KIND: Record<string, string> = {
  word_of_mouth: "word of mouth",
  review: "review",
  post: "post",
  event: "something changed",
};

function isAway(action: string, label: string): boolean {
  return /not[\s_-]*around|away|absent|elsewhere/i.test(action) || /not around/i.test(label);
}

/** The round being played right now, or undefined when the rehearsal is done. */
export function runningRound(reh: RehearsalSummary, input: ReportInput): number | undefined {
  if (reh.status !== "running" && input.status !== "running") return undefined;
  const played = reh.grid.reduce((m, c) => Math.max(m, c.round), 0);
  const n = played + 1;
  return n <= reh.rounds.length ? n : undefined;
}

export function avatar(p: { name: string; segment: string }, size = ""): string {
  return `<span class="wi-avatar wi-seg-${esc(p.segment)}${size ? ` wi-avatar--${size}` : ""}" aria-hidden="true">${esc(initial(p.name))}</span>`;
}

export function uptakeChart(reh: RehearsalSummary, input: ReportInput, width: number): string {
  return uptakeSvg(reh.uptake, {
    width,
    id: "wi-chart-uptake",
    total: reh.personas.length,
    rounds: reh.rounds.length,
    running: runningRound(reh, input),
    title: "Imagined customers per round: around, and engaged with the change",
    desc: reh.uptake.map((u) => `Round ${u.round}: ${u.engaged} of ${u.active} engaged`).join("; ") || "No rounds played yet.",
  });
}

export function networkChart(reh: RehearsalSummary, width: number): string {
  const byId = new Map(reh.personas.map((p) => [p.id, p]));
  return networkSvg(reh.personas, reh.links, {
    width,
    id: "wi-chart-net",
    title: "Who told whom about the change (imagined)",
    desc: reh.links.length
      ? reh.links.map((k) => `${byId.get(k.from)?.name ?? k.from} told ${byId.get(k.to)?.name ?? k.to} in round ${k.round}`).join("; ")
      : "Nobody passed it on.",
  });
}

function personaCard(p: Persona): string {
  const att = ATTITUDE[p.attitude] ?? ATTITUDE.neutral;
  return `<li class="wi-persona">
  <div class="wi-persona-top">${avatar(p)}<div class="wi-persona-id"><h4 class="wi-persona-name">${esc(p.name)}</h4><p class="wi-persona-seg">${esc(p.segmentLabel)} · ${esc(p.age)}</p></div><span class="wi-att is-${esc(p.attitude)}">${att.icon}${att.word}</span></div>
  <dl class="wi-persona-facts">
    <div><dt>Usually spends</dt><dd>${esc(price(p.usualSpend))}</dd></div>
    <div><dt>Price</dt><dd>${esc(SENSITIVITY[p.priceSensitivity] ?? p.priceSensitivity)}</dd></div>
    <div><dt>Your café</dt><dd>${esc(RELATIONSHIP[p.relationship] ?? p.relationship)}</dd></div>
  </dl>
  <p class="wi-persona-rep"><span class="wi-muted">Stands for:</span> ${esc(p.represents.replace(/^\s*stands for:?\s*/i, ""))}</p>
  <details class="wi-story"><summary>Their story</summary><p>${esc(p.story)}</p><ul class="wi-story-facts"><li><span class="wi-muted">Routine:</span> ${esc(p.routine)}</li><li><span class="wi-muted">Otherwise goes to:</span> ${esc(p.alternatives)}</li><li><span class="wi-muted">Quirk:</span> ${esc(p.quirk)}</li></ul></details>
</li>`;
}

function timeline(reh: RehearsalSummary, input: ReportInput): string {
  const run = runningRound(reh, input);
  const cols = reh.rounds.length || Math.max(1, ...reh.grid.map((c) => c.round));
  const roundNums = Array.from({ length: cols }, (_, i) => i + 1);
  const eventBefore = new Map<number, string[]>();
  for (const e of reh.events) eventBefore.set(e.beforeRound, [...(eventBefore.get(e.beforeRound) ?? []), e.text]);
  const head = roundNums
    .map((n) => {
      const r = reh.rounds.find((x) => x.n === n);
      const ev = eventBefore.has(n) ? `<span class="wi-tl-event" title="Something changed before this round">⚡<span class="wi-sr">Something changed before this round</span></span>` : "";
      return `<th scope="col"><span class="wi-tl-r">R${n}${ev}</span><span class="wi-tl-title">${esc(r?.title ?? "")}</span></th>`;
    })
    .join("");
  const rows = reh.personas
    .map((p) => {
      const cells = roundNums
        .map((n) => {
          const c = reh.grid.find((g) => g.personaId === p.id && g.round === n);
          if (!c) {
            const isRun = run === n;
            return `<td><span class="wi-cell ${isRun ? "is-running" : "is-future"}">${isRun ? "thinking…" : "–"}<span class="wi-sr">${isRun ? `round ${n} in progress` : `round ${n} not played yet`}</span></span></td>`;
          }
          const kind = isAway(c.action, c.actionLabel) ? "is-away" : c.positive ? "is-pos" : "is-neutral";
          return `<td><button type="button" class="wi-cell ${kind}" data-wi-cell aria-controls="wi-thought" aria-label="Round ${n}, ${esc(p.name)}: ${esc(c.actionLabel)}. Show what they thought."><span class="wi-cell-label">${esc(kind === "is-away" ? "Not around" : c.actionLabel)}</span><span class="wi-cell-thought" hidden data-name="${esc(p.name)}" data-round="${n}" data-action="${esc(c.actionLabel)}">${esc(c.thought)}</span></button></td>`;
        })
        .join("");
      return `<tr><th scope="row"><span class="wi-tl-who">${avatar(p, "sm")}<span>${esc(firstName(p.name))}</span></span></th>${cells}</tr>`;
    })
    .join("");
  const events = reh.events.length
    ? `<ul class="wi-tl-events">${reh.events.map((e) => `<li>⚡ <strong>Before round ${esc(e.beforeRound)}:</strong> ${esc(e.text)}</li>`).join("")}</ul>`
    : "";
  const allThoughts = roundNums
    .map((n) => {
      const cells = reh.grid.filter((g) => g.round === n);
      if (!cells.length) return "";
      const title = reh.rounds.find((x) => x.n === n)?.title ?? "";
      return `<li><p class="wi-h5">Round ${n}${title ? ` — ${esc(title)}` : ""}</p><ul>${cells
        .map((c) => {
          const p = reh.personas.find((x) => x.id === c.personaId);
          return `<li><strong>${esc(p?.name ?? c.personaId)}</strong> (${esc(c.actionLabel)}): ${esc(c.thought)}</li>`;
        })
        .join("")}</ul></li>`;
    })
    .join("");
  return `<div class="wi-tl-legend" aria-hidden="true"><span><i class="wi-sw is-pos"></i>Engaged with the change</span><span><i class="wi-sw is-neutral"></i>Other reaction</span><span><i class="wi-sw is-away"></i>Not around</span></div>
${events}
<div class="wi-tl-wrap"><table class="wi-timeline" style="--wi-rounds:${cols}"><caption class="wi-sr">What each imagined customer did in each round. Select a square to read their thought.</caption><thead><tr><th scope="col"><span class="wi-sr">Imagined customer</span></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
<div class="wi-thought" id="wi-thought" aria-live="polite"><p class="wi-muted">Tap any square to read what that imagined customer was thinking.</p></div>
${allThoughts ? `<details class="wi-tableview"><summary>Read every thought as text</summary><ol class="wi-allthoughts">${allThoughts}</ol></details>` : ""}`;
}

function feed(reh: RehearsalSummary): string {
  if (!reh.feed.length) return `<p class="wi-muted">Nothing was said in public yet.</p>`;
  const byId = new Map(reh.personas.map((p) => [p.id, p]));
  return `<ol class="wi-feed">${reh.feed
    .map((f) => {
      const p = f.personaId ? byId.get(f.personaId) : undefined;
      const av = p ? avatar(p, "sm") : `<span class="wi-avatar wi-avatar--sm wi-avatar--event" aria-hidden="true">⚡</span>`;
      return `<li class="wi-feed-item is-${esc(f.kind)}">${av}<div><p class="wi-feed-meta"><strong>${esc(f.name)}</strong><span>${esc(FEED_KIND[f.kind] ?? f.kind)}</span><span class="wi-feed-round">Round ${esc(f.round)}</span></p><p class="wi-feed-text">${esc(f.text)}</p></div></li>`;
    })
    .join("")}</ol>`;
}

function network(reh: RehearsalSummary): string {
  const byId = new Map(reh.personas.map((p) => [p.id, p]));
  const items = reh.links
    .map((k) => `<li>${esc(byId.get(k.from)?.name ?? k.from)} → ${esc(byId.get(k.to)?.name ?? k.to)} <span class="wi-muted">(round ${esc(k.round)})</span></li>`)
    .join("");
  return `${reh.links.length ? "" : `<p class="wi-muted">Nobody passed it on in this rehearsal — itself worth knowing: word of mouth may need a nudge.</p>`}
<div class="wi-chart-box wi-net-box" data-wi-chart="network">${networkChart(reh, 440)}</div>
${items ? `<details class="wi-tableview"><summary>Who told whom, as a list</summary><ul class="wi-netlist">${items}</ul></details>` : ""}`;
}

function caveatBox(reh: RehearsalSummary): string {
  return `<aside class="wi-caveat" aria-labelledby="wi-caveat-h">
  <h3 class="wi-h3" id="wi-caveat-h">${ICONS.info} What a simulation can and cannot tell you</h3>
  <div class="wi-caveat-cols">
    <div><p class="wi-caveat-k is-can">It can</p><ul><li>Surface questions and doubts you had not thought of.</li><li>Show where the offer is unclear, and how word of mouth might travel.</li><li>Help you write better questions for real customers.</li></ul></div>
    <div><p class="wi-caveat-k is-cannot">It cannot</p><ul><li>Tell you how many real people will come.</li><li>Be scaled up: “3 of 6 imagined customers” does not mean half your street.</li><li>Replace a small test with real customers. It never feeds the maths in steps 3 and 4.</li></ul></div>
  </div>
  ${reh.caveat ? `<p class="wi-caveat-note">${esc(reh.caveat)}</p>` : ""}
</aside>`;
}

function sub(title: string, body: string, id: string, extra = ""): string {
  return `<div class="wi-sub" id="${id}"><div class="wi-sub-head"><h3 class="wi-h3">${esc(title)}</h3>${chip("imagined")}${extra}</div>${body}</div>`;
}

export function step5(input: ReportInput, state: StepState): string {
  const reh = input.rehearsal;
  if (!reh) {
    return `${openStep(5, state)}${stepHead(5, state, chip("imagined"))}
<div class="wi-card wi-empty"><p><strong>Not rehearsed yet — this step is optional.</strong> A handful of imagined customers (a student, an office worker, a regular…) would react to your change over a few rounds, telling friends, trying it or ignoring it.</p><p>Ask your AI coach: “Rehearse this with imagined customers.” The result is a list of questions to check with real people, never a forecast.</p></div>
</section>`;
  }
  const run = runningRound(reh, input);
  const runRound = run ? reh.rounds.find((r) => r.n === run) : undefined;
  const banner = run
    ? `<div class="wi-running" role="status"><span class="wi-pulse" aria-hidden="true"></span><div><p><strong>Round ${run} of ${reh.rounds.length} in progress.</strong> The coach is running round ${run}…</p>${runRound ? `<p class="wi-muted wi-small">${esc(runRound.title)}${runRound.situation ? `: ${esc(runRound.situation)}` : ""}</p>` : ""}<p class="wi-muted wi-small">Ask the coach for the new link when the round is done; this page shows whatever the link holds.</p></div></div>`
    : "";
  const funnel = reh.funnel.length
    ? `<ul class="wi-funnel">${reh.funnel
        .map((f) => {
          const dots = Array.from({ length: Math.max(0, Math.min(24, f.of)) }, (_, i) => `<i class="${i < f.count ? "is-on" : ""}"></i>`).join("");
          return `<li><span class="wi-funnel-label">${esc(f.label)}</span><span class="wi-dots" aria-hidden="true">${dots}</span><span class="wi-funnel-n">${esc(f.count)} of ${esc(f.of)}</span></li>`;
        })
        .join("")}</ul><p class="wi-muted wi-small">Counts of imagined people. They describe this rehearsal only and are never scaled up to real customers.</p>`
    : "";
  const uptake = `<div class="wi-chart-legend" aria-hidden="true"><span><i class="wi-sw is-active"></i>Around that round</span><span><i class="wi-sw is-engaged"></i>Engaged with the change</span></div><div class="wi-chart-box" data-wi-chart="uptake">${uptakeChart(reh, input, CHART_W)}</div>`;
  const quotes = reh.quotes.length
    ? sub(
        "In their own (imagined) words",
        `<div class="wi-quotes">${reh.quotes
          .slice(0, 6)
          .map((q) => {
            const p = reh.personas.find((x) => x.id === q.personaId);
            return `<figure class="wi-quote">${p ? avatar(p, "sm") : ""}<div><blockquote>${esc(q.text)}</blockquote><figcaption>${esc(q.name)} · round ${esc(q.round)}</figcaption></div></figure>`;
          })
          .join("")}</div>`,
        "wi-reh-quotes",
      )
    : "";
  const questions = reh.questionsForOwner.length
    ? sub("Questions they asked you", `<ul class="wi-qlist">${reh.questionsForOwner.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`, "wi-reh-questions")
    : "";
  const check = reh.checkWithRealCustomers.length
    ? `<div class="wi-card wi-checkreal"><div class="wi-sub-head"><h3 class="wi-h3">Check these with real customers</h3>${chip("owner")}</div><p class="wi-muted wi-small">This is what the rehearsal is for: questions to ask three or four real customers this week.</p><ul class="wi-checklist wi-checklist--boxes">${reh.checkWithRealCustomers.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>`
    : "";
  const interviews = reh.interviews.length
    ? sub(
        "Interviews",
        reh.interviews
          .map(
            (iv) =>
              `<div class="wi-interview"><p class="wi-interview-q">“${esc(iv.question)}”</p><ul class="wi-answers">${iv.answers
                .map((ans) => {
                  const p = reh.personas.find((x) => x.id === ans.personaId);
                  return `<li>${p ? avatar(p, "sm") : ""}<div><p class="wi-answer-name">${esc(ans.name)}</p><p>${esc(ans.answer)}</p></div></li>`;
                })
                .join("")}</ul></div>`,
          )
          .join(""),
        "wi-reh-interviews",
      )
    : "";
  return `${openStep(5, state)}${stepHead(5, state, chip("imagined"))}
${banner}
${caveatBox(reh)}
<div class="wi-card wi-reh-intro">
  <p class="wi-reh-change"><span class="wi-muted">The change they react to:</span> <strong>${esc(reh.change)}</strong></p>
  <p class="wi-reh-meta"><span>${reh.personas.length} imagined customers</span><span>${reh.rounds.length} rounds</span>${reh.events.length ? `<span>${reh.events.length} event${reh.events.length === 1 ? "" : "s"} added by you</span>` : ""}</p>
  <p class="wi-muted wi-small">${esc(METHOD_WORDS[reh.method] ?? "")}</p>
  <ol class="wi-reh-flow" aria-label="How the rehearsal works"><li>Imagined customers</li><li>Rounds of reactions</li><li>Neighbourhood feed</li><li>Questions for real people</li></ol>
</div>
<div class="wi-two">
  ${sub("How far it spread", funnel || '<p class="wi-muted">No rounds played yet.</p>', "wi-reh-funnel")}
  ${sub("Round by round", uptake, "wi-reh-uptake")}
</div>
${sub("Meet the imagined customers", `<ul class="wi-personas">${reh.personas.map(personaCard).join("")}</ul>`, "wi-reh-personas")}
<div class="wi-sub" id="wi-reh-views">
  <div class="wi-tabs wi-noprint" role="tablist" aria-label="Rehearsal views" data-wi-tabs hidden>
    <button type="button" role="tab" id="wi-tab-timeline" aria-controls="wi-panel-timeline" aria-selected="true">What each one did</button>
    <button type="button" role="tab" id="wi-tab-feed" aria-controls="wi-panel-feed" aria-selected="false" tabindex="-1">Neighbourhood feed</button>
    <button type="button" role="tab" id="wi-tab-network" aria-controls="wi-panel-network" aria-selected="false" tabindex="-1">Who told whom</button>
  </div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-timeline" aria-labelledby="wi-tab-timeline"><div class="wi-sub-head"><h3 class="wi-h3">What each one did, round by round</h3>${chip("imagined")}</div>${timeline(reh, input)}</div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-feed" aria-labelledby="wi-tab-feed"><div class="wi-sub-head"><h3 class="wi-h3">The neighbourhood feed</h3>${chip("imagined")}</div><p class="wi-muted wi-small">What the imagined neighbourhood heard: your announcement, word of mouth, reviews and events. Each round, customers see the feed from earlier rounds.</p>${feed(reh)}</div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-network" aria-labelledby="wi-tab-network"><div class="wi-sub-head"><h3 class="wi-h3">Who told whom</h3>${chip("imagined")}</div><p class="wi-muted wi-small">Arrows show who passed the news to whom, and in which round (R1, R2…).</p>${network(reh)}</div>
</div>
${quotes}
${questions}
${check}
${interviews}
</section>`;
}
