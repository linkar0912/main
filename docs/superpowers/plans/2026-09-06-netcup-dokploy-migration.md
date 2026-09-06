# Netcup Dokploy Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the currently-live TrackParcel and Linkar releases from Hostinger Coolify to Netcup Dokploy with uninterrupted web traffic and a reversible worker handoff.

**Architecture:** Build parallel private application stacks on Netcup and validate them before changing Cloudflare routing. Preserve the Hostinger stack as rollback; serialize the Linkar worker and queue handoff so only one production worker is active.

**Tech Stack:** Debian 13, Docker Engine, Docker Swarm, Dokploy, Traefik, Cloudflare Tunnel/DNS, Next.js 16, Valkey 9, Supabase, Coolify API.

**Spec:** `docs/superpowers/specs/2026-09-06-netcup-dokploy-migration-design.md`

## Global Constraints

- Keep Hostinger public services running until each Netcup replacement passes acceptance checks.
- Never print or commit production secret values.
- Deploy the exact live TrackParcel SHA `9f18e2b16b54054dd1e992362e9352ad5fac4e73` and Linkar SHA `793528df68ea9d7b376b948754f2c062a25c6c63` for parity.
- Do not apply new Supabase migrations during the host move.
- Never run independent old and new Linkar workers simultaneously.
- Do not delete Hostinger containers or volumes during migration.

---

### Task 1: Capture and back up production

**Files:**
- Create on operator machine: protected temporary migration directory created with `mktemp -d`
- Read: Coolify application/service API responses
- Read: Hostinger Docker container and volume metadata

**Interfaces:**
- Consumes: Hostinger SSH and Coolify API credentials
- Produces: checksummed image archives, Valkey snapshots, sanitized inventory, and rollback DNS values

- [ ] **Step 1: Record health and release baselines**

Run `curl --fail https://www.trackparcel.in/api/health` and `curl --fail https://app.linkar.in/api/health`; require `status=ok` and the exact SHAs in Global Constraints.

- [ ] **Step 2: Resolve active volume mounts**

Run `docker inspect` for TrackParcel Valkey, Linkar Valkey, Linkar web, and Linkar worker; record mount names and image digests without environment values.

- [ ] **Step 3: Create consistent Valkey backups**

Run authenticated `BGSAVE`, wait for `LASTSAVE` to advance, then archive each resolved volume read-only and calculate SHA-256 checksums.

- [ ] **Step 4: Export immutable images**

Run `docker save` for the exact TrackParcel and Linkar image IDs, stream the archives to Netcup, and verify checksums before `docker load`.

### Task 2: Harden and prepare Netcup

**Files:**
- Modify on Netcup: `/root/.ssh/authorized_keys`
- Modify on Netcup: firewall configuration
- Modify on Netcup: system package and Docker configuration

**Interfaces:**
- Consumes: Netcup root SSH
- Produces: key-authenticated, patched Docker host with controlled inbound ports

- [ ] **Step 1: Establish SSH key authentication**

Install a dedicated Ed25519 public key, open a second SSH session using the key, and retain the original password-authenticated session until validation succeeds.

- [ ] **Step 2: Add memory safety**

Create a 4 GiB swap file with mode `0600`, enable it with `swapon`, add the explicit path to `/etc/fstab`, and verify with `swapon --show`.

- [ ] **Step 3: Patch the host**

Run `apt-get update`, install available security updates and required utilities, then record whether a reboot is required without rebooting during this phase.

- [ ] **Step 4: Configure inbound controls**

Allow SSH, HTTP, and HTTPS; restrict Dokploy port 3000 during setup; verify both IPv4 and IPv6 behavior and ensure Docker-published ports cannot bypass policy.

### Task 3: Install and initialize Dokploy

**Files:**
- Create on Netcup: `/etc/dokploy/**`
- Create in Docker: Dokploy services, secrets, networks, and Traefik container

**Interfaces:**
- Consumes: prepared Netcup host
- Produces: healthy Dokploy control plane and HTTPS management route

- [ ] **Step 1: Install stable Dokploy**

Run the official stable installer with an explicit Swarm address pool and public advertise address; verify Dokploy, PostgreSQL, Redis, and Traefik health.

- [ ] **Step 2: Create the owner account**

Generate a unique high-entropy password, create the initial owner through Dokploy's setup flow, and store the credential only in the protected migration record for handoff.

- [ ] **Step 3: Verify routing and restart behavior**

Confirm ports 80/443 are held by Traefik, port 3000 is not generally exposed, and all Dokploy components have restart policies.

### Task 4: Deploy TrackParcel in parallel

