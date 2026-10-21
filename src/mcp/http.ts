/**
 * Vercel Node handler (Build Output API, launcherType "Nodejs", no helpers):
 * a stateless Streamable HTTP MCP endpoint at /api/mcp (and /mcp).
 *
 * Per request: a fresh server and transport, JSON responses, nothing kept.
 * GET from a browser returns a small JSON description of the server.
 *
 * Closed beta: when WHATIF_BETA_CODES is set (comma-separated, each at least
 * 6 characters), a POST needs a valid invite code via `?code=`, the
 * `x-whatif-code` header or `Authorization: Bearer` to get results. Unset = open.
 * Codes are compared in constant time and never logged or echoed. Report links stay open.
 *
 * Without a valid code the server never answers 401: MCP clients treat a 401 as
 * "start an OAuth sign-in" and the owner would never see why. Instead initialize,
 * tools/list and prompts/list work as usual, and every tools/call returns
 * `isError: true` with the German + English beta message, the contact and the
 * `?code=YOUR-CODE` hint. The OAuth discovery paths (/.well-known/oauth-*,
 * /register, /authorize, /token, at the site root and under /api/mcp) answer
 * 404 JSON with the same message, and no response carries WWW-Authenticate.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LANGS } from "../i18n/index.ts";
import { betaMessage, noSignInMessage } from "./messages.ts";
import { betaContact, createServer, SERVER_DESCRIPTION, TOOL_NAMES, VERSION } from "./tools.ts";

export { betaMessage };

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, X-WhatIF-Code, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, X-Requested-With",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function setCors(res: ServerResponse): void {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim() ?? "";
}

/**
 * The public site the report links point to:
 * WHATIF_SITE_URL, else the host this request came in on (so links match the
 * deployment that made them), else VERCEL_PROJECT_PRODUCTION_URL, else localhost.
 */
export function siteUrlFor(req: IncomingMessage): string {
  const env = process.env.WHATIF_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const host = header(req, "x-forwarded-host") || header(req, "host");
  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host) || host.endsWith(".localhost");
    const proto = header(req, "x-forwarded-proto") || (local ? "http" : "https");
    return `${proto === "http" ? "http" : "https"}://${host.toLowerCase()}`;
  }
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(body, null, 2));
}

function rpcError(res: ServerResponse, status: number, code: number, message: string, extra: Record<string, string> = {}): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null }, extra);
}

class BodyError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  // Some runtimes (or a dev wrapper) may have parsed the body already.
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (pre !== undefined && pre !== null && typeof pre === "object" && !(pre instanceof Uint8Array)) return pre;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new BodyError(413, -32600, "Request body too large.");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new BodyError(400, -32700, "Parse error: the request body is empty; send a JSON-RPC message.");
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400, -32700, "Parse error: the request body is not valid JSON.");
  }
}

/**
 * Be lenient with simple clients (curl, scripts): the body was already parsed as JSON,
 * so a missing Accept or Content-Type should not turn into a 406/415.
 * The SDK reads rawHeaders (via @hono/node-server), so patch both views.
 */
function forgiveHeaders(req: IncomingMessage): void {
  const want: Record<string, (v: string) => string | undefined> = {
    accept: (v) => (v.includes("application/json") && v.includes("text/event-stream") ? undefined : "application/json, text/event-stream"),
    "content-type": (v) => (v.toLowerCase().includes("application/json") ? undefined : "application/json"),
  };
  for (const [name, fix] of Object.entries(want)) {
    const raw = req.rawHeaders;
    let found = false;
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i]?.toLowerCase() !== name) continue;
      found = true;
      const next = fix(raw[i + 1] ?? "");
      if (next !== undefined) raw[i + 1] = next;
    }
    if (!found) raw.push(name, fix("") ?? "");
    const fixed = fix(String(req.headers[name] ?? ""));
    if (fixed !== undefined) req.headers[name] = fixed;
  }
}

// ---------------------------------------------------------------------------
// Closed beta: invite codes
// ---------------------------------------------------------------------------

/** Codes longer than this are never valid, so a huge header or query cannot cost anything. */
const MAX_CODE_CHARS = 200;
const MIN_CODE_CHARS = 6;

interface Beta {
  required: boolean;
  /** SHA-256 of each valid code (upper-cased), so every comparison has the same length. */
  digests: Buffer[];
}

let betaCache: { raw: string; beta: Beta } | null = null;
let warnedShortCodes = false;

const digest = (code: string): Buffer => createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest();

/**
 * WHATIF_BETA_CODES, read on every request (cheap, cached per value).
 * Unset or blank = open. Set = closed, even if every entry is too short to count.
 */
export function betaConfig(): Beta {
  const raw = process.env.WHATIF_BETA_CODES ?? "";
  if (betaCache?.raw === raw) return betaCache.beta;
  const entries = raw.split(",").map((c) => c.trim()).filter(Boolean);
  const valid = entries.filter((c) => c.length >= MIN_CODE_CHARS && c.length <= MAX_CODE_CHARS);
  if (valid.length < entries.length && !warnedShortCodes) {
    warnedShortCodes = true;
    console.warn(`[what-if] WHATIF_BETA_CODES: ${entries.length - valid.length} entr${entries.length - valid.length === 1 ? "y is" : "ies are"} shorter than ${MIN_CODE_CHARS} characters and will never be accepted.`);
  }
  const beta: Beta = { required: raw.trim() !== "", digests: valid.map(digest) };
  betaCache = { raw, beta };
  return beta;
}

