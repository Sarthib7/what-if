/**
 * The site's live demos: ShareStates for the made-up café in Berlin-Neukölln,
 * with a rehearsal played by the rule-based stand-in (no model), so "See the
 * demo" needs no server and no AI. Browser-safe.
 *
 *   demoState("lunch_offer")                     weekday lunch deal (+ an owner event, + one interview)
 *   demoState("price_change")                    flat white +€0.20 when the minimum wage rises on 1 Jan 2027
 *   demoState("lunch_offer", { result: true })   the same demo after the test, with counted results
 *   loadAiDemo()                                 the lunch demo whose rehearsal Claude played (src/report/demo-ai.json)
 *
 * The rule-based interview answers are written by fixed rules from each imagined
 * customer's own rehearsal (what they did, where they went, who they heard it from)
 * and their quirk, never by a model; no sentence repeats within one interview.
 * ruleInterview() gives the same interview to any rule-based rehearsal (the /try reports).
 */
import { DEMO_KIEZ } from "../engine/berlin.ts";
import { analyze, demoInputs, getTemplate } from "../engine/index.ts";
import { demoBusiness } from "../engine/templates.ts";
import type { TemplateId } from "../engine/types.ts";
import { getLang, makeT, setLang } from "../i18n/index.ts";
import type { Lang } from "../i18n/index.ts";
import { actionKind, autoplayRehearsal, DEMO_EVENT_ID, DEMO_SEEDS, injectEvent, recordInterview, ruleBasedReactions, startRehearsal, submitRound, toShareRehearsal } from "../sim/index.ts";
import { ARCHETYPE_TEXT, FRIEND, PLACES, PRONOUNS, fillText } from "../sim/messages.ts";
import { placeIdFor } from "../sim/personas.ts";
import type { Persona, Reaction, Rehearsal } from "../sim/types.ts";
import { encodeState } from "../state.ts";
import type { ShareState } from "../state.ts";

/** The demo café's Kiez (one of BERLIN_KIEZE). */
export { DEMO_KIEZ };

/** Seeds picked for a full story, the same in de, en, es and pl (owned and chosen by src/sim/berlin.ts). */
export { DEMO_SEEDS };

/** Counted results for the "after the test" demo (made up, labelled as demo data in the report). */
export const DEMO_OBSERVED: Record<TemplateId, Record<string, number>> = {
  lunch_offer: { baseline_lunch_customers: 38, test_lunch_customers: 44, redemptions_per_day: 14, days_run: 10, actual_setup_cost: 180 },
  price_change: { units_before_per_week: 620, units_after_per_week: 603, days_run: 14 },
};

/** The price demo's staff hours paid at the minimum wage: the 2027 rise (€13.90 → €14.60) costs 60 × €0.70 a week. */
export const DEMO_MIN_WAGE_HOURS = 60;

type K = "event" | "price_question" | "iv_lunch_q" | "iv_price_q";

const T = makeT<K>({
  en: {
    event: "A new café opens two doors down with an €8.50 lunch.",
    price_question: "What if I put my flat white up by 20 cents when the minimum wage rises from €13.90 to €14.60 on 1 January 2027? My staff work {hours} minimum-wage hours a week.",
    iv_lunch_q: "What would make you come back for the lunch deal next week?",
    iv_price_q: "What would keep you buying your {item} here?",
  },
  de: {
    event: "Zwei Türen weiter eröffnet ein neues Café mit Mittagstisch für 8,50 €.",
    price_question: "Was wäre, wenn ich den Flat White um 20 Cent teurer mache, wenn der Mindestlohn am 1. Januar 2027 von 13,90 € auf 14,60 € steigt? Mein Team arbeitet {hours} Stunden pro Woche zum Mindestlohn.",
    iv_lunch_q: "Was würde Sie nächste Woche wieder zum Mittagsangebot bringen?",
    iv_price_q: "Was würde Sie dazu bringen, auch zum neuen Preis weiter hier zu kaufen?",
  },
  es: {
    event: "Abre un café nuevo a dos puertas con un menú de mediodía a 8,50 €.",
    price_question: "¿Y si subo el flat white 20 céntimos cuando el salario mínimo pase de 13,90 € a 14,60 € el 1 de enero de 2027? Mi equipo trabaja {hours} horas a la semana con el salario mínimo.",
    iv_lunch_q: "¿Qué te haría volver por el menú de mediodía la semana que viene?",
    iv_price_q: "¿Qué haría que siguieras comprando aquí tu {item}?",
  },
  pl: {
    event: "Dwa lokale dalej otwiera się nowa kawiarnia z lunchem za 8,50 €.",
    price_question: "A gdyby podnieść cenę flat white o 20 centów, gdy płaca minimalna wzrośnie z 13,90 € do 14,60 € 1 stycznia 2027? Mój zespół pracuje {hours} godzin tygodniowo za płacę minimalną.",
    iv_lunch_q: "Co sprawiłoby, że w przyszłym tygodniu wrócisz na ofertę lunchową?",
    iv_price_q: "Co sprawiłoby, że dalej będziesz tu kupować, także po nowej cenie?",
  },
});

/** English text of the demo's owner event, kept for older call sites. */
export const DEMO_EVENT = T("event", {}, "en");

export function demoEvent(lang: Lang = getLang()): string {
  return T("event", {}, lang);
}

/* ================================================================== rule-based interview */

type L4 = Record<Lang, string>;
const x4 = (en: string, de: string, es: string, pl: string): L4 => ({ en, de, es, pl });

/*
 * Grammar helpers inside these texts: {g:male|female} follows the speaker (Polish past tense),
 * {t:male|female} the person they heard it from; {name}, {friend}, {alt_at}, {alt_to}, {times},
 * {price} and {usual} are filled from the persona's own rehearsal.
 */

