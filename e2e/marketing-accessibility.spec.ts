import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

type RollState = {
  primary: {
    transform: string;
    visibility: string;
    animationName: string;
    animationDuration: string;
    transitionDuration: string;
  };
  secondary: {
    transform: string;
    visibility: string;
    animationName: string;
    animationDuration: string;
    transitionDuration: string;
  };
};

async function readRollState(action: Locator) {
  return action.evaluate((link) => {
    const [primary, secondary] = Array.from(link.querySelectorAll<HTMLElement>('[aria-hidden="true"]'));
    const read = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        transform: style.transform,
        visibility: style.visibility,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    };

    if (!primary || !secondary) throw new Error("ButtonRoll visual copies are missing");
    return { primary: read(primary), secondary: read(secondary) };
  });
}

function expectStableReducedMotion(state: RollState) {
  for (const copy of [state.primary, state.secondary]) {
    expect(copy.animationName).toBe("none");
    expect(copy.animationDuration).toBe("0s");
    expect(copy.transitionDuration).toBe("0s");
    expect(copy.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  }
  expect(state.primary.visibility).toBe("visible");
  expect(state.secondary.visibility).toBe("hidden");
}

test("ButtonRoll labels remain stable for reduced-motion idle, hover, and keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const primitives = await readFile("src/components/marketing/primitives.module.css", "utf8");
  const primitivesWithGlobals = primitives.replaceAll(/:global\(([^()]*)\)/g, "$1");
  await page.setContent(`
    <style>
      ${primitivesWithGlobals}
      .hero.primaryAction [aria-hidden="true"]:nth-child(2) {
        animation: button-secondary-label-in 420ms cubic-bezier(.43, .195, .02, 1) 700ms;
      }
      @keyframes button-secondary-label-in {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
    </style>
    <a class="hero primaryAction" href="/signup">
      <span class="buttonRoll">
        <span class="buttonRollCopy buttonRollCopyPrimary" aria-hidden="true">Start building</span>
        <span class="buttonRollCopy buttonRollCopySecondary" aria-hidden="true">Start building</span>
        <span class="visuallyHidden">Start building</span>
      </span>
    </a>
  `);

  const action = page.getByRole("link", { name: "Start building" });
  await expect(action).toBeVisible();

  expectStableReducedMotion(await readRollState(action));

  await action.hover();
  expectStableReducedMotion(await readRollState(action));

  await page.keyboard.press("Tab");
  await action.focus();
  await expect.poll(() => action.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  expectStableReducedMotion(await readRollState(action));
});
