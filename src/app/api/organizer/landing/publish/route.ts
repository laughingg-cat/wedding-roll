import { NextRequest, NextResponse } from "next/server";

import { currentAdmin } from "@/features/admin/current-admin";
import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { SupabaseLandingStore } from "@/lib/repositories/landing-store";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request.headers, serverEnv().NEXT_PUBLIC_SITE_URL);
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
    const result = await new SupabaseLandingStore().publish(admin.eventId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish failed" }, { status: 400 });
  }
}