/** What happened to this person, one sentence each (two variants, so two people never say the same words). */
const FACT = {
  // ---- lunch deal
  ateMany: [
    x4("I've had the deal {times} now.", "Ich hatte das Angebot jetzt {times}.", "Ya he pedido el menú {times}.", "{g:Brałem|Brałam} już ten zestaw {times}."),
    x4("I've been back for it {times}.", "Ich war {times} wegen des Angebots da.", "He vuelto {times} por el menú.", "{g:Wracałem|Wracałam} po ten zestaw {times}."),
    x4("I've ordered it {times} so far.", "Bisher habe ich es {times} bestellt.", "Hasta ahora lo he pedido {times}.", "Jak dotąd {g:zamawiałem|zamawiałam} go {times}."),
  ],
  ateOnce: [
    x4("I tried the deal once.", "Ich habe das Angebot einmal probiert.", "Probé el menú una vez.", "{g:Spróbowałem|Spróbowałam} zestawu raz."),
    x4("I had it one time.", "Einmal habe ich es gegessen.", "Lo comí una vez.", "{g:Jadłem|Jadłam} go raz."),
    x4("So far I've had it once.", "Bisher hatte ich es einmal.", "Hasta ahora lo he pedido una vez.", "Jak dotąd {g:brałem|brałam} go raz."),
  ],
  notYet: [
    x4("I haven't eaten it myself yet.", "Selbst gegessen habe ich es noch nicht.", "Yo todavía no lo he probado.", "{g:Sam|Sama} jeszcze go nie {g:jadłem|jadłam}."),
    x4("I haven't had it myself.", "Ich selbst hatte es noch nicht.", "Yo no lo he comido.", "{g:Sam|Sama} go nie {g:próbowałem|próbowałam}."),
    x4("I still haven't ordered it.", "Bestellt habe ich es bisher nicht.", "Aún no lo he pedido.", "Jeszcze go nie {g:zamawiałem|zamawiałam}."),
  ],
  cheaper: [
    x4("{price} is less than the {usual} I usually spend.", "{price} ist weniger als meine üblichen {usual}.", "{price} es menos que los {usual} que suelo gastar.", "{price} to mniej niż moje zwykłe {usual}."),
  ],
  dearer: [
    x4("{price} is more than I usually spend, but it's worth it.", "{price} ist mehr, als ich sonst ausgebe, aber es lohnt sich.", "{price} es más de lo que suelo gastar, pero merece la pena.", "{price} to więcej, niż zwykle wydaję, ale warto."),
  ],
  /** Heard it from someone who ate the deal. */
  heardFan: [
    x4("{name} has been raving about it.", "{name} schwärmt davon.", "{name} no para de hablar de él.", "{name} ciągle o nim opowiada."),
    x4("{name} recommends it too.", "{name} empfiehlt es auch.", "{name} también lo recomienda.", "{name} też go poleca."),
  ],
  /** Heard it from someone who only talked about it. */
  heardMention: [
    x4("{name} keeps mentioning it too.", "{name} erwähnt es auch ständig.", "{name} también lo menciona a todas horas.", "{name} też ciągle o nim wspomina."),
    x4("{name} told me about it.", "{name} hat mir davon erzählt.", "{name} me habló de él.", "{name} mi o nim {t:opowiedział|opowiedziała}."),
  ],
  told: [
    x4("I told {friend} about it.", "Ich habe {friend} davon erzählt.", "Se lo conté {friend}.", "{g:Opowiedziałem|Opowiedziałam} o tym {friend}."),
    x4("I mentioned it to {friend}.", "Ich habe es {friend} weitergesagt.", "Se lo comenté {friend}.", "{g:Wspomniałem|Wspomniałam} o tym {friend}."),
  ],
  review: [
    x4("I even wrote a few lines about it online.", "Ich habe sogar ein paar Zeilen online darüber geschrieben.", "Incluso escribí unas líneas en internet.", "{g:Napisałem|Napisałam} nawet kilka zdań w internecie."),
  ],
  complained: [
    x4("I did complain about it.", "Beschwert habe ich mich auch.", "También me quejé.", "{g:Poskarżyłem|Poskarżyłam} się też."),
  ],
  elsewhere: [
    x4("I got my lunch at {alt_at} instead.", "Ich habe mir stattdessen {alt_at} etwas geholt.", "En lugar de eso comí {alt_at}.", "Zamiast tego {g:jadłem|jadłam} {alt_at}."),
    x4("A few times I went to {alt_to}.", "Ein paar Mal bin ich {alt_to} gegangen.", "Algunas veces fui {alt_to}.", "Kilka razy {g:poszedłem|poszłam} {alt_to}."),
  ],
  rivalWhy: [
    x4("The new place is hard to miss.", "Das neue Café ist kaum zu übersehen.", "El café nuevo no pasa desapercibido.", "Nowej kawiarni nie da się przeoczyć."),
  ],
  home: [
    x4("Most days I brought lunch from home.", "Meistens hatte ich etwas von zu Hause dabei.", "Casi siempre me traje la comida de casa.", "Zwykle {g:przynosiłem|przynosiłam} jedzenie z domu."),
    x4("Eating out every day adds up, so I often brought my own.", "Jeden Tag auswärts essen läppert sich, also habe ich oft etwas mitgebracht.", "Comer fuera cada día suma, así que a menudo me traía algo.", "Jedzenie na mieście codziennie się sumuje, więc często {g:brałem|brałam} coś z domu."),
  ],
  usual: [
    x4("I stuck to my usual order.", "Ich bin bei meinem Üblichen geblieben.", "Me quedé con lo de siempre.", "{g:Zostałem|Zostałam} przy tym, co zwykle."),
    x4("I looked at the deal and still ordered what I always have.", "Ich habe aufs Angebot geschaut und doch mein Übliches bestellt.", "Miré el menú y aun así pedí lo de siempre.", "{g:Spojrzałem|Spojrzałam} na zestaw, ale i tak {g:zamówiłem|zamówiłam} to, co zawsze."),
  ],
  backToUsual: [
    x4("After that I went back to my usual.", "Danach bin ich wieder bei meinem Üblichen gelandet.", "Después volví a lo de siempre.", "Potem {g:wróciłem|wróciłam} do tego, co zwykle."),
  ],
  noticed: [
    x4("I saw the board and filed it under 'maybe'.", "Die Tafel habe ich gesehen und unter „vielleicht“ abgelegt.", "Vi la pizarra y lo dejé en «quizá».", "{g:Widziałem|Widziałam} tablicę i {g:odłożyłem|odłożyłam} to na „może”."),
    x4("I noticed the board, but didn't stop.", "Die Tafel ist mir aufgefallen, aber ich bin nicht stehen geblieben.", "Me fijé en la pizarra, pero no me paré.", "{g:Zauważyłem|Zauważyłam} tablicę, ale się nie {g:zatrzymałem|zatrzymałam}."),
  ],
  ignored: [
    x4("To be honest, I hardly noticed the board.", "Ehrlich gesagt habe ich die Tafel kaum wahrgenommen.", "La verdad, casi no me fijé en la pizarra.", "Szczerze mówiąc, ledwo {g:zauważyłem|zauważyłam} tablicę."),
    x4("There are boards everywhere round here; I don't read them all.", "Hier stehen überall Tafeln; ich lese nicht alle.", "Aquí hay pizarras por todas partes; no las leo todas.", "Tu wszędzie stoją tablice; nie czytam wszystkich."),
  ],
  forgot: [
    x4("By the end I'd forgotten about it.", "Am Ende hatte ich es vergessen.", "Al final se me olvidó.", "Pod koniec już o tym {g:zapomniałem|zapomniałam}."),
    x4("Honestly, it slipped my mind.", "Ehrlich gesagt ist es mir entfallen.", "La verdad, se me fue de la cabeza.", "Szczerze mówiąc, wyleciało mi to z głowy."),
  ],
  away: [
    x4("I was hardly near the café during the test.", "Während des Tests war ich kaum in der Nähe des Cafés.", "Durante la prueba casi no pasé por el café.", "W czasie testu prawie nie {g:bywałem|bywałam} w pobliżu kawiarni."),
    x4("I wasn't around much those weeks.", "In diesen Wochen war ich selten da.", "Esas semanas apenas estuve por aquí.", "W tych tygodniach rzadko tu {g:bywałem|bywałam}."),
  ],
  // ---- price change
  kept: [
    x4("I still buy here, same as before.", "Ich kaufe weiter hier, wie vorher.", "Sigo comprando aquí como antes.", "Dalej kupuję tutaj, tak jak wcześniej."),
    x4("Nothing changed for me: same time, same order.", "Für mich hat sich nichts geändert: gleiche Zeit, gleiche Bestellung.", "Para mí no ha cambiado nada: misma hora, mismo pedido.", "U mnie nic się nie zmieniło: ta sama pora, to samo zamówienie."),
    x4("I just kept ordering as always.", "Ich habe einfach weiter bestellt, wie immer.", "Seguí pidiendo como siempre.", "Po prostu dalej {g:zamawiałem|zamawiałam} jak zawsze."),
    x4("I still come in at my usual times.", "Ich komme weiter zu meinen üblichen Zeiten.", "Sigo viniendo a mis horas de siempre.", "Dalej przychodzę o swoich zwykłych porach."),
  ],
  noticedNot: [
    x4("I didn't even notice the new price at first.", "Den neuen Preis habe ich anfangs gar nicht bemerkt.", "Al principio ni me di cuenta del precio nuevo.", "Na początku nawet nie {g:zauważyłem|zauważyłam} nowej ceny."),
    x4("The new price only caught my eye after a while.", "Der neue Preis ist mir erst nach einer Weile aufgefallen.", "El precio nuevo solo me llamó la atención al cabo de un tiempo.", "Nowa cena rzuciła mi się w oczy dopiero po jakimś czasie."),
  ],
  grumbled: [
    x4("I did grumble about the price out loud.", "Über den Preis habe ich laut gemeckert.", "Me quejé del precio en voz alta.", "Głośno {g:narzekałem|narzekałam} na cenę."),
  ],
  toldPricey: [
    x4("I told {friend} it has got more expensive.", "Ich habe {friend} gesagt, dass es teurer geworden ist.", "Comenté {friend} que ha subido de precio.", "{g:Powiedziałem|Powiedziałam} {friend}, że podrożało."),
  ],
  priceReview: [
    x4("I mentioned the price in a review.", "In einer Bewertung habe ich den Preis erwähnt.", "Mencioné el precio en una reseña.", "{g:Wspomniałem|Wspomniałam} o cenie w opinii."),
  ],
  /** Recommended the café after grumbling about the price. */
  recommendAnyway: [
    x4("I still recommended the café to {friend}.", "Ich habe das Café trotzdem {friend} empfohlen.", "Aun así recomendé el café {friend}.", "Mimo to {g:poleciłem|poleciłam} kawiarnię {friend}."),
    x4("I'd still call it the best coffee round here.", "Für mich ist es immer noch der beste Kaffee hier.", "Para mí sigue siendo el mejor café de por aquí.", "Dla mnie to wciąż najlepsza kawa w okolicy."),
  ],
  recommend: [
    x4("I recommended the café to {friend}.", "Ich habe das Café {friend} empfohlen.", "Recomendé el café {friend}.", "{g:Poleciłem|Poleciłam} kawiarnię {friend}."),
    x4("For me it's still the best coffee round here.", "Für mich ist es der beste Kaffee hier in der Gegend.", "Para mí es el mejor café de la zona.", "Dla mnie to najlepsza kawa w okolicy."),
  ],
  heardPos: [
    x4("{name} still swears by this place.", "{name} schwört auch noch auf das Café hier.", "{name} también sigue confiando en este sitio.", "{name} też wciąż zachwala to miejsce."),
  ],
  heardNeg: [
    x4("{name} said it had got expensive, and there's something in that.", "{name} meinte, es sei teuer geworden, und da ist was dran.", "{name} dijo que se había puesto caro, y algo de razón tiene.", "{name} {t:mówił|mówiła}, że podrożało, i coś w tym jest."),
  ],
  less: [
    x4("I come in less often now.", "Ich komme jetzt seltener.", "Ahora vengo menos.", "Teraz przychodzę rzadziej."),
    x4("I buy less than before.", "Ich kaufe weniger als vorher.", "Compro menos que antes.", "Kupuję mniej niż wcześniej."),
  ],
  cheaperItem: [
    x4("I switched to something cheaper on the menu.", "Ich nehme jetzt öfter etwas Günstigeres von der Karte.", "Me he pasado a algo más barato de la carta.", "{g:Przerzuciłem|Przerzuciłam} się na coś tańszego z karty."),
  ],
  priceElsewhere: [
    x4("Now I often get it at {alt_at}.", "Jetzt hole ich mir oft etwas {alt_at}.", "Ahora a menudo compro {alt_at}.", "Teraz często kupuję {alt_at}."),
    x4("A few times I went to {alt_to} instead.", "Ein paar Mal bin ich stattdessen {alt_to} gegangen.", "Algunas veces fui {alt_to}.", "Kilka razy {g:poszedłem|poszłam} {alt_to}."),
  ],
  priceForgot: [
    x4("After a few days I stopped thinking about the price.", "Nach ein paar Tagen habe ich nicht mehr an den Preis gedacht.", "A los pocos días dejé de pensar en el precio.", "Po kilku dniach {g:przestałem|przestałam} myśleć o cenie."),
  ],
  priceAway: [
    x4("I was rarely in during those weeks.", "In den Wochen war ich kaum hier.", "Esas semanas casi no vine.", "W tamtych tygodniach rzadko tu {g:zaglądałem|zaglądałam}."),
  ],
} satisfies Record<string, L4[]>;

