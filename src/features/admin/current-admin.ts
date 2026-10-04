import "server-only";

import { authSupabase } from "@/lib/supabase/auth-server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function currentAdmin(eventId?: string) {
  const supabase = await authSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let query = adminSupabase().from("event_admins").select("event_id").eq("user_id", user.id).limit(1);
  if (eventId) query = query.eq("event_id", eventId);
  const { data } = await query.maybeSingle<{ event_id: string }>();
  if (!data) return null;
  return { userId: user.id, eventId: data.event_id, email: user.email ?? "" };
}
