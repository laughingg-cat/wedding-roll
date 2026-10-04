import { z } from "zod";

export const SHOT_LIMIT_MIN = 1;
export const SHOT_LIMIT_MAX = 50;
export const SHOT_LIMIT_DEFAULT = 12;
export const EVENT_NAME_MAX = 120;

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isValidTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function supportedTimeZones() {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = typeof supported === "function" ? supported("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Formats a Date as a "YYYY-MM-DDTHH:mm" wall-clock string in the given IANA zone.
export function formatLocalDateTime(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// Converts a "YYYY-MM-DDTHH:mm" wall-clock string in a zone to a UTC instant.
// Uses Intl to derive the zone offset and a second pass to settle DST edges.
export function localDateTimeToUtc(value: string, timeZone: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = timeZoneOffsetMs(guess, timeZone);
  const secondOffset = timeZoneOffsetMs(guess - firstOffset, timeZone);
  return new Date(guess - secondOffset);
}

function timeZoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  return asUtc - utcMs;
}

// A wall-clock value is only valid when converting it to UTC and formatting it
// back reproduces the same string (rejects DST gap times such as 02:30 during
// a spring-forward, which do not exist on the clock).
export function localDateTimeRoundTrips(value: string, timeZone: string) {
  return formatLocalDateTime(localDateTimeToUtc(value, timeZone), timeZone) === value;
}

export const setupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the wedding name").max(EVENT_NAME_MAX, "Name must be 120 characters or fewer"),
    timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone"),
    uploadStart: z.string().regex(localDateTimePattern, "Choose an upload start time"),
    uploadEnd: z.string().regex(localDateTimePattern, "Choose an upload end time"),
    votingStart: z.string().regex(localDateTimePattern, "Choose a voting start time"),
    votingEnd: z.string().regex(localDateTimePattern, "Choose a voting end time"),
    shotLimit: z.coerce.number().int().min(SHOT_LIMIT_MIN, "Shot limit must be at least 1").max(SHOT_LIMIT_MAX, "Shot limit must be 50 or fewer"),
    secondAdminEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  })
  .superRefine((value, context) => {
    const dates = [value.uploadStart, value.uploadEnd, value.votingStart, value.votingEnd];
    if (!isValidTimeZone(value.timezone) || dates.some((date) => !localDateTimePattern.test(date))) return;
    const fields = [
      ["uploadStart", value.uploadStart],
      ["uploadEnd", value.uploadEnd],
      ["votingStart", value.votingStart],
      ["votingEnd", value.votingEnd],
    ] as const;
    let uploadStart: Date;
    let uploadEnd: Date;
    let votingStart: Date;
    let votingEnd: Date;
    try {
      for (const [field, date] of fields) {
        if (!localDateTimeRoundTrips(date, value.timezone)) {
          context.addIssue({ code: "custom", path: [field], message: "That time does not exist in this timezone" });
        }
      }
      uploadStart = localDateTimeToUtc(value.uploadStart, value.timezone);
      uploadEnd = localDateTimeToUtc(value.uploadEnd, value.timezone);
      votingStart = localDateTimeToUtc(value.votingStart, value.timezone);
      votingEnd = localDateTimeToUtc(value.votingEnd, value.timezone);
    } catch {
      return;
    }
    if (uploadEnd.getTime() <= uploadStart.getTime()) {
      context.addIssue({ code: "custom", path: ["uploadEnd"], message: "Uploads must end after they start" });
    }
    if (votingEnd.getTime() <= votingStart.getTime()) {
      context.addIssue({ code: "custom", path: ["votingEnd"], message: "Voting must end after it starts" });
    }
  });

export type SetupInput = z.infer<typeof setupSchema>;

export function normalizeSetup(input: SetupInput) {
  const { name, timezone, uploadStart, uploadEnd, votingStart, votingEnd, shotLimit } = input;
  return {
    name: name.trim(),
    timezone,
    uploadStartsAt: localDateTimeToUtc(uploadStart, timezone).toISOString(),
    uploadEndsAt: localDateTimeToUtc(uploadEnd, timezone).toISOString(),
    votingStartsAt: localDateTimeToUtc(votingStart, timezone).toISOString(),
    votingEndsAt: localDateTimeToUtc(votingEnd, timezone).toISOString(),
    shotLimit,
    secondAdminEmail: input.secondAdminEmail?.trim() || undefined,
  };
}

export function deriveSetupDefaults(now = new Date()) {
  const timezone = browserTimeZone();
  const uploadStart = new Date(now.getTime());
  const uploadEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const votingStart = new Date(now.getTime());
  const votingEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  return {
    timezone,
    shotLimit: SHOT_LIMIT_DEFAULT,
    uploadStart: formatLocalDateTime(uploadStart, timezone),
    uploadEnd: formatLocalDateTime(uploadEnd, timezone),
    votingStart: formatLocalDateTime(votingStart, timezone),
    votingEnd: formatLocalDateTime(votingEnd, timezone),
  };
}
