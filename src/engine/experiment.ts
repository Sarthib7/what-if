/**
 * planTest(): turns an analysis into one small, capped, measurable test.
 *
 * The decision rule is written before the test starts and comes from decision.ts,
 * which compareResult() uses too, so the verdict always matches the card.
 * The cash stop line counts only money the owner sees going out (setup, staff,
 * promotion); what switching regulars cost in takings is shown separately.
 */
import { setLang } from "../i18n/index.ts";
import { lunchThresholds, priceThresholds } from "./decision.ts";
import { eur, list, n, num, pc, price, r2, setCurrency, signedPct } from "./format.ts";
import type { Values } from "./format.ts";
import { valuesOf } from "./figures.ts";
import { langOf } from "./lang.ts";
import { lunchModel } from "./lunch-offer.ts";
import { msg as t } from "./messages.ts";
import { priceModel } from "./price-change.ts";
import type { Analysis, TestPlan } from "./types.ts";

export function planTest(a: Analysis): TestPlan {
  setLang(langOf(a));
  setCurrency(a.currency);
  const v = valuesOf(a.inputs);
  if (a.template === "lunch_offer") return planLunch(a, v);
  if (a.template === "price_change") return planPrice(a, v);
  throw new Error(t("err.noPlan", { t: String(a.template) }));
}

function checkInDays(days: number, mid: number): number[] {
  return [...new Set([Math.min(3, days), mid, days])].filter((d) => d >= 1).sort((x, y) => x - y);
}

