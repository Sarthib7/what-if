# Connecting What-IF

What-IF is a **closed beta for independent cafés in Berlin**, in German, English, Spanish and Polish. There are three ways in:

1. **The MCP server** (the calculator, the rehearsal and the report links), with your café's personal address:

   ```
   {{SITE_URL}}/api/mcp?code=YOUR-CODE
   ```

   Put your invite code in place of `YOUR-CODE`. It is a remote MCP server (Streamable HTTP). It stores nothing: your numbers travel inside the report link.

2. **The skill** (this coaching guide), for apps that read skills: Claude.ai, Claude Desktop, Cowork, Claude Code and other agents that load skill folders. Download: {{SITE_URL}}/what-if-skill.zip. Apps without skills can use the starter prompt below instead.

3. **No AI app?** {{SITE_URL}}/try asks your numbers one screen at a time in the browser and builds the same visual report. It needs the invite code too.

The connect page, {{SITE_URL}}/connect, builds your personal address from your code, with copy buttons and steps for each app. App menus change from time to time. If a label below looks slightly different, look for "connectors", "integrations" or "MCP".

## Your invite code

- Each café in the beta gets its own code.
- Request an invite: {{BETA_CONTACT}}
- No code yet? Ask the person who invited you.
- Treat it like a door key: put it in your AI app's settings, but don't post it publicly. Never paste it into a chat message; the AI doesn't need it.
- **Check it:** open `{{SITE_URL}}/api/mcp?code=YOUR-CODE` in a browser. A JSON info page with `"valid": true` means the address is right. Without a valid code, apps get an error that says What-IF is a closed beta for Berlin cafés.
- If your app asks you to sign in or says unauthorised, the link is missing your invite code: use {{SITE_URL}}/api/mcp?code=YOUR-CODE
- Report links (`{{SITE_URL}}/r#…`) need no code; they carry their own numbers, so you can share them.

## Claude.ai and Claude Desktop

1. Open **Settings → Connectors**.
2. Click **Add custom connector**.
3. Name: `What-IF`. URL: `{{SITE_URL}}/api/mcp?code=YOUR-CODE`. Leave authentication empty. Click **Add**.
4. In a new chat, open the tools menu (the **+** or sliders button under the message box) and make sure **What-IF** is switched on.
5. Say: "Was wäre, wenn ich einen Mittagstisch anbiete?" (or in English: "What if I run a weekday lunch offer?")

On a Team or Enterprise plan, an owner or admin may need to add the connector first in the organisation's settings.

## Claude Code

```bash
claude mcp add --transport http what-if "{{SITE_URL}}/api/mcp?code=YOUR-CODE"
```

Keep the quotes: some shells treat `?` as a wildcard. Or send the code as a header instead: `claude mcp add --transport http what-if {{SITE_URL}}/api/mcp --header "x-whatif-code: YOUR-CODE"`. Add `--scope user` to make it available in every project. Check it with `/mcp` inside Claude Code. The tools appear as `mcp__what-if__whatif_start` and so on.

## Cowork

Cowork uses the same connectors as Claude Desktop: add the custom connector as above, and it is available in Cowork sessions too. Cowork can run the customer rehearsal with parallel subagents.

## ChatGPT (developer mode)

1. Open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**.
2. Back in **Apps & Connectors**, click **Create** (or **Add connector**).
3. Name: `What-IF`. MCP server URL: `{{SITE_URL}}/api/mcp?code=YOUR-CODE`. Authentication: **No authentication**. Tick that you trust the connector, then create it.
4. In a new chat, choose **Developer mode** from the **+** menu and enable **What-IF**.
5. Paste the starter prompt below (ChatGPT has no skills).

Developer mode availability depends on your ChatGPT plan.

## Cursor

Add this to `~/.cursor/mcp.json` (all projects) or to `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "what-if": {
      "url": "{{SITE_URL}}/api/mcp?code=YOUR-CODE"
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
      "url": "{{SITE_URL}}/api/mcp?code=YOUR-CODE"
    }
  }
}
```

