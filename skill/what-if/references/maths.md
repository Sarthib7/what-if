# What-IF maths, written out

This is every formula the What-IF engine uses for its two templates, with the demo café worked through by hand, plus everything you need to **work by hand** when the tools are not connected.

Use it to:

- **check** a tool result, or explain "show the maths" in more detail;
- **work by hand** when the What-IF MCP tools are not connected, or for a "not yet" decision (hiring, opening hours).

When the tools are connected, **the tools do the maths**: quote their figures, not yours. **If a figure here differs from the tool's, the tool's number wins** (rounding, or a newer engine); say so if the owner notices.

Rounding, as the engine does it: every building block (a net price, a margin, a daily cost) is rounded to the cent before it is used again, and the number of switchers to one decimal, so each step can be redone by hand from the figures it shows.

Public facts used below (VAT, minimum wage) are listed with sources and dates in `berlin.md`.

## Working by hand (no MCP)

1. **Ask one question at a time**, in the order of the tables below, with the "why" in one sentence and a way out ("a rough number is fine"; "not sure? I'll use … and mark it as a guess"). Turn each answer into a plain number and read it back in the owner's format (see `coaching.md`).
2. **Write each formula out** with the owner's numbers, one line per step. No mental shortcuts. If your host has a code or calculator tool, use it for the arithmetic and show the inputs.
3. **Label every figure**: your number, a guess, calculated by hand, public fact (VAT, minimum wage).
4. **Round** money to cents only at the end. Customers a day for break-even are always rounded **up** (you cannot serve 0.9 of a customer).
5. **End with a test**: the keep / tweak / stop rule and the cash stop line in "Planning the test by hand" below. They are the same rule the tools print on the test card, so a by-hand session and a tool session give the same card.
6. **No rehearsal counts by hand.** The imagined-customer rehearsal needs the tools. Without them, offer at most a short role-play of two or three imagined customers, each labelled *imagined*, with no counts ("3 of 6 …"), nothing scaled up and nothing fed into the maths.
7. Say once: "These were calculated by hand with What-IF's formulas. Connect What-IF ({{SITE_URL}}/connect) for the checked version and the visual report." No AI app with connectors? {{SITE_URL}}/try builds the same report in the browser.

### The questions: lunch offer

| Key | Ask | Why it matters | If they don't know |
|---|---|---|---|
| `weekday_customers` | Roughly how many customers do you serve on a normal weekday, across the whole day? | It sets the size of your business today. | ask for a rough number |
| `avg_spend` | What does a customer spend on average per visit? The till's daily report (Z-Bon) shows it. | With the customers it gives your normal weekday takings. | ask for a rough number |
| `variable_cost_share` | Of every euro a customer pays, roughly how much goes on ingredients and packaging? | Takings are not profit; this turns money in into what's left. | 0.30, a guess |
| `monthly_fixed_costs` | Roughly what are your monthly fixed costs: rent, wages, energy, insurance? | It puts the result in proportion. | leave it out |
| `lunch_customers` | How many customers come in at lunchtime (about 11:30–14:30) on a normal weekday? | Some would buy lunch anyway; if they switch to a cheaper deal, you earn less from them. | ask for a rough count |
| `lunch_spend` | What does a lunchtime customer usually spend today, without a deal? | The gap to the deal is what each switching regular costs you. | `avg_spend`, a guess |
| `cash_buffer` | How much cash could you put into a small test without it keeping you up at night? | It answers "can I afford to be wrong?" first. | leave it out |
| `offer_price` | What would the lunch deal cost the customer (the price on the board), and what is in it? | The price without VAT, minus ingredients, is what each deal earns you. | required |
| `offer_cost` | What do the ingredients and packaging for one deal cost you? | If this is close to the price, extra customers barely help. | required |
| `vat_rate` | Do you know how much VAT is in your lunch prices? | VAT goes to the tax office; only the rest is yours. | 0.106, a guess (70% food at 7%, 30% drinks at 19%; ask your Steuerberater) |
| `setup_cost` | Any one-off costs to start: a sign, flyers, reprinting the menu? | The test has to earn this back. | 0 |
| `extra_staff_hours_per_day` | Would you need extra staff hours at lunch? How many hours a day? | Another pair of hands costs every day, busy or not. | 0 |
| `staff_hourly_cost` | What does one staff hour cost you, all in? | Hours × cost per hour is the daily staff cost. | €13.90 (the minimum wage since 1 Jan 2026), a guess: the real cost is higher with employer contributions |
| `marketing_per_week` | Will you spend anything each week to promote it, such as a paid Instagram post? | Promotion is part of the cost of the test. | 0 |
| `test_days` | How many weekdays would you try it for? | Long enough to see past one good or bad day, short enough to stop cheaply. | 10 |
| `extra_likely` | How many new lunch customers a day do you think the deal could bring in? | The guess everything depends on; the test checks it. | ask: "3? 8? 15?" |
| `extra_low` | If it went slowly, how many extra a day? | A range is more honest than one number. | round down (0.4 × `extra_likely`) |
| `extra_high` | And if it went really well? | Shows the upside. | the larger of `extra_likely` + 1 and round up (1.8 × `extra_likely`) |
| `switch_share` | Of the people who already buy lunch from you, how many would switch to the cheaper deal? | Regulars on the deal earn you less than their usual lunch. | 0.30, a guess |
| `kiez` | Which Kiez is your café in? | Only for the rehearsal's imagined customers; never in the maths. | leave it out |

