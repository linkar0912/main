import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

function scopeModuleCss(css: string, names: string[], prefix: string) {
  return names.reduce(
    (scoped, name) => scoped.replaceAll(new RegExp(`\\.${name}\\b`, "g"), `.${prefix}-${name}`),
    css,
  );
}

const ctaMarkup = `
  <section id="get-started" class="cta-section" aria-labelledby="cta-title">
    <div class="cta-copy button-reveal" data-reveal data-enhanced="true" data-visible="true">
      <h2 id="cta-title">Give every promising conversation a next step.</h2>
      <a class="cta-action cta-primaryAction" href="/signup"><span class="button-buttonRoll"><span class="button-buttonRollCopy button-buttonRollCopyPrimary" aria-hidden="true">Create your flow</span><span class="button-buttonRollCopy button-buttonRollCopySecondary" aria-hidden="true">Create your flow</span><span class="button-visuallyHidden">Create your flow</span></span></a>
    </div>
    <figure class="cta-figure button-reveal" data-reveal data-enhanced="true" data-visible="true"></figure>
  </section>
`;

const footerMarkup = `
  <footer class="site-footer">
    <a class="site-brandLink" href="/#top">Linkar</a>
    <nav class="site-navigation"><a class="footer-link" href="/help">Help</a></nav>
    <p class="site-wordmark button-reveal" data-reveal data-enhanced="true" data-visible="true" aria-hidden="true">LINKAR</p>
  </footer>
`;

test("CTA and footer CSS settle under reduced motion and expose keyboard focus rings", async ({ page }) => {
  const [ctaCss, footerCss, primitiveCss] = await Promise.all([
    readFile("src/components/marketing/final-cta.module.css", "utf8"),
    readFile("src/components/marketing/marketing-footer.module.css", "utf8"),
    readFile("src/components/marketing/primitives.module.css", "utf8"),
  ]);
  const scoped = [
    scopeModuleCss(ctaCss, ["section", "copy", "title", "body", "actions", "action", "primaryAction", "secondaryAction", "figure"], "cta"),
    scopeModuleCss(footerCss, ["footer", "brandLink", "navigation", "wordmark"], "site"),
    scopeModuleCss(primitiveCss, ["reveal", "buttonRoll", "buttonRollCopy", "buttonRollCopyPrimary", "buttonRollCopySecondary", "visuallyHidden"], "button"),
  ].join("\n");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<style>${scoped}</style>${ctaMarkup}${footerMarkup}`);

  const ctaCopy = page.locator(".cta-copy");
  const figure = page.locator(".cta-figure");
  const wordmark = page.locator(".site-wordmark");
  const rollCopies = page.locator(".button-buttonRollCopy");
  for (const element of [ctaCopy, figure, wordmark]) {
    await expect(element).toHaveCSS("opacity", "1");
    await expect(element).toHaveCSS("animation-name", "none");
    await expect(element).toHaveCSS("transition-duration", "0s");
  }
  await expect(ctaCopy).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(wordmark).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  for (const copy of await rollCopies.all()) {
    await expect(copy).toHaveCSS("animation-name", "none");
    await expect(copy).toHaveCSS("transition-duration", "0s");
  }
  await expect(rollCopies.nth(0)).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(rollCopies.nth(1)).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(rollCopies.nth(1)).toHaveCSS("visibility", "hidden");

  const ctaAction = page.locator(".cta-action");
  await ctaAction.focus();
  await expect.poll(() => ctaAction.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(ctaAction).toHaveCSS("outline-width", "2px");
  await expect(ctaAction).toHaveCSS("outline-color", "rgb(5, 5, 5)");

  const footerLink = page.locator(".footer-link");
  await footerLink.focus();
  await expect.poll(() => footerLink.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(footerLink).toHaveCSS("outline-width", "2px");
  await expect(footerLink).toHaveCSS("outline-color", "rgb(255, 241, 0)");
});
