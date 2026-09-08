import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findRetiredDeploymentArtifacts } from "./check-deployment-hygiene.mjs";

const temporaryRoots: string[] = [];

async function createFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "linkar-deployment-hygiene-"));
  temporaryRoots.push(root);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }

  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("deployment repository hygiene", () => {
  it("reports retired deployment references without returning their contents", async () => {
    const retiredHost = ["Cool", "ify"].join("");
    const root = await createFixture({ "README.md": `Deploy with ${retiredHost}\n` });

    await expect(findRetiredDeploymentArtifacts(root, ["README.md"])).resolves.toEqual([
      { path: "README.md", line: 1, message: "retired deployment reference" },
    ]);
  });

  it("reports retired release markers that could reintroduce mutable provenance", async () => {
    const retiredMarker = ["SOURCE", "COMMIT"].join("_");
    const root = await createFixture({ ".env.production.example": `${retiredMarker}=manual\n` });

    await expect(
      findRetiredDeploymentArtifacts(root, [".env.production.example"]),
    ).resolves.toEqual([
      { path: ".env.production.example", line: 1, message: "retired deployment reference" },
    ]);
  });

  it("reports a retired deployment filename even when its contents are neutral", async () => {
    const retiredFilename = ["docker-compose.", "cool", "ify", ".yml"].join("");
    const root = await createFixture({ [retiredFilename]: "services: {}\n" });

    await expect(findRetiredDeploymentArtifacts(root, [retiredFilename])).resolves.toEqual([
      { path: retiredFilename, line: 0, message: "retired deployment artifact" },
    ]);
  });

  it("ignores a retired tracked path after the file has been deleted", async () => {
    const retiredFilename = ["docker-compose.", "cool", "ify", ".yml"].join("");
    const root = await createFixture({ "README.md": "Current deployment only.\n" });

    await expect(findRetiredDeploymentArtifacts(root, [retiredFilename])).resolves.toEqual([]);
  });

  it("accepts the current Dokploy deployment path", async () => {
    const root = await createFixture({
      "README.md": "Production deploys immutable GHCR images through Dokploy.\n",
      "ops/DOKPLOY_DEPLOYMENT.md": "Verify the release through /api/health.\n",
    });

    await expect(
      findRetiredDeploymentArtifacts(root, ["README.md", "ops/DOKPLOY_DEPLOYMENT.md"]),
    ).resolves.toEqual([]);
  });

  it("ignores policy fixtures and historical planning records", async () => {
    const retiredHost = ["Host", "inger"].join("");
    const root = await createFixture({
      "scripts/example.test.ts": `const fixture = "${retiredHost}";\n`,
      "docs/superpowers/specs/history.md": `${retiredHost} migration record\n`,
    });

    await expect(
      findRetiredDeploymentArtifacts(root, [
        "scripts/example.test.ts",
        "docs/superpowers/specs/history.md",
      ]),
    ).resolves.toEqual([]);
  });
});
