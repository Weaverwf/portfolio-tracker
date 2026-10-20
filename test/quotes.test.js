import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { presentHolding, presentPortfolio } from "../calc.js";
import {
  OFFLINE_MESSAGE,
  REQUEST_GAP_MS,
  TWELVE_GAP_MS,
  applyQuotes,
  formatUpdatedAt,
  parseQuote,
  parseTwelveQuote,
  uniqueTickers,
  updateQuotes,
  warningFor,
} from "../quotes.js";
import {
  FINNHUB_KEY,
  STORAGE_KEY,
  TWELVE_KEY,
  loadApiKey,
  loadTwelveKey,
  saveApiKey,
  saveState,
  saveTwelveKey,
  toStoredRecord,
} from "../storage.js";
const AAPL_IRA = {
  id: "a",
  ticker: "AAPL",
  portfolio: "IRA",
  shares: 40,
  costBasis: 130,
  lastPrice: 228.5,
  previousClose: 225,
};
const AAPL_ROTH = {
  id: "b",
  ticker: "AAPL",
  portfolio: "Roth IRA",
  shares: 15,
  costBasis: 140,
  lastPrice: 228.5,
  previousClose: 225,
};
const MSFT = {
  id: "c",
  ticker: "MSFT",
  portfolio: "IRA",
  shares: 25,
  costBasis: 312,
  lastPrice: 415.2,
  previousClose: 420,
};
const VXUS = {
  id: "d",
  ticker: "VXUS",
  portfolio: "Taxable",
  shares: 100,
  costBasis: 65,
  lastPrice: 62.4,
  previousClose: 61.8,
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("one quote updates every row with that ticker", async () => {
  const calls = [];
  const sleeps = [];
  const holdings = [AAPL_IRA, AAPL_ROTH, MSFT];
  const result = await updateQuotes({
    holdings,
    apiKey: "test-token",
    gapMs: REQUEST_GAP_MS,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async (url, init) => {
      calls.push({ symbol: url.searchParams.get("symbol"), token: url.searchParams.get("token"), init });
      const symbol = url.searchParams.get("symbol");
      if (symbol === "AAPL") return jsonResponse({ c: 230, pc: 225 });
      if (symbol === "MSFT") return jsonResponse({ c: 410, pc: 420 });
      return jsonResponse({ c: 0, pc: 0 });
    },
  });

  assert.deepEqual(
    calls.map((call) => call.symbol),
    ["AAPL", "MSFT"],
  );
  assert.equal(calls.length, uniqueTickers(holdings).length);
  for (const call of calls) {
    assert.equal(call.token, "test-token");
    assert.equal(call.init.cache, "no-store");
    assert.equal(String(call.init.url || ""), "");
  }
  assert.deepEqual(sleeps, [REQUEST_GAP_MS]);
  assert.equal(result.ok, true);
  assert.equal(result.message, "");
  assert.equal(holdings[0].lastPrice, 228.5);

  const ira = presentHolding(result.holdings[0]);
  const roth = presentHolding(result.holdings[1]);
  const msft = presentHolding(result.holdings[2]);
  assert.equal(ira.totalValue, 9200);
  assert.equal(ira.todayDollar, 200);
  assert.equal(ira.lifeDollar, 4000);
  assert.equal(roth.totalValue, 3450);
  assert.equal(roth.todayDollar, 75);
  assert.equal(roth.lifeDollar, 1350);
  assert.equal(msft.totalValue, 10250);
  assert.equal(msft.todayDollar, -250);
  assert.equal(msft.lifeDollar, 2450);
  const summary = presentPortfolio(result.holdings);
  assert.equal(summary.totalValue, 22900);
  assert.equal(summary.todayDollar, 25);
  assert.equal(summary.lifeDollar, 7800);
});

test("a zero quote keeps the old price and is listed", async () => {
  const calls = [];
  const result = await updateQuotes({
    holdings: [AAPL_IRA, VXUS],
    apiKey: "test-token",
    sleep: async () => {},
    fetchImpl: async (url) => {
      calls.push(url.searchParams.get("symbol"));
      if (url.searchParams.get("symbol") === "VXUS") return jsonResponse({ c: 0, pc: 0, t: 0 });
      return jsonResponse({ c: 230, pc: 225 });
    },
  });

  assert.deepEqual(calls, ["AAPL", "VXUS"]);
  assert.deepEqual(result.updated, ["AAPL"]);
  assert.deepEqual(result.failed, ["VXUS"]);
  assert.equal(result.holdings[1].lastPrice, 62.4);
  assert.equal(result.holdings[1].previousClose, 61.8);
  assert.equal(result.message, "These tickers kept their old prices: VXUS.");
  assert.equal(parseQuote({ c: 0, pc: 10 }).ok, false);
  assert.equal(parseQuote({ c: 10 }).ok, false);
  assert.equal(warningFor([]), "");
});

test("a rate limit stops later quotes and lists them", async () => {
  const calls = [];
  const result = await updateQuotes({
    holdings: [AAPL_IRA, MSFT, VXUS],
    apiKey: "test-token",
    sleep: async () => {},
    fetchImpl: async (url) => {
      const symbol = url.searchParams.get("symbol");
      calls.push(symbol);
      if (symbol === "MSFT") return jsonResponse({ error: "rate" }, 429);
      return jsonResponse({ c: 230, pc: 225 });
    },
  });

  assert.deepEqual(calls, ["AAPL", "MSFT"]);
  assert.deepEqual(result.updated, ["AAPL"]);
  assert.deepEqual(result.failed, ["MSFT", "VXUS"]);
  assert.equal(result.holdings[1].lastPrice, 415.2);
  assert.equal(result.holdings[2].lastPrice, 62.4);
  assert.equal(result.message, "These tickers kept their old prices: MSFT, VXUS.");
});

test("a network error while online lists the tickers and does not claim offline", async () => {
  const calls = [];
  const result = await updateQuotes({
    holdings: [AAPL_IRA, MSFT],
    apiKey: "test-token",
    online: true,
    sleep: async () => {},
    fetchImpl: async () => {
      calls.push("sent");
      throw new Error("socket closed");
    },
  });

  assert.deepEqual(calls, ["sent"]);
  assert.equal(result.reason, "partial");
  assert.equal(result.message.includes(OFFLINE_MESSAGE), false);
  assert.equal(result.message, "These tickers kept their old prices: AAPL, MSFT.");
  assert.equal(result.holdings[0].lastPrice, 228.5);
});

test("offline does not call Finnhub and uses the saved-price sentence", async () => {
  let called = false;
  const result = await updateQuotes({
    holdings: [AAPL_IRA, AAPL_ROTH],
    apiKey: "test-token",
    online: false,
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ c: 1, pc: 1 });
    },
  });

  assert.equal(called, false);
  assert.equal(result.reason, "offline");
  assert.equal(result.message, "No internet; showing last saved prices");
  assert.equal(result.message, OFFLINE_MESSAGE);
  assert.equal(result.holdings[0].lastPrice, 228.5);
  assert.equal(result.holdings[1].previousClose, 225);
});

