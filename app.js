import { EMPTY_MARK, holdingLabel, isCashHolding, isCompleteHolding, presentHeader, presentPortfolio, sortRows } from "./calc.js";
import {
  OFFLINE_MESSAGE,
  applyQuotes,
  formatUpdatedAt,
  uniqueTickers,
  updateQuotes,
  warningFor,
} from "./quotes.js";
import {
  addHolding,
  clearExampleData,
  deleteHolding,
  exportFilename,
  findDuplicate,
  holdingsForView,
  isInfoTotal,
  loadApiKey,
  loadTwelveKey,
  portfolioSubtotals,
  loadFilter,
  loadState,
  normalizePortfolio,
  normalizeTicker,
  parseImport,
  portfolioNames,
  replaceHoldings,
  saveApiKey,
  saveTwelveKey,
  saveFilter,
  saveState,
  toExportRecord,
  updateHolding,
} from "./storage.js";

const notice = document.querySelector("#notice");
const noticeTitle = document.querySelector("#notice-title");
const noticeBody = document.querySelector("#notice-body");
const tbody = document.querySelector("#holdings");
const addDialog = document.querySelector("#add-dialog");
const addForm = document.querySelector("#add-form");

let state = { ok: false, isExample: false, holdings: [], persisted: true };
let lastFocus = null;
let addReturnFocus = null;
let settingsReturnFocus = null;
let formMode = { kind: "add", id: null };
let entryKind = "holding";
let quoteNotice = { warning: "", offline: false };
let updating = false;
let viewFilter = "";
let sortState = { key: null, dir: "asc" };
let pendingImport = null;

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

function hideFormError() {
  const error = document.getElementById("add-error");
  error.hidden = true;
  error.textContent = "";
  for (const el of addForm.elements) {
    if (el.removeAttribute) el.removeAttribute("aria-invalid");
  }
}

function showFormError(message, field) {
  const error = document.getElementById("add-error");
  error.hidden = false;
  error.textContent = message;
  const input = field ? addForm.elements.namedItem(field) : null;
  if (input && input.focus) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
}

function fillPortfolioList() {
  const names = portfolioNames(state.holdings);
  const list = document.getElementById("portfolio-names");
  const group = document.getElementById("portfolio-suggestions");
  list.replaceChildren();
  group.replaceChildren();
  group.hidden = names.length === 0;
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    list.append(option);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = name;
    group.append(button);
  }
}

function fieldNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function showDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.classList.remove("fallback");
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.classList.add("fallback");
    dialog.setAttribute("open", "");
  }
}

const HOLDING_INTRO = "The ticker is 1 to 5 letters. A period or a hyphen is allowed. Leave a price blank and the table shows a dash.";
const CASH_INTRO = "Enter the portfolio and the dollar amount. Cash is not a ticker.";

function setEntry(kind) {
  entryKind = kind === "cash" ? "cash" : "holding";
  const cash = entryKind === "cash";
  const editing = formMode.kind === "edit";
  document.getElementById("field-amount").hidden = !cash;
  for (const id of ["field-ticker", "field-shares", "field-cost", "field-last", "field-prev"]) {
    document.getElementById(id).hidden = cash;
  }
  document.getElementById("add-kind").hidden = editing;
  document.getElementById("kind-holding").setAttribute("aria-pressed", cash ? "false" : "true");
  document.getElementById("kind-cash").setAttribute("aria-pressed", cash ? "true" : "false");
  document.getElementById("add-title").textContent = editing
    ? cash
      ? "Edit cash"
      : "Edit holding"
    : cash
      ? "Add cash"
      : "Add a holding";
  document.getElementById("add-intro").hidden = editing;
  document.getElementById("add-intro").textContent = cash ? CASH_INTRO : HOLDING_INTRO;
  document.getElementById("edit-intro").hidden = !editing;
  document.getElementById("edit-intro").textContent = cash
    ? "Change the portfolio or the amount, then save."
    : "The ticker stays as saved. Change the other fields, then save.";
  document.getElementById("ticker-lock-note").hidden = cash || !editing;
  document.getElementById("add-ticker").readOnly = editing && !cash;
  document.getElementById("add-ticker").setAttribute("aria-readonly", editing && !cash ? "true" : "false");
  const removeLabel = cash ? "Delete cash" : "Delete holding";
  document.getElementById("add-delete").textContent = removeLabel;
  document.getElementById("delete-confirm-yes").textContent = removeLabel;
}

