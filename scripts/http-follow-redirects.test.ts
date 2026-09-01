import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { fetchFollowingRedirects, nextRedirectTarget } from "./http-follow-redirects.mjs";

const servers: http.Server[] = [];

async function serve(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("nextRedirectTarget", () => {
  it("resolves an absolute Location", () => {
    expect(nextRedirectTarget(307, "https://app.linkar.in/login", "https://linkar.in/login"))
      .toBe("https://app.linkar.in/login");
  });

  it("resolves a relative Location against the current URL", () => {
    expect(nextRedirectTarget(302, "/signin", "https://linkar.in/login"))
      .toBe("https://linkar.in/signin");
  });

  it("treats a non-redirect status as the final response", () => {
    expect(nextRedirectTarget(200, undefined, "https://linkar.in/login")).toBeNull();
    expect(nextRedirectTarget(404, undefined, "https://linkar.in/login")).toBeNull();
  });

  it("ignores a redirect status with no Location to follow", () => {
    expect(nextRedirectTarget(307, undefined, "https://linkar.in/login")).toBeNull();
  });
});

describe("fetchFollowingRedirects", () => {
  it("follows the 307 that PUBLIC_APP_DOMAIN issues for /login", async () => {
    // This is the shape that made the deploy script's asset check unfalsifiable:
    // linkar.in/login 307s to app.linkar.in/login, and the old https.get stopped
    // at the redirect, so no stylesheet link was ever found.
    const origin = await serve((request, response) => {
      if (request.url === "/login") {
        response.writeHead(307, { location: "/app/login" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<link rel="stylesheet" href="/_next/static/chunks/abc.css">');
    });

    const result = await fetchFollowingRedirects(`${origin}/login`);

    expect(result.status).toBe(200);
    expect(result.body).toContain("/_next/static/chunks/abc.css");
    expect(result.url).toBe(`${origin}/app/login`);
  });

  it("returns a direct response untouched", async () => {
    const origin = await serve((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ok"}');
    });

    const result = await fetchFollowingRedirects(`${origin}/api/health`);

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"status":"ok"}');
    expect(result.url).toBe(`${origin}/api/health`);
  });

  it("gives up rather than looping on a redirect cycle", async () => {
    const origin = await serve((_request, response) => {
      response.writeHead(307, { location: "/loop" });
      response.end();
    });

    await expect(fetchFollowingRedirects(`${origin}/loop`, { maxRedirects: 3 }))
      .rejects.toThrow(/too many redirects/);
  });

  it("still reports a non-redirect error status instead of throwing", async () => {
    const origin = await serve((_request, response) => {
      response.writeHead(503);
      response.end("unavailable");
    });

    const result = await fetchFollowingRedirects(`${origin}/api/health`);

    expect(result.status).toBe(503);
    expect(result.body).toBe("unavailable");
  });
});
