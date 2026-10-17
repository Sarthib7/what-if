/**
 * Every owner-facing word the rehearsal writes, in English, German, Spanish and Polish.
 *
 * The rehearsal's text is structured (people, rounds, lines that fit a situation), so
 * instead of flat keys each entry carries all four languages side by side: x(en, de, es, pl).
 * Structure (which lines exist, under which conditions) is shared by the languages, so the
 * same seed gives the same people and the same story in every language; only the words change.
 *
 * Small grammar helpers inside the texts:
 *   {g:male|female}  gendered forms (German nouns, Spanish adjectives, Polish past tense)
 *   {S} {s} {o} {p} {r}  English pronouns (She/she/her/her/herself); {S} {s} also in German
 *   {name} placeholders are filled by the code that uses the text.
 *
 * Imagined customers are people, so their own words are informal. Owner-facing advice uses
 * "Sie" in German and the friendly informal address in Spanish and Polish (as on the site).
 * Browser-safe: no Node APIs.
 */
import type { Lang } from "../i18n/index.ts";
import type { TemplateId } from "../engine/types.ts";
import type { Persona, SegmentId } from "./types.ts";

export type Tx = Record<Lang, string>;

/** One text in the four languages. */
export function x(en: string, de: string, es: string, pl: string): Tx {
  return { en, de, es, pl };
}

/** Chooses {g:male|female} forms. The pattern has no nested quantifiers (linear time). */
export function gendered(s: string, g: "f" | "m"): string {
  return s.replace(/\{g:([^|{}]*)\|([^{}]*)\}/g, (_m, male: string, female: string) => (g === "f" ? female : male));
}

