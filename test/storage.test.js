import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteHolding } from "../calc.js";
import { SAMPLE_HOLDINGS } from "../sample.js";
import { STORAGE_KEY, parseStored } from "../storage.js";

test("the storage key stays on this device", () => {
  assert.equal(STORAGE_KEY, "portfolio-tracker.v1");
});

test("sample lists AAPL in an IRA and a Roth IRA", () => {
  const aapl = SAMPLE_HOLDINGS.filter((row) => row.ticker === "AAPL").map((row) => row.portfolio);
  assert.deepEqual(aapl, ["IRA", "Roth IRA"]);
  assert.equal(new Set(SAMPLE_HOLDINGS.map((row) => row.id)).size, SAMPLE_HOLDINGS.length);
  for (const row of SAMPLE_HOLDINGS) {
    assert.equal(isCompleteHolding(row), true);
    assert.equal(Object.hasOwn(row, "account"), false);
    assert.equal(Object.hasOwn(row, "accountNumber"), false);
  }
});

test("empty storage is filled with example holdings", () => {
  const state = parseStored(null);
  assert.equal(state.ok, true);
  assert.equal(state.isExample, true);
  assert.equal(state.shouldSave, true);
  assert.equal(state.holdings.length, SAMPLE_HOLDINGS.length);
  assert.notEqual(state.holdings[0], SAMPLE_HOLDINGS[0]);
  assert.equal(state.holdings[0].ticker, "AAPL");
});

test("a saved record is kept as stored", () => {
  const state = parseStored(
    JSON.stringify({
      schema: 2,
      isExample: false,
      holdings: [
        {
          id: "mine",
          ticker: "ABCD",
          portfolio: "IRA",
          shares: 1,
          costBasis: 10,
          lastPrice: 12,
          previousClose: 11,
        },
      ],
    }),
  );
  assert.equal(state.ok, true);
  assert.equal(state.isExample, false);
  assert.equal(state.shouldSave, false);
  assert.equal(state.holdings[0].ticker, "ABCD");
});

test("unreadable storage is not replaced", () => {
  for (const raw of ["{", "", "null", "[]", '{"holdings":{}}']) {
    const state = parseStored(raw);
    assert.equal(state.ok, false, raw);
    assert.equal(state.shouldSave, false);
    assert.deepEqual(state.holdings, []);
  }
});

test("incomplete rows are detectable", () => {
  assert.equal(isCompleteHolding(null), false);
  assert.equal(isCompleteHolding({ ticker: "AAPL", portfolio: "IRA" }), false);
  assert.equal(isCompleteHolding({ ticker: " ", portfolio: "IRA", shares: 1, costBasis: 1, lastPrice: 1, previousClose: 1 }), false);
});
