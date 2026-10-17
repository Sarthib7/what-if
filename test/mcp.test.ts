/**
 * End-to-end test of the public MCP server: the Vercel handler from
 * src/mcp/http.ts runs in an in-process Node server, and the SDK client talks
 * to it over Streamable HTTP, exactly as Claude, ChatGPT or Cursor would.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import handler from "../src/mcp/http.ts";
import { TOOL_NAMES } from "../src/mcp/tools.ts";
import { demoInputs } from "../src/engine/index.ts";
import { decodeState, encodeState } from "../src/state.ts";

delete process.env.WHATIF_SITE_URL;

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

const LUNCH = { template: "lunch_offer", inputs: demoInputs("lunch_offer"), demo: true };

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
    const r = await call("whatif_start", { question: "What if I run a weekday lunch offer?" });
    assert.ok(!r.isError, text(r));
    assert.equal(r.structuredContent?.template, "lunch_offer");
    assert.ok((r.structuredContent?.ask_first as unknown[]).length > 0);
    assert.match(text(r), /Open the visual report/);
    assert.match(text(r), /\/r#/);
    assert.match(text(r), /Coaching:/);
    const s = decodeState(tokenOf(r.structuredContent?.report_url as string));
    assert.equal(s.template, "lunch_offer");
    assert.equal(s.demo, true);

    const price = await call("whatif_start", { question: "What if I raise the price of a flat white by 30 cents?" });
    assert.equal(price.structuredContent?.template, "price_change");
  });

  test("whatif_check_inputs returns the next question", async () => {
    const r = await call("whatif_check_inputs", { template: "lunch_offer", inputs: { weekday_customers: 140 } });
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
    const r = await call("whatif_run_scenarios", { template: "lunch_offer", inputs: { weekday_customers: 140 } });
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
