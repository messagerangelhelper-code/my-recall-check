// Recall lookups go through the CashCow server, which asks NHTSA (the U.S.
// National Highway Traffic Safety Administration) and saves answers for a while.
const API = "https://cashcow-reviews-api.onrender.com";

async function get(path, params) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Couldn't connect. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Recall lookups aren't available right now. Please try again in a minute.");
  return data;
}

export const getMakes = (year) => get("/api/recalls/makes", { year }).then((d) => d.makes || []);
export const getModels = (year, make) => get("/api/recalls/models", { year, make }).then((d) => d.models || []);
export const decodeVin = (vin) => get("/api/recalls/vin", { vin });
export const getRecalls = (year, make, model) => get("/api/recalls/vehicle", { year, make, model }).then((d) => d.recalls || []);
