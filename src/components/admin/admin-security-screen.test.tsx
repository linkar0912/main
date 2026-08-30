// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AdminSecurityScreen } from "./admin-security-screen";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AdminSecurityScreen", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("keeps enrollment secrets hidden until requested and verifies a six-digit code", async () => {
    const onVerified = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init) throw new Error("Expected a POST request");
      const body = JSON.parse(String(init.body)) as { action: string };
      if (body.action === "enroll") {
        return jsonResponse({
          data: {
            factorId: "factor-new",
            qrCode: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
            secret: "PRIVATESECRET",
            uri: "otpauth://totp/Linkar",
          },
        });
      }
      if (body.action === "verify") {
        return jsonResponse({ data: { verified: true, redirectTo: "/admin" } });
      }
      throw new Error(`Unexpected action ${body.action}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{ aal: "aal1", nextAal: "aal2", factors: [] }} onVerified={onVerified} />);

    expect(await screen.findByText("MFA enrollment required")).toBeTruthy();
    expect(screen.queryByText("PRIVATESECRET")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    expect(await screen.findByText("PRIVATESECRET")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Linkar authenticator QR code" })).toBeTruthy();

    const code = screen.getByLabelText("Six-digit verification code");
    fireEvent.change(code, { target: { value: "123" } });
    expect((screen.getByRole("button", { name: "Verify and open admin" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and open admin" }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith("/admin"));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/security",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "verify", factorId: "factor-new", code: "123456" }) }),
    );
  });

  it("keeps provider errors in the security panel", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "mfa_provider_error" }, 502)) as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{ aal: "aal1", nextAal: "aal2", factors: [] }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));

    expect((await screen.findByRole("alert")).textContent).toContain("MFA provider is temporarily unavailable");
    expect(screen.getByText("MFA enrollment required")).toBeTruthy();
  });

  it("shows factor removal only when another verified recovery factor exists", async () => {
    global.fetch = vi.fn() as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{
      aal: "aal2",
      nextAal: "aal2",
      factors: [
        { id: "factor-1", friendlyName: "Primary", factorType: "totp", status: "verified" },
        { id: "factor-2", friendlyName: "Backup", factorType: "totp", status: "verified" },
      ],
    }} />);

    expect(await screen.findByText("Primary")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Remove/ })).toHaveLength(2);
  });
});