type FactId = keyof typeof FACT;

/** How the answer ends, after the wish ("If …, I'll be back next week."). */
const CLOSE = {
  back: x4("I'll be back next week", "komme ich nächste Woche wieder", "vuelvo la semana que viene", "wrócę w przyszłym tygodniu"),
  keep: x4("I'll keep coming", "bleibe ich dabei", "sigo viniendo", "nadal będę przychodzić"),
  try: x4("I'll give it a go next week", "probiere ich es nächste Woche", "lo pruebo la semana que viene", "spróbuję w przyszłym tygodniu"),
  yours: x4("I'll try yours", "probiere ich es bei Ihnen", "lo pruebo en vuestro café", "spróbuję u was"),
  stay: x4("I'll keep buying it here", "bleibe ich gern dabei", "sigo comprándolo aquí", "nadal będę tu kupować"),
  more: x4("I'd buy it here more often again", "kaufe ich wieder öfter hier", "vuelvo a comprarlo aquí más a menudo", "znowu będę tu kupować częściej"),
  visit: x4("I'd stop by more often", "komme ich öfter vorbei", "paso más a menudo", "będę wpadać częściej"),
} satisfies Record<string, L4>;

interface Wish {
  /** Matches the persona's quirk in English (src/sim/messages.ts ARCHETYPE_TEXT). */
  re: RegExp;
  lunch: L4;
  price: L4;
  /** Lunch: used instead when the deal costs no more than the persona usually spends. */
  lunchCheap?: L4;
}

