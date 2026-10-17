/**
 * The What-IF tools over stdio, for local MCP clients:
 *   claude mcp add what-if -- node dist/whatif-stdio.mjs
 * stdout carries only the protocol; every log goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools.ts";

declare const __WHATIF_DEFAULT_SITE__: string | undefined;

// Anything that tries to print must not corrupt the JSON-RPC stream on stdout.
console.log = console.error;
console.info = console.error;
console.debug = console.error;

const fallbackSite =
  typeof __WHATIF_DEFAULT_SITE__ === "string" && __WHATIF_DEFAULT_SITE__ ? __WHATIF_DEFAULT_SITE__ : "https://what-if-coach.vercel.app";
const siteUrl = (process.env.WHATIF_SITE_URL?.trim() || fallbackSite).replace(/\/+$/, "");

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
console.error(`[what-if] MCP server on stdio; report links point to ${siteUrl}`);
