import { createHash, randomBytes } from "node:crypto";

export function createOpaqueToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true as const,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