function planLunch(a: Analysis, v: Values): TestPlan {
  const m = lunchModel(v);
  const days = m.days;
  const likely = n(v, "extra_likely");
  const high = n(v, "extra_high");
  const wc = n(v, "weekday_customers");
  const mid = Math.max(1, Math.round(days / 2));
  const daysText = t("n.weekdays", { n: days });
  const title = t("plan.lunch.title", { days: num(days), price: price(m.offerPrice) });
  const th = lunchThresholds(m, v);

  const stopEarly = (key: "unreachable" | "impractical", p: Record<string, string | number> = {}): TestPlan => ({
    analysisId: a.id,
    title,
    days,
    before: [t(`plan.lunch.${key}.before` as "plan.lunch.unreachable.before", p)],
    during: [],
    measure: [],
    checkIns: [],
    decisionRule: { keep: t(`plan.lunch.${key}.keep` as "plan.lunch.unreachable.keep"), tweak: t(`plan.lunch.${key}.tweak` as "plan.lunch.unreachable.tweak"), stop: t("plan.dontStart") },
    ...(th ? { rule: th } : {}),
    costCap: t("plan.lunch.spendNothing"),
    plain: t(`plan.lunch.${key}.plain` as "plan.lunch.unreachable.plain", p),
  });

  if (!th) return stopEarly("unreachable", { price: price(m.offerPrice), net: price(m.netOfferPrice), cost: price(m.offerCost) });
  if (!th.testable)
    return stopEarly("impractical", {
      be: num(th.keepFrom),
      high: num(high),
      why: wc > 0 && th.keepFrom > wc ? t("plan.lunch.impractical.whyDay", { wc: num(wc) }) : t("plan.lunch.impractical.whyHigh", { high: num(high) }),
    });

  const keep = th.keepFrom, tweak = th.tweakFrom, payBack = th.payBackFrom ?? keep;
  const zero = keep === 0;

  // Cash only: what the receipts envelope will show.
  const cashMid = r2(m.setup + m.dailyCost * mid);
  const cashAll = m.cashOutTest;
  const cashParts = list(
    [
      ...(m.setup > 0 ? [t("plan.part.setup", { v: eur(m.setup) })] : []),
      ...(m.dailyCost > 0 ? [t("plan.part.daily", { v: price(m.dailyCost), what: list([...(m.staff > 0 ? [t("lunch.word.staff")] : []), ...(m.marketing > 0 ? [t("lunch.word.promotion")] : [])], t("and")) })] : []),
    ],
    t("and"),
  );

  const ideas: string[] = [];
  const better = lunchModel({ ...v, offer_price: m.offerPrice + 1 });
  if (better.beOngoing !== null && better.beOngoing < keep) ideas.push(t("plan.lunch.idea.price", { price: price(m.offerPrice + 1), n: num(better.beOngoing) }));
  if (m.marketing > 0) {
    const noPromo = lunchModel({ ...v, marketing_per_week: 0 });
    if (noPromo.beOngoing !== null && noPromo.beOngoing < keep) ideas.push(t("plan.lunch.idea.noPromo", { n: num(noPromo.beOngoing) }));
  }
  const ideaText = ideas.length ? t("plan.lunch.rule.ideas", { list: list(ideas, t("or")) }) : "";

  const before: string[] = [t("plan.lunch.before.baseline"), t("plan.lunch.before.button"), t("plan.lunch.before.tally")];
  if (m.setup > 0) before.push(t("plan.lunch.before.setup", { setup: eur(m.setup) }));
  before.push(zero ? t("plan.lunch.before.stopLine0", { mid: num(mid) }) : t("plan.lunch.before.stopLine", { mid: num(mid), tweak: num(tweak) }));

  const during: string[] = [t("plan.lunch.during.run", { price: price(m.offerPrice), days: daysText }), t("plan.lunch.during.same")];
  if (m.staff > 0) during.push(t("plan.lunch.during.staff", { hours: t("unit.hoursPerDay", { n: m.staffHours }), cost: price(m.staff) }));
  if (m.marketing > 0) during.push(t("plan.lunch.during.promo", { mkt: price(m.marketing) }));
  during.push(t("plan.lunch.during.ask"));

  const decisionRule = zero
    ? { keep: t("plan.lunch.rule0.keep"), tweak: t("plan.lunch.rule0.tweak"), stop: t("plan.lunch.rule0.stop") }
    : {
        keep: t("plan.lunch.rule.keep", { keep: num(keep), month: eur(Math.max(0, m.netMonth(keep))) }) + (payBack > keep ? t("plan.lunch.rule.keepPayback", { be: num(payBack) }) : ""),
        tweak: tweak < keep ? t("plan.lunch.rule.tweak", { tweak: num(tweak), keep: num(keep), ideas: ideaText }) : t("plan.lunch.rule.tweakNone", { keep: num(keep), ideas: ideaText }),
        stop: t("plan.lunch.rule.stop", { tweak: num(tweak) }),
      };

  let costCap: string;
  if (zero) costCap = t("plan.lunch.cap0", { cashAll: eur(cashAll), parts: cashParts || t("plan.part.nothing"), gain: price(-m.switchLoss), mid: num(mid) });
  else {
    costCap = cashAll > 0
      ? t("plan.lunch.cap", { mid: num(mid), cashMid: eur(cashMid), parts: cashParts, tweak: num(tweak), cashAll: eur(cashAll), days: num(days) })
      : t("plan.lunch.capFree", { mid: num(mid), tweak: num(tweak) });
    if (m.switchLoss > 0.005) costCap += t("plan.lunch.capSwitch", { loss: price(m.switchLoss), lossMid: eur(r2(m.switchLoss * mid)), mid: num(mid), gap: price(m.gap) });
  }

  return {
    analysisId: a.id,
    title,
    days,
    before,
    during,
    measure: [
      { what: t("plan.lunch.measure.lunch.what"), how: t("plan.lunch.measure.lunch.how") },
      { what: t("plan.lunch.measure.deals.what"), how: t("plan.lunch.measure.deals.how") },
      { what: t("plan.lunch.measure.regulars.what"), how: t("plan.lunch.measure.regulars.how", { share: pc(m.switchShare), gap: price(Math.max(0, m.gap)) }) },
      { what: t("plan.lunch.measure.cash.what"), how: t("plan.lunch.measure.cash.how") },
    ],
    checkIns: checkInDays(days, mid).map((d) => ({
      day: d,
      look:
        d === days
          ? t("plan.lunch.check.last")
          : d === mid
            ? zero
              ? t("plan.lunch.check.mid0", { cashMid: eur(cashMid) })
              : t("plan.lunch.check.mid", { tweak: num(tweak), keep: num(keep), cashMid: eur(cashMid) })
            : t("plan.lunch.check.first"),
    })),
    decisionRule,
    rule: th,
    costCap,
    plain: zero
      ? t("plan.lunch.plain0", { days: daysText })
      : t("plan.lunch.plain", { days: daysText, keep: t("n.extraLunch", { n: keep }), likely: num(likely), mid: num(mid), tweak: num(tweak) }),
  };
}

