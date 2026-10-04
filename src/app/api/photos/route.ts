import { NextRequest, NextResponse } from "next/server";

import { currentGuest } from "@/features/auth/current-guest";
import { SupabaseGalleryStore } from "@/lib/repositories/gallery-store";

export async function GET(request: NextRequest) {
  const guest = await currentGuest();
  if (!guest) return NextResponse.json({ error: "Guest session required" }, { status: 401 });
  try {
    const syncToken = new Date().toISOString();
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const sinceValue = request.nextUrl.searchParams.get("since") ?? undefined;
    const since = sinceValue && !Number.isNaN(Date.parse(sinceValue)) ? sinceValue : undefined;
    const store = new SupabaseGalleryStore();
    const [page, winners, changes] = await Promise.all([
      store.listVisible(guest.eventId, guest.id, cursor),
      store.listRevealedWinners(guest.eventId),
      cursor ? Promise.resolve({ changedPhotos: [], removedPhotoIds: [] }) : store.listVisibilityChanges(guest.eventId, guest.id, since),
    ]);
    return NextResponse.json({ ...page, winners, ...changes, syncToken }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "invalid_cursor" ? error.message : "Could not load photos";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
