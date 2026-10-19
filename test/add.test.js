import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { EMPTY_MARK, isCompleteHolding, presentHolding, presentPortfolio } from "../calc.js";
import { SAMPLE_HOLDINGS } from "../sample.js";
import {
  MESSAGES,
  STORAGE_KEY,
  addHolding,
  clearExampleData,
  isValidTicker,
  normalizeTicker,
  parseStored,
  portfolioNames,
  saveState,
  toStoredRecord,
} from "../storage.js";

function exampleState() {
  return parseStored(null);
}

function input(overrides = {}) {
  return {
    ticker: "vti",
    portfolio: "IRA",
    shares: "10",
    costBasis: "2500",
    lastPrice: "",
    previousClose: "",
    ...overrides,
  };
}

test("ticker is uppercased and limited to letters, a period, or a hyphen", () => {
  assert.equal(normalizeTicker(" vti "), "VTI");
  assert.equal(normalizeTicker("brk.b"), "BRK.B");
  assert.equal(normalizeTicker("brk-b"), "BRK-B");
  assert.equal(normalizeTicker("aa pl"), "AAPL");
  for (const symbol of ["A", "ABCDE", "BRK.B", "BRK-B", "BF.B", "AAPL"]) {
    assert.equal(isValidTicker(symbol), true, symbol);
  }
  for (const symbol of ["", "ABCDEF", "AAPL1", "123", ".AAPL", "AAPL.", "A-", "AA PLXY", "...."]) {
    assert.equal(isValidTicker(normalizeTicker(symbol)), false, symbol);
  }
});

