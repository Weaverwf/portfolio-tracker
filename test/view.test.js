import assert from "node:assert/strict";
import test from "node:test";
import { presentPortfolio, sortRows } from "../calc.js";
import { SAMPLE_HOLDINGS } from "../sample.js";
import {
  FILTER_KEY,
  FINNHUB_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  exportFilename,
  holdingsForView,
  loadFilter,
  loadState,
  parseImport,
  parseStored,
  perShareFromTotal,
  portfolioNames,
  replaceHoldings,
  saveFilter,
  toExportRecord,
  toStoredRecord,
} from "../storage.js";

function presented(holdings = SAMPLE_HOLDINGS) {
  return presentPortfolio(holdings).rows;
}

test("All keeps every portfolio and a chip limits the rows and the total", () => {
  assert.deepEqual(portfolioNames(SAMPLE_HOLDINGS), ["IRA", "Roth IRA", "Taxable"]);
  assert.equal(holdingsForView(SAMPLE_HOLDINGS, "").length, 5);
  assert.equal(holdingsForView(SAMPLE_HOLDINGS, "all").length, 5);
  const ira = holdingsForView(SAMPLE_HOLDINGS, "ira");
  assert.deepEqual(
    ira.map((row) => row.ticker),
    ["AAPL", "MSFT"],
  );
  const totals = presentPortfolio(ira);
  assert.equal(totals.totalValue, 19520);
  assert.equal(totals.todayDollar, 20);
  assert.equal(totals.lifeDollar, 6520);
  assert.equal(totals.todayPercentText, "+0.10%");
  assert.equal(totals.lifePercentText, "+50.15%");
  assert.equal(totals.totalValueText, "$19,520.00");

  const roth = presentPortfolio(holdingsForView(SAMPLE_HOLDINGS, "Roth IRA"));
  assert.equal(roth.totalValue, 5275.5);
  assert.equal(roth.todayDollar, -7.5);
  assert.equal(roth.lifeDollar, -24.5);
  assert.equal(roth.todayPercentText, "-0.14%");
  assert.equal(roth.lifePercentText, "-0.46%");

  const taxable = presentPortfolio(holdingsForView(SAMPLE_HOLDINGS, "Taxable"));
  assert.equal(taxable.totalValueText, "$6,240.00");
  assert.equal(taxable.todayDollarText, "+$60.00");
  assert.equal(taxable.lifeDollarText, "-$260.00");

  const grand = presentPortfolio(SAMPLE_HOLDINGS);
  assert.equal(grand.totalValue, 19520 + 5275.5 + 6240);
});

test("column sort orders ticker, total, today, and life, and keeps blanks last", () => {
  const rows = presented();
  assert.deepEqual(
    sortRows(rows, "ticker", "asc").map((row) => `${row.holding.ticker}:${row.holding.portfolio}`),
    ["AAPL:IRA", "AAPL:Roth IRA", "INTC:Roth IRA", "MSFT:IRA", "VXUS:Taxable"],
  );
  assert.equal(sortRows(rows, "ticker", "desc")[0].holding.ticker, "VXUS");

  assert.deepEqual(
    sortRows(rows, "total", "desc").map((row) => row.totalValue),
    [10380, 9140, 6240, 3427.5, 1848],
  );
  assert.equal(sortRows(rows, "total", "asc")[0].totalValue, 1848);

  const byToday = sortRows(rows, "today", "desc").map((row) => row.holding.ticker);
  assert.deepEqual(byToday.slice(0, 2), ["AAPL", "AAPL"]);
  assert.equal(byToday.at(-1), "INTC");

  const byLife = sortRows(rows, "life", "asc").map((row) => row.holding.ticker);
  assert.equal(byLife[0], "INTC");
  assert.equal(byLife.at(-1), "AAPL");

  const blank = presentPortfolio([
    { ...SAMPLE_HOLDINGS[0], lastPrice: null },
    SAMPLE_HOLDINGS[2],
  ]).rows;
  assert.equal(sortRows(blank, "total", "desc")[0].holding.ticker, "MSFT");
  assert.equal(sortRows(blank, "total", "asc")[0].holding.ticker, "MSFT");
  assert.equal(sortRows(blank, "today", "desc").at(-1).holding.ticker, "AAPL");
});

