import { createOwner, expect, test } from "./fixtures";

// A brand-new workspace is sent into first-time onboarding before the app.
// This walks the owner flow end to end against the real /api/onboarding:
// every question answered, the connect step left for later, the plan built
// from the answers, and Finish landing on Home with the redirect released.
test("a new owner walks first-time onboarding and lands on Home", async ({ browser }) => {
  const owner = await createOwner(browser, { onboarding: "keep" });
  const { page } = owner;
  try {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);

    const heading = page.getByRole("heading", { level: 1 });
    const progress = page.getByRole("progressbar", { name: "Setup progress" });
    const continueButton = page.getByRole("button", { name: "Continue", exact: true });

    // 1. Welcome: the name to greet them by.
    await expect(heading).toHaveText("Let’s set Linkar up for you.");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    await page.getByLabel("What should we call you?").fill("Priya");
    await continueButton.click();

    // 2. Account type, addressed by the name just given.
    await expect(heading).toHaveText("What best describes you, Priya?");
    await expect(continueButton).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Brand or shop" }).click();
    await expect(page.getByRole("button", { name: "Brand or shop" })).toHaveAttribute("aria-pressed", "true");
    await continueButton.click();

    // 3. Niche (multiple choice).
    await expect(heading).toHaveText("What’s your space?");
    await page.getByRole("button", { name: "Fashion" }).click();
    await page.getByRole("button", { name: "Beauty" }).click();
    await continueButton.click();

    // 4. Audience size and where they follow.
    await expect(heading).toHaveText("How big is your audience?");
    await page.getByRole("button", { name: "10k to 50k" }).click();
    // Instagram is chosen already; add the Facebook Page too.
    await expect(page.getByRole("button", { name: "Instagram" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Facebook Page" }).click();
    await expect(page.getByRole("button", { name: "Facebook Page" })).toHaveAttribute("aria-pressed", "true");
    await continueButton.click();

    // 5. Goals.
    await expect(heading).toHaveText("What should your DMs do for you?");
    await page.getByRole("button", { name: "Sell products" }).click();
    await page.getByRole("button", { name: "Answer common questions" }).click();
    await continueButton.click();

    // 6. Inbox load and how they reply today.
    await expect(heading).toHaveText("How busy is your inbox?");
    await page.getByRole("button", { name: "50 to 200" }).click();
    await page.getByRole("button", { name: "I do it myself" }).click();
    await continueButton.click();

    // 7. Connect: nothing is connected, so the only way on is "later".
    await expect(heading).toHaveText("Connect your account.");
    await expect(continueButton).toHaveCount(0);
    await page.getByRole("button", { name: "I’ll do this later" }).click();

    // 8. The plan built from those answers.
    await expect(heading).toHaveText("Your setup.");
    await expect(progress).toHaveAttribute("aria-valuenow", "8");
    await expect(page.getByRole("heading", { name: "Recommended automations" })).toBeVisible();
    await page.getByRole("button", { name: "Finish", exact: true }).click();

    // 9. Done, then Home.
    await expect(heading).toHaveText("You’re all set, Priya.");
    await page.getByRole("button", { name: "Go to Home" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Priya" })).toBeVisible();

    // Finished for good: the app no longer sends this workspace to onboarding.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Priya" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await owner.context.close();
  }
});
