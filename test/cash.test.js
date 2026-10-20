import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_MARK, isCompleteHolding, presentHeader, presentHolding, presentPortfolio } from "../calc.js";
import { uniqueTickers, updateQuotes } from "../quotes.js";
import {
  addHolding,
  parseImport,
  parseStored,
  portfolioNames,
  portfolioSubtotals,
  toExportRecord,
  updateHolding,
} from "../storage.js";

const empty = { ok: true, isExample: false, holdings: [] };

function cash(portfolio, amount) {
  return addHolding(empty, { kind: "cash", portfolio, amount }).holding;
}

test("cash is an amount in a portfolio, and the ticker CASH stays a stock", () => {
  const saved = addHolding(empty, { kind: "cash", portfolio: "IRA", amount: "40" });
  assert.equal(saved.ok, true);
  assert.deepEqual(
    { kind: saved.holding.kind, portfolio: saved.holding.portfolio, amount: saved.holding.amount, ticker: saved.holding.ticker },
    { kind: "cash", portfolio: "IRA", amount: 40, ticker: undefined },
  );

  const stock = addHolding(saved.state, {
    ticker: "CASH",
    portfolio: "IRA",
    shares: 2,
    costBasis: 10,
    lastPrice: 15,
    previousClose: 12,
  });
  assert.equal(stock.ok, true);
  assert.equal(stock.holding.ticker, "CASH");
  assert.equal(stock.holding.kind, undefined);

  const again = addHolding(stock.state, { kind: "cash", portfolio: "IRA", amount: 5 });
  assert.equal(again.ok, false);
  assert.equal(again.message, "Cash is already in IRA.");

  const other = addHolding(stock.state, { kind: "cash", portfolio: "Cash", amount: 200 });
  assert.equal(other.ok, true);
  assert.equal(other.holding.portfolio, "Cash");
});

test("a cash row shows the amount and leaves shares, cost, today, and life blank", () => {
  const row = presentHolding(cash("IRA", 40));
  assert.equal(row.totalValue, 40);
  assert.equal(row.totalValueText, "$40.00");
  assert.equal(row.sharesText, EMPTY_MARK);
  assert.equal(row.costBasisText, EMPTY_MARK);
  assert.equal(row.todayDollarText, EMPTY_MARK);
  assert.equal(row.lifeDollarText, EMPTY_MARK);
  assert.equal(isCompleteHolding({ kind: "cash", portfolio: "IRA", amount: 40 }), true);
  assert.equal(isCompleteHolding({ kind: "cash", portfolio: "IRA" }), false);
});

test("cash counts in its portfolio subtotal and the header, and a combined row still does not", () => {
  const holdings = [
    { id: "aapl", ticker: "AAPL", portfolio: "IRA", shares: 10, costBasis: 50, lastPrice: 60, previousClose: 55 },
    { id: "settle", kind: "cash", portfolio: "IRA", amount: 40 },
    { id: "book", kind: "cash", portfolio: "Cash", amount: 200 },
    { id: "stock", ticker: "CASH", portfolio: "Taxable", shares: 2, costBasis: 10, lastPrice: 15, previousClose: 12 },
    { id: "info", ticker: "AAPL", portfolio: "Total", shares: 10, costBasis: 50, lastPrice: 60, previousClose: 55 },
  ];
  assert.deepEqual(portfolioNames(holdings), ["IRA", "Cash", "Taxable"]);

  const subtotals = portfolioSubtotals(holdings);
  const ira = subtotals.find((part) => part.name === "IRA");
  const book = subtotals.find((part) => part.name === "Cash");
  const taxable = subtotals.find((part) => part.name === "Taxable");
  assert.equal(ira.rows.length, 2);
  assert.equal(ira.totalValue, 640);
  assert.equal(ira.todayDollar, 50);
  assert.equal(book.rows.length, 1);
  assert.equal(book.totalValue, 200);
  assert.equal(book.todayDollarText, EMPTY_MARK);
  assert.equal(book.lifeDollarText, EMPTY_MARK);
  assert.equal(taxable.totalValue, 30);
  assert.equal(taxable.rows[0].holding.ticker, "CASH");

  const header = presentHeader(subtotals);
  assert.equal(header.totalValue, 870);
  assert.equal(header.totalValue, 640 + 200 + 30);
  assert.equal(header.todayDollar, 56);
  assert.equal(header.lifeDollar, 110);
  assert.notEqual(header.totalValue, 870 + 600);

  const flat = presentPortfolio([
    { ticker: "FLAT", portfolio: "IRA", shares: 4, costBasis: 10, lastPrice: 10, previousClose: 10 },
  ]);
  assert.equal(flat.todayDollarText, "+$0.00");
});