### The questions: price change

| Key | Ask | Why it matters | If they don't know |
|---|---|---|---|
| `item` | Which item are you thinking of repricing? | One item at a time keeps the effect visible. | required |
| `current_price` | What does it cost today (on the board)? | The starting point. | required |
| `new_price` | What new price are you considering? | The change you want to rehearse. | required |
| `units_per_week` | Roughly how many do you sell in a week? The till's item report shows it. | The effect of a few cents depends on how many you sell. | ask for a rough number |
| `unit_cost` | What do the ingredients and cup cost per item? | The rise goes straight to what each sale earns. | required |
| `vat_rate` | Is it a drink (19%) or food (7%)? | Only the price without VAT is yours. | 0.19, a guess: every drink drunk in the café is 19%. 0.07 for cake and other food, and only for a milk drink with at least 75% milk sold **take-away** |
| `volume_likely` | What do you think would really happen to sales? | The guess the test checks. | ask: "−2%? −5%? −10%?" |
| `volume_low` | If customers really disliked it, how much would sales drop? | A range keeps the guess honest. | `volume_likely` − 0.08 (not below −100%) |
| `volume_high` | And if nobody minded at all? | Shows the best case. | `volume_likely` + 0.04 (not above +5%) |
| `test_days` | How many days would you try the new price before deciding? | Long enough for regulars to react. | 14 |
| `minimum_wage_hours_per_week` | How many staff hours a week do you pay at the minimum wage? | The minimum wage goes from €13.90 to €14.60 on 1 Jan 2027; this puts that step next to the new price. | leave it out |

**Sanity checks** (stop and ask if one fails): the deal's ingredients must cost less than its price without VAT; cautious ≤ likely ≤ optimistic; lunch customers cannot exceed customers for the whole day; for a price change, the new price must differ from the old one and, without VAT, be above the item's cost.

---

## Template 1: weekday lunch offer

### The numbers (demo café)

Café Lindenblatt is a made-up café in Berlin-Neukölln. Always label its figures **demo data**.

