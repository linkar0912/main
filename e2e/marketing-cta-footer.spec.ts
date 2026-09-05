import { expect, test } from "@playwright/test";
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

const footerMarkup = `
  <footer class="site-footer">
    <a class="site-brandLink" href="/#top">Linkar</a>
    <nav class="site-navigation"><div class="site-column"><a class="footer-link" href="/help">Help</a></div></nav>
  </footer>
`;

test("footer CSS settles under reduced motion and exposes keyboard focus rings", async ({ page }) => {
  const footerCss = await readFile("src/components/marketing/marketing-footer.module.css", "utf8");
  const scoped = prepareModuleCss(footerCss, ["footer", "brandLink", "navigation", "column"], "site");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<style>${scoped}</style>${footerMarkup}`);
  await expect(page.locator(".footer-link")).toHaveCSS("transition-duration", "0s");

  for (const selector of [".footer-link", ".site-brandLink"]) {
    const link = page.locator(selector);
    await link.focus();
    await expect.poll(() => link.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(link).toHaveCSS("outline-width", "2px");
    await expect(link).toHaveCSS("outline-color", "rgb(255, 241, 0)");
    await expect(link).toHaveCSS("outline-offset", "3px");
  }
});