function setFormChrome(mode) {
  formMode = mode;
  const editing = mode.kind === "edit";
  setEntry(mode.entry || "holding");
  document.getElementById("add-delete").hidden = !editing;
  document.getElementById("form-actions").hidden = false;
  document.getElementById("delete-confirm").hidden = true;
}

function openAdd(trigger) {
  if (!state.ok) {
    showNotice(
      "Add a holding",
      "Holdings saved on this device could not be read. They were left untouched.",
      trigger,
    );
    return;
  }
  addForm.reset();
  hideFormError();
  setFormChrome({ kind: "add", id: null, entry: "holding" });
  document.getElementById("add-replaces").hidden = !state.isExample;
  fillPortfolioList();
  addReturnFocus = trigger || null;
  showDialog(addDialog);
  document.getElementById("add-ticker").focus();
}

function openEdit(holding, trigger) {
  if (!state.ok) {
    showNotice(
      "Edit holding",
      "Holdings saved on this device could not be read. They were left untouched.",
      trigger,
    );
    return;
  }
  if (!holding || !holding.id) {
    showNotice("Edit holding", "That holding is not on this device.", trigger);
    return;
  }
  addForm.reset();
  hideFormError();
  setFormChrome({ kind: "edit", id: holding.id, entry: isCashHolding(holding) ? "cash" : "holding" });
  document.getElementById("add-replaces").hidden = true;
  fillPortfolioList();
  addForm.elements.portfolio.value = holding.portfolio;
  if (isCashHolding(holding)) {
    addForm.elements.amount.value = fieldNumber(holding.amount);
  } else {
    addForm.elements.ticker.value = holding.ticker;
    addForm.elements.shares.value = fieldNumber(holding.shares);
    addForm.elements.costBasis.value = fieldNumber(holding.costBasis);
    addForm.elements.lastPrice.value = fieldNumber(holding.lastPrice);
    addForm.elements.previousClose.value = fieldNumber(holding.previousClose);
  }
  addReturnFocus = trigger || null;
  showDialog(addDialog);
  document.getElementById(isCashHolding(holding) ? "add-amount" : "add-portfolio").focus();
}

function restoreAddFocus() {
  if (addReturnFocus && document.contains(addReturnFocus)) addReturnFocus.focus();
  addReturnFocus = null;
}

function closeAdd() {
  if (typeof addDialog.close === "function" && addDialog.open) {
    addDialog.close();
    return;
  }
  addDialog.removeAttribute("open");
  addDialog.classList.remove("fallback");
  restoreAddFocus();
}

addDialog.addEventListener("close", restoreAddFocus);
document.querySelector("#add-cancel").addEventListener("click", closeAdd);

document.querySelector("#portfolio-suggestions").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const input = document.getElementById("add-portfolio");
  input.value = button.textContent;
  hideFormError();
  input.focus();
});

document.querySelector("#add-ticker").addEventListener("input", (event) => {
  const next = event.target.value.toUpperCase().replace(/\s+/g, "");
  if (next !== event.target.value) event.target.value = next;
});

addForm.addEventListener("input", () => {
  if (!document.getElementById("add-error").hidden) hideFormError();
});

function focusHolding(holding) {
  const label = holdingLabel(holding);
  for (const button of tbody.querySelectorAll(".ticker-button")) {
    if (button.textContent === label && button.dataset.portfolio === holding.portfolio) {
      button.closest("tr")?.scrollIntoView({ block: "nearest" });
      button.focus();
      return;
    }
  }
}