test("editing cash changes the amount and keeps it out of another portfolio's cash", () => {
  const first = addHolding(empty, { kind: "cash", portfolio: "IRA", amount: 40 });
  const second = addHolding(first.state, { kind: "cash", portfolio: "Cash", amount: 200 });
  const edited = updateHolding(second.state, first.holding.id, { portfolio: "IRA", amount: "75.5" });
  assert.equal(edited.ok, true);
  assert.equal(edited.holding.amount, 75.5);
  assert.equal(edited.holding.kind, "cash");

  const moved = updateHolding(second.state, first.holding.id, { portfolio: "Cash", amount: 40 });
  assert.equal(moved.ok, false);
  assert.equal(moved.message, "Cash is already in Cash.");
});

test("update skips cash and still quotes the ticker CASH", async () => {
  const holdings = [
    { id: "settle", kind: "cash", portfolio: "IRA", amount: 40, ticker: "SKIP" },
    { id: "stock", ticker: "CASH", portfolio: "Taxable", shares: 2, costBasis: 10, lastPrice: 15, previousClose: 12 },
    { id: "book", kind: "cash", portfolio: "Cash", amount: 200 },
  ];
  assert.deepEqual(uniqueTickers(holdings), ["CASH"]);
  assert.deepEqual(uniqueTickers([{ kind: "cash", portfolio: "Cash", amount: 200 }]), []);

  const seen = [];
  const result = await updateQuotes({
    holdings,
    apiKey: "test-token",
    gapMs: 0,
    sleep: async () => {},
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      seen.push(url.searchParams.get("symbol"));
      return {
        ok: true,
        json: async () => ({ c: 20, pc: 15 }),
      };
    },
  });
  assert.deepEqual(seen, ["CASH"]);
  const cashRow = result.holdings.find((row) => row.id === "settle");
  const book = result.holdings.find((row) => row.id === "book");
  const stock = result.holdings.find((row) => row.id === "stock");
  assert.equal(cashRow.amount, 40);
  assert.equal(cashRow.lastPrice, undefined);
  assert.equal(book.amount, 200);
  assert.equal(stock.lastPrice, 20);
  assert.equal(stock.previousClose, 15);
});

test("cash round-trips through export, and an older equity file is unchanged", () => {
  const saved = addHolding(empty, { kind: "cash", portfolio: "Cash", amount: 200 });
  const withStock = addHolding(saved.state, {
    ticker: "CASH",
    portfolio: "Taxable",
    shares: 2,
    costBasis: 10,
    lastPrice: 15,
    previousClose: 12,
  });
  const file = toExportRecord(withStock.state);
  const cashRow = file.holdings.find((row) => row.kind === "cash");
  const stockRow = file.holdings.find((row) => row.ticker === "CASH");
  assert.equal(cashRow.amount, 200);
  assert.equal(cashRow.portfolio, "Cash");
  assert.equal(cashRow.ticker, undefined);
  assert.equal(stockRow.kind, undefined);
  assert.equal(JSON.stringify(file).includes("finnhub"), false);

  const back = parseImport(JSON.stringify(file));
  assert.equal(back.ok, true);
  assert.equal(back.count, 2);
  assert.equal(back.holdings.find((row) => row.kind === "cash").amount, 200);
  assert.equal(back.holdings.find((row) => row.ticker === "CASH").shares, 2);

  const older = {
    schema: 2,
    isExample: false,
    holdings: [{ id: "a", ticker: "AAPL", portfolio: "IRA", shares: 10, costBasis: 50, lastPrice: 60, previousClose: 55 }],
  };
  const loaded = parseStored(JSON.stringify(older));
  assert.deepEqual(loaded.holdings, older.holdings);
  assert.equal(loaded.holdings[0].kind, undefined);
});
