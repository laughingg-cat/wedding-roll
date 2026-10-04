// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createGuestSession,
  createJoinGrant,
  readJoinGrant,
  resolveGuestSession,
  type GuestAccessStore,
} from "./guest-access";
import { hashOpaqueToken } from "./session-token";

const now = new Date("2027-08-20T12:00:00.000Z");
const retentionAt = "2027-09-23T00:00:00.000Z";
const secret = "a-secure-test-secret-that-is-long-enough";

function makeStore(overrides: Partial<GuestAccessStore> = {}): GuestAccessStore {
  return {
    findEventByAccessTokenHash: async () => ({
      id: "event-1",
      name: "Sam & Taylor",
      retentionAt,
    }),
    createGuestSession: async (input) => ({ id: "session-1", ...input }),
    findGuestSessionByTokenHash: async () => ({
      id: "session-1",
      eventId: "event-1",
      displayName: "Jordan",
      completedPhotoCount: 3,
      shotLimit: 12,
      expiresAt: retentionAt,
      revokedAt: null,
    }),
    ...overrides,
  };
}

describe("QR join grants", () => {
  it("exchanges a valid bearer token for a short-lived signed grant", async () => {
    const rawAccessToken = "Bqk0fR5bQwX3vJ7u8mNoPq";
    const store = makeStore({
      findEventByAccessTokenHash: async (hash) => {
        expect(hash).toBe(hashOpaqueToken(rawAccessToken));
        return { id: "event-1", name: "Sam & Taylor", retentionAt };
      },
    });

    const grant = await createJoinGrant(rawAccessToken, store, secret, now);
    const payload = await readJoinGrant(grant.token, secret, now);

    expect(payload).toEqual({ eventId: "event-1", eventName: "Sam & Taylor" });
    expect(grant.expiresAt).toEqual(new Date("2027-08-20T12:15:00.000Z"));
  });

  it("rejects unknown access tokens and expired events", async () => {
    await expect(
      createJoinGrant("Bqk0fR5bQwX3vJ7u8mNoPq", makeStore({ findEventByAccessTokenHash: async () => null }), secret, now),
    ).rejects.toThrow("Event link is invalid");

    await expect(
      createJoinGrant(
        "Bqk0fR5bQwX3vJ7u8mNoPq",
        makeStore({
          findEventByAccessTokenHash: async () => ({
            id: "event-1",
            name: "Sam & Taylor",
            retentionAt: "2027-08-19T00:00:00.000Z",
          }),
        }),
        secret,
        now,
      ),
    ).rejects.toThrow("This wedding album has expired");
  });

  it("does not accept a join grant signed with another secret", async () => {
    const grant = await createJoinGrant("Bqk0fR5bQwX3vJ7u8mNoPq", makeStore(), secret, now);
    await expect(readJoinGrant(grant.token, "another-long-secret-for-tests-only", now)).rejects.toThrow();
  });
});

describe("guest sessions", () => {
  it("requires consent and stores only the opaque token hash", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const store = makeStore({
      createGuestSession: async (input) => {
        writes.push(input);
        return { id: "session-1", ...input };
      },
    });

    await expect(
      createGuestSession(
        { eventId: "event-1", displayName: "Jordan", consentAccepted: false },
        store,
        { now, retentionAt, consentVersion: "v1", createToken: () => "raw-guest-token" },
      ),
    ).rejects.toThrow("Consent is required");

    const result = await createGuestSession(
      { eventId: "event-1", displayName: "  Jordan   M. ", consentAccepted: true },
      store,
      { now, retentionAt, consentVersion: "v1", createToken: () => "raw-guest-token" },
    );

    expect(result).toEqual({ sessionId: "session-1", token: "raw-guest-token", displayName: "Jordan M." });
    expect(writes).toEqual([
      {
        eventId: "event-1",
        displayName: "Jordan M.",
        consentVersion: "v1",
        consentedAt: now.toISOString(),
        tokenHash: hashOpaqueToken("raw-guest-token"),
        expiresAt: retentionAt,
      },
    ]);
  });

  it("rejects expired or revoked stored sessions", async () => {
    const revoked = makeStore({
      findGuestSessionByTokenHash: async () => ({
        id: "session-1",
        eventId: "event-1",
        displayName: "Jordan",
        completedPhotoCount: 3,
        shotLimit: 12,
        expiresAt: retentionAt,
        revokedAt: now.toISOString(),
      }),
    });

    await expect(resolveGuestSession("raw-token", revoked, now)).resolves.toBeNull();
    await expect(resolveGuestSession("raw-token", makeStore(), now)).resolves.toMatchObject({
      id: "session-1",
      shotsRemaining: 9,
    });
  });
});