function persist(next, { keepQuoteNotice = false } = {}) {
  try {
    saveState(next);
    next.persisted = true;
  } catch {
    next.persisted = false;
  }
  if (!keepQuoteNotice) quoteNotice = { warning: "", offline: false };
  state = next;
  render(state);
}

function formValues() {
  if (entryKind === "cash") {
    return {
      kind: "cash",
      portfolio: addForm.elements.portfolio.value,
      amount: addForm.elements.amount.value,
    };
  }
  return {
    ticker: addForm.elements.ticker.value,
    portfolio: addForm.elements.portfolio.value,
    shares: addForm.elements.shares.value,
    costBasis: addForm.elements.costBasis.value,
    lastPrice: addForm.elements.lastPrice.value,
    previousClose: addForm.elements.previousClose.value,
  };
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result =
    formMode.kind === "edit"
      ? updateHolding(state, formMode.id, formValues())
      : addHolding(state, formValues());
  if (!result.ok) {
    showFormError(result.message, result.field);
    return;
  }
  addReturnFocus = null;
  persist(result.state);
  closeAdd();
  focusHolding(result.holding);
});

document.getElementById("kind-holding").addEventListener("click", () => {
  if (formMode.kind === "edit") return;
  setEntry("holding");
  hideFormError();
  document.getElementById("add-ticker").focus();
});

document.getElementById("kind-cash").addEventListener("click", () => {
  if (formMode.kind === "edit") return;
  setEntry("cash");
  hideFormError();
  document.getElementById("add-amount").focus();
});

document.querySelector("#add-delete").addEventListener("click", () => {
  const holding = (state.holdings || []).find((row) => row && row.id === formMode.id);
  if (!holding) {
    showFormError("That holding is not on this device.");
    return;
  }
  document.getElementById("delete-confirm-text").textContent =
    `Delete ${holdingLabel(holding)} in ${holding.portfolio}? This removes it from this device.`;
  document.getElementById("form-actions").hidden = true;
  document.getElementById("add-delete").hidden = true;
  document.getElementById("delete-confirm").hidden = false;
  document.getElementById("delete-confirm-yes").focus();
});

document.querySelector("#delete-confirm-no").addEventListener("click", () => {
  document.getElementById("delete-confirm").hidden = true;
  document.getElementById("form-actions").hidden = false;
  document.getElementById("add-delete").hidden = formMode.kind !== "edit";
  document.getElementById("add-delete").focus();
});

document.querySelector("#delete-confirm-yes").addEventListener("click", () => {
  const result = deleteHolding(state, formMode.id);
  if (!result.ok) {
    showFormError(result.message);
    return;
  }
  addReturnFocus = null;
  persist(result.state);
  closeAdd();
  document.querySelector("#add-holding").focus();
});

document.querySelector("#add-holding").addEventListener("click", (event) => {
  openAdd(event.currentTarget);
});

document.querySelector("#clear-example").addEventListener("click", () => {
  const result = clearExampleData(state);
  if (!result.ok) return;
  persist(result.state);
  document.querySelector("#add-holding").focus();
});

const settingsDialog = document.querySelector("#settings-dialog");

function restoreSettingsFocus() {
  if (settingsReturnFocus && document.contains(settingsReturnFocus)) settingsReturnFocus.focus();
  settingsReturnFocus = null;
}

function closeSettings() {
  if (typeof settingsDialog.close === "function" && settingsDialog.open) {
    settingsDialog.close();
    return;
  }
  settingsDialog.removeAttribute("open");
  settingsDialog.classList.remove("fallback");
  restoreSettingsFocus();
}

settingsDialog.addEventListener("close", restoreSettingsFocus);
document.querySelector("#settings-cancel").addEventListener("click", closeSettings);

