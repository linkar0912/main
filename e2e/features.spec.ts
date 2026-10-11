import { expect, test } from "@playwright/test";

// The feature drop: image replies, personalization tokens, follow-up nudges,
// typed capture fields with stop words, keyword suggestions, win-back segments,
// and the seven new recipes.

test("template picker surfaces the new India-first recipes", async ({ page }) => {
  await page.goto("/automations");
  await page.getByRole("button", { name: "New automation" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Send prices when someone asks")).toBeVisible();
  await expect(dialog.getByText("Collect partnership enquiries")).toBeVisible();
  await expect(dialog.getByText("Send an offer and a reminder")).toBeVisible();
  await expect(dialog.getByText("Register people for an event")).toBeVisible();

  await dialog.getByLabel("Search templates").fill("price");
  await expect(dialog.getByText(/Send prices when someone asks/)).toBeVisible();
});

test("price-list recipe prefills an image card reply", async ({ page }) => {
  await page.route("**/api/meta/media", (route) => route.fulfill({ json: { data: [], paging: {} } }));
  await page.route("**/api/meta/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/automations/new?type=classic&template=price-list-responder");

  await expect(page.getByLabel("Automation name")).toHaveValue(/Send prices when someone asks/i);
  const imageInput = page.getByLabel("Photo link");
  await expect(imageInput).toHaveValue("https://example.com/images/price-list.jpg");
  await expect(page.getByLabel("Caption", { exact: true })).toHaveValue(/price list/i);
  // And the phone preview renders the image bubble.
  await expect(page.getByLabel(/message preview/i).locator(".ig-dm-image")).toBeVisible();
});

/** Clicks Next once and gives React a beat to swap the wizard step, so back-to-back
 * advances never double-fire on the same step. */
async function advance(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(150);
}

test("builder exposes image actions, token hints, suggestions, and follow-ups", async ({ page }) => {
  await page.route("**/api/meta/media", (route) => route.fulfill({ json: { data: [], paging: {} } }));
  await page.route("**/api/meta/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/automations/suggest-keywords", (route) =>
    route.fulfill({ json: { data: ["kurti", "price", "collab"] } }));
  await page.goto("/automations/new?type=classic");
  await page.getByLabel("Automation name").fill("Feature coverage flow");

  // Keyword suggestion chips render from the endpoint.
  const chips = page.getByTestId("keyword-suggestions");
  await expect(chips.getByRole("button", { name: "+ kurti" })).toBeVisible();
  await chips.getByRole("button", { name: "+ kurti" }).click();
  await expect(page.getByRole("button", { name: "Remove kurti" })).toBeVisible();

  // Switch to a DM trigger, then move to the action step
  // (Trigger → Condition → Action).
  await page.getByLabel("Starts when").selectOption("message");
  await advance(page);
  await advance(page);

  // Personalization hint under the message text.
  await expect(page.getByText(/Personalize with/i)).toBeVisible();
  await page.getByLabel("Message text").fill("Here are the details you requested.");

  // Follow-up nudge editor on DM triggers.
  await page.getByRole("button", { name: "Add a reminder message" }).click();
  const reminder = page.getByRole("group", { name: "Reminder 1" });
  await reminder.getByLabel("Wait before sending (minutes)").fill("1440");
  await reminder
    .getByLabel("Reminder message")
    .fill("Still interested, {username}? Your offer ends tonight.");
  await reminder.getByLabel("Reminder button text").fill("Claim");
  await reminder.getByLabel("Reminder button link").fill("https://example.com/offer");

  // Walk to Review (Email collector → Guardrails → Review) and confirm the
  // summary calls out the scheduled nudge.
  await advance(page);
  await advance(page);
  await advance(page);
  await expect(page.getByText(/1 reminder message follows, 1 day later/i)).toBeVisible();
});

test("capture fields support answer types and stop words", async ({ page }) => {
  await page.route("**/api/meta/media", (route) => route.fulfill({ json: { data: [], paging: {} } }));
  await page.route("**/api/meta/connection", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/automations/new?type=classic");

  await page.getByLabel("Automation name").fill("Capture fields test");
  await page.getByLabel("Starts when").selectOption("message");
  // Walk to the email collector step (Condition → Action → Email collector).
  await advance(page);
  await advance(page);
  await page.getByLabel("Message text").fill("Tell us where to send the details.");
  await advance(page);
  await page.getByRole("checkbox", { name: /ask for the person/i }).check();
  await page.waitForTimeout(150);
  await page.getByLabel("Question asking for their email").fill("Your email?");
  await page.getByLabel("Thank-you message").fill("You are in!");
  await page.getByText("Extra questions and other apps").click();
  await page.getByRole("button", { name: "Add question" }).click();

  const question = page.getByRole("group", { name: "Question 1" });
  await expect(question.getByLabel("Answer type")).toBeVisible();
  await question.getByLabel("Answer type").selectOption("phone");
  await question.getByLabel("Words that end the questions").fill("no, not now");

  await expect(page.getByLabel("Message when they stop")).toBeVisible();
});

test("broadcasts screen offers eligible contact segments", async ({ page }) => {
  await page.route("**/api/broadcasts", (route) =>
    route.fulfill({ json: { data: [] } }, ));
  await page.goto("/automations/broadcasts");

  const segment = page.getByLabel("Segment");
  await expect(segment.getByRole("option", { name: "Leads with a captured email" })).toHaveCount(1);
  await expect(segment.getByRole("option", { name: "All known contacts" })).toHaveCount(1);
  await segment.selectOption("all_contacts");
  await expect(page.getByText(/last 24 hours receive a DM/i)).toBeVisible();
});
