import { NextRequest, NextResponse } from "next/server";

import { currentAdmin } from "@/features/admin/current-admin";
import { csv } from "@/lib/export/export-utils";
import { adminSupabase } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("event") ?? "";
  const admin = await currentAdmin(eventId);
  if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
  const client = adminSupabase();
  const photos: Array<{ id: string; status: string; preset: string; completed_at: string | null; width: number | null; height: number | null; byte_size: number | null }> = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from("photos").select("id,status,preset,completed_at,width,height,byte_size")
      .eq("event_id", eventId).order("completed_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: "Manifest unavailable" }, { status: 500 });
    photos.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  const body = csv([["id", "status", "preset", "completed_at", "width", "height", "byte_size"], ...photos.map((photo) => [photo.id, photo.status, photo.preset, photo.completed_at, photo.width, photo.height, photo.byte_size])]);
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wedding-${eventId}-photos.csv"`, "Cache-Control": "private, no-store" } });
}
