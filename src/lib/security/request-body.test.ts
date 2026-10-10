import { describe, expect, it } from "vitest";
import { readBoundedFormData, readBoundedText, RequestBodyTooLargeError } from "./request-body";

function streamingRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/hook", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("bounded request bodies", () => {
  it("returns a body within the limit", async () => {
    await expect(readBoundedText(new Request("http://localhost/hook", { method: "POST", body: "hello" }), 10)).resolves.toBe("hello");
  });

  it("rejects on a declared Content-Length over the limit without reading", async () => {
    const request = new Request("http://localhost/hook", {
      method: "POST",
      headers: { "content-length": "999999999" },
      body: "small",
    });
    await expect(readBoundedText(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("rejects a chunked body once the streamed size passes the limit", async () => {
    await expect(readBoundedText(streamingRequest(["12345", "67890", "x"]), 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("parses urlencoded and multipart forms after the cap", async () => {
    const urlencoded = new Request("http://localhost/hook", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "signed_request=abc.def",
    });
    expect((await readBoundedFormData(urlencoded)).get("signed_request")).toBe("abc.def");

    const form = new FormData();
    form.set("signed_request", "ghi.jkl");
    const multipart = new Request("http://localhost/hook", { method: "POST", body: form });
    expect((await readBoundedFormData(multipart)).get("signed_request")).toBe("ghi.jkl");
  });
});
