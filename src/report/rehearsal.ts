/**
 * Step 5: the rehearsal with imagined customers (MiroFish-inspired, but small
 * and honest). The questions to check come first; then how far it spread, the
 * round-by-round grid, the neighbourhood feed, who told whom, the people
 * (collapsed), their words and any interviews. One sentence says who played
 * the customers, and it always matches the run's method.
 *
 * Everything here carries the Imagined chip. Text written by imagined
 * customers is untrusted: it is always escaped.
 */
import { price } from "../engine/format.ts";
import { REPRESENTS_PREFIX } from "../sim/messages.ts";
import { ACTIONS } from "../sim/rounds.ts";
import type { Persona, RehearsalSummary } from "../sim/types.ts";
import { networkSvg, uptakeSvg } from "./charts.ts";
import { chip, esc, firstName, fmtInput, hint, ICONS, initial } from "./html.ts";
import { t } from "./messages.ts";
import type { MsgKey } from "./messages.ts";
import { whoPlayed } from "./model.ts";
import type { ReportInput, StepState } from "./model.ts";
import { CHART_W, openStep, stepHead } from "./sections.ts";

const ATTITUDE_ICON: Record<Persona["attitude"], string> = { fan: ICONS.heart, neutral: ICONS.minus, sceptical: ICONS.brow };


export type CellKind = "pos" | "elsewhere" | "neutral" | "away";

/**
 * How a grid cell is drawn: from the sim's `kind` (only "away" is "Not around"; "elsewhere" — a rival, staying away —
 * has its own style), else the action's kind in the sim's ACTIONS, else the old positive flag.
 */
export function cellKind(c: { action: string; positive: boolean; kind?: string }): CellKind {
  const k = c.kind ?? ACTIONS[c.action]?.kind ?? (c.action === "not_around" ? "away" : undefined);
  if (k === "away") return "away";
  if (k === "elsewhere") return "elsewhere";
  if (k === "engaged") return "pos";
  if (k === "neutral") return "neutral";
  return c.positive ? "pos" : "neutral";
}

/** "Stands for: …" without the sim's prefix, in any language. */
function represents(text: string): string {
  let out = text.trim();
  for (const pre of Object.values(REPRESENTS_PREFIX)) {
    const p = pre.trim().replace(/:$/, "");
    if (out.toLowerCase().startsWith(p.toLowerCase())) out = out.slice(p.length).replace(/^\s*:?\s*/, "");
  }
  return out;
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
    title: t("reh.uptakeTitle"),
    desc: reh.uptake.map((u) => t("reh.uptakeDesc", { n: u.round, e: u.engaged, a: u.active })).join("; ") || t("reh.noRounds"),
  });
}

export function networkChart(reh: RehearsalSummary, width: number): string {
  const byId = new Map(reh.personas.map((p) => [p.id, p]));
  return networkSvg(reh.personas, reh.links, {
    width,
    id: "wi-chart-net",
    title: t("reh.netTitle"),
    desc: reh.links.length
      ? reh.links.map((k) => t("reh.netDesc", { a: byId.get(k.from)?.name ?? k.from, b: byId.get(k.to)?.name ?? k.to, n: k.round })).join("; ")
      : t("reh.netNone"),
  });
}

