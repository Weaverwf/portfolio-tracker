import { isCashHolding, roundCents } from "./calc.js";
import { normalizeTicker } from "./storage.js";

// Free Finnhub plan: 60 calls a minute, and 30 calls a second. Unique tickers go out together.
// A 429 is tried once more after a short wait. Other results are left as they are.
// Twelve Data free plan: 8 credits a minute and 800 a day. One request asks for up to 8 symbols.
export const QUOTE_ENDPOINT = "https://finnhub.io/api/v1/quote";
export const TWELVE_ENDPOINT = "https://api.twelvedata.com/quote";
export const RATE_RETRY_MS = 1000;
export const TWELVE_BATCH_SIZE = 8;
export const OFFLINE_MESSAGE = "No internet; showing last saved prices";

export function uniqueTickers(holdings) {
  const seen = new Set();
  const list = [];
  for (const row of holdings || []) {
    if (isCashHolding(row)) continue;
    const ticker = normalizeTicker(row?.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    list.push(ticker);
  }
  return list;
}

export function parseQuote(body) {
  if (!body || typeof body !== "object") return { ok: false, reason: "bad" };
  const last = Number(body.c);
  const previous = Number(body.pc);
  if (!Number.isFinite(last) || !Number.isFinite(previous) || !(last > 0) || !(previous > 0)) {
    return { ok: false, reason: "zero" };
  }
  return { ok: true, lastPrice: roundCents(last), previousClose: roundCents(previous) };
}

export function parseTwelveQuote(body) {
  if (!body || typeof body !== "object") return { ok: false, reason: "bad" };
  if (body.status === "error") return { ok: false, reason: twelveLimited(body) ? "rate" : "error" };
  const last = Number(body.close);
  const previous = Number(body.previous_close);
  if (!Number.isFinite(last) || !Number.isFinite(previous) || !(last > 0) || !(previous > 0)) {
    return { ok: false, reason: "zero" };
  }
  return { ok: true, lastPrice: roundCents(last), previousClose: roundCents(previous) };
}

function twelveLimited(body) {
  if (!body || typeof body !== "object") return false;
  if (Number(body.code) === 429) return true;
  return /credit|rate limit|too many requests/i.test(String(body.message || ""));
}

export function applyQuotes(holdings, byTicker) {
  const next = (holdings || []).map((row) => ({ ...row }));
  const updated = [];
  const failed = [];
  for (const ticker of uniqueTickers(next)) {
    const quote = byTicker[ticker];
    if (!quote || quote.ok !== true) {
      failed.push(ticker);
      continue;
    }
    updated.push(ticker);
    for (const row of next) {
      if (isCashHolding(row)) continue;
      if (normalizeTicker(row.ticker) === ticker) {
        row.lastPrice = quote.lastPrice;
        row.previousClose = quote.previousClose;
      }
    }
  }
  return { holdings: next, updated, failed };
}

export function warningFor(tickers) {
  if (!tickers || tickers.length === 0) return "";
  return `These tickers kept their old prices: ${tickers.join(", ")}.`;
}

export function formatUpdatedAt(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours %= 12;
  if (hours === 0) hours = 12;
  return `Updated ${hours}:${minutes} ${suffix}`;
}

function chunksOf(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

function quotesFor(symbols, reason) {
  return Object.fromEntries(symbols.map((symbol) => [symbol, { ok: false, reason }]));
}

export function parseTwelveBatch(body, symbols) {
  const list = symbols.slice();
  if (!body || typeof body !== "object") return quotesFor(list, "bad");
  if (list.length === 1) return { [list[0]]: parseTwelveQuote(body) };
  if (body.status === "error" || twelveLimited(body)) return quotesFor(list, twelveLimited(body) ? "rate" : "error");
  const quotes = {};
  for (const symbol of list) quotes[symbol] = parseTwelveQuote(body[symbol]);
  return quotes;
}

async function fetchTwelveBatch(symbols, apiKey, fetchImpl) {
  const url = new URL(TWELVE_ENDPOINT);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("apikey", apiKey);
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", cache: "no-store" });
  } catch {
    return { stopped: true, quotes: quotesFor(symbols, "network") };
  }
  if (response.status === 429) return { stopped: true, quotes: quotesFor(symbols, "rate") };
  let body;
  try {
    body = await response.json();
  } catch {
    return { stopped: false, quotes: quotesFor(symbols, "bad") };
  }
  if (twelveLimited(body)) return { stopped: true, quotes: quotesFor(symbols, "rate") };
  if (!response.ok) return { stopped: false, quotes: quotesFor(symbols, "http") };
  return { stopped: false, quotes: parseTwelveBatch(body, symbols) };
}

export async function fetchQuote(ticker, apiKey, fetchImpl = fetch) {
  const url = new URL(QUOTE_ENDPOINT);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("token", apiKey);
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", cache: "no-store" });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status === 429) return { ok: false, reason: "rate" };
  if (!response.ok) return { ok: false, reason: "http" };
  try {
    return parseQuote(await response.json());
  } catch {
    return { ok: false, reason: "bad" };
  }
}

export async function updateQuotes({
  holdings,
  apiKey,
  twelveKey = "",
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryMs = RATE_RETRY_MS,
  online = true,
} = {}) {
  const current = holdings || [];
  if (!online) {
    return {
      ok: false,
      reason: "offline",
      message: OFFLINE_MESSAGE,
      holdings: current,
      updated: [],
      failed: [],
    };
  }

  const tickers = uniqueTickers(current);
  const byTicker = {};
  const first = await Promise.all(tickers.map((ticker) => fetchQuote(ticker, apiKey, fetchImpl)));
  const retry = [];
  tickers.forEach((ticker, index) => {
    if (first[index].reason === "rate") retry.push(ticker);
    else byTicker[ticker] = first[index];
  });
  if (retry.length > 0) {
    await sleep(retryMs);
    const second = await Promise.all(retry.map((ticker) => fetchQuote(ticker, apiKey, fetchImpl)));
    retry.forEach((ticker, index) => {
      byTicker[ticker] = second[index];
    });
  }

  const missed = tickers.filter((ticker) => byTicker[ticker]?.ok !== true);
  const fallbackKey = String(twelveKey || "").trim();
  if (fallbackKey && missed.length > 0) {
    let stopped = false;
    for (const group of chunksOf(missed, TWELVE_BATCH_SIZE)) {
      if (stopped) {
        for (const ticker of group) byTicker[ticker] = { ok: false, reason: "skipped" };
        continue;
      }
      const batch = await fetchTwelveBatch(group, fallbackKey, fetchImpl);
      Object.assign(byTicker, batch.quotes);
      if (batch.stopped) stopped = true;
    }
  }

  const applied = applyQuotes(current, byTicker);
  return {
    ok: applied.updated.length > 0,
    reason: applied.failed.length === 0 ? "ok" : "partial",
    message: warningFor(applied.failed),
    ...applied,
  };
}
