# Deployment Repository Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave the working tree with one current Dokploy deployment path, no retired-host implementation or instructions, no redundant merged Git branches/worktrees, and only the latest successful GitHub Actions run for each active workflow.

**Architecture:** Treat the cleanup as a dependency-graph removal: first add an executable repository policy check, then delete the retired deployment roots and every exclusive dependent, then consolidate current operations documentation. Local secrets, Git objects, and GitHub runs are cleaned only after fresh target resolution and preservation checks.

**Tech Stack:** Node.js 24, TypeScript, Vitest, Git, GitHub CLI, Docker Compose, GitHub Actions, Dokploy.

**Spec:** `docs/superpowers/specs/2026-09-08-deployment-repository-cleanup-design.md`

## Global Constraints

- Do not use subagents.
- Do not push `main` or trigger a production deployment.
- Preserve all pre-existing modified and untracked marketing files.
- Preserve the unmerged `worktree-public-marketing-homepage` branch.
- Never print local environment secret values.
- Delete only branches proven merged and worktrees proven clean immediately before removal.
- Keep the newest successful run for every active GitHub Actions workflow and every queued or in-progress run.

---

### Task 1: Add an executable retired-deployment policy check

**Files:**
- Create: `scripts/check-deployment-hygiene.mjs`
- Create: `scripts/check-deployment-hygiene.d.mts`
- Create: `scripts/check-deployment-hygiene.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `findRetiredDeploymentArtifacts(root, relativePaths)` returning sorted offending paths and lines; `pnpm check:deployment-hygiene` returning non-zero when active files contain retired deployment names or retired files exist.

- [ ] **Step 1: Write the failing behavior tests**

Create fixtures in a temporary directory. Assert that the checker reports a retired host reference in an active README, reports a retired deployment filename even when its contents are neutral, ignores current Dokploy wording, and ignores test/spec/plan files that necessarily contain policy fixtures or historical reasoning.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run scripts/check-deployment-hygiene.test.ts`

Expected: FAIL because `check-deployment-hygiene.mjs` does not exist.

- [ ] **Step 3: Implement the minimal checker and package command**

The checker must inspect explicit active roots (`app`, `src`, `scripts`, `ops`, `.github`, root Markdown/environment/package files), skip `*.test.*` plus `docs/superpowers`, construct retired names from fragments so it does not flag its own implementation, and never read `.env.local` or other:</n+
```js
export function findRetiredDeploymentArtifacts(root, relativePaths) {
  // Return { path, line, message } entries for retired filenames or content.
}
```

Add `"check:deployment-hygiene": "node scripts/check-deployment-hygiene.mjs"`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run scripts/check-deployment-hygiene.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the policy against the current repository and verify it fails for the known retired artifacts**

Run: `pnpm check:deployment-hygiene`

Expected: non-zero with paths for the retired deployment files and references, without printing any secret value.

### Task 2: Remove the retired deployment dependency chain

**Files:**
- Delete: `docker-compose.coolify.yml`
- Delete: `docker-compose.production.yml`
- Delete: `ops/COOLIFY_DEPLOYMENT.md`
- Delete: `scripts/coolify-deploy.mjs`
- Delete: `scripts/coolify-status.mjs`
- Delete: `scripts/http-follow-redirects.mjs`
- Delete: `scripts/http-follow-redirects.d.mts`
- Delete: `scripts/http-follow-redirects.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `src/lib/runtime-commands.test.ts`
- Modify: `src/lib/health.ts`
- Modify: `src/lib/health.test.ts`

**Interfaces:**
- Consumes: the current immutable `BUILD_COMMIT` baked into production images.
- Produces: one local-only Compose file and no executable retired-host deployment entrypoint.

- [ ] **Step 1: Update the health regression test for the immutable release contract**

Remove operator-marker fallback cases and assert that a missing `BUILD_COMMIT` yields `release: null`, while a present `BUILD_COMMIT` is returned unchanged.

- [ ] **Step 2: Run the health test and verify RED**

Run: `pnpm vitest run src/lib/health.test.ts`

Expected: FAIL because `src/lib/health.ts` still falls back to `SOURCE_COMMIT`.

- [ ] **Step 3: Remove the fallback and delete the exclusive retired files**

Set health release to `process.env.BUILD_COMMIT || null`, remove `deploy:coolify` and `check:compose`, remove the ignored retired state filename, and reduce runtime-command tests to Dockerfile/current runtime behavior only.

- [ ] **Step 4: Run focused tests**

Run: `pnpm vitest run src/lib/health.test.ts src/lib/runtime-commands.test.ts scripts/check-deployment-hygiene.test.ts`

Expected: tests pass; the repository policy still fails because stale prose remains.

### Task 3: Consolidate current Dokploy operations and purge stale prose

**Files:**
- Create: `ops/DOKPLOY_DEPLOYMENT.md`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docs/admin-console-operations.md`
- Modify: `docs/meta-app-review.md`
- Modify: `docs/releases/2026-08-23-automation-reliability-release-1.md`
- Modify: `docs/releases/2026-08-23-automation-reliability-release-2.md`
- Modify: `docs/releases/2026-09-04-inbox-operations-release.md`
- Modify: `ops/valkey/README.md`
- Modify: `scripts/verify-billing-config.mjs`
- Modify: active source comments returned by the policy checker
- Delete: completed `docs/superpowers` plans/specs containing retired-host operational instructions

