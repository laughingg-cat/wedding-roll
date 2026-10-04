import { redirect } from "next/navigation";

import { currentAdmin, currentAuthUser } from "@/features/admin/current-admin";
import { OrganizerSetup } from "@/features/admin/SetupForm";

export const dynamic = "force-dynamic";

export default async function OrganizerSetupPage() {
  const user = await currentAuthUser();
  if (!user) redirect("/organizer/login");
  const admin = await currentAdmin();
  if (admin) redirect("/organizer");
  return <OrganizerSetup />;
}
