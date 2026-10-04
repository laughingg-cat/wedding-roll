import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentAdmin } from "@/features/admin/current-admin";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
  const photoId = z.uuid().safeParse((await context.params).id);
  const variant = request.nextUrl.searchParams.get("variant") === "clean" ? "clean" : "filtered";
  if (!photoId.success) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const url = await new SupabaseAdminStore().signPhoto(admin.eventId, photoId.data, variant, request.nextUrl.searchParams.get("download") === "1");
  if (!url) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}
