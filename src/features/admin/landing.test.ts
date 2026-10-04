// @vitest-environment node

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { applyDraftOrder, processLandingImage, withCover } from "./landing";

async function jpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } } }).jpeg().toBuffer();
}

describe("processLandingImage", () => {
  it("accepts a valid JPEG and returns optimized dimensions", async () => {
    const input = await jpeg(1200, 800);
    const result = await processLandingImage(input);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
  });

  it("downscales oversized images to the maximum edge", async () => {
    const input = await jpeg(4000, 3000);
    const result = await processLandingImage(input);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2400);
  });

  it("rejects non-JPEG input", async () => {
    await expect(processLandingImage(Buffer.from("not an image"))).rejects.toThrow("valid JPEG");
    await expect(processLandingImage(await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer())).rejects.toThrow("valid JPEG");
  });

  it("rejects files over the 6 MB limit", async () => {
    await expect(processLandingImage(Buffer.alloc(6 * 1024 * 1024 + 1, 0xff))).rejects.toThrow("6 MB");
  });
});

describe("applyDraftOrder", () => {
  const drafts = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("reassigns contiguous positions following the requested order", () => {
    expect(applyDraftOrder(drafts, ["c", "a", "b"])).toEqual([
      { id: "c", position: 0, wasChanged: true },
      { id: "a", position: 1, wasChanged: true },
      { id: "b", position: 2, wasChanged: true },
    ]);
  });

  it("keeps missing drafts after ordered ones", () => {
    expect(applyDraftOrder(drafts, ["b"])).toEqual([
      { id: "b", position: 0, wasChanged: true },
      { id: "a", position: 1, wasChanged: true },
      { id: "c", position: 2, wasChanged: false },
    ]);
  });
});

describe("withCover", () => {
  it("marks exactly one cover and clears it when null", () => {
    const items = [
      { id: "a", isCover: false },
      { id: "b", isCover: true },
    ];
    expect(withCover(items, "a").map((item) => [item.id, item.isCover])).toEqual([["a", true], ["b", false]]);
    expect(withCover(items, null).every((item) => !item.isCover)).toBe(true);
  });
});
