import { NextRequest, NextResponse } from "next/server";

import { authSupabase } from "@/lib/supabase/auth-server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/organizer";
  if (code) {
    const { error } = await (await authSupabase()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }
  return NextResponse.redirect(new URL("/organizer/login?error=invalid_link", request.url));
}
