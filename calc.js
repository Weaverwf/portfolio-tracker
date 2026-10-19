// A blank price is shown as an em dash. Zero is a real price.
export const EMPTY_MARK = "—";

// Dollars are rounded to the cent.
//   total value = shares × last price
//   today $     = shares × (last price - previous close)
//   today %     = (last price - previous close) / previous close
//   life $      = total value - cost basis
//   life %      = life $ / cost basis
// Cost basis is the total dollars recorded for that row, not a per-share price.
// A zero previous close or a zero cost basis has no percent (shown as n/a).
// Portfolio today % = sum of today $ / sum of (shares × previous close)
// Portfolio life %  = sum of life $ / sum of cost basis

export function roundCents(amount) {
  if (!Number.isFinite(amount)) {
    throw new TypeError("Amount must be a finite number");
  }
  const cents = Math.round(amount * 100);
  if (cents === 0) return 0;
  return cents / 100;
}

function readNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return n;
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function isCompleteHolding(holding) {
  if (!holding || typeof holding !== "object") return false;
  if (typeof holding.ticker !== "string" || holding.ticker.trim() === "") return false;
  if (typeof holding.portfolio !== "string" || holding.portfolio.trim() === "") return false;
  if (!Number.isFinite(Number(holding.shares)) || !Number.isFinite(Number(holding.costBasis))) return false;
  if (!isMissing(holding.lastPrice) && !Number.isFinite(Number(holding.lastPrice))) return false;
  if (!isMissing(holding.previousClose) && !Number.isFinite(Number(holding.previousClose))) return false;
  return true;
}

