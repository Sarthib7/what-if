# MCP, skill and plugin formats (checked 17 Oct 2026)

Notes behind the delivery choices in `PLAN.md`. They are summarised from the Claude Code docs (plugins, skills, sub-agents, mcp), the claude.com plugin/skill docs, the MCP Apps docs and the MCP specification (2026-07-28).

## Remote MCP: works everywhere

- Remote MCP servers (Streamable HTTP, fixed URL) work in Claude.ai, Claude Desktop, Cowork and Claude Code. In chat apps the user adds them as a custom connector.
- Local stdio servers run only in Claude Code, and in Cowork when the session runs on the computer.
- So for "paste one URL into any chat app" the server must be remote, and here it is a Vercel function.
- Claude Code: `claude mcp add --transport http what-if https://<site>/api/mcp`.
- **Sampling** (the server asking the client's model to generate) was deprecated in the 2026-07-28 spec ("new implementations SHOULD NOT adopt it"). So the imagined customers are played by the host, through subagents or role play, not by the server.
- **MCP Apps** (inline UI resources) render in Claude web and Desktop but not in Claude Code. For now the visual is a website link that works everywhere; MCP Apps are a later addition.

## Skills

- `SKILL.md` frontmatter for a claude.ai upload accepts only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools`. Any other key is a hard error.
- `name`: lowercase letters, digits and hyphens, at most 64 characters, matching the folder.
- `description`: at most 1,024 characters. It is always in context, and it decides when the skill triggers. That is where the "what if" trigger lives.
- Keep the body under 500 lines; `references/` are read on demand (progressive disclosure).
- Upload: a zip whose top-level folder is the skill name (`what-if/SKILL.md`).
- Claude Code: put it at `~/.claude/skills/what-if/` or `.claude/skills/what-if/`.

## Subagents (rehearsal fan-out)

- In Claude Code and Cowork the model launches subagents with the Agent tool, up to 20 at once by default. Subagents inherit the session's MCP tools. A brief that is the whole prompt works with the general-purpose subagent, so no custom agent file is needed.
- Plugin agent files (`agents/*.md`) are ignored in chat, which is another reason the briefs are self-contained.

## Plugins (later)

- A plugin is a folder with `.claude-plugin/plugin.json` (only `name` is required, in kebab-case) plus `skills/`, `agents/`, `commands/` and `.mcp.json`.
- A single-repo marketplace is `.claude-plugin/marketplace.json` with `"source": "./plugin"`.
- Install: `/plugin marketplace add owner/repo`, then `/plugin install what-if@<marketplace>`. Validate with `claude plugin validate <dir>`.
- Cowork and claude.ai take the same format, either as an uploaded zip or added as a marketplace.
- For a marketplace install, Claude Code runs `npm install` only when there is a `package.json` with a lockfile, and it never runs a build. So a plugin should ship a bundled server file.
