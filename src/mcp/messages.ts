/**
 * The MCP tools' own framing sentences (summaries, next steps, coaching hints, errors)
 * in English, German, Spanish and Polish. Numbers and the engine's / rehearsal's own
 * sentences come translated from src/engine and src/sim; this catalog only frames them.
 *
 * Tool names, field keys and `state` stay as they are in every language: the model
 * passes them back verbatim. Browser-safe: no Node APIs.
 */
import { makeT, plural, type Catalog, type Lang, type Msg, type Params } from "../i18n/index.ts";

type Forms = { one: string; few?: string; many?: string; other: string };
const n = (p: Params, key: string, forms: Forms, lang: Lang): string => plural(Number(p[key] ?? 0), forms, lang);
const s = (v: Params[string] | undefined): string => (v === undefined ? "" : String(v));

const en = {
  open_report: "Open the visual report",
  open_report_demo: "Open the visual report (demo café, made-up numbers)",
  coaching_label: "Coaching",
  err_internal: "What-IF could not do that: {msg}",
  why_word: "why",
  or_word: " or ",
  optional_word: "optional",
  please_fix: "Please fix:",
  measured_values: "the test results",
  ignored_keys: "Ignored (not a field of {template}): {list}.",
  ignored_item_suggest: "{key} (did you mean {options}?)",

  nr_missing: (p: Params, lang: Lang) =>
    `Not ready yet: ${n(p, "n", { one: "{n} number", other: "{n} numbers" }, lang)} still missing (${s(p.list)}).`,
  nr_ask_next: 'Ask the owner next: "{ask}" (field `{key}`; why: {why})',
  nr_call_again: "Then call this tool again with the corrected inputs (whatif_check_inputs gives the next question).",

  start_template: "Decision template: {title} ({id}). {summary}",
  start_event_note:
    "The question also mentions {what}: once the numbers are in, it can be rehearsed as an event with imagined customers (whatif_rehearsal_start with `event`).",
  start_numbers: "Numbers to ask for, one at a time ({n} needed):",
  start_optional: "Optional (a labelled guess is used if the owner does not know): {list}.",
  start_kiez: "Kiez (optional, shapes the imagined customers): {list}, or other.",
  start_first: 'Start by asking: "{ask}"',
  start_demo:
    "Or show how it works first with the demo café ({demo}, made-up numbers labelled as demo data): call whatif_run_scenarios with demo: true.",
  start_events: "Berlin events the owner can add to a rehearsal later (imagined, not facts): {list}.",
  coach_1:
    "Reflect the question back in one sentence and say What-IF will compare a cautious, an expected and an optimistic outcome; it does not predict the future.",
  coach_2:
    "Ask for the numbers ONE at a time, in the order given, saying why each matters. Accept rough answers; 'I don't know' is fine for optional ones (a labelled guess is used).",
  coach_3: "After each answer call whatif_check_inputs; it returns the next question. When ready, call whatif_run_scenarios and share the report link.",
  coach_4:
    "Explain break-even and the worst case in plain words, then offer: rehearse with imagined customers (whatif_rehearsal_start), try another number (whatif_what_changed), or plan a small test (whatif_plan_test). Pass them the `state` from the last result.",
  coach_5: "Every figure has a source tag: the owner's number, a guess, a calculation, imagined, or demo. Keep them apart when you talk.",
  hint_start: "Ask one question at a time and say why it matters; share the demo report if the owner wants to see where this is going.",

  res_head:
    "It sounds like the owner is back with real numbers from a test. Compare them with the scenarios: call whatif_log_result with `observed` and the latest `state` (or the report link); without one, pass the same template and inputs as before.",
  res_fields: "Measured values for {title}: {list}.",
  hint_results: "Thank them for testing before committing, then ask for the measured numbers one at a time.",

  reason_weather: "the weather",
  reason_absurd: "something far outside the café",
  reason_competitor: "what a competitor does",
  reason_rent: "the rent or the landlord",
  reason_costs: "suppliers' or energy prices",
  reason_event: "an outside event (a strike, building works, holidays, a festival)",
  sug_weather_1: "What if I run a rainy-day lunch offer?",
  sug_weather_2: "What if I make iced coffee 50 cents cheaper during the heatwave?",
  sug_competitor_1: "What if I answer the new café with a weekday lunch offer?",
  sug_competitor_2: "What if I lower my flat white price by 20 cents?",
  sug_rent_1: "What if I raise my coffee prices by 30 cents to cover the higher rent?",
  sug_rent_2: "What if I start a weekday lunch offer to bring in more money at midday?",
  sug_costs_1: "What if I raise the price of a cappuccino by 20 cents?",
  sug_costs_2: "What if I change my lunch offer so it costs me less to make?",
  sug_event_1: "What if I run a lunch offer for the people who still come?",
  sug_event_2: "What if I raise the price of take-away coffee for the festival weekend?",
  nd_head: "This is not a decision the café makes ({what}), so What-IF does not pick a template and has no numbers to ask for yet.",
  can_do:
    "What-IF rehearses a choice the café makes itself. Today it models two: a weekday lunch offer and a new price for one item, each with a cautious, an expected and an optimistic outcome, the break-even, an imagined-customer rehearsal and a small test. It does not predict the future.",
  nd_reframe: "Turn it into a decision: ask what the owner would do about it, for example:",
  nd_event: "Once there is a decision, this can be part of the rehearsal as an imagined event (whatif_rehearsal_start with `event`, or whatif_rehearsal_event).",
  topic_hiring: "hiring or staffing",
  topic_hours: "opening hours",
  topic_location: "rent, moving or a second location",
  topic_product: "a new product",
  topic_investment: "equipment or a renovation",
  topic_delivery: "a delivery platform",
  un_head: "What-IF cannot model this decision yet ({what}).",
  un_map: 'If part of it is a "{title}", What-IF can rehearse that part: call whatif_start again with template "{id}".',
  un_map_staff: 'If the extra help is for a lunch offer, the "{title}" template counts extra staff hours: call whatif_start again with template "{id}".',
  un_by_hand:
    "Otherwise reason it through with the owner by hand, with the same method: three outcomes, the break-even, a small reversible test, and every number labelled as the owner's or a guess. Do not invent numbers.",
  uc_head: "What-IF could not tell which decision this question is about.",
  uc_ask: "Ask the owner which decision they are weighing, for example:",
  hint_unsupported: "Say honestly that What-IF cannot model this yet; offer the part it can rehearse, or a by-hand look with labelled numbers.",
  hint_not_decision: "Do not ask for numbers yet. Answer briefly, then ask in one short question which decision the owner is weighing.",

  ci_check_this: "Check this with the owner: {problem}",
  ci_check_why: "The scenarios would be wrong with this number.",
  ci_ready: (p: Params, lang: Lang) =>
    `Ready: every number for "${s(p.title)}" is in (${n(p, "n", { one: "{n} value", other: "{n} values" }, lang)}).`,
  ci_not_ready: "Not ready yet: {missing} missing, {problems} to fix.",
  ci_next_field: 'Next question: "{ask}" [{key}] (why: {why})',
  ci_next: 'Next question: "{ask}"',
  ci_still: "Still missing after that: {list}.",
  ci_problems: "Problems:",
  ci_guesses: "Guesses What-IF filled in (tell the owner; they can correct them):",
  ci_guesses_later: (p: Params, lang: Lang) =>
    n(
      p,
      "n",
      {
        one: "{n} optional value will use a labelled guess unless the owner knows better (see resolved).",
        other: "{n} optional values will use a labelled guess unless the owner knows better (see resolved).",
      },
      lang,
    ),
  ci_run_next: "Next step: call whatif_run_scenarios with the same template and inputs (or this result's `state`).",
  hint_check_ready: "Read the filled-in guesses back to the owner before running the scenarios.",
  hint_check_more: "Ask only the next question, in the owner's words, and say why it matters.",

  state_next:
    "Next calls (whatif_what_changed, whatif_rehearsal_start, whatif_plan_test, whatif_log_result) can take `state` = this result's state or the report link instead of template and inputs.",
  hint_run: "Share the link, explain break-even in one sentence, then ask which guess the owner feels least sure about.",

  wc_nothing: "Nothing changed between the two sets of numbers.",
  wc_changed: "Changed: {list}.",
  wc_why: "Why the result moved:",
  wc_expected: "Expected result now: {test} over the test, {month} a month after it.",
  wc_break_even: "Break-even now: {plain}",
  hint_changed: "Ask the owner what this tells them about which number matters most.",

  rs_ready: "Rehearsal ready: {people} imagined customers, {rounds} rounds. Change they react to: {change}",
  rs_who: "Who they are: {list}.",
  rs_round1: (p: Params, lang: Lang) =>
    `Round 1 of ${s(p.rounds)}: ${s(p.title)}. ${n(p, "n", { one: "{n} brief", other: "{n} briefs" }, lang)} to run (below)`,
  rs_away: "; {n} not around this round (handled automatically)",
  rs_imagined: "These people are imagined. Their reactions are questions to check with real customers, not a forecast.",
  hint_rehearsal_start: "Tell the owner who the imagined customers are, run the briefs, and share the link as the timeline fills in.",

  err_rehearsal_done: "This rehearsal has already finished. Use whatif_rehearsal_interview to ask the imagined customers a question, or share the report.",
  err_no_reactions: "No reactions were sent. Pass `reactions` as an array with each persona's JSON reply.",
  sub_none:
    "None of the replies could be used, so round {round} has not moved on.\nWhat was wrong:\n{errors}\nFix those replies (re-run the briefs below if needed) and call whatif_rehearsal_submit again with the same state.",
  hint_sub_none: "Each reply must be the JSON object its brief asks for, with one of the allowed actions.",
  sub_done: (p: Params, lang: Lang) => `Accepted ${n(p, "n", { one: "{n} reply", other: "{n} replies" }, lang)}. The rehearsal is done.`,
  hint_sub_done: "Share the link, read out one or two quotes, then turn the open questions into a small real test (whatif_plan_test).",
  sub_partial: "Accepted {n}; {k} need another try before round {round} can finish:\n{errors}",
  hint_sub_partial: "Re-run only the personas listed, then submit their replies with the new state.",
  sub_next: (p: Params, lang: Lang) =>
    `Accepted ${n(p, "n", { one: "{n} reply", other: "{n} replies" }, lang)}. Round ${s(p.round)} of ${s(p.rounds)} is next${p.title ? `: ${s(p.title)}` : ""}. ${n(p, "k", { one: "{n} brief", other: "{n} briefs" }, lang)} to run (below).`,
  hint_sub_next: "Give the owner a one-line update on the round, and offer to add a local event before the next one (whatif_rehearsal_event).",

  sum_done: "Rehearsal finished: {people} imagined customers, {rounds} rounds. Change: {change}",
  sum_so_far: "Rehearsal so far: {people} imagined customers, {rounds} rounds. Change: {change}",
  sum_did: "What they did: {list}.",
  of_count: "{label} {count} of {of}",
  sum_words: "In their words:",
  quote: '"{text}" ({name}, round {round})',
  sum_questions: "Questions they would ask you:",
  sum_check: "Check with real customers:",

  err_event_done: "This rehearsal has already finished, so there is no next round for the event. Start a new rehearsal with `event` set instead.",
  ev_added: (p: Params, lang: Lang) =>
    `Added before round ${s(p.round)}: "${s(p.event)}". ${n(p, "n", { one: "The brief below now includes it.", other: "The {n} briefs below now include it." }, lang)}`,
  hint_event: "Ask the owner what they expect the event to change, then run the round and compare.",

  ap_played: "Played the remaining rounds with the rule-based stand-in (no model).",
  hint_autoplay: "Say these reactions came from simple rules, not people; use them to pick what to ask real customers.",

  iv_briefs: (p: Params, lang: Lang) =>
    `Interview question: "${s(p.question)}". ${n(p, "n", { one: "{n} brief below", other: "{n} briefs below" }, lang)}, one per imagined customer.`,
  hint_iv_briefs: "Remind the owner these answers are imagined; the useful part is the questions they suggest for real customers.",
  iv_none: "None of the answers could be recorded:\n{errors}\nFix them and call whatif_rehearsal_interview again with the same state, question and answers.",
  hint_iv_none: "Each answer must be the JSON object its brief asks for.",
  iv_recorded: (p: Params, lang: Lang) =>
    `Recorded ${n(p, "n", { one: "{n} imagined answer", other: "{n} imagined answers" }, lang)} to "${s(p.question)}":`,
  quoted: '"{text}"',
  iv_could_not: "Could not record:",
  hint_iv_recorded: "Turn the most surprising answer into one question to ask three real customers this week.",

  pt_title: "Test plan: {title}.",
  pt_before: "Before you start:",
  pt_measure: "Measure:",
  pt_checkins: "Check-ins:",
  pt_day: "Day {day}: {look}",
  pt_rule: "Decision rule:",
  pt_keep: "Keep",
  pt_tweak: "Tweak",
  pt_stop: "Stop",
  pt_cap: "Cost cap: {cap}",
  pt_after: "After the test, call whatif_log_result with what was measured and this result's `state`.",
  hint_plan: "Agree the start date and who counts what, and ask the owner to come back with the numbers.",

  lr_bad: '"{key}" should be a number; got "{value}".',
  lr_need: "To compare the test with the scenarios I still need: {list}.",
  lr_understands: "Measured values this template understands: {list}.",
  lr_below: "below even the cautious scenario",
  lr_above: "above the optimistic scenario",
  lr_closest: 'closest to the "{name}" scenario',
  lr_line: "{label}: {actual} ({closest}). Result over the test: {net}.",
  lr_verdict: "Verdict: {verdict}.",
  verdict_keep: "KEEP",
  verdict_tweak: "TWEAK",
  verdict_stop: "STOP",
  lr_teaches: "What this teaches:",
  hint_log: "Celebrate that they tested before committing, then ask what they will change next time.",

  err_template_mismatch: "This state is for the {state} template, but template says {given}. Leave out `template` when you pass `state` (or start again without the state).",
  err_need_template: "Pass `template` and `inputs`, or the `state` from the latest What-IF result (its report link works too).",
  err_bad_link: "This What-IF link is damaged or cut off. Start again from the owner's numbers to make a fresh one.",
  err_old_link: "This What-IF link is not in a format this version understands.",
  err_bad_link_hint: "(Pass the `state` from the latest What-IF result exactly as it was returned, or its report_url.)",
  err_no_rehearsal: "This state token has no rehearsal in it. Start one with whatif_rehearsal_start, then pass back the state it returns.",

  at_demo: "Demo data: these are made-up numbers for a demo café.",
  at_break_even: "Break-even (the one number to remember): {plain}",
  at_three: "Three possible outcomes (calculated from the owner's numbers and guesses):",
  at_scenario: "{test} over the test; {month} a month.",
  at_worst: "Worst case: {plain}",
  at_uncertainty: "Biggest uncertainty: {plain}",
  at_watch: "Watch out:",
  at_facts: "Public facts the maths uses: {list}.",
  at_next:
    "Next step: let the owner move one guess (whatif_what_changed), rehearse it with imagined customers (whatif_rehearsal_start), or plan a small test (whatif_plan_test).",

  prompt_lang: 'Please talk to me in {name} and pass lang: "{code}" to every What-IF tool.',
} satisfies Record<string, Msg>;

