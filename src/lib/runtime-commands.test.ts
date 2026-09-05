import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv } from "./env";

const readProjectFile = (path: string) => readFileSync(path, "utf8");
const originalCampaignFlag = process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED;
const originalAppUrl = process.env.APP_URL;
const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (originalCampaignFlag === undefined) {
    delete process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED;
  } else {
    process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED = originalCampaignFlag;
  }
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
  if (originalPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
  if (originalPublicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalPublicSiteUrl;
});

describe("production runtime commands", () => {
  it("runs bundled binaries without invoking pnpm's runtime install checks", () => {
    const dockerfile = readProjectFile("Dockerfile");
    const coolifyCompose = readProjectFile("docker-compose.coolify.yml");
    const productionCompose = readProjectFile("docker-compose.production.yml");

    expect(dockerfile).toContain('CMD ["./node_modules/.bin/next", "start"]');
    expect(coolifyCompose).toContain(
      'command: ["./node_modules/.bin/prisma", "migrate", "deploy"]',
    );
    // The worker ships as a prebuilt esbuild bundle: no TS loader, no pnpm runtime.
    expect(coolifyCompose).toContain(
      'command: ["node", "dist/worker.js"]',
    );
    expect(productionCompose).toContain(
      'command: ["./node_modules/.bin/next", "start"]',
    );
    expect(productionCompose).toContain(
      'command: ["node", "dist/worker.js"]',
    );

    for (const contents of [dockerfile, coolifyCompose, productionCompose]) {
      expect(contents).not.toMatch(/(?:CMD|command:) \["pnpm"/);
    }
  });

  it("passes the campaign rollout flag and signing secret through worker and webhook execution", () => {
    const worker = readProjectFile("src/worker.ts");
    const webhook = readProjectFile("app/api/meta/webhook/route.ts");

    for (const entrypoint of [worker, webhook]) {
      expect(entrypoint).toContain("interactionSecret: env.metaAppSecret");
      expect(entrypoint).toContain("campaignsEnabled: env.followGatedCampaignsEnabled");
    }
  });

  it("runs expired delivery reconciliation at startup and on an interval", () => {
    const worker = readProjectFile("src/worker.ts");

    expect(worker).toContain("reconcileExpiredDeliveryClaims");
    expect(worker).toContain("DELIVERY_RECONCILIATION_INTERVAL_MS");
  });

  it("runs production incident monitoring at startup and every five minutes", () => {
    const worker = readProjectFile("src/worker.ts");
    expect(worker).toContain("createSystemMonitor");
    expect(worker).toContain("SYSTEM_MONITOR_INTERVAL_MS");
    expect(worker).toContain("void runSystemMonitor()");
  });
});

describe("follow-gated campaign environment flag", () => {
  it("defaults to false when missing", () => {
    delete process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED;

    expect(getServerEnv().followGatedCampaignsEnabled).toBe(false);
  });

  it.each([
    ["true", true],
    ["false", false],
  ])("parses the exact %s value", (value, expected) => {
    process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED = value;

    expect(getServerEnv().followGatedCampaignsEnabled).toBe(expected);
  });

  it("rejects non-boolean values", () => {
    process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED = "TRUE";

    expect(() => getServerEnv()).toThrow(
      "FOLLOW_GATED_CAMPAIGNS_ENABLED must be true or false",
    );
  });
});

describe("application URL environment", () => {
  it("prefers the server-only runtime URL over the build-time public URL", () => {
    process.env.APP_URL = "https://app.linkar.in";
    process.env.NEXT_PUBLIC_APP_URL = "https://old-host.invalid";

    expect(getServerEnv().appUrl).toBe("https://app.linkar.in");
  });

  it("keeps the public marketing URL separate from the application URL", () => {
    process.env.APP_URL = "https://app.linkar.in";
    process.env.PUBLIC_SITE_URL = "https://linkar.in";

    expect(getServerEnv().publicSiteUrl).toBe("https://linkar.in");
  });
});
