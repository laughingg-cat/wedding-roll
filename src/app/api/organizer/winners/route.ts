import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentAdmin } from "@/features/admin/current-admin";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase/admin";

const schema = z.object({ photoId: z.uuid(), placement: z.number().int().min(1).max(100), awardLabel: z.string().trim().min(1).max(80) });

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const input = schema.parse(await request.json());
    const { data: photo } = await adminSupabase().from("photos").select("id").eq("id", input.photoId).eq("event_id", admin.eventId).eq("status", "visible").maybeSingle();
    if (!photo) return NextResponse.json({ error: "Visible photo required" }, { status: 400 });
    const { error } = await adminSupabase().from("winner_selections").upsert({ event_id: admin.eventId, photo_id: input.photoId, placement: input.placement, award_label: input.awardLabel, selected_by: admin.userId }, { onConflict: "event_id,photo_id,award_label" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Selection failed" }, { status: 400 }); }
}
