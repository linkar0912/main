# Dokploy Zero-Downtime Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert TrackParcel and Linkar public web releases from single-container Compose recreation to health-gated, start-first Dokploy Applications with CI-gated push deployment.

**Architecture:** Each public web process becomes a one-replica Docker Swarm Application connected to an attachable per-project overlay shared with its persistent Valkey. Linkar publishes immutable GHCR images; TrackParcel is built from private Git with a read-only deploy key. GitHub Actions triggers a private, forced-command SSH release bridge only after verification succeeds.

**Tech Stack:** Docker/BuildKit, private Git, GHCR, GitHub Actions, Dokploy HTTP API, Docker Swarm, Traefik, Cloudflare Tunnel, Next.js health routes, Valkey, POSIX shell.

**Spec:** `docs/superpowers/specs/2026-09-07-dokploy-zero-downtime-design.md`

## Global Constraints

- Production traffic must keep a healthy old web target until its replacement passes `/api/health`.
- Existing external volumes `trackparcel-valkey-data` and `linkar-valkey-data` must never be recreated or deleted.
- Linkar must have exactly one production worker.
- Database migrations are separate, backed-up, backward-compatible operations using `DIRECT_URL`.
- Dokploy remains private; deployment automation enters through forced-command SSH keys.
- Direct public access to Netcup ports 80, 443, 3000, 3001, and 6379 remains blocked.
- Secrets must not appear in commits, command output, or deployment reports.

---

### Task 1: Produce an immutable TrackParcel runtime image

**Files:**
- Create: `trackparcel/Dockerfile`
- Create: `trackparcel/.dockerignore`
- Modify: `trackparcel/src/app/api/health/route.ts`
- Modify: `trackparcel/src/app/api/health/route.test.ts`
- Create: `trackparcel/.github/workflows/container.yml`

**Interfaces:**
- Consumes: `BUILD_COMMIT` Docker build argument and the existing `npm run build`/`npm start` commands.
- Produces: a reproducible Dokploy Dockerfile build and a health response whose `release` equals `BUILD_COMMIT`.

- [ ] **Step 1: Extend the health-route test with authoritative image provenance**

Add a test that sets `BUILD_COMMIT=image-sha`, `COOLIFY_GIT_COMMIT_SHA=old-coolify-sha`, and `SOURCE_COMMIT=operator-sha`, calls `GET()`, and expects `release: "image-sha"`.

- [ ] **Step 2: Run the focused test and verify the new assertion fails**

Run: `npm test -- src/app/api/health/route.test.ts`

Expected: FAIL because the route currently prefers `COOLIFY_GIT_COMMIT_SHA`.

- [ ] **Step 3: Implement authoritative release selection**

Use:

```ts
release:
  process.env.BUILD_COMMIT ??
  process.env.COOLIFY_GIT_COMMIT_SHA ??
  process.env.SOURCE_COMMIT ??
  "unknown",
```

- [ ] **Step 4: Add a multi-stage non-root production Dockerfile**

Use Node 24 Bookworm Slim, `npm ci`, `npm run build`, `npm prune --omit=dev`, a UID/GID 1001 runtime user, `PORT=3000`, and:

```dockerfile
ARG BUILD_COMMIT=unknown
ENV BUILD_COMMIT=${BUILD_COMMIT}
CMD ["./node_modules/.bin/next", "start"]
```

The runtime stage copies `package.json`, production `node_modules`, `.next`, `public`, `next.config.mjs`, and required runtime assets only.

- [ ] **Step 5: Add a Docker build context exclusion file**

Exclude `.git`, `.worktrees`, `.next`, `node_modules`, `.env*`, test output, screenshots, and local audit artifacts; explicitly retain `.env.example` if present.

- [ ] **Step 6: Add the TrackParcel container workflow**

On pushes to `main` and manual dispatch, run install, lint, typecheck, tests, and build, then publish `main` and `sha-${{ github.sha }}` tags with `BUILD_COMMIT=${{ github.sha }}`. Give the job only `contents: read` and `packages: write`.

- [ ] **Step 7: Verify the image locally**

Run the focused health test, full `npm test`, lint, typecheck, build, and `docker build --build-arg BUILD_COMMIT=$(git rev-parse HEAD) -t trackparcel:zd-test .`.

Expected: all commands exit 0 and `docker inspect` shows `BUILD_COMMIT` equal to the worktree commit.

- [ ] **Step 8: Commit the TrackParcel artifact changes**

```bash
git add Dockerfile .dockerignore .github/workflows/container.yml src/app/api/health/route.ts src/app/api/health/route.test.ts
git commit -m "ci: publish immutable TrackParcel images"
```

### Task 2: Add CI-gated private deployment triggers

**Files:**
- Modify: `trackparcel/.github/workflows/container.yml`
- Modify: `linkar/.github/workflows/container.yml`
- Create: `linkar/ops/dokploy/forced-deploy.sh`
- Create: `linkar/ops/dokploy/forced-deploy.test.sh`

