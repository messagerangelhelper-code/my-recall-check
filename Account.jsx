import { useState } from "react";
import { supabase, useAuth } from "./account.js";

// Sign in, create an account, or reset a password. One CashCow account works in every CashCow app.
export default function Account({ premium }) {
  const { ready, user, recovering, setRecovering } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim()) return setError("Enter your email address.");
    if (mode !== "reset" && password.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    try {
      const redirect = window.location.origin + window.location.pathname;
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (err) throw err;
        if (!data.session) setMessage("Almost done. Check your email and tap the link to confirm your account, then sign in here.");
      } else if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
        if (err) throw err;
        setMessage("If that email has an account, we've sent a link to set a new password.");
      }
      setPassword("");
    } catch (err) {
      const text = String(err?.message || "");
      if (/invalid login/i.test(text)) setError("That email and password don't match. Try again, or reset your password.");
      else if (/not confirmed/i.test(text)) setError("Confirm your email first. Check your inbox for the link we sent.");
      else if (/rate limit/i.test(text)) setError("Too many tries. Please wait a few minutes and try again.");
      else if (/already registered/i.test(text)) setError("That email already has a CashCow account. Sign in instead.");
      else setError(text || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (err) return setError(err.message);
    setRecovering(false);
    setNewPassword("");
    setMessage("Your new password is saved.");
  }

  return (
    <section className="card account" id="account">
      <h2>Your CashCow account</h2>
      {!ready ? (
        <p className="muted">Loading…</p>
      ) : recovering ? (
        <form onSubmit={saveNewPassword} className="manual">
          <label className="label" htmlFor="acct-newpw">Choose a new password</label>
          <input id="acct-newpw" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
        </form>
      ) : user ? (
        <>
          <p>Signed in as <strong>{user.email}</strong>.</p>
          <p className="muted">
            {premium
              ? "Premium is on. Sign in with this account on any phone or computer to use it there too."
              : "Premium bought while signed in follows you to every phone or computer you sign in on."}
          </p>
          <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </>
      ) : (
        <>
          <p className="muted">
            Optional. Sign in so Premium works on all your devices. The same account works in every CashCow app, including ScamShield.
          </p>
          <div className="chips" role="group" aria-label="Account">
            <button type="button" className={mode === "signin" ? "chip on" : "chip"} aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
            <button type="button" className={mode === "signup" ? "chip on" : "chip"} aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>Create account</button>
          </div>
          <form onSubmit={submit} className="manual">
            <label className="label" htmlFor="acct-email">Email</label>
            <input id="acct-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode !== "reset" && (
              <>
                <label className="label" htmlFor="acct-pw">Password</label>
                <input id="acct-pw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </>
            )}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Please wait…" : mode === "signup" ? "Create free account" : mode === "signin" ? "Sign in" : "Send reset link"}
            </button>
            {mode === "signin" && <button type="button" className="link" onClick={() => setMode("reset")}>Forgot your password?</button>}
            {mode === "reset" && <button type="button" className="link" onClick={() => setMode("signin")}>Back to sign in</button>}
          </form>
        </>
      )}
      {message && <p className="muted" role="status">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
