import { describe, expect, it } from "vitest";

import {
  deriveSetupDefaults,
  formatLocalDateTime,
  isValidTimeZone,
  localDateTimeToUtc,
  normalizeSetup,
  setupSchema,
} from "./setup";

describe("setup validation", () => {
  const valid = {
    name: "Taylor & Sam",
    timezone: "Asia/Tokyo",
    uploadStart: "2027-08-24T08:00",
    uploadEnd: "2027-08-24T23:00",
    votingStart: "2027-08-24T08:00",
    votingEnd: "2027-08-25T12:00",
    shotLimit: 12,
    secondAdminEmail: "",
  };

  it("accepts a well-formed wedding setup", () => {
    expect(setupSchema.parse(valid).name).toBe("Taylor & Sam");
  });

  it("rejects an inverted upload window with a targeted message", () => {
    const result = setupSchema.safeParse({ ...valid, uploadEnd: "2027-08-24T07:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const uploadEndIssue = result.error.issues.find((issue) => issue.path[0] === "uploadEnd");
      expect(uploadEndIssue?.message).toBe("Uploads must end after they start");
    }
  });

  it("rejects an inverted voting window", () => {
    const result = setupSchema.safeParse({ ...valid, votingEnd: "2027-08-23T12:00" });
    expect(result.success).toBe(false);
  });

  it("bounds the shot limit to the supported range", () => {
    expect(setupSchema.safeParse({ ...valid, shotLimit: 0 }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, shotLimit: 51 }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, shotLimit: 50 }).success).toBe(true);
  });

  it("rejects empty or overlong names", () => {
    expect(setupSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(setupSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects unknown timezones", () => {
    expect(setupSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success).toBe(false);
  });

  it("accepts the UTC alias which Intl supports but supportedValuesOf omits", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(setupSchema.safeParse({ ...valid, timezone: "UTC" }).success).toBe(true);
  });

  it("rejects a wall-clock time that does not exist during a DST spring-forward", () => {
    const result = setupSchema.safeParse({
      ...valid,
      timezone: "America/New_York",
      uploadStart: "2027-03-14T02:30",
      uploadEnd: "2027-03-14T03:30",
      votingStart: "2027-03-14T02:30",
      votingEnd: "2027-03-14T03:30",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "uploadStart")).toBe(true);
    }
  });
});

describe("timezone helpers", () => {
  it("recognizes a real IANA zone and rejects a fake one", () => {
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("round-trips a local wall-clock time through its zone", () => {
    expect(formatLocalDateTime(localDateTimeToUtc("2027-08-24T08:00", "Asia/Tokyo"), "Asia/Tokyo")).toBe("2027-08-24T08:00");
  });

  it("converts a Tokyo wall-clock time to the correct UTC instant", () => {
    expect(localDateTimeToUtc("2027-08-24T08:00", "Asia/Tokyo").toISOString()).toBe("2027-08-23T23:00:00.000Z");
  });
});

describe("normalizeSetup", () => {
  it("emits absolute ISO instants and trims the optional second admin", () => {
    expect(
      normalizeSetup({
        name: "  A & B ",
        timezone: "Asia/Tokyo",
        uploadStart: "2027-08-24T08:00",
        uploadEnd: "2027-08-24T23:00",
        votingStart: "2027-08-24T08:00",
        votingEnd: "2027-08-25T12:00",
        shotLimit: 12,
        secondAdminEmail: "  partner@example.com ",
      }),
    ).toEqual({
      name: "A & B",
      timezone: "Asia/Tokyo",
      uploadStartsAt: "2027-08-23T23:00:00.000Z",
      uploadEndsAt: "2027-08-24T14:00:00.000Z",
      votingStartsAt: "2027-08-23T23:00:00.000Z",
      votingEndsAt: "2027-08-25T03:00:00.000Z",
      shotLimit: 12,
      secondAdminEmail: "partner@example.com",
    });
  });
});

describe("deriveSetupDefaults", () => {
  it("provides browser-derived defaults that validate", () => {
    const defaults = deriveSetupDefaults(new Date("2027-08-24T12:00:00Z"));
    expect(defaults.shotLimit).toBe(12);
    expect(isValidTimeZone(defaults.timezone)).toBe(true);
    const parsed = setupSchema.parse({ name: "Test", ...defaults, secondAdminEmail: "" });
    expect(parsed.timezone).toBe(defaults.timezone);
  });
});
