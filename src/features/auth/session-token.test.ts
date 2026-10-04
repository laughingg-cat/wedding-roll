import { describe, expect, it } from "vitest";

import { createOpaqueToken, hashOpaqueToken, sessionCookieOptions } from "./session-token";

describe("opaque guest tokens", () => {
  it("creates an unguessable token and stores only a deterministic hash", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashOpaqueToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken(first)).not.toContain(first);
    expect(hashOpaqueToken(first)).toBe(hashOpaqueToken(first));
  });

  it("uses browser cookie protections required by the access model", () => {
    expect(sessionCookieOptions(new Date("2027-09-23T00:00:00.000Z"))).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date("2027-09-23T00:00:00.000Z"),
    });
  });
});

