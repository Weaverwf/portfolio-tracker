# Portfolio

A personal holdings table for one person. It runs in the browser, stores its rows on the device, and can open offline after the first visit. This version fills the table with **example data**: made-up holdings and sample prices, including AAPL in an IRA and a Roth IRA.

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
- Life $ = total value − cost basis
- Life % = life $ ÷ cost basis

Cost basis is the **total dollars** recorded for that row, not a per-share price. For the whole table, Today % is the sum of the row dollars divided by the previous total value. Life % is the sum of the row dollars divided by the sum of cost basis.

If the previous close is zero, or the cost basis is zero, that percent is shown as n/a.

Gains are green and start with +. Losses are red and start with −.

## Where the rows are stored

On the first visit, example holdings are written to `localStorage` under the key `portfolio-tracker.v1`. Later visits read that key. Nothing is uploaded. There is no account number and no API key in this project.

If the saved text cannot be read, the page says so and does not write over it.

To see the example rows again, remove this site's saved data in the browser settings.

The saved shape is:

```json
{
  "isExample": true,
  "holdings": [
    {
      "id": "ex-aapl-ira",
      "ticker": "AAPL",
      "portfolio": "IRA",
      "shares": 40,
      "costBasis": 5200,
      "lastPrice": 228.5,
      "previousClose": 225
    }
  ]
}
```

`lastPrice` and `previousClose` are per share. `costBasis` is the total for the row.

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
- **Update** is visible. Live prices are not in this version. Figures use the prices saved with each row.
- **Add** (the plus) is visible. Adding a ticker is not in this version.
- Tap a row and an **Edit** choice appears. Changing a row is not in this version.

## Files

| File | Role |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The screen |
| `calc.js` | The arithmetic |
| `sample.js` | Example rows |
| `storage.js` | On-device storage |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install and offline |
| `server.js` | Local preview only |
| `test/` | Checks for the figures |
