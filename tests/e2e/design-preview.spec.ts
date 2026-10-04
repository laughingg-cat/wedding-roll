import { expect, test } from "@playwright/test";

test("mobile guest entry and gallery remain within the viewport", async ({ page }, testInfo) => {
  await page.goto("/design-preview");
  await expect(page.getByRole("heading", { name: "Our Wedding Roll" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter the camera" })).toBeVisible();

  await page.goto("/design-preview?screen=gallery");
  await expect(page.getByRole("heading", { name: "The album" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guest favourites" })).toBeVisible();
  const expectedColumns = testInfo.project.name.startsWith("mobile-") ? "2" : "3";
  await expect.poll(() => page.locator(".gallery-grid").evaluate((element) => getComputedStyle(element).columnCount)).toBe(expectedColumns);
  await expect.poll(() => page.locator(".gallery-card img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  if (testInfo.project.name === "mobile-webkit") await page.screenshot({ path: "artifacts/mobile-gallery.png", fullPage: true });
});

test("organizer dashboard exposes operational and contest controls", async ({ page }, testInfo) => {
  await page.goto("/design-preview?screen=admin");
  await expect(page.getByRole("button", { name: "Pause uploads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close voting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal winners" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Ranked wedding photos" })).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") await page.screenshot({ path: "artifacts/organizer-dashboard.png", fullPage: true });
});
