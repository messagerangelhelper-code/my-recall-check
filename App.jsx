import { useEffect, useRef, useState } from "react";
import { BRAND } from "./brand.js";
import { loadData, saveData } from "./storage.js";
import { getMakes, getModels, decodeVin, getRecalls } from "./api.js";
import Premium from "./Premium.jsx";
import Account from "./Account.jsx";
import { supabase } from "./account.js";
import { isPremium, checkPremiumOnce, syncAccount } from "./premium.js";

const FREE_CARS = 1;
const PREMIUM_CARS = 10;
const AUTO_CHECK_MS = 60 * 60 * 1000; // re-check My Garage at most once an hour
const NHTSA_LOOKUP = "https://www.nhtsa.gov/recalls";
const NHTSA_REPORT = "https://www.nhtsa.gov/report-a-safety-problem";
const NICB_CHECK = "https://www.nicb.org/vincheck";
const NMVTIS = "https://vehiclehistory.bja.ojp.gov/";

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 2 - 1980 }, (_, i) => thisYear + 1 - i);

// "HONDA CIVIC" -> "Honda Civic", keeping short names like BMW or F-150 as they are.
function pretty(text) {
  return String(text || "").split(" ").map((w) => (w.length <= 3 || /[\d-]/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(" ");
}
// "AIR BAGS:FRONTAL" -> "Air Bags: Frontal"
function prettyPart(text) {
  return String(text || "").replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).replace(/:(?=\S)/g, ": ");
}
const carName = (c) => `${c.year} ${pretty(c.make)} ${pretty(c.model)}`;
const carKey = (c) => `${c.year}|${c.make}|${c.model}`.toUpperCase();

function niceDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function ago(ms) {
  if (!ms) return "never";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

function Warnings({ recalls }) {
  const parkIt = recalls.some((r) => r.parkIt);
  const outside = recalls.some((r) => r.parkOutside);
  if (!parkIt && !outside) return null;
  return (
    <div className="danger" role="alert">
      {parkIt && (
        <p><strong>⛔ Do not drive.</strong> NHTSA says vehicles with a recall marked below should not be driven until they're repaired. Call a dealer right away to arrange the free repair.</p>
      )}
      {outside && (
        <p><strong>🔥 Park outside.</strong> A recall marked below has a fire risk. Park outside and away from homes and buildings until it's repaired.</p>
      )}
    </div>
  );
}

function RecallCard({ r, isNew, fixed, onToggleFixed }) {
  return (
    <li className={`card recall${r.parkIt ? " r-parkit" : r.parkOutside ? " r-outside" : ""}${fixed ? " r-fixed" : ""}`}>
      <div className="recall-badges">
        {isNew && <span className="badge badge-new">NEW</span>}
        {r.parkIt && <span className="badge badge-danger">Do not drive</span>}
        {r.parkOutside && <span className="badge badge-danger">Park outside</span>}
        {r.overTheAir && <span className="badge badge-info">Fix by software update</span>}
        {fixed && <span className="badge badge-ok">Marked fixed</span>}
      </div>
      <h3>{prettyPart(r.component) || "Safety recall"}</h3>
      <p className="muted small">{r.date ? `Announced ${niceDate(r.date)} · ` : ""}NHTSA campaign {r.campaign}</p>
      {r.summary && <p>{r.summary}</p>}
      {r.consequence && <p><strong>The risk:</strong> {r.consequence}</p>}
      {r.remedy && <p><strong>The fix:</strong> {r.remedy}</p>}
      {r.notes && (
        <details>
          <summary>More details</summary>
          <p className="small">{r.notes}</p>
        </details>
      )}
      {onToggleFixed && (
        <label className="toggle small-toggle">
          <input type="checkbox" checked={!!fixed} onChange={(e) => onToggleFixed(e.target.checked)} />
          <span>My vehicle has had this repair</span>
        </label>
      )}
    </li>
  );
}

function VinTip({ car }) {
  return (
    <div className="callout">
      <p>
        <strong>These are recalls for all {carName(car)} vehicles.</strong> Some may already be fixed on yours, or may not apply to your exact vehicle.
        To check your own vehicle, enter its VIN at{" "}
        <a href={NHTSA_LOOKUP} target="_blank" rel="noopener noreferrer">NHTSA.gov/recalls</a> or call any {pretty(car.make)} dealer.
      </p>
      <p className="small muted">Safety recall repairs are free at the dealer. Your VIN is on the driver's side of the dashboard (look through the windshield), on the door frame, and on your registration and insurance card.</p>
    </div>
  );
}

// Accident, damage and theft history. There's no free full accident history,
// so this points to the free and low-cost official checks, with the VIN ready to paste.
function HistoryCard({ vin, onCopy }) {
  return (
    <section className="card history">
      <h2>Accident and damage history</h2>
      <p className="muted small">Recalls don't show accidents. These checks do part of the job:</p>
      <ol className="plain">
        <li>
          <strong>Free: stolen or salvage check.</strong> <a href={NICB_CHECK} target="_blank" rel="noopener noreferrer">NICB VINCheck</a> shows if insurers
          reported the vehicle stolen and not recovered, or as salvage. Up to 5 free searches a day.
        </li>
        <li>
          <strong>Low cost: title history.</strong> An <a href={NMVTIS} target="_blank" rel="noopener noreferrer">NMVTIS report</a> (U.S. Department of Justice
          program, from approved providers) shows salvage, junk and flood titles, insurance total losses and the last odometer reading.
        </li>
        <li>
          <strong>Full accident history:</strong> only paid reports such as Carfax or AutoCheck list reported accidents, and even they miss some.
          Buying used? Also ask for repair records and have a mechanic inspect it.
        </li>
      </ol>
      {vin ? (
        <button type="button" className="btn-secondary" onClick={() => onCopy(vin)}>Copy VIN {vin}</button>
      ) : (
        <p className="muted small">These checks need the vehicle's VIN. Tap "Use my VIN" at the top to enter it, and a copy button will appear here.</p>
      )}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [view, setView] = useState("home");
  const [premium, setPremium] = useState(isPremium);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  // Finding a vehicle
  const [mode, setMode] = useState("pick");
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [makes, setMakes] = useState([]);
  const [make, setMake] = useState("");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  // The vehicle being shown
  const [car, setCar] = useState(null);
  const [recalls, setRecalls] = useState([]);
  const [checking, setChecking] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const update = (patch) => setData((d) => { const n = { ...d, ...(typeof patch === "function" ? patch(d) : patch) }; saveData(n); return n; });
  const limit = premium ? PREMIUM_CARS : FREE_CARS;

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--main", BRAND.colors.main);
    root.setProperty("--main-2", BRAND.colors.mainHover);
    root.setProperty("--soft", BRAND.colors.soft);
    document.title = BRAND.name;
    checkPremiumOnce().then((status) => {
      setPremium(isPremium());
      if (status === "activated") setNotice("Premium is active. Thank you! My Garage now holds up to 10 vehicles.");
      else if (status === "expired") setNotice("Your Premium plan has ended. Recall checks and your first vehicle are still free.");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      syncAccount().then((status) => {
        setPremium(isPremium());
        if (status === "activated") setNotice("Welcome back! Premium from your CashCow account is on.");
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { document.documentElement.classList.toggle("big-text", !!data.bigText); }, [data.bigText]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view, car]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  // The free server can take up to a minute to wake up; say so instead of looking stuck.
  useEffect(() => {
    if (!busy && !checking) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [busy, checking]);

  // Automatic check: every vehicle in My Garage, each time the app opens (at most hourly).
  async function checkGarage(force = false) {
    const d = dataRef.current;
    if (!d.garage.length || (!force && Date.now() - (d.lastRun || 0) < AUTO_CHECK_MS)) return;
    setChecking(true);
    const found = [];
    const cars = d.garage.slice(0, isPremium() ? PREMIUM_CARS : FREE_CARS);
    for (const c of cars) {
      try {
        const list = await getRecalls(c.year, c.make, c.model);
        const known = new Set(c.known || []);
        const fresh = list.filter((r) => !known.has(r.campaign)).map((r) => r.campaign);
        if (fresh.length) found.push(`${carName(c)} (${fresh.length})`);
        update((cur) => ({
          garage: cur.garage.map((g) => (g.key === c.key ? {
            ...g,
            recalls: list,
            known: [...known, ...fresh],
            newOnes: [...new Set([...(g.newOnes || []), ...fresh])],
            checkedAt: Date.now(),
            error: "",
          } : g)),
        }));
      } catch (e) {
        update((cur) => ({ garage: cur.garage.map((g) => (g.key === c.key ? { ...g, error: e.message } : g)) }));
      }
    }
    update({ lastRun: Date.now() });
    setChecking(false);
    if (found.length) setNotice(`New recall found: ${found.join(", ")}. Open it in My Garage below.`);
  }

  useEffect(() => { checkGarage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseYear(y) {
    setYear(y); setMake(""); setModel(""); setMakes([]); setModels([]); setError("");
    if (!y) return;
    setBusy("makes");
    try { setMakes(await getMakes(y)); } catch (e) { setError(e.message); } finally { setBusy(""); }
  }
  async function chooseMake(m) {
    setMake(m); setModel(""); setModels([]); setError("");
    if (!m) return;
    setBusy("models");
    try { setModels(await getModels(year, m)); } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  async function showVehicle(v) {
    setError("");
    setBusy("recalls");
    try {
      const list = await getRecalls(v.year, v.make, v.model);
      setCar(v);
      setRecalls(list);
      setView("vehicle");
      // Already in My Garage? Keep it up to date too.
      const saved = data.garage.find((g) => g.key === carKey(v));
      if (saved) {
        const known = new Set(saved.known || []);
        const fresh = list.filter((r) => !known.has(r.campaign)).map((r) => r.campaign);
        update((cur) => ({ garage: cur.garage.map((g) => (g.key === saved.key ? { ...g, recalls: list, known: [...known, ...fresh], newOnes: [...new Set([...(g.newOnes || []), ...fresh])], checkedAt: Date.now(), error: "" } : g)) }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function checkVin(e) {
    e.preventDefault();
    const clean = vin.replace(/[\s-]/g, "").toUpperCase();
    if (clean.length !== 17) return setError("A VIN has exactly 17 letters and numbers. Check it and try again.");
    if (/[IOQ]/.test(clean)) return setError("VINs never use the letters I, O or Q. Did you mean the numbers 1 or 0?");
    setError("");
    setBusy("vin");
    try {
      const v = await decodeVin(clean);
      setBusy("");
      await showVehicle({ year: v.year, make: v.make, model: v.model, vin: v.vin });
      if (v.checkDigitWarning) setToast("That VIN may have a typo. Double-check it against your vehicle.");
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  function saveCar() {
    if (!car) return;
    const key = carKey(car);
    if (data.garage.some((g) => g.key === key)) return setToast("Already in My Garage.");
    if (data.garage.length >= limit) {
      if (!premium) return setView("premium");
      return setToast(`My Garage holds up to ${PREMIUM_CARS} vehicles. Remove one to add another.`);
    }
    update({ garage: [...data.garage, { key, year: car.year, make: car.make, model: car.model, vin: car.vin || "", recalls, known: recalls.map((r) => r.campaign), newOnes: [], fixed: [], checkedAt: Date.now(), addedAt: Date.now() }] });
    setToast("Saved. We'll check it for new recalls every time you open the app.");
  }

  function openSaved(g) {
    update((cur) => ({ garage: cur.garage.map((x) => (x.key === g.key ? { ...x, seenNew: x.newOnes || [], newOnes: [] } : x)) }));
    setCar({ year: g.year, make: g.make, model: g.model, vin: g.vin });
    setRecalls(g.recalls || []);
    setView("vehicle");
    showVehicle({ year: g.year, make: g.make, model: g.model, vin: g.vin });
  }

  // Most urgent first: do not drive, then park outside, then newest.
  const ordered = [...recalls].sort((a, b) => (b.parkIt - a.parkIt) || (b.parkOutside - a.parkOutside) || String(b.date).localeCompare(String(a.date)));
  const savedCar = car ? data.garage.find((g) => g.key === carKey(car)) : null;
  const newSet = new Set(savedCar ? [...(savedCar.newOnes || []), ...(savedCar.seenNew || [])] : []);
  const fixedSet = new Set(savedCar?.fixed || []);
  const toggleFixed = (campaign, on) => update((cur) => ({
    garage: cur.garage.map((g) => (g.key === savedCar.key ? { ...g, fixed: on ? [...new Set([...(g.fixed || []), campaign])] : (g.fixed || []).filter((c) => c !== campaign) } : g)),
  }));
  const removeCar = (key) => update((cur) => ({ garage: cur.garage.filter((g) => g.key !== key) }));
  const loading = busy || checking;
  async function copyVin(v) {
    try {
      await navigator.clipboard.writeText(v);
      setToast("VIN copied. Paste it into the check you open.");
    } catch {
      setToast(`Your VIN: ${v}`);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <button type="button" className="brand" onClick={() => setView("home")} aria-label={`${BRAND.name} home`}>
          <span className="logo" aria-hidden="true">🚗</span>
          <span>{BRAND.name}</span>
        </button>
        <button type="button" className="link light" onClick={() => setView("settings")}>Settings</button>
      </header>

      <main>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" className="link" onClick={() => setNotice("")} aria-label="Dismiss">✕</button>
          </div>
        )}
        {loading && slow && <p className="muted small center">Still working. The recall service can take up to a minute to wake up the first time.</p>}

        {view === "premium" && <Premium premium={premium} onBack={() => setView(car ? "vehicle" : "home")} />}

        {view === "settings" && (
          <>
            <section className="card">
              <h2>Easier reading</h2>
              <label className="toggle">
                <input type="checkbox" checked={!!data.bigText} onChange={(e) => update({ bigText: e.target.checked })} />
                <span>Bigger text and buttons</span>
              </label>
              <button type="button" className="btn-primary" onClick={() => setView("home")}>Done</button>
            </section>
            <Account premium={premium} />
          </>
        )}

        {view === "vehicle" && car && (
          <>
            <button type="button" className="link back" onClick={() => setView("home")}>← Back</button>
            <section className="card">
              <h1>{carName(car)}</h1>
              {car.vin && <p className="muted small">VIN {car.vin}</p>}
              <p className={recalls.length ? "count count-open" : "count count-none"}>
                {busy === "recalls" && !recalls.length ? "Checking…" : recalls.length ? `${recalls.length} safety recall${recalls.length > 1 ? "s" : ""}` : "No safety recalls found ✓"}
              </p>
              {savedCar ? (
                <p className="muted small">In My Garage · checked {ago(savedCar.checkedAt)}</p>
              ) : (
                <button type="button" className="btn-primary wide" onClick={saveCar}>
                  Save to My Garage{!premium && data.garage.length >= FREE_CARS && <span className="pill-premium">Premium</span>}
                </button>
              )}
              {!savedCar && <p className="muted small">Saved vehicles are re-checked automatically every time you open the app, and new recalls are flagged.</p>}
            </section>
            <Warnings recalls={recalls.filter((r) => !fixedSet.has(r.campaign))} />
            {recalls.length > 0 && <VinTip car={car} />}
            <ul className="recall-list">
              {ordered.map((r) => (
                <RecallCard key={r.campaign} r={r} isNew={newSet.has(r.campaign)} fixed={fixedSet.has(r.campaign)}
                  onToggleFixed={savedCar ? (on) => toggleFixed(r.campaign, on) : null} />
              ))}
            </ul>
            {recalls.length === 0 && (
              <section className="card">
                <p>NHTSA has no safety recalls on file for the {carName(car)}. Saved vehicles keep being checked automatically, so you'll know if that changes.</p>
                <p className="muted small">Something wrong with your vehicle that seems unsafe? <a href={NHTSA_REPORT} target="_blank" rel="noopener noreferrer">Report a safety problem to NHTSA</a>.</p>
              </section>
            )}
            <HistoryCard vin={car.vin} onCopy={copyVin} />
            <p className="disclaimer">Recall information from NHTSA, the U.S. National Highway Traffic Safety Administration.</p>
          </>
        )}

        {view === "home" && (
          <>
            <section className="card hero">
              <h1>Is your vehicle under recall?</h1>
              <p className="muted">{BRAND.tagline}</p>
              <div className="chips" role="group" aria-label="How to find your vehicle">
                <button type="button" className={mode === "pick" ? "chip on" : "chip"} aria-pressed={mode === "pick"} onClick={() => { setMode("pick"); setError(""); }}>Year, make & model</button>
                <button type="button" className={mode === "vin" ? "chip on" : "chip"} aria-pressed={mode === "vin"} onClick={() => { setMode("vin"); setError(""); }}>Use my VIN</button>
              </div>

              {mode === "vin" ? (
                <form onSubmit={checkVin} className="finder">
                  <label className="label" htmlFor="vin">Vehicle Identification Number (VIN)</label>
                  <input id="vin" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={21} value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17 letters and numbers" />
                  <p className="muted small">Find it on the driver's side of the dashboard (look through the windshield), the door frame, or your registration or insurance card.</p>
                  <button type="submit" className="btn-primary wide" disabled={!!busy}>{busy === "vin" || busy === "recalls" ? "Checking…" : "Check for recalls"}</button>
                </form>
              ) : (
                <div className="finder">
                  <label className="label" htmlFor="year">Year</label>
                  <select id="year" value={year} onChange={(e) => chooseYear(e.target.value)}>
                    <option value="">Choose the year…</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <label className="label" htmlFor="make">Make</label>
                  <select id="make" value={make} disabled={!year || busy === "makes"} onChange={(e) => chooseMake(e.target.value)}>
                    <option value="">{busy === "makes" ? "Loading makes…" : year ? "Choose the make…" : "Pick a year first"}</option>
                    {makes.map((m) => <option key={m} value={m}>{pretty(m)}</option>)}
                  </select>
                  <label className="label" htmlFor="model">Model</label>
                  <select id="model" value={model} disabled={!make || busy === "models"} onChange={(e) => setModel(e.target.value)}>
                    <option value="">{busy === "models" ? "Loading models…" : make ? "Choose the model…" : "Pick a make first"}</option>
                    {models.map((m) => <option key={m} value={m}>{pretty(m)}</option>)}
                  </select>
                  <button type="button" className="btn-primary wide" disabled={!model || !!busy} onClick={() => showVehicle({ year: Number(year), make, model })}>
                    {busy === "recalls" ? "Checking…" : "Check for recalls"}
                  </button>
                </div>
              )}
              {error && <p className="error">{error}</p>}
            </section>

            <section className="card">
              <div className="row-between">
                <h2>My Garage</h2>
                {data.garage.length > 0 && (
                  <button type="button" className="link" disabled={checking} onClick={() => checkGarage(true)}>{checking ? "Checking…" : "Check now"}</button>
                )}
              </div>
              {data.garage.length === 0 ? (
                <p className="muted">Save your vehicle and we'll check it for new recalls automatically every time you open the app.</p>
              ) : (
                <ul className="garage">
                  {data.garage.map((g, i) => {
                    const locked = i >= limit;
                    const open = (g.recalls || []).filter((r) => !(g.fixed || []).includes(r.campaign));
                    const urgent = open.some((r) => r.parkIt || r.parkOutside);
                    return (
                      <li key={g.key}>
                        <button type="button" className={`garage-car${urgent ? " urgent" : ""}`} onClick={() => (locked ? setView("premium") : openSaved(g))}>
                          <span className="gc-name">{carName(g)}</span>
                          <span className="gc-status">
                            {locked ? <span className="pill-premium">Premium</span>
                              : (g.newOnes || []).length ? <span className="badge badge-new">{g.newOnes.length} NEW</span>
                              : null}
                            {!locked && (open.length
                              ? <span className={urgent ? "badge badge-danger" : "badge badge-open"}>{open.length} open recall{open.length > 1 ? "s" : ""}</span>
                              : <span className="badge badge-ok">No open recalls ✓</span>)}
                          </span>
                          <span className="muted small">{g.error ? g.error : `Checked ${ago(g.checkedAt)}`}</span>
                        </button>
                        <button type="button" className="link danger small" onClick={() => removeCar(g.key)} aria-label={`Remove ${carName(g)}`}>Remove</button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="muted small">{premium ? `Premium: up to ${PREMIUM_CARS} vehicles.` : `Free: ${FREE_CARS} vehicle. Premium: up to ${PREMIUM_CARS}.`}</p>
            </section>

            {!premium && (
              <section className="card premium-teaser">
                <h2>Go Premium</h2>
                <p className="muted">Keep the whole family's vehicles in My Garage, up to 10, all checked automatically. From $1.99 a month.</p>
                <button type="button" className="btn-primary" onClick={() => setView("premium")}>See plans</button>
              </section>
            )}

            <HistoryCard vin={mode === "vin" && vin.replace(/[\s-]/g, "").length === 17 ? vin.replace(/[\s-]/g, "") : ""} onCopy={copyVin} />

            <section className="card">
              <h2>Good to know</h2>
              <ul className="plain">
                <li>Safety recall repairs are free at the dealer.</li>
                <li>"Do not drive" and "Park outside" warnings come straight from NHTSA. Take them seriously.</li>
                <li>Something unsafe that isn't a recall yet? <a href={NHTSA_REPORT} target="_blank" rel="noopener noreferrer">Report it to NHTSA</a> or call the Vehicle Safety Hotline at <a href="tel:18883274236">888-327-4236</a>.</li>
                <li>Got a recall letter, call or text asking for payment? Real recall repairs are free. Check it with <a href="https://cashcowai.online/scamshield.html" target="_blank" rel="noopener noreferrer">ScamShield</a>.</li>
              </ul>
            </section>

            <section className="card">
              <h2>💬 CashCow Community</h2>
              <p className="muted">Ask questions and swap tips with other members. Uses your free CashCow account.</p>
              <a className="btn-secondary link-btn" href="https://cashcowai.online/community.html#general" target="_blank" rel="noopener noreferrer">Open the community</a>
            </section>

            <Account premium={premium} />

            <p className="disclaimer">
              Recall information comes from NHTSA, the U.S. National Highway Traffic Safety Administration, through CashCow.
              My Garage is saved on this phone only.
            </p>
          </>
        )}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
