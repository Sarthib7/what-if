# The Berlin beta: facts, Kiez, events, languages

What-IF's closed beta is for **independent cafés in Berlin**, in **German (default), English, Spanish and Polish**. This page holds the only public facts you may use, how to ask for the Berlin-specific numbers, the Kiez list, the rehearsal events, and the words to use in each language.

## The public facts (the only ones you may use)

Checked on 17 Oct 2026. The tools carry the same facts and show them in the report's "Berlin facts used" card. If the tool's card shows a different value, source or date, **the tool wins**.

| Fact | Value | Since | Source |
|---|---|---|---|
| VAT on food in cafés and restaurants (eat-in and take-away) | **7%** | 1 Jan 2026 | § 12 (2) Nr. 15 UStG, added by the Steueränderungsgesetz 2025 (Bundestag 4 Dec 2025, Bundesrat 19 Dec 2025, promulgated 23 Dec 2025): https://www.gesetze-im-internet.de/ustg_1980/__12.html |
| VAT on drinks | **19%** (unchanged) | — | the same § 12 (2) Nr. 15 UStG excludes drinks |
| Milk drinks with at least 75% milk | **7%** | — | § 12 (2) Nr. 1 UStG with Anlage 2 |
| Combined offers (a menu or buffet with a drink) | a flat **30%** of the price may be treated as the drinks share | 1 Jan 2026 | BMF letter of 22 Dec 2025 (III C 2 – S 7220/00023/014/027), UStAE 10.1 (12) |
| Statutory minimum wage | **€13.90** gross an hour | 1 Jan 2026 | Fünfte Mindestlohnanpassungsverordnung of 5 Nov 2025, after the Mindestlohnkommission's decision of 27 Jun 2025: https://www.bundesregierung.de/breg-de/aktuelles/mindestlohn-steigt-2391010 |
| Statutory minimum wage, next step | **€14.60** gross an hour | 1 Jan 2027 | same ordinance |

Never add a fact that is not in this table or in the tool's facts card: no rents, footfall, Kiez demographics, tourist numbers, average café prices, "Berlin cafés usually…". What the owner tells you about their street is *their number*.

## Asking the Berlin numbers

**Prices are what customers pay.** The owner gives the price on the board or the menu, which includes VAT. Don't ask them to work out net prices; the tool does that (`net = gross ÷ (1 + VAT)`).

