// A blank price is shown as an em dash. Zero is a real price.
export const EMPTY_MARK = "—";

// Dollars are rounded to the cent.
//   total value = shares × last price
//   today $     = shares × (last price - previous close)
//   today %     = (last price - previous close) / previous close
//   total cost  = cost basis per share × shares
//   life $      = total value - total cost
//   life %      = life $ / total cost
// Cost basis is the price paid per share. A zero previous close or a zero total cost has no percent (shown as n/a).
// Portfolio today % = sum of today $ / sum of (shares × previous close)
// Portfolio life %  = sum of life $ / sum of total cost

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

export function isCashHolding(holding) {
  return holding?.kind === "cash";
}

export function holdingLabel(holding) {
  return isCashHolding(holding) ? "Cash" : holding?.ticker || "";
}

export function isCompleteHolding(holding) {
  if (!holding || typeof holding !== "object") return false;
  if (typeof holding.portfolio !== "string" || holding.portfolio.trim() === "") return false;
  if (isCashHolding(holding)) {
    const amount = Number(holding.amount);
    return Number.isFinite(amount) && amount >= 0;
  }
  if (typeof holding.ticker !== "string" || holding.ticker.trim() === "") return false;
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

export function totalCost(shares, costPerShare) {
  return roundCents(readNumber(shares, "shares") * readNumber(costPerShare, "costBasis"));
}

export function computeHolding(holding) {
  const shares = readNumber(holding.shares, "shares");
  const costPerShare = readNumber(holding.costBasis, "costBasis");
  const lastPrice = readNumber(holding.lastPrice, "lastPrice");
  const previousClose = readNumber(holding.previousClose, "previousClose");

  const totalValue = roundCents(shares * lastPrice);
  const spent = totalCost(shares, costPerShare);
  const todayDollar = roundCents(shares * (lastPrice - previousClose));
  const lifeDollar = roundCents(totalValue - spent);
  const todayPercent = previousClose === 0 ? null : (lastPrice - previousClose) / previousClose;
  const lifePercent = spent === 0 ? null : lifeDollar / spent;

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
  if (isCashHolding(holding)) {
    const totalValue = roundCents(readNumber(holding.amount, "amount"));
    return {
      totalValue,
      todayDollar: 0,
      todayPercent: null,
      lifeDollar: 0,
      lifePercent: null,
      sharesText: EMPTY_MARK,
      costBasisText: EMPTY_MARK,
      todayPercentText: EMPTY_MARK,
      todayDollarText: EMPTY_MARK,
      lifePercentText: EMPTY_MARK,
      lifeDollarText: EMPTY_MARK,
      totalValueText: formatMoney(totalValue),
      todaySign: "flat",
      lifeSign: "flat",
    };
  }

  const sharesText = formatShares(holding.shares);
  const costBasisText = formatMoney(holding.costBasis);
  const last = optionalNumber(holding.lastPrice);
  const previous = optionalNumber(holding.previousClose);

  if (last === null) return blankMetrics(sharesText, costBasisText);

  if (previous === null) {
    const shares = readNumber(holding.shares, "shares");
    const spent = totalCost(shares, holding.costBasis);
    const totalValue = roundCents(shares * last);
    const lifeDollar = roundCents(totalValue - spent);
    const lifePercent = spent === 0 ? null : lifeDollar / spent;
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

function figureText(dollar, percent, base) {
  if (dollar == null || (dollar === 0 && !(Number(base) > 0))) {
    return { text: EMPTY_MARK, dollarText: EMPTY_MARK, sign: "flat" };
  }
  return {
    text: formatPercent(percent),
    dollarText: formatMoney(dollar, { signed: true }),
    sign: signOf(dollar),
  };
}

function positionCost(holding) {
  if (isCashHolding(holding)) return 0;
  return totalCost(holding.shares, holding.costBasis);
}

function positionPrevious(holding) {
  if (isCashHolding(holding)) return 0;
  return roundCents(Number(holding.shares) * Number(holding.previousClose));
}

function sumCents(values) {
  const cents = values.reduce((sum, value) => sum + Math.round(value * 100), 0);
  return cents / 100;
}

export function sortRows(rows, key, direction) {
  if (!key) return rows.slice();
  const factor = direction === "desc" ? -1 : 1;
  const amount = (row) => {
    if (key === "ticker") return holdingLabel(row.holding);
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
    return holdingLabel(a.holding).localeCompare(holdingLabel(b.holding));
  });
}

function signedFigures(todayDollar, todayPercent, previousValue, lifeDollar, lifePercent, costBasis) {
  const today = figureText(todayDollar, todayPercent, previousValue);
  const life = figureText(lifeDollar, lifePercent, costBasis);
  return {
    todayPercentText: today.text,
    todayDollarText: today.dollarText,
    lifePercentText: life.text,
    lifeDollarText: life.dollarText,
    todaySign: today.sign,
    lifeSign: life.sign,
  };
}

// The header is the sum of these portfolio subtotals. It does not walk rendered rows.
export function presentHeader(subtotals) {
  const parts = Array.isArray(subtotals) ? subtotals.filter((part) => part && typeof part === "object") : [];
  const allValued =
    parts.length > 0 && parts.every((part) => part.totalValue != null && part.lifeDollar != null && part.costBasis != null);
  const allMoved =
    parts.length > 0 && parts.every((part) => part.todayDollar != null && part.previousValue != null);

  const totalValue = allValued ? sumCents(parts.map((part) => part.totalValue)) : null;
  const lifeDollar = allValued ? sumCents(parts.map((part) => part.lifeDollar)) : null;
  const costBasis = allValued ? sumCents(parts.map((part) => part.costBasis)) : null;
  const lifePercent = !allValued || costBasis === 0 ? null : lifeDollar / costBasis;

  const todayDollar = allMoved ? sumCents(parts.map((part) => part.todayDollar)) : null;
  const previousValue = allMoved ? sumCents(parts.map((part) => part.previousValue)) : null;
  const todayPercent = !allMoved || previousValue === 0 ? null : todayDollar / previousValue;

  return {
    totalValue,
    todayDollar,
    lifeDollar,
    costBasis,
    previousValue,
    todayPercent,
    lifePercent,
    totalValueText: totalValue == null ? EMPTY_MARK : formatMoney(totalValue),
    ...signedFigures(todayDollar, todayPercent, previousValue, lifeDollar, lifePercent, costBasis),
  };
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
  const costBasis = allValued ? sumCents(rows.map((row) => positionCost(row.holding))) : null;
  const lifePercent = !allValued || costBasis === 0 ? null : lifeDollar / costBasis;

  const todayDollar = allMoved ? sumCents(rows.map((row) => row.todayDollar)) : null;
  const previousValue = allMoved ? sumCents(rows.map((row) => positionPrevious(row.holding))) : null;
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
    ...signedFigures(todayDollar, todayPercent, previousValue, lifeDollar, lifePercent, costBasis),
  };
}