**Interfaces:**
- Consumes: repository secrets `DOKPLOY_DEPLOY_HOST`, `DOKPLOY_DEPLOY_KEY`, and `DOKPLOY_DEPLOY_HOST_KEY`.
- Produces: an SSH original command of exactly `deploy <40-hex-sha>` after the image is published.

- [ ] **Step 1: Write shell tests for deployment input validation**

Test that the script rejects missing input, non-hex input, extra arguments, and a project not bound at installation; test that a 40-character lowercase SHA reaches a stubbed deploy implementation.

- [ ] **Step 2: Run the script test and verify it fails before implementation**

Run: `bash ops/dokploy/forced-deploy.test.sh`

Expected: FAIL because `forced-deploy.sh` does not exist.

- [ ] **Step 3: Implement the forced-command wrapper**

The wrapper must use `set -eu`, accept its project from an immutable first argument, parse `SSH_ORIGINAL_COMMAND`, require `deploy [0-9a-f]{40}`, clear inherited deployment secrets, and exec `/usr/local/libexec/dokploy-release-$project "$sha"`. It must never evaluate the original command.

- [ ] **Step 4: Add deploy steps to both container workflows**

After successful image publication on `main`, write the repository secret to a mode-600 temporary key, write the pinned host key to `known_hosts`, and run:

```bash
ssh -i "$key" -o IdentitiesOnly=yes -o UserKnownHostsFile="$known_hosts" \
  deploybot@"${{ secrets.DOKPLOY_DEPLOY_HOST }}" "deploy $GITHUB_SHA"
```

- [ ] **Step 5: Verify workflow syntax and wrapper tests**

Parse both YAML files with a YAML parser, run the shell tests, and run each repository's full test/lint/build commands.

- [ ] **Step 6: Commit independently in each repository**

Use `ci: trigger private Dokploy releases` for TrackParcel and `ci: trigger private Dokploy releases` for Linkar.

### Task 3: Re-establish temporary administrator access and capture rollback state

**Files:**
- Create outside Git: protected temporary SSH key, Dokploy cookie jar, API key, and JSON snapshots under `netcup-migration-20260906.kufgX8/zero-downtime/`.

**Interfaces:**
- Consumes: the approved Netcup root credential and Dokploy owner login.
- Produces: key-based temporary access, a localhost tunnel to Dokploy, and redacted rollback snapshots.

- [ ] **Step 1: Create a mode-700 temporary working directory and a dedicated Ed25519 key**

- [ ] **Step 2: Install the temporary public key through password SSH and verify key login in a second connection**

- [ ] **Step 3: Open a localhost-only SSH tunnel to Netcup port 3000 and authenticate to Dokploy**

- [ ] **Step 4: Create a short-lived migration API key and verify it with `project.all`**

- [ ] **Step 5: Capture current projects, Compose definitions, domain objects, environment blocks, network IDs, service specs, image digests, health JSON, and Valkey key counts**

Store secret-bearing JSON as mode 600. Print only IDs, counts, hashes, and health state.

- [ ] **Step 6: Verify rollback artifacts are readable, non-empty, and protected**

### Task 4: Create and validate parallel Dokploy Applications

**Files:**
- Create outside Git: `zero-downtime/create-applications.mjs` and redacted result JSON.

**Interfaces:**
- Consumes: current Compose environments, attachable project overlay networks, TrackParcel private Git source, and Linkar's immutable GHCR image.
- Produces: `trackparcel-web` and `linkar-web` Dokploy Applications with no production-domain dependency.

- [ ] **Step 1: Confirm both candidate sources are immutable and buildable**

TrackParcel's exact private Git commit must build through its production Dockerfile; Linkar's SHA image digest must exist in GHCR.

- [ ] **Step 2: Create each Application in its existing production environment**

Configure source, port 3000, one replica, the matching overlay network ID, no public host port, and the copied web environment. Use private Git plus Dockerfile for TrackParcel and the immutable GHCR SHA tag for Linkar.

- [ ] **Step 3: Configure health and rollout policies**

Set:

```json
{
  "healthCheckSwarm": {
    "Test": ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
    "Interval": 20000000000,
    "Timeout": 8000000000,
    "StartPeriod": 45000000000,
    "Retries": 5
  },
  "updateConfigSwarm": {
    "Parallelism": 1,
    "Delay": 10000000000,
    "FailureAction": "rollback",
    "Monitor": 60000000000,
    "MaxFailureRatio": 0,
    "Order": "start-first"
  },
  "rollbackConfigSwarm": {
    "Parallelism": 1,
    "Delay": 0,
    "FailureAction": "pause",
    "Monitor": 60000000000,
    "MaxFailureRatio": 0,
    "Order": "stop-first"
  }
}
```

- [ ] **Step 4: Add temporary Application domains and Cloudflare tunnel DNS records**

Use `zd-trackparcel.trackparcel.in` and `zd-linkar.linkar.in`, preserving production DNS and Compose domains.

- [ ] **Step 5: Deploy and validate both candidates**

Require healthy Swarm tasks, exact release SHA, database/Redis health, static assets, redirects, and private Valkey connectivity.

- [ ] **Step 6: Exercise start-first replacement on temporary routes**

