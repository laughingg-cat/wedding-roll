"use client";

import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";

import { browserSupabase } from "@/lib/supabase/browser";

export function OrganizerLoginForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const email = new FormData(event.currentTarget).get("email")?.toString().trim() ?? "";
    const { error } = await browserSupabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` } });
    setMessage(error ? "This email is not authorized for the wedding." : "Check your email for a secure sign-in link.");
    setBusy(false);
  }
  return <form className="organizer-login-card" onSubmit={submit}><Mail /><span className="eyebrow">Private organizer access</span><h1>Welcome back</h1><p>We’ll email a single-use sign-in link to a pre-approved organizer.</p><label>Email address<input name="email" type="email" autoComplete="email" required /></label><button className="primary-button" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button><p role="status" className="form-message">{message}</p></form>;
}
