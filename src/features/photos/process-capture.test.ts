// @vitest-environment node

import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { MAX_CAPTURE_BYTES, processCapture } from "./process-capture";
import type { PresetId } from "@/features/shared/domain";

async function fixture(width = 3000, height = 2000) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 152, g: 96, b: 68 } },
  })
    .jpeg({ quality: 94 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

describe("processCapture", () => {
  it("normalizes orientation, constrains dimensions, and strips metadata", async () => {
    const result = await processCapture(await fixture(), "original");
    const metadata = await sharp(result.clean).metadata();

    expect(Math.max(result.width, result.height)).toBe(2400);
    expect(metadata.format).toBe("jpeg");
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(result.filtered.equals(result.clean)).toBe(true);
  });

  it("produces a distinct authoritative asset for every film preset", async () => {
    const input = await fixture(120, 80);
    const presets: PresetId[] = ["portra_400", "quicksnap", "cinestill_800t", "hp5_plus"];
    const outputs = await Promise.all(presets.map((preset) => processCapture(input, preset)));
    const hashes = outputs.map((output) => createHash("sha256").update(output.filtered).digest("hex"));

    expect(new Set(hashes).size).toBe(4);
    expect(hashes).not.toContain(createHash("sha256").update(outputs[0].clean).digest("hex"));
  });

  it("rejects non-JPEG, oversized, and decompression-bomb inputs", async () => {
    await expect(processCapture(Buffer.from("not a jpeg"), "original")).rejects.toThrow("valid JPEG");
    await expect(processCapture(Buffer.alloc(MAX_CAPTURE_BYTES + 1), "original")).rejects.toThrow("6 MB");
    await expect(processCapture(await fixture(5000, 5000), "original")).rejects.toThrow("24 megapixels");
  });
});

