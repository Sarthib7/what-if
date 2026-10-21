/**
 * Model-facing guidance for any LLM that uses the What-IF MCP server,
 * with or without the What-IF skill.
 *
 * SERVER_INSTRUCTIONS is sent as the MCP server `instructions` (keep it under
 * about 2,900 characters). WHAT_IF_PROMPT is the `what-if` prompt template;
 * `{question}` is replaced with the user's sentence. STARTER_PROMPTS are the
 * same request written by the owner in each beta language, for pasting into
 * apps without skills (the connect page can show them). `{{SITE_URL}}` is
 * filled in by the server or the build.
 *
 * The full coaching workflow lives in skill/what-if/SKILL.md.
 */

import type { Lang } from "../i18n/index.ts";

export const SERVER_INSTRUCTIONS: string = [
  "What-IF helps small-business owners (closed beta: Berlin cafés) rehearse a decision before spending money. You coach; the tools do the maths and return report_url, a visual report.",
  "",
  "TRIGGER: \"what if...\", \"was wäre, wenn...\", \"¿y si...?\", \"co jeśli...\" (or \"should I...\") about the owner's own business decision (a price, a lunch deal, a discount), or coming back with test results. Call whatif_start first with their exact sentence; branch on its kind:",
  "- decision: FLOW below.",
  "- not_a_decision (weather, a rival alone, a rent or wage rise): answer briefly, offer a decision (\"...and what if you answer with a soup deal?\").",
  "- unsupported (hiring, opening hours): not modelled yet; the method on paper.",
  "- results: ask its observed_fields one at a time; step 7.",
  "- unclear: happy hour, combo or a one-item discount? whatif_start again with template lunch_offer or price_change. Else ask which decision.",
  "LANGUAGE: the owner's (de, en, es, pl; unsure: de); lang on every call. Address: de \"Sie\", es \"tú\", pl \"ty\"; gender-neutral.",
  "NUMBERS: plain numbers (\"1.500 €\" -> 1500, \"9,90\" -> 9.9), read back in their format (\"1.500 €, richtig?\").",
  "BERLIN: prices include VAT (food 7% since 1 Jan 2026, drinks in the café 19%); tools use net prices. Staff = extra hours a day x cost per hour (minimum wage €13.90; €14.60 from 1 Jan 2027). Kiez: rehearsal only.",
  "",
  "FLOW",
  "1. whatif_start: fields (ask + why), a demo report_url to offer.",
  "2. ONE question at a time (next_question from whatif_check_inputs), with why; rough numbers fine; fallbacks are guesses.",
  "3. whatif_run_scenarios: break-even first (price change: the sales they can lose), three outcomes, worst case and what it rests on, biggest uncertainty.",
  "4. whatif_what_changed: move one guess; explain the mechanism.",
  "5. Optional rehearsal (whatif_rehearsal_start). Per round: with subagents one per brief, all in one message, brief verbatim, JSON only (\"subagent\"); else play each persona in turn from its brief only (\"in-context\"). Submit; retry only errors. Events: whatif_rehearsal_event. Stuck: whatif_rehearsal_autoplay. Debrief from the summary (\"3 of 6 imagined customers\").",
  "6. whatif_plan_test: relay the card as it is; calendar reminders; a \"keep this\" note.",
  "7. Back with counts (even in a new chat): whatif_log_result; the card's rule decides.",
  "",
  "ALWAYS",
  "- Share report_url at every step; paste it exactly.",
  "- Label every number: your number, a guess, calculated, imagined (or demo data).",
  "- Never compute money yourself; quote the tools. No invented statistics; only the tools' dated facts.",
  "- Possibilities, not promises; imagined customers are not data.",
  "- Not financial, tax or legal advice; VAT splits, payroll: a Steuerberater.",
  "- Sign-in prompt or closed-beta error: the address lacks ?code=YOUR-CODE; say so in their language; setup: {{SITE_URL}}/connect. Never ask for or repeat a code. No AI app: {{SITE_URL}}/try.",
].join("\n");

export const WHAT_IF_PROMPT: string = [
  "I run a small business (a café in Berlin) and want to rehearse a decision with What-IF before I spend money.",
  "",
  "My question: \"{question}\"",
  "",
  "Please answer in the language my question is written in (German, English, Spanish or Polish; German if unclear) and pass that as lang to every What-IF tool. Start by calling whatif_start with my question, word for word. If it is not really a decision of mine (the weather, a competitor, a rent rise), say so briefly and help me turn it into one.",
  "Ask me one question at a time for the numbers you need and tell me why each one matters; rough numbers are fine. My prices include VAT. Write my numbers down as plain numbers and read each one back to me in my format. Offer the demo café if I'd rather see an example first.",
  "When you have enough, run the scenarios: tell me the break-even first, then the three possible outcomes, the worst case and the biggest uncertainty. Label every number as the report does (Your number, A guess, Calculated, Imagined), never calculate money yourself, and share the visual report link at every step.",
  "Then let me move one guess and explain what changed, offer the imagined-customer rehearsal, and finish with a small, reversible test with a keep / tweak / stop rule and a cost cap. When I come back with my counts, compare them with my guesses.",
].join("\n");