**Interfaces:**
- Produces: one authoritative Dokploy runbook linked from README and environment templates.

- [ ] **Step 1: Write the current runbook**

Document the immutable GitHub Actions release, required `DOKPLOY_DEPLOY_*` secret names, forced-command boundary, current web/worker ordering, public health verification, rollback by known-good SHA, local validation commands, and the explicit warning that a push to `main` deploys production.

- [ ] **Step 2: Update active docs, templates, and comments**

Replace retired platform wording with Dokploy or platform-neutral language. Remove `SOURCE_COMMIT` from examples. Preserve factual product behavior and historical release outcomes without retaining obsolete operational commands.

- [ ] **Step 3: Delete completed migration-era and retired-host planning artifacts**

Use `rg -l` to resolve only completed plan/spec files containing the retired
host names, review the list, and delete those files. Preserve plans/specs
without those references and preserve this cleanup plan and its approved design
as the current audit record.

- [ ] **Step 4: Run the policy and focused tests**

Run: `pnpm check:deployment-hygiene && pnpm vitest run scripts/check-deployment-hygiene.test.ts src/lib/health.test.ts src/lib/runtime-commands.test.ts scripts/verify-billing-config.test.ts`

Expected: all commands pass.

### Task 4: Clean local secrets and merged Git state

**Files/state:**
- Modify without exposing values: `.env.local`
- Move to Trash: `.env.local.bak-before-prod-preview`
- Remove clean merged worktrees: `.worktrees/dokploy-zero-downtime`, `.worktrees/product-quality-pass`
- Delete merged local branches listed in the specification
- Delete remote branch: `origin/ops/dokploy-zero-downtime`

**Interfaces:**
- Produces: no retired platform credential copies in the project and no merged branch/worktree clutter.

- [ ] **Step 1: Recheck safety conditions**

Verify both target worktrees have empty porcelain status, each target branch is an ancestor of `main`, the marketing branch is not an ancestor, and the main-tree marketing status matches the captured baseline.

- [ ] **Step 2: Scrub only retired environment keys**

Filter the retired prefix keys and associated comments from `.env.local` without echoing values. Reprint keys only with values replaced by `<redacted>` and verify every non-retired key remains.

- [ ] **Step 3: Move the redundant backup to Trash**

Use macOS Finder/Trash semantics with a collision-safe destination name. Verify the source is absent and report that it remains recoverable from Trash.

- [ ] **Step 4: Remove clean merged worktrees and branches**

Remove the two clean worktrees, prune worktree metadata, delete the four merged local branches with safe `git branch -d`, and delete the merged remote branch without force.

- [ ] **Step 5: Verify preserved work**

Confirm the unmerged marketing branch remains and the exact pre-existing modified/untracked marketing file list is unchanged.

### Task 5: Prune redundant completed GitHub Actions runs

**State:**
- Keep: newest successful run for each active workflow
- Keep: every queued or in-progress run
- Delete: all other completed runs returned by `gh run list`

**Interfaces:**
- Produces: compact Actions history without changing workflow definitions or triggering runs.

- [ ] **Step 1: Resolve the keep/delete sets immediately before mutation**

List all active workflows and up to 1,000 runs as JSON. Select the newest successful completed run per workflow plus all non-completed runs. Print IDs, workflow names, dates, and conclusions only.

- [ ] **Step 2: Delete the resolved redundant run IDs**

Call `gh run delete <id>` sequentially, stop on the first error, and never delete an ID in the keep set.

- [ ] **Step 3: Verify Actions state**

List workflows and runs again. Require three active workflows, one successful completed retained run per workflow, and no queued/in-progress run accidentally removed.

### Task 6: Verify and commit the cleanup locally

**Files:**
- All repository files changed by Tasks 1–3
- Exclude: every pre-existing marketing modification/untracked file

**Interfaces:**
- Produces: locally committed cleanup on `main`, not pushed.

- [ ] **Step 1: Run repository policy and deployment shell tests**

Run: `pnpm check:deployment-hygiene && sh ops/dokploy/forced-deploy.test.sh && git diff --check`

Expected: all exit 0.

- [ ] **Step 2: Run complete application verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: all exit 0 with zero test failures.

- [ ] **Step 3: Verify production read-only**

Run: `pnpm monitor:production`

Expected: healthy production on the pre-cleanup deployed SHA. No deployment occurs.

- [ ] **Step 4: Audit and stage only cleanup files**

Review `git diff`, `git status --short`, and staged diff. Confirm no marketing path is staged and the current branch has not been pushed.

- [ ] **Step 5: Commit locally**

Commit message: `chore: remove retired deployment paths`

- [ ] **Step 6: Final state audit**

Verify the commit, branch divergence from `origin/main`, remaining dirty marketing files, branches/worktrees, active workflows, retained runs, and public production release.
