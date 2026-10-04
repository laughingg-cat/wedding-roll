import { NextRequest, NextResponse } from "next/server";

import { assertTrustedMutationOrigin } from "@/features/security/request-guard";
import { serverEnv } from "@/lib/env";
import { authSupabase } from "@/lib/supabase/auth-server";

export async function POST(request: NextRequest) {
  const env = serverEnv();
  try {
    assertTrustedMutationOrigin(request.headers, env.NEXT_PUBLIC_SITE_URL);

    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const { error } = await (await authSupabase()).auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/auth/callback`,
      },
    });

    if (error) return NextResponse.json({ error: "This email is not authorized for the wedding." }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not send the sign-in link" }, { status: 400 });
  }
}
