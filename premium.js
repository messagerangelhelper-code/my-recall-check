// Premium for My Recall Check, paid through CashCow (Stripe checkout).
// After paying, Stripe sends the person back here with ?session_id=..., and the
// app asks CashCow whether that purchase is paid (and, for subscriptions, still active).
// Premium is remembered on this phone; it's re-checked every few days.
import { currentToken } from "./account.js";

const API = "https://cashcow-reviews-api.onrender.com";
const APP = "recallcheck";
const KEY = "mrc-premium";
const RECHECK_MS = 3 * 24 * 60 * 60 * 1000;

export const PLANS = [
  { id: "mrc_monthly", label: "Monthly", price: "$1.99", per: "/month" },
  { id: "mrc_yearly", label: "Yearly", price: "$14.99", per: "/year", note: "Save 37%", best: true },
  { id: "mrc_lifetime", label: "Lifetime", price: "$29.99", per: "one time", note: "Pay once" },
];

export const PREMIUM_FEATURES = [
  "My Garage for up to 10 vehicles: the whole family's cars, trucks and motorcycles",
  "Every vehicle re-checked automatically each time you open the app, with new recalls flagged",
  "Mark recalls as fixed and keep a record for each vehicle",
];

export const PREMIUM_THANKS = "My Garage now holds up to 10 vehicles, and every one is checked automatically.";
export const PREMIUM_FREE_NOTE = "Recall lookups, safety warnings and one vehicle in My Garage stay free. Premium adds:";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

function write(v) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage not available */
  }
}

export function isPremium() {
  const s = read();
  return !!(s && s.premium);
}

async function verify(sessionId) {
  const res = await fetch(`${API}/api/verify-session?session_id=${encodeURIComponent(sessionId)}&app=${APP}`);
  if (!res.ok) throw new Error("verify failed");
  return res.json();
}

// Runs the check only once per page load, even if asked twice.
let once = null;
export function checkPremiumOnce() {
  if (!once) once = checkPremium();
  return once;
}

// Call once when the app opens. Returns "activated", "expired" or null.
export async function checkPremium() {
  const params = new URLSearchParams(window.location.search);
  const fresh = params.get("session_id");
  if (fresh) {
    params.delete("session_id");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    try {
      const r = await verify(fresh);
      if (r.premium) {
        write({ premium: true, sessionId: fresh, plan: r.plan || "", checkedAt: Date.now() });
        return "activated";
      }
    } catch {
      // CashCow may be waking up; keep the session so we can try again next time.
      write({ premium: false, sessionId: fresh, checkedAt: 0 });
      return null;
    }
  }

  const s = read();
  if (s && s.sessionId && s.source !== "account" && Date.now() - (s.checkedAt || 0) >= RECHECK_MS) {
    try {
      const r = await verify(s.sessionId);
      write({ ...s, premium: !!r.premium, plan: r.plan || s.plan, checkedAt: Date.now() });
      if (s.premium && !r.premium) return (await syncAccount()) === "activated" ? null : "expired";
      if (!s.premium && r.premium) return "activated";
    } catch {
      /* offline or server asleep: keep what we have */
    }
  }
  return syncAccount();
}

// Signed in with a CashCow account? Then Premium comes from the account, so it
// works on every device. A purchase made on this phone before signing in is
// attached to the account the first time they sign in here.
// Returns "activated", "expired" or null.
export async function syncAccount() {
  const token = await currentToken();
  const s = read();
  if (!token) {
    // Signed out: Premium that came from the account stays with the account.
    if (s && s.source === "account" && s.premium) {
      write(s.sessionId ? { ...s, premium: false, source: "phone", checkedAt: 0 } : null);
      return "expired";
    }
    return null;
  }
  const auth = { Authorization: `Bearer ${token}` };
  if (s && s.sessionId && s.premium && !s.claimed) {
    try {
      const res = await fetch(`${API}/api/entitlements/claim?app=${APP}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ session_id: s.sessionId }),
      });
      if (res.ok || res.status === 409) write({ ...read(), claimed: true });
    } catch {
      /* try again next time */
    }
  }
  try {
    const res = await fetch(`${API}/api/entitlements?app=${APP}`, { headers: auth });
    if (!res.ok) return null;
    const r = await res.json();
    const before = read();
    if (r.premium) {
      write({ ...(before || {}), premium: true, source: before && before.premium && before.source !== "account" ? before.source || "phone" : "account", plan: r.plan || "", accountCheckedAt: Date.now() });
      return before && before.premium ? null : "activated";
    }
    if (before && before.source === "account" && before.premium) {
      write({ ...before, premium: false });
      return "expired";
    }
  } catch {
    /* offline: keep what we have */
  }
  return null;
}

// Sends the person to Stripe checkout. Throws a friendly message on failure.
export async function startCheckout(planId) {
  let res;
  const token = await currentToken();
  try {
    res = await fetch(`${API}/api/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ plan: planId }),
    });
  } catch {
    throw new Error("Couldn't reach checkout. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.detail || "Checkout isn't available right now. Please try again in a minute.");
  window.location.href = data.url;
}