| Key | Meaning | Kind | Demo |
|---|---|---|---|
| `weekday_customers` | customers on an average weekday, whole day | fact | 140 |
| `avg_spend` | average spend per customer, incl. VAT | fact | €7.40 |
| `variable_cost_share` | share of the price customers pay that goes on ingredients and packaging | fact | 0.32 |
| `monthly_fixed_costs` | rent, wages, energy, insurance per month | fact | €16,500 |
| `lunch_customers` | lunch customers per weekday now (11:30–14:30) | fact | 38 |
| `lunch_spend` | what a lunch customer spends now, incl. VAT | fact | €11.20 |
| `cash_buffer` | cash they could spend on a test without worry | fact | €1,500 |
| `offer_price` | price of the lunch deal on the board, incl. VAT | choice | €9.90 |
| `offer_cost` | ingredients and packaging per deal | fact | €3.60 |
| `vat_rate` | VAT in the lunch prices, blended | fact | 0.106 (the fallback) |
| `setup_cost` | one-off costs: sign, flyers, menu print | choice | €180 |
| `extra_staff_hours_per_day` | extra staff hours per weekday | choice | 1 |
| `staff_hourly_cost` | what one staff hour costs, all in | fact | €18.00 |
| `marketing_per_week` | promotion budget per week | choice | €25 |
| `test_days` | length of the test, in weekdays | choice | 10 |
| `extra_low` / `extra_likely` / `extra_high` | extra lunch customers a day: cautious / likely / optimistic | guess | 3 / 8 / 15 |
| `switch_share` | share of today's lunch customers who switch to the deal | guess | 0.30 |
| `kiez` | the café's Kiez (rehearsal only) | choice | Neukölln |

### The formulas

```
net(price)    = price / (1 + vat_rate)                                      the part of a price that is yours
m_offer       = offer_price / (1 + vat_rate) − offer_cost                   what each deal earns
m_lunch_now   = lunch_spend / (1 + vat_rate) − lunch_spend × variable_cost_share   what a lunch earns today
switchers     = lunch_customers × switch_share                              regulars who switch to the deal
switch_loss   = switchers × (m_lunch_now − m_offer)                         what switching costs per day
daily_cost    = extra_staff_hours_per_day × staff_hourly_cost + marketing_per_week / 5
net_day(x)    = x · m_offer − switch_loss − daily_cost                      x = extra lunch customers a day
net_test(x)   = net_day(x) · test_days − setup_cost                         result over the whole test
net_month(x)  = net_day(x) · 21.7                                           ongoing, per month (21.7 weekdays)
break_even    = ceil( (switch_loss + daily_cost + setup_cost / test_days) / m_offer )   pays back the test
break_even_ongoing = ceil( (switch_loss + daily_cost) / m_offer )                      pays its way from now on
worst_case    = net_test(0)                                                 nobody new comes
```

`variable_cost_share` stays a share of the price customers pay, so it is applied to the price incl. VAT. The three scenarios use x = `extra_low` (cautious), `extra_likely` (expected) and `extra_high` (optimistic).

In words:

- VAT is not yours: of every price, only `price ÷ (1 + VAT)` stays in the café.
- Every **new** customer who buys the deal adds `m_offer`.
- Every **regular** who switches from their usual lunch to the cheaper deal takes away the gap `m_lunch_now − m_offer`.
- Extra staff hours and promotion cost the same every day, busy or not.
- The one-off setup cost has to be earned back during the test.
- **Break-even** is the number of extra customers a day at which the test pays for itself. From **break_even_ongoing** a day the deal pays its way going forward; the setup is spent either way.
- **Worst case** is what the test costs if no new customers come, **with switching as guessed**. If more regulars switch, it costs more; say what it rests on.

### Worked example: the demo café

**What each deal earns**
m_offer = €9.90 ÷ 1.106 − €3.60 = €8.951 − €3.60 = 5.351 → **€5.35** (the deal price without VAT is €8.95)

**What a lunch earns today**
m_lunch_now = €11.20 ÷ 1.106 − €11.20 × 0.32 = €10.127 − €3.584 = 6.543 → **€6.54**

**Regulars who switch**
switchers = 38 × 0.30 = **11.4 a day**

**What switching costs**
switch_loss = 11.4 × (€6.54 − €5.35) = 11.4 × €1.19 = **€13.57 a day**

