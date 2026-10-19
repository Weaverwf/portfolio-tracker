import { SAMPLE_HOLDINGS } from "./sample.js";

export const STORAGE_KEY = "portfolio-tracker.v1";

function cloneSample() {
  return SAMPLE_HOLDINGS.map((row) => ({ ...row }));
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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ isExample: true, holdings: state.holdings }),
    );
    state.persisted = true;
  } catch {
    state.persisted = false;
  }
  return state;
}
