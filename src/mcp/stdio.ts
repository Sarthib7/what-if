/**
 * The What-IF tools over stdio, for local MCP clients:
 *   claude mcp add what-if -- node dist/whatif-stdio.mjs
 * stdout carries only the protocol; every log goes to stderr.
 *
 * Report links point to WHATIF_SITE_URL, else the public site this file was
 * built for (a deployed Vercel build), else http://localhost:3000 (npm run dev).
 * Invite codes do not apply here: the server runs on the owner's own machine.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools.ts";

declare const __WHATIF_DEFAULT_SITE__: string | undefined;

// Anything that tries to print must not corrupt the JSON-RPC stream on stdout.
console.log = console.error;
console.info = console.error;
console.debug = console.error;

const LOCAL_SITE = "http://localhost:3000";
const builtFor = typeof __WHATIF_DEFAULT_SITE__ === "string" ? __WHATIF_DEFAULT_SITE__.trim() : "";
const fromEnv = process.env.WHATIF_SITE_URL?.trim() ?? "";
const siteUrl = (fromEnv || builtFor || LOCAL_SITE).replace(/\/+$/, "");
const where = fromEnv
  ? "from WHATIF_SITE_URL"
  : builtFor
    ? "the site this build was made for; set WHATIF_SITE_URL to change it"
    : "no WHATIF_SITE_URL set; run `npm run dev` so the links open, or set WHATIF_SITE_URL to your public site";

const server = createServer(siteUrl);
const transport = new StdioServerTransport();

async function shutdown(): Promise<void> {
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.stdin.on("end", () => void shutdown());

await server.connect(transport);
console.error(`[what-if] MCP server on stdio; report links point to ${siteUrl} (${where})`);
