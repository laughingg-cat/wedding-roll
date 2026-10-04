import { NextRequest, NextResponse } from "next/server";

import { currentAdmin } from "@/features/admin/current-admin";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";

export async function GET(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Organizer access required" }, { status: 403 });
  const parsed = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const offset = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  const page = await new SupabaseAdminStore().photoPage(admin.eventId, offset);
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
