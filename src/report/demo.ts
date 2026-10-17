/**
 * The site's live demos: ShareStates for the made-up café in Berlin-Neukölln,
 * with a rehearsal played by the rule-based stand-in (no model), so "See the
 * demo" needs no server and no AI. Browser-safe.
 *
 *   demoState("lunch_offer")                     weekday lunch deal (+ an owner event, + one interview)
 *   demoState("price_change")                    flat white +€0.20 when the minimum wage rises on 1 Jan 2027
 *   demoState("lunch_offer", { result: true })   the same demo after the test, with counted results
 *
 * The interview answers are written by simple fixed rules from what each imagined
 * customer did in the rehearsal (method "rule-based"), never by a model.
 */
import { DEMO_KIEZ } from "../engine/berlin.ts";
import { analyze, demoInputs, getTemplate } from "../engine/index.ts";
import { demoBusiness } from "../engine/templates.ts";
import type { TemplateId } from "../engine/types.ts";
import { getLang, makeT, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { actionKind, autoplayRehearsal, DEMO_EVENT_ID, injectEvent, recordInterview, ruleBasedReactions, startRehearsal, submitRound, toShareRehearsal } from "../sim/index.ts";
import type { Persona, Rehearsal } from "../sim/types.ts";
import { encodeState } from "../state.ts";
import type { ShareState } from "../state.ts";

/** The demo café's Kiez (one of BERLIN_KIEZE). */
export { DEMO_KIEZ };

/**
 * Seeds picked for a full story, the same in de, en, es and pl (see src/sim/berlin.ts DEMO_SEEDS):
 * lunch 36 (Murat notices and tries, Jan tries and tells, Chiara and Murat hear it from Jan, Murat comes back;
 * Noor stays sceptical, Greta goes to the new café), price change 66 (Lena grumbles, Minh hears it and leaves
 * for the Späti, Leyla recommends it anyway, most keep buying).
 */
export const DEMO_SEEDS: Record<TemplateId, number> = { lunch_offer: 36, price_change: 66 };

/** Counted results for the "after the test" demo (made up, labelled as demo data in the report). */
export const DEMO_OBSERVED: Record<TemplateId, Record<string, number>> = {
  lunch_offer: { baseline_lunch_customers: 38, test_lunch_customers: 44, redemptions_per_day: 14, days_run: 10, actual_setup_cost: 180 },
  price_change: { units_before_per_week: 620, units_after_per_week: 603, days_run: 14 },
};

type K =
  | "event"
  | "price_question"
  | "iv_lunch_q"
  | "iv_price_q"
  | "lunch_back"
  | "lunch_once"
  | "lunch_elsewhere"
  | "lunch_noticed"
  | "lunch_away"
  | "price_kept"
  | "price_grumbled"
  | "price_less"
  | "price_away";

const T = makeT<K>({
  en: {
    event: "A new café opens two doors down with an €8.50 lunch.",
    price_question: "What if I put my flat white up by 20 cents when the minimum wage rises from €13.90 to €14.60 on 1 January 2027?",
    iv_lunch_q: "What would make you come back for the lunch deal next week?",
    iv_price_q: "What would keep you buying your flat white here?",
    lunch_back: "If it stays this quick and the soup changes now and then, I'll keep coming. {price} feels fair for what I get.",
    lunch_once: "Maybe. I'd like to know what's in it before I queue: write the soup of the day on the board.",
    lunch_elsewhere: "The new place was cheaper. If yours had something they don't, a vegetarian soup every day, I'd come back.",
    lunch_noticed: "I saw the board but kept my usual. Tell me if I can take it away; then I'd try it.",
    lunch_away: "I'm rarely near the café at lunchtime. A box I could order ahead would change that.",
    price_kept: "The coffee is good and the staff know me. Twenty cents won't change that.",
    price_grumbled: "I'll keep coming, but I noticed. A loyalty card would make the new price easier to accept.",
    price_less: "I buy it less often now. A cheaper refill or a bring-your-own-cup discount would bring me back.",
    price_away: "I'm not here often enough to notice a price. A good coffee near the U-Bahn is what counts.",
  },
  de: {
    event: "Zwei Türen weiter eröffnet ein neues Café mit Mittagstisch für 8,50 €.",
    price_question: "Was wäre, wenn ich den Flat White um 20 Cent teurer mache, wenn der Mindestlohn am 1. Januar 2027 von 13,90 € auf 14,60 € steigt?",
    iv_lunch_q: "Was würde Sie nächste Woche wieder zum Mittagsangebot bringen?",
    iv_price_q: "Was würde Sie dazu bringen, Ihren Flat White weiter hier zu kaufen?",
    lunch_back: "Wenn es so schnell bleibt und die Suppe ab und zu wechselt, komme ich weiter. {price} ist fair für das, was ich bekomme.",
    lunch_once: "Vielleicht. Ich will wissen, was drin ist, bevor ich mich anstelle: Schreiben Sie die Tagessuppe auf die Tafel.",
    lunch_elsewhere: "Das neue Café war günstiger. Wenn Sie etwas hätten, das die nicht haben, jeden Tag eine vegetarische Suppe, käme ich wieder.",
    lunch_noticed: "Ich habe die Tafel gesehen, aber mein Übliches genommen. Sagen Sie mir, ob es das auch zum Mitnehmen gibt, dann probiere ich es.",
    lunch_away: "Mittags bin ich selten in der Nähe. Eine Box zum Vorbestellen würde das ändern.",
    price_kept: "Der Kaffee ist gut und man kennt mich hier. 20 Cent ändern daran nichts.",
    price_grumbled: "Ich komme weiter, aber ich habe es gemerkt. Eine Stempelkarte würde den neuen Preis leichter machen.",
    price_less: "Ich kaufe ihn jetzt seltener. Ein günstigerer Preis mit eigenem Becher würde mich zurückholen.",
    price_away: "Ich bin zu selten hier, um einen Preis zu bemerken. Mir zählt ein guter Kaffee nah an der U-Bahn.",
  },
  es: {
    event: "Abre un café nuevo a dos puertas con un menú de mediodía a 8,50 €.",
    price_question: "¿Y si subo el flat white 20 céntimos cuando el salario mínimo pase de 13,90 € a 14,60 € el 1 de enero de 2027?",
    iv_lunch_q: "¿Qué te haría volver por el menú de mediodía la semana que viene?",
    iv_price_q: "¿Qué haría que siguieras comprando aquí tu flat white?",
    lunch_back: "Si sigue siendo así de rápido y la sopa cambia de vez en cuando, seguiré viniendo. {price} me parece justo por lo que me dan.",
    lunch_once: "Quizá. Quiero saber qué lleva antes de hacer cola: escribid la sopa del día en la pizarra.",
    lunch_elsewhere: "El sitio nuevo era más barato. Si el vuestro tuviera algo que ellos no tienen, una sopa vegetariana cada día, volvería.",
    lunch_noticed: "Vi la pizarra, pero pedí lo de siempre. Dime si se puede llevar; entonces lo probaría.",
    lunch_away: "A mediodía casi nunca estoy cerca del café. Una caja para encargar antes lo cambiaría.",
    price_kept: "El café es bueno y aquí me conocen. Veinte céntimos no cambian eso.",
    price_grumbled: "Seguiré viniendo, pero lo he notado. Una tarjeta de fidelidad haría el nuevo precio más fácil de aceptar.",
    price_less: "Ahora lo compro menos. Un descuento si traigo mi propio vaso me haría volver.",
    price_away: "No vengo lo bastante como para fijarme en un precio. Lo que cuenta es un buen café cerca del U-Bahn.",
  },
  pl: {
    event: "Dwa lokale dalej otwiera się nowa kawiarnia z lunchem za 8,50 €.",
    price_question: "A gdyby podnieść cenę flat white o 20 centów, gdy płaca minimalna wzrośnie z 13,90 € do 14,60 € 1 stycznia 2027?",
    iv_lunch_q: "Co sprawiłoby, że w przyszłym tygodniu wrócisz na ofertę lunchową?",
    iv_price_q: "Co sprawiłoby, że dalej kupujesz tu swój flat white?",
    lunch_back: "Jeśli dalej będzie tak szybko, a zupa czasem się zmieni, będę przychodzić. {price} to uczciwa cena za to, co dostaję.",
    lunch_once: "Może. Chcę wiedzieć, co jest w zestawie, zanim stanę w kolejce: napiszcie zupę dnia na tablicy.",
    lunch_elsewhere: "Nowe miejsce jest tańsze. Jeśli u was będzie coś, czego tam nie ma, na przykład codziennie zupa wegetariańska, to wrócę.",
    lunch_noticed: "Tablica wisi, ale biorę to, co zawsze. Powiedz, czy można to wziąć na wynos, wtedy spróbuję.",
    lunch_away: "W porze lunchu rzadko jestem w pobliżu. Zestaw do zamówienia z wyprzedzeniem by to zmienił.",
    price_kept: "Kawa jest dobra, a tu mnie znają. Dwadzieścia centów tego nie zmieni.",
    price_grumbled: "Będę przychodzić, ale nowa cena rzuca się w oczy. Karta stałego klienta ułatwiłaby jej przyjęcie.",
    price_less: "Teraz kupuję rzadziej. Zniżka za własny kubek by mnie przyciągnęła z powrotem.",
    price_away: "Bywam tu za rzadko, żeby zauważyć cenę. Liczy się dobra kawa blisko U-Bahnu.",
  },
});

/** English text of the demo's owner event, kept for older call sites. */
export const DEMO_EVENT = T("event", {}, "en");

export function demoEvent(lang: Lang = getLang()): string {
  return T("event", {}, lang);
}

const PRICE_GRUMBLE = /grumble|pricey|complain|review/;

/** Interview answers follow what each imagined customer actually did, using the rehearsal's own action kinds. */
function answerFor(r: Rehearsal, p: Persona, lang: Lang, price: string): string {
  const acts = r.reactions.filter((x) => x.personaId === p.id && x.action !== "not_around").map((x) => x.action);
  if (!acts.length) return T(r.template === "price_change" ? "price_away" : "lunch_away", {}, lang);
  const kinds = acts.map(actionKind);
  const engaged = kinds.filter((k) => k === "engaged").length;
  const elsewhere = kinds.includes("elsewhere");
  if (r.template === "price_change") {
    if (elsewhere) return T("price_less", {}, lang);
    if (acts.some((a) => PRICE_GRUMBLE.test(a))) return T("price_grumbled", {}, lang);
    return T("price_kept", {}, lang);
  }
  if (engaged >= 2) return T("lunch_back", { price }, lang);
  if (elsewhere) return T("lunch_elsewhere", {}, lang);
  if (engaged === 1) return T("lunch_once", {}, lang);
  return T("lunch_noticed", {}, lang);
}

/** One post-run interview, answered by fixed rules from what each imagined customer did. */
function withInterview(r: Rehearsal, lang: Lang, price: string): Rehearsal {
  const q = T(r.template === "price_change" ? "iv_price_q" : "iv_lunch_q", {}, lang);
  const answers = r.personas.map((p) => ({ personaId: p.id, answer: answerFor(r, p, lang, price) }));
  const out = recordInterview(r, q, answers, "rule-based");
  return out.errors.length && !out.rehearsal.interviews.length ? r : out.rehearsal;
}

function priceText(n: number, lang: Lang): string {
  const locale = { de: "de-DE", en: "en-GB", es: "es-ES", pl: "pl-PL" }[lang];
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
}

export interface DemoOptions {
  /** false: numbers only, no rehearsal. */
  rehearsal?: boolean;
  seed?: number;
  /** Language of the analysis and every generated sentence (default: the current language). */
  lang?: Lang;
  /** true: the demo after the test, with counted results (the learning loop). */
  result?: boolean;
  /** false: leave out the demo interview. */
  interview?: boolean;
}

export function demoState(template: TemplateId = "lunch_offer", opts: DemoOptions = {}): ShareState {
  const lang = opts.lang ?? getLang();
  setLang(lang);
  const t = getTemplate(template, lang);
  const business = demoBusiness(lang);
  const inputs: Record<string, number | string> = { ...demoInputs(template, lang), kiez: DEMO_KIEZ };
  let question = t.exampleQuestion;
  if (template === "price_change") {
    // Berlin 2027: the minimum wage rises from €13.90 to €14.60 on 1 January (a dated fact, not advice).
    const now = typeof inputs.current_price === "number" ? inputs.current_price : 3.9;
    inputs.current_price = now;
    inputs.new_price = Math.round((now + 0.2) * 100) / 100;
    question = T("price_question", {}, lang);
  }
  const state: ShareState = { v: 1, template, inputs, demo: true, business, question, currency: "EUR", lang, madeBy: "demo" };
  if (opts.result) state.observed = { ...DEMO_OBSERVED[template] };
  if (opts.rehearsal === false) return state;
  try {
    const analyzeOpts = { demo: true, business, question, currency: "EUR", lang };
    const a = analyze(template, inputs, analyzeOpts);
    let r = startRehearsal(a, { seed: opts.seed ?? DEMO_SEEDS[template] });
    // Play two rounds, then show "variable injection": an event added before round 3.
    for (let guard = 0; guard < 4 && r.status !== "done" && r.currentRound < 3; guard++) {
      const out = submitRound(r, ruleBasedReactions(r), "rule-based");
      if (out.rehearsal.currentRound === r.currentRound) break;
      r = out.rehearsal;
    }
    if (template === "lunch_offer" && r.status !== "done" && r.currentRound === 3) r = injectEvent(r, DEMO_EVENT_ID);
    r = autoplayRehearsal(r);
    if (opts.interview !== false && r.status === "done") {
      const price = priceText(Number(template === "price_change" ? inputs.new_price : inputs.offer_price) || 0, lang);
      r = withInterview(r, lang, price);
    }
    state.rehearsal = toShareRehearsal(r);
  } catch {
    // The rehearsal is optional: the demo still shows steps 1–4 and 6 without it.
  }
  return state;
}

export function demoToken(template: TemplateId = "lunch_offer", opts: DemoOptions = {}): string {
  return encodeState(demoState(template, opts));
}