- **`vat_rate`** (optional) is the VAT inside the prices, as a share. Ask it only if the owner knows their split, or if the default looks wrong for them:
  - lunch offer: fallback **10.6%**, a blend of 70% food at 7% and 30% drinks at 19% (the BMF's 30% drinks share). For a deal with no drink, 7% fits better (`0.07`).
  - price change: fallback **19%** for coffee drinks; **7%** for cake and other food; a milk drink with at least 75% milk may be 7%.
  - Tagged as a guess, with "ask your Steuerberater for your real split". Never decide someone's VAT rate for them.
- **Staff cost** is `extra_staff_hours_per_day` (a choice, default 0) × `staff_hourly_cost` (a fact, fallback **€13.90**, the minimum wage). Ask hours first ("Wie viele Stunden mehr pro Tag bräuchten Sie?"), then the cost of one hour all in. If they don't know: use €13.90, tag it as a guess, and say "your real cost per hour is higher once employer contributions are added; check your payroll". Don't explain mini-job or social-security rules.
- **The 2027 rise** (€13.90 → €14.60 on 1 Jan 2027) is a dated fact. It is a natural reason to rehearse a price change ("Was wäre, wenn ich meine Preise anpasse?"), and it is **never a recommendation** to raise prices. For payroll: "fragen Sie Ihre Steuerberaterin oder Ihren Steuerberater".

## The Kiez

Ask once, early and optional: **"In welchem Kiez liegt Ihr Café?"** Why it matters: the imagined customers in the rehearsal get names, alternatives and habits that fit the area. Pass it in `inputs` as `kiez`, one of:

Neukölln · Kreuzberg · Friedrichshain · Prenzlauer Berg · Mitte · Wedding · Moabit · Schöneberg · Charlottenburg · Friedenau · Pankow · Lichtenberg · Treptow · Tempelhof · Steglitz · Köpenick · Spandau · Weißensee · `other`

The rehearsal uses the Kiez for a **rough, labelled persona mix**, names, alternatives (Bäckerei, Späti, Döner, Kantine, Mensa…), channels (Instagram, Google Maps, nebenan.de, the Kiez WhatsApp group, the board outside) and scene details. It is never a statistic; never say "in Neukölln most people…".

## Berlin events for the rehearsal

Offer one or two between rounds, as **"what if" shocks to rehearse**, never as facts or forecasts. `whatif_start` lists them with ids and translated texts; use the tool's wording in the owner's language and pass it as `event` to `whatif_rehearsal_event`. The owner's own events are just as welcome.

| Event | German |
|---|---|
| A BVG strike day | Ein BVG-Streiktag |
| A week of rain | Eine Woche Regen |
| A heatwave (32 °C) | Eine Hitzewelle (32 °C) |
| A Baustelle outside, pavement half closed | Eine Baustelle vor der Tür, der Gehweg halb gesperrt |
| Berlin school holidays | Berliner Schulferien |
| A new café opens two doors down with an €8.50 lunch | Zwei Türen weiter eröffnet ein Café mit Mittagstisch für 8,50 € |
| A big Kiez street festival weekend | Ein großes Straßenfest-Wochenende im Kiez |
| The Christmas market opens nearby | Der Weihnachtsmarkt in der Nähe öffnet |

Offer it like this: "Wollen Sie den ausgedachten Gästen etwas zumuten? Zum Beispiel einen BVG-Streiktag oder eine Woche Regen."

## Words in four languages

Use the report's own labels when you can see them; these are the defaults.

| | Deutsch | English | Español | Polski |
|---|---|---|---|---|
| your number | Ihre Zahl | your number | su dato | Twoja liczba |
| a guess | eine Schätzung | a guess | una estimación | szacunek |
| calculated | berechnet | calculated | calculado | obliczone |
| imagined | ausgedacht | imagined | imaginado | wymyślone |
| demo data | Demodaten | demo data | datos de ejemplo | dane przykładowe |
| break-even | Gewinnschwelle ("ab hier lohnt es sich") | break-even | punto de equilibrio | próg opłacalności |
| worst case | der schlimmste Fall | worst case | el peor caso | najgorszy scenariusz |
| biggest uncertainty | die größte Unsicherheit | biggest uncertainty | la mayor incertidumbre | największa niepewność |
| keep / tweak / stop | behalten / anpassen / stoppen | keep / tweak / stop | mantener / ajustar / parar | zostawić / poprawić / zakończyć |
| VAT | Mehrwertsteuer (MwSt.) | VAT | IVA (en Alemania, Mehrwertsteuer) | VAT (w Niemczech Mehrwertsteuer) |
| till report | Z-Bon, Tagesabschluss | till report (Z-Bon) | cierre de caja (Z-Bon) | raport dobowy z kasy (Z-Bon) |

One-liners:

- Not advice: "Das ist ein Denkwerkzeug, keine Finanz-, Steuer- oder Rechtsberatung." · "This is a thinking tool, not financial, tax or legal advice." · "Es una herramienta para pensar, no asesoramiento financiero, fiscal ni legal." · "To narzędzie do myślenia, a nie porada finansowa, podatkowa ani prawna."
- Imagined customers: "Das sind ausgedachte Gäste, keine Daten." · "These are imagined customers, not data." · "Son clientes imaginados, no datos." · "To wymyśleni klienci, a nie dane."
- The read-back: "1.500 €, richtig?" · "€1,500, right?" · "1500 €, ¿correcto?" · "1500 €, zgadza się?"

## Number formats

| | 1500 | 16500 | 9.9 | 0.3 |
|---|---|---|---|---|
| de | 1.500 € | 16.500 € | 9,90 € | 30 % |
| en | €1,500 | €16,500 | €9.90 | 30% |
| es | 1500 € | 16.500 € | 9,90 € | 30 % |
| pl | 1500 € | 16 500 € | 9,90 € | 30% |

Read numbers back in the owner's format; pass plain numbers to the tools (see "Numbers" in `coaching.md`).