/** What would bring them back, from their quirk: an "if" clause that the closing finishes. */
const WISHES: Wish[] = [
  // office worker
  { re: /thirty minutes/, lunch: x4("If I'm in and out in twenty minutes", "Wenn ich in zwanzig Minuten wieder draußen bin", "Si en veinte minutos estoy otra vez fuera", "Jeśli zjem i wyjdę w dwadzieścia minut"), price: x4("If I never have to queue for it", "Wenn ich dafür nie anstehen muss", "Si nunca tengo que hacer cola", "Jeśli nie {g:będę musiał|będę musiała} stać w kolejce") },
  { re: /same thing until/, lunch: x4("If my usual sandwich stays on the menu next to the deal", "Wenn mein übliches Sandwich neben dem Angebot auf der Karte bleibt", "Si mi bocadillo de siempre sigue en la carta junto al menú", "Jeśli moja zwykła kanapka zostanie w karcie obok zestawu"), price: x4("If nothing else on my order changes", "Wenn sich sonst nichts an meiner Bestellung ändert", "Si no cambia nada más de mi pedido", "Jeśli nic więcej w moim zamówieniu się nie zmieni") },
  { re: /by card/, lunch: x4("If I can pay for the deal by card", "Wenn ich auch das Angebot mit Karte zahlen kann", "Si puedo pagar el menú con tarjeta", "Jeśli za zestaw da się zapłacić kartą"), price: x4("If paying by card stays quick at the till", "Wenn das Kartenzahlen an der Kasse schnell bleibt", "Si pagar con tarjeta sigue siendo rápido", "Jeśli płatność kartą dalej będzie szybka") },
  { re: /Google Maps/, lunch: x4("If the deal shows up on Google Maps with a photo", "Wenn das Angebot mit Foto auf Google Maps steht", "Si el menú aparece en Google Maps con una foto", "Jeśli zestaw będzie w Mapach Google ze zdjęciem"), price: x4("If the reviews on Google Maps stay this good", "Wenn die Bewertungen auf Google Maps so gut bleiben", "Si las reseñas en Google Maps siguen así de buenas", "Jeśli opinie w Mapach Google dalej będą takie dobre") },
  { re: /back for a colleague/, lunch: x4("If I can take a second one away for a colleague", "Wenn ich ein zweites für einen Kollegen mitnehmen kann", "Si puedo llevarme otro para un compañero", "Jeśli {g:będę mógł|będę mogła} wziąć drugi zestaw dla kolegi"), price: x4("If ordering one for a colleague too makes it a bit cheaper", "Wenn es günstiger wird, sobald ich für den Kollegen mitbestelle", "Si al pedir también para un compañero sale algo más barato", "Jeśli przy zamówieniu też dla kolegi zapłacę trochę mniej") },
  // freelancer
  { re: /power socket/, lunch: x4("If I can stay at the socket table with my laptop after lunch", "Wenn ich nach dem Essen mit dem Laptop am Tisch mit Steckdose sitzen bleiben darf", "Si después de comer puedo quedarme con el portátil en la mesa del enchufe", "Jeśli po lunchu {g:będę mógł|będę mogła} zostać z laptopem przy stoliku z gniazdkiem"), price: x4("If I can keep working at the socket table for an hour", "Wenn ich weiter eine Stunde am Tisch mit Steckdose arbeiten darf", "Si puedo seguir trabajando una hora en la mesa del enchufe", "Jeśli nadal {g:będę mógł|będę mogła} pracować godzinę przy stoliku z gniazdkiem") },
  { re: /photographs food/, lunch: x4("If it looks as good as it sounds on the board", "Wenn es so gut aussieht, wie es auf der Tafel klingt", "Si tiene tan buena pinta como suena en la pizarra", "Jeśli będzie wyglądać tak dobrze, jak brzmi na tablicy"), price: x4("If it still looks as good as it tastes", "Wenn es weiter so gut aussieht, wie es schmeckt", "Si sigue teniendo tan buena pinta como sabor", "Jeśli dalej będzie wyglądać tak dobrze, jak smakuje") },
  { re: /invoices/, lunch: x4("If there's a ten-lunch card I can buy when an invoice comes in", "Wenn es eine Zehnerkarte gibt, die ich nach einer bezahlten Rechnung kaufen kann", "Si hay un bono de diez menús que pueda comprar cuando me paguen una factura", "Jeśli będzie karnet na dziesięć lunchy, który kupię, gdy wpłynie faktura"), price: x4("If there's a card that makes every tenth one free", "Wenn es eine Stempelkarte gibt, bei der jeder zehnte gratis ist", "Si hay una tarjeta con la que el décimo sale gratis", "Jeśli będzie karta, na której co dziesiąty jest gratis") },
  { re: /oat milk/, lunch: x4("If the drink in the deal can come with oat milk at no extra cost", "Wenn das Getränk im Angebot auch mit Hafermilch geht, ohne Aufpreis", "Si la bebida del menú puede ser con leche de avena sin coste extra", "Jeśli napój w zestawie może być z mlekiem owsianym bez dopłaty"), price: x4("If oat milk doesn't cost extra on top", "Wenn die Hafermilch nicht noch extra kostet", "Si la leche de avena no se cobra aparte", "Jeśli mleko owsiane nie będzie dodatkowo płatne") },
  { re: /nods instead/, lunch: x4("If I can just point at the deal on the board and nod", "Wenn ich einfach auf das Angebot an der Tafel zeigen und nicken kann", "Si puedo señalar el menú en la pizarra y asentir, sin más", "Jeśli wystarczy pokazać zestaw na tablicy i kiwnąć głową"), price: x4("If ordering stays a quick nod at the till", "Wenn Bestellen an der Kasse ein kurzes Nicken bleibt", "Si pedir sigue siendo un gesto rápido en la caja", "Jeśli zamawianie dalej będzie tylko szybkim skinieniem przy kasie") },
  // student
  { re: /flatmate/, lunch: x4("If two of us can share one deal with an extra bowl", "Wenn wir uns zu zweit ein Angebot mit einer extra Schale teilen können", "Si dos podemos compartir un menú con un cuenco extra", "Jeśli we dwoje podzielimy się zestawem z dodatkową miseczką"), price: x4("If there's a deal for two", "Wenn es ein Angebot für zwei gibt", "Si hay una oferta para dos", "Jeśli będzie oferta dla dwóch osób") },
  { re: /student discount/, lunch: x4("If there's a student price, even just 50 cents off", "Wenn es einen Studipreis gibt, auch nur 50 Cent weniger", "Si hay precio de estudiante, aunque sean 50 céntimos menos", "Jeśli będzie cena studencka, choćby 50 centów mniej"), price: x4("If students get a few cents off with their card", "Wenn es mit Studiausweis ein paar Cent weniger kostet", "Si con el carné de estudiante cuesta unos céntimos menos", "Jeśli z legitymacją studencką będzie kilka centów taniej") },
  {
    re: /counts coins/,
    lunch: x4("If it's ever under {usual}, what I normally spend", "Wenn es mal unter {usual} kostet, was ich sonst ausgebe", "Si alguna vez baja de {usual}, lo que suelo gastar", "Jeśli kiedyś będzie poniżej {usual}, tyle, ile zwykle wydaję"),
    lunchCheap: x4("If the price stays at {price}", "Wenn der Preis bei {price} bleibt", "Si el precio se queda en {price}", "Jeśli cena zostanie na poziomie {price}"),
    price: x4("If the price stays a round number I can pay in coins", "Wenn der Preis eine runde Summe bleibt, die ich in Münzen zahlen kann", "Si el precio sigue siendo redondo para pagar con monedas", "Jeśli cena będzie okrągła, żeby zapłacić monetami"),
  },
  { re: /always wearing headphones/, lunch: x4("If the deal is written big enough to read without asking", "Wenn das Angebot so groß dasteht, dass ich nicht fragen muss", "Si el menú está escrito tan grande que no tenga que preguntar", "Jeśli zestaw będzie napisany tak duży, że nie trzeba będzie pytać"), price: x4("If I can order on the way past without a chat", "Wenn ich im Vorbeigehen bestellen kann, ohne viel zu reden", "Si puedo pedir al pasar sin tener que charlar", "Jeśli {g:będę mógł|będę mogła} zamówić w przelocie, bez rozmowy") },
  { re: /cheapest thing/, lunch: x4("If the soup on its own is cheaper", "Wenn es die Suppe auch allein günstiger gibt", "Si la sopa sola sale más barata", "Jeśli sama zupa będzie tańsza"), price: x4("If I can still make one cup last all afternoon", "Wenn ich mit einem Getränk weiter den Nachmittag sitzen darf", "Si puedo seguir pasando la tarde con una sola consumición", "Jeśli dalej {g:będę mógł|będę mogła} siedzieć całe popołudnie nad jedną kawą") },
  // parent
  { re: /pram/, lunch: x4("If there's room for the pram at lunchtime", "Wenn mittags Platz für den Kinderwagen ist", "Si a mediodía hay sitio para el carrito", "Jeśli w porze lunchu będzie miejsce na wózek"), price: x4("If there's still room for the pram", "Wenn weiter Platz für den Kinderwagen ist", "Si sigue habiendo sitio para el carrito", "Jeśli dalej będzie miejsce na wózek") },
  { re: /nuts/, lunch: x4("If the board says which dishes contain nuts", "Wenn auf der Tafel steht, was Nüsse enthält", "Si la pizarra dice qué lleva frutos secos", "Jeśli na tablicy będzie napisane, co zawiera orzechy"), price: x4("If you keep telling me what has nuts in it", "Wenn Sie mir weiter sagen, was Nüsse enthält", "Si me seguís diciendo qué lleva frutos secos", "Jeśli dalej będziecie mówić, co zawiera orzechy") },
  { re: /half past two/, lunch: x4("If I can be done before half past two", "Wenn ich vor halb drei fertig bin", "Si puedo acabar antes de las dos y media", "Jeśli zdążę przed wpół do trzeciej"), price: x4("If it's still quick before the nursery pick-up", "Wenn es vor dem Kita-Abholen schnell geht", "Si sigue siendo rápido antes de recoger a los niños", "Jeśli dalej będzie szybko przed odbiorem dziecka z przedszkola") },
  { re: /orders for two/, lunch: x4("If there's a small children's portion to go with it", "Wenn es eine kleine Kinderportion dazu gibt", "Si hay una ración pequeña para niños", "Jeśli będzie mała porcja dla dziecka"), price: x4("If a small one for the kids comes cheaper", "Wenn es eine kleine Größe für die Kinder günstiger gibt", "Si hay uno pequeño más barato para los niños", "Jeśli będzie tańszy mały rozmiar dla dzieci") },
  // regular
  { re: /staff by name/, lunch: x4("If the same team keeps serving it", "Wenn das gleiche Team es weiter serviert", "Si lo sigue sirviendo el mismo equipo", "Jeśli dalej będzie go podawać ta sama ekipa"), price: x4("If the team stays the same", "Wenn das Team so bleibt", "Si el equipo sigue siendo el mismo", "Jeśli ekipa się nie zmieni") },
  { re: /dislikes changes/, lunch: x4("If the rest of the menu stays as it is", "Wenn der Rest der Karte bleibt, wie er ist", "Si el resto de la carta se queda como está", "Jeśli reszta karty zostanie bez zmian"), price: x4("If that's the only change for a while", "Wenn das für eine Weile die einzige Änderung bleibt", "Si es el único cambio en una temporada", "Jeśli na jakiś czas to będzie jedyna zmiana") },
  { re: /leaves the change/, lunch: x4("If I can keep paying cash and rounding up", "Wenn ich weiter bar zahlen und aufrunden kann", "Si puedo seguir pagando en efectivo y redondeando", "Jeśli dalej {g:będę mógł|będę mogła} płacić gotówką i zaokrąglać"), price: x4("If the new price still rounds up nicely in cash", "Wenn sich der neue Preis bar gut aufrunden lässt", "Si el precio nuevo se redondea bien en efectivo", "Jeśli nową cenę da się ładnie zaokrąglić gotówką") },
  { re: /reads the paper/, lunch: x4("If my chair is free at lunchtime too", "Wenn mein Stuhl auch mittags frei ist", "Si mi silla también está libre a mediodía", "Jeśli moje krzesło będzie wolne także w porze lunchu"), price: x4("If the paper and my chair are still there", "Wenn die Zeitung und mein Stuhl bleiben", "Si el periódico y mi silla siguen ahí", "Jeśli gazeta i moje krzesło zostaną") },
  // tourist
  { re: /every review/, lunch: x4("If other people's reviews of the deal are good", "Wenn die Bewertungen zum Angebot gut sind", "Si las reseñas del menú son buenas", "Jeśli opinie o zestawie będą dobre"), price: x4("If the reviews keep saying it's worth it", "Wenn die Bewertungen weiter sagen, dass es sich lohnt", "Si las reseñas siguen diciendo que merece la pena", "Jeśli opinie dalej będą mówić, że warto") },
  { re: /photos of chalkboards/, lunch: x4("If the board is as pretty as the food", "Wenn die Tafel so schön ist wie das Essen", "Si la pizarra es tan bonita como la comida", "Jeśli tablica będzie tak ładna jak jedzenie"), price: x4("If the board keeps looking this good", "Wenn die Tafel weiter so schön aussieht", "Si la pizarra sigue así de bonita", "Jeśli tablica dalej będzie tak ładna") },
  { re: /speaks English/, lunch: x4("If the board says it in English too", "Wenn die Tafel es auch auf Englisch sagt", "Si la pizarra también lo dice en inglés", "Jeśli tablica powie to też po angielsku"), price: x4("If the menu stays easy to read in English", "Wenn die Karte auch auf Englisch leicht zu lesen bleibt", "Si la carta sigue siendo fácil de leer en inglés", "Jeśli karta dalej będzie łatwa do przeczytania po angielsku") },
  { re: /like a local/, lunch: x4("If the deal has something properly Berlin in it", "Wenn im Angebot etwas typisch Berlinerisches steckt", "Si el menú tiene algo típico de Berlín", "Jeśli w zestawie będzie coś typowo berlińskiego"), price: x4("If the locals keep ordering here", "Wenn die Leute von hier weiter hier bestellen", "Si la gente del barrio sigue pidiendo aquí", "Jeśli miejscowi dalej będą tu zamawiać") },
  // retiree
  { re: /^pays in coins/, lunch: x4("If I can pay in coins without holding up the queue", "Wenn ich in Münzen zahlen kann, ohne die Schlange aufzuhalten", "Si puedo pagar con monedas sin hacer esperar a la cola", "Jeśli zapłacę monetami i nie zatrzymam kolejki"), price: x4("If the new price is easy to count out in coins", "Wenn sich der neue Preis leicht in Münzen abzählen lässt", "Si el precio nuevo es fácil de contar en monedas", "Jeśli nową cenę łatwo będzie odliczyć w monetach") },
  { re: /with glasses/, lunch: x4("If the board is written large enough to read with my glasses", "Wenn die Tafel so groß beschriftet ist, dass ich sie mit Brille lesen kann", "Si la pizarra tiene letra grande para leerla con gafas", "Jeśli na tablicy będzie pisane tak dużo, że przeczytam w okularach"), price: x4("If the prices on the board stay big and clear", "Wenn die Preise auf der Tafel groß und klar bleiben", "Si los precios de la pizarra siguen grandes y claros", "Jeśli ceny na tablicy dalej będą duże i wyraźne") },
  { re: /portions shrink/, lunch: x4("If the bowl stays as full as on the first day", "Wenn die Schale so voll bleibt wie am ersten Tag", "Si el cuenco sigue tan lleno como el primer día", "Jeśli miska będzie tak pełna jak pierwszego dnia"), price: x4("If the portion doesn't shrink with the new price", "Wenn die Portion mit dem neuen Preis nicht kleiner wird", "Si la ración no se encoge con el precio nuevo", "Jeśli porcja nie zmaleje razem z nową ceną") },
  { re: /choir/, lunch: x4("If my friend from the choir and I can get a table at lunchtime", "Wenn meine Freundin aus dem Chor und ich mittags einen Tisch bekommen", "Si mi amiga del coro y yo encontramos mesa a mediodía", "Jeśli z przyjaciółką z chóru znajdziemy w południe stolik"), price: x4("If my friend from the choir still likes it here", "Wenn es meiner Freundin aus dem Chor hier weiter gefällt", "Si a mi amiga del coro le sigue gustando esto", "Jeśli przyjaciółce z chóru dalej będzie się tu podobać") },
  // trades
  { re: /big portions/, lunch: x4("If the portion fills me up until the evening", "Wenn die Portion bis zum Feierabend satt macht", "Si la ración me llena hasta la tarde", "Jeśli porcja wystarczy mi do wieczora"), price: x4("If the large size is still worth it", "Wenn sich die große Größe weiter lohnt", "Si el tamaño grande sigue mereciendo la pena", "Jeśli duży rozmiar dalej będzie się opłacał") },
  { re: /to go/, lunch: x4("If I can take it away in a box", "Wenn ich es in einer Box mitnehmen kann", "Si me lo puedo llevar en una caja", "Jeśli {g:będę mógł|będę mogła} wziąć go na wynos w pudełku"), price: x4("If take-away stays quick at the counter", "Wenn das Mitnehmen an der Theke schnell bleibt", "Si para llevar sigue siendo rápido en la barra", "Jeśli na wynos dalej będzie szybko przy ladzie") },
  { re: /two workmates/, lunch: x4("If the three of us get it a bit cheaper", "Wenn wir zu dritt etwas günstiger wegkommen", "Si a los tres nos sale un poco más barato", "Jeśli we trzech zapłacimy trochę mniej"), price: x4("If my two workmates keep coming with me", "Wenn meine zwei Kollegen weiter mitkommen", "Si mis dos compañeros siguen viniendo conmigo", "Jeśli moi dwaj koledzy dalej będą przychodzić ze mną") },
  { re: /wants it fast/, lunch: x4("If it's ready by the time I've paid in cash", "Wenn es fertig ist, sobald ich bar bezahlt habe", "Si está listo en cuanto pago en efectivo", "Jeśli będzie gotowe, zanim zapłacę gotówką"), price: x4("If paying cash stays quick", "Wenn das Barzahlen schnell bleibt", "Si pagar en efectivo sigue siendo rápido", "Jeśli płacenie gotówką dalej będzie szybkie") },
];