/** The invite code a request carries: ?code=, x-whatif-code, or Authorization: Bearer. Never logged. */
export function codeFrom(req: IncomingMessage): string {
  let fromQuery = "";
  try {
    fromQuery = new URL(req.url ?? "/", "http://x").searchParams.get("code") ?? "";
  } catch {
    /* a malformed URL carries no code */
  }
  const fromHeader = header(req, "x-whatif-code");
  const auth = String(req.headers.authorization ?? "");
  const fromBearer = /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1] ?? "";
  return (fromQuery || fromHeader || fromBearer).trim();
}

/** Constant-time: every code is compared, digests have equal length, no early exit. */
export function codeIsValid(code: string, beta: Beta = betaConfig()): boolean {
  if (!code || code.length > MAX_CODE_CHARS) return false;
  const given = digest(code);
  let ok = 0;
  for (const d of beta.digests) ok |= timingSafeEqual(given, d) ? 1 : 0;
  return ok === 1;
}

// ---------------------------------------------------------------------------
// OAuth discovery: What-IF has no sign-in, so these paths say so (404, never 401)
// ---------------------------------------------------------------------------

/**
 * /.well-known/oauth-protected-resource (also with /api/mcp after it), /.well-known/oauth-authorization-server,
 * /.well-known/openid-configuration, /register, /authorize, /token: at the site root, under /api/mcp or /mcp.
 * scripts/build.mjs routes them here and marks them with ?__whatif_oauth=1 (in case the platform passes the rewritten path).
 */
const OAUTH_PATH =
  /^\/(?:(?:api\/)?mcp\/)?(?:\.well-known\/(?:oauth-protected-resource|oauth-authorization-server|openid-configuration)(?:\/.*)?|register|authorize|token)\/?$/i;

export function isOAuthPath(req: IncomingMessage): boolean {
  try {
    const u = new URL(req.url ?? "/", "http://x");
    return OAUTH_PATH.test(u.pathname) || u.searchParams.has("__whatif_oauth");
  } catch {
    return false;
  }
}

function oauthNotFound(req: IncomingMessage, res: ServerResponse, siteUrl: string, beta: Beta, method: string): void {
  const code = codeFrom(req);
  const ok = !beta.required || codeIsValid(code, beta);
  const contact = betaContact();
  const message = ok ? noSignInMessage(siteUrl, beta.required) : betaMessage(code !== "", contact, siteUrl);
  if (method === "HEAD") {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end();
    return;
  }
  sendJson(res, 404, {
    error: "invalid_request",
    error_description: message,
    message,
    mcp_url: `${siteUrl}/api/mcp`,
    how_to_connect: `${siteUrl}/connect`,
    beta: { required: beta.required, valid: ok, ...(contact ? { contact } : {}) },
  });
}

function info(siteUrl: string, beta: { required: boolean; valid: boolean; hadCode: boolean }) {
  const contact = betaContact();
  const locked = beta.required && !beta.valid;
  return {
    name: "what-if",
    version: VERSION,
    description: SERVER_DESCRIPTION,
    mcp_url: `${siteUrl}/api/mcp`,
    transport: "Streamable HTTP (stateless, JSON responses). POST JSON-RPC messages to mcp_url.",
    how_to_connect: `${siteUrl}/connect`,
    claude_code: beta.required
      ? `claude mcp add --transport http what-if "${siteUrl}/api/mcp?code=YOUR-INVITE-CODE"`
      : `claude mcp add --transport http what-if ${siteUrl}/api/mcp`,
    tools: [...TOOL_NAMES],
    prompts: ["what-if"],
    languages: [...LANGS],
    beta: {
      required: beta.required,
      valid: beta.valid,
      ...(contact ? { contact } : {}),
      // What every tool call on this link answers (the site and the QA bot read it; it never holds the code).
      ...(locked ? { message: betaMessage(beta.hadCode, contact, siteUrl) } : {}),
    },
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(res);
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, { "Content-Length": "0" });
    res.end();
    return;
  }

  const siteUrl = siteUrlFor(req);
  const beta = betaConfig();

  // OAuth discovery and sign-in endpoints: none exist. 404 with the beta message, never 401.
  if (isOAuthPath(req)) {
    oauthNotFound(req, res, siteUrl, beta, method);
    return;
  }

  if (method === "GET" || method === "HEAD") {
    const accept = String(req.headers.accept ?? "").toLowerCase();
    if (accept.includes("text/event-stream")) {
      rpcError(res, 405, -32000, "Method not allowed: this What-IF server is stateless and has no event stream. Send requests with POST.", {
        Allow: "POST, OPTIONS",
      });
      return;
    }
    if (method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return;
    }
    // The site checks a code here without storing anything: { beta: { required, valid } }.
    const code = codeFrom(req);
    sendJson(res, 200, info(siteUrl, { required: beta.required, valid: !beta.required || codeIsValid(code, beta), hadCode: code !== "" }));
    return;
  }

  if (method === "DELETE") {
    rpcError(res, 405, -32000, "Method not allowed: this What-IF server is stateless, so there is no session to end.", { Allow: "POST, OPTIONS" });
    return;
  }

  if (method !== "POST") {
    rpcError(res, 405, -32000, `Method not allowed: ${method}. Send MCP requests with POST.`, { Allow: "GET, POST, OPTIONS" });
    return;
  }

  // Closed beta without a valid code: the session works, every tool call answers with the beta message.
  const code = beta.required ? codeFrom(req) : "";
  const locked = beta.required && !codeIsValid(code, beta);

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) rpcError(res, e.status, e.code, e.message);
    else rpcError(res, 400, -32700, "Parse error: could not read the request body.");
    return;
  }

  forgiveHeaders(req);
  const server = createServer(siteUrl, locked ? { locked: { hadCode: code !== "" } } : {});
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error("[what-if] MCP request failed:", e);
    if (!res.headersSent) rpcError(res, 500, -32603, "Internal error in the What-IF server.");
    else res.end();
  }
}