test("the updated time uses the device clock", () => {
  assert.equal(formatUpdatedAt(new Date(2026, 9, 19, 7, 45)), "Updated 7:45 AM");
  assert.equal(formatUpdatedAt(new Date(2026, 9, 19, 0, 5)), "Updated 12:05 AM");
  assert.equal(formatUpdatedAt(new Date(2026, 9, 19, 15, 9)), "Updated 3:09 PM");
  assert.equal(formatUpdatedAt(new Date(2026, 9, 19, 12, 0)), "Updated 12:00 PM");
});

test("twelve data fills a ticker finnhub missed and skips cash", async () => {
  const calls = [];
  const sleeps = [];
  const cash = { id: "cash", kind: "cash", portfolio: "IRA", amount: 40, ticker: "SKIP" };
  const result = await updateQuotes({
    holdings: [AAPL_IRA, VXUS, { ...MSFT, ticker: "EFA" }, cash],
    apiKey: "test-token",
    twelveKey: "twelve-token",
    gapMs: 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async (url) => {
      const host = url.hostname;
      const symbol = url.searchParams.get("symbol");
      calls.push({ host, symbol, apikey: url.searchParams.get("apikey"), token: url.searchParams.get("token") });
      if (host.endsWith("twelvedata.com")) {
        if (symbol === "VXUS") return jsonResponse({ close: "63.25", previous_close: "62.00" });
        if (symbol === "EFA") return jsonResponse({ close: "80.5", previous_close: "79" });
        return jsonResponse({ status: "error", code: 400, message: "symbol not found" });
      }
      if (symbol === "AAPL") return jsonResponse({ c: 230, pc: 225 });
      return jsonResponse({ c: 0, pc: 0 });
    },
  });

  assert.deepEqual(
    calls.map((call) => `${call.host}:${call.symbol}`),
    ["finnhub.io:AAPL", "finnhub.io:VXUS", "finnhub.io:EFA", "api.twelvedata.com:VXUS", "api.twelvedata.com:EFA"],
  );
  assert.deepEqual(calls.filter((call) => call.host.endsWith("twelvedata.com")).map((call) => call.apikey), [
    "twelve-token",
    "twelve-token",
  ]);
  assert.deepEqual(sleeps, [0, 0, TWELVE_GAP_MS]);
  assert.deepEqual(result.updated, ["AAPL", "VXUS", "EFA"]);
  assert.deepEqual(result.failed, []);
  assert.equal(result.message, "");
  assert.equal(result.holdings.find((row) => row.ticker === "VXUS").lastPrice, 63.25);
  assert.equal(result.holdings.find((row) => row.ticker === "VXUS").previousClose, 62);
  assert.equal(result.holdings.find((row) => row.ticker === "EFA").lastPrice, 80.5);
  assert.equal(result.holdings.find((row) => row.id === "cash").amount, 40);
  assert.equal(result.holdings.find((row) => row.id === "cash").lastPrice, undefined);
  assert.equal(parseTwelveQuote({ status: "error", message: "symbol not found" }).reason, "error");
  assert.equal(parseTwelveQuote({ close: "0", previous_close: "1" }).ok, false);
});

