import { roundCents } from "./calc.js";
import { SAMPLE_HOLDINGS } from "./sample.js";

export const STORAGE_KEY = "portfolio-tracker.v1";
export const PORTFOLIO_MAX = 40;

export const MESSAGES = {
  ticker: "Use 1 to 5 letters. A period or a hyphen is allowed.",
  portfolio: "Enter a portfolio name.",
  portfolioLong: "Enter a shorter portfolio name.",
  shares: "Enter a number of shares greater than zero.",
  cost: "Enter a cost basis of zero or more.",
  lastPrice: "Enter a last price of zero or more, or leave it blank.",
  previousClose: "Enter a previous close of zero or more, or leave it blank.",
  unreadable: "Holdings saved on this device could not be read. They were left untouched.",
  noExample: "There is no example data to clear.",
};

function cloneSample() {
  return SAMPLE_HOLDINGS.map((row) => ({ ...row }));
}

export function normalizeTicker(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function normalizePortfolio(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function isValidTicker(ticker) {
  return ticker.length >= 1 && ticker.length <= 5 && /^[A-Z](?:[A-Z.\-]*[A-Z])?$/.test(ticker);
}

export function portfolioNames(holdings) {
  const seen = new Set();
  const names = [];
  for (const holding of holdings || []) {
    if (!holding || typeof holding.portfolio !== "string") continue;
    const name = normalizePortfolio(holding.portfolio);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function findDuplicate(holdings, ticker, portfolio) {
  const symbol = normalizeTicker(ticker);
  const name = normalizePortfolio(portfolio).toLowerCase();
  return (holdings || []).find((row) => {
    if (!row) return false;
    return normalizeTicker(row.ticker) === symbol && normalizePortfolio(row.portfolio).toLowerCase() === name;
  });
}

function parseLooseNumber(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false };
    return { ok: true, value: raw };
  }
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const text = String(raw)
    .trim()
    .replace(/[$,]/g, "")
    .replace(/\s+/g, "");
  if (text === "") return { ok: true, value: null };
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return { ok: false };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function roundShares(n) {
  return Math.round(n * 10000) / 10000;
}

export function buildHolding(input) {
  const source = input || {};
  const ticker = normalizeTicker(source.ticker);
  if (!isValidTicker(ticker)) return { ok: false, field: "ticker", message: MESSAGES.ticker };

  const portfolio = normalizePortfolio(source.portfolio);
  if (!portfolio) return { ok: false, field: "portfolio", message: MESSAGES.portfolio };
  if (portfolio.length > PORTFOLIO_MAX) {
    return { ok: false, field: "portfolio", message: MESSAGES.portfolioLong };
  }

  const shares = parseLooseNumber(source.shares);
  const shareCount = shares.ok && shares.value !== null ? roundShares(shares.value) : 0;
  if (!shares.ok || shares.value === null || !(shareCount > 0)) {
    return { ok: false, field: "shares", message: MESSAGES.shares };
  }

  const cost = parseLooseNumber(source.costBasis);
  if (!cost.ok || cost.value === null || cost.value < 0) {
    return { ok: false, field: "costBasis", message: MESSAGES.cost };
  }

  const last = parseLooseNumber(source.lastPrice);
  if (!last.ok || (last.value !== null && last.value < 0)) {
    return { ok: false, field: "lastPrice", message: MESSAGES.lastPrice };
  }

  const previous = parseLooseNumber(source.previousClose);
  if (!previous.ok || (previous.value !== null && previous.value < 0)) {
    return { ok: false, field: "previousClose", message: MESSAGES.previousClose };
  }

  return {
    ok: true,
    holding: {
      ticker,
      portfolio,
      shares: shareCount,
      costBasis: roundCents(cost.value),
      lastPrice: last.value === null ? null : roundCents(last.value),
      previousClose: previous.value === null ? null : roundCents(previous.value),
    },
  };
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return `h-${crypto.randomUUID()}`;
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addHolding(state, input, options = {}) {
  if (!state || state.ok === false) return { ok: false, message: MESSAGES.unreadable };

  const built = buildHolding(input);
  if (!built.ok) return built;

  const existing = state.isExample ? [] : state.holdings || [];
  const duplicate = findDuplicate(existing, built.holding.ticker, built.holding.portfolio);
  if (duplicate) {
    return {
      ok: false,
      field: "portfolio",
      message: `${built.holding.ticker} is already in ${duplicate.portfolio}.`,
    };
  }

  const holding = {
    ...built.holding,
    id: typeof options.id === "string" && options.id ? options.id : createId(),
  };

  return {
    ok: true,
    holding,
    state: {
      ok: true,
      isExample: false,
      holdings: existing.map((row) => ({ ...row })).concat(holding),
      shouldSave: true,
      persisted: state.persisted !== false,
    },
  };
}

export function clearExampleData(state) {
  if (!state || state.ok === false) return { ok: false, message: MESSAGES.unreadable };
  if (!state.isExample) return { ok: false, message: MESSAGES.noExample };
  return {
    ok: true,
    state: {
      ok: true,
      isExample: false,
      holdings: [],
      shouldSave: true,
      persisted: state.persisted !== false,
    },
  };
}

export function toStoredRecord(state) {
  return {
    isExample: state.isExample === true,
    holdings: state.holdings,
  };
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStoredRecord(state)));
}

export function parseStored(raw) {
  if (raw === null) {
    return {
      ok: true,
      isExample: true,
      holdings: cloneSample(),
      shouldSave: true,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, isExample: false, holdings: [], shouldSave: false };
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.holdings)) {
    return { ok: false, isExample: false, holdings: [], shouldSave: false };
  }

  return {
    ok: true,
    isExample: parsed.isExample === true,
    holdings: parsed.holdings,
    shouldSave: false,
  };
}

export function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      ok: true,
      isExample: true,
      holdings: cloneSample(),
      shouldSave: false,
      persisted: false,
    };
  }

  const state = parseStored(raw);
  if (!state.shouldSave) {
    state.persisted = true;
    return state;
  }

  try {
    saveState(state);
    state.persisted = true;
  } catch {
    state.persisted = false;
  }
  return state;
}
