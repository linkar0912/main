import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createMailer, maskEmailAddress } = await import("./mailer");

describe("Resend mail transport", () => {
  it("reports unavailable without making a request when configuration is missing", async () => {
    const fetch = vi.fn();
    const mailer = createMailer({ apiKey: undefined, from: undefined, fetch });
    await expect(mailer.send({ to: "owner@linkar.in", subject: "Alert", body: "Body" }))
      .resolves.toEqual({ delivered: false, reason: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts a plain-text email with authentication and idempotency", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const mailer = createMailer({ apiKey: "re_secret", from: "Linkar <alerts@linkar.in>", fetch });
    await expect(mailer.send({
      to: "owner@linkar.in",
      subject: "Database unavailable",
      body: "The database probe failed.",
      idempotencyKey: "incident:i_1:open:critical",
    })).resolves.toEqual({ delivered: true, id: "email_1" });

    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer re_secret",
        "Idempotency-Key": "incident:i_1:open:critical",
        "User-Agent": expect.stringContaining("Linkar"),
      }),
    }));
    const request = fetch.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      from: "Linkar <alerts@linkar.in>",
      to: ["owner@linkar.in"],
      subject: "Database unavailable",
      text: "The database probe failed.",
    });
  });

  it("fails safely on provider errors without logging or returning the key", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("invalid sender", { status: 422 }));
    const mailer = createMailer({ apiKey: "re_secret", from: "bad@linkar.in", fetch });
    const result = await mailer.send({ to: "owner@linkar.in", subject: "Alert", body: "Body" });
    expect(result).toEqual({ delivered: false, reason: "provider_error", status: 422 });
    expect(JSON.stringify(result)).not.toContain("re_secret");
  });

  it("masks recipient addresses in delivery logs", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_2" }), { status: 200 }));
    const mailer = createMailer({ apiKey: "re_secret", from: "Linkar <alerts@linkar.in>", fetch });
    await mailer.send({ to: "jane.doe@example.com", subject: "Your guide", body: "Body" });
    const logged = info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain("jane.doe@example.com");
    expect(logged).toContain("j***@example.com");
    expect(maskEmailAddress("not-an-email")).toBe("***");
    info.mockRestore();
  });
});
