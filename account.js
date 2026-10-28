// CashCow account: one email + password that works in every CashCow app.
// Uses the same Supabase sign-in project as ScamShield. These two values are
// public by design (the "publishable" key only allows sign-in, nothing else).
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wbugdujmydwmzemccbiy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4RYit1aVs5Egh3gJsx2bJA_m6Kje0ES";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export function useAuth() {
  const [session, setSession] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { ready, session, user: session?.user || null, recovering, setRecovering };
}

export async function currentToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  } catch {
    return "";
  }
}
