import { expect, test, type Locator } from "@playwright/test";

const fixturePath = "/__e2e/kb-citation-hover";
const snippet = "E2E_CHUNK_SNIPPET_BODY";

/**
 * Real users get Radix open via hover (`pointerenter`) or keyboard focus (`focus`).
 * Playwright `mouse.move` often fails to open HoverCard on our nested pill (hit target is inner span;
 * native `pointerenter` does not bubble). Focus uses the same Radix `onOpen` + `openDelay` path.
 */
async function openHoverCardViaRadixFocus(pill: Locator) {
  await pill.scrollIntoViewIfNeeded();
  await pill.focus();
  await pill.page().waitForTimeout(450);
}

test.describe("Kb citation HoverCard", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto(fixturePath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /KB citation hover E2E/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("chunk: first click opens and panel stays visible (no flash close)", async ({ page }) => {
    const pill = page.getByRole("button", { name: /E2E chunk doc/i });
    await pill.click();
    const panel = page.locator('[data-slot="hover-card-content"]');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText(snippet)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(450);
    await expect(panel.getByText(snippet)).toBeVisible();
  });

  test("chunk: after Radix open (focus path), click does not dismiss", async ({ page }) => {
    const pill = page.getByRole("button", { name: /E2E chunk doc/i });
    await openHoverCardViaRadixFocus(pill);
    const panel = page.locator('[data-slot="hover-card-content"]');
    await expect(panel).toBeVisible({ timeout: 12_000 });
    await expect(panel.getByText(snippet)).toBeVisible({ timeout: 12_000 });
    await pill.click({ force: true });
    await page.waitForTimeout(500);
    await expect(panel.getByText(snippet)).toBeVisible();
  });

  test("doc-only: Radix open (focus) then click keeps panel open", async ({ page }) => {
    const pill = page.getByRole("button", { name: /E2E doc pill/i });
    await openHoverCardViaRadixFocus(pill);
    const panel = page.locator('[data-slot="hover-card-content"]');
    await expect(panel).toBeVisible({ timeout: 12_000 });
    await expect(panel.getByText(snippet)).toBeVisible({ timeout: 20_000 });
    await pill.click({ force: true });
    await page.waitForTimeout(500);
    await expect(panel.getByText(snippet)).toBeVisible();
  });
});
