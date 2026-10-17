# What-IF maths, written out

This is every formula the What-IF engine uses for its two templates, with the demo café worked through by hand.

Use it to:

- **check** a tool result, or explain "show the maths" in more detail;
- **work by hand** when the What-IF MCP tools are not connected.

When the tools are connected, **the tools do the maths**: quote their figures, not yours. If a hand result here differs from the tool by a cent or two, that is rounding; trust the tool and say so.

## How to work by hand (no MCP)

1. Collect the numbers one question at a time, exactly as in the skill (the `ask` and `why` texts are below).
2. Write each formula out with the owner's numbers, one line per step. No mental shortcuts.
3. If your host has a code or calculator tool, use it for the arithmetic and show the inputs.
4. Label every figure: **your number**, **a guess**, **calculated by hand**.
5. Round money to cents only at the end. Customers per day for break-even are always rounded **up** (you cannot serve 0.9 of a customer).
6. Say once: "These were calculated by hand with What-IF's formulas. Connect What-IF ({{SITE_URL}}/connect) for the checked version and the visual report."

Defaults when the owner does not know (always labelled as a guess):

| Field | Default |
|---|---|
| `variable_cost_share` | 0.30 (30%) |
| `switch_share` | 0.30 (30%) |
| `setup_cost`, `extra_staff_cost_per_day`, `marketing_per_week` | 0 |
| `test_days` | 10 weekdays (lunch offer), 14 days (price change) |
| `lunch_spend` | the owner's `avg_spend` (lunch is often higher; ask them to check the till) |
| `extra_low` | round down (0.4 × `extra_likely`) |
| `extra_high` | the larger of `extra_likely` + 1 and round up (1.8 × `extra_likely`) |
| `volume_low` | `volume_likely` − 0.08 (but not below −100%) |
| `volume_high` | `volume_likely` + 0.04 (but not above +5%) |

Sanity checks (stop and ask if any fail): the deal's ingredients must cost less than its price; cautious ≤ likely ≤ optimistic; lunch customers cannot exceed customers for the whole day; for a price change, the new price must differ from the old one and be above the item's cost.

---

## Template 1: weekday lunch offer

### The numbers

| Key | Meaning | Kind | Demo café |
|---|---|---|---|
| `weekday_customers` | customers on an average weekday, whole day | fact | 140 |
| `avg_spend` | average spend per customer | fact | €7.40 |
| `variable_cost_share` | share of the price spent on ingredients and packaging | fact | 0.32 |
| `monthly_fixed_costs` | rent, wages, energy, insurance per month | fact | €16,500 |
| `lunch_customers` | lunch customers per weekday now (11:30–14:30) | fact | 38 |
| `lunch_spend` | what a lunch customer spends now | fact | €11.20 |
| `cash_buffer` | cash they could spend on a test without worry | fact | €1,500 |
| `offer_price` | price of the lunch deal | choice | €9.90 |
| `offer_cost` | ingredients and packaging per deal | fact | €3.60 |
| `setup_cost` | one-off costs: sign, flyers, menu print | choice | €180 |
| `extra_staff_cost_per_day` | extra staff cost per weekday | choice | €18 |
| `marketing_per_week` | promotion budget per week | choice | €25 |
| `test_days` | length of the test, in weekdays | choice | 10 |
| `extra_low` | extra lunch customers a day: cautious guess | guess | 3 |
| `extra_likely` | extra lunch customers a day: likely guess | guess | 8 |
| `extra_high` | extra lunch customers a day: optimistic guess | guess | 15 |
| `switch_share` | share of today's lunch customers who switch to the deal | guess | 0.30 |

Demo values describe a made-up café (Café Lindenblatt, Berlin-Neukölln). Always label them **demo data**.

### The formulas

```
m_offer       = offer_price − offer_cost                       what each deal earns
m_lunch_now   = lunch_spend × (1 − variable_cost_share)        what a lunch earns today
switchers     = lunch_customers × switch_share                 regulars who switch to the deal
switch_loss   = switchers × (m_lunch_now − m_offer)            what switching costs per day
daily_cost    = extra_staff_cost_per_day + marketing_per_week / 5
net_day(x)    = x · m_offer − switch_loss − daily_cost         x = extra lunch customers a day
net_test(x)   = net_day(x) · test_days − setup_cost            result over the whole test
net_month(x)  = net_day(x) · 21.7                              ongoing, per month (21.7 weekdays)
break_even    = ceil( (switch_loss + daily_cost + setup_cost / test_days) / m_offer )
worst_case    = net_test(0)                                    nobody new comes
```