/** Fills {name} placeholders after choosing gendered forms; unknown placeholders stay as they are. */
export function fillText(tpl: string, vars: Record<string, string>, g: "f" | "m" = "m"): string {
  return gendered(tpl, g).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

// ---------------------------------------------------------------- languages, joining, quoting

/** How a brief names the owner's language ("Write your answers in German (Deutsch)"). */
export const BRIEF_LANGUAGE: Record<Lang, string> = { en: "English", de: "German (Deutsch)", es: "Spanish (Español)", pl: "Polish (Polski)" };

export const OR: Tx = x("or", "oder", "o", "albo");
export const AND: Tx = x("and", "und", "y", "i");

export function joinWith(parts: string[], word: string): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`;
}

/** Quotation marks per language. */
export function quote(s: string, lang: Lang): string {
  return lang === "de" ? `„${s}“` : lang === "pl" ? `„${s}”` : lang === "es" ? `«${s}»` : `"${s}"`;
}

/** Pronoun placeholders for persona text. */
export const PRONOUNS: Record<Lang, Record<"f" | "m", Record<string, string>>> = {
  en: { f: { S: "She", s: "she", o: "her", p: "her", P: "Her", r: "herself" }, m: { S: "He", s: "he", o: "him", p: "his", P: "His", r: "himself" } },
  de: { f: { S: "Sie", s: "sie" }, m: { S: "Er", s: "er" } },
  es: { f: { S: "Ella", s: "ella" }, m: { S: "Él", s: "él" } },
  pl: { f: { S: "Ona", s: "ona" }, m: { S: "On", s: "on" } },
};

// ---------------------------------------------------------------- segments

export const SEGMENT_LABELS: Record<SegmentId, Tx> = {
  office_worker: x("Office worker", "{g:Büroangestellter|Büroangestellte}", "Oficinista", "{g:Pracownik biurowy|Pracownica biurowa}"),
  freelancer: x("Freelancer", "{g:Freiberufler|Freiberuflerin}", "{g:Autónomo|Autónoma}", "{g:Freelancer|Freelancerka}"),
  student: x("Student", "{g:Student|Studentin}", "Estudiante", "{g:Student|Studentka}"),
  parent: x("Parent with small children", "{g:Vater|Mutter} mit kleinen Kindern", "{g:Padre|Madre} con niños pequeños", "{g:Tata|Mama} małych dzieci"),
  regular: x("Regular", "Stammgast", "{g:Cliente|Clienta} habitual", "Stały gość"),
  tourist: x("Visitor", "{g:Besucher|Besucherin}", "Visitante", "{g:Turysta|Turystka}"),
  retiree: x("Retired neighbour", "{g:Rentner|Rentnerin} aus der Nachbarschaft", "{g:Vecino jubilado|Vecina jubilada}", "{g:Emeryt|Emerytka} z sąsiedztwa"),
  trades: x("Tradesperson", "{g:Handwerker|Handwerkerin}", "{g:Trabajador|Trabajadora} de oficio", "{g:Fachowiec|Fachowczyni}"),
};

/** The prefix of Persona.represents in each language (the report can strip it). */
export const REPRESENTS_PREFIX: Tx = x("Stands for: ", "Steht für: ", "Representa a: ", "Reprezentuje: ");

export interface QuirkText {
  t: Tx;
  /** Traits the rule-based stand-in respects. */
  tags?: string[];
}

export interface ArchetypeText {
  jobs: Tx[];
  lunchRoutine: { t: Tx; tags?: string[] }[];
  coffeeRoutine: { t: Tx; tags?: string[] }[];
  quirks: QuirkText[];
  extras: Tx[];
  represents: Record<TemplateId, Tx>;
}

const q = (t: Tx, ...tags: string[]): QuirkText => (tags.length ? { t, tags } : { t });

/**
 * Persona building blocks. Jobs are a predicate after "Name, age, …"; routines are a
 * sentence without its subject ("Eats lunch out…"); quirks a predicate ("has exactly…").
 */
export const ARCHETYPE_TEXT: Record<SegmentId, ArchetypeText> = {
  office_worker: {
    jobs: [
      x("works in the HR team of a solar start-up two streets away", "arbeitet im Personalteam eines Solar-Start-ups zwei Straßen weiter", "trabaja en recursos humanos de una start-up solar a dos calles", "pracuje w dziale kadr start-upu solarnego dwie ulice dalej"),
      x("is a project manager at a small architecture office nearby", "ist {g:Projektleiter|Projektleiterin} in einem kleinen Architekturbüro um die Ecke", "es {g:jefe|jefa} de proyectos en un pequeño estudio de arquitectura cercano", "jest {g:kierownikiem|kierowniczką} projektów w małym biurze architektonicznym niedaleko"),
      x("does the accounts for a housing cooperative round the corner", "macht die Buchhaltung für eine Wohnungsgenossenschaft um die Ecke", "lleva las cuentas de una cooperativa de viviendas a la vuelta de la esquina", "prowadzi księgowość spółdzielni mieszkaniowej za rogiem"),
      x("works in customer support for a bike-sharing company nearby", "arbeitet im Kundenservice einer Leihrad-Firma in der Nähe", "trabaja en atención al cliente de una empresa de bicis compartidas cercana", "pracuje w obsłudze klienta firmy z rowerami na minuty niedaleko"),
      x("is a UX designer at an agency in a converted brewery down the road", "ist {g:UX-Designer|UX-Designerin} in einer Agentur in einer alten Brauerei die Straße runter", "es {g:diseñador|diseñadora} UX en una agencia instalada en una antigua fábrica de cerveza calle abajo", "jest {g:projektantem|projektantką} UX w agencji w dawnym browarze kawałek dalej"),
    ],
    lunchRoutine: [
      { t: x("Eats lunch out most weekdays around 12:30, usually something quick that can be carried back to the desk.", "Isst an den meisten Werktagen gegen 12:30 Uhr auswärts, meist etwas Schnelles für den Schreibtisch.", "Come fuera casi todos los días laborables hacia las 12:30, normalmente algo rápido para llevar a la oficina.", "W większość dni roboczych je lunch na mieście około 12:30, zwykle coś szybkiego, co da się zabrać do biurka."), tags: ["takeaway"] },
      { t: x("Goes out for lunch with two colleagues at 12:15 on the dot; they take turns choosing the place.", "Geht pünktlich um 12:15 Uhr mit zwei Kollegen essen; sie suchen abwechselnd den Ort aus.", "Sale a comer con dos compañeros a las 12:15 en punto; se turnan para elegir el sitio.", "Punktualnie o 12:15 wychodzi na lunch z dwójką kolegów; na zmianę wybierają miejsce.") },
      { t: x("Has a short lunch break and spends too much of it deciding where to go.", "Hat eine kurze Mittagspause und verbringt zu viel davon mit der Frage, wohin.", "Tiene una pausa corta para comer y pierde demasiado tiempo decidiendo adónde ir.", "Ma krótką przerwę na lunch i za dużo z niej traci na wybieranie miejsca."), tags: ["hurry"] },
    ],
    coffeeRoutine: [
      { t: x("Picks up {a_item} on the way to the office most mornings, often while answering emails.", "Holt sich an den meisten Morgen auf dem Weg ins Büro {einen_item}, oft nebenbei mit Mails beschäftigt.", "Casi todas las mañanas recoge {un_item} de camino a la oficina, a menudo mientras contesta correos.", "Prawie każdego ranka bierze {item} w drodze do biura, często odpisując przy tym na maile."), tags: ["takeaway"] },
      { t: x("Comes in for {a_item} after the ten o'clock meeting, sometimes bringing a colleague.", "Kommt nach dem Zehn-Uhr-Meeting auf {einen_item} vorbei, manchmal mit Kollegen.", "Pasa a por {un_item} después de la reunión de las diez, a veces con un compañero.", "Wpada na {item} po spotkaniu o dziesiątej, czasem z kimś z pracy.") },
    ],
    quirks: [
      q(x("has exactly thirty minutes for lunch and hates queues", "hat genau dreißig Minuten Mittagspause und hasst Schlangen", "tiene exactamente treinta minutos para comer y odia las colas", "ma dokładnie trzydzieści minut na lunch i nie znosi kolejek"), "hurry"),
      q(x("orders the same thing until it disappears from the menu", "bestellt immer dasselbe, bis es von der Karte verschwindet", "pide lo mismo hasta que desaparece de la carta", "zamawia to samo, dopóki nie zniknie z karty")),
      q(x("pays by card and never carries cash", "zahlt mit Karte und hat nie Bargeld dabei", "paga con tarjeta y nunca lleva efectivo", "płaci kartą i nigdy nie nosi gotówki")),
      q(x("checks Google Maps before trying anywhere new", "schaut auf Google Maps, bevor {g:er|sie} etwas Neues ausprobiert", "mira Google Maps antes de probar un sitio nuevo", "zanim spróbuje nowego miejsca, sprawdza Mapy Google")),
      q(x("often brings something back for a colleague", "bringt oft etwas für Kollegen mit", "a menudo le lleva algo a un compañero", "często przynosi coś koledze z pracy")),
    ],
    extras: [
      x("Most days the office group chat decides where lunch happens.", "Meistens entscheidet der Büro-Gruppenchat, wo es mittags hingeht.", "Casi siempre es el chat de la oficina el que decide dónde se come.", "Zwykle to biurowy czat grupowy decyduje, gdzie idą na lunch."),
      x("{S} likes knowing exactly what something costs before ordering.", "{S} will vor dem Bestellen genau wissen, was etwas kostet.", "Le gusta saber exactamente cuánto cuesta algo antes de pedir.", "Lubi wiedzieć dokładnie, ile coś kosztuje, zanim zamówi."),
      x("Since the office went hybrid, {s} is in the neighbourhood three days a week.", "Seit es im Büro hybrid läuft, ist {s} drei Tage die Woche im Kiez.", "Desde que la oficina es híbrida, está por el barrio tres días a la semana.", "Odkąd biuro pracuje hybrydowo, bywa w okolicy trzy dni w tygodniu."),
    ],
    represents: {
      lunch_offer: x("office workers within a five-minute walk who buy lunch most weekdays", "Büroleute im Umkreis von fünf Gehminuten, die an den meisten Werktagen Mittagessen kaufen", "oficinistas a cinco minutos a pie que compran la comida casi todos los días laborables", "pracowników biurowych w promieniu pięciu minut pieszo, którzy w większość dni kupują lunch"),
      price_change: x("office workers nearby who buy a coffee on the way in", "Büroleute in der Nähe, die auf dem Weg zur Arbeit einen Kaffee kaufen", "oficinistas de la zona que compran un café de camino al trabajo", "pracowników biurowych z okolicy, którzy kupują kawę w drodze do pracy"),
    },
  },
  freelancer: {
    jobs: [
      x("is a freelance illustrator who mostly draws for children's books", "ist {g:freiberuflicher Illustrator|freiberufliche Illustratorin} und zeichnet vor allem für Kinderbücher", "es {g:ilustrador autónomo|ilustradora autónoma} y dibuja sobre todo para libros infantiles", "jest {g:ilustratorem|ilustratorką} na własny rachunek i rysuje głównie do książek dla dzieci"),
      x("translates video games from Polish into German", "übersetzt Videospiele aus dem Polnischen ins Deutsche", "traduce videojuegos del polaco al alemán", "tłumaczy gry wideo z polskiego na niemiecki"),
      x("is a sound designer for podcasts and small films", "macht Sounddesign für Podcasts und kleine Filme", "hace diseño de sonido para pódcasts y películas pequeñas", "robi udźwiękowienie podcastów i małych filmów"),
      x("writes grant applications for local charities", "schreibt Förderanträge für Vereine im Kiez", "escribe solicitudes de subvenciones para asociaciones del barrio", "pisze wnioski o granty dla lokalnych organizacji"),
      x("builds websites for small shops and restaurants", "baut Websites für kleine Läden und Restaurants", "hace páginas web para tiendas y restaurantes pequeños", "robi strony internetowe dla małych sklepów i restauracji"),
    ],
    lunchRoutine: [
      { t: x("Works from a laptop at the café two or three afternoons a week; lunch is often a bowl of soup and a long flat white.", "Arbeitet zwei, drei Nachmittage pro Woche mit dem Laptop im Café; mittags gibt es oft eine Schale Suppe und einen langen Flat White.", "Trabaja con el portátil en el café dos o tres tardes a la semana; la comida suele ser un cuenco de sopa y un flat white que dura mucho.", "Dwa, trzy popołudnia w tygodniu pracuje w kawiarni na laptopie; na lunch często miska zupy i długo pity flat white.") },
      { t: x("Works from home most days and goes out for lunch when a deadline is done or the flat feels too small.", "Arbeitet meist von zu Hause und geht mittags raus, wenn eine Deadline geschafft ist oder die Wohnung zu eng wird.", "Trabaja desde casa casi siempre y sale a comer cuando termina una entrega o el piso se le queda pequeño.", "Zwykle pracuje z domu, a na lunch wychodzi, gdy skończy jakiś termin albo mieszkanie robi się za ciasne.") },
    ],
    coffeeRoutine: [
      { t: x("Works from the café a few afternoons a week, making {a_item} last for hours.", "Arbeitet ein paar Nachmittage pro Woche im Café und lässt dabei {einen_item} stundenlang reichen.", "Trabaja en el café algunas tardes a la semana y hace durar {un_item} horas.", "Kilka popołudni w tygodniu pracuje w kawiarni i potrafi pić jeden {item} godzinami.") },
      { t: x("Comes in mid-morning for {a_item} and a seat by the window to answer emails.", "Kommt am Vormittag auf {einen_item} und einen Fensterplatz, um Mails zu beantworten.", "Viene a media mañana a por {un_item} y un sitio junto a la ventana para contestar correos.", "Przychodzi przed południem na {item} i miejsce przy oknie, żeby odpisać na maile.") },
    ],
    quirks: [
      q(x("always takes the table by the power socket", "nimmt immer den Tisch an der Steckdose", "siempre coge la mesa junto al enchufe", "zawsze zajmuje stolik przy gniazdku"), "sitter"),
      q(x("photographs food before eating it", "fotografiert das Essen, bevor {g:er|sie} isst", "fotografía la comida antes de comérsela", "fotografuje jedzenie, zanim je zje")),
      q(x("budgets day by day depending on when invoices are paid", "plant das Geld Tag für Tag, je nachdem, wann Rechnungen bezahlt werden", "se organiza el dinero día a día según cuándo le paguen las facturas", "planuje wydatki z dnia na dzień, zależnie od tego, kiedy wpłyną pieniądze za faktury")),
      q(x("asks for oat milk in everything", "will in allem Hafermilch", "pide leche de avena en todo", "do wszystkiego prosi o mleko owsiane")),
      q(x("wears headphones and nods instead of talking", "trägt Kopfhörer und nickt, statt zu reden", "lleva auriculares y asiente en vez de hablar", "nosi słuchawki i zamiast mówić, kiwa głową")),
    ],
    extras: [
      x("Some months are good and some are thin, and it shows in what {s} orders.", "Manche Monate laufen gut, manche mager, und das sieht man an der Bestellung.", "Hay meses buenos y meses flojos, y se nota en lo que pide.", "Są miesiące dobre i chude, i widać to po tym, co zamawia."),
      x("{S} counts the café as an office, which makes the coffee feel like rent.", "{S} zählt das Café als Büro, da fühlt sich der Kaffee an wie Miete.", "Cuenta el café como su oficina, así que el café le parece el alquiler.", "Traktuje kawiarnię jak biuro, więc kawa jest dla {g:niego|niej} czymś w rodzaju czynszu."),
      x("Half {p} clients are in other time zones, so lunch happens whenever there is a gap.", "Die Hälfte der Kundschaft sitzt in anderen Zeitzonen, also gibt es Mittagessen, wenn gerade Luft ist.", "La mitad de sus clientes está en otros husos horarios, así que come cuando hay un hueco.", "Połowa klientów jest w innych strefach czasowych, więc lunch je wtedy, gdy znajdzie się chwila."),
    ],
    represents: {
      lunch_offer: x("freelancers and remote workers who use the café as an office", "Selbstständige und Leute im Homeoffice, die das Café als Büro nutzen", "autónomos y teletrabajadores que usan el café como oficina", "freelancerów i osoby pracujące zdalnie, które traktują kawiarnię jak biuro"),
      price_change: x("freelancers and remote workers who use the café as an office", "Selbstständige und Leute im Homeoffice, die das Café als Büro nutzen", "autónomos y teletrabajadores que usan el café como oficina", "freelancerów i osoby pracujące zdalnie, które traktują kawiarnię jak biuro"),
    },
  },
  student: {
    jobs: [
      x("is studying sociology and works weekend shifts at a bar", "studiert Soziologie und jobbt am Wochenende in einer Bar", "estudia sociología y trabaja los fines de semana en un bar", "studiuje socjologię i w weekendy pracuje w barze"),
      x("is doing a master's in urban planning", "macht einen Master in Stadtplanung", "hace un máster en urbanismo", "robi magisterkę z urbanistyki"),
      x("studies music and gives guitar lessons on the side", "studiert Musik und gibt nebenbei Gitarrenunterricht", "estudia música y da clases de guitarra", "studiuje muzykę i dorabia lekcjami gitary"),
      x("is in the last year of a nursing apprenticeship", "ist im letzten Jahr der Pflegeausbildung", "está en el último año de la formación en enfermería", "jest na ostatnim roku szkoły pielęgniarskiej"),
      x("studies computer science and lives in a shared flat round the corner", "studiert Informatik und wohnt in einer WG um die Ecke", "estudia informática y vive en un piso compartido a la vuelta de la esquina", "studiuje informatykę i mieszka w mieszkaniu współdzielonym za rogiem"),
    ],
    lunchRoutine: [
      { t: x("Passes the café on the way to the U-Bahn; eats out maybe twice a week and cooks big pots of pasta the rest of the time.", "Kommt auf dem Weg zur U-Bahn am Café vorbei; isst vielleicht zweimal die Woche auswärts und kocht sonst große Töpfe Nudeln.", "Pasa por delante del café de camino al U-Bahn; come fuera quizá dos veces por semana y el resto del tiempo cocina ollas enormes de pasta.", "Mija kawiarnię w drodze do metra; je na mieście może dwa razy w tygodniu, a poza tym gotuje wielkie garnki makaronu.") },
      { t: x("Has lectures until noon, and lunch is whatever is cheapest between the station and the flat.", "Hat bis mittags Vorlesungen, und Mittagessen ist das, was zwischen Station und Wohnung am billigsten ist.", "Tiene clases hasta mediodía y la comida es lo más barato que encuentre entre la estación y el piso.", "Ma zajęcia do południa, a lunch to to, co najtańsze między stacją a mieszkaniem.") },
    ],
    coffeeRoutine: [
      { t: x("Treats {r} to {a_item} once or twice a week between lectures.", "Gönnt sich ein-, zweimal die Woche zwischen den Vorlesungen {einen_item}.", "Se da el capricho de {un_item} una o dos veces por semana entre clase y clase.", "Raz, dwa razy w tygodniu funduje sobie między zajęciami {item}.") },
      { t: x("Comes in with flatmates on Sunday mornings and sometimes alone on weekdays for {a_item}.", "Kommt sonntagmorgens mit der WG und manchmal unter der Woche allein auf {einen_item}.", "Viene los domingos por la mañana con sus compañeros de piso y a veces {g:solo|sola} entre semana a por {un_item}.", "W niedzielne poranki przychodzi ze współlokatorami, a czasem w tygodniu {g:sam|sama} na {item}.") },
    ],
    quirks: [
      q(x("splits everything with a flatmate", "teilt alles mit den Leuten aus der WG", "lo comparte todo con sus compañeros de piso", "wszystkim dzieli się ze współlokatorami")),
      q(x("knows every student discount in the area", "kennt jeden Studirabatt in der Gegend", "conoce todos los descuentos para estudiantes de la zona", "zna każdą zniżkę studencką w okolicy")),
      q(x("counts coins at the till", "zählt an der Kasse Münzen ab", "cuenta las monedas en la caja", "przy kasie odlicza monety")),
      q(x("is always wearing headphones", "hat immer Kopfhörer auf", "siempre lleva auriculares", "zawsze ma na uszach słuchawki")),
      q(x("orders the cheapest thing and makes it last", "bestellt das Billigste und lässt es lange reichen", "pide lo más barato y lo hace durar", "zamawia najtańszą rzecz i długo nad nią siedzi"), "sitter"),
    ],
    extras: [
      x("Rent went up this year, so every euro outside it gets a second look.", "Die Miete ist dieses Jahr gestiegen, also wird jeder Euro zweimal umgedreht.", "Este año ha subido el alquiler, así que cada euro se mira dos veces.", "W tym roku wzrósł czynsz, więc każde euro ogląda się dwa razy."),
      x("{S} likes places where nobody minds if you stay for one cheap drink.", "{S} mag Orte, an denen es niemanden stört, wenn man lange bei einem billigen Getränk sitzt.", "Le gustan los sitios donde a nadie le importa que te quedes con una sola bebida barata.", "Lubi miejsca, gdzie nikt nie ma nic przeciwko, że siedzi się długo przy jednym tanim napoju."),
      x("The Mensa is cheap, but by Thursday {s} can't face it any more.", "Die Mensa ist billig, aber ab Donnerstag kann {s} sie nicht mehr sehen.", "El comedor de la uni es barato, pero el jueves ya no lo soporta.", "Stołówka jest tania, ale w czwartek ma jej już dość."),
    ],
    represents: {
      lunch_offer: x("students and young people on a tight budget who eat out now and then", "Studierende und junge Leute mit wenig Geld, die ab und zu auswärts essen", "estudiantes y gente joven con poco presupuesto que come fuera de vez en cuando", "studentów i młodych ludzi z małym budżetem, którzy czasem jedzą na mieście"),
      price_change: x("students on a tight budget for whom a coffee out is a small treat", "Studierende mit wenig Geld, für die ein Kaffee im Café ein kleiner Luxus ist", "estudiantes con poco presupuesto para quienes un café fuera es un pequeño capricho", "studentów z małym budżetem, dla których kawa na mieście to mała przyjemność"),
    },
  },
  parent: {
    jobs: [
      x("is on parental leave with an eight-month-old", "ist in Elternzeit mit einem acht Monate alten Baby", "está de permiso por crianza con un bebé de ocho meses", "jest na urlopie rodzicielskim z ośmiomiesięcznym dzieckiem"),
      x("works part-time at a pharmacy and picks up two children at three", "arbeitet Teilzeit in einer Apotheke und holt um drei zwei Kinder ab", "trabaja media jornada en una farmacia y recoge a dos niños a las tres", "pracuje na pół etatu w aptece i o piętnastej odbiera dwoje dzieci"),
      x("works from home on Mondays and Fridays and does the nursery run", "arbeitet montags und freitags von zu Hause und bringt das Kind in die Kita", "teletrabaja los lunes y viernes y lleva al niño a la guardería", "w poniedziałki i piątki pracuje z domu i odprowadza dziecko do przedszkola"),
      x("is a nurse on a reduced week while the youngest settles into nursery", "ist {g:Krankenpfleger|Krankenpflegerin} mit weniger Stunden, solange das Jüngste in der Kita eingewöhnt wird", "es {g:enfermero|enfermera} y trabaja menos horas mientras el pequeño se adapta a la guardería", "jest {g:pielęgniarzem|pielęgniarką} na skróconym etacie, dopóki najmłodsze nie przyzwyczai się do przedszkola"),
    ],
    lunchRoutine: [
      { t: x("Comes by with the pram after the morning walk; lunch out is a treat, usually something to share.", "Kommt nach dem Vormittagsspaziergang mit dem Kinderwagen vorbei; auswärts essen ist etwas Besonderes, meist etwas zum Teilen.", "Pasa con el carrito después del paseo de la mañana; comer fuera es un capricho, normalmente algo para compartir.", "Wpada z wózkiem po porannym spacerze; lunch na mieście to przyjemność, zwykle coś do podzielenia się."), tags: ["pram"] },
      { t: x("Has lunch out once or twice a week between nursery drop-off and pick-up, always against the clock.", "Isst ein-, zweimal die Woche zwischen Kita-Bringen und -Abholen auswärts, immer gegen die Uhr.", "Come fuera una o dos veces por semana entre dejar y recoger al niño en la guarde, siempre con prisa.", "Raz, dwa razy w tygodniu je na mieście między odprowadzeniem a odebraniem dziecka z przedszkola, zawsze w biegu."), tags: ["hurry"] },
    ],
    coffeeRoutine: [
      { t: x("Gets {a_item} after nursery drop-off, often with a pastry to share later.", "Holt sich nach dem Kita-Bringen {einen_item}, oft mit einem Gebäck zum Teilen für später.", "Se pide {un_item} después de dejar al niño en la guarde, a menudo con un bollo para compartir luego.", "Po odprowadzeniu dziecka do przedszkola bierze {item}, często z drożdżówką do podzielenia później."), tags: ["takeaway"] },
      { t: x("Meets another parent for {a_item} on Wednesday mornings, pram parked by the window.", "Trifft mittwochmorgens andere Eltern auf {einen_item}, der Kinderwagen parkt am Fenster.", "Queda con otra madre o padre los miércoles por la mañana para tomar {un_item}, con el carrito aparcado junto a la ventana.", "W środowe poranki spotyka się z innym rodzicem na {item}, wózek stoi przy oknie."), tags: ["pram"] },
    ],
    quirks: [
      q(x("needs space for a pram", "braucht Platz für einen Kinderwagen", "necesita sitio para el carrito", "potrzebuje miejsca na wózek"), "pram"),
      q(x("always asks whether things contain nuts", "fragt immer, ob Nüsse drin sind", "siempre pregunta si algo lleva frutos secos", "zawsze pyta, czy coś zawiera orzechy")),
      q(x("is in a hurry after half past two", "ist ab halb drei in Eile", "va con prisa a partir de las dos y media", "po wpół do trzeciej zawsze się spieszy"), "hurry"),
      q(x("orders for two and eats for one", "bestellt für zwei und isst für einen", "pide para dos y come por uno", "zamawia dwie porcje, a zjada jedną")),
    ],
    extras: [
      x("A good day is one where nobody cries in public, including {o}.", "Ein guter Tag ist einer, an dem niemand in der Öffentlichkeit weint, {g:er|sie} selbst eingeschlossen.", "Un buen día es uno en el que nadie llora en público, {g:incluido él|incluida ella}.", "Dobry dzień to taki, w którym nikt nie płacze publicznie, łącznie z {g:nim samym|nią samą}."),
      x("{S} chooses places by whether there is room for a pram inside.", "{S} wählt Cafés danach aus, ob drinnen Platz für einen Kinderwagen ist.", "Elige los sitios según si dentro cabe un carrito.", "Wybiera miejsca według tego, czy w środku zmieści się wózek."),
      x("The parents' WhatsApp group knows about every new place within a day.", "Die Eltern-WhatsApp-Gruppe weiß innerhalb eines Tages von jedem neuen Laden.", "El grupo de WhatsApp de las familias se entera de cada sitio nuevo en un día.", "Rodzicielska grupa na WhatsAppie w ciągu dnia wie o każdym nowym miejscu."),
    ],
    represents: {
      lunch_offer: x("parents with small children who come by during the day", "Eltern mit kleinen Kindern, die tagsüber vorbeikommen", "madres y padres con niños pequeños que pasan durante el día", "rodziców z małymi dziećmi, którzy wpadają w ciągu dnia"),
      price_change: x("parents with small children who come by during the day", "Eltern mit kleinen Kindern, die tagsüber vorbeikommen", "madres y padres con niños pequeños que pasan durante el día", "rodziców z małymi dziećmi, którzy wpadają w ciągu dnia"),
    },
  },
  regular: {
    jobs: [
      x("has lived on this street for eleven years", "wohnt seit elf Jahren in dieser Straße", "vive en esta calle desde hace once años", "mieszka przy tej ulicy od jedenastu lat"),
      x("runs the bookshop three doors down", "führt den Buchladen drei Türen weiter", "lleva la librería que está tres portales más allá", "prowadzi księgarnię trzy drzwi dalej"),
      x("is a night-shift nurse who stops by on the way home", "ist {g:Krankenpfleger|Krankenpflegerin} in der Nachtschicht und kommt auf dem Heimweg vorbei", "es {g:enfermero|enfermera} del turno de noche y pasa de camino a casa", "jest {g:pielęgniarzem|pielęgniarką} na nocnej zmianie i wpada w drodze do domu"),
      x("teaches German at the language school nearby", "unterrichtet Deutsch an der Sprachschule nebenan", "da clases de alemán en la academia de idiomas de al lado", "uczy niemieckiego w pobliskiej szkole językowej"),
      x("repairs bicycles in a workshop across the courtyard", "repariert Fahrräder in einer Werkstatt im Hinterhof", "arregla bicis en un taller al otro lado del patio", "naprawia rowery w warsztacie po drugiej stronie podwórka"),
    ],
    lunchRoutine: [
      { t: x("Comes in almost every weekday, sits at the same window table and usually has the soup with bread.", "Kommt fast jeden Werktag, sitzt am selben Fenstertisch und nimmt meist die Suppe mit Brot.", "Viene casi todos los días laborables, se sienta en la misma mesa junto a la ventana y suele tomar la sopa con pan.", "Przychodzi prawie w każdy dzień roboczy, siada przy tym samym stoliku przy oknie i zwykle bierze zupę z chlebem."), tags: ["sitter"] },
      { t: x("Has lunch here three or four times a week, usually the sandwich of the day and a mint tea.", "Isst hier drei-, viermal die Woche zu Mittag, meist das Sandwich des Tages und einen Pfefferminztee.", "Come aquí tres o cuatro veces por semana, casi siempre el bocadillo del día y un té de menta.", "Je tu lunch trzy, cztery razy w tygodniu, zwykle kanapkę dnia i herbatę miętową.") },
    ],
    coffeeRoutine: [
      { t: x("Has {a_item} at the counter almost every morning, often as the first customer.", "Trinkt fast jeden Morgen {einen_item} an der Theke, oft als erster Gast.", "Se toma {un_item} en la barra casi todas las mañanas, a menudo como primer cliente.", "Prawie każdego ranka pije {item} przy ladzie, często jako pierwszy gość.") },
      { t: x("Stops in for {a_item} most days and knows the staff's names.", "Kommt an den meisten Tagen auf {einen_item} vorbei und kennt das Team mit Namen.", "Pasa casi todos los días a por {un_item} y conoce al personal por su nombre.", "Wpada na {item} prawie codziennie i zna obsługę po imieniu.") },
    ],
    quirks: [
      q(x("knows the staff by name and their days off", "kennt das Team mit Namen und weiß, wer wann frei hat", "conoce al personal por su nombre y sabe qué días libran", "zna obsługę z imienia i wie, kto kiedy ma wolne")),
      q(x("dislikes changes to the menu", "mag keine Änderungen an der Karte", "no soporta los cambios en la carta", "nie lubi zmian w menu")),
      q(x("always pays in cash and leaves the change", "zahlt immer bar und lässt das Wechselgeld liegen", "siempre paga en efectivo y deja el cambio", "zawsze płaci gotówką i zostawia resztę")),
      q(x("reads the paper for an hour and keeps the same chair", "liest eine Stunde Zeitung und sitzt immer auf demselben Stuhl", "lee el periódico durante una hora y siempre ocupa la misma silla", "czyta gazetę przez godzinę i zawsze siada na tym samym krześle"), "sitter"),
    ],
    extras: [
      x("{S} has seen the café through two owners and a lot of staff.", "{S} hat das Café schon mit zwei Inhabern und vielen Teams erlebt.", "Ha visto pasar por el café a dos dueños y a mucho personal.", "{g:Widział|Widziała} już w tej kawiarni dwóch właścicieli i mnóstwo obsługi."),
      x("Friends know they can usually find {o} here.", "Freunde wissen, dass sie {g:ihn|sie} meistens hier finden.", "Sus amigos saben que casi siempre {g:lo|la} encuentran aquí.", "Znajomi wiedzą, że zwykle można {g:go|ją} tu znaleźć."),
      x("{S} still remembers the old menu and mentions it now and then.", "{S} erinnert sich noch an die alte Karte und erwähnt sie ab und zu.", "Todavía se acuerda de la carta antigua y la menciona de vez en cuando.", "Wciąż pamięta stare menu i od czasu do czasu o nim wspomina."),
    ],
    represents: {
      lunch_offer: x("loyal regulars who come in almost every day", "treue Stammgäste, die fast jeden Tag kommen", "clientes habituales fieles que vienen casi a diario", "wiernych stałych gości, którzy przychodzą prawie codziennie"),
      price_change: x("loyal regulars who buy the item most days", "treue Stammgäste, die das fast jeden Tag kaufen", "clientes habituales fieles que lo compran casi a diario", "wiernych stałych gości, którzy kupują to prawie codziennie"),
    },
  },
  tourist: {
    jobs: [
      x("is visiting from Lyon for a long weekend", "ist für ein langes Wochenende aus Lyon zu Besuch", "está de visita desde Lyon un fin de semana largo", "{g:przyjechał|przyjechała} z Lyonu na długi weekend"),
      x("is in town from Kraków for a week of trade fairs", "ist für eine Messewoche aus Krakau in der Stadt", "ha venido de Cracovia para una semana de ferias", "{g:przyjechał|przyjechała} z Krakowa na tydzień targów"),
      x("is backpacking from Melbourne and staying in a hostel nearby", "ist als {g:Backpacker|Backpackerin} aus Melbourne unterwegs und wohnt in einem Hostel in der Nähe", "viaja de {g:mochilero|mochilera} desde Melbourne y se aloja en un hostal cercano", "podróżuje z plecakiem z Melbourne i nocuje w pobliskim hostelu"),
      x("is visiting a friend who lives round the corner, from Milan", "besucht aus Mailand eine Freundin, die um die Ecke wohnt", "ha venido de Milán a visitar a una amiga que vive a la vuelta de la esquina", "{g:przyjechał|przyjechała} z Mediolanu do przyjaciółki, która mieszka za rogiem"),
      x("is on a city break from Leeds", "macht einen Städtetrip aus Leeds", "está de escapada desde Leeds", "jest na krótkim wypadzie z Leeds"),
    ],
    lunchRoutine: [
      { t: x("Wanders the neighbourhood and picks lunch spots from map reviews and the look of the window.", "Streift durch den Kiez und sucht Mittagslokale nach Bewertungen auf der Karte und nach dem Schaufenster aus.", "Pasea por el barrio y elige dónde comer por las reseñas del mapa y el aspecto del escaparate.", "Krąży po okolicy i wybiera miejsca na lunch według opinii w mapach i wyglądu witryny.") },
      { t: x("Eats out every day while in town and likes places that feel local.", "Isst in der Stadt jeden Tag auswärts und mag Orte, die sich nach Kiez anfühlen.", "Come fuera todos los días mientras está en la ciudad y le gustan los sitios con ambiente de barrio.", "Podczas pobytu codziennie je na mieście i lubi miejsca z lokalnym klimatem.") },
    ],
    coffeeRoutine: [
      { t: x("Stops for {a_item} while exploring the neighbourhood.", "Macht beim Erkunden des Kiezes Halt für {einen_item}.", "Se para a tomar {un_item} mientras explora el barrio.", "Zwiedzając okolicę, zatrzymuje się na {item}.") },
      { t: x("Looks for a good {item} every morning before sightseeing.", "Sucht jeden Morgen vor dem Sightseeing nach gutem Kaffee.", "Busca un buen café cada mañana antes de hacer turismo.", "Każdego ranka przed zwiedzaniem szuka dobrej kawy.") },
    ],
    quirks: [
      q(x("reads every review before going in", "liest jede Bewertung, bevor {g:er|sie} reingeht", "lee todas las reseñas antes de entrar", "zanim wejdzie, czyta wszystkie opinie")),
      q(x("takes photos of chalkboards", "fotografiert Kreidetafeln", "fotografía las pizarras", "fotografuje tablice kredowe")),
      q(x("speaks English and a little German", "spricht Englisch und ein bisschen Deutsch", "habla inglés y un poco de alemán", "mówi po angielsku i trochę po niemiecku")),
      q(x("wants to eat 'like a local'", "will essen „wie die Leute von hier“", "quiere comer «como la gente de aquí»", "chce jeść „jak miejscowi”")),
    ],
    extras: [
      x("{S} will only be around for a few days.", "{S} ist nur ein paar Tage hier.", "Solo estará por aquí unos días.", "Będzie tu tylko kilka dni."),
      x("Prices back home make things here look cheap or expensive, depending on the day.", "Im Vergleich zu zu Hause wirkt hier manches billig und manches teuer, je nach Tag.", "Comparado con su país, aquí unas cosas parecen baratas y otras caras, según el día.", "W porównaniu z domem jedne rzeczy wydają się tu tanie, inne drogie, zależnie od dnia."),
      x("A friend gave {o} a list of Berlin cafés, and {s} is ticking them off.", "Eine Freundin hat {g:ihm|ihr} eine Liste mit Berliner Cafés gegeben, die {g:er|sie} jetzt abhakt.", "Una amiga le dio una lista de cafés de Berlín y la va tachando.", "Przyjaciółka dała {g:mu|jej} listę berlińskich kawiarni, którą teraz odhacza."),
    ],
    represents: {
      lunch_offer: x("visitors who find the café on a map or by walking past", "Gäste von außerhalb, die das Café über die Karte oder im Vorbeigehen finden", "visitantes que encuentran el café en el mapa o al pasar por delante", "przyjezdnych, którzy znajdują kawiarnię w mapach albo przechodząc obok"),
      price_change: x("visitors who find the café on a map or by walking past", "Gäste von außerhalb, die das Café über die Karte oder im Vorbeigehen finden", "visitantes que encuentran el café en el mapa o al pasar por delante", "przyjezdnych, którzy znajdują kawiarnię w mapach albo przechodząc obok"),
    },
  },
  retiree: {
    jobs: [
      x("drove trams for thirty-five years and still knows every timetable", "ist fünfunddreißig Jahre Tram gefahren und kennt immer noch jeden Fahrplan", "condujo tranvías durante treinta y cinco años y aún se sabe todos los horarios", "przez trzydzieści pięć lat {g:prowadził|prowadziła} tramwaje i wciąż zna każdy rozkład"),
      x("is a retired primary-school teacher", "ist {g:pensionierter Grundschullehrer|pensionierte Grundschullehrerin}", "es {g:maestro de primaria jubilado|maestra de primaria jubilada}", "jest {g:emerytowanym nauczycielem|emerytowaną nauczycielką} ze szkoły podstawowej"),
      x("used to run a tailoring shop two streets away", "hatte früher eine Schneiderei zwei Straßen weiter", "tenía una sastrería a dos calles de aquí", "{g:prowadził|prowadziła} kiedyś zakład krawiecki dwie ulice dalej"),
      x("worked as a hospital cook and has opinions about soup", "war {g:Koch|Köchin} im Krankenhaus und hat eine klare Meinung zu Suppe", "fue {g:cocinero|cocinera} de hospital y tiene opiniones firmes sobre la sopa", "{g:był kucharzem|była kucharką} w szpitalu i ma swoje zdanie o zupach"),
      x("worked at the post office counter for forty years", "hat vierzig Jahre am Postschalter gearbeitet", "trabajó cuarenta años en la ventanilla de Correos", "przez czterdzieści lat {g:pracował|pracowała} w okienku na poczcie"),
    ],
    lunchRoutine: [
      { t: x("Goes out for lunch on Tuesdays and Thursdays and cooks at home the rest of the week; likes a proper bowl of soup.", "Geht dienstags und donnerstags essen und kocht sonst zu Hause; mag eine ordentliche Schale Suppe.", "Sale a comer los martes y jueves y el resto de la semana cocina en casa; le gusta un buen plato de sopa.", "We wtorki i czwartki je na mieście, w pozostałe dni gotuje w domu; lubi porządny talerz zupy.") },
      { t: x("Eats a late lunch out once a week with a friend from the choir.", "Isst einmal die Woche spät zu Mittag, zusammen mit einer Freundin aus dem Chor.", "Una vez por semana come tarde fuera con una amiga del coro.", "Raz w tygodniu je późny lunch na mieście z przyjaciółką z chóru."), tags: ["sitter"] },
    ],
    coffeeRoutine: [
      { t: x("Meets a friend for {a_item} on Tuesday and Thursday mornings.", "Trifft sich dienstags und donnerstags vormittags mit einer Freundin auf {einen_item}.", "Queda con una amiga los martes y jueves por la mañana para tomar {un_item}.", "We wtorki i czwartki rano spotyka się z przyjaciółką na {item}.") },
      { t: x("Takes {a_item} at the window after the morning walk, three times a week.", "Trinkt dreimal die Woche nach dem Morgenspaziergang {einen_item} am Fenster.", "Tres veces por semana se toma {un_item} junto a la ventana después del paseo de la mañana.", "Trzy razy w tygodniu po porannym spacerze pije {item} przy oknie."), tags: ["sitter"] },
    ],
    quirks: [
      q(x("pays in coins", "zahlt mit Münzen", "paga con monedas", "płaci monetami")),
      q(x("reads the board outside carefully, with glasses", "liest die Tafel draußen genau, mit Brille", "lee la pizarra de fuera con atención, con gafas", "dokładnie czyta tablicę przed wejściem, w okularach")),
      q(x("notices when portions shrink", "merkt, wenn die Portionen kleiner werden", "nota cuando las raciones encogen", "zauważa, kiedy porcje maleją")),
      q(x("comes with a friend from the choir", "kommt mit einer Freundin aus dem Chor", "viene con una amiga del coro", "przychodzi z przyjaciółką z chóru")),
    ],
    extras: [
      x("The pension goes up more slowly than prices, and {s} keeps a little notebook of what things cost.", "Die Rente steigt langsamer als die Preise, und {s} führt ein kleines Heft, was was kostet.", "La pensión sube más despacio que los precios, y apunta en una libretita lo que cuesta cada cosa.", "Emerytura rośnie wolniej niż ceny, więc zapisuje w zeszyciku, ile co kosztuje."),
      x("{S} has lived in the area long enough to remember when the café was a butcher's.", "{S} wohnt lange genug im Kiez, um sich zu erinnern, dass im Café früher eine Fleischerei war.", "Lleva tanto tiempo en el barrio que recuerda cuando el café era una carnicería.", "Mieszka tu na tyle długo, że pamięta, jak w miejscu kawiarni był sklep mięsny."),
      x("The neighbours' posts on nebenan.de are {p} favourite reading.", "Die Nachbarschaftsbeiträge auf nebenan.de sind {g:seine|ihre} Lieblingslektüre.", "Los avisos de los vecinos en nebenan.de son su lectura favorita.", "Ogłoszenia sąsiadów na nebenan.de to {g:jego|jej} ulubiona lektura."),
    ],
    represents: {
      lunch_offer: x("older neighbours who eat out on a few fixed days a week", "ältere Nachbarn, die an ein paar festen Tagen pro Woche auswärts essen", "vecinos mayores que comen fuera unos pocos días fijos a la semana", "starszych sąsiadów, którzy jadają na mieście w kilka stałych dni w tygodniu"),
      price_change: x("older neighbours on fixed incomes who come on set days", "ältere Nachbarn mit fester Rente, die an festen Tagen kommen", "vecinos mayores con ingresos fijos que vienen ciertos días", "starszych sąsiadów ze stałym dochodem, którzy przychodzą w ustalone dni"),
    },
  },
  trades: {
    jobs: [
      x("is an electrician rewiring flats on the next street for a few weeks", "ist {g:Elektriker|Elektrikerin} und verlegt ein paar Wochen lang Leitungen in Wohnungen in der Nachbarstraße", "es electricista y durante unas semanas renueva la instalación de pisos en la calle de al lado", "jest {g:elektrykiem|elektryczką} i przez kilka tygodni wymienia instalację w mieszkaniach na sąsiedniej ulicy"),
      x("is a painter on a renovation job nearby", "ist {g:Maler|Malerin} auf einer Baustelle in der Nähe", "es {g:pintor|pintora} en una reforma cercana", "jest {g:malarzem|malarką} przy remoncie niedaleko"),
      x("drives a delivery van for a local organic wholesaler", "fährt einen Lieferwagen für einen Bio-Großhandel aus dem Kiez", "conduce una furgoneta de reparto para un mayorista ecológico del barrio", "jeździ dostawczakiem dla lokalnej hurtowni ekologicznej"),
      x("is a plumber whose van is often parked outside", "ist {g:Installateur|Installateurin}, und {g:sein|ihr} Transporter parkt oft vor der Tür", "es {g:fontanero|fontanera} y su furgoneta suele estar aparcada en la puerta", "jest {g:hydraulikiem|hydrauliczką}, a {g:jego|jej} bus często stoi przed wejściem"),
    ],
    lunchRoutine: [
      { t: x("Grabs something filling at 11:45 between jobs and eats it in the van.", "Holt sich um 11:45 Uhr zwischen zwei Aufträgen etwas Sättigendes und isst es im Transporter.", "A las 11:45, entre trabajo y trabajo, coge algo contundente y se lo come en la furgoneta.", "O 11:45, między zleceniami, bierze coś sycącego i je w busie."), tags: ["takeaway"] },
      { t: x("Takes a proper lunch break at noon with two workmates and wants it fast.", "Macht um zwölf mit zwei Kollegen richtig Mittagspause und will es schnell.", "Hace una pausa de verdad a mediodía con dos compañeros y quiere que sea rápido.", "W południe robi porządną przerwę z dwoma kolegami i chce, żeby było szybko."), tags: ["hurry"] },
    ],
    coffeeRoutine: [
      { t: x("Picks up {a_item} to go before the first job of the day.", "Holt sich vor dem ersten Auftrag des Tages {einen_item} zum Mitnehmen.", "Recoge {un_item} para llevar antes del primer trabajo del día.", "Przed pierwszym zleceniem dnia bierze {item} na wynos."), tags: ["takeaway"] },
      { t: x("Stops for {a_item} on the morning delivery round.", "Hält auf der Morgenrunde für {einen_item} an.", "Para a tomar {un_item} en la ruta de reparto de la mañana.", "Na porannej trasie zatrzymuje się na {item}."), tags: ["takeaway"] },
    ],
    quirks: [
      q(x("wants big portions", "will große Portionen", "quiere raciones grandes", "chce dużych porcji")),
      q(x("always takes it to go", "nimmt immer alles zum Mitnehmen", "siempre lo pide para llevar", "zawsze bierze na wynos"), "takeaway"),
      q(x("comes with two workmates", "kommt mit zwei Kollegen", "viene con dos compañeros", "przychodzi z dwoma kolegami")),
      q(x("pays in cash and wants it fast", "zahlt bar und will es schnell", "paga en efectivo y lo quiere rápido", "płaci gotówką i chce szybko"), "takeaway", "hurry"),
    ],
    extras: [
      x("The job nearby ends in a few weeks, then it's another part of the city.", "Der Auftrag hier endet in ein paar Wochen, dann geht es in einen anderen Teil der Stadt.", "El trabajo de aquí acaba en unas semanas y luego toca otra parte de la ciudad.", "Zlecenie tutaj kończy się za kilka tygodni, potem inna część miasta."),
      x("{S} rates a place by how long it keeps {o} going in the afternoon.", "{S} bewertet einen Laden danach, wie lange das Essen am Nachmittag vorhält.", "Valora un sitio por cuánto le aguanta la comida por la tarde.", "Ocenia miejsce po tym, na jak długo jedzenie wystarcza po południu."),
      x("Parking the van outside is half the decision.", "Ob der Transporter vor der Tür parken kann, ist die halbe Entscheidung.", "Poder aparcar la furgoneta en la puerta es media decisión.", "Połowa decyzji to to, czy da się zaparkować bus przed wejściem."),
    ],
    represents: {
      lunch_offer: x("tradespeople and drivers working nearby who want something quick and filling", "Handwerker und Fahrer in der Nähe, die etwas Schnelles und Sättigendes wollen", "gente de oficios y repartidores que trabajan cerca y quieren algo rápido y contundente", "fachowców i kierowców pracujących w pobliżu, którzy chcą czegoś szybkiego i sycącego"),
      price_change: x("tradespeople and drivers who grab a coffee to go", "Handwerker und Fahrer, die schnell einen Kaffee zum Mitnehmen holen", "gente de oficios y repartidores que cogen un café para llevar", "fachowców i kierowców, którzy biorą kawę na wynos"),
    },
  },
};

/** What this person remembers about the café (the last line of the story). */
export const MEMORIES: Record<"known" | "new", Record<Persona["attitude"], Tx[]>> = {
  known: {
    fan: [
      x("the rainy afternoon {s} was locked out of {p} flat and the staff let {o} wait inside for two hours with free refills", "der verregnete Nachmittag, an dem {g:er|sie} sich ausgesperrt hatte und das Team {g:ihn|sie} zwei Stunden drinnen warten ließ, mit Kaffee aufs Haus", "aquella tarde de lluvia en que se quedó sin llaves y el personal {g:lo|la} dejó esperar dentro dos horas con café gratis", "deszczowe popołudnie, kiedy {g:zatrzasnął|zatrzasnęła} klucze w mieszkaniu, a obsługa pozwoliła {g:mu|jej} czekać w środku dwie godziny z darmową dolewką"),
      x("the barista remembering {p} order after only the second visit", "die Barista, die sich schon beim zweiten Besuch an {g:seine|ihre} Bestellung erinnerte", "el barista que recordaba su pedido ya en la segunda visita", "barista, który zapamiętał {g:jego|jej} zamówienie już przy drugiej wizycie"),
      x("a birthday when the staff put a candle in {p} slice of cake without being asked", "ein Geburtstag, an dem das Team ungefragt eine Kerze in {g:sein|ihr} Stück Kuchen steckte", "un cumpleaños en que el personal le puso una vela en su trozo de tarta sin que nadie lo pidiera", "urodziny, kiedy obsługa bez pytania wbiła świeczkę w {g:jego|jej} kawałek ciasta"),
      x("the first warm week of spring, sitting by the open window and watching the street wake up", "die erste warme Frühlingswoche am offenen Fenster, während die Straße aufwachte", "la primera semana cálida de primavera, {g:sentado|sentada} junto a la ventana abierta viendo despertar la calle", "pierwszy ciepły tydzień wiosny, siedzenie przy otwartym oknie i patrzenie, jak ulica się budzi"),
    ],
    neutral: [
      x("a good soup on a cold day, though {s} can't remember what kind", "eine gute Suppe an einem kalten Tag, auch wenn {g:er|sie} nicht mehr weiß, welche", "una buena sopa un día de frío, aunque no recuerda de qué era", "dobra zupa w zimny dzień, choć nie pamięta jaka"),
      x("bumping into an old friend there by chance and staying an hour longer than planned", "ein zufälliges Wiedersehen mit einer alten Freundin, das eine Stunde länger dauerte als geplant", "encontrarse allí por casualidad con un viejo amigo y quedarse una hora más de lo previsto", "przypadkowe spotkanie ze starym znajomym i godzina dłużej, niż {g:planował|planowała}"),
      x("decent coffee, slightly too loud music and a table that always wobbles", "ordentlicher Kaffee, etwas zu laute Musik und ein Tisch, der immer wackelt", "café decente, música un poco alta y una mesa que siempre cojea", "przyzwoita kawa, trochę za głośna muzyka i stolik, który zawsze się chwieje"),
      x("being served quickly once when {s} was in a hurry, which {s} noticed because it doesn't happen everywhere", "einmal schnell bedient worden zu sein, als {g:er|sie} es eilig hatte, was {g:ihm|ihr} auffiel, weil es nicht überall so ist", "que una vez {g:lo|la} atendieran rápido cuando tenía prisa, algo que notó porque no pasa en todas partes", "że raz, kiedy się {g:spieszył|spieszyła}, obsłużono {g:go|ją} szybko, co {g:zauważył|zauważyła}, bo nie wszędzie tak jest"),
    ],
    sceptical: [
      x("waiting twelve minutes for a sandwich in the lunch rush and nearly missing a meeting", "zwölf Minuten Warten auf ein Sandwich in der Mittagszeit und fast ein verpasstes Meeting", "esperar doce minutos un bocadillo en plena hora de comer y casi perder una reunión", "dwanaście minut czekania na kanapkę w porze lunchu i prawie spóźnienie na spotkanie"),
      x("paying more than expected for a small coffee and wondering who it was for", "mehr als erwartet für einen kleinen Kaffee zu zahlen und sich zu fragen, für wen das gedacht ist", "pagar más de lo esperado por un café pequeño y preguntarse para quién era ese precio", "zapłacenie więcej, niż się {g:spodziewał|spodziewała}, za małą kawę i pytanie, dla kogo ta cena"),
      x("a 'special' that tasted a lot like yesterday's quiche warmed up", "ein „Tagesgericht“, das sehr nach aufgewärmter Quiche von gestern schmeckte", "un «plato del día» que sabía mucho a la quiche de ayer recalentada", "„danie dnia”, które smakowało jak odgrzana wczorajsza quiche"),
      x("standing at the counter while two of the staff finished their conversation first", "an der Theke zu stehen, während zwei aus dem Team erst ihr Gespräch beendeten", "esperar en la barra mientras dos del personal terminaban su conversación", "stanie przy ladzie, gdy dwie osoby z obsługi najpierw kończyły rozmowę"),
    ],
  },
  new: {
    fan: [
      x("one very good cinnamon bun on {p} first and only visit, eaten standing at the window", "eine sehr gute Zimtschnecke beim ersten und einzigen Besuch, im Stehen am Fenster gegessen", "un rollo de canela buenísimo en su primera y única visita, comido de pie junto a la ventana", "bardzo dobra drożdżówka z cynamonem podczas pierwszej i jedynej wizyty, zjedzona na stojąco przy oknie"),
      x("a friend's photo of the counter, with a note saying 'you'd like this place'", "das Foto einer Freundin von der Theke, mit dem Satz „Das würde dir gefallen“", "la foto de la barra que le mandó una amiga con un «este sitio te gustaría»", "zdjęcie lady od przyjaciółki z dopiskiem „spodobałoby ci się tu”"),
    ],
    neutral: [
      x("walking past it twice and noticing the plants in the window, but never going in", "zweimal daran vorbeigegangen zu sein und die Pflanzen im Fenster bemerkt zu haben, aber nie hineingegangen zu sein", "haber pasado dos veces por delante y fijarse en las plantas del escaparate, sin entrar nunca", "dwa razy {g:przechodził|przechodziła} obok i {g:widział|widziała} rośliny w oknie, ale nigdy nie {g:wszedł|weszła}"),
      x("a photo of the counter on Google Maps, with a queue in it", "ein Foto der Theke auf Google Maps, mit Schlange davor", "una foto de la barra en Google Maps, con cola delante", "zdjęcie lady w Mapach Google, z kolejką"),
    ],
    sceptical: [
      x("a three-star review on Google Maps that complained about slow service", "eine Drei-Sterne-Bewertung auf Google Maps, die über langsamen Service klagte", "una reseña de tres estrellas en Google Maps que se quejaba del servicio lento", "opinia na trzy gwiazdki w Mapach Google, narzekająca na wolną obsługę"),
      x("peering in once, seeing every table taken and walking on", "einmal reingeschaut, alle Tische besetzt gesehen und weitergegangen", "asomarse una vez, ver todas las mesas ocupadas y seguir andando", "raz {g:zajrzał|zajrzała}, {g:zobaczył|zobaczyła} same zajęte stoliki i {g:poszedł|poszła} dalej"),
    ],
  },
};

/** Story sentences. {spend}, {alts}, {channels}, {cafe}, {memory} are filled by personas.ts. */
export const STORY = {
  money: {
    lunch_offer: {
      high: x("Money is tight, so {s} notices every price; lunch out usually comes to about {spend}.", "Das Geld ist knapp, also achtet {s} auf jeden Preis; auswärts essen kostet meist etwa {spend}.", "Va justo de dinero, así que se fija en cada precio; comer fuera le suele salir por unos {spend}.", "Pieniędzy jest mało, więc zwraca uwagę na każdą cenę; lunch na mieście kosztuje zwykle około {spend}."),
      medium: x("{S} doesn't count every cent but has a feel for what lunch should cost, usually about {spend}.", "{S} zählt nicht jeden Cent, hat aber ein Gefühl dafür, was Mittagessen kosten darf, meist etwa {spend}.", "No cuenta cada céntimo, pero sabe más o menos lo que debe costar una comida: unos {spend}.", "Nie liczy każdego centa, ale wie, ile powinien kosztować lunch: zwykle około {spend}."),
      low: x("Price rarely decides it for {o}; time, habit and taste do. Lunch out usually comes to about {spend}.", "Der Preis entscheidet bei {g:ihm|ihr} selten; Zeit, Gewohnheit und Geschmack schon. Auswärts essen kostet meist etwa {spend}.", "El precio casi nunca decide; deciden el tiempo, la costumbre y el gusto. Comer fuera le sale por unos {spend}.", "Cena rzadko decyduje; decydują czas, nawyk i smak. Lunch na mieście kosztuje zwykle około {spend}."),
    },
    price_change: {
      high: x("Money is tight, so {s} notices every price; a visit usually comes to about {spend}.", "Das Geld ist knapp, also achtet {s} auf jeden Preis; ein Besuch kostet meist etwa {spend}.", "Va justo de dinero, así que se fija en cada precio; cada visita le sale por unos {spend}.", "Pieniędzy jest mało, więc zwraca uwagę na każdą cenę; jedna wizyta kosztuje zwykle około {spend}."),
      medium: x("{S} doesn't count every cent but has a feel for what things should cost; a visit usually comes to about {spend}.", "{S} zählt nicht jeden Cent, hat aber ein Gefühl dafür, was etwas kosten darf; ein Besuch kostet meist etwa {spend}.", "No cuenta cada céntimo, pero sabe lo que deberían costar las cosas; cada visita le sale por unos {spend}.", "Nie liczy każdego centa, ale wie, ile co powinno kosztować; jedna wizyta to zwykle około {spend}."),
      low: x("Price rarely decides it for {o}; habit and taste do. A visit usually comes to about {spend}.", "Der Preis entscheidet bei {g:ihm|ihr} selten; Gewohnheit und Geschmack schon. Ein Besuch kostet meist etwa {spend}.", "El precio casi nunca decide; deciden la costumbre y el gusto. Cada visita le sale por unos {spend}.", "Cena rzadko decyduje; decydują nawyk i smak. Jedna wizyta to zwykle około {spend}."),
    },
  },
  alternatives: {
    lunch_offer: x("On days {s} doesn't eat here, it's usually {alts}.", "An anderen Tagen isst {s} meist {alts}.", "Los días que no come aquí, suele tocar {alts}.", "W inne dni je zwykle {alts}."),
    price_change: x("Otherwise {s} gets coffee at {alts}.", "Sonst trinkt {s} Kaffee {alts}.", "Si no, toma café {alts}.", "Poza tym pije kawę {alts}."),
  },
  channels: x("{S} usually hears about new things {channels}.", "Von Neuem erfährt {s} meist {channels}.", "Suele enterarse de las novedades {channels}.", "O nowościach dowiaduje się zwykle {channels}."),
  memory: x("What {s} remembers about {cafe}: {memory}.", "Was {g:ihm|ihr} von {cafe} in Erinnerung ist: {memory}.", "Lo que recuerda de {cafe}: {memory}.", "Co pamięta z {cafe}: {memory}."),
};

// ---------------------------------------------------------------- places and channels

export interface PlaceText {
  /** "Ate at …", "got it at …": en without the preposition; de/es/pl with it. */
  at: Tx;
  /** "Went to …": en without the preposition; de/es/pl with it. */
  to: Tx;
  /** The place as a subject ("The bakery on the corner is cheaper"). */
  nom: Tx;
}

export const PLACES: Record<string, PlaceText> = {
  bakery: {
    at: x("the bakery on the corner", "beim Bäcker an der Ecke", "en la panadería de la esquina", "w piekarni na rogu"),
    to: x("the bakery on the corner", "zum Bäcker an der Ecke", "a la panadería de la esquina", "do piekarni na rogu"),
    nom: x("the bakery on the corner", "der Bäcker an der Ecke", "la panadería de la esquina", "piekarnia na rogu"),
  },
  spaeti: {
    at: x("the Späti across the road", "beim Späti gegenüber", "en el Späti de enfrente", "w Späti naprzeciwko"),
    to: x("the Späti across the road", "zum Späti gegenüber", "al Späti de enfrente", "do Späti naprzeciwko"),
    nom: x("the Späti across the road", "der Späti gegenüber", "el Späti de enfrente", "Späti naprzeciwko"),
  },
  canteen: {
    at: x("the canteen at work", "in der Kantine", "en el comedor del trabajo", "w stołówce w pracy"),
    to: x("the canteen at work", "in die Kantine", "al comedor del trabajo", "do stołówki w pracy"),
    nom: x("the canteen at work", "die Kantine", "el comedor del trabajo", "stołówka w pracy"),
  },
  uni: {
    at: x("the Mensa at uni", "in der Mensa", "en el comedor de la uni", "w stołówce na uczelni"),
    to: x("the Mensa at uni", "in die Mensa", "al comedor de la uni", "do stołówki na uczelni"),
    nom: x("the Mensa at uni", "die Mensa", "el comedor de la uni", "stołówka na uczelni"),
  },
  doener: {
    at: x("the döner place by the U-Bahn", "beim Döner am U-Bahnhof", "en el döner junto al U-Bahn", "w budce z kebabem przy metrze"),
    to: x("the döner place by the U-Bahn", "zum Döner am U-Bahnhof", "al döner junto al U-Bahn", "do budki z kebabem przy metrze"),
    nom: x("the döner place by the U-Bahn", "der Döner am U-Bahnhof", "el döner junto al U-Bahn", "budka z kebabem przy metrze"),
  },
  vietnamese: {
    at: x("the Vietnamese place round the corner", "beim Vietnamesen um die Ecke", "en el vietnamita de la esquina", "w wietnamskiej knajpce za rogiem"),
    to: x("the Vietnamese place round the corner", "zum Vietnamesen um die Ecke", "al vietnamita de la esquina", "do wietnamskiej knajpki za rogiem"),
    nom: x("the Vietnamese place round the corner", "der Vietnamese um die Ecke", "el vietnamita de la esquina", "wietnamska knajpka za rogiem"),
  },
  work: {
    at: x("the machine at work", "am Automaten bei der Arbeit", "en la máquina del trabajo", "przy automacie w pracy"),
    to: x("the machine at work", "zum Automaten bei der Arbeit", "a la máquina del trabajo", "do automatu w pracy"),
    nom: x("the machine at work", "der Automat bei der Arbeit", "la máquina del trabajo", "automat w pracy"),
  },
  uni_machine: {
    at: x("the machine at uni", "am Automaten an der Uni", "en la máquina de la uni", "przy automacie na uczelni"),
    to: x("the machine at uni", "zum Automaten an der Uni", "a la máquina de la uni", "do automatu na uczelni"),
    nom: x("the machine at uni", "der Automat an der Uni", "la máquina de la uni", "automat na uczelni"),
  },
  chain: {
    at: x("the chain café by the U-Bahn", "bei der Café-Kette am U-Bahnhof", "en la cadena de cafeterías junto al U-Bahn", "w sieciówce przy metrze"),
    to: x("the chain café by the U-Bahn", "zur Café-Kette am U-Bahnhof", "a la cadena de cafeterías junto al U-Bahn", "do sieciówki przy metrze"),
    nom: x("the chain café by the U-Bahn", "die Café-Kette am U-Bahnhof", "la cadena de cafeterías junto al U-Bahn", "sieciówka przy metrze"),
  },
  /** The new café of the "rival_lunch" event (and any free-text competitor event). */
  rival: {
    at: x("the new café two doors down", "im neuen Café zwei Häuser weiter", "en el café nuevo de dos portales más allá", "w nowej kawiarni dwa budynki dalej"),
    to: x("the new café two doors down", "ins neue Café zwei Häuser weiter", "al café nuevo de dos portales más allá", "do nowej kawiarni dwa budynki dalej"),
    nom: x("the new café two doors down", "das neue Café zwei Häuser weiter", "el café nuevo de dos portales más allá", "nowa kawiarnia dwa budynki dalej"),
  },
};

/** What a persona does instead, as listed in their story and card. `place` links to PLACES. */
export interface AltText {
  text: Tx;
  place?: keyof typeof PLACES;
}

export const LUNCH_ALTS: Record<string, AltText> = {
  bakery: { text: x("the bakery on the corner", "beim Bäcker an der Ecke", "algo de la panadería de la esquina", "coś z piekarni na rogu"), place: "bakery" },
  spaeti: { text: x("a sandwich from the Späti across the road", "ein Sandwich vom Späti gegenüber", "un bocadillo del Späti de enfrente", "kanapkę ze Späti naprzeciwko"), place: "spaeti" },
  canteen: { text: x("the canteen at work", "in der Kantine", "el comedor del trabajo", "w stołówce w pracy"), place: "canteen" },
  uni: { text: x("the Mensa at uni", "in der Mensa", "el comedor de la uni", "w stołówce na uczelni"), place: "uni" },
  doener: { text: x("the döner place by the U-Bahn", "einen Döner am U-Bahnhof", "un döner del sitio junto al U-Bahn", "kebaba z budki przy metrze"), place: "doener" },
  vietnamese: { text: x("the Vietnamese place round the corner", "beim Vietnamesen um die Ecke", "el vietnamita de la esquina", "w wietnamskiej knajpce za rogiem"), place: "vietnamese" },
  homemade: { text: x("a home-made lunchbox", "Selbstgemachtes aus der Brotdose", "un táper de casa", "lunch z domu w pudełku") },
};

export const COFFEE_ALTS: Record<string, AltText> = {
  bakery: { text: x("the bakery on the corner", "beim Bäcker an der Ecke", "en la panadería de la esquina", "z piekarni na rogu"), place: "bakery" },
  spaeti: { text: x("the Späti across the road", "vom Späti gegenüber", "del Späti de enfrente", "ze Späti naprzeciwko"), place: "spaeti" },
  work: { text: x("the machine at work", "aus dem Automaten bei der Arbeit", "de la máquina del trabajo", "z automatu w pracy"), place: "work" },
  uni: { text: x("the machine at uni", "aus dem Automaten an der Uni", "de la máquina de la uni", "z automatu na uczelni"), place: "uni_machine" },
  chain: { text: x("the chain café by the U-Bahn", "bei der Café-Kette am U-Bahnhof", "en la cadena junto al U-Bahn", "w sieciówce przy metrze"), place: "chain" },
  home: { text: x("home, with a moka pot", "zu Hause aus der Mokkakanne", "en casa, con la cafetera italiana", "w domu, z kawiarki") },
};

/** How a persona hears about new things. Ids are stored in Persona.channels. */
export const CHANNEL_TEXT: Record<string, Tx> = {
  "walks past": x("by walking past", "im Vorbeigehen", "al pasar por delante", "przechodząc obok"),
  Instagram: x("on Instagram", "auf Instagram", "en Instagram", "na Instagramie"),
  "Google Maps": x("on Google Maps", "auf Google Maps", "en Google Maps", "w Mapach Google"),
  "nebenan.de": x("on nebenan.de", "auf nebenan.de", "en nebenan.de, la red de vecinos", "na nebenan.de, portalu sąsiedzkim"),
  "the house WhatsApp group": x("in the house's WhatsApp group", "in der WhatsApp-Gruppe des Hauses", "en el grupo de WhatsApp del edificio", "na grupie WhatsApp mieszkańców kamienicy"),
  "a colleague or friend": x("from colleagues and friends", "von Kollegen und Freunden", "por compañeros y amigos", "od znajomych z pracy i przyjaciół"),
  "a neighbour": x("from neighbours", "von Nachbarn", "por los vecinos", "od sąsiadów"),
  "the board outside": x("from the board outside", "von der Tafel vor der Tür", "por la pizarra de la puerta", "z tablicy przed wejściem"),
  "the staff": x("from chatting with the staff", "im Gespräch mit dem Team", "charlando con el personal", "z rozmów z obsługą"),
};

// ---------------------------------------------------------------- the change, as customers see it

export const CHANGE_TEXT = {
  defaultContents: x("soup, sandwich and a drink", "Suppe, Sandwich und ein Getränk", "sopa, bocadillo y bebida", "zupa, kanapka i napój"),
  defaultItem: x("flat white", "Flat White", "flat white", "flat white"),
  cafeFallback: x("the café", "Café", "el café", "kawiarnia"),
  lunchBoard: x("Lunch deal — {contents} for {price}, weekdays {hours}", "Mittagsangebot — {contents} für {price}, Mo–Fr {hours}", "Menú del día — {contents} por {price}, de lunes a viernes, {hours}", "Zestaw lunchowy — {contents} za {price}, pon.–pt. {hours}"),
  lunchChange: x("Lunch deal: {contents} for {price}, weekdays {hours}", "Mittagsangebot: {contents} für {price}, Mo–Fr {hours}", "Menú del día: {contents} por {price}, de lunes a viernes, {hours}", "Zestaw lunchowy: {contents} za {price}, pon.–pt. {hours}"),
  lunchPromoted: x("New: lunch deal — {contents} for {price}, weekdays {hours}. (Sponsored post, shown to people nearby.)", "Neu: Mittagsangebot — {contents} für {price}, Mo–Fr {hours}. (Gesponserter Beitrag, wird Leuten in der Nähe angezeigt.)", "Novedad: menú del día — {contents} por {price}, de lunes a viernes, {hours}. (Publicación patrocinada, se muestra a gente de la zona.)", "Nowość: zestaw lunchowy — {contents} za {price}, pon.–pt. {hours}. (Post sponsorowany, wyświetlany osobom z okolicy.)"),
  lunchAnnounce: x("New from Monday: lunch deal — {contents} for {price}, weekdays {hours}.", "Neu ab Montag: Mittagsangebot — {contents} für {price}, Mo–Fr {hours}.", "Desde el lunes: menú del día — {contents} por {price}, de lunes a viernes, {hours}.", "Od poniedziałku: zestaw lunchowy — {contents} za {price}, pon.–pt. {hours}."),
  priceBoardCut: x("{Item} {price} (was {old})", "{Item} {price} (vorher {old})", "{Item} {price} (antes {old})", "{Item} {price} (wcześniej {old})"),
  priceBoard: x("{Item} {price}", "{Item} {price}", "{Item} {price}", "{Item} {price}"),
  priceChange: x("{Item} now {price} (was {old})", "{Item} jetzt {price} (vorher {old})", "{Item} ahora a {price} (antes {old})", "{Item} teraz {price} (wcześniej {old})"),
  priceAnnounceCut: x("Good news: our {item} is now {price} (was {old}).", "Gute Nachricht: {Item} kostet jetzt {price} (vorher {old}).", "Buena noticia: {el_item} ahora cuesta {price} (antes {old}).", "Dobra wiadomość: {item} kosztuje teraz {price} (wcześniej {old})."),
  priceAnnounce: x("New price on the board by the till: {Item} {price}.", "Neuer Preis auf der Tafel an der Kasse: {Item} {price}.", "Nuevo precio en la pizarra de la caja: {Item} {price}.", "Nowa cena na tablicy przy kasie: {Item} {price}."),
  /** Name of the feed entry for owner-injected events. */
  eventFeedName: x("In the neighbourhood", "Im Kiez", "En el barrio", "W okolicy"),
  inKiez: x(" in {kiez}", " in {kiez}", " en {kiez}", " w dzielnicy {kiez}"),
};

const EN_NUMBER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const DE_WEEKS = ["", "einwöchigen", "zweiwöchigen", "dreiwöchigen", "vierwöchigen", "fünfwöchigen", "sechswöchigen", "siebenwöchigen", "achtwöchigen"];
const ES_NUMBER = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];
const PL_WEEKS = ["", "tygodniowego", "dwutygodniowego", "trzytygodniowego", "czterotygodniowego", "pięciotygodniowego", "sześciotygodniowego"];

/**
 * The test as a noun phrase in the form the round texts use:
 * en "two-week test", de genitive "zweiwöchigen Tests", es "prueba de dos semanas", pl genitive "dwutygodniowego testu".
 */
export function testPhrase(days: number, perWeek: number, lang: Lang): string {
  const weeks = days / perWeek;
  const w = Number.isInteger(weeks) && weeks >= 1 ? weeks : 0;
  const d = Math.round(days);
  switch (lang) {
    case "de":
      return w && DE_WEEKS[w] ? `${DE_WEEKS[w]} Tests` : `${d}-tägigen Tests`;
    case "es":
      return w && ES_NUMBER[w] ? `prueba de ${ES_NUMBER[w]} semana${w === 1 ? "" : "s"}` : `prueba de ${d} días`;
    case "pl":
      return w && PL_WEEKS[w] ? `${PL_WEEKS[w]} testu` : `${d}-dniowego testu`;
    default:
      return w && w < EN_NUMBER.length ? `${EN_NUMBER[w]}-week test` : `${d}-day test`;
  }
}

/** The English adjective kept in RehearsalScene.testLength ("two-week"). */
export function testLengthAdjective(days: number, perWeek: number): string {
  const weeks = days / perWeek;
  if (Number.isInteger(weeks) && weeks >= 1 && weeks < EN_NUMBER.length) return `${EN_NUMBER[weeks]}-week`;
  return `${Math.round(days)}-day`;
}

/** A small difference in words: "30 cents", "30 Cent", "30 céntimos", "30 centów"; GBP in pence. */
export function centsWord(c: number, lang: Lang, currency: string): string {
  if (currency === "GBP") return `${c}p`;
  if (lang === "de") return `${c} Cent`;
  if (lang === "es") return `${c} céntimo${c === 1 ? "" : "s"}`;
  if (lang === "pl") {
    const cat = new Intl.PluralRules("pl-PL").select(c);
    return `${c} ${cat === "one" ? "cent" : cat === "few" ? "centy" : "centów"}`;
  }
  return `${c} cent${c === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- rounds

export interface RoundText {
  title: Tx;
  situation: Tx;
}

/** {cafe} {board} {test} {kiez} (" in Neukölln" or "") {promo} {old} are filled by rounds.ts. */
export const LUNCH_ROUNDS: Record<"r1" | "r2" | "r3" | "r4" | "r5" | "end3", RoundText> = {
  r1: {
    title: x("Launch day: the board goes up", "Starttag: Die Tafel steht draußen", "Día de estreno: sale la pizarra", "Pierwszy dzień: tablica stoi przed wejściem"),
    situation: x(
      'Monday, 8:30{kiez}. A chalkboard goes up on the pavement outside {cafe}. The board outside says: "{board}". The same offer is chalked above the counter{promo}',
      "Montag, 8:30 Uhr{kiez}. Vor {cafe} wird eine Kreidetafel auf den Gehweg gestellt. Auf der Tafel steht: „{board}“. Dasselbe Angebot steht mit Kreide über der Theke{promo}",
      "Lunes, 8:30{kiez}. Delante de {cafe} sacan una pizarra a la acera. La pizarra dice: «{board}». La misma oferta está escrita con tiza sobre la barra{promo}",
      "Poniedziałek, 8:30{kiez}. Przed {cafe} ktoś stawia na chodniku tablicę kredową. Na tablicy: „{board}”. Ta sama oferta jest napisana kredą nad ladą{promo}",
    ),
  },
  r2: {
    title: x("First week, Tuesday 12:30", "Erste Woche, Dienstag 12:30 Uhr", "Primera semana, martes 12:30", "Pierwszy tydzień, wtorek 12:30"),
    situation: x(
      'Tuesday of the first week, 12:30. The lunch rush is starting and the board outside still says: "{board}". Through the window: a short queue, a pot of red lentil soup steaming on the counter, sandwiches stacked under glass.',
      "Dienstag in der ersten Woche, 12:30 Uhr. Die Mittagszeit geht los, und draußen steht immer noch: „{board}“. Durchs Fenster: eine kurze Schlange, ein dampfender Topf rote Linsensuppe auf der Theke, belegte Brote unter Glas.",
      "Martes de la primera semana, 12:30. Empieza la hora punta del mediodía y la pizarra sigue diciendo: «{board}». Por la ventana se ve una cola corta, una olla de sopa de lentejas rojas humeando en la barra y bocadillos apilados bajo la vitrina.",
      "Wtorek w pierwszym tygodniu, 12:30. Zaczyna się pora lunchu, a na tablicy wciąż: „{board}”. Przez okno widać krótką kolejkę, parujący garnek zupy z czerwonej soczewicy na ladzie i kanapki ułożone pod szkłem.",
    ),
  },
  r3: {
    title: x("Second week", "Zweite Woche", "Segunda semana", "Drugi tydzień"),
    situation: x(
      'Wednesday of the second week, 12:45. The deal is still on the board outside {cafe}: "{board}". Most tables are taken, the coffee machine is hissing, and two people in work boots are waiting for their order to go.',
      "Mittwoch in der zweiten Woche, 12:45 Uhr. Das Angebot steht immer noch auf der Tafel vor {cafe}: „{board}“. Die meisten Tische sind besetzt, die Kaffeemaschine zischt, und zwei Leute in Arbeitsschuhen warten auf ihr Essen zum Mitnehmen.",
      "Miércoles de la segunda semana, 12:45. La oferta sigue en la pizarra delante de {cafe}: «{board}». Casi todas las mesas están ocupadas, la cafetera silba y dos personas con botas de trabajo esperan su pedido para llevar.",
      "Środa w drugim tygodniu, 12:45. Oferta wciąż wisi na tablicy przed {cafe}: „{board}”. Prawie wszystkie stoliki są zajęte, ekspres syczy, a dwie osoby w roboczych butach czekają na jedzenie na wynos.",
    ),
  },
  r4: {
    title: x("After the test", "Nach dem Test", "Después de la prueba", "Po teście"),
    situation: x(
      'Friday at the end of the {test}, 12:30. A note has appeared under the board: "Lunch deal: we\'re deciding whether to keep it. Tell us what you think!" The rest of the menu is the same as always.',
      "Freitag am Ende des {test}, 12:30 Uhr. Unter der Tafel hängt ein Zettel: „Mittagsangebot: Wir überlegen, ob wir es behalten. Sagt uns eure Meinung!“ Der Rest der Karte ist wie immer.",
      "Viernes, al final de la {test}, 12:30. Debajo de la pizarra han puesto una nota: «Menú del día: estamos decidiendo si lo mantenemos. ¡Dinos qué te parece!». El resto de la carta sigue igual.",
      "Piątek na koniec {test}, 12:30. Pod tablicą pojawiła się kartka: „Zestaw lunchowy: zastanawiamy się, czy go zostawić. Napiszcie, co myślicie!” Reszta menu jest taka jak zawsze.",
    ),
  },
  r5: {
    title: x("A month later", "Einen Monat später", "Un mes después", "Miesiąc później"),
    situation: x(
      'A month later, a grey Wednesday at 12:30. The owner has kept the deal and the board still says: "{board}". Some lunchtime faces are new; some are the same as ever.',
      "Einen Monat später, ein grauer Mittwoch, 12:30 Uhr. Das Angebot ist geblieben, auf der Tafel steht weiter: „{board}“. Manche Gesichter zur Mittagszeit sind neu, manche wie immer.",
      "Un mes después, un miércoles gris a las 12:30. El café ha mantenido la oferta y la pizarra sigue diciendo: «{board}». Algunas caras del mediodía son nuevas; otras, las de siempre.",
      "Miesiąc później, szara środa, 12:30. Kawiarnia zostawiła zestaw, a na tablicy wciąż: „{board}”. Część twarzy w porze lunchu jest nowa, część — jak zawsze.",
    ),
  },
  end3: {
    title: x("Second week and the end of the test", "Zweite Woche und Ende des Tests", "Segunda semana y final de la prueba", "Drugi tydzień i koniec testu"),
    situation: x(
      'The second week of the {test}, Thursday 12:45. The deal is still on the board outside {cafe}: "{board}". A note has appeared under it: "We\'re deciding whether to keep it. Tell us what you think!"',
      "Zweite Woche des {test}, Donnerstag 12:45 Uhr. Das Angebot steht immer noch auf der Tafel vor {cafe}: „{board}“. Darunter hängt ein Zettel: „Wir überlegen, ob wir es behalten. Sagt uns eure Meinung!“",
      "Segunda semana de la {test}, jueves 12:45. La oferta sigue en la pizarra delante de {cafe}: «{board}». Debajo han puesto una nota: «Estamos decidiendo si lo mantenemos. ¡Dinos qué te parece!».",
      "Drugi tydzień {test}, czwartek 12:45. Oferta wciąż wisi na tablicy przed {cafe}: „{board}”. Pod spodem pojawiła się kartka: „Zastanawiamy się, czy go zostawić. Napiszcie, co myślicie!”",
    ),
  },
};

export const LUNCH_PROMO: { promoted: Tx; plain: Tx } = {
  promoted: x(", and a sponsored Instagram post shows a photo of the board to people nearby.", ", und ein gesponserter Instagram-Beitrag zeigt Leuten in der Nähe ein Foto der Tafel.", ", y una publicación patrocinada en Instagram enseña una foto de la pizarra a la gente de la zona.", ", a sponsorowany post na Instagramie pokazuje zdjęcie tablicy osobom z okolicy."),
  plain: x(", and the café posts a photo of the board on Instagram.", ", und das Café postet ein Foto der Tafel auf Instagram.", ", y el café sube una foto de la pizarra a Instagram.", ", a kawiarnia wrzuca zdjęcie tablicy na Instagram."),
};

export const PRICE_ROUNDS: Record<"r1" | "r2" | "r3" | "r4" | "r5" | "end3", RoundText> = {
  r1: {
    title: x("Sees the new price", "Der neue Preis", "El precio nuevo", "Nowa cena"),
    situation: x(
      'Monday morning at {cafe}{kiez}. The menu board above the till has been updated: "{board}". Last week it said {old}. Nothing else on the board has changed, and nobody at the counter mentions it.',
      "Montagmorgen, {cafe}{kiez}. Die Preistafel über der Kasse ist neu beschriftet: „{board}“. Letzte Woche stand dort {old}. Sonst hat sich auf der Tafel nichts geändert, und an der Theke sagt niemand etwas dazu.",
      "Lunes por la mañana en {cafe}{kiez}. La pizarra de precios sobre la caja está actualizada: «{board}». La semana pasada ponía {old}. Nada más ha cambiado en la pizarra y nadie en la barra lo menciona.",
      "Poniedziałek rano, {cafe}{kiez}. Tablica z cenami nad kasą została zmieniona: „{board}”. W zeszłym tygodniu było {old}. Nic innego się nie zmieniło i nikt przy ladzie o tym nie wspomina.",
    ),
  },
  r2: {
    title: x("Next visit", "Der nächste Besuch", "La siguiente visita", "Następna wizyta"),
    situation: x(
      'A few days later, 8:45, a queue of three at the till. The board still says "{board}". The smell of fresh croissants, the grinder going, and the barista asking the person in front: "The usual?"',
      "Ein paar Tage später, 8:45 Uhr, drei Leute in der Schlange an der Kasse. Auf der Tafel steht weiter „{board}“. Es riecht nach frischen Croissants, die Mühle läuft, und die Barista fragt die Person vorne: „Wie immer?“",
      "Unos días después, 8:45, tres personas en la cola de la caja. La pizarra sigue diciendo «{board}». Huele a cruasanes recién hechos, el molinillo suena y la barista le pregunta a quien va delante: «¿Lo de siempre?».",
      "Kilka dni później, 8:45, trzy osoby w kolejce do kasy. Na tablicy wciąż „{board}”. Pachnie świeżymi croissantami, młynek mieli, a barista pyta osobę z przodu: „To co zwykle?”",
    ),
  },
  r3: {
    title: x("Two weeks later", "Zwei Wochen später", "Dos semanas después", "Dwa tygodnie później"),
    situation: x(
      'Two weeks after the change, mid-morning. The board still says "{board}"; by now it is simply the price. At the table by the door, two people are comparing where to get coffee in the neighbourhood.',
      "Zwei Wochen nach der Änderung, am Vormittag. Auf der Tafel steht weiter „{board}“; inzwischen ist das einfach der Preis. Am Tisch an der Tür vergleichen zwei Leute, wo man im Kiez gut Kaffee bekommt.",
      "Dos semanas después del cambio, a media mañana. La pizarra sigue diciendo «{board}»; ya es simplemente el precio. En la mesa junto a la puerta, dos personas comparan dónde tomar café en el barrio.",
      "Dwa tygodnie po zmianie, przed południem. Na tablicy wciąż „{board}”; to już po prostu cena. Przy stoliku przy drzwiach dwie osoby porównują, gdzie w okolicy pić kawę.",
    ),
  },
  r4: {
    title: x("After the test", "Nach dem Test", "Después de la prueba", "Po teście"),
    situation: x(
      'The end of the {test}: the owner keeps the new price. Thursday, 9:00, a queue of four at the till; the board still reads "{board}". A new review card holder has appeared next to the tip jar.',
      "Ende des {test}: Der neue Preis bleibt. Donnerstag, 9:00 Uhr, vier Leute an der Kasse; auf der Tafel steht weiter „{board}“. Neben dem Trinkgeldglas steht jetzt ein Halter mit Bewertungskärtchen.",
      "Final de la {test}: el café mantiene el precio nuevo. Jueves, 9:00, cuatro personas en la cola; la pizarra sigue diciendo «{board}». Junto al bote de propinas ha aparecido un soporte con tarjetas para dejar una reseña.",
      "Koniec {test}: nowa cena zostaje. Czwartek, 9:00, cztery osoby w kolejce; na tablicy wciąż „{board}”. Obok słoika na napiwki pojawił się stojak z kartkami na opinie.",
    ),
  },
  r5: {
    title: x("A month later", "Einen Monat später", "Un mes después", "Miesiąc później"),
    situation: x(
      'A month after the change. "{board}" is just the price now; new customers have never known anything else. A wet Tuesday morning, the window fogged up.',
      "Einen Monat nach der Änderung. „{board}“ ist jetzt einfach der Preis; neue Gäste kennen es nicht anders. Ein nasser Dienstagmorgen, das Fenster ist beschlagen.",
      "Un mes después del cambio. «{board}» ya es simplemente el precio; los clientes nuevos no han conocido otro. Un martes por la mañana lluvioso, con la ventana empañada.",
      "Miesiąc po zmianie. „{board}” to teraz po prostu cena; nowi klienci nie znają innej. Mokry wtorkowy poranek, zaparowane okno.",
    ),
  },
  end3: {
    title: x("Two weeks later: the end of the test", "Zwei Wochen später: Ende des Tests", "Dos semanas después: final de la prueba", "Dwa tygodnie później: koniec testu"),
    situation: x(
      'Two weeks after the change, the end of the {test}. The board still says "{board}"; the owner is keeping it. At the table by the door, two people are comparing where to get coffee in the neighbourhood.',
      "Zwei Wochen nach der Änderung, Ende des {test}. Auf der Tafel steht weiter „{board}“; der Preis bleibt. Am Tisch an der Tür vergleichen zwei Leute, wo man im Kiez gut Kaffee bekommt.",
      "Dos semanas después del cambio, final de la {test}. La pizarra sigue diciendo «{board}»; el precio se queda. En la mesa junto a la puerta, dos personas comparan dónde tomar café en el barrio.",
      "Dwa tygodnie po zmianie, koniec {test}. Na tablicy wciąż „{board}”; cena zostaje. Przy stoliku przy drzwiach dwie osoby porównują, gdzie w okolicy pić kawę.",
    ),
  },
};

// ---------------------------------------------------------------- actions

export const ACTION_LABELS: Record<string, Tx> = {
  not_around: x("Not around this time", "Diesmal nicht in der Gegend", "Esta vez no está por aquí", "Tym razem poza okolicą"),
  notices_offer: x("Notices the offer", "Bemerkt das Angebot", "Se fija en la oferta", "Zauważa ofertę"),
  ignores: x("Doesn't pay attention to it", "Achtet nicht darauf", "No le presta atención", "Nie zwraca na nią uwagi"),
  tries_deal: x("Orders the lunch deal", "Bestellt das Mittagsangebot", "Pide el menú del día", "Zamawia zestaw lunchowy"),
  tries_and_tells: x("Tries the deal and tells someone about it", "Probiert das Angebot und erzählt jemandem davon", "Prueba el menú y se lo cuenta a alguien", "Próbuje zestawu i komuś o nim mówi"),
  usual_order: x("Has the usual order instead", "Bestellt stattdessen das Übliche", "Pide lo de siempre", "Zamawia to, co zwykle"),
  eats_elsewhere: x("Has lunch somewhere else", "Isst woanders zu Mittag", "Come en otro sitio", "Je lunch gdzie indziej"),
  skips_lunch_out: x("Skips lunch out (home-made or nothing)", "Isst nicht auswärts (Mitgebrachtes oder nichts)", "No come fuera (táper o nada)", "Nie je na mieście (z domu albo nic)"),
  comes_back_for_deal: x("Comes back for the deal", "Kommt wieder für das Angebot", "Vuelve a por el menú", "Wraca na zestaw"),
  back_to_usual: x("Back to the usual order", "Wieder das Übliche", "Vuelve a lo de siempre", "Wraca do zwykłego zamówienia"),
  tells_a_friend: x("Tells a friend or colleague about it", "Erzählt Freunden oder Kollegen davon", "Se lo cuenta a un amigo o compañero", "Mówi o tym znajomym lub kolegom"),
  keeps_coming: x("Keeps coming for the deal", "Kommt weiter für das Angebot", "Sigue viniendo a por el menú", "Dalej przychodzi na zestaw"),
  posts_review: x("Posts a review or comment online", "Schreibt eine Bewertung oder einen Kommentar online", "Publica una reseña o un comentario en internet", "Wystawia opinię lub komentarz w internecie"),
  complains: x("Complains about it (to staff or online)", "Beschwert sich (beim Team oder online)", "Se queja (al personal o en internet)", "Narzeka (obsłudze albo w internecie)"),
  forgets_about_it: x("Forgets about it", "Vergisst es", "Se olvida", "Zapomina o tym"),
  still_comes_for_lunch: x("Still has the deal most weeks", "Nimmt das Angebot fast jede Woche", "Sigue pidiendo el menú casi cada semana", "Nadal bierze zestaw prawie co tydzień"),
  comes_now_and_then: x("Has the deal now and then", "Nimmt das Angebot ab und zu", "Pide el menú de vez en cuando", "Bierze zestaw od czasu do czasu"),
  back_to_old_habits: x("Back to old lunch habits", "Zurück zu alten Mittagsgewohnheiten", "Vuelve a sus costumbres de antes", "Wraca do dawnych nawyków"),
  recommends_it: x("Recommends the deal to someone", "Empfiehlt das Angebot weiter", "Recomienda el menú a alguien", "Poleca komuś zestaw"),
  accepts: x("Notices and accepts it", "Bemerkt es und nimmt es hin", "Se da cuenta y lo acepta", "Zauważa i akceptuje"),
  grumbles: x("Grumbles about it out loud", "Meckert laut darüber", "Se queja en voz alta", "Głośno narzeka"),
  does_not_notice: x("Doesn't notice", "Merkt es nicht", "No se da cuenta", "Nie zauważa"),
  buys_as_usual: x("Buys as usual", "Kauft wie immer", "Compra como siempre", "Kupuje jak zwykle"),
  buys_less_often: x("Buys it less often", "Kauft es seltener", "Lo compra menos a menudo", "Kupuje rzadziej"),
  switches_to_cheaper_item: x("Switches to something cheaper", "Nimmt etwas Günstigeres", "Se pasa a algo más barato", "Przerzuca się na coś tańszego"),
  goes_elsewhere: x("Gets it somewhere else", "Holt es sich woanders", "Lo compra en otro sitio", "Kupuje gdzie indziej"),
  keeps_buying: x("Keeps buying it", "Kauft es weiter", "Sigue comprándolo", "Dalej kupuje"),
  tells_friend_it_is_pricey: x("Tells a friend it has got pricey", "Erzählt Bekannten, dass es teurer geworden ist", "Le cuenta a un amigo que se ha encarecido", "Mówi znajomym, że zrobiło się drożej"),
  forgot_about_it: x("Has forgotten about the change", "Hat die Änderung vergessen", "Ya ni se acuerda del cambio", "Nie pamięta już o zmianie"),
  stays_away: x("Stays away", "Bleibt weg", "No vuelve por ahora", "Na razie nie przychodzi"),
  stays_a_customer: x("Stays a customer as before", "Kommt weiter wie bisher", "Sigue siendo cliente como antes", "Dalej przychodzi jak dawniej"),
  buys_less_than_before: x("Buys less than before", "Kauft weniger als vorher", "Compra menos que antes", "Kupuje mniej niż wcześniej"),
  recommends_cafe_anyway: x("Recommends the café anyway", "Empfiehlt das Café trotzdem", "Recomienda el café de todos modos", "I tak poleca kawiarnię"),
  mentions_price_in_review: x("Mentions the price in a review", "Erwähnt den Preis in einer Bewertung", "Menciona el precio en una reseña", "Wspomina o cenie w opinii"),
  still_buys_regularly: x("Still buys it regularly", "Kauft es weiterhin regelmäßig", "Lo sigue comprando con regularidad", "Nadal regularnie kupuje"),
  buys_now_and_then: x("Buys it now and then", "Kauft es ab und zu", "Lo compra de vez en cuando", "Kupuje od czasu do czasu"),
  found_somewhere_cheaper: x("Has found somewhere cheaper", "Hat etwas Günstigeres gefunden", "Ha encontrado un sitio más barato", "Ma już tańsze miejsce"),
  recommends_cafe: x("Recommends the café to someone", "Empfiehlt das Café weiter", "Recomienda el café a alguien", "Poleca komuś kawiarnię"),
};

/** Conditions a rule-based line can require ("!x" in a line means: not x). */
export type Cond =
  | "cheaper" | "pricier" | "sensitive" | "relaxed" | "fan" | "sceptic" | "regular" | "new" | "tried" | "untried" | "heard"
  | "rain" | "heat" | "competitor" | "buzz" | "busy" | "quiet" | "works" | "wfh" | "holiday" | "drop" | "rise" | "tourist"
  | "grumbled" | "takeaway" | "hurry" | "insta";

export interface Line {
  t: Tx;
  /** All conditions must hold. Lines without conditions fit anyone. */
  when?: Cond[];
  /** None of these may hold. */
  not?: Cond[];
  /** What it is about; public words and the diary prefer lines on the same topic as the thought. */
  topic?: string;
}

export interface ActionText {
  thought: Line[];
  diary: Line[];
  says?: Line[];
}

/** The same line, tagged with a topic (see Line.topic). */
function T(topic: string, l: Line): Line {
  return { ...l, topic };
}

/** A line with conditions: L(text, "regular", "!takeaway"). */
function L(t: Tx, ...conds: (Cond | `!${Cond}`)[]): Line {
  const when = conds.filter((c) => !c.startsWith("!")) as Cond[];
  const not = conds.filter((c) => c.startsWith("!")).map((c) => c.slice(1)) as Cond[];
  return { t, ...(when.length ? { when } : {}), ...(not.length ? { not } : {}) };
}

/** Public words shared by the two "told a friend about the lunch deal" actions. */
const LUNCH_SAYS: Line[] = [
  L(x("If you're near {cafe}, the lunch deal is decent: {contents} for {price}.", "Wenn ihr bei {cafe} in der Nähe seid: Das Mittagsangebot ist gut, {contents} für {price}.", "Si estáis cerca de {cafe}, el menú del día está bien: {contents} por {price}.", "Jeśli jesteście koło {cafe}, zestaw lunchowy jest niezły: {contents} za {price}."), "cheaper"),
  L(x("{cafe} does a lunch deal now. Good soup. Go before half twelve, it gets busy.", "{cafe} hat jetzt ein Mittagsangebot. Gute Suppe. Geht vor halb eins hin, dann wird's voll.", "{cafe} tiene ahora menú del día. Buena sopa. Id antes de las doce y media, que se llena.", "{cafe} ma teraz zestaw lunchowy. Dobra zupa. Idźcie przed wpół do pierwszej, potem jest tłoczno."), "sceptic"),
  L(x("Lunch at {cafe} is {price} now for {contents}. Not bad.", "Mittag bei {cafe} kostet jetzt {price} für {contents}. Nicht schlecht.", "Comer en {cafe} ahora son {price} por {contents}. No está mal.", "Lunch w {cafe} to teraz {price} za {contents}. Nieźle.")),
  L(x("Try the lunch deal at {cafe}, it's quick if you're on a short break.", "Probiert das Mittagsangebot bei {cafe}, das geht schnell, wenn man wenig Pause hat.", "Probad el menú de {cafe}, es rápido si tenéis poco descanso.", "Spróbujcie zestawu w {cafe}, jest szybki, jak ktoś ma krótką przerwę.")),
  L(x("The soup at {cafe} is good, and the deal is {price}.", "Die Suppe bei {cafe} ist gut, und das Angebot kostet {price}.", "La sopa de {cafe} está buena y el menú cuesta {price}.", "Zupa w {cafe} jest dobra, a zestaw kosztuje {price}.")),
];

/**
 * What the rule-based stand-in thinks, says and writes in its diary, per action.
 * Placeholders: {price} {old} {diff} {usual} {cafe} {contents} {item} {Item} {a_item} (en)
 * {einen_item} {der_item} (de) {un_item} {el_item} (es) {alt_at} {alt_to} {Alt} {Alt_at}
 * {friend} {verdict} {cheaper} {speaker} (the person whose words they heard).
 */
export const ACTION_TEXT: Record<string, ActionText> = {
  not_around: {
    thought: [
      L(x("Already gone home; I was only in town for a few days.", "Schon wieder abgereist; ich war nur ein paar Tage in der Stadt.", "Ya me he ido; solo estaba unos días en la ciudad.", "Już {g:wyjechałem|wyjechałam}; {g:byłem|byłam} w mieście tylko kilka dni."), "tourist"),
      L(x("School holidays: we're away.", "Schulferien, wir sind weg.", "Vacaciones escolares: estamos fuera.", "Ferie, nie ma nas w mieście."), "holiday"),
      L(x("With the strike I worked from home.", "Wegen des Streiks war ich im Homeoffice.", "Con la huelga trabajé desde casa.", "Przez strajk {g:pracowałem|pracowałam} z domu."), "wfh"),
      L(x("Too hot to go out at lunchtime.", "Zu heiß, um mittags rauszugehen.", "Hacía demasiado calor para salir a mediodía.", "Za gorąco, żeby wychodzić w południe."), "heat"),
      L(x("Not around this time.", "Diesmal nicht da.", "Esta vez no estaba por aquí.", "Tym razem mnie nie było.")),
      L(x("Somewhere else in the city this week.", "Diese Woche woanders in der Stadt unterwegs.", "Esta semana anduve por otra parte de la ciudad.", "W tym tygodniu {g:byłem|byłam} w innej części miasta.")),
      L(x("Didn't make it to this street this time.", "Diesmal bin ich gar nicht in die Straße gekommen.", "Esta vez ni pasé por esta calle.", "Tym razem nawet nie {g:przechodziłem|przechodziłam} tą ulicą.")),
    ],
    diary: [
      L(x("Wasn't around.", "War nicht da.", "No estuve.", "Nie było mnie.")),
      L(x("Not in the area this week.", "Diese Woche nicht im Kiez.", "Esta semana no pasé por el barrio.", "W tym tygodniu nie było mnie w okolicy.")),
    ],
  },
  notices_offer: {
    thought: [
      L(x("{price} for {contents}? That's less than my usual {usual}. Noted.", "{price} für {contents}? Das ist weniger als meine üblichen {usual}. Gemerkt.", "¿{price} por {contents}? Es menos de lo que suelo gastar, {usual}. Apuntado.", "{price} za {contents}? To mniej niż moje zwykłe {usual}. Zapamiętane."), "cheaper"),
      L(x("Saw the board. {price} is more than I usually spend on lunch, but it's a full meal. Maybe one day.", "Hab die Tafel gesehen. {price} ist mehr, als ich sonst mittags ausgebe, aber es ist eine ganze Mahlzeit. Vielleicht mal.", "He visto la pizarra. {price} es más de lo que suelo gastar en comer, pero es una comida completa. Quizá algún día.", "{g:Widziałem|Widziałam} tablicę. {price} to więcej, niż zwykle wydaję na lunch, ale to pełny posiłek. Może kiedyś."), "pricier"),
      L(x("New board outside. I'll ask the staff what's in the sandwich next time I'm in.", "Neue Tafel draußen. Ich frag beim nächsten Mal, was im Sandwich ist.", "Pizarra nueva en la puerta. La próxima vez preguntaré qué lleva el bocadillo.", "Nowa tablica przed wejściem. Następnym razem zapytam, co jest w kanapce."), "regular"),
      L(x("I'd already seen it mentioned online, and there's the board. A fixed price at least tells you what you'll pay.", "Hatte es schon online gesehen, und da ist die Tafel. Ein fester Preis sagt wenigstens, was man zahlt.", "Ya lo había visto en internet y ahí está la pizarra. Un precio fijo al menos te dice lo que vas a pagar.", "{g:Widziałem|Widziałam} już o tym w sieci, a tu tablica. Stała cena przynajmniej mówi, ile się zapłaci."), "buzz"),
      L(x("With all the people on the street today I only noticed the board because of the queue.", "Bei den vielen Leuten auf der Straße hab ich die Tafel nur wegen der Schlange bemerkt.", "Con tanta gente en la calle hoy, solo vi la pizarra por la cola.", "Przy takim tłumie na ulicy {g:zauważyłem|zauważyłam} tablicę tylko przez kolejkę."), "busy"),
      L(x("Read the board in passing. Fixed price and quick sounds right when I'm short of time.", "Im Vorbeigehen gelesen. Fester Preis und schnell, das passt, wenn ich wenig Zeit habe.", "Leí la pizarra al pasar. Precio fijo y rápido: me cuadra cuando voy con prisa.", "{g:Przeczytałem|Przeczytałam} tablicę w biegu. Stała cena i szybko, to pasuje, kiedy brakuje mi czasu."), "hurry"),
      L(x("Saw the board on Instagram before I saw it on the street.", "Hab die Tafel auf Instagram gesehen, bevor ich sie auf der Straße sah.", "Vi la pizarra en Instagram antes que en la calle.", "{g:Zobaczyłem|Zobaczyłam} tablicę na Instagramie, zanim {g:zobaczyłem|zobaczyłam} ją na ulicy."), "insta"),
      L(x("Noticed the lunch deal on my way past. Filed under 'maybe'.", "Hab das Mittagsangebot im Vorbeigehen gesehen. Unter „vielleicht“ abgelegt.", "Vi el menú del día al pasar. Lo dejo en «quizá».", "{g:Zauważyłem|Zauważyłam} zestaw lunchowy po drodze. Odkładam na „może”.")),
      L(x("A lunch deal at {cafe}. Could be handy on a busy day.", "Ein Mittagsangebot bei {cafe}. Könnte an vollen Tagen praktisch sein.", "Un menú del día en {cafe}. Puede venir bien un día de mucho lío.", "Zestaw lunchowy w {cafe}. Może się przydać w zabiegany dzień.")),
      L(x("Read the board while waiting at the crossing. A fixed-price lunch, good to know.", "Hab die Tafel an der Ampel gelesen. Mittagessen zum Festpreis, gut zu wissen.", "Leí la pizarra esperando en el semáforo. Comida a precio fijo, bueno saberlo.", "{g:Przeczytałem|Przeczytałam} tablicę, czekając na światłach. Lunch w stałej cenie, dobrze wiedzieć.")),
      L(x("Stopped for a second to read the new board. Clear enough.", "Kurz stehen geblieben und die neue Tafel gelesen. Klar genug.", "Me paré un segundo a leer la pizarra nueva. Se entiende bien.", "{g:Zatrzymałem|Zatrzymałam} się na chwilę, żeby przeczytać nową tablicę. Jasne.")),
    ],
    diary: [
      L(x("{cafe} has a lunch deal now: {price}.", "{cafe} hat jetzt ein Mittagsangebot: {price}.", "{cafe} tiene ahora menú del día: {price}.", "{cafe} ma teraz zestaw lunchowy: {price}.")),
      L(x("Saw the lunch deal board. Maybe try it.", "Mittagsangebot gesehen. Vielleicht probieren.", "Vi la pizarra del menú. Quizá lo pruebe.", "{g:Widziałem|Widziałam} tablicę z zestawem. Może spróbuję.")),
      L(x("Noted the lunch deal at {cafe}.", "Mittagsangebot bei {cafe} gemerkt.", "Apuntado el menú de {cafe}.", "{g:Zapamiętałem|Zapamiętałam} zestaw w {cafe}.")),
    ],
  },
  ignores: {
    thought: [
      L(x("Saw a chalkboard, didn't read it. Lunch out isn't in my budget this week.", "Eine Kreidetafel gesehen, nicht gelesen. Auswärts essen ist diese Woche nicht drin.", "Vi una pizarra, no la leí. Esta semana comer fuera no entra en mi presupuesto.", "{g:Widziałem|Widziałam} jakąś tablicę, nie {g:czytałem|czytałam}. W tym tygodniu lunch na mieście nie mieści się w budżecie."), "sensitive"),
      L(x("Head down in the rain, hood up. I didn't look at anything.", "Kopf runter im Regen, Kapuze auf. Ich hab nichts angeschaut.", "Con la lluvia, cabeza gacha y capucha puesta. No miré nada.", "W deszczu głowa w dół, kaptur na głowie. Na nic nie {g:patrzyłem|patrzyłam}."), "rain"),
      L(x("There are chalkboards everywhere round here. I don't read them all.", "Hier stehen überall Kreidetafeln. Ich lese nicht alle.", "Por aquí hay pizarras por todas partes. No las leo todas.", "Tu wszędzie stoją tablice. Nie czytam wszystkich."), "new"),
      L(x("With the pavement half blocked I just tried to get past.", "Mit dem halb gesperrten Gehweg wollte ich nur durch.", "Con la acera medio cortada solo quería pasar.", "Przy w połowie zamkniętym chodniku {g:chciałem|chciałam} tylko przejść."), "works"),
      L(x("Too hot to stop and read anything.", "Zu heiß, um stehen zu bleiben und etwas zu lesen.", "Hacía demasiado calor para pararse a leer nada.", "Za gorąco, żeby się zatrzymywać i cokolwiek czytać."), "heat"),
      L(x("Didn't really look at the board. Other things on my mind this morning.", "Hab nicht richtig auf die Tafel geschaut. Hatte heute Morgen anderes im Kopf.", "No miré mucho la pizarra. Esta mañana tenía otras cosas en la cabeza.", "Nie {g:przyglądałem|przyglądałam} się tablicy. Rano {g:miałem|miałam} inne rzeczy na głowie.")),
      L(x("Walked straight past. I'd already decided where I was eating today.", "Einfach vorbeigegangen. Ich wusste schon, wo ich heute esse.", "Pasé de largo. Ya había decidido dónde comer hoy.", "{g:Przeszedłem|Przeszłam} obok. Już {g:wiedziałem|wiedziałam}, gdzie dziś jem.")),
      L(x("Saw the board out of the corner of my eye. Didn't stop.", "Die Tafel aus dem Augenwinkel gesehen. Nicht stehen geblieben.", "Vi la pizarra de reojo. No me paré.", "Kątem oka {g:widziałem|widziałam} tablicę. Nie {g:zatrzymałem|zatrzymałam} się.")),
      L(x("Busy morning. If there was a new sign, it didn't register.", "Voller Vormittag. Falls da ein neues Schild war, ist es nicht angekommen.", "Mañana de mucho lío. Si había un cartel nuevo, no me enteré.", "Zabiegany poranek. Jeśli była jakaś nowa tablica, nie {g:zarejestrowałem|zarejestrowałam} jej.")),
      L(x("On the phone the whole way down the street. Didn't notice a thing.", "Die ganze Straße lang am Telefon. Nichts bemerkt.", "Fui hablando por teléfono toda la calle. No me fijé en nada.", "Całą ulicę {g:przegadałem|przegadałam} przez telefon. Niczego nie {g:zauważyłem|zauważyłam}.")),
    ],
    diary: [
      L(x("Nothing much to remember about {cafe} this week.", "Diese Woche nichts Besonderes bei {cafe}.", "Nada especial que recordar de {cafe} esta semana.", "W tym tygodniu nic szczególnego w {cafe}.")),
      L(x("Busy week; didn't notice anything new.", "Volle Woche; nichts Neues bemerkt.", "Semana liada; no noté nada nuevo.", "Zabiegany tydzień; nic nowego nie {g:zauważyłem|zauważyłam}.")),
      L(x("Walked past {cafe} as usual.", "Wie immer an {cafe} vorbeigelaufen.", "Pasé por delante de {cafe} como siempre.", "Jak zwykle {g:przeszedłem|przeszłam} obok {cafe}.")),
    ],
  },
  tries_deal: {
    thought: [
      L(x("{speaker} said the deal was decent, so I gave it a go.", "{speaker} meinte, das Angebot sei gut, also hab ich es probiert.", "{speaker} dijo que el menú estaba bien, así que lo probé.", "{speaker} mówi, że zestaw jest niezły, więc {g:spróbowałem|spróbowałam}."), "heard"),
      L(x("After what {speaker} said, I wanted to see for myself. Worth it.", "Nach dem, was {speaker} erzählt hat, wollte ich es selbst sehen. Hat sich gelohnt.", "Después de lo que contó {speaker}, quería verlo con mis propios ojos. Mereció la pena.", "Po tym, co opowiada {speaker}, {g:chciałem|chciałam} sam{g:|a} zobaczyć. Warto było."), "heard"),
      L(x("{price} for {contents} is less than my usual {usual}, so why not. Quick, and I know what I'm paying.", "{price} für {contents} ist weniger als meine üblichen {usual}, also warum nicht. Schnell, und ich weiß, was ich zahle.", "{price} por {contents} es menos de lo que suelo gastar, {usual}, así que ¿por qué no? Rápido y sé lo que pago.", "{price} za {contents} to mniej niż moje zwykłe {usual}, więc czemu nie. Szybko i wiem, ile płacę."), "cheaper"),
      L(x("It's more than I usually spend, but I was hungry and it's a proper meal. Just this once.", "Mehr, als ich sonst ausgebe, aber ich hatte Hunger und es ist eine richtige Mahlzeit. Nur dieses eine Mal.", "Es más de lo que suelo gastar, pero tenía hambre y es una comida en condiciones. Solo por esta vez.", "To więcej, niż zwykle wydaję, ale {g:byłem głodny|byłam głodna}, a to porządny posiłek. Tylko ten raz."), "pricier"),
      L(x("Tried the deal instead of my usual. The soup was good; the sandwich was a bit small.", "Hab das Angebot statt meinem Üblichen genommen. Die Suppe war gut, das Sandwich etwas klein.", "Probé el menú en vez de lo de siempre. La sopa estaba buena; el bocadillo, algo pequeño.", "Zamiast zwykłego zamówienia {g:wziąłem|wzięłam} zestaw. Zupa dobra, kanapka trochę mała."), "regular"),
      L(x("Took the deal to go. Fast, fixed price, back to work.", "Das Angebot zum Mitnehmen. Schnell, fester Preis, zurück an die Arbeit.", "Me llevé el menú. Rápido, precio fijo y de vuelta al trabajo.", "{g:Wziąłem|Wzięłam} zestaw na wynos. Szybko, stała cena i z powrotem do pracy."), "takeaway"),
      L(x("Fixed price, no decisions, out in twenty minutes. That's all I want from lunch.", "Fester Preis, keine Entscheidungen, nach zwanzig Minuten wieder draußen. Mehr will ich mittags nicht.", "Precio fijo, nada que decidir, fuera en veinte minutos. Es todo lo que pido a la comida.", "Stała cena, żadnych decyzji, po dwudziestu minutach wychodzę. Tyle chcę od lunchu."), "hurry"),
      L(x("It was pouring, {cafe} was right there, and the soup was hot. Easy choice.", "Es hat geschüttet, {cafe} war gleich da, und die Suppe war heiß. Leichte Entscheidung.", "Llovía a cántaros, {cafe} estaba ahí mismo y la sopa estaba caliente. Fácil.", "Lało, {cafe} było tuż obok, a zupa gorąca. Łatwy wybór."), "rain"),
      L(x("Tried the lunch deal. Fast and filling, nothing special, but fine for a weekday.", "Das Mittagsangebot probiert. Schnell und sättigend, nichts Besonderes, aber für einen Werktag gut.", "Probé el menú del día. Rápido y llena, nada especial, pero bien para un día entre semana.", "{g:Spróbowałem|Spróbowałam} zestawu. Szybki i sycący, nic specjalnego, ale na dzień roboczy w porządku.")),
      L(x("Curious, so I ordered the deal. The soup was better than I expected.", "Neugierig, also hab ich das Angebot bestellt. Die Suppe war besser als gedacht.", "Por curiosidad pedí el menú. La sopa estaba mejor de lo que esperaba.", "Z ciekawości {g:zamówiłem|zamówiłam} zestaw. Zupa lepsza, niż się {g:spodziewałem|spodziewałam}.")),
      L(x("Gave the deal a go. I like not having to think about what to order.", "Das Angebot mal genommen. Ich mag es, nicht überlegen zu müssen, was ich bestelle.", "Probé el menú. Me gusta no tener que pensar qué pedir.", "{g:Wziąłem|Wzięłam} zestaw. Lubię nie musieć myśleć, co zamówić.")),
      L(x("Had the deal today. Fair for what you get, and the staff were quick.", "Heute das Angebot gehabt. Fair für das, was man bekommt, und das Team war flott.", "Hoy pedí el menú. Justo para lo que te dan, y el personal fue rápido.", "Dziś {g:wziąłem|wzięłam} zestaw. Uczciwie za to, co dostajesz, a obsługa była szybka.")),
    ],
    diary: [
      L(x("Had the lunch deal at {cafe}: {verdict}.", "Mittagsangebot bei {cafe} gegessen: {verdict}.", "Comí el menú del día en {cafe}: {verdict}.", "{g:Jadłem|Jadłam} zestaw lunchowy w {cafe}: {verdict}.")),
      L(x("Tried the deal at {cafe} for the first time.", "Zum ersten Mal das Angebot bei {cafe} probiert.", "Probé por primera vez el menú de {cafe}.", "Pierwszy raz {g:spróbowałem|spróbowałam} zestawu w {cafe}.")),
    ],
  },
  tries_and_tells: {
    thought: [
      L(x("Tried the deal and liked it, so I told {friend} straight away.", "Das Angebot probiert und mochte es, also hab ich gleich {friend} davon erzählt.", "Probé el menú y me gustó, así que se lo conté enseguida {friend}.", "{g:Spróbowałem|Spróbowałam} zestawu i mi smakował, więc od razu {g:powiedziałem|powiedziałam} {friend}."), "fan"),
      L(x("Cheaper than my usual and quick. Told {friend} it's worth it.", "Billiger als mein Übliches und schnell. Hab {friend} gesagt, dass es sich lohnt.", "Más barato que lo de siempre y rápido. Se lo dije {friend}: merece la pena.", "Taniej niż zwykle i szybko. {g:Powiedziałem|Powiedziałam} {friend}, że warto."), "cheaper"),
      L(x("The deal was fine. I told {friend}, with a warning to go before the rush.", "Das Angebot war okay. Hab {friend} davon erzählt, mit dem Tipp, vor dem großen Andrang zu gehen.", "El menú estaba bien. Se lo conté {friend}, con el aviso de ir antes de la hora punta.", "Zestaw był w porządku. {g:Powiedziałem|Powiedziałam} {friend}, ale z ostrzeżeniem, żeby iść przed szczytem."), "sceptic"),
      L(x("Had the deal and mentioned it to {friend} over lunch.", "Das Angebot gegessen und {friend} beim Essen davon erzählt.", "Comí el menú y se lo comenté {friend} mientras comíamos.", "{g:Zjadłem|Zjadłam} zestaw i {g:wspomniałem|wspomniałam} o nim {friend} przy jedzeniu.")),
      L(x("Tried it, then sent a photo of the board to {friend}.", "Probiert und dann {friend} ein Foto von der Tafel geschickt.", "Lo probé y luego mandé una foto de la pizarra {friend}.", "{g:Spróbowałem|Spróbowałam}, a potem {g:wysłałem|wysłałam} {friend} zdjęcie tablicy.")),
      L(x("Good enough to pass on. Told {friend} about it.", "Gut genug zum Weitersagen. Hab {friend} davon erzählt.", "Lo bastante bueno para recomendarlo. Se lo conté {friend}.", "Na tyle dobre, żeby polecić. {g:Powiedziałem|Powiedziałam} o tym {friend}.")),
    ],
    says: LUNCH_SAYS,
    diary: [L(x("Tried the deal and told {friend} about it.", "Angebot probiert und {friend} davon erzählt.", "Probé el menú y se lo conté {friend}.", "{g:Spróbowałem|Spróbowałam} zestawu i {g:powiedziałem|powiedziałam} o nim {friend}."))],
  },
  usual_order: {
    thought: [
      L(x("I know what I like. My usual is my usual, deal or no deal.", "Ich weiß, was ich mag. Mein Übliches bleibt mein Übliches, Angebot hin oder her.", "Sé lo que me gusta. Lo de siempre es lo de siempre, con menú o sin él.", "Wiem, co lubię. Moje zwykłe to moje zwykłe, zestaw czy nie."), "regular", "untried"),
      L(x("Had my usual. The deal looks fine; I just didn't feel like soup.", "Das Übliche genommen. Das Angebot sieht gut aus, ich hatte nur keine Lust auf Suppe.", "Pedí lo de siempre. El menú tiene buena pinta; simplemente no me apetecía sopa.", "{g:Wziąłem|Wzięłam} to, co zwykle. Zestaw wygląda dobrze, po prostu nie {g:miałem|miałam} ochoty na zupę."), "relaxed", "untried"),
      L(x("The deal isn't cheaper than what I normally get, so why change.", "Das Angebot ist nicht billiger als das, was ich sonst nehme, warum also wechseln.", "El menú no es más barato que lo que suelo pedir, así que ¿para qué cambiar?", "Zestaw nie jest tańszy od tego, co zwykle biorę, więc po co zmieniać."), "pricier"),
      L(x("I've had the deal; today I wanted my usual again. The deal's fine, my usual is better.", "Das Angebot kenne ich schon; heute wollte ich wieder mein Übliches. Das Angebot ist okay, mein Übliches ist besser.", "Ya probé el menú; hoy me apetecía lo de siempre. El menú está bien, lo mío es mejor.", "Zestaw już znam; dziś {g:chciałem|chciałam} znowu to, co zwykle. Zestaw jest w porządku, moje zwykłe lepsze."), "tried"),
      L(x("Had the deal once. The sandwich was small, so it's my usual again.", "Einmal das Angebot gehabt. Das Sandwich war klein, also wieder das Übliche.", "Comí el menú una vez. El bocadillo era pequeño, así que vuelvo a lo de siempre.", "Raz {g:wziąłem|wzięłam} zestaw. Kanapka była mała, więc wracam do zwykłego."), "tried", "sceptic"),
      L(x("Looked at the deal, then ordered my usual anyway. Habit.", "Aufs Angebot geschaut, dann doch das Übliche bestellt. Gewohnheit.", "Miré el menú y luego pedí lo de siempre. Costumbre.", "{g:Popatrzyłem|Popatrzyłam} na zestaw, a i tak {g:zamówiłem|zamówiłam} to, co zwykle. Nawyk."), "untried"),
      L(x("Stuck to what I always order. Didn't feel like changing.", "Bei dem geblieben, was ich immer bestelle. Keine Lust auf Wechsel.", "Me quedé con lo que pido siempre. No me apetecía cambiar.", "{g:Zostałem|Zostałam} przy tym, co zawsze. Nie chciało mi się zmieniać."), "untried"),
      L(x("Ordered what I always have. The deal is fine, it just isn't what I came for.", "Bestellt, was ich immer nehme. Das Angebot ist okay, nur nicht das, weswegen ich komme.", "Pedí lo de siempre. El menú está bien, pero no vengo a por eso.", "{g:Zamówiłem|Zamówiłam} to, co zawsze. Zestaw jest OK, ale nie po to przychodzę.")),
      L(x("Same order as always. I'm a creature of habit at lunch.", "Dieselbe Bestellung wie immer. Mittags bin ich ein Gewohnheitstier.", "Lo mismo de siempre. A mediodía soy de costumbres fijas.", "To samo co zawsze. W porze lunchu jestem {g:tradycjonalistą|tradycjonalistką}.")),
      L(x("My usual, a quick chat at the counter, back out. The deal didn't tempt me.", "Mein Übliches, kurz an der Theke geplaudert, wieder raus. Das Angebot hat mich nicht gereizt.", "Lo de siempre, una charla rápida en la barra y fuera. El menú no me tentó.", "To co zwykle, krótka rozmowa przy ladzie i wychodzę. Zestaw mnie nie skusił.")),
    ],
    diary: [
      L(x("Had my usual at {cafe}; skipped the deal.", "Bei {cafe} das Übliche, ohne Angebot.", "Lo de siempre en {cafe}; sin menú.", "W {cafe} to, co zwykle; bez zestawu.")),
      L(x("My usual order at {cafe} again.", "Wieder mein Übliches bei {cafe}.", "Otra vez lo de siempre en {cafe}.", "Znowu moje zwykłe zamówienie w {cafe}.")),
    ],
  },
  eats_elsewhere: {
    thought: [
      L(x("Everyone's talking about the new place, so I went to compare. Cheaper, too.", "Alle reden vom neuen Laden, also bin ich zum Vergleichen hin. Billiger ist er auch.", "Todo el mundo habla del sitio nuevo, así que fui a comparar. Y es más barato.", "Wszyscy mówią o nowym miejscu, więc {g:poszedłem|poszłam} porównać. I jest taniej."), "competitor"),
      L(x("{Alt} is cheaper at lunch. For me that decides it.", "{Alt_at} ist es mittags billiger. Für mich entscheidet das.", "{Alt_at} sale más barato a mediodía. Para mí eso decide.", "{Alt_at} jest w południe taniej. Dla mnie to przesądza."), "competitor", "sensitive"),
      L(x("Went to {alt_to} to see what the fuss is about. Faster than here.", "Bin {alt_to} gegangen, um zu sehen, was dran ist. Schneller als hier.", "Fui {alt_to} a ver qué tal. Más rápido que aquí.", "{g:Poszedłem|Poszłam} {alt_to}, żeby zobaczyć, o co chodzi. Szybciej niż tutaj."), "competitor", "sceptic"),
      L(x("Tried {alt_to} once. The board there is hard to ignore.", "Bin einmal {alt_to} gegangen. Deren Tafel kann man kaum übersehen.", "Fui una vez {alt_to}. Su pizarra es difícil de ignorar.", "Raz {g:poszedłem|poszłam} {alt_to}. Ich tablicy trudno nie zauważyć."), "competitor"),
      L(x("{Alt} is cheaper. {price} is a lot for me on a normal weekday.", "{Alt_at} ist es billiger. {price} ist viel für mich an einem normalen Werktag.", "{Alt_at} sale más barato. {price} es mucho para mí un día normal.", "{Alt_at} jest taniej. {price} to dla mnie dużo w zwykły dzień."), "sensitive", "!competitor"),
      L(x("I'm not sure {cafe} is quick enough at lunch. Went to {alt_to} instead.", "Ich bin nicht sicher, ob {cafe} mittags schnell genug ist. Bin stattdessen {alt_to}.", "No tengo claro que {cafe} sea lo bastante rápido a mediodía. Fui {alt_to}.", "Nie jestem {g:pewny|pewna}, czy {cafe} jest w południe wystarczająco szybkie. {g:Poszedłem|Poszłam} {alt_to}."), "sceptic", "!competitor"),
      L(x("Too hot for soup. Got something cold at {alt_at}.", "Zu heiß für Suppe. Hab mir {alt_at} was Kaltes geholt.", "Demasiado calor para sopa. Cogí algo frío {alt_at}.", "Za gorąco na zupę. {g:Kupiłem|Kupiłam} coś zimnego {alt_at}."), "heat", "!competitor"),
      L(x("Ended up at {alt_at} today. Nothing against the café, it just happened.", "Bin heute {alt_at} gelandet. Nichts gegen das Café, hat sich so ergeben.", "Hoy acabé {alt_at}. Nada contra el café, salió así.", "Dziś {g:wylądowałem|wylądowałam} {alt_at}. Nic do kawiarni, tak wyszło."), "!competitor"),
      L(x("Went to {alt_to}. Quicker, and I wasn't in the mood for soup.", "Bin {alt_to}. Schneller, und ich hatte keine Lust auf Suppe.", "Fui {alt_to}. Más rápido, y no me apetecía sopa.", "{g:Poszedłem|Poszłam} {alt_to}. Szybciej, a nie {g:miałem|miałam} ochoty na zupę."), "!competitor"),
      L(x("Went to {alt_to}. It's on my way and I didn't think twice.", "Bin {alt_to}. Liegt auf dem Weg, ich hab nicht lange überlegt.", "Fui {alt_to}. Me pilla de camino y no lo pensé.", "{g:Poszedłem|Poszłam} {alt_to}. Mam po drodze i się nie {g:zastanawiałem|zastanawiałam}."), "!competitor"),
      L(x("Lunch at {alt_at} today, with a friend who'd suggested it.", "Heute Mittag {alt_at}, mit einer Freundin, die das vorgeschlagen hatte.", "Hoy comí {alt_at}, con una amiga que lo propuso.", "Dziś lunch {alt_at}, z przyjaciółką, która to zaproponowała."), "!competitor"),
    ],
    diary: [
      L(x("Ate at {alt_at} instead.", "Stattdessen {alt_at} gegessen.", "Comí {alt_at}.", "{g:Jadłem|Jadłam} {alt_at}.")),
      L(x("Lunch at {alt_at} this time.", "Diesmal Mittag {alt_at}.", "Esta vez, la comida fue {alt_at}.", "Tym razem lunch {alt_at}.")),
    ],
  },
  skips_lunch_out: {
    thought: [
      L(x("Brought lunch from home. Eating out every day adds up.", "Essen von zu Hause mitgebracht. Jeden Tag auswärts läppert sich.", "Me traje la comida de casa. Comer fuera todos los días suma.", "{g:Wziąłem|Wzięłam} jedzenie z domu. Codzienne jedzenie na mieście się sumuje."), "sensitive"),
      L(x("With this weather I stayed in and ate what I had.", "Bei dem Wetter bin ich drinnen geblieben und hab gegessen, was da war.", "Con este tiempo me quedé dentro y comí lo que tenía.", "Przy tej pogodzie {g:zostałem|zostałam} w środku i {g:zjadłem|zjadłam} to, co {g:miałem|miałam}."), "rain"),
      L(x("Too hot to eat much. A bit of fruit at my desk was enough.", "Zu heiß für viel Essen. Ein bisschen Obst am Schreibtisch hat gereicht.", "Demasiado calor para comer mucho. Con algo de fruta en la mesa me bastó.", "Za gorąco, żeby dużo jeść. Wystarczyło trochę owoców przy biurku."), "heat"),
      L(x("Too busy for a proper break today; ate at my desk.", "Heute zu viel los für eine richtige Pause; am Schreibtisch gegessen.", "Hoy no tuve tiempo para una pausa de verdad; comí en la mesa.", "Dziś za dużo pracy na porządną przerwę; {g:jadłem|jadłam} przy biurku.")),
      L(x("No lunch out this week. Leftovers from last night.", "Diese Woche nicht auswärts gegessen. Reste von gestern Abend.", "Esta semana nada de comer fuera. Sobras de anoche.", "W tym tygodniu bez lunchu na mieście. Resztki z wczorajszej kolacji.")),
      L(x("Made sandwiches at home. Not every day has to be a lunch out.", "Zu Hause Brote geschmiert. Nicht jeder Tag muss ein Essen auswärts sein.", "Me hice bocadillos en casa. No todos los días hay que comer fuera.", "{g:Zrobiłem|Zrobiłam} kanapki w domu. Nie każdy dzień musi być lunchem na mieście.")),
      L(x("Skipped lunch out; I'm trying to save a bit this month.", "Auswärts essen ausgelassen; ich versuche diesen Monat etwas zu sparen.", "Hoy no comí fuera; este mes intento ahorrar un poco.", "{g:Odpuściłem|Odpuściłam} lunch na mieście; w tym miesiącu próbuję trochę oszczędzać.")),
    ],
    diary: [
      L(x("Home-made lunch this week; saved a bit.", "Diese Woche Selbstgemachtes; etwas gespart.", "Esta semana, comida de casa; algo ahorré.", "W tym tygodniu jedzenie z domu; trochę {g:zaoszczędziłem|zaoszczędziłam}.")),
      L(x("No lunch out this time.", "Diesmal nicht auswärts gegessen.", "Esta vez no comí fuera.", "Tym razem bez lunchu na mieście.")),
    ],
  },
  comes_back_for_deal: {
    thought: [
      L(x("Back for the deal. Cheaper than my usual and quick; it could become my Wednesday thing.", "Wieder fürs Angebot da. Billiger als mein Übliches und schnell; das könnte mein Mittwochsding werden.", "He vuelto a por el menú. Más barato que lo de siempre y rápido; puede convertirse en lo mío de los miércoles.", "{g:Wróciłem|Wróciłam} na zestaw. Taniej niż zwykle i szybko; może zostać moim środowym zwyczajem."), "tried", "cheaper"),
      L(x("Back again, and {speaker} recommends it too, so it's not just me.", "Wieder da, und {speaker} empfiehlt es auch, also bin ich nicht allein.", "Otra vez aquí, y {speaker} también lo recomienda, así que no soy solo yo.", "Znowu tu, a {speaker} też poleca, więc to nie tylko ja."), "tried", "heard"),
      L(x("Picked up the deal to go again. Quick, and I know the price.", "Wieder das Angebot zum Mitnehmen. Schnell, und ich kenne den Preis.", "Otra vez el menú para llevar. Rápido y ya sé el precio.", "Znowu zestaw na wynos. Szybko i znam cenę."), "tried", "takeaway"),
      L(x("Second time with the deal. The staff already know I want extra bread.", "Zum zweiten Mal das Angebot. Das Team weiß schon, dass ich extra Brot will.", "Segunda vez con el menú. El personal ya sabe que quiero pan de más.", "Drugi raz zestaw. Obsługa już wie, że chcę więcej chleba."), "tried", "regular"),
      L(x("Came back for the deal. Same as last time, which is the point.", "Wieder das Angebot. Wie letztes Mal, und genau darum geht's.", "Volví a por el menú. Igual que la última vez, que es justo la idea.", "{g:Wróciłem|Wróciłam} na zestaw. Tak jak ostatnio, i o to chodzi."), "tried"),
      L(x("Went for the lunch deal again. Easy choice, and that counts at lunchtime.", "Wieder das Mittagsangebot. Einfache Wahl, und das zählt mittags.", "Otra vez el menú del día. Elección fácil, y a mediodía eso cuenta.", "Znowu zestaw lunchowy. Łatwy wybór, a w porze lunchu to się liczy."), "tried"),
      L(x("Had the deal again. The soup changes, which keeps it interesting.", "Wieder das Angebot. Die Suppe wechselt, das hält es spannend.", "Repetí el menú. La sopa cambia, y eso lo hace interesante.", "Znowu zestaw. Zupa się zmienia, więc nie jest nudno."), "tried"),
      L(x("{speaker} keeps mentioning the deal, so I finally tried it. Not bad at all.", "{speaker} redet ständig vom Angebot, also hab ich es endlich probiert. Gar nicht schlecht.", "{speaker} no para de hablar del menú, así que por fin lo probé. Nada mal.", "{speaker} ciągle mówi o zestawie, więc w końcu {g:spróbowałem|spróbowałam}. Całkiem nieźle."), "untried", "heard"),
      L(x("Finally gave the deal a go. Should have done it last week.", "Endlich das Angebot probiert. Hätte ich letzte Woche schon machen sollen.", "Por fin probé el menú. Debería haberlo hecho la semana pasada.", "W końcu {g:spróbowałem|spróbowałam} zestawu. Trzeba było już w zeszłym tygodniu."), "untried"),
    ],
    diary: [
      L(x("Back for the lunch deal; it's becoming a habit.", "Wieder fürs Mittagsangebot da; wird zur Gewohnheit.", "Otra vez el menú; se está convirtiendo en costumbre.", "Znowu zestaw; robi się z tego nawyk."), "tried"),
      L(x("Had the lunch deal at {cafe} again.", "Wieder das Mittagsangebot bei {cafe}.", "Repetí el menú en {cafe}.", "Znowu zestaw w {cafe}."), "tried"),
      L(x("Tried the lunch deal at last.", "Endlich das Mittagsangebot probiert.", "Por fin probé el menú del día.", "W końcu {g:spróbowałem|spróbowałam} zestawu."), "untried"),
    ],
  },
  back_to_usual: {
    thought: [
      L(x("Tried the deal last week; this week I wanted my usual again. The deal's fine, my usual is better.", "Letzte Woche das Angebot probiert, diese Woche wollte ich wieder mein Übliches. Das Angebot ist okay, mein Übliches ist besser.", "La semana pasada probé el menú; esta semana me apetecía lo de siempre. El menú está bien, lo mío es mejor.", "W zeszłym tygodniu {g:spróbowałem|spróbowałam} zestawu, w tym {g:chciałem|chciałam} znowu to, co zwykle. Zestaw jest OK, moje zwykłe lepsze."), "tried"),
      L(x("Back to my normal order. Nothing wrong with the deal, it's just not my thing.", "Zurück zu meiner normalen Bestellung. Nichts gegen das Angebot, ist nur nicht meins.", "Vuelvo a lo de siempre. El menú no está mal, pero no es lo mío.", "Wracam do zwykłego zamówienia. Zestaw jest OK, ale to nie moje."), "tried"),
      L(x("Same as always. The deal isn't for me.", "Wie immer. Das Angebot ist nichts für mich.", "Lo de siempre. El menú no es para mí.", "Jak zawsze. Zestaw nie jest dla mnie."), "untried"),
      L(x("Kept to my usual. I never felt the deal was for me.", "Beim Üblichen geblieben. Das Angebot war nie so richtig meins.", "Seguí con lo mío. Nunca sentí que el menú fuera para mí.", "{g:Zostałem|Zostałam} przy swoim. Zestaw nigdy nie był dla mnie."), "untried"),
    ],
    diary: [
      L(x("Back to my usual order at {cafe}.", "Wieder mein Übliches bei {cafe}.", "De vuelta a lo de siempre en {cafe}.", "Z powrotem przy zwykłym zamówieniu w {cafe}."), "tried"),
      L(x("My usual at {cafe}, as always.", "Mein Übliches bei {cafe}, wie immer.", "Lo de siempre en {cafe}.", "Jak zawsze moje zwykłe w {cafe}."), "untried"),
    ],
  },
  tells_a_friend: {
    thought: [
      L(x("Haven't tried it myself, but {speaker} likes it, so I passed it on to {friend}.", "Selbst noch nicht probiert, aber {speaker} mag es, also hab ich's {friend} weitererzählt.", "Yo aún no lo he probado, pero a {speaker} le gusta, así que se lo pasé {friend}.", "Sam{g:|a} jeszcze nie {g:próbowałem|próbowałam}, ale {speaker} chwali, więc {g:przekazałem|przekazałam} to {friend}."), "untried", "heard"),
      L(x("I like this place and want it to do well, so I told {friend} about the deal.", "Ich mag den Laden und will, dass er läuft, also hab ich {friend} vom Angebot erzählt.", "Me gusta el sitio y quiero que le vaya bien, así que hablé del menú {friend}.", "Lubię to miejsce i chcę, żeby mu się wiodło, więc {g:powiedziałem|powiedziałam} {friend} o zestawie."), "fan"),
      L(x("Told {friend} about the deal. Cheap enough for a weekday, and quick.", "Hab {friend} vom Angebot erzählt. Günstig genug für einen Werktag und schnell.", "Hablé del menú {friend}. Barato para un día entre semana, y rápido.", "{g:Powiedziałem|Powiedziałam} {friend} o zestawie. Na dzień roboczy tani i szybki."), "cheaper", "tried"),
      L(x("Mentioned the deal to {friend}, with a warning to go before the rush.", "Hab {friend} vom Angebot erzählt, mit dem Hinweis, vor dem Andrang hinzugehen.", "Comenté el menú {friend}, con el aviso de ir antes de la hora punta.", "{g:Wspomniałem|Wspomniałam} {friend} o zestawie, z ostrzeżeniem, żeby iść przed szczytem."), "sceptic"),
      L(x("Told {friend} about the lunch deal. We might go together next week.", "Hab {friend} vom Mittagsangebot erzählt. Vielleicht gehen wir nächste Woche zusammen.", "Hablé del menú del día {friend}. Igual vamos juntos la semana que viene.", "{g:Powiedziałem|Powiedziałam} {friend} o zestawie. Może pójdziemy razem w przyszłym tygodniu.")),
      L(x("It came up over coffee, so I told {friend} about the deal.", "Es kam beim Kaffee auf, also hab ich {friend} vom Angebot erzählt.", "Salió el tema tomando café y hablé del menú {friend}.", "Wyszło przy kawie, więc {g:powiedziałem|powiedziałam} {friend} o zestawie.")),
      L(x("Sent {friend} a photo of the board. Worth knowing about.", "Hab {friend} ein Foto von der Tafel geschickt. Gut zu wissen.", "Mandé una foto de la pizarra {friend}. Está bien saberlo.", "{g:Wysłałem|Wysłałam} {friend} zdjęcie tablicy. Warto wiedzieć.")),
    ],
    says: LUNCH_SAYS,
    diary: [L(x("Told {friend} about the lunch deal.", "Hab {friend} vom Mittagsangebot erzählt.", "Hablé del menú {friend}.", "{g:Powiedziałem|Powiedziałam} {friend} o zestawie."))],
  },
  complains: {
    thought: [
      T("crowd", L(x("Lunch got busy and my usual took ages. I told the staff, politely.", "Mittags war's voll, und mein Übliches hat ewig gedauert. Hab's dem Team gesagt, freundlich.", "A mediodía se llenó y lo mío tardó una eternidad. Se lo dije al personal, con educación.", "W porze lunchu był tłok i moje zamówienie trwało wieki. {g:Powiedziałem|Powiedziałam} obsłudze, grzecznie."), "regular", "!takeaway")),
      T("portion", L(x("The sandwich was smaller than it looked on the board. I said so.", "Das Sandwich war kleiner, als es auf der Tafel klang. Hab ich gesagt.", "El bocadillo era más pequeño de lo que parecía en la pizarra. Lo dije.", "Kanapka była mniejsza, niż wyglądało na tablicy. {g:Powiedziałem|Powiedziałam} to."), "tried")),
      T("price", L(x("{price} for that? I said what I thought.", "{price} dafür? Ich hab gesagt, was ich denke.", "¿{price} por eso? Dije lo que pensaba.", "{price} za to? {g:Powiedziałem|Powiedziałam}, co myślę."), "pricier")),
      T("crowd", L(x("Waited ten minutes for a to-go order because of the deal crowd. Said so at the till.", "Zehn Minuten auf mein Essen zum Mitnehmen gewartet, wegen des Andrangs. Hab's an der Kasse gesagt.", "Diez minutos esperando un pedido para llevar por la gente del menú. Lo dije en la caja.", "Dziesięć minut {g:czekałem|czekałam} na wynos przez tłum chętnych na zestaw. {g:Powiedziałem|Powiedziałam} to przy kasie."), "takeaway")),
      T("soup", L(x("It's the same soup every other day. I told them.", "Jeden zweiten Tag dieselbe Suppe. Hab's ihnen gesagt.", "La misma sopa un día sí y otro no. Se lo dije.", "Co drugi dzień ta sama zupa. {g:Powiedziałem|Powiedziałam} im."), "sceptic")),
      T("crowd", L(x("Since the deal started it's crowded at noon. Someone should say it, so I did.", "Seit es das Angebot gibt, ist es mittags voll. Einer muss es sagen, also hab ich's getan.", "Desde que hay menú, a mediodía está lleno. Alguien tenía que decirlo, y lo dije.", "Odkąd jest zestaw, w południe jest tłoczno. Ktoś musiał to powiedzieć, więc {g:powiedziałem|powiedziałam}."))),
      T("crowd", L(x("Left a short comment: the queue at half twelve is too long now.", "Kurzen Kommentar hinterlassen: Die Schlange um halb eins ist jetzt zu lang.", "Dejé un comentario corto: la cola a las doce y media ya es demasiado larga.", "{g:Zostawiłem|Zostawiłam} krótki komentarz: kolejka o wpół do pierwszej jest teraz za długa."))),
    ],
    says: [
      T("crowd", L(x("Since the lunch deal, the window tables are always taken.", "Seit dem Mittagsangebot sind die Fenstertische immer besetzt.", "Desde el menú del día, las mesas de la ventana siempre están ocupadas.", "Odkąd jest zestaw lunchowy, stoliki przy oknie są zawsze zajęte."), "regular", "!takeaway")),
      T("portion", L(x("The sandwich in the deal is small for the price.", "Das Sandwich im Angebot ist klein für den Preis.", "El bocadillo del menú es pequeño para lo que cuesta.", "Kanapka w zestawie jest mała jak na tę cenę."), "tried")),
      T("price", L(x("{price} for the deal? Not convinced it's worth it.", "{price} fürs Angebot? Ich bin nicht überzeugt.", "¿{price} por el menú? No me convence.", "{price} za zestaw? Nie jestem {g:przekonany|przekonana}."))),
      T("soup", L(x("Same soup again? A bit more variety, please.", "Schon wieder dieselbe Suppe? Bitte etwas mehr Abwechslung.", "¿Otra vez la misma sopa? Un poco más de variedad, por favor.", "Znowu ta sama zupa? Poproszę trochę więcej różnorodności."))),
      T("crowd", L(x("The deal's fine, but the queue at 12:30 is too long now.", "Das Angebot ist okay, aber die Schlange um 12:30 ist jetzt zu lang.", "El menú está bien, pero la cola a las 12:30 ya es demasiado larga.", "Zestaw jest OK, ale kolejka o 12:30 jest teraz za długa."))),
      T("crowd", L(x("Lunchtime at {cafe} has got slow since the deal.", "Mittags dauert es bei {cafe} seit dem Angebot lange.", "Desde el menú, a mediodía en {cafe} todo va lento.", "Od czasu zestawu w {cafe} w południe wszystko trwa długo."))),
    ],
    diary: [
      T("portion", L(x("Told them the deal sandwich was small.", "Gesagt, dass das Sandwich im Angebot klein ist.", "Les dije que el bocadillo del menú era pequeño.", "{g:Powiedziałem|Powiedziałam}, że kanapka w zestawie jest mała."), "tried")),
      T("soup", L(x("Said something about the soup.", "Was zur Suppe gesagt.", "Dije algo sobre la sopa.", "{g:Powiedziałem|Powiedziałam} coś o zupie."))),
      T("price", L(x("Said the deal isn't worth {price} to me.", "Gesagt, dass mir das Angebot {price} nicht wert ist.", "Dije que para mí el menú no vale {price}.", "{g:Powiedziałem|Powiedziałam}, że zestaw nie jest dla mnie wart {price}."))),
      T("crowd", L(x("Complained about the lunchtime crowd.", "Mich über den Mittagsandrang beschwert.", "Me quejé de la gente a mediodía.", "{g:Ponarzekałem|Ponarzekałam} na tłok w porze lunchu."))),
    ],
  },
  posts_review: {
    thought: [
      L(x("Left a short review on Google Maps. People nearby should know about the deal.", "Kurze Bewertung auf Google Maps geschrieben. Die Leute hier sollten vom Angebot wissen.", "Dejé una reseña corta en Google Maps. La gente del barrio debería conocer el menú.", "{g:Zostawiłem|Zostawiłam} krótką opinię w Mapach Google. Ludzie z okolicy powinni wiedzieć o zestawie."), "fan"),
      L(x("Wrote an honest review: good soup, slow at the busiest time.", "Ehrliche Bewertung geschrieben: gute Suppe, langsam zur Stoßzeit.", "Escribí una reseña sincera: buena sopa, lento en la hora punta.", "{g:Napisałem|Napisałam} szczerą opinię: dobra zupa, wolno w godzinach szczytu."), "sceptic"),
      L(x("Posted a quick review. The deal was good value, so why not say so.", "Schnell eine Bewertung gepostet. Das Angebot war preiswert, warum es nicht sagen.", "Publiqué una reseña rápida. El menú merecía la pena, así que lo dije.", "{g:Wrzuciłem|Wrzuciłam} szybką opinię. Zestaw był opłacalny, więc czemu nie napisać."), "cheaper"),
      L(x("Added {cafe} to my Berlin list online, deal included.", "Hab {cafe} online auf meine Berlin-Liste gesetzt, mit Angebot.", "Añadí {cafe} a mi lista de Berlín en internet, con menú incluido.", "{g:Dodałem|Dodałam} {cafe} do mojej berlińskiej listy w sieci, razem z zestawem."), "tourist"),
      L(x("Left a few lines online about the lunch deal.", "Ein paar Zeilen online übers Mittagsangebot geschrieben.", "Escribí unas líneas en internet sobre el menú del día.", "{g:Napisałem|Napisałam} w sieci kilka zdań o zestawie.")),
      L(x("Wrote a short post in the neighbourhood group about the deal.", "Kurz in der Nachbarschaftsgruppe übers Angebot geschrieben.", "Escribí un mensaje corto en el grupo del barrio sobre el menú.", "{g:Napisałem|Napisałam} krótki post w grupie sąsiedzkiej o zestawie.")),
      L(x("Gave {cafe} four stars and mentioned the lunch deal.", "{cafe} vier Sterne gegeben und das Mittagsangebot erwähnt.", "Le di cuatro estrellas a {cafe} y mencioné el menú.", "{g:Dałem|Dałam} {cafe} cztery gwiazdki i {g:wspomniałem|wspomniałam} o zestawie.")),
    ],
    says: [
      L(x("Solid weekday lunch deal: {contents} for {price}. Quick and friendly.", "Solides Mittagsangebot unter der Woche: {contents} für {price}. Schnell und freundlich.", "Buen menú entre semana: {contents} por {price}. Rápido y amable.", "Solidny zestaw w dni robocze: {contents} za {price}. Szybko i miło."), "cheaper"),
      L(x("Good soup, small sandwich, fair price. Gets busy around 12:30.", "Gute Suppe, kleines Sandwich, fairer Preis. Gegen 12:30 wird's voll.", "Buena sopa, bocadillo pequeño, precio justo. Hacia las 12:30 se llena.", "Dobra zupa, mała kanapka, uczciwa cena. Około 12:30 robi się tłoczno."), "sceptic"),
      L(x("Nice neighbourhood café with a decent lunch deal at {price}.", "Nettes Kiezcafé mit ordentlichem Mittagsangebot für {price}.", "Café de barrio agradable con un menú del día decente a {price}.", "Miła osiedlowa kawiarnia z porządnym zestawem za {price}.")),
      L(x("Lunch deal at {cafe}: {contents}, {price}. Worth it on a weekday.", "Mittagsangebot bei {cafe}: {contents}, {price}. Lohnt sich unter der Woche.", "Menú del día en {cafe}: {contents}, {price}. Merece la pena entre semana.", "Zestaw lunchowy w {cafe}: {contents}, {price}. Warto w dzień roboczy.")),
    ],
    diary: [L(x("Posted a review of {cafe}.", "Bewertung über {cafe} gepostet.", "Publiqué una reseña de {cafe}.", "{g:Wystawiłem|Wystawiłam} opinię o {cafe}."))],
  },
  keeps_coming: {
    thought: [
      L(x("{speaker} kept going on about it, so now I come for the deal too.", "{speaker} hat so davon geschwärmt, jetzt komme ich auch fürs Angebot.", "{speaker} no paraba de hablar del menú, así que ahora vengo yo también.", "{speaker} tak chwali zestaw, że teraz też przychodzę."), "untried", "heard"),
      L(x("The deal is part of my week now. Twice a week, probably.", "Das Angebot gehört jetzt zu meiner Woche. Zweimal pro Woche, schätze ich.", "El menú ya forma parte de mi semana. Dos veces por semana, seguramente.", "Zestaw to już część mojego tygodnia. Pewnie dwa razy w tygodniu."), "tried", "cheaper"),
      L(x("I'll keep having the deal on soup days. It suits me.", "An Suppentagen nehme ich weiter das Angebot. Passt zu mir.", "Los días de sopa seguiré pidiendo el menú. Me va bien.", "W dni z zupą dalej będę brać zestaw. Pasuje mi."), "tried", "regular"),
      L(x("Still grabbing the deal to go between jobs.", "Hol mir das Angebot weiter zum Mitnehmen zwischen den Aufträgen.", "Sigo cogiendo el menú para llevar entre trabajo y trabajo.", "Dalej biorę zestaw na wynos między zleceniami."), "tried", "takeaway"),
      L(x("{speaker} keeps mentioning the deal too. I'll keep coming for it.", "{speaker} erwähnt das Angebot auch ständig. Ich komme weiter dafür.", "{speaker} también habla del menú a menudo. Seguiré viniendo a por él.", "{speaker} też ciągle wspomina o zestawie. Będę dalej na niego przychodzić."), "tried", "heard"),
      L(x("I'll keep coming for the deal, at least while it lasts.", "Ich komme weiter fürs Angebot, zumindest solange es das gibt.", "Seguiré viniendo a por el menú, al menos mientras dure.", "Będę dalej przychodzić na zestaw, przynajmniej póki jest."), "tried"),
      L(x("Still having the deal. The board is part of the furniture now.", "Nehme weiter das Angebot. Die Tafel gehört jetzt zum Inventar.", "Sigo con el menú. La pizarra ya es parte del mobiliario.", "Dalej biorę zestaw. Tablica to już część wystroju."), "tried"),
      L(x("The deal has become my default on busy days.", "Das Angebot ist an vollen Tagen mein Standard geworden.", "El menú se ha vuelto mi opción por defecto los días de lío.", "W zabiegane dni zestaw stał się moim domyślnym wyborem.")),
    ],
    diary: [L(x("Lunch deal at {cafe} a couple of times a week now.", "Jetzt ein-, zweimal die Woche das Mittagsangebot bei {cafe}.", "Ahora el menú de {cafe} un par de veces por semana.", "Teraz zestaw w {cafe} kilka razy w tygodniu."))],
  },
  forgets_about_it: {
    thought: [
      L(x("Never got round to trying it. It slipped my mind.", "Bin nie dazu gekommen, es zu probieren. Ist mir entfallen.", "Nunca llegué a probarlo. Se me olvidó.", "Nigdy nie {g:spróbowałem|spróbowałam}. Wyleciało mi z głowy."), "untried"),
      L(x("Had it once, then forgot about it. Nothing against it.", "Einmal gegessen, dann vergessen. Nichts dagegen.", "Lo comí una vez y luego me olvidé. Nada en contra.", "Raz {g:zjadłem|zjadłam}, potem {g:zapomniałem|zapomniałam}. Nic przeciwko."), "tried"),
      L(x("Honestly, I forgot the deal existed. Lunch is whatever's closest.", "Ehrlich gesagt hab ich vergessen, dass es das Angebot gibt. Mittag ist, was am nächsten ist.", "La verdad, olvidé que existía el menú. Como lo que pille más cerca.", "Szczerze, {g:zapomniałem|zapomniałam}, że jest zestaw. Na lunch jem to, co najbliżej.")),
      L(x("The deal never really stuck in my head. I eat wherever is nearest when I'm hungry.", "Das Angebot ist mir nie richtig im Kopf geblieben. Ich esse, wo es gerade am nächsten ist.", "El menú nunca se me quedó en la cabeza. Como donde me pille cuando tengo hambre.", "Zestaw nigdy mi nie utkwił w głowie. Jem tam, gdzie najbliżej, kiedy jestem {g:głodny|głodna}.")),
      L(x("Other things on my plate. The deal isn't something I think about.", "Hab anderes im Kopf. An das Angebot denke ich nicht.", "Tengo otras cosas en la cabeza. El menú no es algo en lo que piense.", "Mam inne sprawy na głowie. O zestawie nie myślę.")),
    ],
    diary: [L(x("Forgot about the lunch deal.", "Das Mittagsangebot vergessen.", "Me olvidé del menú del día.", "{g:Zapomniałem|Zapomniałam} o zestawie."))],
  },
  still_comes_for_lunch: {
    thought: [
      L(x("Started on the deal after hearing about it from {speaker}; now it's most weeks.", "Hab mit dem Angebot angefangen, nachdem {speaker} davon erzählt hat; jetzt fast jede Woche.", "Empecé con el menú después de que {speaker} me hablara de él; ahora casi cada semana.", "{g:Zacząłem|Zaczęłam} brać zestaw, bo {speaker} go chwali; teraz prawie co tydzień."), "untried", "heard"),
      L(x("Same as ever, just with the deal now. It's become my order.", "Wie immer, nur jetzt mit dem Angebot. Das ist meine Bestellung geworden.", "Lo de siempre, pero ahora con el menú. Se ha vuelto mi pedido.", "Jak zawsze, tylko teraz z zestawem. To już moje zamówienie."), "tried", "regular"),
      L(x("Still my lunch place most weeks. The deal made it an easy habit.", "Immer noch fast jede Woche mein Mittagsort. Das Angebot hat es zur Gewohnheit gemacht.", "Sigue siendo mi sitio para comer casi cada semana. El menú lo convirtió en costumbre.", "Nadal prawie co tydzień tu jem. Zestaw zrobił z tego nawyk."), "tried"),
      L(x("Still have the deal most weeks.", "Nehme das Angebot immer noch fast jede Woche.", "Sigo pidiendo el menú casi todas las semanas.", "Nadal biorę zestaw prawie co tydzień.")),
    ],
    diary: [L(x("Still the lunch deal at {cafe} most weeks.", "Immer noch fast jede Woche das Angebot bei {cafe}.", "Sigo con el menú de {cafe} casi cada semana.", "Nadal zestaw w {cafe} prawie co tydzień."))],
  },
  comes_now_and_then: {
    thought: [
      L(x("Now and then, when I'm near and short of time. It's a good fallback.", "Ab und zu, wenn ich in der Nähe bin und wenig Zeit habe. Gute Notlösung.", "De vez en cuando, si estoy cerca y voy con prisa. Es un buen plan B.", "Od czasu do czasu, gdy jestem blisko i brakuje mi czasu. Dobre awaryjne wyjście."), "tried"),
      L(x("I go for the deal now and then. Not every week.", "Ich nehme das Angebot ab und zu. Nicht jede Woche.", "Pido el menú de vez en cuando. No todas las semanas.", "Biorę zestaw od czasu do czasu. Nie co tydzień.")),
      L(x("Once in a while, when the soup sounds good.", "Hin und wieder, wenn die Suppe gut klingt.", "De vez en cuando, cuando la sopa me apetece.", "Raz na jakiś czas, kiedy zupa brzmi dobrze.")),
    ],
    diary: [L(x("The lunch deal now and then.", "Ab und zu das Mittagsangebot.", "El menú de vez en cuando.", "Zestaw od czasu do czasu."))],
  },
  back_to_old_habits: {
    thought: [
      L(x("{Alt} is where lunch happens now. It's cheaper.", "{Alt_at} esse ich jetzt mittags. Ist billiger.", "Ahora como {alt_at}. Es más barato.", "Teraz jadam {alt_at}. Jest taniej."), "competitor"),
      L(x("Back to bringing lunch from home. Cheaper.", "Wieder Essen von zu Hause. Billiger.", "Vuelvo a traer la comida de casa. Más barato.", "Wracam do jedzenia z domu. Taniej."), "sensitive", "!competitor"),
      L(x("The novelty wore off. Back to {alt_to} most days.", "Der Reiz ist weg. Meistens wieder {alt_at}.", "Se pasó la novedad. Casi siempre vuelvo {alt_to}.", "Nowość minęła. Przeważnie znów {alt_at}."), "tried", "!competitor"),
      L(x("Back to my old routine. The deal never really became my thing.", "Zurück zur alten Routine. Das Angebot ist nie richtig meins geworden.", "Vuelvo a mi rutina de antes. El menú nunca llegó a ser lo mío.", "Wracam do starej rutyny. Zestaw nigdy nie stał się mój."), "!competitor"),
      L(x("Lunch is whatever fits the day again.", "Mittags gibt's wieder, was gerade passt.", "La comida vuelve a ser lo que cuadre ese día.", "Lunch znowu jest taki, jaki pasuje do dnia."), "!competitor"),
    ],
    diary: [L(x("Back to my old lunch routine.", "Zurück zur alten Mittagsroutine.", "De vuelta a mi rutina de siempre.", "Powrót do starej rutyny lunchowej."))],
  },
  recommends_it: {
    thought: [
      L(x("Recommended the deal to {friend}. It's been reliable.", "Hab {friend} das Angebot empfohlen. Es ist zuverlässig.", "Recomendé el menú {friend}. Ha sido fiable.", "{g:Poleciłem|Poleciłam} {friend} zestaw. Jest niezawodny."), "tried"),
      L(x("Sent {friend} a photo of the board with 'go here'.", "{friend} ein Foto der Tafel geschickt: „Geht da hin.“", "Mandé una foto de la pizarra {friend} con un «id aquí».", "{g:Wysłałem|Wysłałam} {friend} zdjęcie tablicy z dopiskiem „idźcie tam”."), "fan"),
      L(x("Told {friend} it's worth a try. I like the place.", "Hab {friend} gesagt, dass es einen Versuch wert ist. Ich mag den Laden.", "Dije {friend} que vale la pena probarlo. Me gusta el sitio.", "{g:Powiedziałem|Powiedziałam} {friend}, że warto spróbować. Lubię to miejsce.")),
    ],
    says: [
      L(x("The lunch deal at {cafe} is reliable: {contents} for {price}.", "Das Mittagsangebot bei {cafe} ist verlässlich: {contents} für {price}.", "El menú de {cafe} no falla: {contents} por {price}.", "Zestaw w {cafe} nie zawodzi: {contents} za {price}.")),
      L(x("If you need a quick lunch, {cafe} is a safe bet.", "Wenn ihr schnell was zu Mittag braucht, ist {cafe} eine sichere Wahl.", "Si necesitas comer rápido, {cafe} es apuesta segura.", "Jak potrzebujecie szybkiego lunchu, {cafe} to pewny wybór.")),
      L(x("Go to {cafe} for lunch, the soup is good.", "Geht mittags zu {cafe}, die Suppe ist gut.", "Id a comer a {cafe}, la sopa está buena.", "Idźcie na lunch do {cafe}, zupa jest dobra.")),
    ],
    diary: [L(x("Recommended the lunch deal to {friend}.", "Hab {friend} das Mittagsangebot empfohlen.", "Recomendé el menú {friend}.", "{g:Poleciłem|Poleciłam} zestaw {friend}."))],
  },
  // ---- price change
  accepts: {
    thought: [
      L(x("Oh, it's cheaper now. Nice.", "Oh, ist jetzt billiger. Schön.", "Anda, ahora es más barato. Bien.", "O, teraz taniej. Fajnie."), "drop"),
      L(x("{price} instead of {old}. Everything's gone up; still worth it for the coffee here.", "{price} statt {old}. Alles ist teurer geworden; für den Kaffee hier lohnt es sich trotzdem.", "{price} en vez de {old}. Todo ha subido; aun así merece la pena por el café de aquí.", "{price} zamiast {old}. Wszystko podrożało; dla tutejszej kawy i tak warto."), "relaxed", "rise"),
      L(x("Noticed the new price. Fair enough, they're good to me here.", "Neuen Preis gesehen. In Ordnung, die sind gut zu mir hier.", "Vi el precio nuevo. Me parece bien, aquí me tratan bien.", "{g:Zauważyłem|Zauważyłam} nową cenę. W porządku, dobrze mnie tu traktują."), "fan"),
      L(x("{diff} more. I'm not changing cafés over that.", "{diff} mehr. Deswegen wechsle ich nicht das Café.", "{diff} más. No voy a cambiar de café por eso.", "{diff} więcej. Nie zmienię przez to kawiarni."), "rise"),
      L(x("Saw it straight away; I know the board by heart. Fine, I'll pay it.", "Sofort gesehen, ich kenne die Tafel auswendig. Gut, ich zahl's.", "Lo vi enseguida; me sé la pizarra de memoria. Vale, lo pago.", "Od razu {g:zauważyłem|zauważyłam}, znam tablicę na pamięć. Dobra, zapłacę."), "rise", "regular"),
      L(x("Saw the new price. Still a fair price for round here.", "Den neuen Preis gesehen. Für die Gegend immer noch fair.", "Vi el precio nuevo. Sigue siendo justo para la zona.", "{g:Widziałem|Widziałam} nową cenę. Jak na okolicę wciąż uczciwa.")),
      L(x("Noticed the board. Prices go up everywhere; this one's still fine.", "Die Tafel gesehen. Preise steigen überall; das hier ist noch okay.", "Vi la pizarra. Los precios suben en todas partes; este sigue bien.", "{g:Zauważyłem|Zauważyłam} tablicę. Ceny rosną wszędzie; ta jest jeszcze OK.")),
      L(x("New price, everything else the same. I can live with it.", "Neuer Preis, sonst alles wie immer. Kann ich mit leben.", "Precio nuevo, lo demás igual. Lo puedo asumir.", "Nowa cena, reszta bez zmian. Da się przeżyć.")),
      L(x("Saw it, shrugged, paid.", "Gesehen, mit den Schultern gezuckt, bezahlt.", "Lo vi, me encogí de hombros y pagué.", "{g:Zobaczyłem|Zobaczyłam}, {g:wzruszyłem|wzruszyłam} ramionami, {g:zapłaciłem|zapłaciłam}.")),
    ],
    diary: [
      L(x("{Item} is {price} now. Fine.", "{Item} kostet jetzt {price}. In Ordnung.", "{Item} ahora cuesta {price}. Vale.", "{Item} kosztuje teraz {price}. W porządku.")),
      L(x("Noticed the new price at {cafe}.", "Neuen Preis bei {cafe} bemerkt.", "Vi el precio nuevo en {cafe}.", "{g:Zauważyłem|Zauważyłam} nową cenę w {cafe}.")),
    ],
  },
  grumbles: {
    thought: [
      L(x("{price}? That's {diff} more every time, and I come most days. Said so to the barista, half joking.", "{price}? Das sind {diff} mehr, jedes Mal, und ich komme fast täglich. Hab's der Barista halb im Scherz gesagt.", "¿{price}? Son {diff} más cada vez, y vengo casi a diario. Se lo dije al barista medio en broma.", "{price}? To {diff} więcej za każdym razem, a przychodzę prawie codziennie. {g:Powiedziałem|Powiedziałam} to bariście pół żartem."), "regular"),
      L(x("Prices keep going up and the cups don't get bigger. Said it out loud.", "Die Preise steigen und die Tassen werden nicht größer. Hab's laut gesagt.", "Los precios no paran de subir y las tazas no crecen. Lo dije en voz alta.", "Ceny ciągle rosną, a filiżanki nie są większe. {g:Powiedziałem|Powiedziałam} to na głos."), "sceptic"),
      L(x("Every euro counts for me. I grumbled, then paid.", "Für mich zählt jeder Euro. Hab gemeckert und dann bezahlt.", "Para mí cuenta cada euro. Refunfuñé y luego pagué.", "Dla mnie liczy się każde euro. {g:Ponarzekałem|Ponarzekałam}, a potem {g:zapłaciłem|zapłaciłam}."), "sensitive"),
      L(x("I grumbled about the new price. Then I paid, like everyone does.", "Über den neuen Preis gemeckert. Dann bezahlt, wie alle.", "Me quejé del precio nuevo. Luego pagué, como todo el mundo.", "{g:Ponarzekałem|Ponarzekałam} na nową cenę. Potem {g:zapłaciłem|zapłaciłam}, jak wszyscy.")),
      L(x("Made a face at the board. The barista noticed.", "Hab vor der Tafel ein Gesicht gezogen. Die Barista hat's gesehen.", "Puse mala cara al ver la pizarra. El barista se dio cuenta.", "{g:Skrzywiłem|Skrzywiłam} się na widok tablicy. Barista to zauważył.")),
      L(x("Said 'again?' to nobody in particular. Then ordered.", "„Schon wieder?“ in den Raum gesagt. Dann bestellt.", "Dije «¿otra vez?» sin dirigirme a nadie. Luego pedí.", "{g:Rzuciłem|Rzuciłam} w powietrze „znowu?”. Potem {g:zamówiłem|zamówiłam}.")),
    ],
    says: [
      L(x("{price} for {a_item} now. It adds up when you come every day.", "{price} für {einen_item} jetzt. Das läppert sich, wenn man jeden Tag kommt.", "{price} por {un_item} ahora. Se nota cuando vienes todos los días.", "{price} za {item}. Jak się przychodzi codziennie, to się sumuje."), "regular"),
      L(x("{diff} more for the same {item}. Hm.", "{diff} mehr für dasselbe. Hm.", "{diff} más por lo mismo. Hum.", "{diff} więcej za to samo. Hm."), "rise"),
      L(x("Another price rise? It's getting pricey here.", "Schon wieder teurer? Wird langsam teuer hier.", "¿Otra subida? Esto se está poniendo caro.", "Znowu podwyżka? Robi się tu drogo.")),
      L(x("Coffee here costs {price} now. Just saying.", "Kaffee kostet hier jetzt {price}. Nur so.", "Aquí el café ya cuesta {price}. Lo digo y ya.", "Kawa kosztuje tu teraz {price}. Tak tylko mówię.")),
    ],
    diary: [L(x("Grumbled about the {item} going up to {price}.", "Gemeckert, weil {der_item} jetzt {price} kostet.", "Me quejé de que {el_item} ha subido a {price}.", "{g:Ponarzekałem|Ponarzekałam}, że {item} kosztuje teraz {price}."))],
  },
  does_not_notice: {
    thought: [
      L(x("I don't know what it cost before. Seems normal for round here.", "Ich weiß nicht, was es vorher gekostet hat. Scheint normal für die Gegend.", "No sé lo que costaba antes. Parece normal para la zona.", "Nie wiem, ile kosztowało wcześniej. Jak na okolicę wydaje się normalne."), "new"),
      L(x("Didn't look at the board. Tapped my card and went.", "Nicht auf die Tafel geschaut. Karte hingehalten und weg.", "No miré la pizarra. Pagué con la tarjeta y me fui.", "Nie {g:patrzyłem|patrzyłam} na tablicę. {g:Przyłożyłem|Przyłożyłam} kartę i {g:poszedłem|poszłam}.")),
      L(x("Ordered my {item} and paid. Didn't notice anything different.", "Bestellt, bezahlt. Nichts Besonderes bemerkt.", "Pedí lo mío y pagué. No noté nada distinto.", "{g:Zamówiłem|Zamówiłam} {item} i {g:zapłaciłem|zapłaciłam}. Nic innego nie {g:zauważyłem|zauważyłam}.")),
      L(x("I just ordered. I couldn't tell you what's on the board.", "Ich hab einfach bestellt. Was auf der Tafel steht, könnte ich nicht sagen.", "Simplemente pedí. No sabría decirte qué pone en la pizarra.", "Po prostu {g:zamówiłem|zamówiłam}. Nie powiem, co jest na tablicy.")),
      L(x("Paid by card without looking at the amount.", "Mit Karte bezahlt, ohne auf den Betrag zu schauen.", "Pagué con tarjeta sin mirar el importe.", "{g:Zapłaciłem|Zapłaciłam} kartą, nie patrząc na kwotę.")),
      L(x("Half asleep, ordered on autopilot.", "Halb verschlafen, auf Autopilot bestellt.", "{g:Medio dormido|Medio dormida}, pedí en piloto automático.", "Pół śpiąc, {g:zamówiłem|zamówiłam} na autopilocie.")),
    ],
    diary: [
      L(x("Usual {item}, nothing special.", "Wie immer, nichts Besonderes.", "Lo de siempre, nada especial.", "Jak zwykle, nic szczególnego.")),
      L(x("Coffee at {cafe}, as usual.", "Kaffee bei {cafe}, wie immer.", "Café en {cafe}, como siempre.", "Kawa w {cafe}, jak zwykle.")),
    ],
  },
  buys_as_usual: {
    thought: [
      L(x("Ordered the usual. The price is the price; I like it here.", "Das Übliche bestellt. Der Preis ist der Preis; ich mag es hier.", "Pedí lo de siempre. El precio es el que es; me gusta este sitio.", "{g:Zamówiłem|Zamówiłam} to, co zwykle. Cena jest, jaka jest; lubię tu przychodzić."), "fan"),
      L(x("Same order as always. It's {diff} more, I'll live.", "Dieselbe Bestellung wie immer. Sind {diff} mehr, werd's überleben.", "Lo mismo de siempre. Son {diff} más, sobreviviré.", "To samo co zawsze. To {diff} więcej, przeżyję."), "relaxed", "rise"),
      L(x("The barista started my order before I'd said a word. Of course I paid.", "Die Barista hat angefangen, bevor ich was gesagt hab. Klar hab ich bezahlt.", "El barista empezó mi pedido antes de que abriera la boca. Claro que pagué.", "Barista zaczął robić moje zamówienie, zanim się {g:odezwałem|odezwałam}. Jasne, że {g:zapłaciłem|zapłaciłam}."), "regular"),
      L(x("Bought my {item} as usual. Didn't think about it much.", "Wie immer gekauft. Nicht groß drüber nachgedacht.", "Compré lo de siempre. No le di muchas vueltas.", "{g:Kupiłem|Kupiłam} {item} jak zwykle. Nie {g:myślałem|myślałam} o tym za dużo.")),
      L(x("Same as always: one {item}, a quick chat, out the door.", "Wie immer: einmal das Übliche, kurz geplaudert, raus.", "Como siempre: {un_item}, una charla rápida y a la calle.", "Jak zawsze: {item}, krótka rozmowa i za drzwi.")),
      L(x("Usual order. I barely looked at the board.", "Das Übliche. Kaum auf die Tafel geschaut.", "Lo de siempre. Apenas miré la pizarra.", "Zwykłe zamówienie. Ledwo {g:spojrzałem|spojrzałam} na tablicę.")),
      L(x("Still my morning stop. The coffee is good, that's what counts.", "Immer noch mein Morgenstopp. Der Kaffee ist gut, das zählt.", "Sigue siendo mi parada de la mañana. El café es bueno, que es lo que cuenta.", "Wciąż mój poranny przystanek. Kawa jest dobra, to się liczy.")),
    ],
    diary: [L(x("Usual {item} at {cafe}.", "Das Übliche bei {cafe}.", "Lo de siempre en {cafe}.", "Jak zwykle {item} w {cafe}."))],
  },
  buys_less_often: {
    thought: [
      L(x("{speaker} said it's got pricey here, and they have a point. Fewer visits for me.", "{speaker} meinte, es sei teuer geworden, und da ist was dran. Ich komme seltener.", "{speaker} dijo que esto se ha puesto caro, y algo de razón tiene. Vendré menos.", "{speaker} mówi, że zrobiło się drogo, i coś w tym jest. Będę przychodzić rzadziej."), "heard"),
      L(x("I'll make coffee at home on some days now. {diff} every time adds up.", "Ich mach jetzt an manchen Tagen Kaffee zu Hause. {diff} jedes Mal läppert sich.", "Algunos días me haré el café en casa. {diff} cada vez, al final suma.", "W niektóre dni będę robić kawę w domu. {diff} za każdym razem się sumuje."), "sensitive", "rise"),
      L(x("Still come, just not every day. The new price made me count.", "Komme noch, nur nicht jeden Tag. Der neue Preis hat mich rechnen lassen.", "Sigo viniendo, pero no todos los días. El precio nuevo me hizo echar cuentas.", "Dalej przychodzę, ale nie codziennie. Nowa cena kazała mi policzyć."), "regular"),
      L(x("I said it was getting pricey, and I meant it. Fewer visits now.", "Ich hab gesagt, dass es teuer wird, und das meinte ich ernst. Jetzt seltener.", "Dije que se estaba poniendo caro y lo decía en serio. Ahora vengo menos.", "{g:Mówiłem|Mówiłam}, że robi się drogo, i {g:mówiłem|mówiłam} serio. Teraz rzadziej."), "grumbled"),
      L(x("Skipping it on a couple of days a week now. Not a protest, just a budget.", "Lass es jetzt an ein paar Tagen pro Woche weg. Kein Protest, nur Budget.", "Ahora me lo salto un par de días a la semana. No es una protesta, es el presupuesto.", "Teraz odpuszczam kilka dni w tygodniu. To nie protest, tylko budżet.")),
      L(x("Down to three times a week. It's the small things that add up.", "Nur noch dreimal die Woche. Die kleinen Dinge läppern sich.", "Ahora tres veces por semana. Son las pequeñas cosas las que suman.", "Teraz trzy razy w tygodniu. To drobiazgi się sumują.")),
      L(x("Coffee out has become a treat rather than a habit.", "Kaffee unterwegs ist jetzt eher Luxus als Gewohnheit.", "El café fuera se ha vuelto un capricho más que una costumbre.", "Kawa na mieście to teraz raczej przyjemność niż nawyk.")),
    ],
    diary: [L(x("Buying the {item} less often since it went up.", "Kaufe seltener, seit es teurer ist.", "Lo compro menos desde que subió.", "Kupuję rzadziej, odkąd podrożało."))],
  },
  switches_to_cheaper_item: {
    thought: [
      L(x("Switched to {cheaper}. Same café, smaller bill.", "Bin auf {cheaper} umgestiegen. Gleiches Café, kleinere Rechnung.", "Me pasé a {cheaper}. El mismo café, menos cuenta.", "{g:Przerzuciłem|Przerzuciłam} się na {cheaper}. Ta sama kawiarnia, mniejszy rachunek."), "sensitive"),
      L(x("Looked at the board and picked {cheaper}. The {item} isn't worth {price} to me.", "Auf die Tafel geschaut und {cheaper} genommen. {price} ist mir das nicht wert.", "Miré la pizarra y elegí {cheaper}. Para mí, {price} no lo vale.", "{g:Spojrzałem|Spojrzałam} na tablicę i {g:wybrałem|wybrałam} {cheaper}. {price} to dla mnie za dużo.")),
      L(x("Had {cheaper} instead. Honestly fine.", "Stattdessen {cheaper}. Ehrlich gesagt völlig okay.", "Tomé {cheaper}. La verdad, bien.", "{g:Wziąłem|Wzięłam} {cheaper}. Szczerze, w porządku.")),
      L(x("Tried {cheaper} for a change. Not bad, and cheaper.", "Zur Abwechslung {cheaper} probiert. Nicht schlecht, und günstiger.", "Probé {cheaper} para variar. No está mal, y es más barato.", "Dla odmiany {g:wziąłem|wzięłam} {cheaper}. Nieźle i taniej.")),
    ],
    diary: [L(x("Switched to {cheaper} instead of the {item}.", "Statt des Üblichen jetzt {cheaper}.", "Ahora {cheaper} en vez de lo de siempre.", "Zamiast zwykłego teraz {cheaper}."))],
  },
  goes_elsewhere: {
    thought: [
      L(x("The new place everyone mentions is cheaper, so I went there.", "Der neue Laden, von dem alle reden, ist billiger, also bin ich da hin.", "El sitio nuevo del que habla todo el mundo es más barato, así que fui allí.", "Nowe miejsce, o którym wszyscy mówią, jest tańsze, więc tam {g:poszedłem|poszłam}."), "competitor"),
      L(x("Got my coffee at {alt_at} this time. A bit cheaper, and I wanted to compare.", "Diesmal Kaffee {alt_at}. Etwas billiger, und ich wollte vergleichen.", "Esta vez tomé el café {alt_at}. Algo más barato, y quería comparar.", "Tym razem kawa {alt_at}. Trochę taniej, a {g:chciałem|chciałam} porównać."), "competitor", "sensitive"),
      L(x("{speaker} said it's cheaper elsewhere, so I tried {alt_to}.", "{speaker} meinte, woanders ist es billiger, also hab ich es {alt_at} probiert.", "{speaker} dijo que en otro sitio es más barato, así que fui {alt_to}.", "{speaker} mówi, że gdzie indziej jest taniej, więc {g:poszedłem|poszłam} {alt_to}."), "heard"),
      L(x("Went to {alt_to} instead. If it's going to cost that much, I'll shop around.", "Bin stattdessen {alt_to}. Wenn es so viel kostet, schau ich mich um.", "Fui {alt_to}. Si va a costar tanto, miraré otras opciones.", "{g:Poszedłem|Poszłam} {alt_to}. Skoro ma tyle kosztować, rozejrzę się."), "sceptic", "!competitor"),
      L(x("{Alt} does it for less. Tried them this time.", "{Alt_at} ist es billiger. Diesmal da probiert.", "{Alt_at} sale más barato. Esta vez probé allí.", "{Alt_at} jest taniej. Tym razem {g:spróbowałem|spróbowałam} tam."), "sensitive", "!competitor"),
      L(x("Got my coffee at {alt_at} today. Wanted to compare.", "Heute Kaffee {alt_at}. Wollte vergleichen.", "Hoy tomé el café {alt_at}. Quería comparar.", "Dziś kawa {alt_at}. {g:Chciałem|Chciałam} porównać."), "!competitor"),
      L(x("Grabbed one at {alt_at}; it was on my way.", "Einen {alt_at} geholt; lag auf dem Weg.", "Cogí uno {alt_at}; me pillaba de camino.", "{g:Wziąłem|Wzięłam} kawę {alt_at}; było po drodze."), "!competitor"),
    ],
    diary: [L(x("Got it at {alt_at} instead.", "Stattdessen {alt_at} gekauft.", "Lo compré {alt_at}.", "{g:Kupiłem|Kupiłam} {alt_at}."))],
  },
  keeps_buying: {
    thought: [
      L(x("{speaker} says it's still worth it here, and I agree. Still buying it.", "{speaker} sagt, es lohnt sich hier immer noch, und ich finde das auch. Kaufe weiter.", "{speaker} dice que aquí sigue valiendo la pena, y estoy de acuerdo. Lo sigo comprando.", "{speaker} mówi, że tu dalej warto, i się zgadzam. Dalej kupuję."), "heard"),
      L(x("Still buying it. I stopped thinking about the price after a few days.", "Kaufe es weiter. Nach ein paar Tagen hab ich nicht mehr an den Preis gedacht.", "Lo sigo comprando. A los pocos días dejé de pensar en el precio.", "Dalej kupuję. Po kilku dniach {g:przestałem|przestałam} myśleć o cenie."), "relaxed"),
      L(x("Still my place. The {item} is good, and that matters more.", "Immer noch mein Laden. Der Kaffee ist gut, das zählt mehr.", "Sigue siendo mi sitio. El café es bueno, y eso pesa más.", "Wciąż moje miejsce. Kawa jest dobra, to ważniejsze."), "fan"),
      L(x("Keep buying it as before. The price is just the price now.", "Kaufe es weiter wie vorher. Der Preis ist jetzt einfach der Preis.", "Lo sigo comprando como antes. El precio ya es el que es.", "Kupuję jak wcześniej. Cena to teraz po prostu cena.")),
      L(x("Still buying it. Coffee is the one treat I don't count.", "Kaufe es weiter. Kaffee ist der eine Luxus, den ich nicht nachrechne.", "Lo sigo comprando. El café es el único capricho que no cuento.", "Dalej kupuję. Kawa to jedyna przyjemność, której nie liczę.")),
      L(x("Nothing's changed for me. Same time, same order.", "Für mich hat sich nichts geändert. Gleiche Zeit, gleiche Bestellung.", "Para mí nada ha cambiado. Misma hora, mismo pedido.", "U mnie nic się nie zmieniło. Ta sama pora, to samo zamówienie.")),
      L(x("Honestly, I'd forgotten it ever cost less.", "Ehrlich gesagt hab ich vergessen, dass es mal billiger war.", "La verdad, ya ni me acordaba de que costaba menos.", "Szczerze, {g:zapomniałem|zapomniałam}, że kiedyś było taniej.")),
    ],
    diary: [L(x("Still buying the {item} here.", "Kaufe hier weiter.", "Lo sigo comprando aquí.", "Dalej kupuję tutaj."))],
  },
  tells_friend_it_is_pricey: {
    thought: [
      L(x("Told {friend} the {item} here has got pricey. Just saying.", "Hab {friend} erzählt, dass es hier teurer geworden ist. Nur so.", "Comenté {friend} que aquí se ha puesto caro. Por decirlo.", "{g:Powiedziałem|Powiedziałam} {friend}, że tu zrobiło się drogo. Tak tylko."), "grumbled"),
      L(x("Told {friend} where it's cheaper now. We look out for each other.", "Hab {friend} gesagt, wo es jetzt billiger ist. Wir passen aufeinander auf.", "Dije {friend} dónde sale más barato ahora. Nos avisamos entre nosotros.", "{g:Powiedziałem|Powiedziałam} {friend}, gdzie teraz jest taniej. Dbamy o siebie."), "sensitive"),
      L(x("Mentioned to {friend} that prices went up. People should know.", "Hab {friend} gesagt, dass die Preise gestiegen sind. Sollen die Leute ruhig wissen.", "Comenté {friend} que han subido los precios. La gente debería saberlo.", "{g:Wspomniałem|Wspomniałam} {friend}, że ceny poszły w górę. Ludzie powinni wiedzieć.")),
      L(x("It came up when we compared cafés. I said {cafe} has got dearer.", "Kam auf, als wir Cafés verglichen haben. Ich hab gesagt, dass {cafe} teurer geworden ist.", "Salió cuando comparábamos cafés. Dije que {cafe} se ha encarecido.", "Wyszło, kiedy porównywaliśmy kawiarnie. {g:Powiedziałem|Powiedziałam}, że w {cafe} jest drożej.")),
    ],
    says: [
      L(x("{cafe} put the {item} up to {price}. Getting pricey.", "{cafe} hat auf {price} erhöht. Wird teuer.", "{cafe} ha subido {el_item} a {price}. Se está poniendo caro.", "W {cafe} podnieśli cenę do {price}. Robi się drogo.")),
      L(x("The {item} at {cafe} costs {price} now, just so you know.", "{Item} bei {cafe} kostet jetzt {price}, nur damit ihr's wisst.", "{Item} en {cafe} ahora cuesta {price}, para que lo sepáis.", "{Item} w {cafe} kosztuje teraz {price}, żebyście wiedzieli.")),
      L(x("Coffee at {cafe} has gone up. Still good, but pricier.", "Kaffee bei {cafe} ist teurer geworden. Immer noch gut, aber teurer.", "El café en {cafe} ha subido. Sigue bueno, pero más caro.", "Kawa w {cafe} podrożała. Dalej dobra, ale droższa.")),
    ],
    diary: [L(x("Told {friend} {cafe} has got pricier.", "Hab {friend} erzählt, dass {cafe} teurer ist.", "Comenté {friend} que {cafe} está más caro.", "{g:Powiedziałem|Powiedziałam} {friend}, że w {cafe} jest drożej."))],
  },
  forgot_about_it: {
    thought: [
      L(x("What price change? I just pay.", "Welche Preisänderung? Ich zahl einfach.", "¿Qué cambio de precio? Yo pago y ya.", "Jaka zmiana ceny? Po prostu płacę."), "relaxed"),
      L(x("I've forgotten what it used to cost. It's just the price now.", "Ich weiß nicht mehr, was es vorher gekostet hat. Ist jetzt einfach der Preis.", "Ya no recuerdo lo que costaba antes. Ahora es el precio y ya.", "Nie pamiętam już, ile kosztowało wcześniej. Teraz to po prostu cena.")),
      L(x("Honestly, I couldn't tell you what it used to cost.", "Ehrlich, ich könnte nicht sagen, was es früher gekostet hat.", "La verdad, no sabría decirte cuánto costaba.", "Szczerze, nie powiem, ile kiedyś kosztowało.")),
    ],
    diary: [L(x("Don't think about the price anymore.", "Denke nicht mehr über den Preis nach.", "Ya no pienso en el precio.", "Nie myślę już o cenie."))],
  },
  stays_away: {
    thought: [
      L(x("Not going back for a while. The new place is cheaper.", "Ich geh erst mal nicht mehr hin. Der neue Laden ist billiger.", "No vuelvo por un tiempo. El sitio nuevo es más barato.", "Na razie nie wracam. Nowe miejsce jest tańsze."), "competitor"),
      L(x("After what {speaker} said about the prices, I've stayed away.", "Nach dem, was {speaker} über die Preise gesagt hat, bleibe ich weg.", "Después de lo que dijo {speaker} de los precios, no he vuelto.", "Po tym, co {speaker} mówi o cenach, na razie się nie pokazuję."), "heard"),
      L(x("Haven't been back since. {Alt} is fine and cheaper.", "Seitdem nicht mehr da gewesen. {Alt_at} ist es auch gut und billiger.", "No he vuelto desde entonces. {Alt_at} también está bien y sale más barato.", "Od tamtej pory nie {g:wracałem|wracałam}. {Alt_at} też jest dobrze i taniej."), "sensitive", "!competitor"),
      L(x("Staying away for now. It's a small thing, but it bugged me.", "Bleibe erst mal weg. Ist eine Kleinigkeit, aber es hat mich geärgert.", "De momento no voy. Es una tontería, pero me molestó.", "Na razie się nie pokazuję. Drobiazg, ale mnie to wkurzyło.")),
      L(x("Haven't felt like going in lately.", "Hatte in letzter Zeit keine Lust hinzugehen.", "Últimamente no me apetece entrar.", "Ostatnio nie mam ochoty tam wchodzić.")),
    ],
    diary: [L(x("Stayed away from {cafe}.", "Von {cafe} weggeblieben.", "No fui a {cafe}.", "Nie {g:chodziłem|chodziłam} do {cafe}."))],
  },
  stays_a_customer: {
    thought: [
      L(x("{speaker} still swears by the coffee here, and so do I.", "{speaker} schwört immer noch auf den Kaffee hier, ich auch.", "{speaker} sigue jurando que aquí está el mejor café, y yo también.", "{speaker} dalej zachwala tutejszą kawę, ja też."), "heard"),
      L(x("Still coming as before. Good coffee, nice people, that's what counts.", "Komme weiter wie bisher. Guter Kaffee, nette Leute, das zählt.", "Sigo viniendo como antes. Buen café, gente maja, es lo que cuenta.", "Przychodzę jak dawniej. Dobra kawa, mili ludzie, to się liczy."), "fan"),
      L(x("Still here most mornings. You don't drop your café over a few cents.", "Fast jeden Morgen noch hier. Wegen ein paar Cent gibt man sein Café nicht auf.", "Sigo aquí casi todas las mañanas. No dejas tu café por unos céntimos.", "Prawie każdego ranka wciąż tu jestem. Nie rzuca się swojej kawiarni dla kilku centów."), "regular"),
      L(x("Still a customer. The price change is old news.", "Bin weiter {g:Kunde|Kundin}. Die Preisänderung ist Schnee von gestern.", "Sigo siendo {g:cliente|clienta}. Lo del precio ya es historia.", "Dalej jestem {g:klientem|klientką}. Zmiana ceny to stara historia.")),
      L(x("I still come in like before. The board is just the board.", "Ich komme weiter wie vorher. Die Tafel ist halt die Tafel.", "Sigo viniendo como antes. La pizarra es la pizarra.", "Przychodzę jak wcześniej. Tablica to tylko tablica.")),
    ],
    diary: [L(x("Still buying at {cafe} as before.", "Kaufe weiter bei {cafe} wie bisher.", "Sigo comprando en {cafe} como antes.", "Dalej kupuję w {cafe} jak dawniej."))],
  },
  buys_less_than_before: {
    thought: [
      L(x("{speaker} has a point about the prices. I come less now.", "{speaker} hat recht mit den Preisen. Ich komme jetzt seltener.", "{speaker} tiene razón con los precios. Ahora vengo menos.", "{speaker} ma rację co do cen. Teraz przychodzę rzadziej."), "heard"),
      L(x("I come less than before. Two or three times a week instead of every day.", "Ich komme seltener als früher. Zwei-, dreimal die Woche statt jeden Tag.", "Vengo menos que antes. Dos o tres veces por semana en vez de a diario.", "Przychodzę rzadziej niż kiedyś. Dwa, trzy razy w tygodniu zamiast codziennie."), "regular"),
      L(x("Buying less than before. I notice the difference.", "Kaufe weniger als vorher. Ich merke den Unterschied.", "Compro menos que antes. Noto la diferencia.", "Kupuję mniej niż wcześniej. Czuję różnicę.")),
      L(x("Cut back a bit. Coffee at home most mornings now.", "Etwas zurückgeschraubt. Meistens Kaffee zu Hause jetzt.", "He recortado un poco. Ahora casi siempre café en casa.", "Trochę {g:ograniczyłem|ograniczyłam}. Teraz zwykle kawa w domu.")),
    ],
    diary: [L(x("Buying less at {cafe} than before.", "Kaufe weniger bei {cafe} als früher.", "Compro menos en {cafe} que antes.", "Kupuję w {cafe} mniej niż kiedyś."))],
  },
  recommends_cafe_anyway: {
    thought: [
      L(x("It's a bit more now, but I still told {friend} it's the best {item} round here.", "Ist jetzt etwas teurer, aber ich hab {friend} trotzdem gesagt, dass es hier den besten Kaffee gibt.", "Ahora cuesta algo más, pero aun así dije {friend} que aquí está el mejor café de la zona.", "Jest trochę drożej, ale i tak {g:powiedziałem|powiedziałam} {friend}, że tu jest najlepsza kawa w okolicy."), "fan"),
      L(x("{speaker} recommends it too, so I told {friend}: still the best coffee round here.", "{speaker} empfiehlt es auch, also hab ich {friend} gesagt: immer noch der beste Kaffee hier.", "{speaker} también lo recomienda, así que dije {friend}: sigue siendo el mejor café de la zona.", "{speaker} też poleca, więc {g:powiedziałem|powiedziałam} {friend}: wciąż najlepsza kawa w okolicy."), "heard"),
      L(x("Recommended the café to {friend}. The price is fine for what you get.", "Hab {friend} das Café empfohlen. Der Preis passt für das, was man bekommt.", "Recomendé el café {friend}. El precio está bien para lo que es.", "{g:Poleciłem|Poleciłam} kawiarnię {friend}. Cena jest OK za to, co się dostaje.")),
      L(x("Someone asked for a good café nearby, so I recommended this one to {friend}.", "Jemand hat nach einem guten Café gefragt, also hab ich {friend} dieses hier empfohlen.", "Alguien preguntó por un buen café cerca, así que recomendé este {friend}.", "Ktoś pytał o dobrą kawiarnię w pobliżu, więc {g:poleciłem|poleciłam} tę {friend}.")),
    ],
    says: [
      L(x("Still the best {item} round here, even at {price}.", "Immer noch der beste Kaffee hier, auch für {price}.", "Sigue siendo el mejor café de la zona, incluso a {price}.", "Wciąż najlepsza kawa w okolicy, nawet za {price}.")),
      L(x("Go to {cafe}, the staff are lovely. A bit pricier than it was, still worth it.", "Geht zu {cafe}, das Team ist super. Etwas teurer als früher, lohnt sich trotzdem.", "Id a {cafe}, el personal es encantador. Algo más caro que antes, pero vale la pena.", "Idźcie do {cafe}, obsługa jest przemiła. Trochę drożej niż kiedyś, ale warto.")),
      L(x("{cafe} is worth the extra cents.", "{cafe} ist die paar Cent mehr wert.", "{cafe} vale esos céntimos de más.", "Do {cafe} warto iść, nawet za te kilka centów więcej.")),
    ],
    diary: [L(x("Recommended {cafe} to {friend}.", "Hab {friend} {cafe} empfohlen.", "Recomendé {cafe} {friend}.", "{g:Poleciłem|Poleciłam} {friend} {cafe}."))],
  },
  mentions_price_in_review: {
    thought: [
      L(x("Left a review. Good coffee, but the price went up and people should know.", "Bewertung geschrieben. Guter Kaffee, aber der Preis ist gestiegen, und das sollen die Leute wissen.", "Dejé una reseña. Buen café, pero el precio ha subido y la gente debería saberlo.", "{g:Wystawiłem|Wystawiłam} opinię. Dobra kawa, ale cena wzrosła i ludzie powinni wiedzieć."), "sceptic"),
      L(x("Wrote a short review and mentioned the price.", "Kurze Bewertung geschrieben und den Preis erwähnt.", "Escribí una reseña corta y mencioné el precio.", "{g:Napisałem|Napisałam} krótką opinię i {g:wspomniałem|wspomniałam} o cenie.")),
      L(x("Three stars: nice place, but the prices are creeping up.", "Drei Sterne: netter Laden, aber die Preise klettern.", "Tres estrellas: sitio agradable, pero los precios no paran de subir.", "Trzy gwiazdki: miłe miejsce, ale ceny pełzną w górę.")),
    ],
    says: [
      L(x("Nice café, but the {item} is {price} now. Pricey for the area.", "Nettes Café, aber {der_item} kostet jetzt {price}. Teuer für die Gegend.", "Café agradable, pero {el_item} ya cuesta {price}. Caro para la zona.", "Miła kawiarnia, ale {item} kosztuje teraz {price}. Drogo jak na okolicę.")),
      L(x("Good {item}, friendly staff, prices creeping up.", "Guter Kaffee, nettes Team, die Preise klettern.", "Buen café, personal amable, precios subiendo.", "Dobra kawa, miła obsługa, ceny pełzną w górę.")),
    ],
    diary: [L(x("Mentioned the price in a review of {cafe}.", "In einer Bewertung über {cafe} den Preis erwähnt.", "Mencioné el precio en una reseña de {cafe}.", "W opinii o {cafe} {g:wspomniałem|wspomniałam} o cenie."))],
  },
  still_buys_regularly: {
    thought: [
      L(x("Still buy it most days. I don't think about the price anymore.", "Kaufe es immer noch fast täglich. An den Preis denke ich nicht mehr.", "Lo sigo comprando casi a diario. Ya no pienso en el precio.", "Dalej kupuję prawie codziennie. Nie myślę już o cenie."), "regular"),
      L(x("My café, my coffee. That hasn't changed.", "Mein Café, mein Kaffee. Daran hat sich nichts geändert.", "Mi sitio, mi café. Eso no ha cambiado.", "Moja kawiarnia, moja kawa. To się nie zmieniło."), "fan"),
      L(x("Still buying it regularly. The change is long forgotten.", "Kaufe es weiter regelmäßig. Die Änderung ist längst vergessen.", "Lo sigo comprando con regularidad. El cambio está más que olvidado.", "Dalej regularnie kupuję. O zmianie dawno {g:zapomniałem|zapomniałam}.")),
      L(x("Part of my routine, same as before.", "Gehört zu meiner Routine, wie vorher.", "Forma parte de mi rutina, como antes.", "To część mojej rutyny, jak wcześniej.")),
    ],
    diary: [L(x("Still buying the {item} regularly.", "Kaufe weiter regelmäßig.", "Sigo comprándolo con regularidad.", "Dalej regularnie kupuję."))],
  },
  buys_now_and_then: {
    thought: [
      L(x("Now and then, as a treat. Not my daily thing anymore.", "Ab und zu, als kleiner Luxus. Nicht mehr täglich.", "De vez en cuando, como capricho. Ya no a diario.", "Od czasu do czasu, jako przyjemność. Już nie codziennie."), "sensitive"),
      L(x("I buy it now and then, less than I used to.", "Ich kauf es ab und zu, weniger als früher.", "Lo compro de vez en cuando, menos que antes.", "Kupuję od czasu do czasu, mniej niż kiedyś.")),
      L(x("On Fridays, mostly. The rest of the week I make my own.", "Meistens freitags. Den Rest der Woche mach ich ihn selbst.", "Sobre todo los viernes. El resto de la semana me lo hago yo.", "Głównie w piątki. Przez resztę tygodnia robię sobie {g:sam|sama}.")),
    ],
    diary: [L(x("The {item} at {cafe} now and then.", "Ab und zu bei {cafe}.", "De vez en cuando en {cafe}.", "Od czasu do czasu w {cafe}."))],
  },
  found_somewhere_cheaper: {
    thought: [
      L(x("The new place does it for less. That's where I go now.", "Der neue Laden macht es günstiger. Da geh ich jetzt hin.", "El sitio nuevo lo hace más barato. Ahora voy allí.", "Nowe miejsce robi to taniej. Teraz tam chodzę."), "competitor"),
      L(x("Every euro counts. I go where it's cheaper now.", "Jeder Euro zählt. Ich geh jetzt dahin, wo es billiger ist.", "Cada euro cuenta. Ahora voy donde es más barato.", "Liczy się każde euro. Teraz chodzę tam, gdzie taniej."), "sensitive"),
      L(x("{Alt} is my coffee stop now. Cheaper, and it's on my way.", "Mein Kaffeestopp ist jetzt {alt_at}. Billiger, und es liegt auf dem Weg.", "Ahora paro a tomar café {alt_at}. Más barato y me pilla de camino.", "Teraz kawę piję {alt_at}. Taniej i po drodze."), "!competitor"),
      L(x("Found a cheaper option and stuck with it.", "Was Günstigeres gefunden und dabei geblieben.", "Encontré una opción más barata y me quedé con ella.", "{g:Znalazłem|Znalazłam} tańszą opcję i przy niej {g:zostałem|zostałam}."), "!competitor"),
    ],
    diary: [L(x("Switched to {alt_to} for coffee.", "Kaffee jetzt {alt_at}.", "Ahora el café lo tomo {alt_at}.", "Kawa teraz {alt_at}."))],
  },
  recommends_cafe: {
    thought: [
      L(x("Like {speaker}, I told {friend} {cafe} is worth it.", "Wie {speaker} hab ich {friend} gesagt, dass sich {cafe} lohnt.", "Como {speaker}, dije {friend} que {cafe} merece la pena.", "Tak jak {speaker}, {g:powiedziałem|powiedziałam} {friend}, że warto chodzić do {cafe}."), "heard"),
      L(x("Recommended {cafe} to {friend}. Good coffee is worth a bit more.", "Hab {friend} {cafe} empfohlen. Guter Kaffee ist ein bisschen mehr wert.", "Recomendé {cafe} {friend}. El buen café vale un poco más.", "{g:Poleciłem|Poleciłam} {friend} {cafe}. Dobra kawa jest warta trochę więcej."), "fan"),
      L(x("Told {friend} about {cafe}. It's still my favourite.", "Hab {friend} von {cafe} erzählt. Immer noch mein Lieblingscafé.", "Hablé de {cafe} {friend}. Sigue siendo mi favorito.", "{g:Powiedziałem|Powiedziałam} {friend} o {cafe}. Wciąż moje ulubione miejsce.")),
      L(x("Mentioned {cafe} when someone asked for a good café nearby.", "Hab {cafe} erwähnt, als jemand nach einem guten Café in der Nähe gefragt hat.", "Mencioné {cafe} cuando alguien preguntó por un buen café cerca.", "{g:Wspomniałem|Wspomniałam} o {cafe}, kiedy ktoś pytał o dobrą kawiarnię w okolicy.")),
    ],
    says: [
      L(x("{cafe} still does the best {item} round here.", "{cafe} hat immer noch den besten Kaffee hier.", "{cafe} sigue teniendo el mejor café de la zona.", "{cafe} wciąż ma najlepszą kawę w okolicy.")),
      L(x("If you're nearby, {cafe} is worth it.", "Wenn ihr in der Nähe seid, lohnt sich {cafe}.", "Si estáis cerca, {cafe} merece la pena.", "Jeśli jesteście w pobliżu, warto zajrzeć do {cafe}.")),
    ],
    diary: [L(x("Recommended {cafe} to {friend}.", "Hab {friend} {cafe} empfohlen.", "Recomendé {cafe} {friend}.", "{g:Poleciłem|Poleciłam} {friend} {cafe}."))],
  },
};

/** "No strong feelings" fallback when an action has no lines (never shipped, but safe). */
export const FALLBACK_THOUGHT: Tx = x("No strong feelings either way.", "Mir ist das ziemlich egal.", "Ni fu ni fa.", "Nie mam zdania.");

/** Extra words that make a line someone else already used this round their own. */
export const SEGMENT_TAILS: Record<SegmentId, Tx[]> = {
  office_worker: [x("The office was waiting.", "Das Büro hat gewartet.", "La oficina me esperaba.", "Biuro czekało."), x("Back to the desk after.", "Danach zurück an den Schreibtisch.", "Luego, de vuelta a la mesa.", "Potem z powrotem do biurka.")],
  freelancer: [x("Then back to the laptop.", "Dann wieder an den Laptop.", "Luego, otra vez al portátil.", "Potem z powrotem do laptopa."), x("Deadline on Friday, so no fuss.", "Freitag ist Deadline, also kein Aufwand.", "Entrega el viernes, así que sin líos.", "W piątek termin, więc bez zamieszania.")],
  student: [x("Lectures again at two.", "Um zwei wieder Vorlesung.", "A las dos, otra vez a clase.", "O czternastej znowu zajęcia."), x("The flat chat can wait.", "Der WG-Chat kann warten.", "El chat del piso puede esperar.", "Czat współlokatorów może poczekać.")],
  parent: [x("Pick-up is at three.", "Um drei ist Abholen.", "A las tres toca recoger.", "O piętnastej odbiór."), x("The little one was asleep, for once.", "Die Kleine hat ausnahmsweise geschlafen.", "La peque dormía, por una vez.", "Mała dla odmiany spała.")],
  regular: [x("Same as most days, really.", "Wie an den meisten Tagen eigentlich.", "Como casi todos los días, la verdad.", "Właściwie jak w większość dni."), x("The staff know me by now.", "Das Team kennt mich ja.", "El personal ya me conoce.", "Obsługa już mnie zna.")],
  tourist: [x("Then on to the next sight.", "Dann weiter zur nächsten Sehenswürdigkeit.", "Luego, a ver lo siguiente.", "Potem dalej zwiedzać."), x("Berlin is full of surprises.", "Berlin ist voller Überraschungen.", "Berlín está lleno de sorpresas.", "Berlin jest pełen niespodzianek.")],
  retiree: [x("I'll tell the choir on Thursday.", "Erzähl ich am Donnerstag im Chor.", "Se lo contaré al coro el jueves.", "Opowiem w czwartek w chórze."), x("It goes in my little notebook.", "Kommt in mein kleines Heft.", "Lo apunto en mi libretita.", "Zapiszę to w zeszyciku.")],
  trades: [x("Then back on the job.", "Dann wieder an die Arbeit.", "Luego, de vuelta a la obra.", "Potem z powrotem do roboty."), x("The van was parked right outside.", "Der Transporter stand direkt vor der Tür.", "La furgoneta estaba en la misma puerta.", "Bus stał tuż przed wejściem.")],
};

export const VERDICTS: { cheaper: Tx; other: Tx[] } = {
  cheaper: x("good value", "preiswert", "buena relación calidad-precio", "opłacalny"),
  other: [x("decent", "ganz ordentlich", "decente", "niezły"), x("good soup, small sandwich", "gute Suppe, kleines Sandwich", "buena sopa, bocadillo pequeño", "dobra zupa, mała kanapka"), x("fine, nothing special", "okay, nichts Besonderes", "bien, nada especial", "w porządku, nic specjalnego")],
};

export const CHEAPER: { filter: Tx; other: Tx } = {
  filter: x("a filter coffee", "einen Filterkaffee", "un café de filtro", "kawę przelewową"),
  other: x("something cheaper", "etwas Günstigeres", "algo más barato", "coś tańszego"),
};

/** Who a persona would tell (de/pl dative, es with "a"), by segment. */
export const FRIEND: Record<SegmentId, Tx> = {
  office_worker: x("a colleague", "den Kollegen", "a mis compañeros de trabajo", "kolegom z pracy"),
  freelancer: x("a friend from the co-working space", "Leuten aus dem Coworking-Space", "a la gente del coworking", "ludziom z coworkingu"),
  student: x("my flatmate", "meiner WG", "a mis compañeros de piso", "współlokatorom"),
  parent: x("another parent from nursery", "anderen Eltern aus der Kita", "a otros padres de la guarde", "innym rodzicom z przedszkola"),
  regular: x("my neighbour", "meinen Nachbarn", "a los vecinos", "sąsiadom"),
  tourist: x("the friend I'm travelling with", "meiner Reisebegleitung", "a la persona con la que viajo", "osobie, z którą podróżuję"),
  retiree: x("my friend from the choir", "meinen Leuten aus dem Chor", "a la gente del coro", "znajomym z chóru"),
  trades: x("my workmates", "meinen Kollegen auf der Baustelle", "a los compañeros de la obra", "kolegom z budowy"),
};

/** Auto-recorded thought for someone not around this round (no model call). */
export const AWAY: Record<SegmentId, Tx> = {
  office_worker: x("I wasn't around: working from home that week.", "War nicht da: Ich war die Woche im Homeoffice.", "No estaba: esa semana teletrabajaba desde casa.", "Nie było mnie: w tym tygodniu {g:pracowałem|pracowałam} z domu."),
  freelancer: x("I wasn't around: deadline week, working from home.", "War nicht da: Deadline-Woche, ich habe zu Hause gearbeitet.", "No estaba: semana de entregas, trabajando desde casa.", "Nie było mnie: tydzień terminów, praca z domu."),
  student: x("I wasn't around: exams, at uni all day.", "War nicht da: Prüfungen, den ganzen Tag an der Uni.", "No estaba: exámenes, todo el día en la uni.", "Nie było mnie: sesja, cały dzień na uczelni."),
  parent: x("I wasn't around: a sick child at home.", "War nicht da: Kind krank zu Hause.", "No estaba: con un niño enfermo en casa.", "Nie było mnie: chore dziecko w domu."),
  regular: x("I wasn't around: away for a few days.", "War nicht da: ein paar Tage weg.", "No estaba: fuera unos días.", "Nie było mnie: kilka dni poza Berlinem."),
  tourist: x("I wasn't around: exploring another part of the city.", "War nicht da: Ich war in einem anderen Teil der Stadt unterwegs.", "No estaba: explorando otra parte de la ciudad.", "Nie było mnie: zwiedzanie innej części miasta."),
  retiree: x("I wasn't around: visiting family.", "War nicht da: Ich war bei der Familie.", "No estaba: de visita en casa de la familia.", "Nie było mnie: odwiedziny u rodziny."),
  trades: x("I wasn't around: on a job across town.", "War nicht da: Ich hatte einen Auftrag am anderen Ende der Stadt.", "No estaba: con un trabajo en la otra punta de la ciudad.", "Nie było mnie: zlecenie na drugim końcu miasta."),
};

/** Questions an imagined customer might want answered, by template and segment. */
export const QUESTIONS: Record<TemplateId, { general: Tx[]; bySegment: Record<SegmentId, Tx[]> }> = {
  lunch_offer: {
    general: [
      x("Is there a vegetarian option every day?", "Gibt es jeden Tag eine vegetarische Option?", "¿Hay opción vegetariana todos los días?", "Czy codziennie jest opcja wegetariańska?"),
      x("Can I swap the drink for a coffee?", "Kann ich das Getränk gegen einen Kaffee tauschen?", "¿Puedo cambiar la bebida por un café?", "Czy mogę zamienić napój na kawę?"),
      x("Will the deal still be on after this month?", "Gibt es das Angebot nach diesem Monat noch?", "¿Seguirá el menú después de este mes?", "Czy zestaw będzie też po tym miesiącu?"),
    ],
    bySegment: {
      office_worker: [
        x("Can I order the deal ahead and pick it up at 12:30?", "Kann ich das Angebot vorbestellen und um 12:30 Uhr abholen?", "¿Puedo encargar el menú y recogerlo a las 12:30?", "Czy mogę zamówić zestaw wcześniej i odebrać o 12:30?"),
        x("Can we order five deals at once for a team lunch?", "Können wir fünf Angebote auf einmal fürs Team bestellen?", "¿Podemos pedir cinco menús a la vez para una comida de equipo?", "Czy możemy zamówić pięć zestawów naraz na lunch zespołu?"),
      ],
      freelancer: [
        x("Can I have the deal and keep my table for the afternoon?", "Kann ich das Angebot nehmen und den Tisch für den Nachmittag behalten?", "¿Puedo pedir el menú y quedarme la mesa toda la tarde?", "Czy mogę wziąć zestaw i zostać przy stoliku całe popołudnie?"),
        x("Is there a vegan option in the deal?", "Gibt es eine vegane Option im Angebot?", "¿Hay opción vegana en el menú?", "Czy w zestawie jest opcja wegańska?"),
      ],
      student: [
        x("Is there a student price for the deal?", "Gibt es einen Studipreis fürs Angebot?", "¿Hay precio de estudiante para el menú?", "Czy jest cena studencka na zestaw?"),
        x("Can I skip the drink and pay less?", "Kann ich das Getränk weglassen und weniger zahlen?", "¿Puedo quitar la bebida y pagar menos?", "Czy mogę zrezygnować z napoju i zapłacić mniej?"),
      ],
      parent: [
        x("Is there a smaller portion for children?", "Gibt es eine kleinere Portion für Kinder?", "¿Hay una ración más pequeña para niños?", "Czy jest mniejsza porcja dla dzieci?"),
        x("What's in the soup? Any nuts?", "Was ist in der Suppe? Nüsse?", "¿Qué lleva la sopa? ¿Frutos secos?", "Co jest w zupie? Orzechy?"),
      ],
      regular: [
        x("Will my usual stay on the menu?", "Bleibt mein Übliches auf der Karte?", "¿Seguirá lo mío en la carta?", "Czy moje zwykłe danie zostanie w menu?"),
        x("Does the soup change every day?", "Wechselt die Suppe jeden Tag?", "¿Cambia la sopa cada día?", "Czy zupa zmienia się codziennie?"),
      ],
      tourist: [
        x("Is there a menu in English?", "Gibt es eine Karte auf Englisch?", "¿Hay carta en inglés?", "Czy jest menu po angielsku?"),
        x("Which soup is it today?", "Welche Suppe gibt es heute?", "¿Qué sopa hay hoy?", "Jaka jest dziś zupa?"),
      ],
      retiree: [
        x("Is the soup the same size as before?", "Ist die Suppe so groß wie vorher?", "¿La sopa es igual de grande que antes?", "Czy zupa jest tak samo duża jak wcześniej?"),
        x("Will the deal still be on next month?", "Gibt es das Angebot nächsten Monat noch?", "¿Seguirá el menú el mes que viene?", "Czy zestaw będzie też w przyszłym miesiącu?"),
      ],
      trades: [
        x("Can I get the deal to take away?", "Kann ich das Angebot zum Mitnehmen bekommen?", "¿Puedo pedir el menú para llevar?", "Czy mogę wziąć zestaw na wynos?"),
        x("Can I get a bigger sandwich for a bit more?", "Kann ich gegen Aufpreis ein größeres Sandwich bekommen?", "¿Puedo pedir un bocadillo más grande pagando un poco más?", "Czy mogę dostać większą kanapkę za dopłatą?"),
      ],
    },
  },
  price_change: {
    general: [
      x("Why did the price go up?", "Warum ist der Preis gestiegen?", "¿Por qué ha subido el precio?", "Dlaczego cena poszła w górę?"),
      x("Did the large size go up too?", "Ist die große Größe auch teurer geworden?", "¿También ha subido el tamaño grande?", "Czy duży rozmiar też podrożał?"),
      x("Is the coffee the same as before?", "Ist der Kaffee noch derselbe wie vorher?", "¿El café es el mismo que antes?", "Czy kawa jest taka sama jak wcześniej?"),
    ],
    bySegment: {
      office_worker: [x("Is there a discount if we order for the office?", "Gibt es Rabatt, wenn wir fürs Büro bestellen?", "¿Hay descuento si pedimos para la oficina?", "Czy jest zniżka, jeśli zamawiamy dla całego biura?")],
      freelancer: [x("Is the oat milk extra on top of the new price?", "Kostet Hafermilch zusätzlich zum neuen Preis?", "¿La leche de avena se cobra aparte del precio nuevo?", "Czy mleko owsiane jest płatne dodatkowo do nowej ceny?")],
      student: [x("Is there a student price?", "Gibt es einen Studipreis?", "¿Hay precio de estudiante?", "Czy jest cena studencka?")],
      parent: [x("Did the children's drinks go up too?", "Sind die Kindergetränke auch teurer geworden?", "¿También han subido las bebidas para niños?", "Czy napoje dla dzieci też podrożały?")],
      regular: [
        x("Do regulars get anything, like a stamp card?", "Bekommen Stammgäste etwas, zum Beispiel eine Stempelkarte?", "¿Los habituales tienen algo, como una tarjeta de sellos?", "Czy stali goście coś dostają, na przykład kartę z pieczątkami?"),
        x("Will it go up again soon?", "Wird es bald wieder teurer?", "¿Volverá a subir pronto?", "Czy wkrótce znowu podrożeje?"),
      ],
      tourist: [x("Is that the price for a small or a large?", "Ist das der Preis für klein oder groß?", "¿Ese es el precio del pequeño o del grande?", "Czy to cena za mały, czy za duży?")],
      retiree: [x("Will it go up again this year?", "Wird es dieses Jahr noch mal teurer?", "¿Subirá otra vez este año?", "Czy w tym roku znowu podrożeje?")],
      trades: [x("Is it cheaper if I bring my own cup?", "Ist es billiger, wenn ich meinen eigenen Becher mitbringe?", "¿Es más barato si traigo mi propio vaso?", "Czy jest taniej, jeśli przyniosę własny kubek?")],
    },
  },
};

// ---------------------------------------------------------------- summary

export const FUNNEL: Record<TemplateId, Tx[]> = {
  lunch_offer: [
    x("Noticed it", "Haben es bemerkt", "Se fijaron", "Zauważyli"),
    x("Tried it", "Haben es probiert", "Lo probaron", "Spróbowali"),
    x("Came back", "Sind wiedergekommen", "Volvieron", "Wrócili"),
    x("Told someone", "Haben davon erzählt", "Se lo contaron a alguien", "Komuś powiedzieli"),
  ],
  price_change: [
    x("Noticed the new price", "Haben den neuen Preis bemerkt", "Notaron el precio nuevo", "Zauważyli nową cenę"),
    x("Kept buying as before", "Kaufen weiter wie bisher", "Siguen comprando como antes", "Kupują jak dawniej"),
    x("Bought less or went elsewhere", "Kaufen weniger oder gehen woanders hin", "Compran menos o van a otro sitio", "Kupują mniej lub chodzą gdzie indziej"),
    x("Said something about it", "Haben etwas dazu gesagt", "Dijeron algo al respecto", "Coś o tym powiedzieli"),
  ],
};

export const UPTAKE_LABEL: Record<TemplateId, Tx> = {
  lunch_offer: x("Noticed or used the deal", "Angebot bemerkt oder genutzt", "Se fijaron en el menú o lo usaron", "Zauważyli lub wybrali zestaw"),
  price_change: x("Still buying at the new price", "Kaufen weiter zum neuen Preis", "Siguen comprando al precio nuevo", "Dalej kupują po nowej cenie"),
};

/** The caveat follows who actually played the customers. */
export const CAVEATS: Record<"rule-based" | "ai" | "mixed", Tx> = {
  "rule-based": x(
    "These imagined customers followed simple fixed rules built from short descriptions; no AI played them. They show reactions worth checking, not what will happen. Nothing here is counted in the money maths.",
    "Diese ausgedachten Gäste folgen einfachen, festen Regeln, gebaut aus kurzen Beschreibungen; keine KI hat sie gespielt. Sie zeigen Reaktionen, die eine Nachfrage wert sind, nicht, was passieren wird. Nichts davon fließt in die Rechnung ein.",
    "Estos clientes imaginarios siguen reglas sencillas y fijas, hechas a partir de descripciones breves; ninguna IA los ha interpretado. Muestran reacciones que vale la pena comprobar, no lo que va a pasar. Nada de esto entra en las cuentas.",
    "Ci wymyśleni klienci działają według prostych, stałych reguł opartych na krótkich opisach; nie odgrywała ich żadna AI. Pokazują reakcje warte sprawdzenia, a nie to, co się wydarzy. Nic z tego nie trafia do wyliczeń.",
  ),
  ai: x(
    "These are imagined customers, each played by an AI from a short description. They show reactions worth checking, not what will happen. Nothing here is counted in the money maths.",
    "Das sind ausgedachte Gäste, jeweils von einer KI aus einer kurzen Beschreibung gespielt. Sie zeigen Reaktionen, die eine Nachfrage wert sind, nicht, was passieren wird. Nichts davon fließt in die Rechnung ein.",
    "Son clientes imaginarios, cada uno interpretado por una IA a partir de una descripción breve. Muestran reacciones que vale la pena comprobar, no lo que va a pasar. Nada de esto entra en las cuentas.",
    "To wymyśleni klienci, każdego odegrała AI na podstawie krótkiego opisu. Pokazują reakcje warte sprawdzenia, a nie to, co się wydarzy. Nic z tego nie trafia do wyliczeń.",
  ),
  mixed: x(
    "These imagined customers were played partly by an AI and partly by simple fixed rules, from short descriptions. They show reactions worth checking, not what will happen. Nothing here is counted in the money maths.",
    "Diese ausgedachten Gäste wurden teils von einer KI, teils nach einfachen, festen Regeln gespielt, jeweils aus kurzen Beschreibungen. Sie zeigen Reaktionen, die eine Nachfrage wert sind, nicht, was passieren wird. Nichts davon fließt in die Rechnung ein.",
    "Estos clientes imaginarios los han interpretado en parte una IA y en parte reglas sencillas y fijas, a partir de descripciones breves. Muestran reacciones que vale la pena comprobar, no lo que va a pasar. Nada de esto entra en las cuentas.",
    "Tych wymyślonych klientów odgrywała częściowo AI, a częściowo proste, stałe reguły, na podstawie krótkich opisów. Pokazują reakcje warte sprawdzenia, a nie to, co się wydarzy. Nic z tego nie trafia do wyliczeń.",
  ),
};

export const MIX_NOTE: { kiez: Tx; berlin: Tx; custom: Tx } = {
  kiez: x("The mix of people is a rough guess for {kiez}, not statistics.", "Die Mischung der Leute ist eine grobe Annahme für {kiez}, keine Statistik.", "La mezcla de personas es una suposición aproximada para {kiez}, no una estadística.", "Skład osób to zgrubne założenie dla dzielnicy {kiez}, a nie statystyka."),
  berlin: x("The mix of people is a rough guess for a neighbourhood café, not statistics.", "Die Mischung der Leute ist eine grobe Annahme für ein Café im Kiez, keine Statistik.", "La mezcla de personas es una suposición aproximada para un café de barrio, no una estadística.", "Skład osób to zgrubne założenie dla osiedlowej kawiarni, a nie statystyka."),
  custom: x("The mix of people follows the mix you gave; it is still a guess, not statistics.", "Die Mischung der Leute folgt Ihrer Vorgabe; sie bleibt eine Annahme, keine Statistik.", "La mezcla de personas sigue la que indicaste; sigue siendo una suposición, no una estadística.", "Skład osób wynika z podanych przez ciebie proporcji; to nadal założenie, a nie statystyka."),
};

/** What to check with real customers. Owner-facing: "Sie" in German, informal in Spanish and Polish. */
export interface ChecksText {
  watchItem(item: string): string;
  askRegularsPrice(price: string, aItem: string, reduced: number, of: number): string;
  staffPriceNotes(n: number): string;
  trackCheaper(item: string, n: number): string;
  checkRivals(aItem: string, n: number): string;
  friendlyAnswer(quoted: string[]): string;
  compareWeekly(item: string): string;
  askRegularsSwitch(tried: number, of: number): string;
  countPassersby(): string;
  askHowHeard(channel: string | undefined): string;
  weekTwo(tried: number, back: number): string;
  checkPlaces(places: string[], n: number): string;
  listen(quoted: string[]): string;
  staffQueue(): string;
  writeDown(): string;
}

const s_ = (n: number) => (n === 1 ? "" : "s");

export const CHECKS: Record<Lang, ChecksText> = {
  en: {
    watchItem: (item) => `Watch the first ten ${item} customers after the change: do they look at the board, say something, or order something else?`,
    askRegularsPrice: (price, aItem, reduced, of) =>
      `Ask three regulars directly whether ${price} for ${aItem} changes how often they come.${of ? ` ${reduced} of ${of} imagined regulars bought less.` : ""}`,
    staffPriceNotes: (n) => `Ask staff to jot down any comments about the price in the first week: ${n} imagined customer${s_(n)} said something out loud or online.`,
    trackCheaper: (item, n) => `Track sales of cheaper items alongside the ${item}: ${n} imagined customer${s_(n)} switched to something cheaper.`,
    checkRivals: (aItem, n) => `Check what the two nearest cafés charge for ${aItem}: ${n} imagined customer${s_(n)} went elsewhere.`,
    friendlyAnswer: (qs) => `Have a friendly answer ready for questions like ${joinWith(qs, "and")}.`,
    compareWeekly: (item) => `Compare weekly ${item} sales before and after the change, as the test plan says.`,
    askRegularsSwitch: (tried, of) =>
      `Ask five regulars whether they would swap their usual lunch for the deal: that switching is what your sums depend on.${of ? ` ${tried} of ${of} imagined regulars did.` : ""}`,
    countPassersby: () => "Count how many passers-by stop to read the board during one lunch hour: most imagined customers did not take it in.",
    askHowHeard: (ch) => `Ask new lunch customers how they heard about the deal (the board, Instagram, a colleague).${ch ? ` The imagined ones who noticed it mostly hear about things ${ch}.` : ""}`,
    weekTwo: (tried, back) => `In week two, count how many deal customers come back. Of the ${tried} imagined customer${s_(tried)} who tried it, ${back} came back.`,
    checkPlaces: (places, n) =>
      `Check what ${joinWith(places, "and")} ${places.length === 1 ? "charges" : "charge"} for lunch: ${n} imagined customer${s_(n)} ate elsewhere or brought food from home instead.`,
    listen: (qs) => `Listen for the questions real customers ask at the counter. Imagined ones asked ${joinWith(qs, "and")}.`,
    staffQueue: () => "Ask staff to note comments about queues or the rest of the menu at lunchtime: an imagined customer complained.",
    writeDown: () => "Write down deals sold and total lunch customers every day of the test, so you can compare them with the scenarios.",
  },
  de: {
    watchItem: (item) => `Beobachten Sie nach der Änderung die ersten zehn Gäste, die ${item} bestellen: Schauen sie auf die Tafel, sagen sie etwas oder bestellen sie etwas anderes?`,
    askRegularsPrice: (price, aItem, reduced, of) =>
      `Fragen Sie drei Stammgäste direkt, ob ${price} für ${aItem} etwas daran ändert, wie oft sie kommen.${of ? ` Von den ausgedachten Stammgästen haben ${reduced} von ${of} weniger gekauft.` : ""}`,
    staffPriceNotes: (n) => `Bitten Sie Ihr Team, in der ersten Woche Bemerkungen zum Preis zu notieren. Ausgedachte Gäste, die laut oder online etwas gesagt haben: ${n}.`,
    trackCheaper: (item, n) => `Zählen Sie neben ${item} auch die günstigeren Artikel mit. Ausgedachte Gäste, die auf etwas Günstigeres umgestiegen sind: ${n}.`,
    checkRivals: (aItem, n) => `Prüfen Sie, was die zwei nächsten Cafés für ${aItem} verlangen. Ausgedachte Gäste, die woanders hingegangen sind: ${n}.`,
    friendlyAnswer: (qs) => `Halten Sie eine freundliche Antwort bereit auf Fragen wie ${joinWith(qs, "und")}.`,
    compareWeekly: (item) => `Vergleichen Sie die wöchentlichen Verkäufe von ${item} vor und nach der Änderung, wie im Testplan beschrieben.`,
    askRegularsSwitch: (tried, of) =>
      `Fragen Sie fünf Stammgäste, ob sie ihr übliches Mittagessen gegen das Angebot tauschen würden: Von diesem Wechsel hängt Ihre Rechnung ab.${of ? ` Von den ausgedachten Stammgästen haben es ${tried} von ${of} getan.` : ""}`,
    countPassersby: () => "Zählen Sie in einer Mittagsstunde, wie viele Vorbeigehende stehen bleiben und die Tafel lesen: Die meisten ausgedachten Gäste haben sie nicht wahrgenommen.",
    askHowHeard: (ch) => `Fragen Sie neue Mittagsgäste, wie sie vom Angebot erfahren haben (Tafel, Instagram, Kollegen).${ch ? ` Die ausgedachten Gäste, die es bemerkt haben, erfahren Neues meist ${ch}.` : ""}`,
    weekTwo: (tried, back) => `Zählen Sie in der zweiten Woche, wie viele Angebotsgäste wiederkommen. Von den ausgedachten Gästen, die es probiert haben, kamen ${back} von ${tried} wieder.`,
    checkPlaces: (places, n) => `Prüfen Sie die Mittagspreise hier: ${joinWith(places, "und")}. Ausgedachte Gäste, die woanders gegessen oder etwas von zu Hause mitgebracht haben: ${n}.`,
    listen: (qs) => `Achten Sie auf die Fragen echter Gäste an der Theke. Die ausgedachten fragten ${joinWith(qs, "und")}.`,
    staffQueue: () => "Bitten Sie Ihr Team, mittags Bemerkungen zu Schlangen oder zur übrigen Karte zu notieren: Ein ausgedachter Gast hat sich beschwert.",
    writeDown: () => "Notieren Sie an jedem Testtag die verkauften Angebote und alle Mittagsgäste, damit Sie sie mit den Szenarien vergleichen können.",
  },
  es: {
    watchItem: (item) => `Observa a los diez primeros clientes que pidan ${item} después del cambio: ¿miran la pizarra, dicen algo o piden otra cosa?`,
    askRegularsPrice: (price, aItem, reduced, of) =>
      `Pregunta directamente a tres habituales si ${price} por ${aItem} cambia lo a menudo que vienen.${of ? ` Entre los habituales imaginarios, compraron menos ${reduced} de ${of}.` : ""}`,
    staffPriceNotes: (n) => `Pide al personal que apunte los comentarios sobre el precio la primera semana. Clientes imaginarios que dijeron algo en voz alta o en internet: ${n}.`,
    trackCheaper: (item, n) => `Lleva la cuenta de los productos más baratos junto a ${item}. Clientes imaginarios que se pasaron a algo más barato: ${n}.`,
    checkRivals: (aItem, n) => `Comprueba cuánto cobran los dos cafés más cercanos por ${aItem}. Clientes imaginarios que se fueron a otro sitio: ${n}.`,
    friendlyAnswer: (qs) => `Ten preparada una respuesta amable para preguntas como ${joinWith(qs, "y")}.`,
    compareWeekly: (item) => `Compara las ventas semanales de ${item} antes y después del cambio, como dice el plan de prueba.`,
    askRegularsSwitch: (tried, of) =>
      `Pregunta a cinco clientes habituales si cambiarían su comida de siempre por el menú: de ese cambio dependen tus cuentas.${of ? ` Entre los habituales imaginarios, lo hicieron ${tried} de ${of}.` : ""}`,
    countPassersby: () => "Cuenta cuántas personas se paran a leer la pizarra durante una hora de comida: la mayoría de los clientes imaginarios no se fijaron.",
    askHowHeard: (ch) => `Pregunta a los clientes nuevos del mediodía cómo se enteraron del menú (la pizarra, Instagram, un compañero).${ch ? ` Los imaginarios que se fijaron suelen enterarse de las novedades ${ch}.` : ""}`,
    weekTwo: (tried, back) => `En la segunda semana, cuenta cuántos clientes del menú vuelven. De los clientes imaginarios que lo probaron, volvieron ${back} de ${tried}.`,
    checkPlaces: (places, n) => `Comprueba los precios del mediodía en estos sitios: ${joinWith(places, "y")}. Clientes imaginarios que comieron en otro sitio o se trajeron comida de casa: ${n}.`,
    listen: (qs) => `Fíjate en las preguntas que hacen los clientes reales en la barra. Los imaginarios preguntaron ${joinWith(qs, "y")}.`,
    staffQueue: () => "Pide al personal que apunte a mediodía los comentarios sobre colas o el resto de la carta: un cliente imaginario se quejó.",
    writeDown: () => "Apunta cada día de la prueba los menús vendidos y el total de clientes del mediodía, para compararlos con los escenarios.",
  },
  pl: {
    watchItem: (item) => `Obserwuj pierwszych dziesięciu klientów, którzy po zmianie zamówią ${item}: czy patrzą na tablicę, coś mówią albo zamawiają coś innego?`,
    askRegularsPrice: (price, aItem, reduced, of) =>
      `Zapytaj wprost trzech stałych gości, czy ${price} za ${aItem} zmienia to, jak często przychodzą.${of ? ` Wśród wymyślonych stałych gości mniej kupowało: ${reduced} z ${of}.` : ""}`,
    staffPriceNotes: (n) => `Poproś obsługę, żeby w pierwszym tygodniu notowała uwagi o cenie. Wymyśleni klienci, którzy coś powiedzieli na głos lub w sieci: ${n}.`,
    trackCheaper: (item, n) => `Licz sprzedaż tańszych produktów obok: ${item}. Wymyśleni klienci, którzy przerzucili się na coś tańszego: ${n}.`,
    checkRivals: (aItem, n) => `Sprawdź, ile za ${aItem} biorą dwie najbliższe kawiarnie. Wymyśleni klienci, którzy poszli gdzie indziej: ${n}.`,
    friendlyAnswer: (qs) => `Przygotuj życzliwą odpowiedź na pytania w rodzaju ${joinWith(qs, "i")}.`,
    compareWeekly: (item) => `Porównaj tygodniową sprzedaż (${item}) przed zmianą i po niej, tak jak w planie testu.`,
    askRegularsSwitch: (tried, of) =>
      `Zapytaj pięciu stałych gości, czy zamieniliby swój zwykły lunch na zestaw: od tej zamiany zależą twoje wyliczenia.${of ? ` Wśród wymyślonych stałych gości tak zrobiło: ${tried} z ${of}.` : ""}`,
    countPassersby: () => "Policz, ilu przechodniów zatrzymuje się przy tablicy w ciągu jednej godziny lunchu: większość wymyślonych klientów jej nie zauważyła.",
    askHowHeard: (ch) => `Pytaj nowych gości w porze lunchu, skąd wiedzą o zestawie (tablica, Instagram, ktoś z pracy).${ch ? ` Wymyśleni klienci, którzy go zauważyli, dowiadują się o nowościach zwykle ${ch}.` : ""}`,
    weekTwo: (tried, back) => `W drugim tygodniu policz, ilu klientów zestawu wraca. Spośród wymyślonych klientów, którzy go spróbowali, wróciło: ${back} z ${tried}.`,
    checkPlaces: (places, n) => `Sprawdź ceny lunchu w tych miejscach: ${joinWith(places, "i")}. Wymyśleni klienci, którzy jedli gdzie indziej albo przynieśli jedzenie z domu: ${n}.`,
    listen: (qs) => `Zwracaj uwagę na pytania prawdziwych klientów przy ladzie. Wymyśleni pytali: ${joinWith(qs, "i")}.`,
    staffQueue: () => "Poproś obsługę, żeby w porze lunchu notowała uwagi o kolejkach i reszcie menu: jeden wymyślony klient narzekał.",
    writeDown: () => "Zapisuj każdego dnia testu liczbę sprzedanych zestawów i wszystkich gości w porze lunchu, żeby porównać je ze scenariuszami.",
  },
};

/** Short story lines for the landing teaser and the report's "what happened" strip. */
export const BEATS: Record<"noticed" | "tried" | "cameBack" | "kept" | "boughtLess" | "told" | "heardFrom" | "sceptic", Tx> = {
  noticed: x("{name} noticed it", "{name} hat es bemerkt", "{name} se fijó", "{name}: zauważa"),
  kept: x("{name} kept buying", "{name} kauft weiter", "{name} siguió comprando", "{name}: dalej kupuje"),
  boughtLess: x("{name} bought less", "{name} kauft seltener", "{name} compra menos", "{name}: kupuje mniej"),
  tried: x("{name} tried it", "{name} hat es probiert", "{name} lo probó", "{name}: próbuje"),
  cameBack: x("{name} came back", "{name} kam wieder", "{name} volvió", "{name}: wraca"),
  told: x("{name} told someone", "{name} hat davon erzählt", "{name} se lo contó a alguien", "{name}: mówi innym"),
  heardFrom: x("{to} heard it from {from}", "{to} hat es von {from} gehört", "{to} se enteró por {from}", "{to} wie o tym od: {from}"),
  sceptic: x("{name} stayed sceptical", "{name} blieb skeptisch", "{name} siguió con dudas", "{name}: nadal sceptycznie"),
};
