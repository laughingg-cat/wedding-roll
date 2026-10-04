import { NextResponse } from "next/server";

import { securityHeaders } from "@/features/security/security-headers";

export function proxy() {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(securityHeaders(process.env.NODE_ENV === "development"))) response.headers.set(name, value);
  return response;
}

export const config = { matcher: "/:path*" };