export type McpKey = keyof typeof en;

const de: Record<McpKey, Msg> = {
  open_report: "Visuellen Bericht öffnen",
  open_report_demo: "Visuellen Bericht öffnen (Demo-Café, erfundene Zahlen)",
  coaching_label: "Coaching",
  err_internal: "What-IF konnte das nicht ausführen: {msg}",
  why_word: "warum",
  or_word: " oder ",
  optional_word: "optional",
  please_fix: "Bitte korrigieren:",
  measured_values: "den Testergebnissen",
  ignored_keys: "Nicht verwendet (kein Feld in {template}): {list}.",
  ignored_item_suggest: "{key} (meinten Sie {options}?)",

  nr_missing: (p, lang) =>
    `${n(p, "n", { one: "Noch nicht bereit: {n} Zahl fehlt noch", other: "Noch nicht bereit: {n} Zahlen fehlen noch" }, lang)} (${s(p.list)}).`,
  nr_ask_next: "Als Nächstes fragen: „{ask}“ (Feld `{key}`; warum: {why})",
  nr_call_again: "Danach dieses Tool mit den korrigierten Werten erneut aufrufen (whatif_check_inputs nennt die nächste Frage).",

  start_template: "Entscheidungsvorlage: {title} ({id}). {summary}",
  start_event_note:
    "Die Frage nennt auch {what}: Sobald die Zahlen da sind, lässt sich das als Ereignis mit vorgestellten Gästen proben (whatif_rehearsal_start mit `event`).",
  start_numbers: "Diese Zahlen einzeln erfragen ({n} nötig):",
  start_optional: "Optional (sonst gilt eine gekennzeichnete Schätzung): {list}.",
  start_kiez: "Kiez (optional, prägt die vorgestellten Gäste): {list} oder anderer.",
  start_first: "Beginnen Sie mit: „{ask}“",
  start_demo:
    "Oder zeigen Sie es zuerst am Demo-Café ({demo}, erfundene Zahlen, als Demo gekennzeichnet): whatif_run_scenarios mit demo: true aufrufen.",
  start_events: "Berliner Ereignisse, die später in eine Probe kommen können (vorgestellt, keine Fakten): {list}.",
  coach_1:
    "Die Frage in einem Satz zurückspiegeln und sagen: What-IF vergleicht einen vorsichtigen, einen erwarteten und einen optimistischen Verlauf. Es sagt die Zukunft nicht voraus.",
  coach_2:
    "Die Zahlen EINZELN in der genannten Reihenfolge erfragen und jeweils sagen, warum sie zählen. Grobe Antworten sind in Ordnung. Bei optionalen Werten ist „weiß ich nicht“ okay (dann gilt eine gekennzeichnete Schätzung).",
  coach_3: "Nach jeder Antwort whatif_check_inputs aufrufen; es nennt die nächste Frage. Wenn alles da ist, whatif_run_scenarios aufrufen und den Berichtslink teilen.",
  coach_4:
    "Break-even und schlechtesten Fall in einfachen Worten erklären. Dann anbieten: Probe mit vorgestellten Gästen (whatif_rehearsal_start), eine andere Zahl ausprobieren (whatif_what_changed) oder einen kleinen Test planen (whatif_plan_test). Dabei den `state` des letzten Ergebnisses mitgeben.",
  coach_5: "Jede Zahl hat eine Herkunft: eigene Zahl, Schätzung, Rechnung, vorgestellt oder Demo. Halten Sie das beim Erklären auseinander.",
  hint_start: "Eine Frage nach der anderen stellen und sagen, warum sie zählt. Den Demo-Bericht zeigen, wenn Ihr Gegenüber sehen möchte, wohin es geht.",

  res_head:
    "Es klingt, als kämen echte Zahlen aus einem Test zurück. Vergleichen Sie sie mit den Szenarien: whatif_log_result mit `observed` und dem letzten `state` (oder dem Berichtslink) aufrufen. Ohne state dieselbe Vorlage und dieselben Werte wie zuvor mitgeben.",
  res_fields: "Messwerte für „{title}“: {list}.",
  hint_results: "Würdigen, dass erst getestet wurde. Dann die Messwerte einzeln erfragen.",

  reason_weather: "das Wetter",
  reason_absurd: "etwas weit außerhalb des Cafés",
  reason_competitor: "was die Konkurrenz tut",
  reason_rent: "die Miete oder den Vermieter",
  reason_costs: "Preise von Lieferanten oder für Energie",
  reason_event: "ein Ereignis von außen (Streik, Baustelle, Ferien, ein Fest)",
  sug_weather_1: "Was wäre, wenn ich an Regentagen ein Mittagsangebot mache?",
  sug_weather_2: "Was wäre, wenn ich Eiskaffee während der Hitzewelle 50 Cent günstiger verkaufe?",
  sug_competitor_1: "Was wäre, wenn ich dem neuen Café mit einem Mittagstisch unter der Woche antworte?",
  sug_competitor_2: "Was wäre, wenn ich den Preis für Flat White um 20 Cent senke?",
  sug_rent_1: "Was wäre, wenn ich meine Kaffeepreise um 30 Cent erhöhe, um die höhere Miete zu tragen?",
  sug_rent_2: "Was wäre, wenn ich einen Mittagstisch anbiete, damit mittags mehr Geld reinkommt?",
  sug_costs_1: "Was wäre, wenn ich den Cappuccino 20 Cent teurer mache?",
  sug_costs_2: "Was wäre, wenn ich mein Mittagsangebot so ändere, dass es mich weniger kostet?",
  sug_event_1: "Was wäre, wenn ich ein Mittagsangebot für die Gäste mache, die trotzdem kommen?",
  sug_event_2: "Was wäre, wenn ich Kaffee zum Mitnehmen am Festwochenende teurer verkaufe?",
  nd_head: "Das ist keine Entscheidung, die das Café selbst trifft ({what}). Deshalb wählt What-IF keine Vorlage und fragt noch keine Zahlen ab.",
  can_do:
    "What-IF probt eine Entscheidung, die das Café selbst trifft. Heute rechnet es zwei durch: ein Mittagsangebot unter der Woche und einen neuen Preis für ein Produkt. Jeweils mit vorsichtigem, erwartetem und optimistischem Verlauf, Break-even, einer Probe mit vorgestellten Gästen und einem kleinen Test. Es sagt die Zukunft nicht voraus.",
  nd_reframe: "Machen Sie daraus eine Entscheidung: Fragen Sie, was das Café dagegen tun würde, zum Beispiel:",
  nd_event: "Sobald es eine Entscheidung gibt, kann das als vorgestelltes Ereignis in die Probe (whatif_rehearsal_start mit `event` oder whatif_rehearsal_event).",
  topic_hiring: "Personal einstellen",
  topic_hours: "Öffnungszeiten",
  topic_location: "Miete, Umzug oder ein zweiter Standort",
  topic_product: "ein neues Produkt",
  topic_investment: "Geräte oder ein Umbau",
  topic_delivery: "ein Lieferdienst",
  un_head: "Diese Entscheidung kann What-IF noch nicht durchrechnen ({what}).",
  un_map: "Falls ein Teil davon unter „{title}“ fällt, kann What-IF diesen Teil proben: whatif_start erneut mit template „{id}“ aufrufen.",
  un_map_staff:
    "Falls die zusätzliche Hilfe für ein Mittagsangebot gedacht ist: Die Vorlage „{title}“ rechnet zusätzliche Personalstunden mit. Dafür whatif_start erneut mit template „{id}“ aufrufen.",
  un_by_hand:
    "Sonst gemeinsam von Hand nach derselben Methode überlegen: drei Verläufe, Break-even, ein kleiner, umkehrbarer Test. Jede Zahl als eigene Zahl oder Schätzung kennzeichnen. Keine Zahlen erfinden.",
  uc_head: "What-IF konnte nicht erkennen, um welche Entscheidung es geht.",
  uc_ask: "Fragen Sie, welche Entscheidung ansteht, zum Beispiel:",
  hint_unsupported: "Ehrlich sagen, dass What-IF das noch nicht durchrechnen kann. Den Teil anbieten, der sich proben lässt, oder eine Überlegung von Hand mit gekennzeichneten Zahlen.",
  hint_not_decision: "Noch keine Zahlen abfragen. Kurz antworten, dann mit einer kurzen Frage klären, welche Entscheidung ansteht.",

  ci_check_this: "Bitte nachfragen: {problem}",
  ci_check_why: "Mit dieser Zahl wären die Szenarien falsch.",
  ci_ready: (p, lang) => `Bereit: Alle Zahlen für „${s(p.title)}“ sind da (${n(p, "n", { one: "{n} Wert", other: "{n} Werte" }, lang)}).`,
  ci_not_ready: "Noch nicht bereit: fehlend {missing}, zu korrigieren {problems}.",
  ci_next_field: "Nächste Frage: „{ask}“ [{key}] (warum: {why})",
  ci_next: "Nächste Frage: „{ask}“",
  ci_still: "Danach fehlt noch: {list}.",
  ci_problems: "Probleme:",
  ci_guesses: "Schätzungen, die What-IF eingesetzt hat (bitte nennen; sie lassen sich korrigieren):",
  ci_guesses_later: (p, lang) =>
    n(
      p,
      "n",
      {
        one: "{n} optionaler Wert wird gekennzeichnet geschätzt, falls ihn niemand besser kennt (siehe resolved).",
        other: "{n} optionale Werte werden gekennzeichnet geschätzt, falls sie niemand besser kennt (siehe resolved).",
      },
      lang,
    ),
  ci_run_next: "Nächster Schritt: whatif_run_scenarios mit derselben Vorlage und denselben Werten aufrufen (oder mit dem `state` dieses Ergebnisses).",
  hint_check_ready: "Die eingesetzten Schätzungen vorlesen, bevor die Szenarien laufen.",
  hint_check_more: "Nur die nächste Frage stellen, in einfachen Worten, und sagen, warum sie zählt.",

  state_next:
    "Die nächsten Aufrufe (whatif_what_changed, whatif_rehearsal_start, whatif_plan_test, whatif_log_result) können statt Vorlage und Werten einfach `state` bekommen: den state dieses Ergebnisses oder den Berichtslink.",
  hint_run: "Link teilen, Break-even in einem Satz erklären, dann fragen, bei welcher Schätzung die Unsicherheit am größten ist.",

  wc_nothing: "Zwischen den beiden Zahlenreihen hat sich nichts geändert.",
  wc_changed: "Geändert: {list}.",
  wc_why: "Warum sich das Ergebnis bewegt hat:",
  wc_expected: "Erwartetes Ergebnis jetzt: {test} über den Test, {month} pro Monat danach.",
  wc_break_even: "Break-even jetzt: {plain}",
  hint_changed: "Fragen, was das darüber sagt, welche Zahl am meisten zählt.",

  rs_ready: "Probe bereit: {people} vorgestellte Gäste, {rounds} Runden. Darauf reagieren sie: {change}",
  rs_who: "Wer sie sind: {list}.",
  rs_round1: (p, lang) => `Runde 1 von ${s(p.rounds)}: ${s(p.title)}. ${n(p, "n", { one: "{n} Briefing", other: "{n} Briefings" }, lang)} zum Ausführen (unten)`,
  rs_away: (p, lang) => `; ${n(p, "n", { one: "{n} Person ist", other: "{n} Personen sind" }, lang)} diese Runde nicht da (wird automatisch erledigt)`,
  rs_imagined: "Diese Menschen sind vorgestellt. Ihre Reaktionen sind Fragen an echte Gäste, keine Prognose.",
  hint_rehearsal_start: "Sagen, wer die vorgestellten Gäste sind, die Briefings ausführen und den Link teilen, während sich die Zeitleiste füllt.",

  err_rehearsal_done: "Diese Probe ist schon beendet. Mit whatif_rehearsal_interview können Sie den vorgestellten Gästen eine Frage stellen, oder Sie teilen den Bericht.",
  err_no_reactions: "Es wurden keine Reaktionen gesendet. `reactions` als Liste mit der JSON-Antwort jeder Persona übergeben.",
  sub_none:
    "Keine Antwort war verwendbar, deshalb geht Runde {round} noch nicht weiter.\nWas nicht stimmte:\n{errors}\nDiese Antworten korrigieren (bei Bedarf die Briefings unten neu ausführen) und whatif_rehearsal_submit mit demselben state erneut aufrufen.",
  hint_sub_none: "Jede Antwort muss das JSON-Objekt sein, das ihr Briefing verlangt, mit einer der erlaubten Aktionen.",
  sub_done: (p, lang) => `${n(p, "n", { one: "{n} Antwort", other: "{n} Antworten" }, lang)} angenommen. Die Probe ist fertig.`,
  hint_sub_done: "Link teilen, ein, zwei Zitate vorlesen und die offenen Fragen in einen kleinen echten Test verwandeln (whatif_plan_test).",
  sub_partial: "{n} angenommen; {k} brauchen einen neuen Versuch, bevor Runde {round} fertig ist:\n{errors}",
  hint_sub_partial: "Nur die genannten Personas neu ausführen und ihre Antworten mit dem neuen state senden.",
  sub_next: (p, lang) =>
    `${n(p, "n", { one: "{n} Antwort", other: "{n} Antworten" }, lang)} angenommen. Als Nächstes Runde ${s(p.round)} von ${s(p.rounds)}${p.title ? `: ${s(p.title)}` : ""}. ${n(p, "k", { one: "{n} Briefing", other: "{n} Briefings" }, lang)} zum Ausführen (unten).`,
  hint_sub_next: "Kurz sagen, wie die Runde lief, und anbieten, vor der nächsten ein Ereignis aus dem Kiez einzubauen (whatif_rehearsal_event).",

  sum_done: "Probe beendet: {people} vorgestellte Gäste, {rounds} Runden. Änderung: {change}",
  sum_so_far: "Probe bisher: {people} vorgestellte Gäste, {rounds} Runden. Änderung: {change}",
  sum_did: "Was sie getan haben: {list}.",
  of_count: "{label}: {count} von {of}",
  sum_words: "In ihren Worten:",
  quote: "„{text}“ ({name}, Runde {round})",
  sum_questions: "Fragen, die sie Ihnen stellen würden:",
  sum_check: "Mit echten Gästen prüfen:",

  err_event_done: "Diese Probe ist schon beendet, es gibt keine nächste Runde für das Ereignis. Starten Sie stattdessen eine neue Probe mit `event`.",
  ev_added: (p, lang) =>
    `Vor Runde ${s(p.round)} eingefügt: „${s(p.event)}“. ${n(p, "n", { one: "Das Briefing unten enthält es jetzt.", other: "Die {n} Briefings unten enthalten es jetzt." }, lang)}`,
  hint_event: "Fragen, was das Ereignis wohl ändert, dann die Runde ausführen und vergleichen.",

  ap_played: "Die restlichen Runden wurden mit einfachen Regeln durchgespielt (ohne Sprachmodell).",
  hint_autoplay: "Sagen, dass diese Reaktionen aus einfachen Regeln stammen, nicht von Menschen. Sie helfen bei der Wahl, was man echte Gäste fragt.",

  iv_briefs: (p, lang) =>
    `Interviewfrage: „${s(p.question)}“. ${n(p, "n", { one: "{n} Briefing unten", other: "{n} Briefings unten" }, lang)}, eines pro vorgestelltem Gast.`,
  hint_iv_briefs: "Daran erinnern, dass die Antworten vorgestellt sind. Wertvoll sind die Fragen, die sie für echte Gäste nahelegen.",
  iv_none: "Keine Antwort ließ sich speichern:\n{errors}\nKorrigieren und whatif_rehearsal_interview mit demselben state, derselben Frage und den answers erneut aufrufen.",
  hint_iv_none: "Jede Antwort muss das JSON-Objekt sein, das ihr Briefing verlangt.",
  iv_recorded: (p, lang) =>
    `${n(p, "n", { one: "{n} vorgestellte Antwort", other: "{n} vorgestellte Antworten" }, lang)} auf „${s(p.question)}“ gespeichert:`,
  quoted: "„{text}“",
  iv_could_not: "Nicht gespeichert:",
  hint_iv_recorded: "Die überraschendste Antwort in eine Frage verwandeln, die Sie diese Woche drei echten Gästen stellen.",

  pt_title: "Testplan: {title}.",
  pt_before: "Vor dem Start:",
  pt_measure: "Messen:",
  pt_checkins: "Zwischenstände:",
  pt_day: "Tag {day}: {look}",
  pt_rule: "Entscheidungsregel:",
  pt_keep: "Behalten",
  pt_tweak: "Anpassen",
  pt_stop: "Stoppen",
  pt_cap: "Kostengrenze: {cap}",
  pt_after: "Nach dem Test whatif_log_result mit den Messwerten und dem `state` dieses Ergebnisses aufrufen.",
  hint_plan: "Startdatum vereinbaren und klären, wer was zählt. Dann bitten, mit den Zahlen wiederzukommen.",

  lr_bad: "„{key}“ muss eine Zahl sein; erhalten: „{value}“.",
  lr_need: "Für den Vergleich mit den Szenarien fehlt noch: {list}.",
  lr_understands: "Messwerte, die diese Vorlage versteht: {list}.",
  lr_below: "sogar unter dem vorsichtigen Szenario",
  lr_above: "über dem optimistischen Szenario",
  lr_closest: "am nächsten am Szenario „{name}“",
  lr_line: "{label}: {actual} ({closest}). Ergebnis über den Test: {net}.",
  lr_verdict: "Urteil: {verdict}.",
  verdict_keep: "BEHALTEN",
  verdict_tweak: "ANPASSEN",
  verdict_stop: "STOPPEN",
  lr_teaches: "Was das lehrt:",
  hint_log: "Würdigen, dass vor der Entscheidung getestet wurde. Dann fragen, was beim nächsten Mal anders laufen soll.",

  err_template_mismatch: "Dieser state gehört zur Vorlage {state}, aber template sagt {given}. Mit `state` bitte kein `template` mitgeben (oder ohne state neu beginnen).",
  err_need_template: "Bitte `template` und `inputs` mitgeben oder den `state` aus dem letzten What-IF-Ergebnis (der Berichtslink geht auch).",
  err_bad_link: "Dieser What-IF-Link ist beschädigt oder abgeschnitten. Beginnen Sie mit den Zahlen neu, um einen frischen Link zu bekommen.",
  err_old_link: "Dieser What-IF-Link hat ein Format, das diese Version nicht versteht.",
  err_bad_link_hint: "(Den `state` aus dem letzten What-IF-Ergebnis genau so übergeben, wie er kam, oder dessen report_url.)",
  err_no_rehearsal: "In diesem state steckt keine Probe. Starten Sie eine mit whatif_rehearsal_start und geben Sie den zurückgegebenen state weiter.",

  at_demo: "Demo-Daten: Das sind erfundene Zahlen für ein Demo-Café.",
  at_break_even: "Break-even (Gewinnschwelle, die eine Zahl zum Merken): {plain}",
  at_three: "Drei mögliche Verläufe (berechnet aus Ihren Zahlen und Schätzungen):",
  at_scenario: "{test} über den Test; {month} pro Monat.",
  at_worst: "Schlechtester Fall: {plain}",
  at_uncertainty: "Größte Unsicherheit: {plain}",
  at_watch: "Achtung:",
  at_facts: "Öffentliche Fakten in der Rechnung: {list}.",
  at_next:
    "Nächster Schritt: eine Schätzung verändern (whatif_what_changed), mit vorgestellten Gästen proben (whatif_rehearsal_start) oder einen kleinen Test planen (whatif_plan_test).",

  prompt_lang: "Bitte sprechen Sie {name} mit mir und geben Sie lang: \"{code}\" an jedes What-IF-Tool.",
};

