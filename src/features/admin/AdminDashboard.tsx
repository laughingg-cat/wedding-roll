"use client";

import { useEffect, useState } from "react";
import { Camera, Download, Eye, EyeOff, Heart, Image as ImageIcon, LogOut, Pause, Play, ShieldCheck, Trophy, Users } from "lucide-react";

import type { AdminSnapshot } from "./admin-types";

async function defaultUpdateEvent(update: Record<string, boolean | string>) {
  const response = await fetch("/api/organizer/event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
  if (!response.ok) throw new Error("Update failed");
}

async function defaultModeratePhoto(photoId: string, status: "visible" | "hidden") {
  const response = await fetch(`/api/organizer/photos/${photoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason: status === "hidden" ? "Hidden by organizer" : null }) });
  if (!response.ok) throw new Error("Moderation failed");
}

async function defaultSelectWinner(photoId: string) {
  const response = await fetch("/api/organizer/winners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId, placement: 1, awardLabel: "Guest favourite" }) });
  if (!response.ok) throw new Error("Winner selection failed");
}

async function defaultEmergencyRotate() {
  const response = await fetch("/api/organizer/emergency-rotate", { method: "POST" });
  if (!response.ok) throw new Error("Rotation failed");
  return response.json() as Promise<{ joinUrl: string }>;
}

async function defaultFetchMorePhotos(offset: number) {
  const response = await fetch(`/api/organizer/photos?offset=${offset}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Photo page unavailable");
  return response.json() as Promise<{ photos: AdminSnapshot["photos"]; nextOffset: number | null }>;
}

export function AdminDashboard({
  initialSnapshot,
  updateEvent = defaultUpdateEvent,
  moderatePhoto = defaultModeratePhoto,
  selectWinner = defaultSelectWinner,
  emergencyRotate = defaultEmergencyRotate,
  fetchMorePhotos = defaultFetchMorePhotos,
  previewMode = false,
}: {
  initialSnapshot: AdminSnapshot;
  updateEvent?: (update: Record<string, boolean | string>) => Promise<void>;
  moderatePhoto?: (photoId: string, status: "visible" | "hidden") => Promise<void>;
  selectWinner?: (photoId: string) => Promise<void>;
  emergencyRotate?: () => Promise<{ joinUrl: string }>;
  fetchMorePhotos?: (offset: number) => Promise<{ photos: AdminSnapshot["photos"]; nextOffset: number | null }>;
  previewMode?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [message, setMessage] = useState("");
  const [renderedAt, setRenderedAt] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setRenderedAt(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function loadMorePhotos() {
    if (snapshot.nextPhotoOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchMorePhotos(snapshot.nextPhotoOffset);
      setSnapshot((current) => ({ ...current, photos: [...current.photos, ...page.photos], nextPhotoOffset: page.nextOffset }));
    } catch { setMessage("More photos could not be loaded."); }
    finally { setLoadingMore(false); }
  }

  async function changeEvent(update: Partial<AdminSnapshot["event"]>) {
    setSnapshot((current) => ({ ...current, event: { ...current.event, ...update } }));
    try { await updateEvent(update as Record<string, boolean | string>); }
    catch { setSnapshot(initialSnapshot); setMessage("That setting could not be saved."); }
  }

  async function rotateAccess() {
    if (!window.confirm("Revoke every guest session and replace the QR credential?")) return;
    try {
      const result = await emergencyRotate();
      setMessage(`New private join link (shown once): ${result.joinUrl}`);
    } catch { setMessage("Emergency access rotation failed."); }
  }

  async function changeVisibility(photoId: string, status: "visible" | "hidden") {
    setSnapshot((current) => ({ ...current, photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, status } : photo) }));
    try { await moderatePhoto(photoId, status); }
    catch { setSnapshot(initialSnapshot); setMessage("That photo could not be updated."); }
  }

  const retentionDays = renderedAt == null ? null : Math.max(0, Math.ceil((Date.parse(snapshot.event.retentionAt) - renderedAt) / 86_400_000));
  return (
    <main className="admin-shell">
      <aside className="admin-rail">
        <div className="admin-monogram">WR</div>
        <nav aria-label="Organizer sections"><a href="#overview" aria-current="page"><ImageIcon /> Overview</a><a href="#rankings"><Trophy /> Rankings</a><a href="#controls"><ShieldCheck /> Controls</a></nav>
        <a className="admin-export-link" href={`/api/organizer/export-manifest?event=${snapshot.event.id}`}><Download /> Export manifest</a>
        <form action="/api/organizer/sign-out" method="post"><button className="admin-export-link" type="submit"><LogOut /> Sign out</button></form>
      </aside>
      <section className="admin-content">
        <header className="admin-heading" id="overview"><div><span className="eyebrow">Organizer dashboard</span><h1>{snapshot.event.name}</h1></div><span className="admin-live"><i /> Live</span></header>
        {message ? <p className="admin-message" role="status">{message}</p> : null}
        <div className="metric-grid">
          <article><Users /><span>Guests</span><strong>{snapshot.stats.guests}</strong></article>
          <article><Camera /><span>Visible photos</span><strong>{snapshot.stats.visible}</strong></article>
          <article><EyeOff /><span>Hidden / failed</span><strong>{snapshot.stats.hidden + snapshot.stats.failed}</strong></article>
          <article><Heart /><span>Retention</span><strong>{retentionDays == null ? "—" : `${retentionDays}d`}</strong></article>
          <article><ImageIcon /><span>Used capacity</span><strong>{snapshot.stats.visible + snapshot.stats.hidden}/{snapshot.stats.guests * snapshot.event.shotLimit}</strong></article>
        </div>
        <section className="admin-control-strip" id="controls">
          <div><strong>Uploads</strong><span>{snapshot.event.uploadsPaused ? "Paused" : "Open"}</span></div>
          <button onClick={() => void changeEvent({ uploadsPaused: !snapshot.event.uploadsPaused })}>{snapshot.event.uploadsPaused ? <Play /> : <Pause />}{snapshot.event.uploadsPaused ? "Resume uploads" : "Pause uploads"}</button>
          <div><strong>Voting</strong><span>{snapshot.event.votingPaused ? "Closed" : "Open"}</span></div>
          <button onClick={() => void changeEvent({ votingPaused: !snapshot.event.votingPaused })}>{snapshot.event.votingPaused ? <Play /> : <Pause />}{snapshot.event.votingPaused ? "Reopen voting" : "Close voting"}</button>
          <button className="reveal-button" onClick={() => void changeEvent({ winnersRevealed: !snapshot.event.winnersRevealed })}><Trophy />{snapshot.event.winnersRevealed ? "Hide winners" : "Reveal winners"}</button>
          <label className="voting-deadline">Voting deadline<input type="datetime-local" defaultValue={snapshot.event.votingEndsAt?.slice(0, 16)} onChange={(event) => { if (event.target.value) void changeEvent({ votingEndsAt: new Date(event.target.value).toISOString() }); }} /></label>
          <button className="danger-button" onClick={() => void rotateAccess()}><ShieldCheck /> Revoke guests & rotate QR</button>
        </section>
        <section className="ranking-panel" id="rankings">
          <div className="panel-title"><div><span className="eyebrow">Private until reveal</span><h2>Contest ranking</h2></div><span>{snapshot.stats.visible + snapshot.stats.hidden} photos</span></div>
          <div className="ranking-table" role="table" aria-label="Ranked wedding photos">
            <div className="ranking-row ranking-header" role="row"><span>Rank</span><span>Photo</span><span>Guest</span><span>Score</span><span>Status</span><span>Actions</span></div>
            {snapshot.photos.map((photo) => (
              <div className="ranking-row" role="row" key={photo.id}>
                <strong>#{photo.rank}{photo.tied ? " tie" : ""}</strong>
                {/* Authenticated organizer route can expose clean and filtered variants. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewMode ? "/images/welcome-reception.png" : `/api/organizer/photos/${photo.id}/media?variant=filtered`} alt="" loading="lazy" />
                <span>{photo.author}</span><span>{photo.likeCount} likes</span>
                <span className={`status-pill status-${photo.status}`}>{photo.status === "hidden" ? "Hidden" : "Visible"}</span>
                <div className="row-actions">
                  <button aria-label={`Award ${photo.author}'s photo`} onClick={() => void selectWinner(photo.id)}><Trophy /></button>
                  <button aria-label={`${photo.status === "hidden" ? "Restore" : "Hide"} ${photo.author}'s photo`} onClick={() => void changeVisibility(photo.id, photo.status === "hidden" ? "visible" : "hidden")}>{photo.status === "hidden" ? <Eye /> : <EyeOff />}</button>
                  <a href={`/api/organizer/photos/${photo.id}/media?variant=clean&download=1`} aria-label={`Download ${photo.author}'s clean photo`}><Download /></a>
                </div>
              </div>
            ))}
          </div>
          {snapshot.nextPhotoOffset != null ? <button className="secondary-button gallery-load-more" type="button" disabled={loadingMore} onClick={() => void loadMorePhotos()}>{loadingMore ? "Loading…" : "Load more photos"}</button> : null}
        </section>
      </section>
    </main>
  );
}
