import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) => readFileSync(path, "utf8");

describe("production runtime commands", () => {
  it("runs bundled binaries without invoking pnpm's runtime install checks", () => {
    const dockerfile = readProjectFile("Dockerfile");
    const coolifyCompose = readProjectFile("docker-compose.coolify.yml");
    const productionCompose = readProjectFile("docker-compose.production.yml");

    expect(dockerfile).toContain('CMD ["./node_modules/.bin/next", "start"]');
    expect(coolifyCompose).toContain(
      'command: ["./node_modules/.bin/prisma", "migrate", "deploy"]',
    );
    expect(coolifyCompose).toContain(
      'command: ["./node_modules/.bin/tsx", "src/worker.ts"]',
    );
    expect(productionCompose).toContain(
      'command: ["./node_modules/.bin/next", "start"]',
    );

    for (const contents of [dockerfile, coolifyCompose, productionCompose]) {
      expect(contents).not.toMatch(/(?:CMD|command:) \["pnpm"/);
    }
  });
});