const es: Record<McpKey, Msg> = {
  open_report: "Abrir el informe visual",
  open_report_demo: "Abrir el informe visual (café de demostración, números inventados)",
  coaching_label: "Coaching",
  err_internal: "What-IF no pudo hacerlo: {msg}",
  why_word: "por qué",
  or_word: " o ",
  optional_word: "opcional",
  please_fix: "Corregir, por favor:",
  measured_values: "los resultados de la prueba",
  ignored_keys: "No usado (no es un campo de {template}): {list}.",
  ignored_item_suggest: "{key} (¿quería decir {options}?)",

  nr_missing: (p, lang) =>
    `${n(p, "n", { one: "Aún no está listo: falta {n} dato", other: "Aún no está listo: faltan {n} datos" }, lang)} (${s(p.list)}).`,
  nr_ask_next: "Preguntar ahora: «{ask}» (campo `{key}`; por qué: {why})",
  nr_call_again: "Después, llamar de nuevo a esta herramienta con los datos corregidos (whatif_check_inputs da la siguiente pregunta).",

  start_template: "Plantilla de decisión: {title} ({id}). {summary}",
  start_event_note:
    "La pregunta también menciona {what}: cuando estén los números, se puede ensayar como evento con clientes imaginados (whatif_rehearsal_start con `event`).",
  start_numbers: "Números que preguntar, de uno en uno ({n} necesarios):",
  start_optional: "Opcional (si no se sabe, se usa una estimación marcada): {list}.",
  start_kiez: "Kiez (opcional, da forma a los clientes imaginados): {list} u otro.",
  start_first: "Empezar preguntando: «{ask}»",
  start_demo:
    "O mostrar primero cómo funciona con el café de demostración ({demo}, números inventados y marcados como demo): llamar a whatif_run_scenarios con demo: true.",
  start_events: "Eventos de Berlín que se pueden añadir luego a un ensayo (imaginados, no hechos): {list}.",
  coach_1: "Resumir la pregunta en una frase y decir que What-IF compara un resultado prudente, uno esperado y uno optimista; no predice el futuro.",
  coach_2:
    "Pedir los números DE UNO EN UNO, en el orden indicado, diciendo por qué importa cada uno. Valen respuestas aproximadas; «no lo sé» está bien en los opcionales (se usa una estimación marcada).",
  coach_3: "Tras cada respuesta, llamar a whatif_check_inputs; devuelve la siguiente pregunta. Cuando esté listo, llamar a whatif_run_scenarios y compartir el enlace del informe.",
  coach_4:
    "Explicar el punto de equilibrio y el peor caso con palabras sencillas y luego ofrecer: ensayar con clientes imaginados (whatif_rehearsal_start), probar otro número (whatif_what_changed) o planear una prueba pequeña (whatif_plan_test). Pasarles el `state` del último resultado.",
  coach_5: "Cada cifra tiene su origen: número propio, estimación, cálculo, imaginado o demo. Mantenerlos separados al hablar.",
  hint_start: "Hacer una pregunta cada vez y decir por qué importa; enseñar el informe de demostración si quiere ver adónde lleva esto.",

  res_head:
    "Parece que vuelve con números reales de una prueba. Compararlos con los escenarios: llamar a whatif_log_result con `observed` y el último `state` (o el enlace del informe); sin él, con la misma plantilla y los mismos datos que antes.",
  res_fields: "Valores medidos para «{title}»: {list}.",
  hint_results: "Felicitar por probar antes de decidir y pedir los valores medidos de uno en uno.",

  reason_weather: "el tiempo",
  reason_absurd: "algo muy ajeno al café",
  reason_competitor: "lo que hace la competencia",
  reason_rent: "el alquiler o el casero",
  reason_costs: "los precios de proveedores o de la energía",
  reason_event: "un evento externo (una huelga, obras, vacaciones, una fiesta)",
  sug_weather_1: "¿Y si hago una oferta de almuerzo para los días de lluvia?",
  sug_weather_2: "¿Y si bajo 50 céntimos el café con hielo durante la ola de calor?",
  sug_competitor_1: "¿Y si respondo al nuevo café con un menú de mediodía entre semana?",
  sug_competitor_2: "¿Y si bajo 20 céntimos el precio del flat white?",
  sug_rent_1: "¿Y si subo 30 céntimos el precio del café para cubrir el alquiler más alto?",
  sug_rent_2: "¿Y si lanzo un menú de mediodía para ingresar más a la hora de comer?",
  sug_costs_1: "¿Y si subo 20 céntimos el precio del capuchino?",
  sug_costs_2: "¿Y si cambio mi oferta de almuerzo para que me cueste menos prepararla?",
  sug_event_1: "¿Y si hago una oferta de almuerzo para quienes sigan viniendo?",
  sug_event_2: "¿Y si subo el precio del café para llevar durante el fin de semana de la fiesta?",
  nd_head: "No es una decisión que tome el café ({what}), así que What-IF no elige plantilla y todavía no pide números.",
  can_do:
    "What-IF ensaya una decisión que toma el propio café. Hoy calcula dos: una oferta de almuerzo entre semana y un precio nuevo para un producto, cada una con un resultado prudente, uno esperado y uno optimista, el punto de equilibrio, un ensayo con clientes imaginados y una prueba pequeña. No predice el futuro.",
  nd_reframe: "Convertirlo en una decisión: preguntar qué haría el café al respecto, por ejemplo:",
  nd_event: "Cuando haya una decisión, esto puede entrar en el ensayo como evento imaginado (whatif_rehearsal_start con `event`, o whatif_rehearsal_event).",
  topic_hiring: "contratar personal",
  topic_hours: "el horario",
  topic_location: "el alquiler, una mudanza o un segundo local",
  topic_product: "un producto nuevo",
  topic_investment: "equipos o una reforma",
  topic_delivery: "una plataforma de reparto",
  un_head: "What-IF aún no puede calcular esta decisión ({what}).",
  un_map: "Si una parte encaja en «{title}», What-IF puede ensayar esa parte: llamar de nuevo a whatif_start con template «{id}».",
  un_map_staff: "Si la ayuda extra es para una oferta de almuerzo, la plantilla «{title}» incluye horas extra de personal: llamar de nuevo a whatif_start con template «{id}».",
  un_by_hand:
    "Si no, razonarlo a mano con el mismo método: tres resultados, el punto de equilibrio, una prueba pequeña y reversible, y cada número marcado como propio o estimado. No inventar números.",
  uc_head: "What-IF no pudo saber de qué decisión trata la pregunta.",
  uc_ask: "Preguntar qué decisión se está pensando, por ejemplo:",
  hint_unsupported: "Decir con honestidad que What-IF aún no puede calcularlo; ofrecer la parte que sí se puede ensayar o un análisis a mano con números marcados.",
  hint_not_decision: "No pedir números todavía. Responder brevemente y preguntar, en una frase corta, qué decisión se está pensando.",

  ci_check_this: "Comprobar esto: {problem}",
  ci_check_why: "Con este número los escenarios estarían mal.",
  ci_ready: (p, lang) => `Listo: están todos los números para «${s(p.title)}» (${n(p, "n", { one: "{n} valor", other: "{n} valores" }, lang)}).`,
  ci_not_ready: "Aún no está listo: faltan {missing}; por corregir: {problems}.",
  ci_next_field: "Siguiente pregunta: «{ask}» [{key}] (por qué: {why})",
  ci_next: "Siguiente pregunta: «{ask}»",
  ci_still: "Después aún falta: {list}.",
  ci_problems: "Problemas:",
  ci_guesses: "Estimaciones que What-IF ha puesto (contarlas; se pueden corregir):",
  ci_guesses_later: (p, lang) =>
    n(
      p,
      "n",
      {
        one: "{n} valor opcional usará una estimación marcada si no se sabe mejor (ver resolved).",
        other: "{n} valores opcionales usarán una estimación marcada si no se saben mejor (ver resolved).",
      },
      lang,
    ),
  ci_run_next: "Siguiente paso: llamar a whatif_run_scenarios con la misma plantilla y los mismos datos (o con el `state` de este resultado).",
  hint_check_ready: "Leer las estimaciones puestas antes de calcular los escenarios.",
  hint_check_more: "Hacer solo la siguiente pregunta, con palabras sencillas, y decir por qué importa.",

  state_next:
    "Las siguientes llamadas (whatif_what_changed, whatif_rehearsal_start, whatif_plan_test, whatif_log_result) pueden recibir `state` = el state de este resultado o el enlace del informe, en lugar de plantilla y datos.",
  hint_run: "Compartir el enlace, explicar el punto de equilibrio en una frase y preguntar de qué estimación hay menos seguridad.",

  wc_nothing: "No ha cambiado nada entre los dos conjuntos de números.",
  wc_changed: "Cambiado: {list}.",
  wc_why: "Por qué se movió el resultado:",
  wc_expected: "Resultado esperado ahora: {test} durante la prueba, {month} al mes después.",
  wc_break_even: "Punto de equilibrio ahora: {plain}",
  hint_changed: "Preguntar qué dice esto sobre qué número importa más.",

  rs_ready: "Ensayo listo: {people} clientes imaginados, {rounds} rondas. Reaccionan a: {change}",
  rs_who: "Quiénes son: {list}.",
  rs_round1: (p, lang) => `Ronda 1 de ${s(p.rounds)}: ${s(p.title)}. ${n(p, "n", { one: "{n} instrucción", other: "{n} instrucciones" }, lang)} para ejecutar (abajo)`,
  rs_away: (p, lang) => `; ${n(p, "n", { one: "{n} persona no está", other: "{n} personas no están" }, lang)} en esta ronda (se gestiona solo)`,
  rs_imagined: "Estas personas son imaginadas. Sus reacciones son preguntas para comprobar con clientes reales, no un pronóstico.",
  hint_rehearsal_start: "Contar quiénes son los clientes imaginados, ejecutar las instrucciones y compartir el enlace mientras se llena la línea de tiempo.",

  err_rehearsal_done: "Este ensayo ya ha terminado. Usar whatif_rehearsal_interview para hacer una pregunta a los clientes imaginados, o compartir el informe.",
  err_no_reactions: "No se enviaron reacciones. Pasar `reactions` como lista con la respuesta JSON de cada persona.",
  sub_none:
    "Ninguna respuesta era válida, así que la ronda {round} no avanza.\nQué estaba mal:\n{errors}\nCorregir esas respuestas (volver a ejecutar las instrucciones de abajo si hace falta) y llamar de nuevo a whatif_rehearsal_submit con el mismo state.",
  hint_sub_none: "Cada respuesta debe ser el objeto JSON que pide su instrucción, con una de las acciones permitidas.",
  sub_done: (p, lang) => `${n(p, "n", { one: "Aceptada {n} respuesta", other: "Aceptadas {n} respuestas" }, lang)}. El ensayo ha terminado.`,
  hint_sub_done: "Compartir el enlace, leer una o dos citas y convertir las preguntas abiertas en una prueba real pequeña (whatif_plan_test).",
  sub_partial: "Aceptadas {n}; {k} necesitan otro intento antes de terminar la ronda {round}:\n{errors}",
  hint_sub_partial: "Volver a ejecutar solo las personas indicadas y enviar sus respuestas con el nuevo state.",
  sub_next: (p, lang) =>
    `${n(p, "n", { one: "Aceptada {n} respuesta", other: "Aceptadas {n} respuestas" }, lang)}. Sigue la ronda ${s(p.round)} de ${s(p.rounds)}${p.title ? `: ${s(p.title)}` : ""}. ${n(p, "k", { one: "{n} instrucción", other: "{n} instrucciones" }, lang)} para ejecutar (abajo).`,
  hint_sub_next: "Dar una actualización de una línea sobre la ronda y ofrecer añadir un evento local antes de la siguiente (whatif_rehearsal_event).",

  sum_done: "Ensayo terminado: {people} clientes imaginados, {rounds} rondas. Cambio: {change}",
  sum_so_far: "Ensayo hasta ahora: {people} clientes imaginados, {rounds} rondas. Cambio: {change}",
  sum_did: "Qué hicieron: {list}.",
  of_count: "{label}: {count} de {of}",
  sum_words: "Con sus palabras:",
  quote: "«{text}» ({name}, ronda {round})",
  sum_questions: "Preguntas que harían al café:",
  sum_check: "Comprobar con clientes reales:",

  err_event_done: "Este ensayo ya ha terminado, no hay una ronda siguiente para el evento. Empezar un ensayo nuevo con `event`.",
  ev_added: (p, lang) =>
    `Añadido antes de la ronda ${s(p.round)}: «${s(p.event)}». ${n(p, "n", { one: "La instrucción de abajo ya lo incluye.", other: "Las {n} instrucciones de abajo ya lo incluyen." }, lang)}`,
  hint_event: "Preguntar qué cree que cambiará el evento, luego ejecutar la ronda y comparar.",

  ap_played: "Las rondas restantes se jugaron con reglas simples (sin modelo).",
  hint_autoplay: "Decir que estas reacciones salen de reglas simples, no de personas; sirven para elegir qué preguntar a clientes reales.",

  iv_briefs: (p, lang) =>
    `Pregunta de entrevista: «${s(p.question)}». ${n(p, "n", { one: "{n} instrucción abajo", other: "{n} instrucciones abajo" }, lang)}, una por cliente imaginado.`,
  hint_iv_briefs: "Recordar que estas respuestas son imaginadas; lo útil son las preguntas que sugieren para clientes reales.",
  iv_none: "No se pudo guardar ninguna respuesta:\n{errors}\nCorregirlas y llamar de nuevo a whatif_rehearsal_interview con el mismo state, la misma pregunta y las respuestas.",
  hint_iv_none: "Cada respuesta debe ser el objeto JSON que pide su instrucción.",
  iv_recorded: (p, lang) =>
    `${n(p, "n", { one: "Guardada {n} respuesta imaginada", other: "Guardadas {n} respuestas imaginadas" }, lang)} a «${s(p.question)}»:`,
  quoted: "«{text}»",
  iv_could_not: "No se pudo guardar:",
  hint_iv_recorded: "Convertir la respuesta más sorprendente en una pregunta para tres clientes reales esta semana.",

  pt_title: "Plan de prueba: {title}.",
  pt_before: "Antes de empezar:",
  pt_measure: "Medir:",
  pt_checkins: "Revisiones:",
  pt_day: "Día {day}: {look}",
  pt_rule: "Regla de decisión:",
  pt_keep: "Mantener",
  pt_tweak: "Ajustar",
  pt_stop: "Parar",
  pt_cap: "Límite de coste: {cap}",
  pt_after: "Después de la prueba, llamar a whatif_log_result con lo medido y el `state` de este resultado.",
  hint_plan: "Acordar la fecha de inicio y quién cuenta qué, y pedir que vuelva con los números.",

  lr_bad: "«{key}» debe ser un número; llegó «{value}».",
  lr_need: "Para comparar la prueba con los escenarios aún falta: {list}.",
  lr_understands: "Valores medidos que entiende esta plantilla: {list}.",
  lr_below: "por debajo incluso del escenario prudente",
  lr_above: "por encima del escenario optimista",
  lr_closest: "más cerca del escenario «{name}»",
  lr_line: "{label}: {actual} ({closest}). Resultado durante la prueba: {net}.",
  lr_verdict: "Veredicto: {verdict}.",
  verdict_keep: "MANTENER",
  verdict_tweak: "AJUSTAR",
  verdict_stop: "PARAR",
  lr_teaches: "Qué enseña esto:",
  hint_log: "Celebrar que probó antes de comprometerse y preguntar qué cambiará la próxima vez.",

  err_template_mismatch: "Este state es de la plantilla {state}, pero template dice {given}. Con `state` no hace falta `template` (o empezar de nuevo sin state).",
  err_need_template: "Pasar `template` e `inputs`, o el `state` del último resultado de What-IF (el enlace del informe también vale).",
  err_bad_link: "Este enlace de What-IF está dañado o cortado. Empezar de nuevo con los números para obtener uno nuevo.",
  err_old_link: "Este enlace de What-IF tiene un formato que esta versión no entiende.",
  err_bad_link_hint: "(Pasar el `state` del último resultado de What-IF tal como llegó, o su report_url.)",
  err_no_rehearsal: "Este state no contiene ningún ensayo. Empezar uno con whatif_rehearsal_start y devolver el state que da.",

  at_demo: "Datos de demostración: son números inventados de un café de demostración.",
  at_break_even: "Punto de equilibrio (break-even, el número que hay que recordar): {plain}",
  at_three: "Tres resultados posibles (calculados con los números y las estimaciones):",
  at_scenario: "{test} durante la prueba; {month} al mes.",
  at_worst: "Peor caso: {plain}",
  at_uncertainty: "Mayor incertidumbre: {plain}",
  at_watch: "Atención:",
  at_facts: "Datos públicos que usa el cálculo: {list}.",
  at_next:
    "Siguiente paso: mover una estimación (whatif_what_changed), ensayarlo con clientes imaginados (whatif_rehearsal_start) o planear una prueba pequeña (whatif_plan_test).",

  prompt_lang: "Por favor, háblame en {name} y pasa lang: \"{code}\" a todas las herramientas de What-IF.",
};