function resetImportPrompt() {
  pendingImport = null;
  document.getElementById("import-confirm").hidden = true;
  document.getElementById("import-confirm-text").textContent = "";
  const error = document.getElementById("import-error");
  error.hidden = true;
  error.textContent = "";
  document.getElementById("import-file").value = "";
}

function resetKeyField(inputId, buttonId, value) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(buttonId);
  input.type = "password";
  input.value = value;
  toggle.textContent = "Show";
  toggle.setAttribute("aria-pressed", "false");
}

function openSettings(trigger, prompt) {
  resetKeyField("finnhub-key", "toggle-key", loadApiKey());
  resetKeyField("twelve-key", "toggle-twelve-key", loadTwelveKey());
  const note = document.getElementById("settings-prompt");
  note.hidden = !prompt;
  note.textContent = prompt || "";
  resetImportPrompt();
  settingsReturnFocus = trigger || null;
  showDialog(settingsDialog);
  document.getElementById("finnhub-key").focus();
}

document.querySelector("#open-settings").addEventListener("click", (event) => {
  openSettings(event.currentTarget);
});

function bindKeyToggle(inputId, buttonId) {
  document.getElementById(buttonId).addEventListener("click", () => {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(buttonId);
    const showing = input.type === "password";
    input.type = showing ? "text" : "password";
    toggle.textContent = showing ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", showing ? "true" : "false");
    input.focus();
  });
}

bindKeyToggle("finnhub-key", "toggle-key");
bindKeyToggle("twelve-key", "toggle-twelve-key");

document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const note = document.getElementById("settings-prompt");
  try {
    saveApiKey(document.getElementById("finnhub-key").value);
    saveTwelveKey(document.getElementById("twelve-key").value);
  } catch {
    note.hidden = false;
    note.textContent = "This browser blocked on-device storage, so the key was not saved.";
    return;
  }
  closeSettings();
});

function setUpdating(on) {
  const button = document.getElementById("update-prices");
  button.disabled = on;
  button.classList.toggle("is-busy", on);
  button.setAttribute("aria-busy", on ? "true" : "false");
  button.querySelector(".update-label").textContent = on ? "Updating" : "Update";
}

function renderQuoteStatus(next = state) {
  const stamp = typeof next.updatedAt === "string" ? next.updatedAt : "";
  const when = stamp ? new Date(stamp) : null;
  const valid = Boolean(when && !Number.isNaN(when.getTime()));
  const updated = document.getElementById("updated-at");
  updated.hidden = !valid;
  updated.textContent = valid ? formatUpdatedAt(when) : "";
  const warning = document.getElementById("quote-warning");
  warning.hidden = !quoteNotice.warning;
  warning.textContent = quoteNotice.warning;
  const offline = document.getElementById("offline-banner");
  offline.hidden = !quoteNotice.offline;
  offline.textContent = quoteNotice.offline ? OFFLINE_MESSAGE : "";
  document.getElementById("example-price-note").hidden = valid;
}

async function runUpdate(trigger) {
  if (updating) return;
  if (!state.ok) {
    showNotice(
      "Update prices",
      "Holdings saved on this device could not be read. They were left untouched.",
      trigger,
    );
    return;
  }
  const apiKey = loadApiKey();
  if (!apiKey) {
    openSettings(trigger, "Paste your Finnhub key to update prices.");
    return;
  }
  if (uniqueTickers(state.holdings).length === 0) {
    showNotice("Update prices", "There are no holdings to update.", trigger);
    return;
  }

  updating = true;
  setUpdating(true);
  quoteNotice = { warning: "", offline: false };
  renderQuoteStatus(state);
  let result;
  try {
    result = await updateQuotes({
      holdings: state.holdings,
      apiKey,
      twelveKey: loadTwelveKey(),
      online: navigator.onLine !== false,
    });
  } catch (error) {
    console.error(error);
    const names = uniqueTickers(state.holdings);
    result = { reason: "partial", updated: [], failed: names, holdings: state.holdings };
  } finally {
    updating = false;
    setUpdating(false);
  }

  const stillThere = new Set(uniqueTickers(state.holdings));
  const failed = (result.failed || []).filter((ticker) => stillThere.has(ticker));
  quoteNotice = {
    warning: result.reason === "offline" ? "" : warningFor(failed),
    offline: result.reason === "offline",
  };
  if (!result.updated || result.updated.length === 0) {
    render(state);
    return;
  }

  const byTicker = {};
  for (const ticker of result.updated) {
    const row = (result.holdings || []).find((item) => item && normalizeTicker(item.ticker) === ticker);
    if (!row) continue;
    byTicker[ticker] = { ok: true, lastPrice: row.lastPrice, previousClose: row.previousClose };
  }
  const merged = applyQuotes(state.holdings, byTicker);
  persist(
    {
      ...state,
      holdings: merged.holdings,
      updatedAt: new Date().toISOString(),
    },
    { keepQuoteNotice: true },
  );
}

