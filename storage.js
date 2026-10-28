// Saved on this phone only: the vehicles in My Garage and what we've already
// shown you, so new recalls can be flagged.
const KEY = "mrc-data";

const DEFAULTS = { garage: [], bigText: false, lastRun: 0 };

export function loadData() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return { ...DEFAULTS, ...(v && typeof v === "object" ? v : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveData(d) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage not available (private window); the app still works */
  }
}