**Fixed daily costs of the offer**
daily_cost = 1 hour × €18.00 + €25 ÷ 5 = €18 + €5 = **€23.00 a day**

So before any new customer arrives, the offer costs €13.57 + €23.00 = **€36.57 a day**.

**Break-even**
(€13.57 + €23.00 + €180 ÷ 10) ÷ €5.35 = €54.57 ÷ €5.35 = 10.2 → rounded up: **11 extra lunch customers a day**
Going forward (setup already spent): €36.57 ÷ €5.35 = 6.84 → **7 a day**

**The three scenarios**

| Scenario | Extra customers a day (a guess) | net_day | Over the 10-day test | Per month, ongoing |
|---|---|---|---|---|
| Cautious | 3 | 3 × €5.35 − €36.57 = −€20.52 | −€20.52 × 10 − €180 = **−€385** | −€20.52 × 21.7 = **−€445** |
| Expected | 8 | 8 × €5.35 − €36.57 = €6.23 | €6.23 × 10 − €180 = **−€118** | €6.23 × 21.7 = **€135** |
| Optimistic | 15 | 15 × €5.35 − €36.57 = €43.68 | €43.68 × 10 − €180 = **€257** | €43.68 × 21.7 = **€948** |

(To the cent: −385.20, −445.28; −117.70, 135.19; 256.80, 947.86. Totals from €100 up are shown in whole euros.)

**Worst case**
net_test(0) = (0 − €36.57) × 10 − €180 = −€545.70, about **−€546**, if nobody new comes and 30% of regulars switch (a guess). That is about 36% of the €1,500 the owner said they could spare.

**Biggest uncertainty**
Each guess is moved across a range with the others at the likely guess (8 extra a day), and the swing in the test result is compared:

| Guess | Range | Swing over the test |
|---|---|---|
| Extra lunch customers a day | 3 to 15 (cautious to optimistic): −€385 to €257 | **€642** |
| What a lunch customer spends today | €9.52 to €12.88 (±15%) | €223.50 |
| Ingredients per deal | €3.06 to €4.14 (±15%) | €209.50 |
| Regulars who switch | 10% to 50% (the smaller of 10% and half the guess, up to the larger of 50% and 1.5 × the guess) | €180.90 |

So the test should measure extra lunch customers first, and count switchers on the side.

**What it teaches**
- The likely guess (8) is **below** break-even (11), so over the test the expected result is a loss (−€118). Once the €180 setup is spent, the same 8 a day would add about €135 a month, because 8 is above the going-forward break-even of 7. That is why the test card keeps the deal from 7 a day. Both are possibilities, not promises.
- VAT matters: of the €9.90 deal, €0.95 goes to the tax office before ingredients.
- Switching regulars cost €13.57 a day, more than half the €23 for staff and promotion. A deal mostly used by people who were coming anyway can lose money.
- The expected €135 a month is about 0.8% of the €16,500 monthly fixed costs: it puts the result in proportion; it is not a profit figure for the whole café.

### Example: move one assumption

Raise the deal price from €9.90 to €10.50, everything else the same:

- m_offer = €10.50 ÷ 1.106 − €3.60 = €9.494 − €3.60 = €5.89 (54 cents more per deal; the other 6 cents of the 60 go to VAT)
- switch_loss = 11.4 × (€6.54 − €5.89) = 11.4 × €0.65 = €7.41 a day (down from €13.57)
- break-even = (€7.41 + €23.00 + €18.00) ÷ €5.89 = €48.41 ÷ €5.89 = 8.2 → **9 a day** (down from 11)
- going forward = (€7.41 + €23.00) ÷ €5.89 = €30.41 ÷ €5.89 = 5.2 → **6 a day** (down from 7)
- expected over the test = (8 × €5.89 − €30.41) × 10 − €180 = €16.71 × 10 − €180 = **−€12.90** (up from −€117.70); per month €16.71 × 21.7 = €362.61
- worst case = (0 − €30.41) × 10 − €180 = −€484.10, about **−€484** (down from −€546)
- the test card (see "Planning the test by hand"): keep from **6** extra a day (9 also pays back the test), tweak at **3 to 5**, stop below **3**; the cash stop line stays **€295 by day 5** (€410 for all 10 days), because the setup, staff and promotion did not change; switching regulars, counted separately, cost about €37 by day 5

