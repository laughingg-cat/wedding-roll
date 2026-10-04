"use client";

import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";

export function WelcomeForm({ eventName, onJoined }: { eventName: string; onJoined: (path: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!displayName.trim() || !consentAccepted) {
      setError("Enter your name and accept the photo notice.");
      return;
    }
    setStatus("submitting");
    try {
      const response = await fetch("/api/guest/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, consentAccepted }),
      });
      const body = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok || !body.redirectTo) throw new Error(body.error || "Unable to join right now");
      setStatus("success");
      onJoined(body.redirectTo);
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Unable to join right now");
    }
  }

  return (
    <main className="welcome-shell">
      <section className="welcome-photo" aria-label={`${eventName} wedding photo`}>
        <div className="welcome-copy">
          <h1>Our<br />Wedding<br />Roll</h1>
          <p>Same night.<br />Different perspectives.<br />All part of the story.</p>
        </div>
      </section>
      <form className="welcome-sheet" onSubmit={submit} noValidate>
        <p className="event-name">{eventName}</p>
        <label className="field-label" htmlFor="display-name">Your name</label>
        <input
          id="display-name"
          autoComplete="name"
          maxLength={60}
          placeholder="Your name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <label className="consent-row">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
          />
          <span>I agree to share the photos I take from this wedding on Our Wedding Roll.</span>
        </label>
        <p className="form-message" role="status">
          {error ?? (status === "success" ? "You’re in. Opening the camera…" : "")}
        </p>
        <button className="primary-button" type="submit" disabled={status === "submitting" || status === "success"}>
          <span>{status === "submitting" ? "Joining…" : "Enter the camera"}</span>
          <ArrowRight aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
        <p className="privacy-note">Your name is shown beside your photos. Location metadata is removed.</p>
      </form>
    </main>
  );
}

