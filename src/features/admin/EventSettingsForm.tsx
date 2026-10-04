"use client";

import { FormEvent, useMemo, useState } from "react";
import { Save } from "lucide-react";

import type { AdminSnapshot } from "./admin-types";
import { formatLocalDateTime, SHOT_LIMIT_MAX, supportedTimeZones } from "./setup";

export function EventSettingsForm({ event, onSaved }: { event: AdminSnapshot["event"]; onSaved?: (name: string) => void }) {
  const [name, setName] = useState(event.name);
  const [timezone, setTimezone] = useState(event.timezone);
  const [uploadStart, setUploadStart] = useState(() => formatLocalDateTime(new Date(event.uploadStartsAt), event.timezone));
  const [uploadEnd, setUploadEnd] = useState(() => formatLocalDateTime(new Date(event.uploadEndsAt), event.timezone));
  const [votingStart, setVotingStart] = useState(() => formatLocalDateTime(new Date(event.votingStartsAt), event.timezone));
  const [votingEnd, setVotingEnd] = useState(() => formatLocalDateTime(new Date(event.votingEndsAt ?? event.uploadEndsAt), event.timezone));
  const [shotLimit, setShotLimit] = useState(event.shotLimit);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const timezones = useMemo(() => supportedTimeZones(), []);

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/organizer/event/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone, uploadStart, uploadEnd, votingStart, votingEnd, shotLimit, secondAdminEmail: "" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Settings could not be saved");
      setMessage("Settings saved.");
      onSaved?.(name);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Settings could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings-panel" onSubmit={submit} noValidate>
      <div className="panel-title"><div><span className="eyebrow">Event settings</span><h2>Details & windows</h2></div></div>
      <div className="settings-grid">
        <label className="setup-field"><span>Wedding name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
        <label className="setup-field"><span>Timezone</span>
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
        <label className="setup-field"><span>Uploads start</span><input type="datetime-local" value={uploadStart} onChange={(event) => setUploadStart(event.target.value)} required /></label>
        <label className="setup-field"><span>Uploads end</span><input type="datetime-local" value={uploadEnd} onChange={(event) => setUploadEnd(event.target.value)} required /></label>
        <label className="setup-field"><span>Voting starts</span><input type="datetime-local" value={votingStart} onChange={(event) => setVotingStart(event.target.value)} required /></label>
        <label className="setup-field"><span>Voting ends</span><input type="datetime-local" value={votingEnd} onChange={(event) => setVotingEnd(event.target.value)} required /></label>
        <label className="setup-field"><span>Shot limit (1–{SHOT_LIMIT_MAX})</span><input type="number" min={1} max={SHOT_LIMIT_MAX} value={shotLimit} onChange={(event) => setShotLimit(Number(event.target.value))} required /></label>
      </div>
      <div className="settings-actions"><p className="form-message" role="status">{message}</p><button className="primary-button settings-save" type="submit" disabled={busy}><Save aria-hidden="true" size={17} />{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}