function optionalNumber(value) {
  if (isMissing(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function computeHolding(holding) {
  const shares = readNumber(holding.shares, "shares");
  const costBasis = readNumber(holding.costBasis, "costBasis");
  const lastPrice = readNumber(holding.lastPrice, "lastPrice");
  const previousClose = readNumber(holding.previousClose, "previousClose");

  const totalValue = roundCents(shares * lastPrice);
  const todayDollar = roundCents(shares * (lastPrice - previousClose));
  const lifeDollar = roundCents(totalValue - costBasis);
  const todayPercent = previousClose === 0 ? null : (lastPrice - previousClose) / previousClose;
  const lifePercent = costBasis === 0 ? null : lifeDollar / costBasis;

  return { totalValue, todayDollar, todayPercent, lifeDollar, lifePercent };
}

export function signOf(amount) {
  if (amount > 0) return "gain";
  if (amount < 0) return "loss";
  return "flat";
}

export function formatMoney(amount, { signed = false } = {}) {
  const n = roundCents(amount);
  const abs = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  if (!signed) return n < 0 ? `-${abs}` : abs;
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return `+${abs}`;
}

export function formatPercent(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "n/a";
  const rounded = Math.round(ratio * 10000) / 100;
  const abs = Math.abs(rounded).toFixed(2);
  if (rounded > 0) return `+${abs}%`;
  if (rounded < 0) return `-${abs}%`;
  return `+${abs}%`;
}

export function formatShares(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function blankMetrics(sharesText, costBasisText) {
  return {
    totalValue: null,
    todayDollar: null,
    todayPercent: null,
    lifeDollar: null,
    lifePercent: null,
    sharesText,
    costBasisText,
    todayPercentText: EMPTY_MARK,
    todayDollarText: EMPTY_MARK,
    lifePercentText: EMPTY_MARK,
    lifeDollarText: EMPTY_MARK,
    totalValueText: EMPTY_MARK,
    todaySign: "flat",
    lifeSign: "flat",
  };
}

export function presentHolding(holding) {
  const sharesText = formatShares(holding.shares);
  const costBasisText = formatMoney(holding.costBasis);
  const last = optionalNumber(holding.lastPrice);
  const previous = optionalNumber(holding.previousClose);

  if (last === null) return blankMetrics(sharesText, costBasisText);

  if (previous === null) {
    const shares = readNumber(holding.shares, "shares");
    const costBasis = readNumber(holding.costBasis, "costBasis");
    const totalValue = roundCents(shares * last);
    const lifeDollar = roundCents(totalValue - costBasis);
    const lifePercent = costBasis === 0 ? null : lifeDollar / costBasis;
    return {
      totalValue,
      todayDollar: null,
      todayPercent: null,
      lifeDollar,
      lifePercent,
      sharesText,
      costBasisText,
      todayPercentText: EMPTY_MARK,
      todayDollarText: EMPTY_MARK,
      lifePercentText: formatPercent(lifePercent),
      lifeDollarText: formatMoney(lifeDollar, { signed: true }),
      totalValueText: formatMoney(totalValue),
      todaySign: "flat",
      lifeSign: signOf(lifeDollar),
    };
  }

  const computed = computeHolding({ ...holding, lastPrice: last, previousClose: previous });
  return {
    ...computed,
    sharesText,
    costBasisText,
    todayPercentText: formatPercent(computed.todayPercent),
    todayDollarText: formatMoney(computed.todayDollar, { signed: true }),
    lifePercentText: formatPercent(computed.lifePercent),
    lifeDollarText: formatMoney(computed.lifeDollar, { signed: true }),
    totalValueText: formatMoney(computed.totalValue),
    todaySign: signOf(computed.todayDollar),
    lifeSign: signOf(computed.lifeDollar),
  };
}

function sumCents(values) {
  const cents = values.reduce((sum, value) => sum + Math.round(value * 100), 0);
  return cents / 100;
}

export function sortRows(rows, key, direction) {
  if (!key) return rows.slice();
  const factor = direction === "desc" ? -1 : 1;
  const amount = (row) => {
    if (key === "ticker") return row.holding?.ticker || "";
    if (key === "total") return row.totalValue;
    if (key === "today") return row.todayPercent;
    if (key === "life") return row.lifePercent;
    return null;
  };
  const missing = (value) => value === null || value === undefined || value === "";

  return rows.slice().sort((a, b) => {
    const av = amount(a);
    const bv = amount(b);
    if (missing(av) && missing(bv)) return 0;
    if (missing(av)) return 1;
    if (missing(bv)) return -1;
    if (typeof av === "string") {
      const cmp = av.localeCompare(bv);
      if (cmp !== 0) return cmp * factor;
    } else if (av !== bv) {
      return (av < bv ? -1 : 1) * factor;
    }
    return String(a.holding?.ticker || "").localeCompare(String(b.holding?.ticker || ""));
  });
}

export function presentPortfolio(holdings) {
  const rows = holdings.map((holding) => ({
    holding,
    ...presentHolding(holding),
  }));

  const allValued = rows.length > 0 && rows.every((row) => row.totalValue != null);
  const allMoved = rows.length > 0 && rows.every((row) => row.todayDollar != null);

  const totalValue = allValued ? sumCents(rows.map((row) => row.totalValue)) : null;
  const lifeDollar = allValued ? sumCents(rows.map((row) => row.lifeDollar)) : null;
  const costBasis = allValued ? sumCents(rows.map((row) => Number(row.holding.costBasis))) : null;
  const lifePercent = !allValued || costBasis === 0 ? null : lifeDollar / costBasis;

  const todayDollar = allMoved ? sumCents(rows.map((row) => row.todayDollar)) : null;
  const previousValue = allMoved
    ? sumCents(
        rows.map((row) => roundCents(Number(row.holding.shares) * Number(row.holding.previousClose))),
      )
    : null;
  const todayPercent = !allMoved || previousValue === 0 ? null : todayDollar / previousValue;

  return {
    rows,
    totalValue,
    todayDollar,
    lifeDollar,
    costBasis,
    previousValue,
    todayPercent,
    lifePercent,
    totalValueText: totalValue == null ? EMPTY_MARK : formatMoney(totalValue),
    todayPercentText: todayDollar == null ? EMPTY_MARK : formatPercent(todayPercent),
    todayDollarText: todayDollar == null ? EMPTY_MARK : formatMoney(todayDollar, { signed: true }),
    lifePercentText: lifeDollar == null ? EMPTY_MARK : formatPercent(lifePercent),
    lifeDollarText: lifeDollar == null ? EMPTY_MARK : formatMoney(lifeDollar, { signed: true }),
    todaySign: todayDollar == null ? "flat" : signOf(todayDollar),
    lifeSign: lifeDollar == null ? "flat" : signOf(lifeDollar),
  };
}
