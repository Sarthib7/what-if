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
5. **End with a test**: the keep / tweak / stop rule and the cost cap in "Planning the test by hand" below.
6. Say once: "These were calculated by hand with What-IF's formulas. Connect What-IF ({{SITE_URL}}/connect) for the checked version and the visual report." No AI app with connectors? {{SITE_URL}}/try builds the same report in the browser.

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
| `vat_rate` | Is it a drink (19%) or food (7%)? | Only the price without VAT is yours. | 0.19, a guess (coffee drinks; cake 7%; a milk drink with at least 75% milk may be 7%) |
| `volume_likely` | What do you think would really happen to sales? | The guess the test checks. | ask: "−2%? −5%? −10%?" |
| `volume_low` | If customers really disliked it, how much would sales drop? | A range keeps the guess honest. | `volume_likely` − 0.08 (not below −100%) |
| `volume_high` | And if nobody minded at all? | Shows the best case. | `volume_likely` + 0.04 (not above +5%) |
| `test_days` | How many days would you try the new price before deciding? | Long enough for regulars to react. | 14 |

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
The number of extra customers: from −€385 (cautious) to €257 (optimistic) over the test, a swing of €642. Moving the switching share from 0% to 60% (at 8 extra a day) moves the result from about €18 to about −€253, a swing of about €271. So the test should measure extra lunch customers first, and count switchers on the side.

**What it teaches**
- The likely guess (8) is **below** break-even (11), so over the test the expected result is a loss (−€118). Once the €180 setup is spent, the same 8 a day would add about €135 a month, because 8 is above the going-forward break-even of 7. Both are possibilities, not promises.
- VAT matters: of the €9.90 deal, €0.95 goes to the tax office before ingredients.
- Switching regulars cost €13.57 a day, more than half the €23 for staff and promotion. A deal mostly used by people who were coming anyway can lose money.
- The expected €135 a month is about 0.8% of the €16,500 monthly fixed costs: it puts the result in proportion; it is not a profit figure for the whole café.

### Example: move one assumption

Raise the deal price from €9.90 to €10.50, everything else the same:

- m_offer = €10.50 ÷ 1.106 − €3.60 = €9.494 − €3.60 = €5.89 (54 cents more per deal; the other 6 cents of the 60 go to VAT)
- switch_loss = 11.4 × (€6.54 − €5.89) = 11.4 × €0.65 = €7.41 a day (down from €13.57)
- break-even = (€7.41 + €23.00 + €18) ÷ €5.89 = €48.41 ÷ €5.89 = 8.22 → **9 a day** (down from 11)
- worst case = (0 − €30.41) × 10 − €180 = −€484.10, about **−€484** (down from −€546)

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

The price goes up 30 cents (about 7.7%). About 25 cents of that stays with the café (€0.30 ÷ 1.19), so what each sale earns goes up by about 11% (€0.25 on €2.33). That is why a small rise can matter.

**Break-even**
break_even_v = €2.33 ÷ €2.58 − 1 = 0.9031 − 1 = **−9.7%**
In flat whites: 620 × 9.7% = 60.1, rounded down: you can sell **up to 60 fewer a week** (560 instead of 620) before you are worse off.

**What you earn on flat whites now**
620 × €2.33 = **€1,444.60 a week**

**The three scenarios**

| Scenario | Change in sales (a guess) | Flat whites a week | Earned a week | weekly_delta | Over the 14-day test | Per month |
|---|---|---|---|---|---|---|
| Cautious | −12% | 620 × 0.88 = 545.6 | 545.6 × €2.58 = €1,407.65 | **−€36.95** | −€73.90 | −€160 |
| Expected | −4% | 620 × 0.96 = 595.2 | 595.2 × €2.58 = €1,535.62 | **€91.02** | €182.03 | €394 |
| Optimistic | 0% | 620 | 620 × €2.58 = €1,599.60 | **€155.00** | €310.00 | €671 |

**Move one assumption: −8% instead of −4%**
weekly_delta(−0.08) = 620 × 0.92 × €2.58 − €1,444.60 = **€27.03 a week** (about €117 a month). Still above zero, because 8% is less than the 9.7% break-even.

**The downside**
A price change has no setup cost and can be reversed. Over the test, the cautious case loses about €74. If sales fell further than the break-even (more than about 10%), you would see it in the counts within the test and could change the price back.

**Biggest uncertainty**
How customers react: from −€36.95 to €155.00 a week between the cautious and optimistic guesses, a spread of about €192 a week. The test measures it: count flat whites per week before and during.

