import { NextRequest, NextResponse } from "next/server";

import { currentAdmin } from "@/features/admin/current-admin";
import { createOpaqueToken, hashOpaqueToken } from "@/features/auth/session-token";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const env = serverEnv();
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const token = createOpaqueToken(16);
    const client = adminSupabase();
    const rotation = await client.rpc("rotate_event_access", { p_event_id: admin.eventId, p_access_token_hash: hashOpaqueToken(token) });
    if (rotation.error) throw rotation.error;
    return NextResponse.json({ joinUrl: `${env.NEXT_PUBLIC_SITE_URL}/join/${token}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Rotation failed" }, { status: 400 }); }
}