/** A wish by kind of customer, for when their quirk's wish is taken or unknown. */
const SEGMENT_WISH: Record<Persona["segment"], { lunch: L4; price: L4 }> = {
  office_worker: { lunch: x4("If the office group chat picks it", "Wenn der Büro-Chat sich dafür entscheidet", "Si el chat de la oficina lo elige", "Jeśli biurowy czat go wybierze"), price: x4("If it stays on my way to the office", "Wenn es auf meinem Weg ins Büro bleibt", "Si sigue de camino a la oficina", "Jeśli dalej będzie po drodze do biura") },
  freelancer: { lunch: x4("If the Wi-Fi holds up over lunch", "Wenn das WLAN mittags hält", "Si el wifi aguanta a mediodía", "Jeśli wi-fi wytrzyma w porze lunchu"), price: x4("If the Wi-Fi stays free", "Wenn das WLAN kostenlos bleibt", "Si el wifi sigue siendo gratis", "Jeśli wi-fi dalej będzie darmowe") },
  student: { lunch: x4("If there's a cheaper version without the sandwich", "Wenn es eine günstigere Variante ohne Sandwich gibt", "Si hay una versión más barata sin bocadillo", "Jeśli będzie tańsza wersja bez kanapki"), price: x4("If there's a bring-your-own-cup discount", "Wenn es mit eigenem Becher etwas günstiger ist", "Si hay descuento por traer mi propio vaso", "Jeśli będzie zniżka za własny kubek") },
  parent: { lunch: x4("If it's ready while the little one is still patient", "Wenn es fertig ist, solange das Kind noch Geduld hat", "Si está listo mientras el peque aún tiene paciencia", "Jeśli będzie gotowe, zanim maluchowi skończy się cierpliwość"), price: x4("If there's a quiet corner for us", "Wenn es eine ruhige Ecke für uns gibt", "Si hay un rincón tranquilo para nosotros", "Jeśli będzie dla nas spokojny kącik") },
  regular: { lunch: x4("If the soup changes now and then", "Wenn die Suppe ab und zu wechselt", "Si la sopa cambia de vez en cuando", "Jeśli zupa czasem się zmieni"), price: x4("If there's a stamp card for regulars", "Wenn es eine Stempelkarte für Stammgäste gibt", "Si hay una tarjeta de sellos para los habituales", "Jeśli będzie karta z pieczątkami dla stałych gości") },
  tourist: { lunch: x4("If I'm still in the area next week", "Wenn ich nächste Woche noch in der Gegend bin", "Si la semana que viene sigo por la zona", "Jeśli w przyszłym tygodniu dalej będę w okolicy"), price: x4("If it's on my way to the U-Bahn", "Wenn es auf meinem Weg zur U-Bahn liegt", "Si me pilla de camino al U-Bahn", "Jeśli będzie mi po drodze do U-Bahnu") },
  retiree: { lunch: x4("If there's a smaller portion at a smaller price", "Wenn es eine kleinere Portion zum kleineren Preis gibt", "Si hay una ración más pequeña a menor precio", "Jeśli będzie mniejsza porcja w niższej cenie"), price: x4("If there's a pensioner's price in the morning", "Wenn es morgens einen Seniorenpreis gibt", "Si por la mañana hay precio para jubilados", "Jeśli rano będzie cena dla seniorów") },
  trades: { lunch: x4("If it's ready to take away the moment I walk in", "Wenn es fertig zum Mitnehmen ist, sobald ich reinkomme", "Si está listo para llevar en cuanto entro", "Jeśli będzie gotowe na wynos, gdy tylko wejdę"), price: x4("If it's still quick on the way to the site", "Wenn es auf dem Weg zur Baustelle schnell geht", "Si sigue siendo rápido de camino a la obra", "Jeśli dalej będzie szybko w drodze na budowę") },
};

