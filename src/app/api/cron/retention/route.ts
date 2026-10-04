import { NextRequest, NextResponse } from "next/server";

import { cleanupExpiredEvent } from "@/features/retention/cleanup-retention";
import { serverEnv } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

// Lists every object under a prefix, reconstructing the complete path that
// remove() requires and descending into nested folders (folder entries have a
// null id). Landing objects live at draft/{eventId}/{id}.jpg and
// live/{eventId}/{version}/{id}.jpg, so this also reclaims orphaned copies left
// behind by an interrupted publish.
async function listPrefix(client: ReturnType<typeof adminSupabase>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket)
      .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const fullPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...await listPrefix(client, bucket, fullPath));
      } else {
        paths.push(fullPath);
      }
    }
    if (entries.length < 100) break;
  }
  return paths;
}

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
    // Landing objects live under versioned prefixes; list them recursively so
    // orphaned copies from an interrupted publish are also reclaimed.
    const landingPaths: string[] = [];
    try {
      for (const prefix of [`draft/${event.id}`, `live/${event.id}`]) {
        landingPaths.push(...await listPrefix(client, "wedding-landing", prefix));
      }
    } catch {
      return NextResponse.json({ error: "Retention landing inventory failed" }, { status: 500 });
    }
    const result = await cleanupExpiredEvent({ eventId: event.id, photos: photos.map((photo) => ({ id: photo.id, tempPath: photo.temp_path, originalPath: photo.original_path, filteredPath: photo.filtered_path })), landingPaths }, {
      remove: async (bucket, paths) => { if (!paths.length) return; const removal = await client.storage.from(bucket).remove(paths); if (removal.error) throw removal.error; },
      deleteEvent: async (eventId) => { const deletion = await client.from("events").delete().eq("id", eventId); if (deletion.error) throw deletion.error; },
    });
    removedObjects += result.removedObjects;
  }
  return NextResponse.json({ cleanedEvents: events?.length ?? 0, removedObjects });
}
