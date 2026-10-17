import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnboardingClient, SelectFacebookPageError } from "./onboarding-client";

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));
}

async function selectFailure(): Promise<SelectFacebookPageError> {
  const error = await createOnboardingClient(vi.fn()).selectFacebookPage("page_1").then(
    () => { throw new Error("expected the select to fail"); },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(SelectFacebookPageError);
  return error as SelectFacebookPageError;
}

describe("onboarding client selectFacebookPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the chosen Page and resolves once it is connected", async () => {
    answer(200, { connected: true });
    await expect(createOnboardingClient(vi.fn()).selectFacebookPage("page_1")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/api/facebook/oauth/select", expect.objectContaining({ method: "POST", body: JSON.stringify({ pageId: "page_1" }) }));
  });

  it("says the Page belongs to another workspace on a 409 already-connected", async () => {
    answer(409, { error: "This Facebook Page is already connected to another workspace", code: "already-connected" });
    const error = await selectFailure();
    expect(error.status).toBe(409);
    expect(error.code).toBe("already-connected");
    expect(error.message).toBe("That Page is already connected to another Linkar workspace.");
  });

  it("asks them to connect again when choosing took too long (410)", async () => {
    answer(410, { error: "Facebook Page selection expired" });
    const error = await selectFailure();
    expect(error.status).toBe(410);
    expect(error.message).toBe("Choosing a Page took too long. Connect Facebook again to pick one.");
  });

  it("explains a full plan on a 409 limit_reached", async () => {
    answer(409, { error: "limit_reached", capability: "facebook", used: 1, limit: 1 });
    const error = await selectFailure();
    expect(error.status).toBe(409);
    expect(error.code).toBe("limit_reached");
    expect(error.message).toBe("Your plan has no room for another Facebook Page.");
  });

  it("shows the server's sentence on a 403, and a role message for a bare forbidden", async () => {
    answer(403, { error: "You need full control of this Page to connect it." });
    const sentence = await selectFailure();
    expect(sentence.status).toBe(403);
    expect(sentence.message).toBe("You need full control of this Page to connect it.");

    answer(403, { error: "forbidden" });
    const forbidden = await selectFailure();
    expect(forbidden.status).toBe(403);
    expect(forbidden.message).toBe("Only the owner or an admin can connect a Page.");
  });

  it("passes the server's retry message through on a 502", async () => {
    answer(502, { error: "Meta is temporarily unavailable. Try again in a moment." });
    const error = await selectFailure();
    expect(error.status).toBe(502);
    expect(error.message).toBe("Meta is temporarily unavailable. Try again in a moment.");
  });

  it("gives each refusal its own message", async () => {
    const messages = new Set<string>();
    for (const [status, body] of [
      [409, { error: "This Facebook Page is already connected to another workspace", code: "already-connected" }],
      [410, { error: "Facebook Page selection expired" }],
      [409, { error: "limit_reached" }],
      [403, { error: "forbidden" }],
      [502, { error: "Meta is temporarily unavailable. Try again in a moment." }],
    ] as const) {
      answer(status, body);
      messages.add((await selectFailure()).message);
    }
    expect(messages.size).toBe(5);
  });

  it("never shows an edge error page or technical subscription text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><title>Bad gateway</title>", { status: 502 })));
    const edge = await selectFailure();
    expect(edge.status).toBe(502);
    expect(edge.message).not.toMatch(/DOCTYPE|JSON/);
    expect(edge.message.length).toBeGreaterThan(0);

    answer(502, { error: "Facebook webhook subscription failed" });
    const technical = await selectFailure();
    expect(technical.message).not.toMatch(/webhook|subscription/i);
  });
});
