import { redirect } from "next/navigation";

import { currentGuest } from "@/features/auth/current-guest";
import { CameraClient } from "./camera-client";

export default async function CameraPage() {
  const guest = await currentGuest();
  if (!guest) redirect("/invalid-link");
  return <CameraClient shotsRemaining={guest.shotsRemaining} />;
}

