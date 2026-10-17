/**
 * End-to-end test of the public MCP server: the Vercel handler from
 * src/mcp/http.ts runs in an in-process Node server, and the SDK client talks
 * to it over Streamable HTTP, exactly as Claude, ChatGPT or Cursor would.
 *
 * Most calls pass lang: "en" so the English framing can be checked; the
 * language tests check the German default and the other languages.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import handler from "../src/mcp/http.ts";
import { classifyQuestion, suggestKeys, TOOL_NAMES } from "../src/mcp/tools.ts";
import { demoInputs } from "../src/engine/index.ts";
import { decodeState, encodeState } from "../src/state.ts";

delete process.env.WHATIF_SITE_URL;
delete process.env.WHATIF_BETA_CODES;
delete process.env.WHATIF_BETA_CONTACT;

let http: Server;
let base: string;
let client: Client;

before(async () => {
  http = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: "what-if-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`)));
});

after(async () => {
  await client?.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

type Result = CallToolResult & { structuredContent?: Record<string, any> };

async function call(name: string, args: Record<string, unknown>): Promise<Result> {
  return (await client.callTool({ name, arguments: args })) as Result;
}

function text(r: Result, i = 0): string {
  const c = r.content[i];
  assert.ok(c && c.type === "text", `content[${i}] should be text`);
  return c.text;
}

function allText(r: Result): string {
  return r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
}

function tokenOf(url: string): string {
  const i = url.indexOf("/r#");
  assert.ok(i > 0, `report url should contain /r#: ${url}`);
  return url.slice(i + 3);
}

const LUNCH = { template: "lunch_offer", inputs: demoInputs("lunch_offer"), demo: true, lang: "en" };

describe("What-IF MCP over Streamable HTTP", () => {
  test("lists every tool with the 'what if' trigger and read-only annotations", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [...TOOL_NAMES].sort());
    const start = tools.find((t) => t.name === "whatif_start")!;
    assert.match(start.description ?? "", /what if/i);
    assert.match(start.description ?? "", /^Call this FIRST/);
    for (const t of tools) {
      assert.equal(t.annotations?.readOnlyHint, true, `${t.name} readOnlyHint`);
      assert.equal(t.annotations?.openWorldHint, false, `${t.name} openWorldHint`);
    }
    const info = client.getServerVersion();
    assert.equal(info?.name, "what-if");
    assert.ok((client.getInstructions() ?? "").length > 20, "server instructions are sent");
  });

  test("exposes the what-if prompt with a question argument", async () => {
    const { prompts } = await client.listPrompts();
    const p = prompts.find((x) => x.name === "what-if");
    assert.ok(p, "what-if prompt listed");
    assert.ok(p.arguments?.some((a) => a.name === "question"));
    const got = await client.getPrompt({ name: "what-if", arguments: { question: "What if I run a weekday lunch offer?" } });
    const m = got.messages[0]!;
    assert.equal(m.content.type, "text");
    assert.match(m.content.type === "text" ? m.content.text : "", /lunch offer/);
  });

  test("whatif_start picks the lunch template and links a demo report", async () => {
    const r = await call("whatif_start", { question: "What if I run a weekday lunch offer?", lang: "en" });
    assert.ok(!r.isError, text(r));
    assert.equal(r.structuredContent?.template, "lunch_offer");
    assert.ok((r.structuredContent?.ask_first as unknown[]).length > 0);
    assert.match(text(r), /Open the visual report/);
    assert.match(text(r), /\/r#/);
    assert.match(text(r), /Coaching:/);
    const s = decodeState(tokenOf(r.structuredContent?.report_url as string));
    assert.equal(s.template, "lunch_offer");
    assert.equal(s.demo, true);

    const price = await call("whatif_start", { question: "What if I raise the price of a flat white by 30 cents?", lang: "en" });
    assert.equal(price.structuredContent?.template, "price_change");
  });

  test("whatif_check_inputs returns the next question", async () => {
    const r = await call("whatif_check_inputs", { template: "lunch_offer", inputs: { weekday_customers: 140 }, lang: "en" });
    assert.ok(!r.isError, text(r));
    assert.equal(r.structuredContent?.ready, false);
    assert.ok(r.structuredContent?.next_question?.ask);
    assert.match(text(r), /Next question/);

    const ok = await call("whatif_check_inputs", LUNCH);
    assert.equal(ok.structuredContent?.ready, true, text(ok));
  });

  test("whatif_run_scenarios gives break-even and a report link that round-trips", async () => {
    const r = await call("whatif_run_scenarios", LUNCH);
    assert.ok(!r.isError, text(r));
    const t = text(r);
    assert.match(t, /break-even/i);
    assert.match(t, /worst case/i);
    assert.match(t, /Open the visual report: http:\/\/127\.0\.0\.1:\d+\/r#/);
    const url = r.structuredContent?.report_url as string;
    const s = decodeState(tokenOf(url));
    assert.equal(s.v, 1);
    assert.equal(s.template, "lunch_offer");
    assert.equal(s.demo, true);
    assert.equal(Number(s.inputs.weekday_customers), Number(LUNCH.inputs.weekday_customers));
    assert.equal(encodeState(s), tokenOf(url), "token re-encodes identically");
    const a = r.structuredContent?.analysis;
    assert.equal(a.scenarios.length, 3);
    assert.ok(a.breakEven.plain);
  });

  test("whatif_run_scenarios with missing numbers is a plain error naming the next question", async () => {
    const r = await call("whatif_run_scenarios", { template: "lunch_offer", inputs: { weekday_customers: 140 }, lang: "en" });
    assert.equal(r.isError, true);
    assert.match(text(r), /Ask the owner next/);
    assert.doesNotMatch(text(r), /^\s*[{[]/, "plain text, not JSON");
  });

  test("bad template is rejected with a plain error", async () => {
    const r = await call("whatif_run_scenarios", { template: "hire_staff", inputs: {} });
    assert.equal(r.isError, true);
    assert.match(text(r), /lunch_offer|price_change|Invalid/);
  });

  test("whatif_what_changed explains the change", async () => {
    const r = await call("whatif_what_changed", {
      template: "lunch_offer",
      before: demoInputs("lunch_offer"),
      after: { extra_likely: Number(demoInputs("lunch_offer").extra_likely) + 6 },
      demo: true,
      lang: "en",
    });
    assert.ok(!r.isError, text(r));
    assert.ok((r.structuredContent?.change?.changes as unknown[]).length >= 1);
    assert.match(text(r), /\/r#/);
  });

  test("rehearsal: start, bad submit, autoplay to done, interview briefs", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, personas: 6, rounds: 4, seed: 7 });
    assert.ok(!start.isError, text(start));
    const sc = start.structuredContent!;
    assert.equal((sc.personas as unknown[]).length, 6);
    assert.ok((sc.briefs as unknown[]).length >= 1);
    const extra = text(start, 1);
    assert.match(extra, /IN PARALLEL/);
    assert.match(extra, /in-context/);
    assert.ok(extra.includes(sc.briefs[0].prompt.trim().slice(0, 40)), "briefs are in the text");
    assert.ok(extra.includes(sc.state as string), "state token is in the text");
    const s0 = decodeState(sc.state as string);
    assert.ok(s0.rehearsal);
    assert.equal(s0.rehearsal.personas, 6);

    const bad = await call("whatif_rehearsal_submit", {
      state: sc.state,
      reactions: [{ personaId: sc.briefs[0].personaId, round: 1, action: "teleport_to_mars", thought: "x" }],
    });
    assert.equal(bad.isError, true);
    assert.match(text(bad), /teleport_to_mars|action|not one of|allowed/i);
    assert.doesNotMatch(text(bad), /^\s*[{[]/);

    const garbage = await call("whatif_rehearsal_submit", { state: "not-a-real-token", reactions: [{}] });
    assert.equal(garbage.isError, true);

    const auto = await call("whatif_rehearsal_autoplay", { state: sc.state });
    assert.ok(!auto.isError, text(auto));
    assert.equal(auto.structuredContent?.done, true);
    assert.equal(auto.structuredContent?.summary?.status, "done");
    const s1 = decodeState(auto.structuredContent?.state as string);
    assert.ok((s1.rehearsal?.reactions.length ?? 0) > 0);
    const fromUrl = decodeState(tokenOf(auto.structuredContent?.report_url as string));
    assert.deepEqual(fromUrl, s1, "report link carries the same state");

    const iv = await call("whatif_rehearsal_interview", { state: auto.structuredContent?.state, question: "What would make you come back next week?" });
    assert.ok(!iv.isError, text(iv));
    assert.ok((iv.structuredContent?.briefs as unknown[]).length >= 1);
  });

  test("rehearsal: one round submitted from the rule-based stand-in replies", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, personas: 4, rounds: 3, seed: 3 });
    const sc = start.structuredContent!;
    // Build valid replies from the briefs' allowed actions, as raw JSON text (how subagents reply).
    const replies = (sc.briefs as { personaId: string; round: number; allowedActions: string[] }[]).map((b) =>
      JSON.stringify({ personaId: b.personaId, round: b.round, action: b.allowedActions[0], thought: "I would look at the board on my way past and decide then." }),
    );
    const r = await call("whatif_rehearsal_submit", { state: sc.state, reactions: replies, method: "in-context" });
    assert.ok(!r.isError, allText(r));
    assert.ok((r.structuredContent?.accepted as number) >= 1, allText(r));
  });

  test("rehearsal: a partial submit keeps the accepted reactions; only the failed persona is resent", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, personas: 5, rounds: 3, seed: 21 });
    const briefs = start.structuredContent!.briefs as { personaId: string; round: number; allowedActions: string[] }[];
    assert.ok(briefs.length >= 2, "needs at least two active personas in round 1");
    const reply = (b: (typeof briefs)[number], action: string) => ({
      personaId: b.personaId,
      round: b.round,
      action,
      thought: "I walk past at noon, so I would glance at the board and decide on the day.",
    });
    const [first, ...rest] = briefs;
    const partial = await call("whatif_rehearsal_submit", {
      state: start.structuredContent!.state,
      reactions: [reply(first!, "juggle_flaming_torches"), ...rest.map((b) => reply(b, b.allowedActions[0]!))],
      method: "subagent",
    });
    assert.ok(!partial.isError, allText(partial));
    assert.equal(partial.structuredContent?.accepted, rest.length);
    const errs = partial.structuredContent?.errors as { personaId: string }[];
    assert.deepEqual(errs.map((e) => e.personaId), [first!.personaId]);
    assert.deepEqual((partial.structuredContent?.retry_briefs as { personaId: string }[]).map((b) => b.personaId), [first!.personaId]);
    const kept = decodeState(partial.structuredContent?.state as string);
    assert.equal(kept.rehearsal?.reactions.filter((x) => x.round === 1).length, rest.length, "accepted reactions are in the new state");

    const fixed = await call("whatif_rehearsal_submit", {
      state: partial.structuredContent?.state,
      reactions: [reply(first!, first!.allowedActions[0]!)],
      method: "subagent",
    });
    assert.ok(!fixed.isError, allText(fixed));
    assert.equal(fixed.structuredContent?.accepted, 1);
    assert.equal(fixed.structuredContent?.round, 2, "round 1 is complete");
    assert.ok((fixed.structuredContent?.next as unknown[]).length >= 1, "next round's briefs");
  });

  test("whatif_rehearsal_event adds an event and returns refreshed briefs", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, seed: 11 });
    const r = await call("whatif_rehearsal_event", { state: start.structuredContent?.state, event: "It rains all week." });
    assert.ok(!r.isError, text(r));
    const s = decodeState(r.structuredContent?.state as string);
    assert.ok(s.rehearsal?.events.some((e) => e.text.includes("rains")));
    const briefs = r.structuredContent?.briefs as { prompt: string }[];
    assert.ok(briefs.length >= 1);
    assert.ok(briefs.every((b) => b.prompt.includes("rains")), "the event is in every refreshed brief");
  });

  test("whatif_rehearsal_interview records { personaId, answer } replies", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, personas: 4, rounds: 3, seed: 5 });
    const done = await call("whatif_rehearsal_autoplay", { state: start.structuredContent?.state });
    const question = "What would make you come back next week?";
    const asked = await call("whatif_rehearsal_interview", { state: done.structuredContent?.state, question });
    const briefs = asked.structuredContent?.briefs as { personaId: string }[];
    const answers = briefs.map((b) => `\`\`\`json\n${JSON.stringify({ personaId: b.personaId, answer: "A quicker queue at noon." })}\n\`\`\``);
    const rec = await call("whatif_rehearsal_interview", { state: done.structuredContent?.state, question, answers, method: "subagent" });
    assert.ok(!rec.isError, allText(rec));
    assert.equal((rec.structuredContent?.recorded as unknown[]).length, briefs.length);
    const s = decodeState(rec.structuredContent?.state as string);
    assert.equal(s.rehearsal?.interviews.at(-1)?.answers.length, briefs.length);
  });

  test("whatif_plan_test and whatif_log_result", async () => {
    const plan = await call("whatif_plan_test", LUNCH);
    assert.ok(!plan.isError, text(plan));
    assert.ok((plan.structuredContent?.plan?.days as number) > 0);
    assert.match(text(plan), /\/r#/);

    const missing = await call("whatif_log_result", { ...LUNCH, observed: { baseline_lunch_customers: 38 } });
    assert.equal(missing.isError, true);
    assert.match(text(missing), /test_lunch_customers|still need/);

    const observed = { baseline_lunch_customers: 38, test_lunch_customers: 46, redemptions_per_day: 14, days_run: 10 };
    const res = await call("whatif_log_result", { ...LUNCH, observed });
    assert.ok(!res.isError, text(res));
    assert.ok(["keep", "tweak", "stop"].includes(res.structuredContent?.result?.verdict));
    const s = decodeState(tokenOf(res.structuredContent?.report_url as string));
    assert.deepEqual(s.observed, observed);
  });
});

describe("HTTP edges", () => {
  test("browser GET returns the info JSON", async () => {
    const r = await fetch(`${base}/api/mcp`, { headers: { accept: "text/html,application/xhtml+xml" } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    const body = (await r.json()) as Record<string, unknown>;
    assert.equal(body.name, "what-if");
    assert.equal(body.mcp_url, `${base}/api/mcp`);
    assert.equal(body.how_to_connect, `${base}/connect`);
    assert.deepEqual(body.tools, [...TOOL_NAMES]);
  });

  test("GET with an event stream is 405 (stateless)", async () => {
    const r = await fetch(`${base}/api/mcp`, { headers: { accept: "text/event-stream" } });
    assert.equal(r.status, 405);
  });

  test("OPTIONS preflight allows the MCP headers", async () => {
    const r = await fetch(`${base}/api/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://example.com", "access-control-request-method": "POST", "access-control-request-headers": "content-type, mcp-protocol-version" },
    });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    const allow = (r.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    for (const h of ["content-type", "mcp-session-id", "mcp-protocol-version", "authorization"]) assert.ok(allow.includes(h), h);
    assert.match(r.headers.get("access-control-expose-headers") ?? "", /mcp-session-id/i);
  });

  test("a plain POST without MCP Accept headers still works", async () => {
    const r = await fetch(`${base}/api/mcp`, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { result?: { tools?: unknown[] } };
    assert.equal(body.result?.tools?.length, TOOL_NAMES.length);
  });

  test("invalid JSON body is a JSON-RPC parse error", async () => {
    const r = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
    assert.equal(r.status, 400);
    const body = (await r.json()) as { error?: { code: number } };
    assert.equal(body.error?.code, -32700);
  });
});

// ---------------------------------------------------------------------------
// v0.2: languages, question reading, state in place of inputs, unknown keys
// ---------------------------------------------------------------------------

describe("Languages", () => {
  test("German is the default: summary, labels and the report link's lang", async () => {
    const r = await call("whatif_run_scenarios", { template: "lunch_offer", inputs: demoInputs("lunch_offer"), demo: true });
    assert.ok(!r.isError, text(r));
    const t = text(r);
    assert.match(t, /Break-even \(Gewinnschwelle/);
    assert.match(t, /Schlechtester Fall/);
    assert.match(t, /Visuellen Bericht öffnen: http/);
    assert.equal(r.structuredContent?.lang, "de");
    assert.equal(decodeState(tokenOf(r.structuredContent?.report_url as string)).lang, "de");
  });

  test("Polish via pl-PL: Polish summary and lang pl in the report link and state", async () => {
    const r = await call("whatif_run_scenarios", { ...LUNCH, lang: "pl-PL" });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /Próg rentowności/);
    assert.match(text(r), /Najgorszy przypadek/);
    assert.match(text(r), /Otwórz raport wizualny/);
    assert.equal(decodeState(tokenOf(r.structuredContent?.report_url as string)).lang, "pl");
    assert.equal(decodeState(r.structuredContent?.state as string).lang, "pl");
  });

  test("language names work ('German', 'Deutsch', 'español'); an unknown language falls back to English", async () => {
    for (const [given, want] of [["German", "de"], ["Deutsch", "de"], ["español", "es"], ["fr", "en"]] as const) {
      const r = await call("whatif_check_inputs", { template: "price_change", inputs: {}, lang: given });
      assert.equal(r.structuredContent?.lang, want, given);
    }
  });

  test("whatif_start in German lists the questions, the Kieze and the Berlin events", async () => {
    const r = await call("whatif_start", { question: "Was wäre, wenn ich den Preis für Flat White erhöhe?" });
    assert.ok(!r.isError, text(r));
    const sc = r.structuredContent!;
    assert.equal(sc.template, "price_change");
    assert.equal(sc.lang, "de");
    assert.match(text(r), /Entscheidungsvorlage/);
    assert.ok((sc.kieze as string[]).includes("Neukölln"));
    const events = sc.berlin_events as { id: string; text: string }[];
    assert.ok(events.some((e) => e.id === "bvg_strike" && /BVG/.test(e.text)));
    assert.ok(events.some((e) => e.id === "rain_week" && /regnet/.test(e.text)), "events are in German");
    assert.equal(decodeState(tokenOf(sc.report_url as string)).lang, "de");
  });

  test("a rehearsal keeps its language through the state; lang on a later call switches it", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, lang: "es", personas: 4, rounds: 3, seed: 2 });
    assert.ok(!start.isError, text(start));
    assert.match(text(start), /Ensayo listo/);
    assert.equal(decodeState(start.structuredContent?.state as string).lang, "es");
    const auto = await call("whatif_rehearsal_autoplay", { state: start.structuredContent?.state });
    assert.match(text(auto), /reglas simples/);
    assert.equal(decodeState(tokenOf(auto.structuredContent?.report_url as string)).lang, "es");
    const de = await call("whatif_rehearsal_autoplay", { state: start.structuredContent?.state, lang: "de" });
    assert.equal(decodeState(de.structuredContent?.state as string).lang, "de");
  });

  test("a Berlin event id becomes its text in the owner's language", async () => {
    const start = await call("whatif_rehearsal_start", { ...LUNCH, lang: "de", seed: 4 });
    const r = await call("whatif_rehearsal_event", { state: start.structuredContent?.state, event: "bvg_strike" });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /BVG-Streik/);
    assert.ok(decodeState(r.structuredContent?.state as string).rehearsal?.events.some((e) => e.text.startsWith("BVG-Streik")));
  });
});

describe("Reading the question (whatif_start)", () => {
  const TABLE: [string, string][] = [
    ["What if I run a weekday lunch offer to bring in more customers?", "decision:lunch_offer"],
    ["Was wäre, wenn ich einen Mittagstisch anbiete?", "decision:lunch_offer"],
    ["¿Y si hago un menú del día por 9,90 €?", "decision:lunch_offer"],
    ["What if I offer a cheaper student lunch?", "decision:lunch_offer"],
    ["Was wäre, wenn ich den Preis für Flat White erhöhe?", "decision:price_change"],
    ["Was wäre, wenn ich den Flat White von 3,90 € auf 4,20 € erhöhe?", "decision:price_change"],
    ["What if I raise my coffee price by 30 cents?", "decision:price_change"],
    ["What if I put my cakes down to €3 after 4 pm?", "decision:price_change"],
    ["Co jeśli obniżę cenę ciasta do 3 € po 16:00?", "decision:price_change"],
    ["What if I hire a part-timer?", "unsupported"],
    ["What if I hire a part-timer for the lunch rush?", "unsupported"],
    ["What if I open on Sunday mornings?", "unsupported"],
    ["What if I close at 9 pm?", "unsupported"],
    ["Was wäre, wenn ich eine Aushilfe einstelle?", "unsupported"],
    ["what if it rains tomorrow?", "not_a_decision"],
    ["What if aliens landed?", "not_a_decision"],
    ["What if my landlord doubles the rent?", "not_a_decision"],
    ["Was wäre, wenn nebenan ein neues Café eröffnet?", "not_a_decision"],
    ["I'm back with my test results", "results"],
    ["Ich bin zurück mit den Ergebnissen vom Test.", "results"],
  ];

  test("a table of questions in four languages gets the right template, 'unsupported', 'not a decision' or 'results'", () => {
    const wrong = TABLE.map(([q, want]) => {
      const r = classifyQuestion(q);
      const got = r.kind === "decision" ? `decision:${r.id}` : r.kind;
      return got === want ? "" : `${q} -> ${got} (want ${want})`;
    }).filter(Boolean);
    assert.deepEqual(wrong, []);
  });

  test("'what if it rains tomorrow?' gets template null and a reframing, not lunch questions", async () => {
    const r = await call("whatif_start", { question: "what if it rains tomorrow?", lang: "en" });
    assert.ok(!r.isError, text(r));
    const sc = r.structuredContent!;
    assert.equal(sc.template, null);
    assert.equal(sc.kind, "not_a_decision");
    assert.equal(sc.reason, "weather");
    assert.equal(sc.report_url, null);
    assert.ok((sc.suggestions as string[]).length >= 2);
    assert.ok(!("ask_first" in sc), "no field list");
    assert.doesNotMatch(text(r), /Start by asking/);
    assert.match(text(r), /not a decision/i);
    assert.match(text(r), /whatif_rehearsal_event/);
  });

  test("aliens and hiring get template null; hiring for lunch points to the lunch template's staff hours", async () => {
    const aliens = await call("whatif_start", { question: "What if aliens landed?", lang: "en" });
    assert.equal(aliens.structuredContent?.template, null);
    const hire = await call("whatif_start", { question: "What if I hire a part-timer for the lunch rush?", lang: "en" });
    assert.equal(hire.structuredContent?.template, null);
    assert.equal(hire.structuredContent?.kind, "unsupported");
    assert.equal(hire.structuredContent?.topic, "hiring");
    assert.match(text(hire), /cannot model this decision yet/);
    assert.match(text(hire), /staff hours/);
    assert.doesNotMatch(text(hire), /Start by asking/);
    const de = await call("whatif_start", { question: "Was wäre, wenn ich sonntags öffne?" });
    assert.equal(de.structuredContent?.template, null);
    assert.match(text(de), /noch nicht durchrechnen/);
  });

  test("coming back with results points to whatif_log_result and its measured fields", async () => {
    const r = await call("whatif_start", { question: "I'm back with my test results from the lunch deal", lang: "en" });
    assert.ok(!r.isError, text(r));
    assert.equal(r.structuredContent?.kind, "results");
    assert.equal(r.structuredContent?.template, "lunch_offer");
    assert.deepEqual(r.structuredContent?.tools_next, ["whatif_log_result"]);
    assert.match(text(r), /whatif_log_result/);
    assert.match(text(r), /test_lunch_customers/);
  });

  test("a forced template still works for any question", async () => {
    const r = await call("whatif_start", { question: "what if it rains tomorrow?", template: "lunch_offer", lang: "en" });
    assert.equal(r.structuredContent?.template, "lunch_offer");
  });
});

describe("State in place of template + inputs", () => {
  test("run_scenarios returns state; what_changed, plan_test, rehearsal_start and log_result work from it alone", async () => {
    const run = await call("whatif_run_scenarios", LUNCH);
    const state = run.structuredContent?.state as string;
    assert.ok(state && state.length > 20, "state returned");
    assert.equal(state, tokenOf(run.structuredContent?.report_url as string), "state = the report token");

    const wc = await call("whatif_what_changed", { state, after: { extra_likely: Number(LUNCH.inputs.extra_likely) + 4 } });
    assert.ok(!wc.isError, text(wc));
    assert.ok((wc.structuredContent?.change?.changes as unknown[]).length >= 1);
    assert.equal(decodeState(wc.structuredContent?.state as string).inputs.extra_likely, Number(LUNCH.inputs.extra_likely) + 4);

    const plan = await call("whatif_plan_test", { state });
    assert.ok(!plan.isError, text(plan));
    assert.ok((plan.structuredContent?.plan?.days as number) > 0);
    assert.equal(plan.structuredContent?.lang, "en", "the language comes from the state");

    const reh = await call("whatif_rehearsal_start", { state, seed: 3 });
    assert.ok(!reh.isError, text(reh));
    assert.ok((reh.structuredContent?.briefs as unknown[]).length >= 1);

    const observed = { baseline_lunch_customers: 38, test_lunch_customers: 46, redemptions_per_day: 14 };
    const log = await call("whatif_log_result", { state: reh.structuredContent?.report_url, observed });
    assert.ok(!log.isError, text(log));
    const s = decodeState(tokenOf(log.structuredContent?.report_url as string));
    assert.deepEqual(s.observed, observed);
    assert.ok(s.rehearsal, "the rehearsal from the state stays in the report");
  });

  test("no template and no state is a plain error; a mismatched template is named", async () => {
    const none = await call("whatif_plan_test", { lang: "en" });
    assert.equal(none.isError, true);
    assert.match(text(none), /template.*inputs.*state/s);
    const run = await call("whatif_run_scenarios", LUNCH);
    const bad = await call("whatif_plan_test", { state: run.structuredContent?.state, template: "price_change" });
    assert.equal(bad.isError, true);
    assert.match(text(bad), /lunch_offer/);
  });

  test("a damaged state is a plain error that says what to pass instead", async () => {
    const r = await call("whatif_plan_test", { state: "eJzLSM3JyVcozy_KSQEAGgQEXQ-cut-off", lang: "en" });
    assert.equal(r.isError, true);
    assert.match(text(r), /damaged|cut off|format/);
    assert.doesNotMatch(text(r), /ask the coach/i);
  });
});

describe("Unknown input keys", () => {
  test("misnamed keys are named with a 'did you mean', not dropped silently", async () => {
    const r = await call("whatif_check_inputs", { template: "lunch_offer", inputs: { customers_per_day: 140, average_spend: 7.4, zebra: 1 }, lang: "en" });
    assert.ok(!r.isError, text(r));
    const ign = r.structuredContent?.ignored_inputs as { key: string; did_you_mean: string[] }[];
    assert.deepEqual(ign.find((x) => x.key === "customers_per_day")?.did_you_mean, ["weekday_customers"]);
    assert.deepEqual(ign.find((x) => x.key === "average_spend")?.did_you_mean, ["avg_spend"]);
    assert.deepEqual(ign.find((x) => x.key === "zebra")?.did_you_mean, []);
    assert.match(text(r), /customers_per_day \(did you mean weekday_customers\?\)/);
    assert.equal(r.structuredContent?.next_question?.key, "weekday_customers", "still asks for the real field");
  });

  test("suggestKeys: aliases, near spellings and shared words", () => {
    const lunch = ["weekday_customers", "avg_spend", "offer_price", "offer_cost", "setup_cost", "test_days"];
    assert.deepEqual(suggestKeys("avg_ticket", lunch), ["avg_spend"]);
    assert.deepEqual(suggestKeys("weekday_customer", lunch), ["weekday_customers"]);
    assert.deepEqual(suggestKeys("price", lunch), ["offer_price"]);
    assert.deepEqual(suggestKeys("Average Spend", lunch), ["avg_spend"]);
  });
});

describe("Interview instructions", () => {
  test("no interview text tells the host to call whatif_rehearsal_submit", async () => {
    const { tools } = await client.listTools();
    const iv = tools.find((t) => t.name === "whatif_rehearsal_interview")!;
    assert.doesNotMatch(iv.description ?? "", /whatif_rehearsal_submit/);
    const start = await call("whatif_rehearsal_start", { ...LUNCH, personas: 4, rounds: 3, seed: 9 });
    const done = await call("whatif_rehearsal_autoplay", { state: start.structuredContent?.state });
    const asked = await call("whatif_rehearsal_interview", { state: done.structuredContent?.state, question: "What would make you come back?" });
    assert.ok(!asked.isError, allText(asked));
    assert.doesNotMatch(allText(asked), /whatif_rehearsal_submit/);
    assert.doesNotMatch(String(asked.structuredContent?.how_to_run), /whatif_rehearsal_submit/);
    assert.match(String(asked.structuredContent?.how_to_run), /whatif_rehearsal_interview/);
  });
});

// ---------------------------------------------------------------------------
// Closed beta: invite codes
// ---------------------------------------------------------------------------

const CODES = "BERLIN-TEST-01, LINDEN-2026";
const RPC = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

async function post(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(RPC) });
}

describe("Closed beta (WHATIF_BETA_CODES)", () => {
  after(() => {
    delete process.env.WHATIF_BETA_CODES;
    delete process.env.WHATIF_BETA_CONTACT;
  });

  test("unset = open: POST works and GET says beta not required", async () => {
    delete process.env.WHATIF_BETA_CODES;
    const r = await post("/api/mcp");
    assert.equal(r.status, 200);
    const info = (await (await fetch(`${base}/api/mcp`)).json()) as { beta: { required: boolean; valid: boolean } };
    assert.deepEqual(info.beta, { required: false, valid: true });
  });

  test("set: 401 without a code, with a German and English message and the contact, never the codes", async () => {
    process.env.WHATIF_BETA_CODES = CODES;
    process.env.WHATIF_BETA_CONTACT = "beta@what-if.example";
    const r = await post("/api/mcp");
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    const body = (await r.json()) as { jsonrpc: string; error: { code: number; message: string; data?: { contact?: string } } };
    assert.equal(body.jsonrpc, "2.0");
    assert.match(body.error.message, /geschlossene Beta für Berliner Cafés/);
    assert.match(body.error.message, /closed beta for Berlin cafés/);
    assert.match(body.error.message, /beta@what-if\.example/);
    assert.equal(body.error.data?.contact, "beta@what-if.example");
    assert.doesNotMatch(JSON.stringify(body), /BERLIN-TEST-01|LINDEN-2026/);
  });

  test("set: a wrong code is 401 and is not echoed", async () => {
    process.env.WHATIF_BETA_CODES = CODES;
    const r = await post("/api/mcp?code=GUESS-123456");
    assert.equal(r.status, 401);
    const body = await r.text();
    assert.doesNotMatch(body, /GUESS-123456/);
    assert.match(body, /nicht gültig/);
  });

  test("set: a valid code works via ?code=, x-whatif-code and Authorization: Bearer (case does not matter)", async () => {
    process.env.WHATIF_BETA_CODES = CODES;
    const cases: [string, Record<string, string>][] = [
      ["/api/mcp?code=BERLIN-TEST-01", {}],
      ["/api/mcp?code=linden-2026", {}],
      ["/api/mcp", { "x-whatif-code": "LINDEN-2026" }],
      ["/api/mcp", { authorization: "Bearer BERLIN-TEST-01" }],
    ];
    for (const [path, headers] of cases) {
      const r = await post(path, headers);
      assert.equal(r.status, 200, `${path} ${JSON.stringify(headers)}`);
      const body = (await r.json()) as { result?: { tools?: unknown[] } };
      assert.equal(body.result?.tools?.length, TOOL_NAMES.length);
    }
  });

  test("set: GET ?code= checks a code for the site (CORS ok) without echoing it", async () => {
    process.env.WHATIF_BETA_CODES = CODES;
    const check = async (q: string) => {
      const r = await fetch(`${base}/api/mcp${q}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("access-control-allow-origin"), "*");
      const raw = await r.text();
      assert.doesNotMatch(raw, /BERLIN-TEST-01|LINDEN-2026/);
      return (JSON.parse(raw) as { beta: { required: boolean; valid: boolean } }).beta;
    };
    const ok = await check("?code=LINDEN-2026");
    assert.equal(ok.required, true);
    assert.equal(ok.valid, true);
    assert.equal((await check("")).valid, false);
    assert.equal((await check("?code=nope-nope")).valid, false);
  });

  test("set: the SDK client connects with ?code= in the URL, and report links never carry the code", async () => {
    process.env.WHATIF_BETA_CODES = CODES;
    const c = new Client({ name: "what-if-beta-test", version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp?code=BERLIN-TEST-01`)));
    try {
      const r = (await c.callTool({ name: "whatif_run_scenarios", arguments: LUNCH })) as Result;
      assert.ok(!r.isError, text(r));
      assert.doesNotMatch(r.structuredContent?.report_url as string, /code=|BERLIN-TEST-01/);
      assert.doesNotMatch(allText(r), /BERLIN-TEST-01/);
    } finally {
      await c.close();
    }
  });

  test("set but every entry too short: closed for everyone", async () => {
    process.env.WHATIF_BETA_CODES = "abc,12345";
    assert.equal((await post("/api/mcp?code=abc")).status, 401);
    assert.equal((await post("/api/mcp?code=12345")).status, 401);
  });
});