/** Last resort, so even a twelve-person rehearsal never repeats a sentence. */
const GENERIC_WISH: Record<"lunch" | "price", L4[]> = {
  lunch: [
    x4("If the deal stays as it is", "Wenn das Angebot so bleibt", "Si el menú sigue igual", "Jeśli zestaw zostanie taki, jaki jest"),
    x4("If the soup of the day is written on the board", "Wenn die Tagessuppe auf der Tafel steht", "Si la sopa del día está en la pizarra", "Jeśli zupa dnia będzie na tablicy"),
    x4("If I hear good things from the others", "Wenn ich von den anderen Gutes höre", "Si oigo cosas buenas de los demás", "Jeśli usłyszę od innych coś dobrego"),
    x4("If the queue stays short", "Wenn die Schlange kurz bleibt", "Si la cola sigue siendo corta", "Jeśli kolejka dalej będzie krótka"),
    x4("If the price stays where it is", "Wenn der Preis so bleibt", "Si el precio se queda como está", "Jeśli cena się nie zmieni"),
    x4("If it's still on next week", "Wenn es das nächste Woche noch gibt", "Si la semana que viene sigue habiéndolo", "Jeśli w przyszłym tygodniu dalej będzie"),
  ],
  price: [
    x4("If the quality stays the same", "Wenn die Qualität gleich bleibt", "Si la calidad sigue igual", "Jeśli jakość się nie zmieni"),
    x4("If the price doesn't go up again soon", "Wenn der Preis nicht gleich wieder steigt", "Si el precio no vuelve a subir pronto", "Jeśli cena zaraz znowu nie wzrośnie"),
    x4("If the staff stay this friendly", "Wenn das Team so freundlich bleibt", "Si el personal sigue así de amable", "Jeśli obsługa dalej będzie taka miła"),
    x4("If there's a loyalty card", "Wenn es eine Treuekarte gibt", "Si hay una tarjeta de fidelidad", "Jeśli będzie karta lojalnościowa"),
    x4("If the queue stays short", "Wenn die Schlange kurz bleibt", "Si la cola sigue siendo corta", "Jeśli kolejka dalej będzie krótka"),
    x4("If it stays this good", "Wenn es so gut bleibt", "Si sigue siendo así de bueno", "Jeśli dalej będzie tak dobrze"),
  ],
};

const TIMES: Record<Lang, string[]> = {
  en: ["once", "twice", "three times", "four times", "five times"],
  de: ["einmal", "zweimal", "dreimal", "viermal", "fünfmal"],
  es: ["una vez", "dos veces", "tres veces", "cuatro veces", "cinco veces"],
  pl: ["raz", "dwa razy", "trzy razy", "cztery razy", "pięć razy"],
};

const ATE = new Set(["tries_deal", "tries_and_tells", "comes_back_for_deal", "keeps_coming", "still_comes_for_lunch", "comes_now_and_then"]);
const TOLD = new Set(["tells_a_friend", "tries_and_tells", "recommends_it"]);
const USUAL = new Set(["usual_order", "back_to_usual", "back_to_old_habits"]);
const KEPT = new Set(["accepts", "buys_as_usual", "keeps_buying", "stays_a_customer", "still_buys_regularly"]);
const LESS = new Set(["buys_less_often", "buys_less_than_before", "buys_now_and_then"]);
const PRICE_NEG = new Set(["buys_less_often", "buys_less_than_before", "buys_now_and_then", "goes_elsewhere", "found_somewhere_cheaper", "stays_away", "switches_to_cheaper_item", "grumbles"]);
const PRICE_POS = new Set([...KEPT, "recommends_cafe_anyway", "recommends_cafe"]);

function moneyText(n: number, lang: Lang): string {
  const locale = { de: "de-DE", en: "en-GB", es: "es-ES", pl: "pl-PL" }[lang];
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
}

