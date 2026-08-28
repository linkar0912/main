import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";

function scopeModuleCss(css: string, names: string[], prefix: string) {
  return names.reduce(
    (scoped, name) => scoped.replaceAll(new RegExp(`\\.${name}\\b`, "g"), `.${prefix}-${name}`),
    css,
  );
}

function prepareModuleCss(css: string, names: string[], prefix: string) {
  const withGlobals = css.replaceAll(/:global\(([^()]*)\)/g, "$1");
  return scopeModuleCss(withGlobals, names, prefix);
}

const ctaMarkup = `
  <section id="get-started" class="cta-section" aria-labelledby="cta-title">
    <div class="cta-copy button-reveal" data-reveal data-enhanced="true">
      <h2 id="cta-title">Give every promising conversation a next step.</h2>
      <a class="cta-action cta-primaryAction" href="/signup"><span class="button-buttonRoll"><span class="button-buttonRollCopy button-buttonRollCopyPrimary" aria-hidden="true">Create your flow</span><span class="button-buttonRollCopy button-buttonRollCopySecondary" aria-hidden="true">Create your flow</span><span class="button-visuallyHidden">Create your flow</span></span></a>
      <a class="cta-action cta-secondaryAction" href="/#how-it-works">See how it works</a>
    </div>
    <figure class="cta-figure button-reveal" data-reveal data-enhanced="true"></figure>
  </section>
`;

const footerMarkup = `
  <footer class="site-footer">
    <a class="site-brandLink" href="/#top">Linkar</a>
    <nav class="site-navigation"><a class="footer-link" href="/help">Help</a></nav>
    <p class="site-wordmark button-reveal" data-reveal data-enhanced="true" aria-hidden="true">LINKAR</p>
  </footer>
`;

async function expectStableButtonRoll(action: Locator) {
  const copies = action.locator(".button-buttonRollCopy");
  await expect(copies).toHaveCount(2);
  const [primary, secondary] = await copies.all();
  for (const copy of [primary, secondary]) {
    await expect(copy).toHaveCSS("animation-name", "none");
    await expect(copy).toHaveCSS("animation-duration", "0s");
    await expect(copy).toHaveCSS("transition-duration", "0s");
    await expect(copy).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  }
  await expect(primary).toHaveCSS("visibility", "visible");
  await expect(secondary).toHaveCSS("visibility", "hidden");
}

test("CTA and footer CSS settle under reduced motion and expose keyboard focus rings", async ({ page }) => {
  const [ctaCss, footerCss, primitiveCss] = await Promise.all([
    readFile("src/components/marketing/final-cta.module.css", "utf8"),
    readFile("src/components/marketing/marketing-footer.module.css", "utf8"),
    readFile("src/components/marketing/primitives.module.css", "utf8"),
  ]);
  const scoped = [
    prepareModuleCss(primitiveCss, ["reveal", "buttonRoll", "buttonRollCopy", "buttonRollCopyPrimary", "buttonRollCopySecondary", "visuallyHidden"], "button"),
    prepareModuleCss(ctaCss, ["section", "copy", "title", "body", "actions", "action", "primaryAction", "secondaryAction", "figure"], "cta"),
    prepareModuleCss(footerCss, ["footer", "brandLink", "navigation", "wordmark"], "site"),
  ].join("\n");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<style>${scoped}</style>${ctaMarkup}${footerMarkup}`);

  const ctaCopy = page.locator(".cta-copy");
  const figure = page.locator(".cta-figure");
  const wordmark = page.locator(".site-wordmark");
  for (const element of [ctaCopy, figure]) {
    await expect(element).toHaveCSS("opacity", "1");
    await expect(element).toHaveCSS("animation-name", "none");
    await expect(element).toHaveCSS("transition-duration", "0s");
  }
  await expect(wordmark).toHaveCSS("opacity", "0.35");
  await expect(wordmark).toHaveCSS("animation-name", "none");
  await expect(wordmark).toHaveCSS("transition-duration", "0s");
  await expect(ctaCopy).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(wordmark).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(figure).toHaveCSS("transform", /^matrix\(/);
  const primaryAction = page.locator(".cta-primaryAction");
  await expectStableButtonRoll(primaryAction);
  await primaryAction.hover();
  await expectStableButtonRoll(primaryAction);
  await primaryAction.focus();
  await expect.poll(() => primaryAction.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expectStableButtonRoll(primaryAction);

  for (const selector of [".cta-primaryAction", ".cta-secondaryAction"]) {
    const action = page.locator(selector);
    await action.focus();
    await expect.poll(() => action.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(action).toHaveCSS("outline-width", "2px");
    await expect(action).toHaveCSS("outline-color", "rgb(5, 5, 5)");
    await expect(action).toHaveCSS("outline-offset", "3px");
  }

  for (const selector of [".footer-link", ".site-brandLink"]) {
    const link = page.locator(selector);
    await link.focus();
    await expect.poll(() => link.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(link).toHaveCSS("outline-width", "2px");
    await expect(link).toHaveCSS("outline-color", "rgb(255, 241, 0)");
    await expect(link).toHaveCSS("outline-offset", "3px");
  }
});