document.querySelector("#update-prices").addEventListener("click", (event) => {
  runUpdate(event.currentTarget);
});

function showImportError(message) {
  const error = document.getElementById("import-error");
  error.hidden = false;
  error.textContent = message;
  document.getElementById("import-confirm").hidden = true;
  pendingImport = null;
}

async function exportHoldingsFile() {
  if (!state.ok) {
    showImportError("Holdings saved on this device could not be read. They were left untouched.");
    return;
  }
  if (!state.holdings || state.holdings.length === 0) {
    showImportError("There are no holdings to export.");
    return;
  }
  const record = toExportRecord(state);
  const name = exportFilename(new Date());
  const file = new File([JSON.stringify(record, null, 2)], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#export-holdings").addEventListener("click", () => {
  exportHoldingsFile();
});

document.querySelector("#import-holdings").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.querySelector("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch {
    showImportError("This file could not be read.");
    return;
  }
  const parsed = parseImport(text);
  if (!parsed.ok) {
    showImportError(parsed.message);
    return;
  }
  pendingImport = parsed;
  document.getElementById("import-error").hidden = true;
  const confirm = document.getElementById("import-confirm");
  document.getElementById("import-confirm-text").textContent =
    `This file has ${parsed.count} ${parsed.count === 1 ? "holding" : "holdings"}. Replace the holdings on this device?`;
  confirm.hidden = false;
  document.getElementById("import-yes").focus();
});

document.querySelector("#import-no").addEventListener("click", () => {
  resetImportPrompt();
});

document.querySelector("#import-yes").addEventListener("click", () => {
  if (!pendingImport) return;
  const result = replaceHoldings(state, pendingImport.holdings, pendingImport.updatedAt);
  if (!result.ok) {
    showImportError(result.message);
    return;
  }
  pendingImport = null;
  persist(result.state);
  closeSettings();
});

document.querySelector("#portfolio-filter").addEventListener("click", (event) => {
  const chip = event.target.closest(".filter-chip");
  if (!chip) return;
  viewFilter = chip.dataset.portfolio || "";
  try {
    saveFilter(viewFilter);
  } catch {
    /* The choice still applies for this visit. */
  }
  render(state);
});

document.querySelector("thead").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort]");
  if (!button) return;
  const key = button.dataset.sort;
  if (sortState.key === key) sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  else sortState = { key, dir: key === "ticker" ? "asc" : "desc" };
  render(state);
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

function metricCell(percentText, dollarText, sign) {
  if (percentText === EMPTY_MARK) {
    const node = cell("td", "num flat", EMPTY_MARK);
    node.setAttribute("aria-label", "No price yet");
    return node;
  }
  return changeCell(percentText, dollarText, sign);
}