test("the remembered portfolio is separate from the holdings file", () => {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
  try {
    assert.equal(saveFilter(" Roth IRA "), "Roth IRA");
    assert.equal(loadFilter(), "Roth IRA");
    assert.equal(store.get(FILTER_KEY), "Roth IRA");
    assert.equal(saveFilter("All"), "");
    assert.equal(store.has(FILTER_KEY), false);
    saveFilter("IRA");
    const record = toStoredRecord({ isExample: false, holdings: SAMPLE_HOLDINGS });
    assert.equal(JSON.stringify(record).includes(FILTER_KEY), false);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("export is a dated holdings file and leaves the key behind", () => {
  const record = toExportRecord({
    isExample: true,
    updatedAt: "2026-10-19T18:45:00.000Z",
    holdings: SAMPLE_HOLDINGS.map((row) => ({ ...row, apiKey: "test-token" })),
  });
  assert.deepEqual(Object.keys(record).sort(), ["holdings", "updatedAt", "version"]);
  assert.equal(record.version, 2);
  assert.deepEqual(Object.keys(record.holdings[0]).sort(), [
    "costBasis",
    "id",
    "lastPrice",
    "portfolio",
    "previousClose",
    "shares",
    "ticker",
  ]);
  const text = JSON.stringify(record);
  assert.equal(text.includes("test-token"), false);
  assert.equal(text.includes("finnhub"), false);
  assert.equal(text.includes(FINNHUB_KEY), false);
  assert.equal(exportFilename(new Date(2026, 9, 19, 7, 45)), "portfolio-holdings-2026-10-19.json");

  const imported = parseImport(text);
  assert.equal(imported.ok, true);
  assert.equal(imported.count, 5);
  assert.equal(imported.updatedAt, "2026-10-19T18:45:00.000Z");
  assert.equal(imported.holdings[0].ticker, "AAPL");
  assert.equal(imported.holdings[0].costBasis, 130);
  assert.equal(imported.holdings[0].lastPrice, 228.5);
  const replaced = replaceHoldings({ ok: true, isExample: true, holdings: [], persisted: true }, imported.holdings, imported.updatedAt);
  assert.equal(replaced.state.isExample, false);
  assert.equal(replaced.state.holdings.length, 5);
  const stored = JSON.stringify(toStoredRecord(replaced.state));
  assert.equal(stored.includes("test-token"), false);
  assert.equal(stored.includes(FINNHUB_KEY), false);
  assert.equal(stored.includes(STORAGE_KEY), false);
});

test("import checks the file and does not replace it on its own", () => {
  assert.equal(parseImport("{").message, "This file could not be read.");
  assert.equal(parseImport("[]").message, "This file has no holdings.");
  assert.equal(parseImport('{"note":true}').message, "This file does not contain holdings.");
  const bad = parseImport(JSON.stringify({ holdings: [{ ticker: "TOOLONG", portfolio: "IRA", shares: 1, costBasis: 1 }] }));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /TOOLONG could not be read/);
  const duplicate = parseImport(
    JSON.stringify({
      holdings: [
        { ticker: "AAPL", portfolio: "IRA", shares: 1, costBasis: 1, lastPrice: 2, previousClose: 2 },
        { ticker: "aapl", portfolio: "ira", shares: 3, costBasis: 4, lastPrice: 5, previousClose: 5 },
      ],
    }),
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.message, "AAPL is already in IRA.");
  const withKey = parseImport(
    JSON.stringify({
      apiKey: "test-token",
      token: "test-token",
      holdings: [{ ticker: "VTI", portfolio: "IRA", shares: "2", costBasis: "10" }],
    }),
  );
  assert.equal(withKey.ok, true);
  assert.equal(withKey.count, 1);
  assert.equal(JSON.stringify(withKey.holdings).includes("test-token"), false);
  assert.equal(withKey.holdings[0].lastPrice, null);
});

test("a saved total cost is converted once", () => {
  assert.equal(perShareFromTotal(500, 0), 500);
  assert.equal(perShareFromTotal(5200, 40), 130);
  const old = JSON.stringify({
    isExample: false,
    holdings: [
      {
        id: "mine",
        ticker: "VTI",
        portfolio: "IRA",
        shares: 10,
        costBasis: 500,
        lastPrice: 60,
        previousClose: 55,
      },
    ],
  });
  const first = parseStored(old);
  assert.equal(first.shouldSave, true);
  assert.equal(first.schema, SCHEMA_VERSION);
  assert.equal(first.holdings[0].costBasis, 50);
  const again = parseStored(JSON.stringify(toStoredRecord(first)));
  assert.equal(again.shouldSave, false);
  assert.equal(again.holdings[0].costBasis, 50);

  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
  try {
    store.set(STORAGE_KEY, old);
    const loaded = loadState();
    assert.equal(loaded.holdings[0].costBasis, 50);
    assert.equal(loaded.persisted, true);
    const second = loadState();
    assert.equal(second.holdings[0].costBasis, 50);
    assert.equal(JSON.parse(store.get(STORAGE_KEY)).schema, SCHEMA_VERSION);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("an old export is converted and a new export is read as per share", () => {
  const oldFile = parseImport(
    JSON.stringify({
      holdings: [
        { ticker: "VTI", portfolio: "IRA", shares: 10, costBasis: 500, lastPrice: 60, previousClose: 55 },
      ],
    }),
  );
  assert.equal(oldFile.ok, true);
  assert.equal(oldFile.holdings[0].costBasis, 50);
  const row = presentPortfolio(oldFile.holdings).rows[0];
  assert.equal(row.lifeDollar, 100);
  assert.equal(row.lifePercentText, "+20.00%");

  const current = parseImport(
    JSON.stringify({
      version: 2,
      holdings: [
        { ticker: "VTI", portfolio: "IRA", shares: 10, costBasis: 50, lastPrice: 60, previousClose: 55 },
      ],
    }),
  );
  assert.equal(current.holdings[0].costBasis, 50);
  assert.equal(presentPortfolio(current.holdings).lifeDollar, 100);
});
