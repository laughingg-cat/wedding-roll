import { NextRequest, NextResponse } from "next/server";

import { authSupabase } from "@/lib/supabase/auth-server";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const siteOrigin = request.nextUrl.origin;
    if (!origin || origin !== siteOrigin) {
      return NextResponse.json({ error: "Untrusted request origin" }, { status: 403 });
    }

    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const { error } = await (await authSupabase()).auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${siteOrigin}/auth/callback`,
      },
    });

    if (error) return NextResponse.json({ error: "This email is not authorized for the wedding." }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not send the sign-in link" }, { status: 400 });
  }
}