function renderSummary(presented) {
  const summary = document.getElementById("summary");
  summary.removeAttribute("aria-busy");
  summary.replaceChildren(
    summaryCard("Total value", presented.totalValueText, null, "total"),
    summaryCard(
      "Today",
      presented.todayPercentText,
      presented.todayDollar == null ? null : presented.todayDollarText,
      presented.todaySign,
    ),
    summaryCard(
      "Life",
      presented.lifePercentText,
      presented.lifeDollar == null ? null : presented.lifeDollarText,
      presented.lifeSign,
    ),
  );
}

function summaryCard(label, primary, secondary, kind) {
  const card = document.createElement("article");
  card.className = `summary-card ${kind}`;
  const kicker = cell("p", "kicker", label);
  const figure = cell("p", "figure", primary);
  if (primary === EMPTY_MARK) figure.setAttribute("aria-label", "No price yet");
  card.append(kicker, figure);
  if (secondary) {
    card.append(cell("p", "figure secondary", secondary));
  }
  return card;
}

function renderSortHeaders() {
  for (const button of document.querySelectorAll("[data-sort]")) {
    const on = sortState.key === button.dataset.sort;
    const th = button.closest("th");
    th.setAttribute("aria-sort", on ? (sortState.dir === "asc" ? "ascending" : "descending") : "none");
    button.querySelector(".arrow").textContent = on ? (sortState.dir === "asc" ? " ▲" : " ▼") : "";
  }
}

function renderFilters(holdings, active) {
  const bar = document.getElementById("portfolio-filter");
  const names = portfolioNames(holdings);
  bar.replaceChildren();
  if (names.length === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const choices = [{ label: "All", value: "" }, ...names.map((name) => ({ label: name, value: name }))];
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = choice.label;
    button.dataset.portfolio = choice.value;
    const pressed = choice.value === "" ? active === "" : active.toLowerCase() === choice.value.toLowerCase();
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    bar.append(button);
  }
}

function metricLine(label, percentText, dollarText) {
  if (percentText === EMPTY_MARK) return `${label} ${EMPTY_MARK}`;
  return `${label} ${percentText} ${dollarText}`;
}

