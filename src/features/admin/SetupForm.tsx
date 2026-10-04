"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Download, ExternalLink } from "lucide-react";

import { deriveSetupDefaults, SHOT_LIMIT_DEFAULT, SHOT_LIMIT_MAX, supportedTimeZones } from "./setup";

type SetupResult = { eventId: string; joinUrl: string; qrSvg: string };

export function OrganizerSetup() {
  const defaults = useMemo(() => deriveSetupDefaults(), []);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timezones = useMemo(() => supportedTimeZones(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      timezone: form.get("timezone"),
      uploadStart: form.get("uploadStart"),
      uploadEnd: form.get("uploadEnd"),
      votingStart: form.get("votingStart"),
      votingEnd: form.get("votingEnd"),
      shotLimit: form.get("shotLimit"),
      secondAdminEmail: form.get("secondAdminEmail") ?? "",
    };
    try {
      const response = await fetch("/api/organizer/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; joinUrl?: string; qrSvg?: string; eventId?: string };
      if (!response.ok || !data.joinUrl) throw new Error(data.error || "Setup failed");
      setResult({ eventId: data.eventId ?? "", joinUrl: data.joinUrl, qrSvg: data.qrSvg ?? "" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <SetupComplete result={result} copied={copied} onCopy={() => { void navigator.clipboard.writeText(result.joinUrl); setCopied(true); }} />;
  }

  return (
    <main className="setup-shell">
      <form className="setup-card" onSubmit={submit} noValidate>
        <span className="eyebrow">First-run setup</span>
        <h1>Create your wedding</h1>
        <p>This becomes the private event your guests join through the QR code.</p>

        <label className="setup-field">
          <span>Wedding name</span>
          <input name="name" required maxLength={120} placeholder="Taylor & Sam" autoComplete="off" />
        </label>

        <label className="setup-field">
          <span>Timezone</span>
          <select name="timezone" defaultValue={defaults.timezone}>
            {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>

        <div className="setup-grid">
          <label className="setup-field">
            <span>Uploads start</span>
            <input name="uploadStart" type="datetime-local" defaultValue={defaults.uploadStart} required />
          </label>
          <label className="setup-field">
            <span>Uploads end</span>
            <input name="uploadEnd" type="datetime-local" defaultValue={defaults.uploadEnd} required />
          </label>
          <label className="setup-field">
            <span>Voting starts</span>
            <input name="votingStart" type="datetime-local" defaultValue={defaults.votingStart} required />
          </label>
          <label className="setup-field">
            <span>Voting ends</span>
            <input name="votingEnd" type="datetime-local" defaultValue={defaults.votingEnd} required />
          </label>
        </div>

        <label className="setup-field">
          <span>Photos each guest can take (1–{SHOT_LIMIT_MAX})</span>
          <input name="shotLimit" type="number" min={1} max={SHOT_LIMIT_MAX} defaultValue={SHOT_LIMIT_DEFAULT} required />
        </label>

        <label className="setup-field">
          <span>Second organizer email <em>(optional)</em></span>
          <input name="secondAdminEmail" type="email" placeholder="partner@example.com" autoComplete="off" />
        </label>

        <p className="form-message" role="status">{error}</p>
        <button className="primary-button" type="submit" disabled={busy}>
          <span>{busy ? "Creating…" : "Create wedding & generate QR"}</span>
          <ArrowRight aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
      </form>
    </main>
  );
}

function SetupComplete({ result, copied, onCopy }: { result: SetupResult; copied: boolean; onCopy: () => void }) {
  function downloadQr() {
    const blob = new Blob([result.qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "wedding-qr.svg";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="setup-shell">
      <section className="setup-card setup-complete">
        <span className="eyebrow">Setup complete</span>
        <h1>Your wedding is live</h1>
        <p>Save this private link and QR code. The link is shown only once — anyone with it can join.</p>

        <div className="qr-panel" dangerouslySetInnerHTML={{ __html: result.qrSvg }} />

        <div className="guest-link-row">
          <code>{result.joinUrl}</code>
          <button type="button" onClick={onCopy}><Copy aria-hidden="true" size={15} />{copied ? "Copied" : "Copy"}</button>
        </div>

        <div className="setup-complete-actions">
          <button className="primary-button" type="button" onClick={downloadQr}><Download aria-hidden="true" size={18} />Download QR</button>
          <a className="secondary-button" href={result.joinUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={17} />Open guest preview</a>
          <a className="secondary-button" href="/organizer"><Check aria-hidden="true" size={17} />Open dashboard</a>
        </div>
      </section>
    </main>
  );
}
