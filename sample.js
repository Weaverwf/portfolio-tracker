// Invented holdings and prices, so the table has something to show.
// These are not live quotes and not anyone's account.
// costBasis is the price per share. The totals match the old example, where those prices were stored as whole-row dollars.

export const SAMPLE_HOLDINGS = [
  {
    id: "ex-aapl-ira",
    ticker: "AAPL",
    portfolio: "IRA",
    shares: 40,
    costBasis: 130,
    lastPrice: 228.5,
    previousClose: 225,
  },
  {
    id: "ex-aapl-roth",
    ticker: "AAPL",
    portfolio: "Roth IRA",
    shares: 15,
    costBasis: 140,
    lastPrice: 228.5,
    previousClose: 225,
  },
  {
    id: "ex-msft-ira",
    ticker: "MSFT",
    portfolio: "IRA",
    shares: 25,
    costBasis: 312,
    lastPrice: 415.2,
    previousClose: 420,
  },
  {
    id: "ex-vxus-taxable",
    ticker: "VXUS",
    portfolio: "Taxable",
    shares: 100,
    costBasis: 65,
    lastPrice: 62.4,
    previousClose: 61.8,
  },
  {
    id: "ex-intc-roth",
    ticker: "INTC",
    portfolio: "Roth IRA",
    shares: 80,
    costBasis: 40,
    lastPrice: 23.1,
    previousClose: 23.85,
  },
];
