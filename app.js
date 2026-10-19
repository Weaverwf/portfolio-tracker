import { isCompleteHolding, presentPortfolio } from "./calc.js";
import { loadState } from "./storage.js";

const notice = document.querySelector("#notice");
const noticeTitle = document.querySelector("#notice-title");
const noticeBody = document.querySelector("#notice-body");
const tbody = document.querySelector("#holdings");

let lastFocus = null;

function show(id, on) {
  document.getElementById(id).hidden = !on;
}

function showNotice(title, body, returnFocus) {
  noticeTitle.textContent = title;
  noticeBody.textContent = body;
  lastFocus = returnFocus || null;
  if (typeof notice.showModal === "function") {
    notice.classList.remove("fallback");
    if (!notice.open) notice.showModal();
  } else {
    notice.classList.add("fallback");
    notice.setAttribute("open", "");
  }
}

function restoreFocus() {
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}

function closeNotice() {
  if (typeof notice.close === "function" && notice.open) {
    notice.close();
    return;
  }
  notice.removeAttribute("open");
  notice.classList.remove("fallback");
  restoreFocus();
}

notice.addEventListener("close", restoreFocus);
document.querySelector("#notice-close").addEventListener("click", closeNotice);

document.querySelector("#add-holding").addEventListener("click", (event) => {
  showNotice(
    "Add a holding",
    "Adding a holding by ticker is not available in this version.",
    event.currentTarget,
  );
});

document.querySelector("#update-prices").addEventListener("click", (event) => {
  showNotice(
    "Update prices",
    "Live prices are not available in this version. The figures use the prices saved with each holding on this device.",
    event.currentTarget,
  );
});

function cell(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function changeCell(percentText, dollarText, sign) {
  const node = cell("td", `num change ${sign}`);
  const percent = cell("span", "pct", percentText);
  const dollar = cell("span", "dol", dollarText);
  node.append(percent, dollar);
  return node;
}

function renderSummary(presented) {
  const summary = document.getElementById("summary");
  summary.removeAttribute("aria-busy");
  summary.replaceChildren(
    summaryCard("Total value", presented.totalValueText, null, "total"),
    summaryCard("Today", presented.todayPercentText, presented.todayDollarText, presented.todaySign),
    summaryCard("Life", presented.lifePercentText, presented.lifeDollarText, presented.lifeSign),
  );
}

function summaryCard(label, primary, secondary, kind) {
  const card = document.createElement("article");
  card.className = `summary-card ${kind}`;
  const kicker = cell("p", "kicker", label);
  const figure = cell("p", "figure", primary);
  card.append(kicker, figure);
  if (secondary) {
    card.append(cell("p", "figure secondary", secondary));
  }
  return card;
}

function renderTable(presented) {
  tbody.replaceChildren();
  presented.rows.forEach((row, index) => {
    const holdingRow = document.createElement("tr");
    holdingRow.className = index % 2 === 1 ? "holding band" : "holding";

    const equity = cell("th", "equity");
    equity.scope = "row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ticker-button";
    toggle.textContent = row.holding.ticker;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", `edit-${index}`);
    toggle.setAttribute(
      "aria-label",
      `${row.holding.ticker} in ${row.holding.portfolio}. Show the edit choice.`,
    );
    equity.append(toggle);

    const portfolio = cell("td", "portfolio", row.holding.portfolio);
    const shares = cell("td", "num", row.sharesText);
    const cost = cell("td", "num", row.costBasisText);
    const today = changeCell(row.todayPercentText, row.todayDollarText, row.todaySign);
    const life = changeCell(row.lifePercentText, row.lifeDollarText, row.lifeSign);
    const total = cell("td", "num total", row.totalValueText);

    holdingRow.append(equity, portfolio, shares, cost, today, life, total);

    const editRow = document.createElement("tr");
    editRow.className = "edit-slot";
    editRow.id = `edit-${index}`;
    editRow.hidden = true;

    const editCell = cell("td", "equity");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button-primary edit-choice";
    editButton.textContent = "Edit";
    editButton.dataset.ticker = row.holding.ticker;
    editButton.dataset.portfolio = row.holding.portfolio;
    editButton.setAttribute(
      "aria-label",
      `Edit ${row.holding.ticker} in ${row.holding.portfolio}`,
    );
    editCell.append(editButton);

    const rest = cell("td", "edit-rest");
    rest.colSpan = 6;
    editRow.append(editCell, rest);

    tbody.append(holdingRow, editRow);
  });
}

function toggleRow(holdingRow, { focusEdit = false } = {}) {
  const opening = !holdingRow.classList.contains("is-open");
  for (const row of tbody.querySelectorAll("tr.holding")) {
    const isThis = row === holdingRow && opening;
    row.classList.toggle("is-open", isThis);
    const toggle = row.querySelector(".ticker-button");
    toggle.setAttribute("aria-expanded", isThis ? "true" : "false");
    const editRow = row.nextElementSibling;
    editRow.hidden = !isThis;
  }
  if (opening && focusEdit) {
    holdingRow.nextElementSibling.querySelector(".edit-choice").focus();
  }
  updateScrollHint();
}

tbody.addEventListener("click", (event) => {
  const edit = event.target.closest(".edit-choice");
  if (edit) {
    showNotice(
      "Edit",
      `Editing ${edit.dataset.ticker} in ${edit.dataset.portfolio} is not available in this version.`,
      edit,
    );
    return;
  }
  const holdingRow = event.target.closest("tr.holding");
  if (!holdingRow) return;
  const fromKeyboard = event.detail === 0;
  toggleRow(holdingRow, { focusEdit: fromKeyboard });
});

function updateScrollHint() {
  const scroller = document.getElementById("table-scroll");
  const card = document.getElementById("table-card");
  if (card.hidden) return;
  const overflows = scroller.scrollWidth > scroller.clientWidth + 1;
  document.getElementById("scroll-hint").hidden = !overflows;
  scroller.tabIndex = overflows ? 0 : -1;
}

window.addEventListener("resize", updateScrollHint);

function showFatal(message) {
  const summary = document.getElementById("summary");
  summary.removeAttribute("aria-busy");
  summary.replaceChildren();
  const banner = document.getElementById("error-banner");
  banner.hidden = false;
  banner.textContent = message;
}

function render(state) {
  document.title = state.isExample ? "Portfolio (example data)" : "Portfolio";
  show("example-banner", state.isExample);
  show("storage-banner", state.persisted === false);
  show("error-banner", state.ok === false);

  if (!state.ok) {
    document.getElementById("summary").replaceChildren();
    document.getElementById("summary").removeAttribute("aria-busy");
    show("legend", false);
    show("table-card", false);
    show("empty", false);
    show("skipped-banner", false);
    return;
  }

  const good = [];
  let skipped = 0;
  for (const holding of state.holdings) {
    if (isCompleteHolding(holding)) good.push(holding);
    else skipped += 1;
  }
  show("skipped-banner", skipped > 0);

  if (good.length === 0) {
    document.getElementById("summary").replaceChildren();
    document.getElementById("summary").removeAttribute("aria-busy");
    show("legend", false);
    show("table-card", false);
    show("empty", true);
    return;
  }

  const presented = presentPortfolio(good);
  renderSummary(presented);
  renderTable(presented);
  const heading = state.isExample ? "Example holdings" : "Holdings";
  document.getElementById("table-heading").textContent = heading;
  show("legend", true);
  show("empty", false);
  show("table-card", true);
  updateScrollHint();
}

try {
  render(loadState());
} catch (error) {
  console.error(error);
  showFatal("Holdings could not be shown.");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Offline support did not start.", error);
    });
  });
}
