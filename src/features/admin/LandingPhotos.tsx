"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Pencil, Rocket, Star, Trash2, Upload, X } from "lucide-react";

import { compressJpeg } from "./compress";
import { WelcomeForm } from "@/features/auth/WelcomeForm";

type LandingDraft = {
  id: string;
  storagePath: string;
  position: number;
  isCover: boolean;
  altText: string;
  visible: boolean;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  mediaUrl?: string;
};

type PublishedSummary = { id: string; isCover: boolean };

async function loadDrafts() {
  const response = await fetch("/api/organizer/landing/photos", { cache: "no-store" });
  if (!response.ok) throw new Error("Landing photos unavailable");
  return response.json() as Promise<{ drafts: LandingDraft[]; published: PublishedSummary[] }>;
}

export function LandingPhotos({ eventName }: { eventName: string }) {
  const [drafts, setDrafts] = useState<LandingDraft[]>([]);
  const [published, setPublished] = useState<PublishedSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDrafts().then((data) => { setDrafts(data.drafts); setPublished(data.published); }).catch((error: Error) => setMessage(error.message));
  }, []);

  function fail(error: unknown) {
    setMessage(error instanceof Error ? error.message : "Something went wrong");
  }

  async function upload(file: File, replaceId?: string) {
    setBusy(true);
    try {
      const compressed = await compressJpeg(file);
      const form = new FormData();
      form.append("file", new File([compressed], file.name, { type: "image/jpeg" }));
      if (replaceId) form.append("replace", replaceId);
      const response = await fetch("/api/organizer/landing/photos", { method: "POST", body: form });
      const data = (await response.json()) as { error?: string; draft?: LandingDraft };
      if (!response.ok || !data.draft) throw new Error(data.error || "Upload failed");
      if (replaceId) {
        setDrafts((current) => current.map((draft) => draft.id === replaceId ? data.draft! : draft));
      } else {
        setDrafts((current) => [...current, data.draft!].sort((a, b) => a.position - b.position));
      }
      setMessage(replaceId ? "Photo replaced." : "Photo added. Publish when ready.");
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const target = replaceTarget;
    setReplaceTarget(null);
    await upload(file, target ?? undefined);
  }

  async function patchDraft(id: string, patch: { altText?: string; visible?: boolean; isCover?: boolean }) {
    try {
      const response = await fetch(`/api/organizer/landing/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json()) as { error?: string; draft?: LandingDraft };
      if (!response.ok || !data.draft) throw new Error(data.error || "Update failed");
      setDrafts((current) => current.map((draft) => {
        if (patch.isCover !== undefined) return { ...draft, isCover: draft.id === id && patch.isCover === true };
        return draft.id === id ? data.draft! : draft;
      }));
    } catch (error) { fail(error); }
  }

  async function setCover(id: string) {
    await patchDraft(id, { isCover: true });
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this landing photo?")) return;
    try {
      const response = await fetch(`/api/organizer/landing/photos/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setDrafts((current) => current.filter((draft) => draft.id !== id));
    } catch (error) { fail(error); }
  }

  async function move(id: string, direction: -1 | 1) {
    const ordered = [...drafts].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((draft) => draft.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const ids = ordered.map((draft) => draft.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setDrafts((current) => {
      const map = new Map(ids.map((draftId, position) => [draftId, position]));
      return current.map((draft) => ({ ...draft, position: map.get(draft.id) ?? draft.position })).sort((a, b) => a.position - b.position);
    });
    try {
      const response = await fetch("/api/organizer/landing/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Reorder failed");
    } catch (error) { fail(error); }
  }

  async function publish() {
    if (!window.confirm("Publish these landing photos for guests?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/organizer/landing/publish", { method: "POST" });
      const data = (await response.json()) as { error?: string; published?: number };
      if (!response.ok) throw new Error(data.error || "Publish failed");
      const reloaded = await loadDrafts();
      setDrafts(reloaded.drafts);
      setPublished(reloaded.published);
      setMessage(`Published ${data.published ?? 0} photos.`);
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  const previewPhotos = drafts
    .filter((draft) => draft.visible)
    .map((draft) => ({ mediaUrl: draft.mediaUrl ?? "", altText: draft.altText, isCover: draft.isCover }));

  return (
    <section className="landing-panel">
      <div className="panel-title">
        <div><span className="eyebrow">Guest welcome</span><h2>Landing photos</h2></div>
        <div className="landing-title-actions">
          <button className="secondary-button landing-button" type="button" onClick={() => setPreview(true)} disabled={drafts.length === 0}><Eye aria-hidden="true" size={16} />Preview</button>
          <button className="primary-button landing-button" type="button" onClick={() => publish()} disabled={busy || drafts.length === 0}><Rocket aria-hidden="true" size={16} />Publish landing page</button>
        </div>
      </div>

      <p className="landing-note">Draft changes stay hidden from guests until you publish. Upload JPEGs, order them, choose a cover, and add alt text.</p>
      {message ? <p className="admin-message" role="status">{message}</p> : null}

      <div className="landing-grid">
        {drafts.map((draft) => (
          <article key={draft.id} className={`landing-card${draft.isCover ? " is-cover" : ""}${draft.visible ? "" : " is-hidden"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.mediaUrl} alt={draft.altText} />
            <div className="landing-card-meta">
              {draft.isCover ? <span className="cover-badge"><Star aria-hidden="true" size={12} />Cover</span> : <button type="button" onClick={() => setCover(draft.id)} title="Set as cover">Set cover</button>}
              <span className="landing-position">#{draft.position + 1}</span>
            </div>
            <div className="landing-card-actions">
              <button type="button" onClick={() => move(draft.id, -1)} aria-label="Move left"><ArrowLeft /></button>
              <button type="button" onClick={() => move(draft.id, 1)} aria-label="Move right"><ArrowRight /></button>
              <button type="button" onClick={() => patchDraft(draft.id, { visible: !draft.visible })} aria-label={draft.visible ? "Hide" : "Show"}>
                {draft.visible ? <EyeOff /> : <Eye />}
              </button>
              <button type="button" onClick={() => setEditingAlt(draft.id)} aria-label="Edit alt text"><Pencil /></button>
              <button type="button" onClick={() => { setReplaceTarget(draft.id); fileInput.current?.click(); }} aria-label="Replace"><Upload /></button>
              <button type="button" onClick={() => remove(draft.id)} aria-label="Delete"><Trash2 /></button>
            </div>
            {editingAlt === draft.id ? (
              <input
                className="alt-editor"
                autoFocus
                defaultValue={draft.altText}
                maxLength={200}
                placeholder="Alt text"
                onBlur={(event) => { void patchDraft(draft.id, { altText: event.target.value }); setEditingAlt(null); }}
              />
            ) : null}
          </article>
        ))}
      </div>

      <input ref={fileInput} type="file" accept="image/jpeg" hidden onChange={onFile} />
      <button className="secondary-button landing-upload" type="button" onClick={() => { setReplaceTarget(null); fileInput.current?.click(); }} disabled={busy}>
        <Upload aria-hidden="true" size={17} />Upload photos
      </button>

      {preview ? (
        <div className="landing-preview">
          <div className="landing-preview-bar">
            <span className="eyebrow">Guest preview</span>
            <button type="button" onClick={() => setPreview(false)} aria-label="Close preview"><X /></button>
          </div>
          <div className="landing-preview-frame">
            <WelcomeForm eventName={eventName} landingPhotos={previewPhotos} onJoined={() => undefined} />
          </div>
        </div>
      ) : null}
      {published.length > 0 ? <p className="landing-note"><Check aria-hidden="true" size={13} /> {published.length} photo{published.length === 1 ? "" : "s"} published for guests.</p> : null}
    </section>
  );
}
