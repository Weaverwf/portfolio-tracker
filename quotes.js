import { roundCents } from "./calc.js";
import { normalizeTicker } from "./storage.js";

// Free Finnhub plan: 60 calls/minute, and 30 calls/second on every plan.
// One quote at a time, with a pause, stays well under both.
export const QUOTE_ENDPOINT = "https://finnhub.io/api/v1/quote";
export const REQUEST_GAP_MS = 1200;
export const OFFLINE_MESSAGE = "No internet; showing last saved prices";

export function uniqueTickers(holdings) {
  const seen = new Set();
  const list = [];
  for (const row of holdings || []) {
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
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  gapMs = REQUEST_GAP_MS,
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
  let stopped = false;
  for (let i = 0; i < tickers.length; i += 1) {
    const ticker = tickers[i];
    if (stopped) {
      byTicker[ticker] = { ok: false, reason: "skipped" };
      continue;
    }
    byTicker[ticker] = await fetchQuote(ticker, apiKey, fetchImpl);
    if (byTicker[ticker].reason === "rate" || byTicker[ticker].reason === "network") stopped = true;
    if (!stopped && i < tickers.length - 1) await sleep(gapMs);
  }

  const applied = applyQuotes(current, byTicker);
  return {
    ok: applied.updated.length > 0,
    reason: applied.failed.length === 0 ? "ok" : "partial",
    message: warningFor(applied.failed),
    ...applied,
  };
}
