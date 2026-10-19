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

export function isCompleteHolding(holding) {
  if (!holding || typeof holding !== "object") return false;
  if (typeof holding.ticker !== "string" || holding.ticker.trim() === "") return false;
  if (typeof holding.portfolio !== "string" || holding.portfolio.trim() === "") return false;
  for (const key of ["shares", "costBasis", "lastPrice", "previousClose"]) {
    if (!Number.isFinite(Number(holding[key]))) return false;
  }
  return true;
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

export function presentHolding(holding) {
  const computed = computeHolding(holding);
  return {
    ...computed,
    sharesText: formatShares(holding.shares),
    costBasisText: formatMoney(holding.costBasis),
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

export function presentPortfolio(holdings) {
  const rows = holdings.map((holding) => ({
    holding,
    ...presentHolding(holding),
  }));
  const totalValue = sumCents(rows.map((row) => row.totalValue));
  const todayDollar = sumCents(rows.map((row) => row.todayDollar));
  const lifeDollar = sumCents(rows.map((row) => row.lifeDollar));
  const costBasis = sumCents(rows.map((row) => Number(row.holding.costBasis)));
  const previousValue = sumCents(
    rows.map((row) => roundCents(Number(row.holding.shares) * Number(row.holding.previousClose))),
  );
  const todayPercent = previousValue === 0 ? null : todayDollar / previousValue;
  const lifePercent = costBasis === 0 ? null : lifeDollar / costBasis;

  return {
    rows,
    totalValue,
    todayDollar,
    lifeDollar,
    costBasis,
    previousValue,
    todayPercent,
    lifePercent,
    totalValueText: formatMoney(totalValue),
    todayPercentText: formatPercent(todayPercent),
    todayDollarText: formatMoney(todayDollar, { signed: true }),
    lifePercentText: formatPercent(lifePercent),
    lifeDollarText: formatMoney(lifeDollar, { signed: true }),
    todaySign: signOf(todayDollar),
    lifeSign: signOf(lifeDollar),
  };
}