Start the server from the file's **Start** link, then use Copilot Chat in agent mode.

## Other MCP clients

Any client that supports remote MCP over Streamable HTTP can use `{{SITE_URL}}/api/mcp?code=YOUR-CODE` directly; clients that can send headers may use `x-whatif-code: YOUR-CODE` or `Authorization: Bearer YOUR-CODE` with the plain `{{SITE_URL}}/api/mcp`. For a client that only supports local (stdio) servers, a bridge such as `mcp-remote` works:

```json
{
  "mcpServers": {
    "what-if": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{{SITE_URL}}/api/mcp?code=YOUR-CODE"]
    }
  }
}
```

## Apps without skills: the starter prompt

With the MCP connected but no skill (ChatGPT, Cursor, VS Code, most chat apps), paste one of these into a new chat, with your idea in place of the dots. If your app lists MCP prompts, the server's **`what-if`** prompt does the same.

**Deutsch**

```text
Ich habe ein Café in Berlin und möchte mit What-IF eine Entscheidung durchspielen, bevor ich Geld ausgebe. Meine Frage: Was wäre, wenn …?
Bitte nutzen Sie die What-IF-Tools: zuerst whatif_start mit meiner Frage wörtlich und lang "de", danach bei jedem Aufruf lang "de". Fragen Sie mich immer nur eine Zahl auf einmal und sagen Sie, warum sie wichtig ist; grobe Zahlen reichen. Lesen Sie jede Zahl zur Kontrolle vor.
Nennen Sie dann zuerst die Gewinnschwelle, danach die drei möglichen Ergebnisse, den schlimmsten Fall und die größte Unsicherheit. Kennzeichnen Sie jede Zahl wie der Bericht (Ihre Zahl, Eine Schätzung, Berechnet, Ausgedacht), und teilen Sie bei jedem Schritt den Link zum Bericht.
Lassen Sie mich eine Schätzung verändern, bieten Sie den Probelauf mit ausgedachten Gästen an und schließen Sie mit einem kleinen Test mit der Regel behalten / anpassen / aufhören. Rechnen Sie Geldbeträge nie selbst und erfinden Sie keine Statistiken. Wenn Sie die What-IF-Tools nicht haben, sagen Sie es mir und verweisen Sie auf {{SITE_URL}}/connect.
```

**English**

```text
I run a café in Berlin and want to rehearse a decision with What-IF before I spend money. My question: what if …?
Please use the What-IF tools: whatif_start first, with my question word for word and lang "en", then lang "en" on every call. Ask me one number at a time and tell me why it matters; rough numbers are fine. Read each number back to me.
Then give me the break-even first, then the three possible outcomes, the worst case and the biggest uncertainty. Label every number as the report does (Your number, A guess, Calculated, Imagined), and share the visual report link at every step.
Let me move one guess, offer the rehearsal with imagined customers, and finish with a small, reversible test with a keep / tweak / stop rule. Never calculate money yourself and never invent statistics. If you don't have the What-IF tools, tell me and point me to {{SITE_URL}}/connect.
```

**Español**

```text
Tengo una cafetería en Berlín y quiero ensayar una decisión con What-IF antes de gastar dinero. Mi pregunta: ¿y si …?
Usa las herramientas de What-IF: primero whatif_start, con mi pregunta tal cual y lang "es", y después lang "es" en cada llamada. Pregúntame un solo dato cada vez y dime por qué importa; con cifras aproximadas basta. Repíteme cada número para confirmarlo.
Después dime primero el punto de equilibrio, luego los tres resultados posibles, el peor caso y la mayor incertidumbre. Marca cada número como el informe (Tu número, Una estimación, Calculado, Imaginado) y comparte el enlace al informe visual en cada paso.
Déjame cambiar una estimación, ofréceme el ensayo con clientes imaginados y termina con una prueba pequeña y reversible con la regla mantener / ajustar / parar. No calcules nunca el dinero por tu cuenta ni inventes estadísticas. Si no tienes las herramientas de What-IF, dímelo y remíteme a {{SITE_URL}}/connect.
```

**Polski**

