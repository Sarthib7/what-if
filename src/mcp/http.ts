/**
 * Vercel Node handler (Build Output API, launcherType "Nodejs", no helpers):
 * a stateless Streamable HTTP MCP endpoint at /api/mcp (and /mcp).
 *
 * Per request: a fresh server and transport, JSON responses, nothing kept.
 * GET from a browser returns a small JSON description of the server.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, SERVER_DESCRIPTION, TOOL_NAMES, VERSION } from "./tools.ts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, X-Requested-With",
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

function info(siteUrl: string) {
  return {
    name: "what-if",
    version: VERSION,
    description: SERVER_DESCRIPTION,
    mcp_url: `${siteUrl}/api/mcp`,
    transport: "Streamable HTTP (stateless, JSON responses). POST JSON-RPC messages to mcp_url.",
    how_to_connect: `${siteUrl}/connect`,
    claude_code: `claude mcp add --transport http what-if ${siteUrl}/api/mcp`,
    tools: [...TOOL_NAMES],
    prompts: ["what-if"],
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
    sendJson(res, 200, info(siteUrl));
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

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) rpcError(res, e.status, e.code, e.message);
    else rpcError(res, 400, -32700, "Parse error: could not read the request body.");
    return;
  }

  forgiveHeaders(req);
  const server = createServer(siteUrl);
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
