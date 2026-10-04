import { NextRequest, NextResponse } from "next/server";

import { cleanupExpiredEvent } from "@/features/retention/cleanup-retention";
import { serverEnv } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const env = serverEnv();
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = adminSupabase();
  const { data: events, error } = await client.from("events").select("id").lte("retention_at", new Date().toISOString()).limit(3);
  if (error) return NextResponse.json({ error: "Retention query failed" }, { status: 500 });
  let removedObjects = 0;
  for (const event of events ?? []) {
    const photos: Array<{ id: string; temp_path: string | null; original_path: string | null; filtered_path: string | null }> = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error: photoError } = await client.from("photos").select("id,temp_path,original_path,filtered_path")
        .eq("event_id", event.id).order("id", { ascending: true }).range(from, from + pageSize - 1);
      if (photoError) return NextResponse.json({ error: "Retention inventory failed" }, { status: 500 });
      photos.push(...(data ?? []));
      if ((data ?? []).length < pageSize) break;
    }
    const result = await cleanupExpiredEvent({ eventId: event.id, photos: photos.map((photo) => ({ id: photo.id, tempPath: photo.temp_path, originalPath: photo.original_path, filteredPath: photo.filtered_path })) }, {
      remove: async (bucket, paths) => { if (!paths.length) return; const removal = await client.storage.from(bucket).remove(paths); if (removal.error) throw removal.error; },
      deleteEvent: async (eventId) => { const deletion = await client.from("events").delete().eq("id", eventId); if (deletion.error) throw deletion.error; },
    });
    removedObjects += result.removedObjects;
  }
  return NextResponse.json({ cleanedEvents: events?.length ?? 0, removedObjects });
}
