import { expect, test, type Locator, type Page } from "@playwright/test";

async function placeStoryAt(page: Page, storyBody: Locator, progress: number) {
  await storyBody.evaluate((element, nextProgress) => {
    const bounds = element.getBoundingClientRect();
    const documentTop = window.scrollY + bounds.top;
    const activationLine = window.innerHeight * 0.45;
    window.scrollTo({
      top: documentTop + bounds.height * nextProgress - activationLine,
      behavior: "instant",
    });
  }, progress);
}

test("desktop story replaces copy inside one pinned left stage", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#how-it-works");

  const section = page.locator("#how-it-works");
  const storyBody = section.locator("[data-story-body]");
  const chapters = section.locator("[data-chapter-index]");
  const copyStage = chapters.first().locator("..");
  const storyAction = section.getByRole("link", { name: "Get started" });

  const samples = [
    { progress: 0.1, activeIndex: "0", chapterIndex: 0 },
    { progress: 0.2, activeIndex: "0", chapterIndex: 0 },
    { progress: 0.35, activeIndex: "1", chapterIndex: 1 },
  ] as const;

  const stageTops: number[] = [];
  const actionTops: number[] = [];
  for (const sample of samples) {
    await placeStoryAt(page, storyBody, sample.progress);
    await expect(section).toHaveAttribute("data-active-index", sample.activeIndex);
    await expect(chapters.nth(sample.chapterIndex)).toHaveAttribute("data-chapter-state", "active");
    const bounds = await copyStage.boundingBox();
    expect(bounds).not.toBeNull();
    stageTops.push(bounds!.y);
    const actionBounds = await storyAction.boundingBox();
    expect(actionBounds).not.toBeNull();
    actionTops.push(actionBounds!.y);
  }

  expect(Math.max(...stageTops) - Math.min(...stageTops)).toBeLessThanOrEqual(2);
  expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThanOrEqual(2);
  await expect(storyAction).toHaveCSS("background-color", "rgb(5, 5, 5)");

  const progressRail = section.locator("[data-story-progress-rail]").first();
  const activeHeading = chapters.first().getByRole("heading");
  const [copyBounds, progressBounds, headingSize] = await Promise.all([
    copyStage.boundingBox(),
    progressRail.boundingBox(),
    activeHeading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ]);
  expect(copyBounds).not.toBeNull();
  expect(progressBounds).not.toBeNull();
  expect(progressBounds!.y - copyBounds!.y).toBeLessThanOrEqual(30);
  expect(headingSize).toBeGreaterThanOrEqual(60);
  await expect(activeHeading).toHaveCSS("text-align", "center");

  const progressWidths = await progressRail.locator("[data-progress-mark]").evaluateAll((marks) =>
    marks.map((mark) => mark.getBoundingClientRect().width),
  );
  expect(Math.max(...progressWidths) - Math.min(...progressWidths)).toBeLessThanOrEqual(1);
});

test("marketing previews stay contained and use neutral channel surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#how-it-works");
  await page.addStyleTag({
    content: '[data-desktop-stage] *, [data-desktop-stage] *::before, [data-desktop-stage] *::after { animation: none !important; transition: none !important; }',
  });

  const storyBody = page.locator("[data-story-body]");
  await placeStoryAt(page, storyBody, 0.125);
  const commentScene = page.locator('[data-desktop-stage] [data-scene-state="active"]');
  const commentScreen = commentScene.locator('[data-screen="feed"]');
  const inboxRow = commentScene.locator('[class*="inboxRow"]');
  const [commentBounds, inboxBounds] = await Promise.all([commentScreen.boundingBox(), inboxRow.boundingBox()]);
  expect(commentBounds).not.toBeNull();
  expect(inboxBounds).not.toBeNull();
  expect(inboxBounds!.y + inboxBounds!.height).toBeLessThanOrEqual(commentBounds!.y + commentBounds!.height + 1);

  await placeStoryAt(page, storyBody, 0.875);
  await expect(page.locator("#how-it-works")).toHaveAttribute("data-active-index", "3");
  const handoffScene = page.locator('[data-desktop-stage] [data-scene-state="active"]');
  const handoffScreen = handoffScene.locator('[data-screen="thread"]');
  const handoffBounds = await handoffScreen.boundingBox();
  expect(handoffBounds).not.toBeNull();
  const handoffItems = handoffScene.locator('[data-screen="thread"] > *');
  for (let index = 0; index < await handoffItems.count(); index += 1) {
    const item = handoffItems.nth(index);
    const [itemBounds, itemClass] = await Promise.all([item.boundingBox(), item.getAttribute("class")]);
    expect(itemBounds).not.toBeNull();
    expect(itemBounds!.x, itemClass ?? `handoff item ${index}`).toBeGreaterThanOrEqual(handoffBounds!.x - 1);
    expect(itemBounds!.x + itemBounds!.width, itemClass ?? `handoff item ${index}`).toBeLessThanOrEqual(handoffBounds!.x + handoffBounds!.width + 1);
  }

  await page.locator("#channels").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-channel="instagram"]')).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator('[data-channel="facebook"]')).toHaveCSS("background-color", "rgb(255, 255, 255)");

  const toggle = page.locator('[data-toggle-state="on"]');
  await toggle.scrollIntoViewIfNeeded();
  const knob = toggle.locator('[data-toggle-knob="true"]');
  const [toggleBounds, knobBounds] = await Promise.all([toggle.boundingBox(), knob.boundingBox()]);
  expect(toggleBounds).not.toBeNull();
  expect(knobBounds).not.toBeNull();
  expect(knobBounds!.x).toBeGreaterThanOrEqual(toggleBounds!.x);
  expect(knobBounds!.x + knobBounds!.width).toBeLessThanOrEqual(toggleBounds!.x + toggleBounds!.width + 1);
});
