import { createHmac } from "node:crypto";

export function assertTrustedMutationOrigin(headers: Headers, siteUrl: string) {
  const origin = headers.get("origin");
  if (!origin) throw new Error("Untrusted request origin");

  if (origin === new URL(siteUrl).origin) return;

  const forwardedHost = headers.get("x-forwarded-host") ?? headers.get("host");
  const host = forwardedHost?.split(",")[0]?.trim();
  if (host && new URL(origin).host === host) return;

  throw new Error("Untrusted request origin");
}

export function readClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function anonymizeIp(ip: string, secret: string) {
  if (secret.length < 32) throw new Error("Rate-limit secret must be at least 32 characters");
  return createHmac("sha256", secret).update(ip, "utf8").digest("hex");
}