**Files:**
- Create in Dokploy: TrackParcel project/application and private Valkey service
- Create in Dokploy: production environment variable set copied from Coolify

**Interfaces:**
- Consumes: TrackParcel image, environment export, and Valkey backup
- Produces: healthy parallel TrackParcel deployment on Netcup

- [ ] **Step 1: Restore TrackParcel Valkey**

Create a private named volume, restore the checksummed snapshot before starting Valkey, and verify authenticated `PING` plus database size.

- [ ] **Step 2: Deploy the exact application image**

Use the imported image tagged with the live SHA, connect it only to its private network and Dokploy routing network, and set `/api/health` as the health route.

- [ ] **Step 3: Validate through a temporary route**

Require healthy JSON, exact release SHA, working static assets, homepage, administrator login page, representative tracking request behavior, and no public Valkey port.

### Task 5: Deploy Linkar web in parallel

**Files:**
- Create in Dokploy: Linkar compose project, private Valkey volume, migration job, web service, and disabled worker profile
- Create in Dokploy: production environment variable set copied from Coolify

**Interfaces:**
- Consumes: Linkar image and environment export
- Produces: healthy Linkar web stack with no active replacement worker

- [ ] **Step 1: Confirm migration parity**

Compare the exact deployed image SHA with repository migration history and query `_prisma_migrations`; do not run a migration not already present in production.

- [ ] **Step 2: Deploy Valkey and web**

Start private Valkey and Linkar web using the exact image. Keep the new Linkar worker disabled and verify the old Hostinger worker remains healthy.

- [ ] **Step 3: Validate web and integrations**

Require healthy database/Redis JSON, exact release SHA, login and admin pages, OAuth callback routing, Meta webhook verification behavior, Razorpay endpoint behavior, and no public worker/Valkey ports.

### Task 6: Cut over TrackParcel

**Files:**
- Modify in Cloudflare: TrackParcel hostname routing records

**Interfaces:**
- Consumes: verified TrackParcel deployment and saved DNS rollback values
- Produces: TrackParcel traffic served by Netcup

- [ ] **Step 1: Switch Cloudflare routing**

Update all three TrackParcel hostnames together while leaving the Hostinger origin running.

- [ ] **Step 2: Verify external behavior**

Poll each hostname from outside, require HTTPS 2xx/expected redirects, healthy dependencies, exact SHA, and representative tracking/admin checks.

- [ ] **Step 3: Exercise rollback readiness**

Confirm the saved former record set remains valid and can be restored without modifying Hostinger.

### Task 7: Hand off Linkar worker and traffic

**Files:**
- Modify in Cloudflare: Linkar hostname routing records
- Modify at runtime: Hostinger and Netcup Linkar worker state
- Restore at runtime: Netcup Linkar Valkey volume

**Interfaces:**
- Consumes: verified Linkar web, old worker, and rollback record set
- Produces: exactly one active Linkar worker on Netcup and Linkar traffic served by Netcup

- [ ] **Step 1: Quiesce and snapshot the old worker queue**

Stop only the old Linkar worker, confirm it is stopped, run a final authenticated Valkey save, archive the active volume, and record queue counts.

- [ ] **Step 2: Restore and start the new worker**

Stop the new Valkey container, restore the final snapshot, restart Valkey, start the Netcup worker, and require its dependency health endpoint to pass.

- [ ] **Step 3: Switch Cloudflare routing**

Update all four Linkar hostnames while leaving old web available for rollback.

- [ ] **Step 4: Verify application and worker behavior**

Require external health, exact SHA, login/admin assets, queue processing, webhook reachability, and evidence that only the Netcup worker is active.

### Task 8: Acceptance, reboot test, and handoff

**Files:**
- Update: this checklist with evidence
- Preserve: Hostinger containers and volumes

**Interfaces:**
- Consumes: cut-over production stacks
- Produces: verified migration report, credential-rotation list, and retained rollback system

- [ ] **Step 1: Run the complete acceptance matrix**

Check every hostname, both health endpoints, releases, dependencies, internal container health, queue state, TLS, and direct-port exposure.

- [ ] **Step 2: Verify reboot persistence**

After confirming rollback coverage, reboot Netcup once and require Dokploy, Traefik, both applications, both Valkey services, and the Linkar worker to recover automatically.

- [ ] **Step 3: Observe stability**

Monitor external health, container restarts, error logs, memory, disk, and Linkar queue depth for the agreed observation window while Hostinger remains intact.

- [ ] **Step 4: Deliver credentials and rotation actions**

Provide the Dokploy URL and owner credential through the approved channel, then require rotation/revocation of both root passwords, both Cloudflare migration tokens, and both exposed R2 credentials.