test("the first saved holding replaces example data", () => {
  const start = exampleState();
  const result = addHolding(start, input({ ticker: "AAPL", portfolio: "IRA", shares: "1", costBasis: "$10" }), {
    id: "h1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.message, undefined);
  assert.equal(start.isExample, true);
  assert.equal(start.holdings.length, SAMPLE_HOLDINGS.length);
  assert.equal(result.state.isExample, false);
  assert.equal(result.state.holdings.length, 1);
  assert.equal(result.state.holdings[0].id, "h1");
  assert.equal(result.state.holdings[0].ticker, "AAPL");
  assert.equal(result.state.holdings[0].portfolio, "IRA");
  assert.equal(result.state.holdings[0].shares, 1);
  assert.equal(result.state.holdings[0].costBasis, 10);
  assert.equal(result.state.holdings[0].lastPrice, null);
  assert.equal(result.state.holdings[0].previousClose, null);
});

test("the same ticker is allowed in a different portfolio", () => {
  const first = addHolding(exampleState(), input({ ticker: "AAPL", portfolio: "IRA" }), { id: "h1" });
  const second = addHolding(first.state, input({ ticker: "aapl", portfolio: "Roth IRA", shares: "4", costBasis: "800" }), {
    id: "h2",
  });
  assert.equal(second.ok, true);
  assert.deepEqual(
    second.state.holdings.map((row) => [row.ticker, row.portfolio]),
    [
      ["AAPL", "IRA"],
      ["AAPL", "Roth IRA"],
    ],
  );
  assert.equal(first.state.holdings.length, 1);
});

test("the same ticker and portfolio is refused with a plain message", () => {
  const first = addHolding(exampleState(), input({ ticker: "VTI", portfolio: "Roth IRA" }), { id: "h1" });
  const again = addHolding(first.state, input({ ticker: "vti", portfolio: "  roth   ira " }));
  assert.equal(again.ok, false);
  assert.equal(again.field, "portfolio");
  assert.equal(again.message, "VTI is already in Roth IRA.");
  assert.equal(first.state.holdings.length, 1);
});

test("blank prices are stored as null and shown as a dash", () => {
  const result = addHolding(exampleState(), input({ costBasis: "$2,500.00", shares: "1,000.5" }), { id: "h1" });
  assert.equal(result.ok, true);
  assert.equal(result.state.holdings[0].shares, 1000.5);
  assert.equal(result.state.holdings[0].costBasis, 2500);
  const row = presentHolding(result.state.holdings[0]);
  assert.equal(row.sharesText, "1,000.5");
  assert.equal(row.costBasisText, "$2,500.00");
  assert.equal(row.todayPercentText, EMPTY_MARK);
  assert.equal(row.todayDollarText, EMPTY_MARK);
  assert.equal(row.lifePercentText, EMPTY_MARK);
  assert.equal(row.lifeDollarText, EMPTY_MARK);
  assert.equal(row.totalValueText, EMPTY_MARK);
  assert.equal(isCompleteHolding(result.state.holdings[0]), true);
});

test("a last price without a previous close fills Life and Total only", () => {
  const row = presentHolding({
    ticker: "VTI",
    portfolio: "IRA",
    shares: 10,
    costBasis: 2500,
    lastPrice: 260,
    previousClose: null,
  });
  assert.equal(row.totalValue, 2600);
  assert.equal(row.lifeDollar, 100);
  assert.equal(row.totalValueText, "$2,600.00");
  assert.equal(row.lifeDollarText, "+$100.00");
  assert.equal(row.todayDollar, null);
  assert.equal(row.todayPercentText, EMPTY_MARK);
  assert.equal(row.todayDollarText, EMPTY_MARK);
});

test("an entered zero previous close still has no percent", () => {
  const row = presentHolding({
    shares: 10,
    costBasis: 40,
    lastPrice: 5,
    previousClose: 0,
  });
  assert.equal(row.totalValueText, "$50.00");
  assert.equal(row.todayDollar, 50);
  assert.equal(row.todayPercentText, "n/a");
  assert.notEqual(row.todayPercentText, EMPTY_MARK);
});

test("totals stay a dash until every row has the price that total needs", () => {
  const mixed = presentPortfolio([
    { ticker: "VTI", portfolio: "IRA", shares: 10, costBasis: 2500, lastPrice: null, previousClose: null },
    { ticker: "VTI", portfolio: "Roth IRA", shares: 2, costBasis: 10, lastPrice: 10, previousClose: 8 },
  ]);
  assert.equal(mixed.rows[0].totalValueText, EMPTY_MARK);
  assert.equal(mixed.rows[1].totalValueText, "$20.00");
  assert.equal(mixed.totalValue, null);
  assert.equal(mixed.totalValueText, EMPTY_MARK);
  assert.equal(mixed.todayDollarText, EMPTY_MARK);
  assert.equal(mixed.lifeDollarText, EMPTY_MARK);

  const missingClose = presentPortfolio([
    { ticker: "VTI", portfolio: "IRA", shares: 10, costBasis: 100, lastPrice: 12, previousClose: null },
    { ticker: "VTI", portfolio: "Roth IRA", shares: 2, costBasis: 50, lastPrice: 20, previousClose: 25 },
  ]);
  assert.equal(missingClose.totalValue, 160);
  assert.equal(missingClose.lifeDollar, 10);
  assert.equal(missingClose.todayDollar, null);
  assert.equal(missingClose.todayPercentText, EMPTY_MARK);
  assert.equal(missingClose.lifeDollarText, "+$10.00");

  const both = presentPortfolio([
    { ticker: "VTI", portfolio: "IRA", shares: 10, costBasis: 100, lastPrice: 12, previousClose: 10 },
    { ticker: "VTI", portfolio: "Roth IRA", shares: 2, costBasis: 50, lastPrice: 20, previousClose: 25 },
  ]);
  assert.equal(both.totalValue, 160);
  assert.equal(both.todayDollar, 10);
  assert.equal(both.lifeDollar, 10);
  assert.equal(both.todayPercentText, "+6.67%");
  assert.equal(both.lifePercentText, "+6.67%");
});

test("bad numbers are refused and do not overwrite a saved row", () => {
  const start = exampleState();
  const cases = [
    [input({ ticker: "TOOLONG" }), "ticker", MESSAGES.ticker],
    [input({ portfolio: "   " }), "portfolio", MESSAGES.portfolio],
    [input({ portfolio: "I".repeat(41) }), "portfolio", MESSAGES.portfolioLong],
    [input({ shares: "0" }), "shares", MESSAGES.shares],
    [input({ shares: "-2" }), "shares", MESSAGES.shares],
    [input({ shares: "many" }), "shares", MESSAGES.shares],
    [input({ costBasis: "" }), "costBasis", MESSAGES.cost],
    [input({ costBasis: "-5" }), "costBasis", MESSAGES.cost],
    [input({ lastPrice: "soon" }), "lastPrice", MESSAGES.lastPrice],
    [input({ lastPrice: "-1" }), "lastPrice", MESSAGES.lastPrice],
    [input({ previousClose: "nope" }), "previousClose", MESSAGES.previousClose],
  ];
  for (const [fields, field, message] of cases) {
    const result = addHolding(start, fields);
    assert.equal(result.ok, false, message);
    assert.equal(result.field, field, message);
    assert.equal(result.message, message);
  }
  assert.equal(start.isExample, true);

  const broken = parseStored("{");
  const refused = addHolding(broken, input());
  assert.equal(refused.ok, false);
  assert.equal(refused.message, MESSAGES.unreadable);
});

test("clear example data leaves an empty real portfolio", () => {
  const cleared = clearExampleData(exampleState());
  assert.equal(cleared.ok, true);
  assert.equal(cleared.state.isExample, false);
  assert.deepEqual(cleared.state.holdings, []);
  const loaded = parseStored(JSON.stringify(toStoredRecord(cleared.state)));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.isExample, false);
  assert.deepEqual(loaded.holdings, []);
  assert.equal(clearExampleData(cleared.state).message, MESSAGES.noExample);
  assert.equal(clearExampleData(parseStored("{")).message, MESSAGES.unreadable);
});

test("portfolio suggestions follow the rows already stored", () => {
  assert.deepEqual(portfolioNames(SAMPLE_HOLDINGS), ["IRA", "Roth IRA", "Taxable"]);
  const added = addHolding(exampleState(), input({ portfolio: "Trust" }), { id: "h1" });
  assert.deepEqual(portfolioNames(added.state.holdings), ["Trust"]);
});

test("a saved holding round-trips through storage with null prices", () => {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
  try {
    const added = addHolding(
      exampleState(),
      input({ lastPrice: "228.5", previousClose: "225" }),
      { id: "h-round" },
    );
    saveState(added.state);
    const loaded = parseStored(store.get(STORAGE_KEY));
    assert.equal(loaded.isExample, false);
    assert.equal(loaded.shouldSave, false);
    assert.equal(loaded.holdings[0].id, "h-round");
    assert.equal(loaded.holdings[0].lastPrice, 228.5);
    assert.equal(loaded.holdings[0].previousClose, 225);
    const row = presentHolding(loaded.holdings[0]);
    assert.equal(row.totalValue, 2285);
    assert.equal(row.todayDollar, 35);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("a holding with no price is still a complete row", () => {
  assert.equal(
    isCompleteHolding({
      ticker: "VTI",
      portfolio: "IRA",
      shares: 1,
      costBasis: 1,
      lastPrice: null,
      previousClose: null,
    }),
    true,
  );
  assert.equal(
    isCompleteHolding({
      ticker: "VTI",
      portfolio: "IRA",
      shares: 1,
      costBasis: 1,
      lastPrice: "soon",
      previousClose: null,
    }),
    false,
  );
});

test("the page offers clear example data and a device-only quote update", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(html, /Clear example data/);
  assert.match(html, /id="add-form"/);
  assert.match(html, /name="lastPrice"/);
  assert.match(html, /name="previousClose"/);
  assert.match(html, /Delete holding/);
  assert.match(html, /Keep it/);
  assert.match(app, /clearExampleData/);
  assert.match(app, /addHolding/);
  assert.match(app, /updateHolding/);
  assert.match(app, /deleteHolding/);
  assert.match(app, /Paste your Finnhub key to update prices/);
  assert.match(app, /updateQuotes/);
  assert.doesNotMatch(app, /Live prices are not available/);
  assert.doesNotMatch(app, /Adding a holding by ticker is not available/);
  assert.doesNotMatch(app, /is not available in this version/);
  assert.match(sw, /const CACHE = "portfolio-v4"/);
  assert.match(sw, /\.\/quotes\.js/);
  const fetchAt = sw.indexOf('addEventListener("fetch"');
  const finnhubAt = sw.indexOf("finnhub.io", fetchAt);
  const cacheAt = sw.indexOf("caches.open", fetchAt);
  assert.ok(finnhubAt > fetchAt && finnhubAt < cacheAt);
  assert.equal(existsSync(new URL("../.nojekyll", import.meta.url)), true);
  assert.equal(existsSync(new URL("../portfolio-tracker/index.html", import.meta.url)), false);
  assert.equal(existsSync(new URL("../portfolio-tracker.zip", import.meta.url)), false);
});
