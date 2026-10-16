// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AdminSecurityScreen } from "./admin-security-screen";

// What auth-js mfa.enroll() returns for a TOTP factor: GoTrue's SVG behind a
// data: prefix it adds itself (GoTrueClient._enroll).
const AUTH_JS_QR = "data:image/svg+xml;utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><rect x=\"0\" y=\"0\" width=\"1\" height=\"1\" style=\"fill:black;stroke:none\"/></svg>";

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
            qrCode: AUTH_JS_QR,
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

    expect(await screen.findByText("Set up two-factor sign-in")).toBeTruthy();
    expect(screen.queryByText("PRIVATESECRET")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    expect(await screen.findByText("PRIVATESECRET")).toBeTruthy();
    // Used as it is: prefixing it again made the image fail to load.
    expect(screen.getByRole("img", { name: "Linkar authenticator QR code" }).getAttribute("src")).toBe(AUTH_JS_QR);

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

    expect((await screen.findByRole("alert")).textContent).toContain("Two-factor sign-in is temporarily unavailable");
    expect(screen.getByText("Set up two-factor sign-in")).toBeTruthy();
  });

  it("challenges an existing verified factor instead of trying to enroll a duplicate", async () => {
    const onVerified = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string; factorId: string; code: string };
      expect(body).toEqual({ action: "verify", factorId: "factor-primary", code: "654321" });
      return jsonResponse({ data: { verified: true, redirectTo: "/admin" } });
    });
    global.fetch = fetchMock as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{
      aal: "aal1",
      nextAal: "aal2",
      factors: [{ id: "factor-primary", friendlyName: "Linkar Operator", factorType: "totp", status: "verified" }],
    }} onVerified={onVerified} />);

    expect(screen.getByRole("heading", { name: "Verify your authenticator" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up authenticator" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Six-digit verification code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and open admin" }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith("/admin"));
  });

  it("encodes raw SVG markup when the QR code is not already a data URI", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ data: { factorId: "factor-new", qrCode: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", secret: "S", uri: "otpauth://x" } })) as typeof fetch;
    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{ aal: "aal1", nextAal: "aal2", factors: [] }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
    const image = await screen.findByRole("img", { name: "Linkar authenticator QR code" });
    expect(image.getAttribute("src")).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")}`);
  });

  it("verifies at AAL1 with the backup app the owner picks", async () => {
    // Losing the phone with the first app must not lock the owner out.
    const onVerified = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string; factorId: string; code: string };
      return body.factorId === "factor-2"
        ? jsonResponse({ data: { verified: true, redirectTo: "/admin" } })
        : jsonResponse({ error: "invalid_mfa_code" }, 422);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{
      aal: "aal1",
      nextAal: "aal2",
      factors: [
        { id: "factor-1", friendlyName: "Work phone", factorType: "totp", status: "verified" },
        { id: "factor-unverified", friendlyName: "Abandoned", factorType: "totp", status: "unverified" },
        { id: "factor-2", friendlyName: "Backup tablet", factorType: "totp", status: "verified" },
      ],
    }} onVerified={onVerified} />);

    const picker = screen.getByRole("group", { name: "Authenticator app" });
    const options = Array.from(picker.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(options.map((option) => option.value)).toEqual(["factor-1", "factor-2"]);
    expect(screen.getByRole("radio", { name: "Work phone" })).toHaveProperty("checked", true);

    fireEvent.click(screen.getByRole("radio", { name: "Backup tablet" }));
    expect(screen.getByRole("radio", { name: "Backup tablet" })).toHaveProperty("checked", true);
    fireEvent.change(screen.getByLabelText("Six-digit verification code"), { target: { value: "246810" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and open admin" }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith("/admin"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ action: "verify", factorId: "factor-2", code: "246810" });
  });

  it("names the only verified app instead of offering a choice", () => {
    global.fetch = vi.fn() as typeof fetch;
    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{
      aal: "aal1",
      nextAal: "aal2",
      factors: [{ id: "factor-1", friendlyName: "Work phone", factorType: "totp", status: "verified" }],
    }} />);
    expect(screen.queryByRole("group", { name: "Authenticator app" })).toBeNull();
    expect(screen.getByText("Enter a fresh six-digit code from Work phone.")).toBeTruthy();
  });

  it("adds a backup factor at AAL2 and reloads the inventory instead of redirecting", async () => {
    const onVerified = vi.fn();
    let factors = [{ id: "factor-1", friendlyName: "Linkar Operator", factorType: "totp", status: "verified" }];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return jsonResponse({ data: { aal: "aal2", nextAal: "aal2", factors } });
      const body = JSON.parse(String(init.body)) as { action: string };
      if (body.action === "enroll") {
        return jsonResponse({ data: { factorId: "factor-2", friendlyName: "Linkar Operator 2", qrCode: AUTH_JS_QR, secret: "BACKUPSECRET", uri: "otpauth://totp/Linkar" } });
      }
      if (body.action === "verify") {
        factors = [...factors, { id: "factor-2", friendlyName: "Linkar Operator 2", factorType: "totp", status: "verified" }];
        return jsonResponse({ data: { verified: true, redirectTo: "/admin" } });
      }
      throw new Error(`Unexpected action ${body.action}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{ aal: "aal2", nextAal: "aal2", factors: factors as never }} onVerified={onVerified} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a backup app" }));
    expect(await screen.findByText("BACKUPSECRET")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Six-digit verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify backup app" }));

    expect((await screen.findByRole("status")).textContent).toBe("Backup app Linkar Operator 2 verified.");
    expect(onVerified).not.toHaveBeenCalled();
    expect(screen.queryByText("BACKUPSECRET")).toBeNull();
    expect(screen.getByText("Linkar Operator 2")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Remove/ })).toHaveLength(2);
  });

  it("lets the owner cancel a backup enrollment", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ data: { factorId: "factor-2", friendlyName: "Linkar Operator 2", qrCode: AUTH_JS_QR, secret: "BACKUPSECRET", uri: "otpauth://x" } })) as typeof fetch;

    render(<AdminSecurityScreen ownerEmail="owner@linkar.in" initialSecurity={{ aal: "aal2", nextAal: "aal2", factors: [{ id: "factor-1", friendlyName: "Primary", factorType: "totp", status: "verified" }] }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a backup app" }));
    expect(await screen.findByText("BACKUPSECRET")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("BACKUPSECRET")).toBeNull();
    expect(screen.getByRole("button", { name: "Add a backup app" })).toBeTruthy();
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
