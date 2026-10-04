import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

// Database types are generated after the first remote migration. Until then this
// server-only client deliberately accepts the migration-owned schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any> | undefined;

export function adminSupabase() {
  const env = serverEnv();
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "our-wedding-roll-server" } },
  });
  return client;
}
