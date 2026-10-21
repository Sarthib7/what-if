import type { Lang } from "./index.ts";

/**
 * The words What-IF uses for its core ideas, the same on every surface:
 * landing page, /try, the report, the MCP's sentences and the skill.
 * The owner should hear one word in the chat and see the same word on the page.
 *
 * Source labels must match the engine's sourceLabel() (src/engine/messages*.ts).
 */
export type Term =
  | "breakEven"
  | "payBackTest"
  | "paysItsWay"
  | "worstCase"
  | "yourNumber"
  | "guess"
  | "calculated"
  | "imagined"
  | "demoData"
  | "rehearsal"
  | "imaginedCustomers"
  | "testCard"
  | "keep"
  | "tweak"
  | "stop";

export const TERMS: Record<Lang, Record<Term, string>> = {
  en: {
    breakEven: "break-even",
    payBackTest: "pays back the test",
    paysItsWay: "pays its way",
    worstCase: "worst case",
    yourNumber: "Your number",
    guess: "A guess",
    calculated: "Calculated",
    imagined: "Imagined",
    demoData: "Demo data",
    rehearsal: "rehearsal",
    imaginedCustomers: "imagined customers",
    testCard: "test card",
    keep: "keep",
    tweak: "tweak",
    stop: "stop",
  },
  de: {
    breakEven: "Gewinnschwelle",
    payBackTest: "holt den Test herein",
    paysItsWay: "trägt sich",
    worstCase: "schlimmster Fall",
    yourNumber: "Ihre Zahl",
    guess: "Eine Schätzung",
    calculated: "Berechnet",
    imagined: "Ausgedacht",
    demoData: "Demo-Daten",
    rehearsal: "Probelauf",
    imaginedCustomers: "ausgedachte Gäste",
    testCard: "Testkarte",
    keep: "behalten",
    tweak: "anpassen",
    stop: "aufhören",
  },
  es: {
    breakEven: "punto de equilibrio",
    payBackTest: "recupera la prueba",
    paysItsWay: "se paga solo",
    worstCase: "peor caso",
    yourNumber: "Tu número",
    guess: "Una estimación",
    calculated: "Calculado",
    imagined: "Imaginado",
    demoData: "Datos de demostración",
    rehearsal: "ensayo",
    imaginedCustomers: "clientes imaginados",
    testCard: "tarjeta de prueba",
    keep: "mantener",
    tweak: "ajustar",
    stop: "parar",
  },
  pl: {
    breakEven: "próg rentowności",
    payBackTest: "zwraca koszt testu",
    paysItsWay: "zarabia na siebie",
    worstCase: "najgorszy przypadek",
    yourNumber: "Twoja liczba",
    guess: "Szacunek",
    calculated: "Wyliczone",
    imagined: "Wyobrażone",
    demoData: "Dane demonstracyjne",
    rehearsal: "próba",
    imaginedCustomers: "wyobrażeni klienci",
    testCard: "karta testu",
    keep: "zostaw",
    tweak: "dopasuj",
    stop: "zakończ",
  },
};

export function term(t: Term, lang: Lang): string {
  return TERMS[lang][t];
}