function planPrice(a: Analysis, v: Values): TestPlan {
  const m = priceModel(v);
  const { days, item, units } = m;
  const low = n(v, "volume_low");
  const likely = n(v, "volume_likely");
  const daysText = t("n.days", { n: days });
  const title = t("plan.price.title", { days: num(days), item, price: price(m.newPrice) });
  const th = priceThresholds(m);

  if (!th || m.beV === null || m.beUnits === null) {
    return {
      analysisId: a.id,
      title,
      days,
      before: [t("plan.price.unreachable.before", { price: price(m.newPrice), net: price(m.netNew), item, cost: price(m.unitCost) })],
      during: [],
      measure: [],
      checkIns: [],
      decisionRule: { keep: t("plan.price.unreachable.keep"), tweak: t("plan.price.unreachable.tweak"), stop: t("plan.dontStart") },
      costCap: t("plan.price.unreachable.cap"),
      plain: t("plan.price.unreachable.plain"),
    };
  }

  const wl = m.deltaTest(low);
  const midPrice = Math.round(((m.oldPrice + m.newPrice) / 2) * 20) / 20;
  const cautious = wl < 0 ? t("plan.price.cautiousCost", { low: signedPct(low), amt: eur(-wl) }) : t("plan.price.cautiousFree", { low: signedPct(low) });
  let decisionRule: TestPlan["decisionRule"];
  let costCap: string;
  let short: string;
  let week: string;
  if (m.beV <= -1 + 1e-9) {
    decisionRule = { keep: t("plan.price.any.keep", { old: price(m.oldPrice), item }), tweak: t("plan.price.any.tweak", { item }), stop: t("plan.price.any.stop", { old: price(m.oldPrice) }) };
    costCap = t("plan.price.any.cap", { old: price(m.oldPrice) });
    short = t("plan.price.any.short");
    week = t("plan.price.check.weekAny");
  } else if (m.beV <= 0) {
    const tweakShare = m.beV * 1.5;
    decisionRule = {
      keep: t("plan.price.rise.keep", { be: pc(-m.beV), keep: num(th.keepFrom) }),
      tweak: t("plan.price.rise.tweak", { be: pc(-m.beV), tw: pc(-tweakShare), tweak: num(th.tweakFrom), keep: num(th.keepFrom), mid: price(midPrice), days: daysText }),
      stop: t("plan.price.rise.stop", { tw: pc(-tweakShare), tweak: num(th.tweakFrom), old: price(m.oldPrice) }),
    };
    costCap = t("plan.price.rise.cap", { tweak: num(th.tweakFrom), cautious });
    short = t("plan.price.rise.short", { keep: num(th.keepFrom), be: pc(-m.beV) });
    week = t("plan.price.check.weekRise", { n: num(m.beUnits), be: pc(-m.beV) });
  } else {
    const half = m.beV * 0.5;
    decisionRule = {
      keep: t("plan.price.cut.keep", { be: pc(m.beV), keep: num(th.keepFrom) }),
      tweak: t("plan.price.cut.tweak", { half: pc(half), be: pc(m.beV), tweak: num(th.tweakFrom), keep: num(th.keepFrom), mid: price(midPrice), days: daysText }),
      stop: t("plan.price.cut.stop", { half: pc(half), tweak: num(th.tweakFrom), old: price(m.oldPrice) }),
    };
    costCap = t("plan.price.cut.cap", { tweak: num(th.tweakFrom), cautious });
    short = t("plan.price.cut.short", { keep: num(th.keepFrom) });
    week = t("plan.price.check.weekCut", { n: num(m.beUnits), be: pc(m.beV) });
  }

  return {
    analysisId: a.id,
    title,
    days,
    before: [t("plan.price.before.baseline", { units: num(units) }), t("plan.price.before.change"), t("plan.price.before.alt")],
    during: [t("plan.price.during.same", { item }), t("plan.price.during.full", { days: daysText }), t("plan.price.during.honest")],
    measure: [
      { what: t("plan.price.measure.sales.what", { item }), how: t("plan.price.measure.sales.how") },
      { what: t("plan.price.measure.alt.what"), how: t("plan.price.measure.alt.how") },
      { what: t("plan.price.measure.comments.what"), how: t("plan.price.measure.comments.how") },
    ],
    checkIns: checkInDays(days, Math.min(7, days)).map((d) => ({
      day: d,
      look: d === days ? t("plan.price.check.last") : d === Math.min(7, days) ? week : t("plan.price.check.first"),
    })),
    decisionRule,
    rule: th,
    costCap,
    plain: t("plan.price.plain", { price: price(m.newPrice), days: daysText, item, units: num(units), likely: signedPct(likely), short }),
  };
}

