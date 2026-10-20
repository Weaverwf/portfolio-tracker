import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { presentHeader, presentPortfolio, sortRows } from "../calc.js";
import { applyQuotes } from "../quotes.js";
import { SAMPLE_HOLDINGS } from "../sample.js";
import {
  FILTER_KEY,
  FINNHUB_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  exportFilename,
  holdingsForView,
  isInfoTotal,
  loadFilter,
  loadState,
  parseImport,
  parseStored,
  perShareFromTotal,
  portfolioNames,
  portfolioSubtotals,
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

function sumCents(values) {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}

test("the top total sums every visible holding, including a one-row portfolio", () => {
  const mix = [
    {
      id: "ira-aaa",
      ticker: "AAA",
      portfolio: "IRA",
      shares: 10,
      costBasis: 50,
      lastPrice: 60,
      previousClose: 55,
    },
    {
      id: "ira-bbb",
      ticker: "BBB",
      portfolio: "IRA",
      shares: 4,
      costBasis: 25,
      lastPrice: 30,
      previousClose: 28,
    },
    {
      id: "solo-ccc",
      ticker: "CCC",
      portfolio: "Solo",
      shares: 2,
      costBasis: 10,
      lastPrice: 15,
      previousClose: 12,
    },
  ];
  assert.deepEqual(portfolioNames(mix), ["IRA", "Solo"]);
  assert.equal(holdingsForView(mix, "IRA").length, 2);
  assert.equal(holdingsForView(mix, "Solo").length, 1);

  const top = presentPortfolio(holdingsForView(mix, ""));
  assert.equal(top.rows.length, 3);
  assert.equal(top.totalValue, sumCents(top.rows.map((row) => row.totalValue)));
  assert.equal(top.todayDollar, sumCents(top.rows.map((row) => row.todayDollar)));
  assert.equal(top.lifeDollar, sumCents(top.rows.map((row) => row.lifeDollar)));
  assert.equal(top.totalValue, 750);
  assert.equal(top.todayDollar, 64);
  assert.equal(top.lifeDollar, 130);

  const single = top.rows.find((row) => row.holding.portfolio === "Solo");
  assert.equal(single.holding.ticker, "CCC");
  assert.equal(single.totalValue, 30);
  assert.equal(top.totalValue, 720 + single.totalValue);

  const iraSubtotal = presentPortfolio(holdingsForView(mix, "IRA")).totalValue;
  const soloSubtotal = presentPortfolio(holdingsForView(mix, "Solo")).totalValue;
  assert.equal(iraSubtotal, 720);
  assert.equal(soloSubtotal, single.totalValue);
  assert.equal(iraSubtotal + soloSubtotal, top.totalValue);
  assert.notEqual(top.totalValue, sumCents([top.totalValue, iraSubtotal, soloSubtotal]));

  const onlySolo = presentPortfolio(holdingsForView(mix, "Solo"));
  assert.equal(onlySolo.rows.length, 1);
  assert.equal(onlySolo.totalValue, onlySolo.rows[0].totalValue);
  assert.equal(onlySolo.todayDollar, onlySolo.rows[0].todayDollar);
  assert.equal(onlySolo.lifeDollar, onlySolo.rows[0].lifeDollar);

  const onlyIra = presentPortfolio(holdingsForView(mix, "IRA"));
  assert.equal(onlyIra.rows.length, 2);
  assert.equal(onlyIra.totalValue, sumCents(onlyIra.rows.map((row) => row.totalValue)));
  assert.equal(onlyIra.totalValue, 720);
  assert.equal(onlyIra.totalValue, top.totalValue - single.totalValue);
});

test("a migrated one-row portfolio is in the top total once", () => {
  const saved = JSON.stringify({
    isExample: false,
    holdings: [
      { id: "ira-a", ticker: "AAA", portfolio: "IRA", shares: 10, costBasis: 500, lastPrice: 60, previousClose: 55 },
      { id: "ira-b", ticker: "BBB", portfolio: "IRA", shares: 4, costBasis: 100, lastPrice: 30, previousClose: 28 },
      { id: "roth-c", ticker: "CCC", portfolio: "Roth IRA", shares: 5, costBasis: 150, lastPrice: 40, previousClose: 38 },
      { id: "roth-d", ticker: "DDD", portfolio: "Roth IRA", shares: 2, costBasis: 40, lastPrice: 25, previousClose: 25 },
      { id: "tax-e", ticker: "EEE", portfolio: "Taxable", shares: 2, costBasis: 20, lastPrice: 15, previousClose: 12 },
    ],
  });
  const loaded = parseStored(saved);
  assert.equal(loaded.shouldSave, true);
  assert.equal(loaded.holdings.find((row) => row.ticker === "EEE").costBasis, 10);
  assert.equal(loaded.holdings.filter((row) => row.portfolio === "Taxable").length, 1);

  const top = presentPortfolio(holdingsForView(loaded.holdings, ""));
  const rowTotal = sumCents(top.rows.map((row) => row.totalValue));
  const ira = presentPortfolio(holdingsForView(loaded.holdings, "IRA")).totalValue;
  const roth = presentPortfolio(holdingsForView(loaded.holdings, "Roth IRA")).totalValue;
  const taxable = presentPortfolio(holdingsForView(loaded.holdings, "Taxable")).totalValue;
  assert.equal(top.rows.length, 5);
  assert.equal(taxable, 30);
  assert.equal(top.totalValue, rowTotal);
  assert.equal(top.totalValue, 1000);
  assert.equal(top.todayDollar, sumCents(top.rows.map((row) => row.todayDollar)));
  assert.equal(top.lifeDollar, sumCents(top.rows.map((row) => row.lifeDollar)));
  assert.equal(ira + roth + taxable, top.totalValue);
  assert.notEqual(top.totalValue, sumCents([rowTotal, ira, roth, taxable]));
});

test("the header is the sum of portfolio subtotals, and a combined equity row is info only", () => {
  const mix = [
    { id: "aapl-ira", ticker: "AAPL", portfolio: "IRA", shares: 10, costBasis: 50, lastPrice: 60, previousClose: 55 },
    { id: "aapl-roth", ticker: "AAPL", portfolio: "Roth IRA", shares: 4, costBasis: 25, lastPrice: 60, previousClose: 55 },
    { id: "aapl-total", ticker: "AAPL", portfolio: "Total", shares: 14, costBasis: 40, lastPrice: 60, previousClose: 55 },
    { id: "eee-tax", ticker: "EEE", portfolio: "Taxable", shares: 2, costBasis: 10, lastPrice: 15, previousClose: 12 },
  ];
  assert.equal(isInfoTotal(mix[2]), true);
  assert.equal(isInfoTotal(mix[3]), false);
  assert.deepEqual(portfolioNames(mix), ["IRA", "Roth IRA", "Taxable"]);

  const subtotals = portfolioSubtotals(mix);
  assert.deepEqual(
    subtotals.map((part) => part.name),
    ["IRA", "Roth IRA", "Taxable"],
  );
  const ira = subtotals[0];
  const roth = subtotals[1];
  const taxable = subtotals[2];
  assert.deepEqual(
    ira.rows.map((row) => row.holding.ticker),
    ["AAPL"],
  );
  assert.equal(ira.rows.length, 1);
  assert.equal(ira.totalValue, 600);
  assert.equal(ira.totalValue, sumCents(ira.rows.map((row) => row.totalValue)));
  assert.equal(roth.rows.length, 1);
  assert.equal(roth.totalValue, 240);
  assert.equal(roth.totalValue, sumCents(roth.rows.map((row) => row.totalValue)));
  assert.equal(taxable.rows.length, 1);
  assert.equal(taxable.rows[0].holding.ticker, "EEE");
  assert.equal(taxable.totalValue, 30);
  assert.equal(taxable.totalValue, taxable.rows[0].totalValue);

  for (const part of subtotals) {
    assert.notEqual(part.name.toLowerCase(), "total");
    assert.ok(part.rows.every((row) => row.holding.portfolio.toLowerCase() === part.name.toLowerCase()));
    assert.ok(part.rows.every((row) => !isInfoTotal(row.holding)));
    assert.equal(part.totalValue, sumCents(part.rows.map((row) => row.totalValue)));
  }

  const header = presentHeader(subtotals);
  const holdingSum = sumCents(subtotals.flatMap((part) => part.rows.map((row) => row.totalValue)));
  assert.equal(header.totalValue, sumCents(subtotals.map((part) => part.totalValue)));
  assert.equal(header.totalValue, holdingSum);
  assert.equal(header.totalValue, 870);
  assert.equal(header.todayDollar, sumCents(subtotals.map((part) => part.todayDollar)));
  assert.equal(header.lifeDollar, sumCents(subtotals.map((part) => part.lifeDollar)));
  assert.equal(header.todayDollar, 76);
  assert.equal(header.lifeDollar, 250);
  assert.notEqual(header.totalValue, 870 + 840);

  const polluted = presentHeader([
    { ...ira, rows: ira.rows.concat([{ totalValue: 840, holding: { ticker: "AAPL", portfolio: "Total" } }]) },
    roth,
    taxable,
  ]);
  assert.equal(polluted.totalValue, 870);

  const iraOnly = portfolioSubtotals(holdingsForView(mix, "IRA"));
  assert.equal(iraOnly.length, 1);
  assert.equal(iraOnly[0].rows.length, 1);
  assert.equal(presentHeader(iraOnly).totalValue, 600);

  const sorted = sortRows(presentPortfolio(mix).rows, "total", "desc");
  assert.equal(sorted.length, 4);
  assert.equal(sorted[0].holding.portfolio, "Total");
  assert.equal(presentHeader(portfolioSubtotals(mix)).totalValue, 870);

  const updated = applyQuotes(mix, {
    AAPL: { ok: true, lastPrice: 70, previousClose: 60 },
  });
  const after = portfolioSubtotals(updated.holdings);
  const afterHeader = presentHeader(after);
  assert.equal(after.find((part) => part.name === "IRA").totalValue, 700);
  assert.equal(after.find((part) => part.name === "Roth IRA").totalValue, 280);
  assert.equal(after.find((part) => part.name === "Taxable").totalValue, 30);
  assert.equal(afterHeader.totalValue, 1010);
  assert.equal(updated.holdings.find((row) => row.portfolio === "Total").lastPrice, 70);
  assert.notEqual(afterHeader.totalValue, 1010 + 14 * 70);

  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.equal((app.match(/^\s*renderSummary\(/gm) || []).length, 1);
  assert.match(app, /const subtotals = portfolioSubtotals\(visible\)/);
  assert.match(app, /const header = presentHeader\(subtotals\)/);
  assert.match(app, /renderSummary\(header\)/);
  assert.match(app, /presented\.rows = sortRows\(presented\.rows/);
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
