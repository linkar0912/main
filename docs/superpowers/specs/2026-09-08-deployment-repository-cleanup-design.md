# Deployment Repository Cleanup Design

## Goal

Remove obsolete Coolify and Hostinger deployment artifacts, redundant completed
GitHub Actions runs, and merged Git branches while leaving Linkar's current
Dokploy release path, production services, and unrelated in-progress marketing
work intact.

## Current state

Production releases are built from `main` by GitHub Actions, published to GHCR
with the immutable commit SHA, and promoted through a restricted SSH command to
Dokploy. The public health endpoint reports the baked `BUILD_COMMIT`. CI,
container publication, Dokploy promotion, and scheduled production health
checks are all active.

The repository still contains a complete superseded Coolify release path:
Coolify-specific Compose configuration, API scripts, helper code, documentation,
package commands, environment comments, tests, and ignored state. The local
environment also retains obsolete Coolify values and a redundant secret-bearing
backup. Several fully merged branches and clean worktrees remain after their
changes landed on `main`. GitHub Actions retains many redundant completed health
runs.

## Selected approach

Perform a proof-based cleanup rather than a general unused-code rewrite. Delete
an artifact only when repository references and Git ancestry show that it is
superseded, or when it belongs exclusively to the retired Coolify/Hostinger
deployment path. Preserve runtime compatibility code, database migrations,
historical product release notes, and dynamically addressed application entry
points unless there is separate evidence that they are dead.

## Repository cleanup

Delete the retired deployment implementation:

- `docker-compose.coolify.yml`
- `docker-compose.production.yml`, which describes the former monolithic Compose
  deployment and is not consumed by the current Dokploy Application release
  bridge
- `ops/COOLIFY_DEPLOYMENT.md`
- `scripts/coolify-deploy.mjs`
- `scripts/coolify-status.mjs`
- `scripts/http-follow-redirects.mjs` and its declaration/test files, because
  the Coolify deploy script is their only production caller

Remove the matching `deploy:coolify` and `check:compose` package commands,
Coolify state ignore rule, obsolete Compose assertions, and stale comments or
examples in active source, environment templates, and operational documents.
Retain `docker-compose.yml` for local PostgreSQL and Valkey development.

Delete the completed migration-era Dokploy/Coolify/Hostinger specs and plans.
Replace them with one current `ops/DOKPLOY_DEPLOYMENT.md` runbook that documents
the actual GitHub-to-GHCR-to-Dokploy release flow, health verification, rollback
boundary, required secrets by name, and the fact that pushing `main` deploys
production. Historical product release notes remain as records, but their host-
specific operational statements are rewritten in platform-neutral language so
they cannot be mistaken for current instructions.

Add a repository hygiene test that fails when retired host names, retired files,
or retired package commands return to active configuration and documentation.
The current Dokploy names and files remain explicitly allowed.

## Local secret cleanup

Remove only Coolify-prefixed values and their related comments from `.env.local`.
Preserve every Supabase, Google, Facebook, database, and Meta value. Move
`.env.local.bak-before-prod-preview` to the macOS Trash so the redundant secret
copy is recoverable without remaining in the project directory. No secret value
will be printed during cleanup or verification.

The retired Coolify credential should be revoked separately if the old Coolify
installation still exists. The repository cannot safely prove or perform that
external revocation.

## Git cleanup

Delete these fully merged local branches after rechecking ancestry and worktree
cleanliness immediately before removal:

- `codex/automation-reliability-r2`
- `codex/linkar-cinematic-homepage`
- `codex/product-quality-pass`
- `ops/dokploy-zero-downtime`

Remove the clean `product-quality-pass` and `dokploy-zero-downtime` worktrees
before deleting their branches. Delete the merged remote
`ops/dokploy-zero-downtime` branch.

Preserve `worktree-public-marketing-homepage` because it contains commits not in
`main`. Preserve all modified and untracked marketing files in the main working
tree exactly as found.

## GitHub Actions cleanup

Keep all three active workflows:

- CI
- Build production container
- Production health

For each workflow, retain its newest successful completed run and any run that
is queued or in progress. Delete older completed runs because their code state
is retained in Git and their logs are redundant. Resolve the run IDs immediately
before deletion and never delete the retained current-release runs.

Do not push `main` during this task. A push would trigger a production deployment,
which is outside this cleanup. Repository changes are committed locally for
review.

## Verification

The cleanup is complete only when all of the following succeed:

1. The hygiene regression test first fails against the legacy state, then passes
   after cleanup.
2. Searches of active source, configuration, operations docs, and environment
   templates find no Coolify or Hostinger references.
3. The complete unit suite, typecheck, lint, and production build pass.
4. `ops/dokploy/forced-deploy.test.sh` passes.
5. `git diff --check` passes.
6. Git shows only `main` plus the preserved unmerged marketing branch locally,
   and only `main` remotely.
7. The three retained GitHub Actions runs are completed successfully and no
   older completed runs remain.
8. The public production health endpoint remains healthy on the already-deployed
   release; this is a read-only check and does not deploy.
9. Git status confirms the pre-existing marketing modifications and untracked
   tests remain present and were not included in the cleanup commit.
