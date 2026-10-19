import assert from "node:assert/strict";
import test from "node:test";
import {
  computeHolding,
  formatMoney,
  formatPercent,
  presentPortfolio,
  roundCents,
} from "../calc.js";
import { SAMPLE_HOLDINGS } from "../sample.js";

// Hand totals for the example rows:
// AAPL IRA:      40 × 228.50 = 9140.00; today 40 × 3.50 = 140.00; life 9140 − 5200 = 3940
// AAPL Roth IRA: 15 × 228.50 = 3427.50; today 15 × 3.50 = 52.50;  life 3427.50 − 2100 = 1327.50
// MSFT IRA:      25 × 415.20 = 10380;   today 25 × −4.80 = −120;   life 10380 − 7800 = 2580
// VXUS Taxable:  100 × 62.40 = 6240;    today 100 × 0.60 = 60;     life 6240 − 6500 = −260
// INTC Roth IRA: 80 × 23.10 = 1848;     today 80 × −0.75 = −60;    life 1848 − 3200 = −1352
// Portfolio: value 31035.50, today +72.50, life +6235.50, cost 24800, previous value 30963

test("AAPL in the IRA", () => {
  const row = computeHolding(SAMPLE_HOLDINGS[0]);
  assert.equal(row.totalValue, 9140);
  assert.equal(row.todayDollar, 140);
  assert.equal(row.lifeDollar, 3940);
  assert.equal(formatPercent(row.todayPercent), "+1.56%");
  assert.equal(formatPercent(row.lifePercent), "+75.77%");
  assert.equal(formatMoney(row.todayDollar, { signed: true }), "+$140.00");
  assert.equal(formatMoney(row.lifeDollar, { signed: true }), "+$3,940.00");
  assert.equal(formatMoney(row.totalValue), "$9,140.00");
});

test("AAPL in the Roth IRA uses the same prices and a different share count", () => {
  const ira = computeHolding(SAMPLE_HOLDINGS[0]);
  const roth = computeHolding(SAMPLE_HOLDINGS[1]);
  assert.equal(roth.totalValue, 3427.5);
  assert.equal(roth.todayDollar, 52.5);
  assert.equal(roth.lifeDollar, 1327.5);
  assert.equal(formatPercent(roth.todayPercent), formatPercent(ira.todayPercent));
  assert.equal(formatPercent(roth.lifePercent), "+63.21%");
  assert.notEqual(roth.todayDollar, ira.todayDollar);
});

test("MSFT is down today and up from cost basis", () => {
  const row = computeHolding(SAMPLE_HOLDINGS[2]);
  assert.equal(row.totalValue, 10380);
  assert.equal(row.todayDollar, -120);
  assert.equal(row.lifeDollar, 2580);
  assert.equal(formatPercent(row.todayPercent), "-1.14%");
  assert.equal(formatPercent(row.lifePercent), "+33.08%");
  assert.equal(formatMoney(row.todayDollar, { signed: true }), "-$120.00");
});

test("VXUS is up today and down from cost basis", () => {
  const row = computeHolding(SAMPLE_HOLDINGS[3]);
  assert.equal(row.totalValue, 6240);
  assert.equal(row.todayDollar, 60);
  assert.equal(row.lifeDollar, -260);
  assert.equal(formatPercent(row.todayPercent), "+0.97%");
  assert.equal(formatPercent(row.lifePercent), "-4.00%");
  assert.equal(formatMoney(row.lifeDollar, { signed: true }), "-$260.00");
});

test("INTC is down today and down from cost basis", () => {
  const row = computeHolding(SAMPLE_HOLDINGS[4]);
  assert.equal(row.totalValue, 1848);
  assert.equal(row.todayDollar, -60);
  assert.equal(row.lifeDollar, -1352);
  assert.equal(formatPercent(row.todayPercent), "-3.14%");
  assert.equal(formatPercent(row.lifePercent), "-42.25%");
});

test("example portfolio totals", () => {
  const portfolio = presentPortfolio(SAMPLE_HOLDINGS);
  assert.equal(portfolio.totalValue, 31035.5);
  assert.equal(portfolio.todayDollar, 72.5);
  assert.equal(portfolio.lifeDollar, 6235.5);
  assert.equal(portfolio.costBasis, 24800);
  assert.equal(portfolio.previousValue, 30963);
  assert.equal(portfolio.totalValueText, "$31,035.50");
  assert.equal(portfolio.todayDollarText, "+$72.50");
  assert.equal(portfolio.todayPercentText, "+0.23%");
  assert.equal(portfolio.lifeDollarText, "+$6,235.50");
  assert.equal(portfolio.lifePercentText, "+25.14%");
  assert.equal(portfolio.todaySign, "gain");
  assert.equal(portfolio.lifeSign, "gain");
  assert.deepEqual(
    portfolio.rows.map((row) => [row.todaySign, row.lifeSign]),
    [
      ["gain", "gain"],
      ["gain", "gain"],
      ["loss", "gain"],
      ["gain", "loss"],
      ["loss", "loss"],
    ],
  );
});

test("displayed row dollars add up to the portfolio dollars", () => {
  const portfolio = presentPortfolio(SAMPLE_HOLDINGS);
  const sum = (key) => roundCents(portfolio.rows.reduce((total, row) => total + row[key], 0));
  assert.equal(sum("totalValue"), portfolio.totalValue);
  assert.equal(sum("todayDollar"), portfolio.todayDollar);
  assert.equal(sum("lifeDollar"), portfolio.lifeDollar);
});

test("a zero previous close or cost basis has no percent", () => {
  const noClose = computeHolding({
    shares: 10,
    costBasis: 40,
    lastPrice: 5,
    previousClose: 0,
  });
  assert.equal(noClose.totalValue, 50);
  assert.equal(noClose.todayDollar, 50);
  assert.equal(noClose.todayPercent, null);
  assert.equal(formatPercent(noClose.todayPercent), "n/a");
  assert.equal(formatPercent(noClose.lifePercent), "+25.00%");

  const noCost = computeHolding({
    shares: 10,
    costBasis: 0,
    lastPrice: 5,
    previousClose: 4,
  });
  assert.equal(noCost.todayDollar, 10);
  assert.equal(formatPercent(noCost.todayPercent), "+25.00%");
  assert.equal(noCost.lifeDollar, 50);
  assert.equal(noCost.lifePercent, null);
  assert.equal(formatPercent(noCost.lifePercent), "n/a");
});

test("fractional shares", () => {
  const row = computeHolding({
    shares: 2.5,
    costBasis: 20,
    lastPrice: 10,
    previousClose: 8,
  });
  assert.equal(row.totalValue, 25);
  assert.equal(row.todayDollar, 5);
  assert.equal(row.lifeDollar, 5);
  assert.equal(formatPercent(row.todayPercent), "+25.00%");
  assert.equal(formatPercent(row.lifePercent), "+25.00%");
});

test("a flat change keeps a plus sign and is not a gain or a loss", () => {
  const row = computeHolding({
    shares: 4,
    costBasis: 40,
    lastPrice: 10,
    previousClose: 10,
  });
  assert.equal(row.todayDollar, 0);
  assert.equal(formatMoney(row.todayDollar, { signed: true }), "+$0.00");
  assert.equal(formatPercent(row.todayPercent), "+0.00%");
});

test("rejects numbers that are not finite", () => {
  assert.throws(() => computeHolding({ shares: "nope", costBasis: 1, lastPrice: 1, previousClose: 1 }));
});