The three scenarios use x = `extra_low` (cautious), `extra_likely` (expected) and `extra_high` (optimistic).

In words:

- Every **new** customer who buys the deal adds `m_offer`.
- Every **regular** who switches from their usual lunch to the cheaper deal takes away the gap `m_lunch_now − m_offer`.
- Extra staff and promotion cost the same every day, busy or not.
- The one-off setup cost has to be earned back during the test.
- **Break-even** is the number of extra customers a day at which the test pays for itself.
- **Worst case** is what the test costs if no new customers come at all: the most you can lose by trying.

### Worked example: the demo café

**What each deal earns**
m_offer = €9.90 − €3.60 = **€6.30**

**What a lunch earns today**
m_lunch_now = €11.20 × (1 − 0.32) = €11.20 × 0.68 = **€7.616** (about €7.62)

**Regulars who switch**
switchers = 38 × 0.30 = **11.4 a day**

**What switching costs**
switch_loss = 11.4 × (€7.616 − €6.30) = 11.4 × €1.316 = **€15.00 a day**

**Fixed daily costs of the offer**
daily_cost = €18 + €25 ÷ 5 = €18 + €5 = **€23.00 a day**

So before any new customer arrives, the offer costs €15.00 + €23.00 = **€38.00 a day**.

**Break-even**
(€15.0024 + €23 + €180 ÷ 10) ÷ €6.30 = €56.0024 ÷ €6.30 = 8.89 → rounded up: **9 extra lunch customers a day**

**The three scenarios**

| Scenario | Extra customers a day (a guess) | net_day | Over the 10-day test | Per month, ongoing |
|---|---|---|---|---|
| Cautious | 3 | 3 × €6.30 − €38.00 = −€19.10 | −€19.10 × 10 − €180 = **−€371** | −€19.10 × 21.7 = **−€415** |
| Expected | 8 | 8 × €6.30 − €38.00 = €12.40 | €12.40 × 10 − €180 = **−€56.02** | €12.40 × 21.7 = **€269** |
| Optimistic | 15 | 15 × €6.30 − €38.00 = €56.50 | €56.50 × 10 − €180 = **€385** | €56.50 × 21.7 = **€1,226** |

(Exact figures before rounding: −371.02, −414.52; −56.02, 269.03; 384.98, 1,226.00.)

**Worst case**
net_test(0) = (0 − €38.0024) × 10 − €180 = **−€560**. That is about 37% of the €1,500 the owner said they could spare (€560 ÷ €1,500).

**Biggest uncertainty**
The guess with the widest spread of results is the number of extra customers: from −€371 (cautious) to €385 (optimistic) over the test, a swing of €756. By comparison, moving the switching share from 0% to 60% moves the result by about €300. So the test should measure extra lunch customers first.

**What it teaches**
- The likely guess (8) is just **below** break-even (9), so over the test itself the expected result is a small loss (−€56.02). Once the €180 setup is paid, the same 8 a day would add about €269 a month. Both are possibilities, not promises.
- Switching regulars cost €15 a day: almost as much as the extra staff. A deal mostly used by people who were coming anyway can lose money.
- The worst case is capped and known: about €560, or 37% of the spare cash.

**Current path, for context**
Weekday takings now: 140 × €7.40 = €1,036 a day. After ingredients: €1,036 × 0.68 = €704.48 a day. The expected €269 a month is about 1.6% of the €16,500 monthly fixed costs (€269 ÷ €16,500). This puts the result in proportion; it is not a profit figure for the whole café.

### Example: move one assumption

Raise the deal price from €9.90 to €10.50, everything else the same:

- m_offer = €10.50 − €3.60 = €6.90 (60 cents more per deal)
- switch_loss = 11.4 × (€7.616 − €6.90) = 11.4 × €0.716 = €8.16 a day (down from €15.00)
- break-even = (€8.1624 + €23 + €18) ÷ €6.90 = €49.16 ÷ €6.90 = 7.12 → **8 a day** (down from 9)
- worst case = (0 − €31.16) × 10 − €180 = **−€492** (down from −€560)