function personaCard(p: Persona): string {
  const att = (["fan", "neutral", "sceptical"] as const).includes(p.attitude) ? p.attitude : "neutral";
  const sens = (["low", "medium", "high"] as const).includes(p.priceSensitivity) ? t(`persona.sens.${p.priceSensitivity}` as MsgKey) : p.priceSensitivity;
  const rel = (["regular", "occasional", "new"] as const).includes(p.relationship) ? t(`persona.rel.${p.relationship}` as MsgKey) : p.relationship;
  return `<li class="wi-persona">
  <div class="wi-persona-top">${avatar(p)}<div class="wi-persona-id"><h4 class="wi-persona-name">${esc(p.name)}</h4><p class="wi-persona-seg">${esc(p.segmentLabel)} · ${esc(p.age)}</p></div><span class="wi-att is-${esc(att)}" title="${esc(t("persona.mood"))}">${ATTITUDE_ICON[att]}<span class="wi-sr">${esc(t("persona.mood"))} </span>${esc(t(`persona.att.${att}` as MsgKey))}</span></div>
  <dl class="wi-persona-facts">
    <div><dt>${esc(t("persona.spends"))}</dt><dd>${esc(price(p.usualSpend))}</dd></div>
    <div><dt>${esc(t("persona.price"))}</dt><dd>${esc(sens)}</dd></div>
    <div><dt>${esc(t("persona.cafe"))}</dt><dd>${esc(rel)}</dd></div>
  </dl>
  <p class="wi-persona-rep"><span class="wi-muted">${esc(t("persona.stands"))}</span> ${esc(represents(p.represents))}</p>
  <details class="wi-story"><summary>${esc(t("persona.story"))}</summary><p>${esc(p.story)}</p><ul class="wi-story-facts"><li><span class="wi-muted">${esc(t("persona.routine"))}</span> ${esc(p.routine)}</li><li><span class="wi-muted">${esc(t("persona.alt"))}</span> ${esc(p.alternatives)}</li><li><span class="wi-muted">${esc(t("persona.quirk"))}</span> ${esc(p.quirk)}</li></ul></details>
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
      const ev = eventBefore.has(n) ? `<span class="wi-tl-event" title="${esc(t("tl.eventBefore"))}">⚡<span class="wi-sr">${esc(t("tl.eventBefore"))}</span></span>` : "";
      return `<th scope="col"><span class="wi-tl-r">${esc(t("tl.r", { n }))}${ev}</span></th>`;
    })
    .join("");
  // Round names in full above the grid (headers stay short, so nothing is cut off on a phone).
  const roundKey = roundNums
    .map((n) => {
      const r = reh.rounds.find((x) => x.n === n);
      return `<li><strong>${esc(t("tl.r", { n }))}</strong> ${esc(r?.title ?? "")}${eventBefore.has(n) ? ` <span class="wi-tl-ev-note">⚡ ${esc(eventBefore.get(n)!.join(" · "))}</span>` : ""}</li>`;
    })
    .join("");
  const rows = reh.personas
    .map((p) => {
      const cells = roundNums
        .map((n) => {
          const c = reh.grid.find((g) => g.personaId === p.id && g.round === n);
          if (!c) {
            const isRun = run === n;
            return `<td><span class="wi-cell ${isRun ? "is-running" : "is-future"}">${esc(isRun ? t("tl.thinking") : "–")}<span class="wi-sr">${esc(isRun ? t("tl.srRunning", { n }) : t("tl.srFuture", { n }))}</span></span></td>`;
          }
          const kind = cellKind(c as typeof c & { kind?: string });
          const label = kind === "away" ? t("tl.away") : c.actionLabel;
          const icon = kind === "elsewhere" ? `<span class="wi-cell-ico" aria-hidden="true">↗</span>` : "";
          return `<td><button type="button" class="wi-cell is-${kind === "pos" ? "pos" : kind}" data-wi-cell aria-controls="wi-thought" aria-label="${esc(t("tl.cellAria", { n, name: p.name, action: c.actionLabel }))}">${icon}<span class="wi-cell-label">${esc(label)}</span><span class="wi-cell-thought" hidden data-name="${esc(p.name)}" data-round="${n}" data-action="${esc(c.actionLabel)}">${esc(c.thought)}</span></button></td>`;
        })
        .join("");
      return `<tr><th scope="row"><span class="wi-tl-who">${avatar(p, "sm")}<span>${esc(firstName(p.name))}</span></span></th>${cells}</tr>`;
    })
    .join("");
  const allThoughts = roundNums
    .map((n) => {
      const cells = reh.grid.filter((g) => g.round === n);
      if (!cells.length) return "";
      const title = reh.rounds.find((x) => x.n === n)?.title ?? "";
      return `<li><p class="wi-h5">${esc(t("tl.round", { n }))}${title ? ` — ${esc(title)}` : ""}</p><ul>${cells
        .map((c) => {
          const p = reh.personas.find((x) => x.id === c.personaId);
          return `<li><strong>${esc(p?.name ?? c.personaId)}</strong> (${esc(c.actionLabel)}): ${esc(c.thought)}</li>`;
        })
        .join("")}</ul></li>`;
    })
    .join("");
  return `<ol class="wi-tl-rounds" aria-label="${esc(t("tl.roundsAria"))}">${roundKey}</ol>
<div class="wi-tl-legend" aria-hidden="true"><span><i class="wi-sw is-pos"></i>${esc(reh.uptakeLabel || t("tl.legPos"))}</span><span><i class="wi-sw is-elsewhere"></i>${esc(t("tl.legElsewhere"))}</span><span><i class="wi-sw is-neutral"></i>${esc(t("tl.legOther"))}</span><span><i class="wi-sw is-away"></i>${esc(t("tl.away"))}</span></div>
<div class="wi-tl-wrap"><table class="wi-timeline" style="--wi-rounds:${cols}"><caption class="wi-sr">${esc(t("tl.caption"))}</caption><thead><tr><th scope="col"><span class="wi-sr">${esc(t("tl.who"))}</span></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
<div class="wi-thought" id="wi-thought" aria-live="polite"><p class="wi-muted">${esc(t("tl.tap"))}</p></div>
${allThoughts ? `<details class="wi-tableview"><summary>${esc(t("tl.allText"))}</summary><ol class="wi-allthoughts">${allThoughts}</ol></details>` : ""}`;
}

function feedKind(kind: string): string {
  return ["word_of_mouth", "review", "post", "event"].includes(kind) ? t(`feed.${kind}` as MsgKey) : kind;
}

function feed(reh: RehearsalSummary): string {
  if (!reh.feed.length) return `<p class="wi-muted">${esc(t("feed.none"))}</p>`;
  const byId = new Map(reh.personas.map((p) => [p.id, p]));
  return `<ol class="wi-feed">${reh.feed
    .map((f) => {
      const p = f.personaId ? byId.get(f.personaId) : undefined;
      const av = p ? avatar(p, "sm") : `<span class="wi-avatar wi-avatar--sm wi-avatar--event" aria-hidden="true">⚡</span>`;
      return `<li class="wi-feed-item is-${esc(f.kind)}">${av}<div><p class="wi-feed-meta"><strong>${esc(f.name)}</strong><span>${esc(feedKind(f.kind))}</span><span class="wi-feed-round">${esc(t("tl.round", { n: f.round }))}</span></p><p class="wi-feed-text">${esc(f.text)}</p></div></li>`;
    })
    .join("")}</ol>`;
}

function network(reh: RehearsalSummary): string {
  const byId = new Map(reh.personas.map((p) => [p.id, p]));
  const items = reh.links
    .map((k) => `<li>${esc(byId.get(k.from)?.name ?? k.from)} → ${esc(byId.get(k.to)?.name ?? k.to)} <span class="wi-muted">(${esc(t("tl.round", { n: k.round }))})</span>${k.text ? `<br><q>${esc(k.text)}</q>` : ""}</li>`)
    .join("");
  return `${reh.links.length ? "" : `<p class="wi-muted">${esc(t("net.none"))}</p>`}
<div class="wi-chart-box wi-net-box" data-wi-chart="network">${networkChart(reh, 440)}</div>
${items ? `<details class="wi-tableview"><summary>${esc(t("net.list"))}</summary><ul class="wi-netlist">${items}</ul></details>` : ""}`;
}

/** The sim's own caveat, unless it claims an AI played customers that fixed rules played (older sims said that). */
export function consistentCaveat(reh: RehearsalSummary): string {
  const c = (reh.caveat ?? "").trim();
  if (!c) return "";
  if (reh.method === "rule-based") {
    const claimsAI = /\b(AI|KI|IA|SI)\b|inteligencia artificial|künstliche intelligenz|sztuczn/i.test(c);
    const saysNoAI = /\b(no|without|not by an?)\s+AI\b|ohne KI|keine KI|nicht von einer KI|sin IA|sin inteligencia|bez AI|bez SI|bez sztucznej|simple (fixed )?rules|feste[n]? Regeln|reglas fijas|stałe reguły|prostych reguł/i.test(c);
    if (claimsAI && !saysNoAI) return "";
  }
  return c;
}

function caveatBox(reh: RehearsalSummary): string {
  const note = consistentCaveat(reh);
  return `<aside class="wi-caveat" aria-labelledby="wi-caveat-h">
  <h3 class="wi-h3" id="wi-caveat-h">${ICONS.info} ${esc(t("cav.title"))}</h3>
  <div class="wi-caveat-cols">
    <div><p class="wi-caveat-k is-can">${esc(t("cav.can"))}</p><ul><li>${esc(t("cav.can1"))}</li><li>${esc(t("cav.can2"))}</li></ul></div>
    <div><p class="wi-caveat-k is-cannot">${esc(t("cav.cannot"))}</p><ul><li>${esc(t("cav.cannot1"))}</li><li>${esc(t("cav.cannot2"))}</li><li>${esc(t("cav.cannot3"))}</li></ul></div>
  </div>
  <p class="wi-caveat-note">${note ? esc(note) : `<strong>${esc(t("cav.who"))}</strong> ${esc(whoPlayed(reh))}`}${reh.mixNote && !note.includes(reh.mixNote) ? ` ${esc(reh.mixNote)}` : ""}</p>
</aside>`;
}

function sub(title: string, body: string, id: string, extra = ""): string {
  return `<div class="wi-sub" id="${id}"><div class="wi-sub-head"><h3 class="wi-h3">${esc(title)}</h3>${chip("imagined")}${extra}</div>${body}</div>`;
}

export function step5(input: ReportInput, state: StepState): string {
  const reh = input.rehearsal;
  if (!reh) {
    return `${openStep(5, state)}${stepHead(5, state, chip("imagined"))}
<div class="wi-card wi-empty"><p><strong>${esc(t("reh.emptyTitle"))}</strong> ${esc(t("reh.empty1"))}</p><p>${esc(t("reh.empty2"))}</p></div>
</section>`;
  }
  const run = runningRound(reh, input);
  const runRound = run ? reh.rounds.find((r) => r.n === run) : undefined;
  const banner = run
    ? `<div class="wi-running" role="status"><span class="wi-pulse" aria-hidden="true"></span><div><p><strong>${esc(t("reh.running", { n: run, of: reh.rounds.length }))}</strong> ${esc(t("reh.runningCoach", { n: run }))}</p>${runRound ? `<p class="wi-muted wi-small">${esc(runRound.title)}${runRound.situation ? `: ${esc(runRound.situation)}` : ""}</p>` : ""}<p class="wi-muted wi-small">${esc(t("reh.runningHint"))}</p></div></div>`
    : "";
  const funnel = reh.funnel.length
    ? `<ul class="wi-funnel">${reh.funnel
        .map((f) => {
          const dots = Array.from({ length: Math.max(0, Math.min(24, f.of)) }, (_, i) => `<i class="${i < f.count ? "is-on" : ""}"></i>`).join("");
          return `<li><span class="wi-funnel-label">${esc(f.label)}</span><span class="wi-dots" aria-hidden="true">${dots}</span><span class="wi-funnel-n">${esc(t("reh.of", { n: f.count, of: f.of }))}</span></li>`;
        })
        .join("")}</ul><p class="wi-muted wi-small">${esc(t("reh.funnelNote"))}</p>`
    : "";
  const uptake = `<div class="wi-chart-legend" aria-hidden="true"><span><i class="wi-sw is-active"></i>${esc(t("reh.legActive"))}</span><span><i class="wi-sw is-engaged"></i>${esc(reh.uptakeLabel || t("tl.legPos"))}</span></div><div class="wi-chart-box" data-wi-chart="uptake">${uptakeChart(reh, input, CHART_W)}</div>`;
  const quotes = reh.quotes.length
    ? `<h4 class="wi-h4">${esc(t("reh.quotes"))}</h4><div class="wi-quotes">${reh.quotes
        .slice(0, 4)
        .map((q) => {
          const p = reh.personas.find((x) => x.id === q.personaId);
          return `<figure class="wi-quote">${p ? avatar(p, "sm") : ""}<div><blockquote>${esc(q.text)}</blockquote><figcaption>${esc(t("reh.quoteBy", { name: q.name, n: q.round }))}</figcaption></div></figure>`;
        })
        .join("")}</div>`
    : "";
  const questions = reh.questionsForOwner.length ? `<h4 class="wi-h4">${esc(t("reh.asked"))}</h4><ul class="wi-qlist">${reh.questionsForOwner.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : "";
  // What the imagined customers said, in their own words: one tap away, so the step stays short on a phone.
  const said =
    quotes || questions
      ? `<details class="wi-more wi-said" id="wi-reh-said"><summary><span>${esc(t("reh.said", { q: Math.min(4, reh.quotes.length), a: reh.questionsForOwner.length }))}</span></summary>${quotes}${questions}</details>`
      : "";
  // Questions derived from imagined reactions: tagged Imagined, never "Your number".
  const checkItems = reh.checkWithRealCustomers.map((q) => `<li>${esc(q)}</li>`);
  const check = checkItems.length
    ? `<div class="wi-card wi-checkreal" id="wi-reh-check"><div class="wi-sub-head"><h3 class="wi-h3">${esc(t("reh.check"))}</h3>${chip("imagined")}</div><p class="wi-muted wi-small">${esc(t("reh.checkNote"))}</p><ul class="wi-checklist wi-checklist--boxes">${checkItems.slice(0, 2).join("")}</ul>${
        checkItems.length > 2
          ? `<details class="wi-lessons-more" data-wi-open-wide><summary>${esc(t("reh.moreChecks", { n: checkItems.length - 2, count: checkItems.length - 2 }))}</summary><ul class="wi-checklist wi-checklist--boxes">${checkItems.slice(2).join("")}</ul></details>`
          : ""
      }</div>`
    : "";
  const answer = (ans: RehearsalSummary["interviews"][number]["answers"][number]) => {
    const p = reh.personas.find((x) => x.id === ans.personaId);
    return `<li>${p ? avatar(p, "sm") : ""}<div><p class="wi-answer-name">${esc(ans.name)}</p><p>${esc(ans.answer)}</p></div></li>`;
  };
  // Interviews: each question one tap away (open on a wide screen), with every answer.
  const interviews = reh.interviews
    .map(
      (iv, i) =>
        `<details class="wi-more wi-interview" data-wi-open-wide${i === 0 ? ' id="wi-reh-interviews"' : ""}><summary><span>${esc(t("reh.interviewQ", { q: iv.question, n: iv.answers.length, count: iv.answers.length }))}</span></summary><ul class="wi-answers">${iv.answers.map(answer).join("")}</ul></details>`,
    )
    .join("");
  const guessIn = input.analysis.inputs.find((i) => i.key === input.analysis.sensitivity.key);
  const bridge = `<p class="wi-bridge">${ICONS.info}<span>${esc(guessIn ? t("reh.bridge", { guess: fmtInput(guessIn.value, guessIn.unit) }) : t("reh.bridgeNoGuess"))}</span></p>`;
  const events = reh.events.length
    ? `<span>${esc(t(input.analysis.demo ? "reh.eventsDemo" : "reh.events", { n: reh.events.length, count: reh.events.length }))}</span>`
    : "";
  const people = `<details class="wi-sub wi-people" id="wi-reh-personas"><summary><span class="wi-people-sum"><span class="wi-h3">${esc(t("reh.meet", { n: reh.personas.length, count: reh.personas.length }))}</span><span class="wi-people-av" aria-hidden="true">${reh.personas.map((p) => avatar(p, "sm")).join("")}</span></span></summary><ul class="wi-personas">${reh.personas.map(personaCard).join("")}</ul></details>`;
  return `${openStep(5, state)}${stepHead(5, state, chip("imagined"))}
${banner}
<div class="wi-card wi-reh-intro">
  <p class="wi-reh-change"><span class="wi-muted">${esc(t("reh.change"))}</span> <strong>${esc(reh.change)}</strong></p>
  <p class="wi-reh-meta"><span>${esc(t("reh.people", { n: reh.personas.length, count: reh.personas.length }))}</span><span>${esc(t("reh.rounds", { n: reh.rounds.length, count: reh.rounds.length }))}</span>${events}</p>
  <ol class="wi-reh-flow" aria-label="${esc(t("reh.flowAria"))}"><li>${esc(t("reh.flow1"))}</li><li>${esc(t("reh.flow2"))}</li><li>${esc(t("reh.flow3"))}</li><li>${esc(t("reh.flow4"))}</li></ol>
</div>
${caveatBox(reh)}
${check}
<details class="wi-more wi-views" id="wi-reh-views" data-wi-open-wide><summary><span>${esc(t("reh.views"))}</span></summary>
${sub(t("reh.spread"), funnel || `<p class="wi-muted">${esc(t("reh.noRounds"))}</p>`, "wi-reh-funnel")}
${bridge}
<div class="wi-sub">
  <div class="wi-tabs wi-noprint" role="tablist" aria-label="${esc(t("tabs.aria"))}" data-wi-tabs hidden>
    <button type="button" role="tab" id="wi-tab-timeline" aria-controls="wi-panel-timeline" aria-selected="true">${esc(t("tabs.timeline"))}</button>
    <button type="button" role="tab" id="wi-tab-uptake" aria-controls="wi-panel-uptake" aria-selected="false" tabindex="-1">${esc(t("reh.byRound"))}</button>
    <button type="button" role="tab" id="wi-tab-feed" aria-controls="wi-panel-feed" aria-selected="false" tabindex="-1">${esc(t("tabs.feed"))}</button>
    <button type="button" role="tab" id="wi-tab-network" aria-controls="wi-panel-network" aria-selected="false" tabindex="-1">${esc(t("tabs.network"))}</button>
  </div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-timeline" aria-labelledby="wi-tab-timeline"><div class="wi-sub-head"><h3 class="wi-h3">${esc(t("tl.title"))}</h3>${chip("imagined")}</div>${timeline(reh, input)}</div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-uptake" aria-labelledby="wi-tab-uptake"><div class="wi-sub-head"><h3 class="wi-h3">${esc(t("reh.byRound"))}</h3>${chip("imagined")}</div>${uptake}</div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-feed" aria-labelledby="wi-tab-feed"><div class="wi-sub-head"><h3 class="wi-h3">${esc(t("feed.title"))}</h3>${chip("imagined")}</div><p class="wi-muted wi-small">${esc(t("feed.help"))}</p>${feed(reh)}</div>
  <div class="wi-panel" role="tabpanel" id="wi-panel-network" aria-labelledby="wi-tab-network"><div class="wi-sub-head"><h3 class="wi-h3">${esc(t("tabs.network"))}</h3>${chip("imagined")}</div><p class="wi-muted wi-small">${esc(t("net.help"))}</p>${network(reh)}</div>
</div>
</details>
${people}
${interviews}
${said}
</section>`;
}
