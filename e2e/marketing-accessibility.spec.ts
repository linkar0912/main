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

function scopeModuleCss(css: string, prefix: string, classes: string[]) {
  return classes.reduce(
    (scoped, className) => scoped.replaceAll(new RegExp(`\\.${className}\\b`, "g"), `.${prefix}-${className}`),
    css,
  );
}

function proofRailMarkup() {
  return `
    <section id="proof" class="proof-section" aria-label="Linkar product facts">
      <h2 class="visually-hidden">Linkar product facts</h2>
      <div class="proof-frame" data-ticker="continuous" data-pause-on-hover="true" data-pause-on-focus="true">
        <div class="proof-track">
          <ul class="proof-facts" data-reduced-motion-layout="wrap">
            <li>Built on the official messaging API</li>
            <li>Tokens encrypted at rest</li>
            <li>Deterministic flow rules</li>
            <li>Follow-ups respect the messaging window</li>
          </ul>
          <ul class="proof-facts" aria-hidden="true">
            <li>Built on the official messaging API</li>
            <li>Tokens encrypted at rest</li>
            <li>Deterministic flow rules</li>
            <li>Follow-ups respect the messaging window</li>
          </ul>
        </div>
      </div>
    </section>
  `;
}

function manifestoMarkup() {
  return `
    <section id="product" class="manifesto-section manifesto-section--enhanced" data-enhanced="true" data-reduced-motion-state="visible">
      <div class="manifesto-frame">
        <h2 class="manifesto-title">The best conversations should keep working after you log off.</h2>
        <p class="manifesto-body">Linkar carries the useful next step forward, then makes room for you when judgment matters.</p>
      </div>
    </section>
  `;
}

test("ProofRail pauses on hover/focus and settles both editorial sections under reduced motion", async ({ page }) => {
  const proofCss = scopeModuleCss(
    await readFile("src/components/marketing/proof-rail.module.css", "utf8"),
    "proof",
    ["section", "frame", "track", "facts"],
  );
  const manifestoCss = scopeModuleCss(
    await readFile("src/components/marketing/manifesto-section.module.css", "utf8"),
    "manifesto",
    ["section", "frame", "title", "body"],
  );

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<style>${proofCss}${manifestoCss}</style>${proofRailMarkup()}${manifestoMarkup()}`);

  const frame = page.locator(".proof-frame");
  const track = page.locator(".proof-track");
  await expect(track).toHaveCSS("animation-play-state", "running");
  await frame.hover();
  await expect(track).toHaveCSS("animation-play-state", "paused");

  await page.mouse.move(1000, 500);
  await expect(track).toHaveCSS("animation-play-state", "running");
  await page.locator(".proof-facts").first().evaluate((list) => list.setAttribute("tabindex", "0"));
  await page.locator(".proof-facts").first().focus();
  await expect(track).toHaveCSS("animation-play-state", "paused");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<style>${proofCss}${manifestoCss}</style>${proofRailMarkup()}${manifestoMarkup()}`);
  await expect(frame).toHaveCSS("overflow-x", "hidden");
  await expect(track).toHaveCSS("animation-name", "none");
  await expect(page.locator('.proof-facts[aria-hidden="true"]')).toHaveCSS("display", "none");
  await expect(page.locator(".proof-facts").first()).toHaveCSS("flex-wrap", "wrap");
  await expect(page.locator(".manifesto-title")).toHaveCSS("opacity", "1");
  await expect(page.locator(".manifesto-title")).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(page.locator(".manifesto-title")).toHaveCSS("transition-duration", "0s");
  await expect(page.locator(".manifesto-body")).toHaveCSS("opacity", "1");
  await expect(page.locator(".manifesto-body")).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
});