test("a twelve data error still names the ticker", async () => {
  const calls = [];
  const result = await updateQuotes({
    holdings: [AAPL_IRA, VXUS],
    apiKey: "test-token",
    twelveKey: "twelve-token",
    gapMs: 0,
    sleep: async () => {},
    fetchImpl: async (url) => {
      calls.push(url.hostname);
      if (url.hostname.endsWith("twelvedata.com")) {
        return jsonResponse({ status: "error", code: 400, message: "symbol not found" });
      }
      if (url.searchParams.get("symbol") === "VXUS") return jsonResponse({ c: 0, pc: 0 });
      return jsonResponse({ c: 230, pc: 225 });
    },
  });

  assert.deepEqual(calls, ["finnhub.io", "finnhub.io", "api.twelvedata.com"]);
  assert.deepEqual(result.failed, ["VXUS"]);
  assert.equal(result.message, "These tickers kept their old prices: VXUS.");
  assert.equal(result.holdings[1].lastPrice, 62.4);
});

test("a twelve data limit stops later fallback calls", async () => {
  const calls = [];
  const result = await updateQuotes({
    holdings: [VXUS, { ...MSFT, ticker: "EFA" }],
    apiKey: "test-token",
    twelveKey: "twelve-token",
    gapMs: 0,
    sleep: async () => {},
    fetchImpl: async (url) => {
      const symbol = url.searchParams.get("symbol");
      calls.push(`${url.hostname}:${symbol}`);
      if (url.hostname.endsWith("twelvedata.com")) {
        return jsonResponse({ status: "error", code: 429, message: "You have run out of API credits for the current minute." });
      }
      return jsonResponse({ c: 0, pc: 0 });
    },
  });

  assert.deepEqual(calls, ["finnhub.io:VXUS", "finnhub.io:EFA", "api.twelvedata.com:VXUS"]);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.failed, ["VXUS", "EFA"]);
  assert.equal(result.message, "These tickers kept their old prices: VXUS, EFA.");
  assert.equal(result.holdings[0].lastPrice, 62.4);
  assert.equal(result.holdings[1].lastPrice, 415.2);
});

test("quotes do not change a row that was not returned", () => {
  const original = { ...VXUS };
  const applied = applyQuotes([original], { VXUS: { ok: false, reason: "zero" } });
  assert.equal(original.lastPrice, 62.4);
  assert.equal(applied.holdings[0].lastPrice, 62.4);
  assert.notEqual(applied.holdings[0], original);
});

test("the finnhub key stays out of the holdings record", () => {
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
    assert.equal(saveApiKey("  test-token  "), "test-token");
    assert.equal(loadApiKey(), "test-token");
    assert.equal(store.get(FINNHUB_KEY), "test-token");
    const record = toStoredRecord({
      isExample: false,
      holdings: [AAPL_IRA],
      updatedAt: "2026-10-19T14:45:00.000Z",
    });
    saveState(record);
    const saved = store.get(STORAGE_KEY);
    assert.equal(saved.includes("test-token"), false);
    assert.equal(saved.includes("finnhub"), false);
    assert.match(saved, /2026-10-19T14:45:00\.000Z/);
    assert.equal(saveApiKey("   "), "");
    assert.equal(store.has(FINNHUB_KEY), false);
    assert.equal(loadApiKey(), "");
    assert.equal(saveTwelveKey("  twelve-token  "), "twelve-token");
    assert.equal(loadTwelveKey(), "twelve-token");
    assert.equal(store.get(TWELVE_KEY), "twelve-token");
    assert.equal(store.get(TWELVE_KEY) === store.get(FINNHUB_KEY), false);
    const again = store.get(STORAGE_KEY);
    assert.equal(again.includes("twelve-token"), false);
    assert.equal(again.includes(TWELVE_KEY), false);
    assert.equal(saveTwelveKey(""), "");
    assert.equal(store.has(TWELVE_KEY), false);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("the project does not contain a finnhub token", () => {
  const root = new URL("..", import.meta.url);
  const skip = new Set(["node_modules", ".git", "icons"]);
  const secret = /(?:token|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9]{20,}["']/i;
  const embedded = /finnhub\.io\/api\/[^"'\s]*token=[A-Za-z0-9]{8,}/i;
  const embeddedTwelve = /twelvedata\.com\/[^"'\s]*apikey=[A-Za-z0-9]{8,}/i;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(root.pathname);
  assert.ok(files.length > 5);
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    assert.equal(secret.test(text), false, path);
    assert.equal(embedded.test(text), false, path);
    assert.equal(embeddedTwelve.test(text), false, path);
  }
});
