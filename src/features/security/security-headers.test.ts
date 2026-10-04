import { describe, expect, it } from "vitest";

import { securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("locks framing, indexing, referrers, sniffing, and camera permissions", () => {
    const headers = new Headers(securityHeaders());
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Permissions-Policy")).toContain("camera=(self)");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });
});