Mechanism, in words: each deal earns more, and regulars who switch give up less, so fewer new customers are needed. What the maths cannot know: whether €10.50 brings in as many people as €9.90. The guess of 8 stayed fixed; the test checks it.

---

## Template 2: price change on one item

### The numbers (demo café)

| Key | Meaning | Kind | Demo |
|---|---|---|---|
| `item` | the item being repriced | choice | flat white |
| `current_price` | price today, incl. VAT | fact | €3.90 |
| `new_price` | the price being considered, incl. VAT | choice | €4.20 |
| `units_per_week` | sales per week now | fact | 620 |
| `unit_cost` | ingredients and packaging per item | fact | €0.95 |
| `vat_rate` | VAT on this item | fact | 0.19 (the fallback, coffee drinks) |
| `volume_low` / `volume_likely` / `volume_high` | change in sales: cautious / likely / optimistic | guess | −12% / −4% / 0% |
| `test_days` | length of the test, in days | choice | 14 |

### The formulas

```
m_old            = current_price / (1 + vat_rate) − unit_cost              what each sale earns now
m_new            = new_price / (1 + vat_rate) − unit_cost                  what each sale earns after
break_even_v     = m_old / m_new − 1                                       the sales change at which you earn the same
weekly_delta(v)  = units_per_week · (1 + v) · m_new − units_per_week · m_old
```

v is a change in sales as a share: −0.04 means 4% fewer sales. The three scenarios use v = `volume_low`, `volume_likely`, `volume_high`. Other periods (show the step when you use one):

- over the test: weekly_delta × `test_days` ÷ 7;
- per month: weekly_delta × 4.33 (weeks in a month, as the engine uses).

In words:

- A price rise goes straight to what each sale earns, after VAT takes its share of the rise.
- So you can lose some sales and still earn the same. **break_even_v** says how many: say it in items a week, not only in percent.
- If you lose fewer sales than that, you are better off; if you lose more, worse off.
- A price cut works the other way round: break_even_v is positive, the extra sales you need.

### Worked example: the demo café (flat white, €3.90 → €4.20)

**What each sale earns**
m_old = €3.90 ÷ 1.19 − €0.95 = €3.277 − €0.95 = 2.327 → **€2.33**
m_new = €4.20 ÷ 1.19 − €0.95 = €3.529 − €0.95 = 2.579 → **€2.58**

The price goes up 30 cents (about 7.7%). About 25 cents of that stays with the café (€0.30 ÷ 1.19), so what each sale earns goes up by 10.7% (€2.33 → €2.58). That is why a small rise can matter.

**Break-even**
break_even_v = €2.33 ÷ €2.58 − 1 = 0.9031 − 1 = **−9.7%**
In flat whites: 620 × 9.7% = 60.1, rounded down: you can sell **up to 60 fewer a week** (560 instead of 620) before you are worse off.

**What you earn on flat whites now**
620 × €2.33 = **€1,444.60 a week**

**The three scenarios**

| Scenario | Change in sales (a guess) | Flat whites a week | Earned a week | weekly_delta | Over the 14-day test | Per month |
|---|---|---|---|---|---|---|
| Cautious | −12% | 620 × 0.88 = 545.6 | 545.6 × €2.58 = €1,407.65 | **−€36.95** | −€73.90 | −€160 |
| Expected | −4% | 620 × 0.96 = 595.2 | 595.2 × €2.58 = €1,535.62 | **€91.02** | €182.04 | €394 |
| Optimistic | 0% | 620 | 620 × €2.58 = €1,599.60 | **€155.00** | €310.00 | €671 |