/** The English text of this persona's quirk (found by rendering the segment's quirks in the persona's language). */
function quirkEnglish(p: Persona, lang: Lang): string {
  const g = p.gender ?? "f";
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const mine = norm(p.quirk ?? "");
  const list = ARCHETYPE_TEXT[p.segment]?.quirks ?? [];
  for (const q of list) {
    const own = norm(fillText(q.t[lang] ?? q.t.en, PRONOUNS[lang]?.[g] ?? {}, g));
    if (own && (own === mine || mine.startsWith(own.slice(0, 18)))) return q.t.en;
  }
  return p.quirk ?? "";
}

/** Where this person went instead, from their own words in that round (the rehearsal names the place). */
function placeOf(r: Rehearsal, p: Persona, x: Reaction | undefined, lang: Lang): string {
  const said = `${x?.thought ?? ""} ${x?.saysPublicly ?? ""} ${x?.diary ?? ""}`.toLowerCase();
  if (said.trim()) {
    for (const [id, place] of Object.entries(PLACES)) {
      if ([place.at[lang], place.to[lang], place.nom[lang]].some((s) => s && said.includes(s.toLowerCase()))) return id;
    }
  }
  return placeIdFor(p, r.template);
}

interface Pick {
  fact: FactId;
  vars?: Record<string, string>;
  /** Gender of {t:…} (the person they heard it from). */
  teller?: "f" | "m";
}

/** The facts this person can speak about, most telling first. */
function factsFor(r: Rehearsal, p: Persona, lang: Lang, price: string): Pick[] {
  const mine = r.reactions.filter((x) => x.personaId === p.id && x.action !== "not_around").sort((a, b) => a.round - b.round);
  const acts = mine.map((x) => x.action);
  const has = (set: Set<string>) => acts.some((a) => set.has(a));
  const last = acts[acts.length - 1];
  const nameOf = (id: string | undefined) => r.personas.find((q) => q.id === id);
  const friend = FRIEND[p.segment]?.[lang] ?? "";
  const place = (x: Reaction | undefined) => {
    const id = placeOf(r, p, x, lang);
    const pl = PLACES[id] ?? PLACES.bakery!;
    return { id, alt_at: pl.at[lang], alt_to: pl.to[lang] };
  };
  if (!acts.length) return [{ fact: r.template === "price_change" ? "priceAway" : "away" }];

  const out: Pick[] = [];
  const heardFrom = (pred: (x: Reaction) => boolean): Pick[] => {
    const hit = [...mine].reverse().find((x) => pred(x) && x.heardFrom && nameOf(x.heardFrom));
    const who = hit ? nameOf(hit.heardFrom) : undefined;
    if (!who) return [];
    const fan = r.reactions.some((x) => x.personaId === who.id && ATE.has(x.action));
    return [{ fact: fan ? "heardFan" : "heardMention", vars: { name: who.name }, teller: who.gender ?? "f" }];
  };

  if (r.template === "price_change") {
    const away = mine.find((x) => actionKind(x.action) === "elsewhere");
    const lastAway = [...mine].reverse().find((x) => actionKind(x.action) === "elsewhere");
    const negHeard = [...mine].reverse().find((x) => PRICE_NEG.has(x.action) && x.heardFrom && nameOf(x.heardFrom));
    const posHeard = [...mine].reverse().find((x) => PRICE_POS.has(x.action) && x.heardFrom && nameOf(x.heardFrom));
    const withName = (fact: FactId, x: Reaction | undefined): Pick[] => {
      const who = x ? nameOf(x.heardFrom) : undefined;
      return who ? [{ fact, vars: { name: who.name }, teller: who.gender ?? "f" }] : [];
    };
    // what they do now
    if (away) out.push({ fact: "priceElsewhere", vars: place(lastAway) });
    else if (has(LESS)) out.push({ fact: "less" });
    else if (acts.includes("switches_to_cheaper_item")) out.push({ fact: "cheaperItem" });
    else if (acts.includes("grumbles")) out.push({ fact: "grumbled" });
    else if (acts.includes("does_not_notice")) out.push({ fact: "noticedNot" });
    else if (has(KEPT)) out.push({ fact: "kept" });
    else if (acts.includes("forgot_about_it")) out.push({ fact: "priceForgot" });
    // what else they did or heard
    const grumbled = acts.some((a) => PRICE_NEG.has(a) || a === "tells_friend_it_is_pricey" || a === "mentions_price_in_review");
    if (acts.some((a) => a === "recommends_cafe_anyway" || a === "recommends_cafe")) out.push({ fact: grumbled ? "recommendAnyway" : "recommend", vars: { friend } });
    out.push(...withName("heardNeg", negHeard));
    if (!away && !has(LESS)) out.push(...withName("heardPos", posHeard));
    if (acts.includes("tells_friend_it_is_pricey")) out.push({ fact: "toldPricey", vars: { friend } });
    if (acts.includes("mentions_price_in_review")) out.push({ fact: "priceReview" });
    if (has(KEPT) && !away && !has(LESS) && !acts.includes("switches_to_cheaper_item")) out.push({ fact: "kept" });
    if (acts.includes("grumbles")) out.push({ fact: "grumbled" });
    if (acts.includes("forgot_about_it")) out.push({ fact: "priceForgot" });
    return out;
  }

  const ate = acts.filter((a) => ATE.has(a)).length;
  const elsewhere = [...mine].reverse().find((x) => actionKind(x.action) === "elsewhere");
  const wentTo = elsewhere ? place(elsewhere) : undefined;
  const usual = Number.isFinite(p.usualSpend) ? moneyText(p.usualSpend, lang) : "";
  const offer = r.scene?.price ?? 0;
  // what they did with the deal
  if (ate >= 2) out.push({ fact: "ateMany", vars: { times: TIMES[lang][Math.min(ate, 5) - 1] ?? String(ate) } });
  else if (ate === 1) out.push({ fact: "ateOnce" });
  else if (has(TOLD)) out.push({ fact: "notYet" });
  else if (wentTo) out.push({ fact: "elsewhere", vars: wentTo });
  else if (acts.includes("skips_lunch_out")) out.push({ fact: "home" });
  else if (has(USUAL)) out.push({ fact: "usual" });
  else if (acts.includes("notices_offer")) out.push({ fact: "noticed" });
  else if (acts.includes("complains")) out.push({ fact: "complained" });
  else if (acts.includes("ignores")) out.push({ fact: "ignored" });
  else out.push({ fact: "forgot" });
  // why, who, and what came after
  out.push(...heardFrom((x) => ATE.has(x.action) || TOLD.has(x.action)));
  if (has(TOLD)) out.push({ fact: "told", vars: { friend } });
  if (acts.includes("posts_review")) out.push({ fact: "review" });
  if (ate >= 1 && wentTo) out.push({ fact: "elsewhere", vars: wentTo });
  if (ate >= 1 && last && USUAL.has(last)) out.push({ fact: "backToUsual" });
  if (ate >= 1 && offer > 0 && usual) out.push(offer < p.usualSpend - 0.2 ? { fact: "cheaper", vars: { price, usual } } : { fact: "dearer", vars: { price } });
  if (wentTo?.id === "rival") out.push({ fact: "rivalWhy" });
  if (acts.includes("skips_lunch_out")) out.push({ fact: "home" });
  if (last === "forgets_about_it") out.push({ fact: "forgot" });
  if (has(USUAL)) out.push({ fact: "usual" });
  return out;
}