Mechanism, in words: each deal earns more, and regulars who switch give up less, so fewer new customers are needed. What the maths cannot know: whether €10.50 brings in as many people as €9.90. The guess of 8 stayed fixed; the test checks it.

---

## Template 2: price change on one item

### The numbers

| Key | Meaning | Kind | Demo café |
|---|---|---|---|
| `item` | the item being repriced | choice | flat white |
| `current_price` | price today | fact | €3.90 |
| `new_price` | the price being considered | choice | €4.20 |
| `units_per_week` | sales per week now | fact | 620 |
| `unit_cost` | ingredients and packaging per item | fact | €0.95 |
| `volume_low` | change in sales: cautious guess | guess | −12% |
| `volume_likely` | change in sales: likely guess | guess | −4% |
| `volume_high` | change in sales: optimistic guess | guess | 0% |
| `test_days` | length of the test, in days | choice | 14 |

### The formulas

```
m_old            = current_price − unit_cost                          what each sale earns now
m_new            = new_price − unit_cost                              what each sale earns after
break_even_v     = m_old / m_new − 1                                  the sales change at which you earn the same
weekly_delta(v)  = units_per_week · (1 + v) · m_new − units_per_week · m_old
```

v is a change in sales as a share: −0.04 means 4% fewer sales. The three scenarios use v = `volume_low`, `volume_likely`, `volume_high`.

To put a weekly figure in other periods (show the step when you do it):

- over the test: weekly_delta × `test_days` ÷ 7;
- per month: weekly_delta × 52 ÷ 12 (about 4.33 weeks).

In words:

- A price rise goes straight to what each sale earns.
- So you can lose some sales and still earn the same. **break_even_v** says how many.
- If you lose fewer sales than that, you are better off; if you lose more, worse off.
- A price cut works the other way round: break_even_v is positive, the extra sales you need.

### Worked example: the demo café (flat white, €3.90 → €4.20)

**What each sale earns**
m_old = €3.90 − €0.95 = **€2.95**
m_new = €4.20 − €0.95 = **€3.25**

The price goes up 30 cents (about 7.7%), but what each sale earns goes up 30 cents on €2.95 (about 10.2%). That is why a small rise can matter.

**Break-even**
break_even_v = €2.95 ÷ €3.25 − 1 = 0.9077 − 1 = **−9.2%**
In flat whites: 620 × 0.9077 = about 563 a week, so **about 57 fewer a week** before you are worse off.

**What you earn on flat whites now**
620 × €2.95 = **€1,829 a week**

**The three scenarios**

| Scenario | Change in sales (a guess) | Flat whites a week | Earned a week | weekly_delta | Over the 14-day test | Per month |
|---|---|---|---|---|---|---|
| Cautious | −12% | 620 × 0.88 = 545.6 | 545.6 × €3.25 = €1,773.20 | **−€55.80** | −€111.60 | −€241.80 |
| Expected | −4% | 620 × 0.96 = 595.2 | 595.2 × €3.25 = €1,934.40 | **€105.40** | €210.80 | €456.73 |
| Optimistic | 0% | 620 | 620 × €3.25 = €2,015.00 | **€186.00** | €372.00 | €806.00 |

**The downside**
A price change has no setup cost and can be reversed. Over the test, the cautious case loses about €111.60. If sales fell further than the break-even (more than about 9%), you would see it in the counts within the test and could change the price back.

**Biggest uncertainty**
How customers react: the spread between the cautious and optimistic guesses is €241.80 a week (from −€55.80 to €186.00). The test measures it: count flat whites per week before and during.

**What it teaches**
- The one number to remember: you could sell about 9% fewer flat whites (about 57 a week) and still earn the same.
- The likely guess (−4%) is well inside that limit.
- Regulars notice prices: the test should run long enough (two weeks) for them to react.

---

## Glossary for the maths

- **Margin (what each sale earns)**: price minus ingredients and packaging. It pays for rent, wages and you.
- **Variable cost**: a cost that grows with each sale (beans, milk, cups).
- **Fixed cost**: a cost that stays the same however busy you are (rent, insurance).
- **Switching**: regulars moving from their usual, pricier lunch to the cheaper deal. Marketers call it cannibalisation.
- **Break-even**: the point where the change pays for itself.
- **Worst case**: what the test costs if the guess turns out to be zero.
- **Scenario**: one possible outcome built from one set of guesses. Three scenarios show a range, not a forecast.
- **Sensitivity**: how much the result moves when one guess moves.