const pl: Record<McpKey, Msg> = {
  open_report: "Otwórz raport wizualny",
  open_report_demo: "Otwórz raport wizualny (kawiarnia demo, wymyślone liczby)",
  coaching_label: "Wskazówka",
  err_internal: "What-IF nie mógł tego zrobić: {msg}",
  why_word: "dlaczego",
  or_word: " lub ",
  optional_word: "opcjonalnie",
  please_fix: "Do poprawienia:",
  measured_values: "wynikach testu",
  ignored_keys: "Pominięto (brak takiego pola w {template}): {list}.",
  ignored_item_suggest: "{key} (czy chodziło o {options}?)",

  nr_missing: (p, lang) =>
    `Jeszcze nie gotowe: ${n(p, "n", { one: "brakuje {n} liczby", few: "brakuje {n} liczb", many: "brakuje {n} liczb", other: "brakuje {n} liczby" }, lang)} (${s(p.list)}).`,
  nr_ask_next: "Zapytaj teraz: „{ask}” (pole `{key}`; dlaczego: {why})",
  nr_call_again: "Potem wywołaj to narzędzie ponownie z poprawionymi danymi (whatif_check_inputs poda następne pytanie).",

  start_template: "Szablon decyzji: {title} ({id}). {summary}",
  start_event_note:
    "W pytaniu pojawia się też temat: {what}. Gdy liczby będą gotowe, można go przećwiczyć jako zdarzenie z wyobrażonymi klientami (whatif_rehearsal_start z `event`).",
  start_numbers: "Liczby do zebrania, po jednej (potrzebne: {n}):",
  start_optional: "Opcjonalnie (jeśli nie wiadomo, użyty zostanie oznaczony szacunek): {list}.",
  start_kiez: "Kiez (opcjonalnie, kształtuje wyobrażonych klientów): {list} lub inny.",
  start_first: "Zacznij od pytania: „{ask}”",
  start_demo:
    "Albo najpierw pokaż działanie na kawiarni demo ({demo}, wymyślone liczby oznaczone jako demo): wywołaj whatif_run_scenarios z demo: true.",
  start_events: "Wydarzenia w Berlinie, które można później dodać do próby (wyobrażone, nie fakty): {list}.",
  coach_1: "Powtórz pytanie jednym zdaniem i powiedz, że What-IF porówna wariant ostrożny, oczekiwany i optymistyczny; nie przewiduje przyszłości.",
  coach_2:
    "Pytaj o liczby PO JEDNEJ, w podanej kolejności, i mów, dlaczego każda ma znaczenie. Przybliżone odpowiedzi są w porządku; przy opcjonalnych „nie wiem” też (użyty zostanie oznaczony szacunek).",
  coach_3: "Po każdej odpowiedzi wywołaj whatif_check_inputs; poda następne pytanie. Gdy wszystko gotowe, wywołaj whatif_run_scenarios i udostępnij link do raportu.",
  coach_4:
    "Wyjaśnij prostymi słowami próg rentowności i najgorszy przypadek, potem zaproponuj: próbę z wyobrażonymi klientami (whatif_rehearsal_start), inną liczbę (whatif_what_changed) albo mały test (whatif_plan_test). Przekaż im `state` z ostatniego wyniku.",
  coach_5: "Każda liczba ma źródło: liczba właściciela, szacunek, obliczenie, wyobrażone lub demo. Nie mieszaj ich w rozmowie.",
  hint_start: "Zadawaj jedno pytanie naraz i mów, dlaczego jest ważne; pokaż raport demo, jeśli rozmówca chce zobaczyć, dokąd to prowadzi.",

  res_head:
    "Wygląda na to, że wracają prawdziwe liczby z testu. Porównaj je ze scenariuszami: wywołaj whatif_log_result z `observed` i ostatnim `state` (albo linkiem do raportu); bez niego podaj ten sam szablon i te same dane co wcześniej.",
  res_fields: "Wartości zmierzone dla „{title}”: {list}.",
  hint_results: "Pochwal, że najpierw był test, potem poproś o zmierzone liczby po jednej.",

  reason_weather: "pogoda",
  reason_absurd: "coś daleko poza kawiarnią",
  reason_competitor: "działania konkurencji",
  reason_rent: "czynsz lub wynajmujący",
  reason_costs: "ceny dostawców lub energii",
  reason_event: "zdarzenie z zewnątrz (strajk, budowa, wakacje, festyn)",
  sug_weather_1: "Co jeśli zrobię ofertę lunchową na deszczowe dni?",
  sug_weather_2: "Co jeśli w czasie upału obniżę cenę kawy mrożonej o 50 centów?",
  sug_competitor_1: "Co jeśli odpowiem nowej kawiarni ofertą lunchową w dni robocze?",
  sug_competitor_2: "Co jeśli obniżę cenę flat white o 20 centów?",
  sug_rent_1: "Co jeśli podniosę ceny kawy o 30 centów, żeby pokryć wyższy czynsz?",
  sug_rent_2: "Co jeśli wprowadzę ofertę lunchową, żeby w południe zarabiać więcej?",
  sug_costs_1: "Co jeśli podniosę cenę cappuccino o 20 centów?",
  sug_costs_2: "Co jeśli zmienię ofertę lunchową tak, żeby kosztowała mnie mniej?",
  sug_event_1: "Co jeśli zrobię ofertę lunchową dla tych, którzy i tak przyjdą?",
  sug_event_2: "Co jeśli podniosę cenę kawy na wynos w weekend festynu?",
  nd_head: "To nie jest decyzja, którą podejmuje kawiarnia (temat: {what}), więc What-IF nie wybiera szablonu i jeszcze nie pyta o liczby.",
  can_do:
    "What-IF ćwiczy decyzję, którą kawiarnia podejmuje sama. Dziś liczy dwie: ofertę lunchową w dni robocze i nową cenę jednego produktu, każdą z wariantem ostrożnym, oczekiwanym i optymistycznym, progiem rentowności, próbą z wyobrażonymi klientami i małym testem. Nie przewiduje przyszłości.",
  nd_reframe: "Zamień to w decyzję: zapytaj, co kawiarnia by z tym zrobiła, na przykład:",
  nd_event: "Gdy będzie decyzja, można to dodać do próby jako wyobrażone zdarzenie (whatif_rehearsal_start z `event` albo whatif_rehearsal_event).",
  topic_hiring: "zatrudnienie personelu",
  topic_hours: "godziny otwarcia",
  topic_location: "czynsz, przeprowadzka lub drugi lokal",
  topic_product: "nowy produkt",
  topic_investment: "sprzęt lub remont",
  topic_delivery: "platforma dostaw",
  un_head: "What-IF nie umie jeszcze policzyć tej decyzji (temat: {what}).",
  un_map: "Jeśli część z tego to „{title}”, What-IF może przećwiczyć tę część: wywołaj ponownie whatif_start z template „{id}”.",
  un_map_staff: "Jeśli dodatkowa pomoc ma być do oferty lunchowej, szablon „{title}” uwzględnia dodatkowe godziny pracy: wywołaj ponownie whatif_start z template „{id}”.",
  un_by_hand:
    "W przeciwnym razie przemyśl to ręcznie tą samą metodą: trzy warianty, próg rentowności, mały odwracalny test, a każda liczba oznaczona jako własna lub szacunkowa. Nie wymyślaj liczb.",
  uc_head: "What-IF nie rozpoznał, o jaką decyzję chodzi.",
  uc_ask: "Zapytaj, jaką decyzję rozważa kawiarnia, na przykład:",
  hint_unsupported: "Powiedz uczciwie, że What-IF jeszcze tego nie liczy; zaproponuj część, którą da się przećwiczyć, albo ręczne przemyślenie z oznaczonymi liczbami.",
  hint_not_decision: "Nie pytaj jeszcze o liczby. Odpowiedz krótko, potem jednym krótkim pytaniem ustal, jaka decyzja jest rozważana.",

  ci_check_this: "Sprawdź to: {problem}",
  ci_check_why: "Z tą liczbą scenariusze byłyby błędne.",
  ci_ready: (p, lang) =>
    `Gotowe: są wszystkie liczby dla „${s(p.title)}” (${n(p, "n", { one: "{n} wartość", few: "{n} wartości", many: "{n} wartości", other: "{n} wartości" }, lang)}).`,
  ci_not_ready: "Jeszcze nie gotowe: brakuje {missing}, do poprawienia {problems}.",
  ci_next_field: "Następne pytanie: „{ask}” [{key}] (dlaczego: {why})",
  ci_next: "Następne pytanie: „{ask}”",
  ci_still: "Potem jeszcze brakuje: {list}.",
  ci_problems: "Problemy:",
  ci_guesses: "Szacunki wstawione przez What-IF (powiedz o nich; można je poprawić):",
  ci_guesses_later: (p, lang) =>
    n(
      p,
      "n",
      {
        one: "{n} opcjonalna wartość zostanie oszacowana (z oznaczeniem), jeśli nikt nie zna lepszej (zob. resolved).",
        few: "{n} opcjonalne wartości zostaną oszacowane (z oznaczeniem), jeśli nikt nie zna lepszych (zob. resolved).",
        many: "{n} opcjonalnych wartości zostanie oszacowanych (z oznaczeniem), jeśli nikt nie zna lepszych (zob. resolved).",
        other: "{n} opcjonalnej wartości zostanie oszacowane (z oznaczeniem), jeśli nikt nie zna lepszych (zob. resolved).",
      },
      lang,
    ),
  ci_run_next: "Następny krok: wywołaj whatif_run_scenarios z tym samym szablonem i danymi (albo ze `state` tego wyniku).",
  hint_check_ready: "Przeczytaj wstawione szacunki, zanim uruchomisz scenariusze.",
  hint_check_more: "Zadaj tylko następne pytanie, prostymi słowami, i powiedz, dlaczego jest ważne.",

  state_next:
    "Kolejne wywołania (whatif_what_changed, whatif_rehearsal_start, whatif_plan_test, whatif_log_result) mogą dostać `state` = state tego wyniku albo link do raportu zamiast szablonu i danych.",
  hint_run: "Udostępnij link, wyjaśnij próg rentowności jednym zdaniem i zapytaj, którego szacunku rozmówca jest najmniej pewny.",

  wc_nothing: "Między dwoma zestawami liczb nic się nie zmieniło.",
  wc_changed: "Zmieniono: {list}.",
  wc_why: "Dlaczego wynik się zmienił:",
  wc_expected: "Oczekiwany wynik teraz: {test} w czasie testu, {month} miesięcznie potem.",
  wc_break_even: "Próg rentowności teraz: {plain}",
  hint_changed: "Zapytaj, co to mówi o tym, która liczba jest najważniejsza.",

  rs_ready: "Próba gotowa: wyobrażeni klienci: {people}, rundy: {rounds}. Reagują na: {change}",
  rs_who: "Kim są: {list}.",
  rs_round1: (p, lang) =>
    `Runda 1 z ${s(p.rounds)}: ${s(p.title)}. ${n(p, "n", { one: "{n} instrukcja", few: "{n} instrukcje", many: "{n} instrukcji", other: "{n} instrukcji" }, lang)} do uruchomienia (poniżej)`,
  rs_away: "; nieobecni w tej rundzie: {n} (obsłużone automatycznie)",
  rs_imagined: "Ci ludzie są wyobrażeni. Ich reakcje to pytania do sprawdzenia z prawdziwymi klientami, a nie prognoza.",
  hint_rehearsal_start: "Powiedz, kim są wyobrażeni klienci, uruchom instrukcje i udostępniaj link, gdy oś czasu się zapełnia.",

  err_rehearsal_done: "Ta próba już się zakończyła. Użyj whatif_rehearsal_interview, żeby zadać wyobrażonym klientom pytanie, albo udostępnij raport.",
  err_no_reactions: "Nie wysłano żadnych reakcji. Przekaż `reactions` jako listę z odpowiedzią JSON każdej persony.",
  sub_none:
    "Żadna odpowiedź nie nadawała się do użycia, więc runda {round} nie idzie dalej.\nCo było nie tak:\n{errors}\nPopraw te odpowiedzi (w razie potrzeby uruchom ponownie instrukcje poniżej) i wywołaj ponownie whatif_rehearsal_submit z tym samym state.",
  hint_sub_none: "Każda odpowiedź musi być obiektem JSON, o który prosi jej instrukcja, z jedną z dozwolonych akcji.",
  sub_done: (p, lang) => `Przyjęto ${n(p, "n", { one: "{n} odpowiedź", other: "{n} odpowiedzi" }, lang)}. Próba zakończona.`,
  hint_sub_done: "Udostępnij link, przeczytaj jeden lub dwa cytaty, a otwarte pytania zamień w mały prawdziwy test (whatif_plan_test).",
  sub_partial: "Przyjęto: {n}; kolejnej próby wymaga: {k}, zanim runda {round} się zakończy:\n{errors}",
  hint_sub_partial: "Uruchom ponownie tylko wymienione persony i wyślij ich odpowiedzi z nowym state.",
  sub_next: (p, lang) =>
    `Przyjęto ${n(p, "n", { one: "{n} odpowiedź", other: "{n} odpowiedzi" }, lang)}. Następna jest runda ${s(p.round)} z ${s(p.rounds)}${p.title ? `: ${s(p.title)}` : ""}. ${n(p, "k", { one: "{n} instrukcja", few: "{n} instrukcje", many: "{n} instrukcji", other: "{n} instrukcji" }, lang)} do uruchomienia (poniżej).`,
  hint_sub_next: "Podsumuj rundę jednym zdaniem i zaproponuj dodanie lokalnego zdarzenia przed następną (whatif_rehearsal_event).",

  sum_done: "Próba zakończona: wyobrażeni klienci: {people}, rundy: {rounds}. Zmiana: {change}",
  sum_so_far: "Próba do tej pory: wyobrażeni klienci: {people}, rundy: {rounds}. Zmiana: {change}",
  sum_did: "Co zrobili: {list}.",
  of_count: "{label}: {count} z {of}",
  sum_words: "Ich słowami:",
  quote: "„{text}” ({name}, runda {round})",
  sum_questions: "Pytania, które zadaliby kawiarni:",
  sum_check: "Do sprawdzenia z prawdziwymi klientami:",

  err_event_done: "Ta próba już się zakończyła, więc nie ma następnej rundy dla zdarzenia. Zacznij nową próbę z ustawionym `event`.",
  ev_added: "Dodano przed rundą {round}: „{event}”. Instrukcje poniżej (liczba: {n}) już to uwzględniają.",
  hint_event: "Zapytaj, co według rozmówcy zmieni to zdarzenie, potem uruchom rundę i porównaj.",

  ap_played: "Pozostałe rundy rozegrano według prostych reguł (bez modelu).",
  hint_autoplay: "Powiedz, że te reakcje pochodzą z prostych reguł, a nie od ludzi; pomagają wybrać, o co zapytać prawdziwych klientów.",

  iv_briefs: "Pytanie wywiadu: „{question}”. Instrukcje poniżej (liczba: {n}), po jednej na wyobrażonego klienta.",
  hint_iv_briefs: "Przypomnij, że te odpowiedzi są wyobrażone; wartościowe są pytania, które podsuwają dla prawdziwych klientów.",
  iv_none: "Nie udało się zapisać żadnej odpowiedzi:\n{errors}\nPopraw je i wywołaj ponownie whatif_rehearsal_interview z tym samym state, pytaniem i answers.",
  hint_iv_none: "Każda odpowiedź musi być obiektem JSON, o który prosi jej instrukcja.",
  iv_recorded: "Zapisano wyobrażone odpowiedzi (liczba: {n}) na „{question}”:",
  quoted: "„{text}”",
  iv_could_not: "Nie zapisano:",
  hint_iv_recorded: "Zamień najbardziej zaskakującą odpowiedź w jedno pytanie do trzech prawdziwych klientów w tym tygodniu.",

  pt_title: "Plan testu: {title}.",
  pt_before: "Przed startem:",
  pt_measure: "Mierz:",
  pt_checkins: "Punkty kontrolne:",
  pt_day: "Dzień {day}: {look}",
  pt_rule: "Reguła decyzji:",
  pt_keep: "Zostawić",
  pt_tweak: "Poprawić",
  pt_stop: "Zakończyć",
  pt_cap: "Limit kosztów: {cap}",
  pt_after: "Po teście wywołaj whatif_log_result ze zmierzonymi wartościami i `state` tego wyniku.",
  hint_plan: "Ustal datę startu i kto co liczy, i poproś o powrót z liczbami.",

  lr_bad: "„{key}” musi być liczbą; otrzymano „{value}”.",
  lr_need: "Do porównania testu ze scenariuszami brakuje jeszcze: {list}.",
  lr_understands: "Wartości zmierzone, które rozumie ten szablon: {list}.",
  lr_below: "poniżej nawet ostrożnego scenariusza",
  lr_above: "powyżej optymistycznego scenariusza",
  lr_closest: "najbliżej scenariusza „{name}”",
  lr_line: "{label}: {actual} ({closest}). Wynik w czasie testu: {net}.",
  lr_verdict: "Werdykt: {verdict}.",
  verdict_keep: "ZOSTAWIĆ",
  verdict_tweak: "POPRAWIĆ",
  verdict_stop: "ZAKOŃCZYĆ",
  lr_teaches: "Czego to uczy:",
  hint_log: "Doceń, że najpierw był test, potem zapytaj, co następnym razem zmienić.",

  err_template_mismatch: "Ten state dotyczy szablonu {state}, a template mówi {given}. Przy `state` pomiń `template` (albo zacznij od nowa bez state).",
  err_need_template: "Podaj `template` i `inputs` albo `state` z ostatniego wyniku What-IF (link do raportu też działa).",
  err_bad_link: "Ten link What-IF jest uszkodzony lub obcięty. Zacznij od nowa od liczb, żeby dostać nowy.",
  err_old_link: "Ten link What-IF ma format, którego ta wersja nie rozumie.",
  err_bad_link_hint: "(Przekaż `state` z ostatniego wyniku What-IF dokładnie tak, jak przyszedł, albo jego report_url.)",
  err_no_rehearsal: "W tym state nie ma próby. Zacznij ją przez whatif_rehearsal_start i przekaż zwrócony state.",

  at_demo: "Dane demo: to wymyślone liczby kawiarni demo.",
  at_break_even: "Próg rentowności (break-even, ta jedna liczba do zapamiętania): {plain}",
  at_three: "Trzy możliwe wyniki (obliczone z liczb właściciela i szacunków):",
  at_scenario: "{test} w czasie testu; {month} miesięcznie.",
  at_worst: "Najgorszy przypadek: {plain}",
  at_uncertainty: "Największa niepewność: {plain}",
  at_watch: "Uwaga:",
  at_facts: "Publiczne fakty użyte w obliczeniach: {list}.",
  at_next:
    "Następny krok: zmień jeden szacunek (whatif_what_changed), przećwicz to z wyobrażonymi klientami (whatif_rehearsal_start) albo zaplanuj mały test (whatif_plan_test).",

  prompt_lang: "Proszę, rozmawiaj ze mną w języku: {name}, i przekazuj lang: \"{code}\" do każdego narzędzia What-IF.",
};

export const MCP_MESSAGES: Catalog<McpKey> = { en, de, es, pl };

/** t(key, params, lang): the MCP framing sentence in that language (English per key as the fallback). */
export const mcpT = makeT(MCP_MESSAGES);
