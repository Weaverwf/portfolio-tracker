import assert from "node:assert/strict";
import test from "node:test";
import { presentHolding } from "../calc.js";
import { SAMPLE_HOLDINGS } from "../sample.js";
import { MESSAGES, addHolding, deleteHolding, parseStored, updateHolding } from "../storage.js";

function savedState() {
  const first = addHolding(parseStored(null), {
    ticker: "AAPL",
    portfolio: "IRA",
    shares: "40",
    costBasis: "5200",
    lastPrice: "228.5",
    previousClose: "225",
  }, { id: "aapl-ira" });
  return addHolding(first.state, {
    ticker: "AAPL",
    portfolio: "Roth IRA",
    shares: "15",
    costBasis: "2100",
    lastPrice: "228.5",
    previousClose: "225",
  }, { id: "aapl-roth" }).state;
}

test("edit keeps the ticker and updates the other fields", () => {
  const start = savedState();
  const result = updateHolding(start, "aapl-ira", {
    ticker: "MSFT",
    portfolio: "IRA",
    shares: "41",
    costBasis: "5300",
    lastPrice: "",
    previousClose: "",
  });
  assert.equal(result.ok, true);
  assert.equal(result.holding.ticker, "AAPL");
  assert.equal(result.holding.id, "aapl-ira");
  assert.equal(result.holding.shares, 41);
  assert.equal(result.holding.costBasis, 5300);
  assert.equal(result.holding.lastPrice, null);
  assert.equal(result.holding.previousClose, null);
  assert.equal(result.state.holdings.length, 2);
  assert.equal(result.state.holdings[1].id, "aapl-roth");
  assert.equal(start.holdings[0].shares, 40);
  const row = presentHolding(result.holding);
  assert.equal(row.totalValueText, "—");
  assert.equal(row.sharesText, "41");
});

test("saving the same portfolio is not treated as a duplicate", () => {
  const start = savedState();
  const result = updateHolding(start, "aapl-ira", {
    portfolio: " ira ",
    shares: "40",
    costBasis: "5200",
    lastPrice: "228.5",
    previousClose: "225",
  });
  assert.equal(result.ok, true);
  assert.equal(result.holding.portfolio, "ira");
  assert.equal(result.state.holdings.length, 2);
});

test("moving a ticker into a portfolio that already has it is refused", () => {
  const start = savedState();
  const result = updateHolding(start, "aapl-ira", {
    portfolio: "roth ira",
    shares: "40",
    costBasis: "5200",
    lastPrice: "228.5",
    previousClose: "225",
  });
  assert.equal(result.ok, false);
  assert.equal(result.field, "portfolio");
  assert.equal(result.message, "AAPL is already in Roth IRA.");
  assert.equal(start.holdings[0].portfolio, "IRA");
  assert.equal(start.holdings.length, 2);
});

test("a ticker can move to a portfolio that does not have it yet", () => {
  const start = savedState();
  const result = updateHolding(start, "aapl-ira", {
    portfolio: "Taxable",
    shares: "10",
    costBasis: "1000",
    lastPrice: "230",
    previousClose: "228",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.state.holdings.map((row) => [row.ticker, row.portfolio]),
    [
      ["AAPL", "Taxable"],
      ["AAPL", "Roth IRA"],
    ],
  );
  assert.equal(presentHolding(result.holding).totalValue, 2300);
  assert.equal(presentHolding(result.holding).todayDollar, 20);
});

test("a bad edit does not change the saved row", () => {
  const start = savedState();
  const result = updateHolding(start, "aapl-ira", {
    portfolio: "IRA",
    shares: "0",
    costBasis: "10",
    lastPrice: "",
    previousClose: "",
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, MESSAGES.shares);
  assert.equal(start.holdings[0].shares, 40);
  assert.equal(updateHolding(start, "missing", { portfolio: "IRA", shares: "1", costBasis: "1" }).message, MESSAGES.missing);
  assert.equal(updateHolding(parseStored("{"), "aapl-ira", { portfolio: "IRA", shares: "1", costBasis: "1" }).message, MESSAGES.unreadable);
});

test("editing an example row leaves the other example rows in place", () => {
  const start = parseStored(null);
  const result = updateHolding(start, SAMPLE_HOLDINGS[0].id, {
    portfolio: "IRA",
    shares: "41",
    costBasis: "5200",
    lastPrice: "228.5",
    previousClose: "225",
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.isExample, true);
  assert.equal(result.state.holdings.length, SAMPLE_HOLDINGS.length);
  assert.equal(result.state.holdings[0].shares, 41);
  assert.equal(result.state.holdings[1].ticker, "AAPL");
  assert.equal(result.state.holdings[1].portfolio, "Roth IRA");
});

test("delete removes only that holding and asks the caller to confirm first", () => {
  const start = savedState();
  const removed = deleteHolding(start, "aapl-ira");
  assert.equal(removed.ok, true);
  assert.deepEqual(
    removed.state.holdings.map((row) => row.id),
    ["aapl-roth"],
  );
  assert.equal(start.holdings.length, 2);

  const emptied = deleteHolding(removed.state, "aapl-roth");
  assert.equal(emptied.ok, true);
  assert.deepEqual(emptied.state.holdings, []);
  assert.equal(emptied.state.isExample, false);
  assert.equal(deleteHolding(emptied.state, "aapl-roth").message, MESSAGES.missing);
  assert.equal(deleteHolding(parseStored("{"), "aapl-ira").message, MESSAGES.unreadable);
});

test("deleting one example row keeps the example banner for the rows that remain", () => {
  const start = parseStored(null);
  const result = deleteHolding(start, SAMPLE_HOLDINGS[0].id);
  assert.equal(result.ok, true);
  assert.equal(result.state.isExample, true);
  assert.equal(result.state.holdings.length, SAMPLE_HOLDINGS.length - 1);
  assert.equal(result.state.holdings.some((row) => row.id === SAMPLE_HOLDINGS[0].id), false);
});
