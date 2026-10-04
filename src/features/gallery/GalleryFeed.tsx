"use client";

import { useEffect, useState } from "react";
import { Camera, Heart } from "lucide-react";

import type { GalleryItem, RevealedWinner } from "./gallery-feed";

type GalleryPage = { photos: GalleryItem[]; nextCursor: string | null; winners?: RevealedWinner[]; changedPhotos?: GalleryItem[]; removedPhotoIds?: string[]; syncToken?: string };

async function defaultFetchPage(cursor?: string, since?: string): Promise<GalleryPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (since) params.set("since", since);
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`/api/photos${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not refresh the gallery");
  return response.json();
}

async function defaultSetLiked(photoId: string, liked: boolean) {
  const response = await fetch(`/api/photos/${photoId}/like`, {
    method: liked ? "PUT" : "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Could not update your vote");
  return response.json() as Promise<{ likeCount: number; liked: boolean }>;
}

export function GalleryFeed({
  initialPhotos,
  initialNextCursor = null,
  initialSyncToken = "",
  initialWinners = [],
  eventTimeZone = "UTC",
  fetchPage = defaultFetchPage,
  setLiked = defaultSetLiked,
}: {
  initialPhotos: GalleryItem[];
  initialNextCursor?: string | null;
  initialSyncToken?: string;
  initialWinners?: RevealedWinner[];
  eventTimeZone?: string;
  fetchPage?: (cursor?: string, since?: string) => Promise<GalleryPage>;
  setLiked?: (photoId: string, liked: boolean) => Promise<{ likeCount: number; liked: boolean }>;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [winners, setWinners] = useState(initialWinners);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncToken, setSyncToken] = useState(initialSyncToken);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const refresh = () => {
      void fetchPage(undefined, syncToken).then((page) => {
        setPhotos((current) => {
          const incoming = [...page.photos, ...(page.changedPhotos ?? [])];
          const refreshed = new Map(incoming.map((photo) => [photo.id, photo]));
          const removed = new Set(page.removedPhotoIds ?? []);
          return [...refreshed.values(), ...current.filter((photo) => !refreshed.has(photo.id) && !removed.has(photo.id))];
        });
        if (page.winners) setWinners(page.winners);
        if (page.syncToken) setSyncToken(page.syncToken);
      }).catch(() => setNotice("Gallery refresh paused"));
    };
    const interval = window.setInterval(refresh, 8000);
    return () => window.clearInterval(interval);
  }, [fetchPage, syncToken]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      setPhotos((current) => {
        const known = new Set(current.map((photo) => photo.id));
        return [...current, ...page.photos.filter((photo) => !known.has(photo.id))];
      });
      setNextCursor(page.nextCursor);
      setNotice("");
    } catch {
      setNotice("Older photos could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleLike(photo: GalleryItem) {
    const nextLiked = !photo.likedByMe;
    setPhotos((current) => current.map((item) => item.id === photo.id
      ? { ...item, likedByMe: nextLiked, likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)) }
      : item));
    try {
      const result = await setLiked(photo.id, nextLiked);
      setPhotos((current) => current.map((item) => item.id === photo.id
        ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
        : item));
    } catch {
      setPhotos((current) => current.map((item) => item.id === photo.id ? photo : item));
      setNotice("Your vote was not saved. Please try again.");
    }
  }

  return (
    <main className="gallery-page">
      <header className="gallery-header">
        <div><span className="eyebrow">Our Wedding Roll</span><h1>The album</h1></div>
        <a className="gallery-camera-link" href="/camera" aria-label="Open camera"><Camera /></a>
      </header>
      <p className="gallery-intro">The room, through everyone’s eyes. Tap a heart for your favourites.</p>
      {winners.length ? <section className="winner-reveal"><span className="eyebrow">The votes are in</span><h2>Guest favourites</h2><div>{winners.map((winner) => <article key={`${winner.photoId}-${winner.awardLabel}`}>
        {/* Authenticated media URLs are dynamic redirects, so a native image is intentional. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={winner.mediaUrl} alt={`${winner.awardLabel} by ${winner.author}`} /><strong>{winner.awardLabel}</strong><span>{winner.author}{winner.placement > 1 ? ` · #${winner.placement}` : ""}</span></article>)}</div></section> : null}
      {notice ? <p className="gallery-notice" role="status">{notice}</p> : null}
      <section className="gallery-grid" aria-label="Wedding photos">
        {photos.map((photo) => (
          <article className="gallery-card" key={photo.id}>
            {/* The media route authenticates before issuing a short-lived redirect. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.mediaUrl} alt={`Photo by ${photo.author}`} loading="lazy" />
            <div className="gallery-card-meta">
              <div><strong>{photo.author}</strong><time dateTime={photo.capturedAt}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: eventTimeZone }).format(new Date(photo.capturedAt))}</time></div>
              {photo.isMine ? (
                <span className="own-photo-label"><Heart size={16} /> Your photo <b>{photo.likeCount}</b></span>
              ) : (
                <button
                  className={`like-button ${photo.likedByMe ? "liked" : ""}`}
                  aria-label={`${photo.likedByMe ? "Unlike" : "Like"} ${photo.author}'s photo`}
                  aria-pressed={photo.likedByMe}
                  onClick={() => void toggleLike(photo)}
                >
                  <Heart size={18} fill={photo.likedByMe ? "currentColor" : "none"} /><span>{photo.likeCount}</span>
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
      {nextCursor ? <button className="secondary-button gallery-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more photos"}</button> : null}
      {!photos.length ? <section className="empty-gallery"><Heart /><h2>The first frame is waiting</h2><p>Open the camera and start the album.</p></section> : null}
      <nav className="guest-bottom-nav" aria-label="Guest navigation">
        <a href="/camera"><Camera size={20} /> Camera</a>
        <a href="/gallery" aria-current="page"><Heart size={20} /> Gallery</a>
      </nav>
    </main>
  );
}