```text
Prowadzę kawiarnię w Berlinie i chcę przećwiczyć decyzję z What-IF, zanim wydam pieniądze. Moje pytanie: co jeśli …?
Użyj narzędzi What-IF: najpierw whatif_start z moim pytaniem słowo w słowo i lang "pl", potem lang "pl" przy każdym wywołaniu. Pytaj mnie o jedną liczbę naraz i mów, dlaczego jest ważna; przybliżone liczby wystarczą. Powtarzaj każdą liczbę do potwierdzenia.
Potem podaj najpierw próg rentowności, następnie trzy możliwe wyniki, najgorszy przypadek i największą niepewność. Oznacz każdą liczbę tak jak raport (Twoja liczba, Szacunek, Wyliczone, Wyobrażone) i na każdym kroku udostępniaj link do raportu.
Pozwól mi zmienić jeden szacunek, zaproponuj próbę z wyobrażonymi klientami i zakończ małym, odwracalnym testem z regułą zostaw / dopasuj / zakończ. Nigdy nie licz pieniędzy samodzielnie i nie wymyślaj statystyk. Jeśli nie masz narzędzi What-IF, powiedz mi o tym i odeślij mnie do {{SITE_URL}}/connect.
```

## Installing the skill

**Claude.ai, Claude Desktop and Cowork**

1. Download `what-if-skill.zip` from {{SITE_URL}}/what-if-skill.zip. Don't unzip it.
2. Open **Settings → Capabilities → Skills** (code execution needs to be on for skills).
3. Click **Upload skill** and choose `what-if-skill.zip`.
4. Make sure the **what-if** skill is switched on.

**Claude Code**

The zip already contains the `what-if/` folder. Unzip it so the file ends up at `~/.claude/skills/what-if/SKILL.md` (all projects), or at `.claude/skills/what-if/SKILL.md` inside one project.

macOS and Linux:

```bash
mkdir -p ~/.claude/skills
unzip what-if-skill.zip -d ~/.claude/skills/
```

Windows (PowerShell; a plain Windows terminal has no `unzip`):

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Expand-Archive what-if-skill.zip -DestinationPath "$HOME\.claude\skills" -Force
```

Or in File Explorer: right-click the zip → **Extract All…** → choose `C:\Users\<you>\.claude\skills`. Start a new Claude Code session; the skill triggers when you say "what if…" (or "was wäre, wenn…") about a business decision.

**Other agents that read skill folders**

Some coding agents load skills from a folder that holds a `SKILL.md`. Unzip the same `what-if/` folder into that app's skills folder (see the app's documentation for where it is). Connect the MCP server too; the skill needs the tools for the maths.

## Checking it works

Say: **"Was wäre, wenn ich einen Mittagstisch für 9,90 € anbiete?"** (or "What if I run a weekday lunch offer?").

You should get a short reply in the same language that offers the demo report and asks one question with a reason. If the AI answers from general knowledge instead, the MCP server is not switched on for that chat: open the tools menu and enable What-IF.

If it does not work:

- **A sign-in prompt, a failed connector, or no What-IF tools.** If your app asks you to sign in or says unauthorised, the link is missing your invite code: use {{SITE_URL}}/api/mcp?code=YOUR-CODE. Remove the connector, add it again with that address, and leave authentication empty.
- **Still failing?** Open {{SITE_URL}}/api/mcp?code=YOUR-CODE in a browser. If the page does not say `"valid": true`, the code or the link is wrong: check it against your invitation, or ask the person who invited you. Don't keep retrying in the chat.
- **The AI relays a "closed beta" message in the middle of a chat:** the same fix. The AI should say it in your language and point you to {{SITE_URL}}/connect; it never needs, and never repeats, your code.

## Privacy, in one paragraph

The What-IF server keeps no records. Each tool call gets your numbers, does the maths and sends them back. The report link carries your numbers after the `#`, a part of a web address that browsers never send to the server; the report page redraws everything in your browser. Anyone you share the link with can see the numbers in it, so share it as you would share a spreadsheet. The invite code only opens the door; it is never stored with your numbers.
