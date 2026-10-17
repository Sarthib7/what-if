# Connecting What-IF

What-IF has two parts you can add to your AI:

1. **The MCP server** (the calculator, the rehearsal and the report links). One address works everywhere:

   ```
   {{SITE_URL}}/api/mcp
   ```

   It is a remote MCP server (Streamable HTTP), free, with no sign-in. It stores nothing: your numbers travel inside the report link.

2. **The skill** (this coaching guide), for apps that support skills: Claude.ai, Claude Desktop, Cowork and Claude Code. Download: {{SITE_URL}}/what-if-skill.zip

You need the MCP server for the maths and the visual report. The skill makes the coaching better where skills exist. A picture-by-picture guide is at {{SITE_URL}}/connect.

App menus change from time to time. If a label below looks slightly different, look for "connectors", "integrations" or "MCP".

## Claude.ai and Claude Desktop

1. Open **Settings → Connectors**.
2. Click **Add custom connector**.
3. Name: `What-IF`. URL: `{{SITE_URL}}/api/mcp`. Leave authentication empty. Click **Add**.
4. In a new chat, open the tools menu (the **+** or sliders button under the message box) and make sure **What-IF** is switched on.
5. Say: "What if I run a weekday lunch offer?"

On a Team or Enterprise plan, an owner or admin may need to add the connector first in the organisation's settings.

## Claude Code

```bash
claude mcp add --transport http what-if {{SITE_URL}}/api/mcp
```

Add `--scope user` to make it available in every project. Check it with `/mcp` inside Claude Code. The tools appear as `mcp__what-if__whatif_start` and so on.

## Cowork

Cowork uses the same connectors as Claude Desktop: add the custom connector as above, and it is available in Cowork sessions too. Cowork can run the customer rehearsal with parallel subagents.

## ChatGPT (developer mode)

1. Open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**.
2. Back in **Apps & Connectors**, click **Create** (or **Add connector**).
3. Name: `What-IF`. MCP server URL: `{{SITE_URL}}/api/mcp`. Authentication: **No authentication**. Tick that you trust the connector, then create it.
4. In a new chat, choose **Developer mode** from the **+** menu and enable **What-IF**.
5. Say: "What if I run a weekday lunch offer?"

Developer mode availability depends on your ChatGPT plan.

## Cursor

Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "what-if": {
      "url": "{{SITE_URL}}/api/mcp"
    }
  }
}
```

Then check **Settings → MCP** shows What-IF as connected.

## VS Code (GitHub Copilot agent mode)

Add this to `.vscode/mcp.json` in your project (or run **MCP: Add Server** from the command palette and choose HTTP):

```json
{
  "servers": {
    "what-if": {
      "type": "http",
      "url": "{{SITE_URL}}/api/mcp"
    }
  }
}
```

Start the server from the file's **Start** link, then use Copilot Chat in agent mode.

## Other MCP clients

Any client that supports remote MCP over Streamable HTTP can use `{{SITE_URL}}/api/mcp` directly. For a client that only supports local (stdio) servers, a bridge such as `mcp-remote` works:

```json
{
  "mcpServers": {
    "what-if": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{{SITE_URL}}/api/mcp"]
    }
  }
}
```

Opening `{{SITE_URL}}/api/mcp` in a browser shows a short info page; that is how you know the address is right.

## Installing the skill

**Claude.ai, Claude Desktop and Cowork**

1. Download `what-if-skill.zip` from {{SITE_URL}}/what-if-skill.zip. Don't unzip it.
2. Open **Settings → Capabilities → Skills** (code execution needs to be on for skills).
3. Click **Upload skill** and choose `what-if-skill.zip`.
4. Make sure the **what-if** skill is switched on.

**Claude Code**

Unzip so that the file ends up at `~/.claude/skills/what-if/SKILL.md` (all projects), or at `.claude/skills/what-if/SKILL.md` inside one project:

```bash
mkdir -p ~/.claude/skills
unzip what-if-skill.zip -d ~/.claude/skills/
```

The zip already contains the `what-if/` folder. Start a new Claude Code session; the skill triggers when you say "what if…" about a business decision.

## Checking it works

Say: **"What if I run a weekday lunch offer?"**

You should get a short reply that offers the demo report and asks one question with a reason. If the AI answers from general knowledge instead, the MCP server is not switched on for that chat; open the tools menu and enable What-IF.

## Privacy, in one paragraph

The What-IF server keeps no records. Each tool call gets your numbers, does the maths and sends them back. The report link carries your numbers after the `#`, a part of a web address that browsers never send to the server; the report page redraws everything in your browser. Anyone you share the link with can see the numbers in it, so share it as you would share a spreadsheet.
