// @vitest-environment node

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { clearPendingCapture, loadPendingCapture, savePendingCapture } from "./pending-capture";

describe("pending capture recovery", () => {
  beforeEach(async () => {
    await clearPendingCapture();
  });

  it("keeps exactly one confirmed capture across reloads", async () => {
    await savePendingCapture({
      blob: new Blob(["first"], { type: "image/jpeg" }),
      preset: "portra_400",
      createdAt: "2027-08-24T12:00:00.000Z",
    });
    await savePendingCapture({
      blob: new Blob(["second"], { type: "image/jpeg" }),
      preset: "quicksnap",
      createdAt: "2027-08-24T12:01:00.000Z",
    });

    const pending = await loadPendingCapture(new Date("2027-08-24T12:02:00.000Z"));
    expect(pending?.preset).toBe("quicksnap");
    expect(pending?.blob.size).toBe(6);
  });

  it("purges local photos after twenty-four hours", async () => {
    await savePendingCapture({
      blob: new Blob(["private-photo"], { type: "image/jpeg" }),
      preset: "original",
      createdAt: "2027-08-24T12:00:00.000Z",
    });

    await expect(loadPendingCapture(new Date("2027-08-25T12:00:01.000Z"))).resolves.toBeNull();
    await expect(loadPendingCapture(new Date("2027-08-25T12:00:02.000Z"))).resolves.toBeNull();
  });
});
