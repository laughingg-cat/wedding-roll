import { redirect } from "next/navigation";

import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { currentAdmin, currentAuthUser } from "@/features/admin/current-admin";
import { SupabaseAdminStore } from "@/lib/repositories/admin-store";

export const dynamic = "force-dynamic";

export default async function OrganizerPage() {
  const user = await currentAuthUser();
  if (!user) redirect("/organizer/login");
  const admin = await currentAdmin();
  if (!admin) redirect("/organizer/setup");
  const snapshot = await new SupabaseAdminStore().dashboard(admin.eventId);
  return <AdminDashboard initialSnapshot={snapshot} />;
}
