// @vitest-environment node

import { describe, expect, it } from "vitest";

import { readServerEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SITE_URL: "https://photos.example.com",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SECRET_KEY: "sb_secret_example",
  RATE_LIMIT_SECRET: "a-random-secret-with-at-least-thirty-two-characters",
  CONSENT_VERSION: "2026-10-04",
  CRON_SECRET: "a-separate-cron-secret-with-thirty-two-characters",
};

describe("readServerEnv", () => {
  it("returns a validated server configuration", () => {
    expect(readServerEnv(valid)).toEqual(valid);
  });

  it("rejects missing secrets and non-HTTPS production site URLs", () => {
    expect(() => readServerEnv({ ...valid, SUPABASE_SECRET_KEY: "" })).toThrow("SUPABASE_SECRET_KEY");
    expect(() => readServerEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "http://photos.example.com" })).toThrow(
      "NEXT_PUBLIC_SITE_URL",
    );
  });

  it("allows localhost over HTTP for development", () => {
    expect(readServerEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }).NEXT_PUBLIC_SITE_URL).toBe(
      "http://localhost:3000",
    );
  });
});