**What it teaches**
- The one number to remember: you could sell about 10% fewer flat whites (up to 60 a week) and still earn the same.
- The likely guess (−4%) is well inside that limit.
- Regulars notice prices: the test should run long enough (two weeks) for them to react.
- A wage rise (the minimum wage goes to €14.60 on 1 Jan 2027) is a reason to rehearse this, never a reason by itself to raise prices.

---

## Planning the test by hand

This is the rule the tools use. Decide it **before** the test starts.

### Lunch offer

```
half          = ceil(break_even × 0.5)
mid_day       = round(test_days / 2)                                         the halfway check-in
spent_by_mid  = setup_cost + (daily_cost + switch_loss) × mid_day            if nobody new comes
stop_line     = the smaller of spent_by_mid and cash_buffer × 0.5, rounded to the nearest €10
```

- **Before:** count lunch customers (11:30–14:30) every weekday for a week, no deal yet; add a deal button on the till and a tally sheet with two columns, "new to lunch here" and "usually has lunch here".
- **Check-ins:** day 3 (is the counting working?), `mid_day` (average extra customers against break-even, money spent against the stop line), the last day.
- **Keep:** at least `break_even` extra lunch customers a day on average. (From `break_even_ongoing` a day it already pays its way going forward; the setup is spent either way.)
- **Tweak:** from `half` to `break_even − 1` a day: change one thing (price, contents, no paid promotion) and run one more week.
- **Stop:** fewer than `half` a day.
- **Cost cap:** stop early once you have spent `stop_line` without reaching `half` extra a day. If nobody new comes and switching is as guessed, the whole test costs `−worst_case`.

Demo café: break-even 11, so half = 6; mid_day = 5; spent_by_mid = €180 + €36.57 × 5 = €362.85; half the €1,500 buffer is €750, so the stop line is **about €360**. Keep at 11 or more a day (7 or more pays its way going forward), tweak at 6 to 10, stop below 6. Worst case about €546.

### Price change

```
keep_floor   = units_per_week × (1 + break_even_v)                           sales a week you can fall to
tweak_floor  = units_per_week × (1 + 1.5 × break_even_v), rounded up
mid_price    = (current_price + new_price) / 2, rounded to 5 cents
```

- **Before:** count the item's sales for one normal week at the old price (the till's item report).
- **Keep:** sales fall by no more than the break-even (at least `keep_floor` a week).
- **Tweak:** they fall to between `tweak_floor` and `keep_floor`: try `mid_price` for another test.
- **Stop:** fewer than `tweak_floor` a week: go back to the old price.
- **Cost cap:** switch back early if sales are below `tweak_floor` in the first full week. At the cautious guess the whole test costs about `−weekly_delta(volume_low) × test_days ÷ 7`.
- For a **price cut** (break_even_v above zero): keep if sales rise by at least break_even_v; tweak between half of that and break_even_v; stop below half.

Demo flat white: keep at 560 a week or more (a drop of up to 9.7%), tweak at 530 to 559 (try €4.05), stop below 530. At the cautious guess the test costs about €74.

## Logging the result by hand

Lunch offer, from the owner's counts:

```
extra            = test_lunch_customers − baseline_lunch_customers
switchers_seen   = min(baseline, max(0, redemptions_per_day − max(0, extra)))
switch_share_seen = switchers_seen / baseline_lunch_customers
```

Redo the lunch formulas with `lunch_customers` = the baseline, `switch_share` = `switch_share_seen`, and the real setup cost and days. Verdict: keep if `extra` ≥ the new break-even (unrounded), tweak if ≥ half of it, otherwise stop. Then say what was learned: "your guess was 8 extra a day, the count says 5; next time start from 5", and the same for switching.

Price change: `change = units_after_per_week ÷ units_before_per_week − 1`; compare it with `break_even_v` and apply the rule above.

---

## Glossary for the maths

- **VAT (Mehrwertsteuer)**: the tax inside the price customers pay. It goes to the tax office, so only `price ÷ (1 + VAT)` is the café's. In Berlin cafés: 7% on food, 19% on drinks (since 1 Jan 2026).
- **Margin (what each sale earns)**: price without VAT minus ingredients and packaging. It pays for rent, wages and you.
- **Variable cost**: a cost that grows with each sale (beans, milk, cups).
- **Fixed cost**: a cost that stays the same however busy you are (rent, insurance).
- **Switching**: regulars moving from their usual, pricier lunch to the cheaper deal. Marketers call it cannibalisation.
- **Break-even**: the point where the change pays for itself.
- **Worst case**: what the test costs if the main guess turns out to be zero, with the other guesses as they are.
- **Scenario**: one possible outcome built from one set of guesses. Three scenarios show a range, not a forecast.
- **Sensitivity**: how much the result moves when one guess moves.
