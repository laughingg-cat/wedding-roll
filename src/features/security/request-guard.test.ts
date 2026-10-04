// @vitest-environment node

import { describe, expect, it } from "vitest";

import { assertTrustedMutationOrigin, anonymizeIp, readClientIp } from "./request-guard";

describe("assertTrustedMutationOrigin", () => {
  it("accepts the configured site origin", () => {
    expect(() =>
      assertTrustedMutationOrigin(new Headers({ origin: "https://photos.example.com" }), "https://photos.example.com"),
    ).not.toThrow();
  });

  it("rejects missing and cross-site origins", () => {
    expect(() => assertTrustedMutationOrigin(new Headers(), "https://photos.example.com")).toThrow("origin");
    expect(() =>
      assertTrustedMutationOrigin(new Headers({ origin: "https://evil.example" }), "https://photos.example.com"),
    ).toThrow("origin");
  });
});

describe("client address privacy", () => {
  it("uses the first forwarded address and stores only an HMAC", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" });
    expect(readClientIp(headers)).toBe("203.0.113.8");
    expect(anonymizeIp("203.0.113.8", "long-test-secret-that-is-at-least-32-characters")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(anonymizeIp("203.0.113.8", "long-test-secret-that-is-at-least-32-characters")).not.toContain(
      "203.0.113.8",
    );
  });
});

