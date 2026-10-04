import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { authSupabase } from "@/lib/supabase/auth-server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const siteOrigin = request.nextUrl.origin;
  if (!origin || origin !== siteOrigin) {
    return NextResponse.json({ error: `Untrusted origin (${origin} != ${siteOrigin})` }, { status: 403 });
  }

  let supabaseHost = "unknown";
  try {
    supabaseHost = new URL(serverEnv().SUPABASE_URL).host;

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

    if (error) {
      console.error("send-magic-link signInWithOtp error", error.status, error.code, error.message);
      return NextResponse.json({ error: `[${supabaseHost}] ${error.message}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("send-magic-link unexpected error", message);
    return NextResponse.json({ error: `[${supabaseHost}] ${message}` }, { status: 500 });
  }
}