Continuously probe each temporary health URL at one-second intervals while forcing a redeploy of the same healthy image. Require zero connection failures and zero 5xx responses.

- [ ] **Step 7: Exercise rollback on a disposable temporary Application**

Clone only the temporary routing configuration, deploy a healthy task, then deploy an invalid command. Verify Swarm retains or restores the healthy task without touching production Applications, and delete the disposable test Application.

### Task 5: Transfer production routing without removing healthy capacity

**Files:**
- Modify outside Git: Dokploy domain records and stored Compose definitions.

**Interfaces:**
- Consumes: two healthy Applications and existing Compose domain objects.
- Produces: production hostnames served by Applications while persistent services remain in Compose.

- [ ] **Step 1: Start continuous external probes for all seven production hostnames**

Record timestamp, status code, release, and dependency state once per second throughout each route transfer.

- [ ] **Step 2: Add duplicate production host rules to the matching healthy Application**

Both old Compose and new Application targets may coexist briefly because they run the same release and share the same data services.

- [ ] **Step 3: Remove the old Compose domain objects only after public requests reach healthy Application tasks**

- [ ] **Step 4: Verify public behavior**

Require expected apex/www/admin/app redirects, TLS, static assets, TrackParcel health, Linkar health, Meta GET 403, and Razorpay GET 405.

- [ ] **Step 5: Remove only the web service from each stored Compose definition**

Do not redeploy Valkey or the Linkar worker. Stop and remove the old Compose web containers directly after routing is proven. Preserve the pre-change Compose JSON for rollback.

- [ ] **Step 6: Confirm stateful continuity**

Verify Valkey container IDs did not change, key counts did not unexpectedly drop, and exactly one Linkar worker remains healthy.

### Task 6: Install the restricted release bridge and repository secrets

**Files:**
- Install on Netcup: `/usr/local/libexec/dokploy-release-trackparcel`, `/usr/local/libexec/dokploy-release-linkar`, `/usr/local/libexec/dokploy-release-common`, `/etc/dokploy-release/api-key`, and deploybot authorized keys.

**Interfaces:**
- Consumes: a validated commit SHA from one forced SSH key.
- Produces: application rollout; for Linkar, a matching worker image update only after web health succeeds.

- [ ] **Step 1: Create the locked `deploybot` account**

Disable password login, shell access, forwarding, PTY, and agent forwarding. Install one forced key per repository with its immutable project argument.

- [ ] **Step 2: Create a least-privilege Dokploy API key and root-owned release configuration**

Store it mode 600. The forced wrapper may invoke only the two root-owned project release scripts.

- [ ] **Step 3: Implement common release polling**

Verify the requested GHCR SHA manifest exists, update the Application Docker image to that immutable tag, trigger deployment, poll Swarm and public health, and fail unless the reported release equals the requested SHA with healthy database/Redis dependencies.

- [ ] **Step 4: Implement Linkar's sequential worker promotion**

After web success, pull the same SHA image and recreate only the Compose worker with `--no-deps`. Verify worker health and image digest; on failure, restore the prior worker image without changing the healthy web Application.

- [ ] **Step 5: Install repository Actions secrets**

Set the Netcup host, private forced-command key, and pinned SSH host key independently in each repository. Confirm the secret names exist without printing values.

- [ ] **Step 6: Test both forced commands with malformed input and a controlled current-SHA deployment**

Malformed commands must fail without creating a deployment. Current-SHA deployment must complete with zero public 5xx responses.

### Task 7: End-to-end push deployment and cleanup

**Files:**
- Modify: harmless deployment marker or documentation in each worktree if a fresh push is needed.
- Update outside Git: acceptance report and credential cleanup.

**Interfaces:**
- Consumes: committed workflows, repository secrets, live Applications, and release bridge.
- Produces: proven push-to-production behavior with recorded continuous availability.

- [ ] **Step 1: Push reviewed branches or merge commits only with owner-authorized Git integration**

Do not overwrite remote history or include unrelated working-tree changes.

- [ ] **Step 2: Observe each GitHub Actions run through tests, image publication, and deploy trigger**

Require a successful conclusion and record its URL and commit SHA.

- [ ] **Step 3: Continuously probe during both real rollouts**

Require no connection errors, no 5xx responses, correct final release SHA, and healthy database/Redis dependencies.

- [ ] **Step 4: Reverify infrastructure boundaries**

Confirm tunnels active/enabled, Dokploy and Traefik healthy, only SSH publicly reachable, application restart/rollback settings present, Valkey volumes unchanged, and exactly one Linkar worker.

- [ ] **Step 5: Remove temporary validation domains, temporary administrator SSH key, cookie jar, and migration API key**

Move local temporary credentials to Trash and revoke server/API credentials. Preserve protected rollback snapshots and the owner password file.

- [ ] **Step 6: Write the acceptance report**

Record releases, service IDs, image digests, workflow runs, probe totals, stateful-service identity, rollback commands, and the remaining single-host failure limitation without secret values.

- [ ] **Step 7: Run final repository verification and commit documentation**

Run full tests/lint/typecheck/build in both worktrees, `git diff --check`, and commit the acceptance documentation separately from application changes.
