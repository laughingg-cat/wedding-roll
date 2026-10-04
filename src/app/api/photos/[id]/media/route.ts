import { NextResponse } from "next/server";
import { z } from "zod";

import { currentGuest } from "@/features/auth/current-guest";
import { SupabaseGalleryStore } from "@/lib/repositories/gallery-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guest = await currentGuest();
  if (!guest) return NextResponse.json({ error: "Guest session required" }, { status: 401 });
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const signedUrl = await new SupabaseGalleryStore().signFilteredPhoto(parsed.data, guest.eventId);
  if (!signedUrl) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.redirect(signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
