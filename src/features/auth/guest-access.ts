import { jwtVerify, SignJWT } from "jose";
import { createSecretKey } from "node:crypto";

import { sanitizeDisplayName } from "@/features/shared/domain";

import { createOpaqueToken, hashOpaqueToken } from "./session-token";

export type EventAccessRecord = {
  id: string;
  name: string;
  retentionAt: string;
};

export type StoredGuestSession = {
  id: string;
  eventId: string;
  displayName: string;
  completedPhotoCount: number;
  shotLimit: number;
  expiresAt: string;
  revokedAt: string | null;
  eventTimezone?: string;
};

export interface GuestAccessStore {
  findEventByAccessTokenHash(hash: string): Promise<EventAccessRecord | null>;
  createGuestSession(input: {
    eventId: string;
    displayName: string;
    consentVersion: string;
    consentedAt: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<{ id: string }>;
  findGuestSessionByTokenHash(hash: string): Promise<StoredGuestSession | null>;
}

function signingKey(secret: string) {
  if (secret.length < 32) throw new Error("Join signing secret must be at least 32 characters");
  return createSecretKey(Buffer.from(secret, "utf8"));
}

export async function createJoinGrant(
  rawAccessToken: string,
  store: GuestAccessStore,
  secret: string,
  now = new Date(),
) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(rawAccessToken)) throw new Error("Event link is invalid");
  const event = await store.findEventByAccessTokenHash(hashOpaqueToken(rawAccessToken));
  if (!event) throw new Error("Event link is invalid");
  if (Date.parse(event.retentionAt) <= now.getTime()) throw new Error("This wedding album has expired");

  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const token = await new SignJWT({ eventId: event.id, eventName: event.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setAudience("wedding-guest-registration")
    .setIssuer("our-wedding-roll")
    .sign(signingKey(secret));

  return { token, expiresAt };
}

export async function readJoinGrant(token: string, secret: string, now = new Date()) {
  const { payload } = await jwtVerify(token, signingKey(secret), {
    audience: "wedding-guest-registration",
    issuer: "our-wedding-roll",
    currentDate: now,
  });
  if (typeof payload.eventId !== "string" || typeof payload.eventName !== "string") {
    throw new Error("Invalid join grant");
  }
  return { eventId: payload.eventId, eventName: payload.eventName };
}

export async function createGuestSession(
  input: { eventId: string; displayName: string; consentAccepted: boolean },
  store: GuestAccessStore,
  dependencies: {
    now: Date;
    retentionAt: string;
    consentVersion: string;
    createToken?: () => string;
  },
) {
  if (!input.consentAccepted) throw new Error("Consent is required");
  if (Date.parse(dependencies.retentionAt) <= dependencies.now.getTime()) {
    throw new Error("This wedding album has expired");
  }
  const displayName = sanitizeDisplayName(input.displayName);
  const token = (dependencies.createToken ?? createOpaqueToken)();
  const stored = await store.createGuestSession({
    eventId: input.eventId,
    displayName,
    consentVersion: dependencies.consentVersion,
    consentedAt: dependencies.now.toISOString(),
    tokenHash: hashOpaqueToken(token),
    expiresAt: dependencies.retentionAt,
  });
  return { sessionId: stored.id, token, displayName };
}

export async function resolveGuestSession(
  token: string | undefined,
  store: GuestAccessStore,
  now = new Date(),
) {
  if (!token) return null;
  const session = await store.findGuestSessionByTokenHash(hashOpaqueToken(token));
  if (!session || session.revokedAt || Date.parse(session.expiresAt) <= now.getTime()) return null;
  return {
    ...session,
    shotsRemaining: Math.max(0, session.shotLimit - session.completedPhotoCount),
  };
}
