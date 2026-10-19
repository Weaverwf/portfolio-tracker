# Portfolio

A personal holdings table for one person. It runs in the browser, stores its rows on the device, and can open offline after the first visit. The first visit fills the table with **example data**: made-up holdings and sample prices, including AAPL in an IRA and a Roth IRA. Those rows stay until you add a holding or clear them.

This is a personal record, not financial advice. It does not place orders.

## Run it locally

Node.js 18 or newer. There is no install step and no build.

```bash
node server.js
```

Open [http://127.0.0.1:8741](http://127.0.0.1:8741).

`server.js` only serves the files so the page is opened over http. Do not open `index.html` from the desktop or the Files app. A `file://` address will not load the modules or the offline worker.

## Check the arithmetic

```bash
npm test
```

The tests compare Today, Life, and Total Value for the example rows with figures worked out by hand.

Dollars are rounded to the cent:

- Total value = shares × last price
- Today $ = shares × (last price − previous close)
- Today % = (last price − previous close) ÷ previous close
- Total cost = cost basis per share × shares
- Life $ = total value − total cost
- Life % = life $ ÷ total cost

Cost basis is the price paid **per share**. For the whole table, Today % is the sum of the row dollars divided by the previous total value. Life % is the sum of the row dollars divided by the sum of total cost.

If the previous close is zero, or the total cost is zero, that percent is shown as n/a.

Gains are green and start with +. Losses are red and start with −.

## Where the rows are stored

On the first visit, example holdings are written to `localStorage` under the key `portfolio-tracker.v1`. Later visits read that key. Nothing is uploaded. There is no account number and no API key in this project.

If the saved text cannot be read, the page says so and does not write over it.

**Clear example data** removes the made-up rows and leaves the table empty. The first holding you save also replaces those rows. After that the example banner is gone. The same ticker can be in more than one portfolio. The same ticker in the same portfolio is refused, and the page says so in plain words.

Last price and previous close can be left blank. Today, Life, and Total Value show a dash for that row until a last price is entered. Today also needs the previous close. The totals at the top stay a dash until every row has the price that total needs.

To see the example rows again, remove this site's saved data in the browser settings.

The saved shape is:

```json
{
  "schema": 2,
  "isExample": true,
  "holdings": [
    {
      "id": "ex-aapl-ira",
      "ticker": "AAPL",
      "portfolio": "IRA",
      "shares": 40,
      "costBasis": 130,
      "lastPrice": 228.5,
      "previousClose": 225
    }
  ]
}
```

`lastPrice`, `previousClose`, and `costBasis` are per share. A price may be `null` when it was left blank. `schema` 2 means cost basis is already per share. A saved copy from before that, with no schema, is converted once: cost per share = stored total ÷ shares. A share count of zero is left unchanged. The converted copy is written back with schema 2, so the division does not run again.

## Offline, and a home screen icon

`manifest.webmanifest` and `sw.js` make the page installable and available offline. Open the site once while online so the worker can store the files. After that it can open with no network.

An iPhone or iPad will only install a home screen app from an **https** address (or from localhost on that same device). Use the hosted URL below, not a file you copied over.

1. Open the site in **Safari**.
2. Tap the Share button.
3. Tap **Add to Home Screen**.
4. Open Portfolio from the new icon.

## Put it on a URL the iPad can open

The address for this project is [https://weaverwf.github.io/portfolio-tracker/](https://weaverwf.github.io/portfolio-tracker/).

GitHub Pages serves that address from a **public** repository `Weaverwf/portfolio-tracker`, branch `main`, folder `/ (root)`. Sign in on GitHub as **Weaverwf**, then:

1. Open [github.com/new](https://github.com/new). Repository name: `portfolio-tracker`. Visibility: Public. Create the repository.
2. Put these files on `main`, including `icons/`, `manifest.webmanifest`, `sw.js`, and `.nojekyll`. `server.js` is only for local preview.
3. Open [the Pages settings](https://github.com/Weaverwf/portfolio-tracker/settings/pages).
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main` and folder `/ (root)`, then click **Save**.
6. Wait until that page shows the site as live.
7. On the iPad, open the address in Safari and use **Add to Home Screen**.

`.nojekyll` tells Pages to copy the files through as they are.

The manifest `start_url` and `scope` are `./`. The service worker is registered as `./sw.js` and caches relative paths (`./index.html`, `./styles.css`, and the rest). On this project site those URLs resolve under `/portfolio-tracker/`, which is the worker's scope. They do not point at `https://weaverwf.github.io/` itself.

[Vercel](https://vercel.com) is the other free option if you would rather skip the Pages settings. Import the repository, leave the build command empty, and use the "Other" preset. Vercel gives you an https address you can open in Safari the same way.

Use GitHub Pages if the files already live in a GitHub repository.

## This version

- The table is the screen. On a narrow phone, swipe sideways; the ticker column stays put.
- **Add** (the plus) stores a holding on this device: ticker, portfolio, shares, cost basis per share, and optional prices.
- **Settings** (the gear) stores a Finnhub key on this device only. The key is not in this project. Show and Hide change whether the field is readable. The note on that screen says the key stays on this device.
- **Update** asks Finnhub once for each distinct ticker, then fills last price and previous close on every matching row. The same ticker in two portfolios is one request. Requests are spaced about 1.2 seconds apart, under the free plan's 60 calls a minute. While it runs, the button says Updating and does not accept another tap. After a price comes back, the page shows the device's local time, such as Updated 7:45 AM.
- A ticker that fails, or comes back as zero, keeps its old price. Those tickers are listed in a short warning. With no network, the page says: No internet; showing last saved prices. The price fields on the form remain a fallback.
- Finnhub's free quote is for US stocks, up to 60 calls a minute, with a separate cap of 30 calls a second. The quote docs describe it as real-time and do not state a 15-minute delay. International real-time quotes are an enterprise feature. Mutual fund data is not in the free plan. The free plan lists US ETF coverage, while the quote docs say US stocks, so an ETF can come back without a price.
- Tap a row and choose **Edit**. The ticker stays as saved. Portfolio, shares, cost basis, and the optional prices can change. Moving a ticker into a portfolio that already has it is refused. **Delete holding** asks before it removes the row.
- Chips above the totals choose All or one portfolio. The table and the top totals follow that choice, and the device remembers it.
- All shows a subtotal for each portfolio: total value, today, and life. The grand total stays in the cards at the top.
- Equity, Today, Life, and Total Value headers sort the rows. Tap again to reverse the arrow.
- **Export holdings** in Settings saves a dated file. On an iPhone or iPad it uses the share sheet when the browser offers one. **Import from file** checks the file, tells you the count, and asks before it replaces what is on the device. The file does not contain the Finnhub key. Holdings live only on this device, and Export is the backup.

## Files

| File | Role |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The screen |
| `calc.js` | The arithmetic |
| `quotes.js` | Finnhub quote requests |
| `sample.js` | Example rows |
| `storage.js` | On-device storage, including the Finnhub key |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install and offline |
| `server.js` | Local preview only |
| `test/` | Checks for the figures, adding a row, editing a row, quotes, filter, and backup |