function renderSubtotals(subtotals, active) {
  const section = document.getElementById("subtotals");
  section.replaceChildren();
  if (active || !subtotals || subtotals.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  for (const presented of subtotals) {
    const line = document.createElement("article");
    line.className = "subtotal-line";
    const title = document.createElement("h3");
    title.textContent = presented.name;
    const value = cell(
      "p",
      presented.totalValue == null ? "flat" : "",
      presented.totalValue == null ? `Total value ${EMPTY_MARK}` : `Total value ${presented.totalValueText}`,
    );
    const today = cell(
      "p",
      presented.todaySign,
      metricLine("Today", presented.todayPercentText, presented.todayDollarText),
    );
    const life = cell(
      "p",
      presented.lifeSign,
      metricLine("Life", presented.lifePercentText, presented.lifeDollarText),
    );
    line.append(title, value, today, life);
    section.append(line);
  }
}

function renderTable(presented) {
  tbody.replaceChildren();
  renderSortHeaders();
  presented.rows.forEach((row, index) => {
    const holdingRow = document.createElement("tr");
    holdingRow.className = index % 2 === 1 ? "holding band" : "holding";
    if (isInfoTotal(row.holding)) holdingRow.classList.add("info-total");

    const equity = cell("th", "equity");
    equity.scope = "row";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ticker-button";
    const label = holdingLabel(row.holding);
    toggle.textContent = label;
    toggle.dataset.ticker = isCashHolding(row.holding) ? "" : row.holding.ticker;
    toggle.dataset.portfolio = row.holding.portfolio;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", `edit-${index}`);
    toggle.setAttribute(
      "aria-label",
      `${label} in ${row.holding.portfolio}. Show the edit choice.`,
    );
    equity.append(toggle);

    const portfolio = cell("td", "portfolio", row.holding.portfolio);
    const shares = cell("td", "num", row.sharesText);
    const cost = cell("td", "num", row.costBasisText);
    const today = metricCell(row.todayPercentText, row.todayDollarText, row.todaySign);
    const life = metricCell(row.lifePercentText, row.lifeDollarText, row.lifeSign);
    const total = cell("td", row.totalValue == null ? "num total flat" : "num total", row.totalValueText);
    if (row.totalValue == null) total.setAttribute("aria-label", "No price yet");

    holdingRow.append(equity, portfolio, shares, cost, today, life, total);

    const editRow = document.createElement("tr");
    editRow.className = "edit-slot";
    editRow.id = `edit-${index}`;
    editRow.hidden = true;

    const editCell = cell("td", "edit-span");
    editCell.colSpan = 7;
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button-primary edit-choice";
    editButton.textContent = "Edit";
    editButton.dataset.id = row.holding.id || "";
    editButton.dataset.ticker = isCashHolding(row.holding) ? "" : row.holding.ticker;
    editButton.dataset.portfolio = row.holding.portfolio;
    editButton.setAttribute(
      "aria-label",
      `Edit ${holdingLabel(row.holding)} in ${row.holding.portfolio}`,
    );
    editCell.append(editButton);
    editRow.append(editCell);

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
    const holding =
      (state.holdings || []).find((row) => row && edit.dataset.id && row.id === edit.dataset.id) ||
      findDuplicate(state.holdings, edit.dataset.ticker, edit.dataset.portfolio);
    openEdit(holding, edit);
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

function render(next) {
  document.title = next.isExample ? "Portfolio (example data)" : "Portfolio";
  renderQuoteStatus(next);
  show("example-banner", next.isExample === true);
  show("storage-banner", next.persisted === false);
  show("error-banner", next.ok === false);

  if (!next.ok) {
    document.getElementById("summary").replaceChildren();
    document.getElementById("summary").removeAttribute("aria-busy");
    show("legend", false);
    show("table-card", false);
    show("empty", false);
    show("skipped-banner", false);
    show("portfolio-filter", false);
    show("subtotals", false);
    return;
  }

  const good = [];
  let skipped = 0;
  for (const holding of next.holdings) {
    if (isCompleteHolding(holding)) good.push(holding);
    else skipped += 1;
  }
  show("skipped-banner", skipped > 0);

  const names = portfolioNames(good);
  const match = names.find((name) => name.toLowerCase() === normalizePortfolio(viewFilter).toLowerCase());
  if (viewFilter && !match) {
    viewFilter = "";
    try {
      saveFilter("");
    } catch {
      /* The visit returns to All. */
    }
  }
  const active = match || "";
  renderFilters(good, active);

  if (good.length === 0) {
    document.getElementById("summary").replaceChildren();
    document.getElementById("summary").removeAttribute("aria-busy");
    show("legend", false);
    show("table-card", false);
    show("subtotals", false);
    show("empty", true);
    return;
  }

  const visible = holdingsForView(good, active);
  // One subtotal per portfolio, each limited to that portfolio's holdings. The header adds those subtotals.
  const subtotals = portfolioSubtotals(visible);
  const header = presentHeader(subtotals);
  const presented = presentPortfolio(visible);
  presented.rows = sortRows(presented.rows, sortState.key, sortState.dir);
  renderSummary(header);
  renderSubtotals(subtotals, active);
  renderTable(presented);
  const heading = active || (next.isExample ? "Example holdings" : "Holdings");
  document.getElementById("table-heading").textContent = heading;
  show("legend", true);
  show("empty", false);
  show("table-card", true);
  updateScrollHint();
}

try {
  state = loadState();
  viewFilter = loadFilter();
  render(state);
} catch (error) {
  console.error(error);
  showFatal("Holdings could not be shown.");
}

if ("serviceWorker" in navigator) {
  const reloadKey = "portfolio-tracker.sw-reload";
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const now = Date.now();
    const previous = Number(sessionStorage.getItem(reloadKey) || 0);
    if (now - previous < 10000) return;
    sessionStorage.setItem(reloadKey, String(now));
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Offline support did not start.", error);
    });
  });
}
