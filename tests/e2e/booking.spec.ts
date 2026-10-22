import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, persona: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(persona) }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("a first-time customer books a service and sees its status", async ({ page }) => {
  await signInAs(page, "New Customer \\(Demo\\)");
  await expect(page.getByRole("heading", { name: "Your home's record starts here" })).toBeVisible();

  await page.goto("/book?category=electrician");
  await expect(page.getByRole("radio", { name: /Electrician/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  // Address: pincode-first with a live coverage check.
  await page.getByLabel("PIN code").fill("560038");
  await page.getByLabel("House / flat, building and street").fill("House 7, Demo Lane");
  await expect(page.getByText("We serve Indiranagar, Bengaluru")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Time: pick the first window that a professional is actually available for.
  const window = page.getByRole("radiogroup", { name: "Time window" }).getByRole("radio").and(page.locator(":not([disabled])")).first();
  await window.click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Problem: tap a common issue instead of typing.
  await page.getByRole("button", { name: "+ MCB keeps tripping" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Review: visit fee, terms and an explicit acknowledgement before submitting.
  await expect(page.getByText("Visit / inspection fee").first()).toBeVisible();
  const submit = page.getByRole("button", { name: "Confirm booking" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("I have read the visit fee and cancellation terms").check();
  await submit.click();

  await page.waitForURL(/\/account\/bookings\/[0-9a-f-]{36}\?created=1/);
  await expect(page.getByText(/Booking request received — HC-[A-Z0-9]{6}/)).toBeVisible();
  await expect(page.getByText("Request received", { exact: true })).toBeVisible();

  // The booking is persisted and listed.
  await page.goto("/account/bookings");
  await expect(page.getByRole("main").getByText("Electrician", { exact: true }).first()).toBeVisible();
});

test("customers cannot open another customer's booking or the operations console", async ({ page }) => {
  await signInAs(page, "New Customer \\(Demo\\)");
  // Asha's booking: RLS hides it, so the not-found page renders and none of her details leak.
  // (The status can be 200 because the account area streams behind a loading boundary.)
  await page.goto("/account/bookings/10000000-0000-4000-8000-000000000201");
  await expect(page.getByRole("heading", { name: "We couldn't find that" })).toBeVisible();
  await expect(page.getByText("HC-DEMO01")).toHaveCount(0);
  await expect(page.getByText("Flat 3B, Demo Apartments")).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/access-denied$/);
});

test("a landlord sees an estimate above the tenant's limit and can approve it", async ({ page }) => {
  await signInAs(page, "Mr. Shetty \\(Demo\\)");
  await page.goto("/account/bookings/10000000-0000-4000-8000-000000000211");
  await expect(page.getByRole("heading", { name: "Appliance installation & repair" })).toBeVisible();
  await page.getByRole("button", { name: /^Approve ₹/ }).click();
  await expect(page.getByText(/payable by the landlord/)).toBeVisible();
});