function closeFor(r: Rehearsal, p: Persona): L4 {
  const acts = r.reactions.filter((x) => x.personaId === p.id && x.action !== "not_around").map((x) => x.action);
  if (r.template === "price_change") {
    if (!acts.length) return CLOSE.visit;
    if (acts.some((a) => actionKind(a) === "elsewhere" || LESS.has(a) || a === "switches_to_cheaper_item")) return CLOSE.more;
    return CLOSE.stay;
  }
  if (!acts.length) return CLOSE.try;
  const ate = acts.filter((a) => ATE.has(a)).length;
  const last = acts[acts.length - 1] ?? "";
  if (ate >= 2 && !USUAL.has(last) && actionKind(last) !== "elsewhere") return CLOSE.keep;
  if (ate >= 1) return CLOSE.back;
  if (acts.some((a) => actionKind(a) === "elsewhere")) return CLOSE.yours;
  return CLOSE.try;
}

/** Text in the persona's language, with {g:…} for the speaker, {t:…} for the teller and the given values. */
function render(t: L4, lang: Lang, p: Persona, vars: Record<string, string> = {}, teller: "f" | "m" = "f"): string {
  const withTeller = (t[lang] ?? t.en).replace(/\{t:([^|{}]*)\|([^{}]*)\}/g, (_m, male: string, female: string) => (teller === "f" ? female : male));
  return fillText(withTeller, vars, p.gender ?? "f").replace(/\s+/g, " ").trim();
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The answers: one or two sentences from what each person did, then a wish from their quirk; no sentence twice. */
export function interviewAnswers(r: Rehearsal, lang: Lang = r.lang ?? getLang()): { personaId: string; answer: string }[] {
  // Uniqueness is kept on what is said (the text and its values), not on the rendered words, so two
  // people never say the same thing even where only the grammatical gender differs, and the same
  // people say the same things in every language.
  const used = new Set<string>();
  const usedText = new Set<string>();
  const usedWish = new Set<L4>();
  const kind = r.template === "price_change" ? "price" : "lunch";
  const price = moneyText(r.scene?.price ?? 0, lang);
  const take = (key: string, text: string): boolean => {
    const plain = text.toLowerCase();
    if (used.has(key) || usedText.has(plain)) return false;
    used.add(key);
    usedText.add(plain);
    return true;
  };
  return r.personas.map((p) => {
    const sentences: string[] = [];
    const said = new Set<FactId>();
    for (const f of factsFor(r, p, lang, price)) {
      if (sentences.length >= 2) break;
      if (said.has(f.fact)) continue; // one sentence per kind of fact and person
      for (const [i, v] of FACT[f.fact].entries()) {
        const s = render(v, lang, p, f.vars, f.teller);
        if (s && !sentences.includes(s) && take(`${f.fact}#${i}|${JSON.stringify(f.vars ?? {})}`, s)) {
          sentences.push(s);
          said.add(f.fact);
          break;
        }
      }
    }
    const close = render(closeFor(r, p), lang, p);
    const quirk = quirkEnglish(p, lang);
    const usual = Number.isFinite(p.usualSpend) ? moneyText(p.usualSpend, lang) : "";
    const candidates: L4[] = [];
    const w = WISHES.find((x) => x.re.test(quirk));
    if (w) candidates.push(kind === "lunch" && w.lunchCheap && (r.scene?.price ?? 0) <= p.usualSpend ? w.lunchCheap : w[kind]);
    candidates.push(SEGMENT_WISH[p.segment]?.[kind] ?? GENERIC_WISH[kind][0]!, ...GENERIC_WISH[kind]);
    for (const c of candidates) {
      if (usedWish.has(c)) continue;
      usedWish.add(c);
      sentences.push(capFirst(`${render(c, lang, p, { usual, price })}, ${close}.`));
      break;
    }
    let answer = sentences.join(" ");
    // Interview answers are capped at 300 characters: drop the second fact first.
    if (answer.length > 300 && sentences.length > 2) answer = [sentences[0], sentences[sentences.length - 1]].join(" ");
    return { personaId: p.id, answer: answer.slice(0, 300) };
  });
}

/** The interview question for a rehearsal, in its language. */
export function interviewQuestion(r: Rehearsal, lang: Lang = r.lang ?? getLang()): string {
  return T(r.template === "price_change" ? "iv_price_q" : "iv_lunch_q", { item: r.scene?.item ?? "" }, lang).replace(/\s+/g, " ");
}

/** One post-run interview, answered by fixed rules from what each imagined customer did and who they are. */
export function ruleInterview(r: Rehearsal, lang: Lang = r.lang ?? getLang()): Rehearsal {
  if (r.status !== "done") return r;
  try {
    const out = recordInterview(r, interviewQuestion(r, lang), interviewAnswers(r, lang), "rule-based");
    return out.errors.length && !out.rehearsal.interviews.length ? r : out.rehearsal;
  } catch {
    return r;
  }
}

/* ================================================================== the demos */

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
    if (typeof inputs.minimum_wage_hours_per_week !== "number") inputs.minimum_wage_hours_per_week = DEMO_MIN_WAGE_HOURS;
    question = T("price_question", { hours: String(inputs.minimum_wage_hours_per_week) }, lang);
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
    if (opts.interview !== false && r.status === "done") r = ruleInterview(r, lang);
    state.rehearsal = toShareRehearsal(r);
  } catch {
    // The rehearsal is optional: the demo still shows steps 1–4 and 6 without it.
  }
  return state;
}

export function demoToken(template: TemplateId = "lunch_offer", opts: DemoOptions = {}): string {
  return encodeState(demoState(template, opts));
}

/* ================================================================== the AI-played demo */

/** When the Claude-played rehearsal in src/report/demo-ai.json was saved (ISO date). */
export const AI_DEMO_SAVED = "2026-10-17";

let aiDemo: Promise<ShareState | null> | undefined;

/** A ShareState from the saved file: the state itself, or { state, savedAt } around it. */
function asShareState(raw: unknown): ShareState | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const s = (o && o.v === 1 ? o : o?.state && typeof o.state === "object" ? o.state : null) as Partial<ShareState> | null;
  if (!s || s.v !== 1 || (s.template !== "lunch_offer" && s.template !== "price_change") || !s.inputs || typeof s.inputs !== "object") return null;
  if (!s.rehearsal || !Array.isArray(s.rehearsal.reactions)) return null;
  return structuredClone({ ...s, demo: true }) as ShareState;
}

/**
 * The lunch demo whose rehearsal Claude played (AI subagents), saved as src/report/demo-ai.json,
 * or null when the file is not in this build. The file is bundled when it exists (esbuild glob
 * import); without it the site simply has no /r#demo-ai. Each call returns a fresh copy.
 */
export async function loadAiDemo(): Promise<ShareState | null> {
  aiDemo ??= (async () => {
    try {
      const name = "ai";
      const mod = (await import(`./demo-${name}.json`, { with: { type: "json" } })) as { default?: unknown };
      return asShareState(mod.default ?? mod);
    } catch {
      return null;
    }
  })();
  const s = await aiDemo;
  return s ? structuredClone(s) : null;
}

/**
 * The saved AI demo shown in `lang`: the numbers and generated texts follow `lang`; the demo's own
 * question and café name are swapped for the same demo text in `lang`; the AI customers' words stay
 * as they were written (in aiDemoLang).
 */
export function aiDemoIn(saved: ShareState, lang: Lang): ShareState {
  const from = aiDemoLang(saved);
  const out: ShareState = { ...saved, lang };
  if (from !== lang) {
    if (saved.question && saved.question === getTemplate(saved.template, from).exampleQuestion) out.question = getTemplate(saved.template, lang).exampleQuestion;
    if (saved.business && saved.business === demoBusiness(from)) out.business = demoBusiness(lang);
  }
  return out;
}

/** The language the AI customers wrote in (the saved file's own language). */
export function aiDemoLang(s: ShareState): Lang {
  return s.lang ?? "de";
}

/** True for a demo whose imagined customers were played by a model (not the site's fixed rules). */
export function isAiDemo(s: ShareState): boolean {
  const r = s.rehearsal;
  return !!s.demo && !!r && r.reactions.some((x) => x.method === "subagent" || x.method === "in-context");
}
