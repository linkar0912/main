// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import AcceptableUsePage, { metadata as acceptableUseMetadata } from "@/app/acceptable-use/page";
import ContactPage, { metadata as contactMetadata } from "@/app/contact/page";
import CookiesPage, { metadata as cookiesMetadata } from "@/app/cookies/page";
import DataDeletionPage, { metadata as dataDeletionMetadata } from "@/app/data-deletion/page";
import DataProcessingPage, { metadata as dataProcessingMetadata } from "@/app/data-processing/page";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import RefundPolicyPage, { metadata as refundMetadata } from "@/app/refund-policy/page";
import ServiceProvidersPage, { metadata as serviceProvidersMetadata } from "@/app/service-providers/page";
import SupportPage, { metadata as supportMetadata } from "@/app/support/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import { ANALYTICS_CONSENT_COOKIE } from "@/src/lib/analytics-consent";
import { LEGAL_FILL_ME } from "@/src/lib/legal-entity";
import { isMarketingPath } from "@/src/lib/site-routing";

const pages = [
  ["/terms", TermsPage, termsMetadata],
  ["/privacy", PrivacyPage, privacyMetadata],
  ["/refund-policy", RefundPolicyPage, refundMetadata],
  ["/contact", ContactPage, contactMetadata],
  ["/cookies", CookiesPage, cookiesMetadata],
  ["/acceptable-use", AcceptableUsePage, acceptableUseMetadata],
  ["/data-processing", DataProcessingPage, dataProcessingMetadata],
  ["/service-providers", ServiceProvidersPage, serviceProvidersMetadata],
  ["/data-deletion", DataDeletionPage, dataDeletionMetadata],
  ["/support", SupportPage, supportMetadata],
] as const satisfies ReadonlyArray<readonly [string, () => React.ReactNode, Metadata]>;

function headings() {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

function article() {
  return screen.getByRole("article");
}

describe("public legal and support pages", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    cleanup();
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=; Path=/; Max-Age=0`;
    vi.unstubAllGlobals();
  });

  it.each(pages)("%s has its own title, description, and canonical, and never shows a placeholder", (path, Page, metadata) => {
    expect(String(metadata.title)).toMatch(/ · Linkar$/);
    expect(metadata.description).toBeTruthy();
    expect(metadata.alternates?.canonical).toBe(path);
    expect(isMarketingPath(path)).toBe(true);

    const { container } = render(<Page />);
    expect(container.textContent).not.toContain(LEGAL_FILL_ME);
    expect(container.textContent).not.toContain("—");
  });

  it("terms cover renewal, refunds, termination, liability, governing law, grievances, and the operator", () => {
    render(<TermsPage />);

    expect(headings()).toEqual(expect.arrayContaining([
      "Who we are",
      "Plans, subscriptions, and auto-renewal",
      "Refunds and cancellation",
      "Suspension and termination",
      "Disclaimers and limitation of liability",
      "Governing law and jurisdiction",
      "Grievance redressal",
    ]));
    const text = article().textContent ?? "";
    expect(text).toMatch(/sole proprietor/);
    expect(text).toMatch(/renews automatically/);
    expect(text).toMatch(/laws of India/);
    expect(within(article()).getByRole("link", { name: "refund and cancellation policy" }).getAttribute("href")).toBe("/refund-policy");
  });

  it("the refund policy matches cancel-at-period-end billing", () => {
    render(<RefundPolicyPage />);
    const text = article().textContent ?? "";

    expect(text).toMatch(/end of the billing period you have already paid for/);
    expect(text).toMatch(/moves to the Free plan/);
    expect(text).toMatch(/not prorated/);
    expect(text).toMatch(/duplicate charge/);
  });

  it("the privacy policy names sign-in, billing, link-click, email, analytics consent, DPDP rights, and the grievance officer", () => {
    render(<PrivacyPage />);
    const text = article().textContent ?? "";

    for (const fact of [/sign in with Google/, /sign in with Facebook/, /Razorpay/, /one-way hash of their IP address/, /user agent/, /country/, /Resend/, /only after you accept analytics cookies/, /DPDP Act/, /Data Protection Board of India/, /grievance officer/]) {
      expect(text).toMatch(fact);
    }
  });

  it("the service providers list includes email, hosting, and network providers", () => {
    render(<ServiceProvidersPage />);
    const text = article().textContent ?? "";
    expect(text).toMatch(/Resend\./);
    expect(text).toMatch(/netcup\./);
    expect(text).toMatch(/Cloudflare\./);
    expect(text).toMatch(/Valkey/);
  });

  it("the contact page gives the operator, email, and grievance officer", () => {
    render(<ContactPage />);
    const text = article().textContent ?? "";

    expect(text).toMatch(/Sole proprietorship, India/);
    expect(text).toMatch(/Grievance officer/);
    expect(within(article()).getAllByRole("link", { name: "support@linkar.in" }).length).toBeGreaterThan(0);
  });

  it("the cookies statement lets a visitor change their analytics choice", () => {
    render(<CookiesPage />);
    const controls = screen.getByRole("group", { name: "Analytics cookie choice" });

    expect(controls.textContent).toMatch(/not made a choice/);
    fireEvent.click(within(controls).getByRole("button", { name: "Accept analytics" }));
    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=granted`);
    expect(controls.textContent).toMatch(/You have accepted/);

    fireEvent.click(within(controls).getByRole("button", { name: "Reject analytics" }));
    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=denied`);
    expect(within(controls).getByRole("button", { name: "Reject analytics" }).getAttribute("aria-pressed")).toBe("true");
  });
});