**Move one assumption: −8% instead of −4%**
weekly_delta(−0.08) = 620 × 0.92 × €2.58 − €1,444.60 = **€27.03 a week** (about €117 a month). Still above zero, because 8% is less than the 9.7% break-even.

**The downside**
A price change has no setup cost and can be reversed. Over the test, the cautious case loses about €74. If sales fell further than the break-even (more than 9.7%, below 560 a week), you would see it in the counts within the test and could change the price back.

**Biggest uncertainty**
How customers react: from −€36.95 to €155.00 a week between the cautious and optimistic guesses, €383.90 over the 14-day test (−€73.90 to €310.00). The ingredients (€0.81 to €1.09, ±15%) move it by only €13.90. The test measures the reaction: count flat whites per week before and during.

**The 2027 minimum-wage step (optional)**
If the owner names `minimum_wage_hours_per_week`, the tool puts the wage step next to the price change:

```
wage_step_week = minimum_wage_hours_per_week × (€14.60 − €13.90)            = hours × €0.70 more in wages a week from 1 Jan 2027
step_with_contributions = wage_step_week × (1 + 0.21)                       employer contributions: about 21%, a guess (Minijobs cost more)
compare        weekly_delta(volume_likely) with step_with_contributions       does the new price cover the step, on this guess?
```

