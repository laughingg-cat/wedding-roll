import "server-only";

import { adminSupabase } from "@/lib/supabase/admin";

export async function enforceRateLimit(input: {
  bucketKey: string;
  action: string;
  limit: number;
  windowSeconds: number;
}) {
  const { data, error } = await adminSupabase().rpc("check_rate_limit", {
    p_bucket_key: input.bucketKey,
    p_action: input.action,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  });
  if (error) throw error;
  const result = (data as Array<{ allowed: boolean; remaining: number; reset_at: string }> | null)?.[0];
  if (!result) throw new Error("Rate limit result was empty");
  return { allowed: result.allowed, remaining: result.remaining, resetAt: result.reset_at };
}

