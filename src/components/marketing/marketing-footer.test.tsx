// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSeoPages, seoPagePath } from "@/src/content/seo";
import { MarketingFooter } from "./marketing-footer";

const pathname = { current: "/" as string | null };
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketingFooter", () => {
  it("renders four named columns and only real internal destinations", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter />);

    const footer = screen.getByRole("contentinfo");
    const navigation = within(footer).getByRole("navigation", { name: "Footer" });
    expect(footer.id).toBe("resources");
    expect(within(footer).getByText(
      "Linkar keeps repeatable conversations moving and makes human attention count.",
    )).toBeTruthy();
    // Column titles are plain labels, not headings, so the page outline stays
    // the homepage's own sections.
    expect(within(footer).queryAllByRole("heading")).toHaveLength(0);
    for (const title of ["Product", "Resources", "Company", "Legal"]) {
      expect(within(footer).getByText(title, { selector: "p" })).toBeTruthy();
    }

    const expected = new Map([
      ["All features", "/features"],
      ["Pricing", "/pricing"],
      ["Channels", "/#channels"],
      ["How it works", "/#how-it-works"],
      ["Workflow recipes", "/templates"],
      ["Get started", "/signup"],
      ["Help and support", "/support"],
      ["Solutions", "/solutions"],
      ["Contact", "/contact"],
      ["Sign in", "/login"],
      ["Linkar home", "/#top"],
      ["Setup", "/#setup"],
      ["Questions", "/#faq"],
      ["Terms", "/terms"],
      ["Refund policy", "/refund-policy"],
      ["Acceptable use", "/acceptable-use"],
      ["Privacy", "/privacy"],
      ["Cookies", "/cookies"],
      ["Data processing", "/data-processing"],
      ["Service providers", "/service-providers"],
      ["Data deletion", "/data-deletion"],
    ]);
    for (const [name, href] of expected) {
      const link = within(navigation).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
    }

    expect(within(navigation).getAllByRole("link")).toHaveLength(expected.size);
    const links = within(footer).getAllByRole("link");
    // /help is the signed-in help centre; logged-out visitors would bounce to login.
    expect(links.some((link) => link.getAttribute("href") === "/help")).toBe(false);
    // /dashboard redirects to the app host and is disallowed in robots.txt, so
    // the public footer does not link to it. Signed-in visitors use Sign in.
    expect(links.some((link) => link.getAttribute("href")?.startsWith("/dashboard"))).toBe(false);
    expect(within(footer).queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(links.every((link) => {
      const href = link.getAttribute("href") ?? "";
      return href.startsWith("/") || href.startsWith("#");
    })).toBe(true);
  });

  it("keeps legal copy and the visual wordmark truthful and non-duplicative", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(`© ${new Date().getFullYear()} Linkar.`)).toBeTruthy();
    expect(within(footer).getByText(
      "Linkar uses Meta’s supported Instagram and Facebook interfaces. Availability and limits depend on the connected account, Page, and platform policies.",
    )).toBeTruthy();
    const brandLink = within(footer).getAllByRole("link", { name: "Linkar home" })
      .find((link) => link.className.includes("brandLink"));
    expect(brandLink).toBeTruthy();
    if (!brandLink) throw new Error("Brand link is missing");
    expect(brandLink.querySelector("svg.linkar-mark")?.getAttribute("aria-hidden")).toBe("true");
    expect(brandLink.textContent).toBe("Linkar");
    // The 22rem "LINKAR" stamp is gone, along with the ~900px of footer height
    // it needed. The brand link is the only place the name is set large now.
    expect(within(footer).queryByText("LINKAR")).toBeNull();
    expect(within(footer).getAllByRole("link").every((link) => !link.getAttribute("href")?.includes("://"))).toBe(true);
  });

  it("links every guide and recipe, grouped by collection", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    pathname.current = "/";
    render(<MarketingFooter />);

    // Query the links once: a role query per guide across ~70 links is slow
    // enough in jsdom to time out when the whole suite runs in parallel.
    const hrefs = within(screen.getByRole("navigation", { name: "All guides and recipes" }))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    for (const collection of ["features", "solutions", "templates"] as const) {
      expect(hrefs).toContain(`/${collection}`);
      for (const page of getSeoPages(collection)) {
        expect(hrefs.filter((href) => href === seoPagePath(page)), seoPagePath(page)).toHaveLength(1);
      }
    }
    expect(hrefs).toHaveLength(3 + getSeoPages("features").length + getSeoPages("solutions").length + getSeoPages("templates").length);
    expect(screen.getByRole("contentinfo").querySelectorAll("[aria-current]")).toHaveLength(0);
  });

  it("keeps the head term out of the guide names and shortens the flow builder", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter />);

    const directory = screen.getByRole("navigation", { name: "All guides and recipes" });
    // Every page carries this footer, so a guide name with "Instagram automation"
    // would send that anchor sitewide to a page other than the homepage.
    expect(directory.querySelector('a[href="/features/no-code-instagram-flow-builder"]')?.textContent).toBe("No code flow builder");
    const names = Array.from(directory.querySelectorAll("a"), (link) => link.textContent ?? "");
    expect(names.filter((name) => /instagram automation/i.test(name))).toEqual([]);
  });

  it("marks the page being read and its collection", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    pathname.current = "/solutions/online-coaches";
    render(<MarketingFooter compact />);

    const directory = screen.getByRole("navigation", { name: "All guides and recipes" });
    const current = within(directory).getByRole("link", { name: "Online coaches" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(directory.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(current.closest("[data-current]")?.textContent).toContain("Solutions");
    pathname.current = "/";
  });

  it("marks nothing when served from another host", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    pathname.current = "/features";
    render(<MarketingFooter siteOrigin="https://linkar.in" />);

    const directory = screen.getByRole("navigation", { name: "All guides and recipes" });
    expect(directory.querySelectorAll("[aria-current], [data-current]")).toHaveLength(0);
    expect(within(directory).getByRole("link", { name: "Online coaches" }).getAttribute("href")).toBe("https://linkar.in/solutions/online-coaches");
    pathname.current = "/";
  });

  it("offers a compact version without changing its navigation contract", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<MarketingFooter compact />);

    const footer = screen.getByRole("contentinfo");
    expect(footer.getAttribute("data-compact")).toBe("true");
    expect(within(footer).getByRole("navigation", { name: "Footer" })).toBeTruthy();
    expect(within(footer).queryByText("LINKAR")).toBeNull();
  });
});
