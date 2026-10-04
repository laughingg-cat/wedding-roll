import { describe, expect, it } from "vitest";

import { isStorageAlreadyExists } from "./storage-errors";

describe("isStorageAlreadyExists", () => {
  it("recognizes Supabase conflicts without swallowing unrelated failures", () => {
    expect(isStorageAlreadyExists({ statusCode: "409", message: "The resource already exists" })).toBe(true);
    expect(isStorageAlreadyExists({ message: "network unavailable" })).toBe(false);
  });
});