Illustration, by hand (not part of the demo café): if 60 hours a week are paid at the minimum wage (the owner's number), 60 × €0.70 = €42.00 more in wages a week from 1 Jan 2027, about €50.82 with roughly 21% employer contributions (a guess; check your payroll), against the expected €91.02 a week from the flat white at +30 cents. At +20 cents (€43.40 a week) the price would cover the wages but not the contributions: about €7.42 a week short. Quote the tool's figure when it has one. It is a comparison, never a recommendation to raise prices.

**What it teaches**
- The one number to remember: you could sell up to 9.7% fewer flat whites (up to 60 a week) and still earn the same.
- The likely guess (−4%) is well inside that limit.
- Regulars notice prices: the test should run long enough (two weeks) for them to react.
- A wage rise (the minimum wage goes to €14.60 on 1 Jan 2027) is a reason to rehearse this, never a reason by itself to raise prices.

---

## Planning the test by hand

This is the rule the tools print on the test card (`src/engine/decision.ts` and `experiment.ts`), and `whatif_log_result` applies exactly the same numbers afterwards. Decide it **before** the test starts.

### Lunch offer

The rule is about the days **after** the test. The setup is spent either way, so **keep** starts at the going-forward break-even, not at the break-even that also pays back the setup.

```
keep_from     = break_even_ongoing = ceil( (switch_loss + daily_cost) / m_offer )      each day pays its way from here
tweak_from    = ceil( 0.5 × (switch_loss + daily_cost) / m_offer ), at least 1,         half the UNROUNDED going-forward
                and never above keep_from                                                break-even, rounded up
pay_back_from = break_even                                                              the test also earns back its setup
mid_day       = round(test_days / 2), at least 1                                        the halfway check-in
cash_by_mid   = setup_cost + daily_cost × mid_day                                       cash out by then: the receipts envelope
cash_all      = setup_cost + daily_cost × test_days                                     cash out if every test day runs
switch_by_mid = switch_loss × mid_day                                                   lower takings from switching regulars,
                                                                                        counted separately (never a receipt)
```

- **Before:** count lunch customers (11:30–14:30) every weekday for one normal week, no deal yet: that is the baseline. Add a deal button on the till and a tally sheet with two columns, "new to lunch here" and "usually has lunch here". Write the stop line at the top of the sheet: "on day `mid_day`, if I average fewer than `tweak_from` extra lunch customers a day, I stop".
- **Check-ins:** day 3 (is the counting working? too early to judge), `mid_day` (average extra customers, count minus baseline, against `tweak_from` and `keep_from`; cash spent against `cash_by_mid`), the last day.
- **Keep:** `keep_from` or more extra lunch customers a day on average. At `pay_back_from` or more, the test has also paid back its setup.
- **Tweak:** from `tweak_from` to under `keep_from` a day: change one thing (a higher price, other contents, no paid promotion) and run one more week.
- **Stop:** fewer than `tweak_from` a day.
- **Cash stop line:** by the day-`mid_day` check-in the test has cost about `cash_by_mid` in cash (setup, staff, promotion: what the receipts show). If by then the average is under `tweak_from`, stop. All days: `cash_all`. Switching regulars are **not** in it: they lower takings by about `switch_by_mid` by `mid_day` on the guess; count them from the "usually has lunch here" column, strokes × (m_lunch_now − m_offer).
- **Special cases.** `m_offer` ≤ 0: don't start; change the price or the contents. `keep_from` = 0 (switching regulars leave more than their usual lunch and nothing else costs): keep if lunchtime is at least as busy as the baseline, stop if it is quieter. `keep_from` above both 10 and 3 × `extra_high`, or above `weekday_customers`: don't start; change the price, the contents or the costs first.

**Demo café (€9.90):** keep_from = ceil(€36.57 ÷ €5.35) = ceil(6.84) = **7**; tweak_from = ceil(0.5 × 6.84) = ceil(3.42) = **4**; pay_back_from = **11**; mid_day = 5; cash_by_mid = €180 + €23.00 × 5 = **€295**; cash_all = €180 + €23.00 × 10 = **€410**; switch_by_mid = €13.57 × 5 = €67.85, **about €68**, strokes × €1.19. So: keep at 7 or more a day (11 or more also pays back the test), tweak at 4 to 6, stop below 4; on day 5, stop if under 4 a day. At 7 a day the deal earns about €19 a month (7 × €5.35 − €36.57 = €0.88 a day × 21.7). If nobody new comes, the whole test costs about €546 (the worst case: €410 cash plus €136 from switching).

**At €10.50:** keep from 6, tweak at 3 to 5, stop below 3, 9 also pays back the test; the same €295 by day 5 and €410 in all; switching about €37 by day 5, strokes × €0.65.

### Price change

```
price rise (break_even_v below 0)
keep_from   = units_per_week − floor( units_per_week × −break_even_v )          the sales you can lose, rounded down
tweak_from  = ceil( units_per_week × (1 + 1.5 × break_even_v) ), never above keep_from
price cut (break_even_v above 0)
keep_from   = units_per_week + ceil( units_per_week × break_even_v )            the extra sales you need, rounded up
tweak_from  = ceil( units_per_week × (1 + 0.5 × break_even_v) ), never above keep_from
mid_price   = (current_price + new_price) / 2, rounded to 5 cents
```

- **Before:** count the item's sales for one normal week at the old price (the till's item report): the baseline.
- **Check-ins:** day 3 (is the new price on the till, the board and online?), day 7 (the first full week against the baseline), the last day.
- **Keep:** at least `keep_from` a week: keep the new price.
- **Tweak:** from `tweak_from` to under `keep_from` a week: try `mid_price` for another test.
- **Stop:** fewer than `tweak_from` a week: go back to the old price.
- **Cost cap:** switch back early if sales are below `tweak_from` in the first full week. At the cautious guess the whole test costs about `−weekly_delta(volume_low) × test_days ÷ 7`.
- If break_even_v is −100% or less (the old price leaves nothing after VAT and ingredients): whatever happens to sales, keep a price above the old one.

**Demo flat white:** keep_from = 620 − floor(620 × 0.0969) = 620 − floor(60.1) = **560**; tweak_from = ceil(620 × (1 − 1.5 × 0.0969)) = ceil(529.9) = **530**; mid_price = (€3.90 + €4.20) ÷ 2 = **€4.05**. So: keep at 560 a week or more (a drop of up to 9.7%), try €4.05 at 530 to 559, go back to €3.90 below 530. At the cautious guess (−12%) the test costs about €74.

