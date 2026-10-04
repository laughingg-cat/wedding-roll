import { redirect } from "next/navigation";

import { currentGuest } from "@/features/auth/current-guest";
import { GalleryFeed } from "@/features/gallery/GalleryFeed";
import { SupabaseGalleryStore } from "@/lib/repositories/gallery-store";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const syncToken = new Date().toISOString();
  const guest = await currentGuest();
  if (!guest) redirect("/invalid-link");
  const store = new SupabaseGalleryStore();
  const [page, winners] = await Promise.all([store.listVisible(guest.eventId, guest.id), store.listRevealedWinners(guest.eventId)]);
  return <GalleryFeed initialPhotos={page.photos} initialNextCursor={page.nextCursor} initialSyncToken={syncToken} initialWinners={winners} eventTimeZone={guest.eventTimezone ?? "UTC"} />;
}