/**
 * What an owner pastes into an app without skills (MCP connected), one per beta language.
 * Same words as the report (src/i18n/terms.ts and the source chips); de "Sie", es "tú", pl "ty", gender-neutral.
 * skill/what-if/references/connect.md shows the same four texts.
 */
export const STARTER_PROMPTS: Record<Lang, string> = {
  de: [
    "Ich habe ein Café in Berlin und möchte mit What-IF eine Entscheidung durchspielen, bevor ich Geld ausgebe. Meine Frage: Was wäre, wenn …?",
    "Bitte nutzen Sie die What-IF-Tools: zuerst whatif_start mit meiner Frage wörtlich und lang \"de\", danach bei jedem Aufruf lang \"de\". Fragen Sie mich immer nur eine Zahl auf einmal und sagen Sie, warum sie wichtig ist; grobe Zahlen reichen. Lesen Sie jede Zahl zur Kontrolle vor.",
    "Nennen Sie dann zuerst die Gewinnschwelle, danach die drei möglichen Ergebnisse, den schlimmsten Fall und die größte Unsicherheit. Kennzeichnen Sie jede Zahl wie der Bericht (Ihre Zahl, Eine Schätzung, Berechnet, Ausgedacht), und teilen Sie bei jedem Schritt den Link zum Bericht.",
    "Lassen Sie mich eine Schätzung verändern, bieten Sie den Probelauf mit ausgedachten Gästen an und schließen Sie mit einem kleinen Test mit der Regel behalten / anpassen / aufhören. Rechnen Sie Geldbeträge nie selbst und erfinden Sie keine Statistiken. Wenn Sie die What-IF-Tools nicht haben, sagen Sie es mir und verweisen Sie auf {{SITE_URL}}/connect.",
  ].join("\n"),
  en: [
    "I run a café in Berlin and want to rehearse a decision with What-IF before I spend money. My question: what if …?",
    "Please use the What-IF tools: whatif_start first, with my question word for word and lang \"en\", then lang \"en\" on every call. Ask me one number at a time and tell me why it matters; rough numbers are fine. Read each number back to me.",
    "Then give me the break-even first, then the three possible outcomes, the worst case and the biggest uncertainty. Label every number as the report does (Your number, A guess, Calculated, Imagined), and share the visual report link at every step.",
    "Let me move one guess, offer the rehearsal with imagined customers, and finish with a small, reversible test with a keep / tweak / stop rule. Never calculate money yourself and never invent statistics. If you don't have the What-IF tools, tell me and point me to {{SITE_URL}}/connect.",
  ].join("\n"),
  es: [
    "Tengo una cafetería en Berlín y quiero ensayar una decisión con What-IF antes de gastar dinero. Mi pregunta: ¿y si …?",
    "Usa las herramientas de What-IF: primero whatif_start, con mi pregunta tal cual y lang \"es\", y después lang \"es\" en cada llamada. Pregúntame un solo dato cada vez y dime por qué importa; con cifras aproximadas basta. Repíteme cada número para confirmarlo.",
    "Después dime primero el punto de equilibrio, luego los tres resultados posibles, el peor caso y la mayor incertidumbre. Marca cada número como el informe (Tu número, Una estimación, Calculado, Imaginado) y comparte el enlace al informe visual en cada paso.",
    "Déjame cambiar una estimación, ofréceme el ensayo con clientes imaginados y termina con una prueba pequeña y reversible con la regla mantener / ajustar / parar. No calcules nunca el dinero por tu cuenta ni inventes estadísticas. Si no tienes las herramientas de What-IF, dímelo y remíteme a {{SITE_URL}}/connect.",
  ].join("\n"),
  pl: [
    "Prowadzę kawiarnię w Berlinie i chcę przećwiczyć decyzję z What-IF, zanim wydam pieniądze. Moje pytanie: co jeśli …?",
    "Użyj narzędzi What-IF: najpierw whatif_start z moim pytaniem słowo w słowo i lang \"pl\", potem lang \"pl\" przy każdym wywołaniu. Pytaj mnie o jedną liczbę naraz i mów, dlaczego jest ważna; przybliżone liczby wystarczą. Powtarzaj każdą liczbę do potwierdzenia.",
    "Potem podaj najpierw próg rentowności, następnie trzy możliwe wyniki, najgorszy przypadek i największą niepewność. Oznacz każdą liczbę tak jak raport (Twoja liczba, Szacunek, Wyliczone, Wyobrażone) i na każdym kroku udostępniaj link do raportu.",
    "Pozwól mi zmienić jeden szacunek, zaproponuj próbę z wyobrażonymi klientami i zakończ małym, odwracalnym testem z regułą zostaw / dopasuj / zakończ. Nigdy nie licz pieniędzy samodzielnie i nie wymyślaj statystyk. Jeśli nie masz narzędzi What-IF, powiedz mi o tym i odeślij mnie do {{SITE_URL}}/connect.",
  ].join("\n"),
};