## Logging the result by hand

The verdict uses **the card's numbers** (keep_from and tweak_from from the plan); it never moves the goalposts. This is what `whatif_log_result` does (`src/engine/compare.ts`).

### Lunch offer

```
extra              = test_lunch_customers − baseline_lunch_customers              measured extra a day
switchers_seen     = min( baseline, max(0, redemptions_per_day − max(0, extra)) )  deals bought by regulars
switch_share_seen  = switchers_seen / baseline_lunch_customers
verdict            = keep if extra ≥ keep_from; tweak if extra ≥ tweak_from; otherwise stop     (the card's numbers)
```

Money: redo the lunch formulas with `lunch_customers` = the baseline, `switch_share` = `switch_share_seen`, `setup_cost` = `actual_setup_cost` and `test_days` = `days_run` (when given): net_test = net_day(extra) × days − setup. If lunch got quieter (extra below 0), net_day = net_day(0) + extra × m_lunch_now.

If the verdict is keep but more regulars switched than planned, redo `break_even_ongoing` with `switch_share_seen`; if `extra` is below it, say that the deal now needs that many a day.

Then what was learned: the guess against the count ("your guess was 8 extra a day, the count says 6; next time start from 6"), the switching share against the guess, and a different baseline or setup cost if they came out differently.

**Demo result** (the counts behind the "after the test" demo): baseline 38, 44 during the test, 14 deals a day, 10 days, €180 setup. extra = 44 − 38 = **6**; switchers_seen = min(38, 14 − 6) = 8, so 8 ÷ 38 = **21.1%** switched (the guess was 30%). Verdict: 6 is from 4 to under 7, so **tweak** and test one more week. Money: 38 × 21.1% = 8.0 switchers × €1.19 = €9.52 a day; net_day(6) = 6 × €5.35 − €9.52 − €23.00 = −€0.42; × 10 − €180 = **−€184.20**, about €184 down against −€118 expected.

### Price change

```
change      = units_after_per_week ÷ units_before_per_week − 1
keep_from, tweak_from: the formulas above with units_per_week = units_before_per_week (the measured baseline)
verdict     = keep if units_after_per_week ≥ keep_from; tweak if ≥ tweak_from; otherwise go back to the old price
net_test    = (units_after_per_week × m_new − units_before_per_week × m_old) × days_run ÷ 7
```

**Demo result:** 620 → 603 a week: change = −2.7%; keep_from 560, so **keep** the new price; (603 × €2.58 − 620 × €2.33) × 14 ÷ 7 = (€1,555.74 − €1,444.60) × 2 = **€222.28** against €182.04 expected. Learned: "you guessed −4%, it was −2.7%; next time start from −3%".

---

## Glossary for the maths

- **VAT (Mehrwertsteuer)**: the tax inside the price customers pay. It goes to the tax office, so only `price ÷ (1 + VAT)` is the café's. In Berlin cafés: 7% on food (since 1 Jan 2026) and 19% on every drink drunk in the café; only a take-away milk drink with at least 75% milk is 7%.
- **Margin (what each sale earns)**: price without VAT minus ingredients and packaging. It pays for rent, wages and you.
- **Variable cost**: a cost that grows with each sale (beans, milk, cups).
- **Fixed cost**: a cost that stays the same however busy you are (rent, insurance).
- **Switching**: regulars moving from their usual, pricier lunch to the cheaper deal. Marketers call it cannibalisation.
- **Break-even**: the point where the change pays for itself. The lunch offer has two: the one that **pays back the test** (setup included, the headline: 11 in the demo) and the one from which the deal **pays its way** (setup already spent, the keep line on the test card: 7 in the demo).
- **Worst case**: what the test costs if the main guess turns out to be zero, with the other guesses as they are.
- **Scenario**: one possible outcome built from one set of guesses. Three scenarios show a range, not a forecast.
- **Sensitivity**: how much the result moves when one guess moves.
