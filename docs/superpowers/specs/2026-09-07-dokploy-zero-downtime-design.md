# Dokploy Zero-Downtime Deployment Design

## Goal

Make pushes to each production repository capable of deploying its public web
service on the Netcup Dokploy host without an expected HTTP interruption, while
preserving the migrated Valkey data and Linkar's singleton worker semantics.

## Current state

- TrackParcel and Linkar are healthy on Netcup as raw Docker Compose services.
- Cloudflare Tunnel sends every production hostname to Dokploy Traefik.
- TrackParcel Compose contains one web service and one persistent Valkey.
- Linkar Compose contains one web service, one worker, one migration profile,
  and one persistent Valkey.
- Both web services currently have one container. A Compose recreation removes
  that only target before its replacement is ready, so Compose deployment is
  not a zero-downtime release mechanism.
- TrackParcel's GitHub workflow verifies source but does not publish or deploy a
  production image. Linkar's workflow publishes immutable GHCR images but does
  not promote them to Dokploy.

## Considered approaches

### 1. Convert the complete stacks to Docker Stack

Docker Stack supports start-first rolling updates, but it would also move
Valkey and the singleton worker under Swarm orchestration. That expands the
stateful migration surface and introduces unnecessary worker-concurrency risk.

### 2. Implement a custom blue/green Compose script

Two independently named Compose projects could be alternated behind Traefik.
This provides control but duplicates routing, release state, cleanup, and
rollback logic that Dokploy Applications already implement.

### 3. Split public web services into Dokploy Applications

This is the selected design. Dokploy Applications use Swarm update policies and
health checks for start-first replacement and automatic rollback. Persistent
Valkey and Linkar's singleton worker remain in their existing Compose stacks.
This minimizes live-state changes while using Dokploy's native release model.

## Target architecture

TrackParcel has a `trackparcel-web` Dokploy Application attached to the existing
`trackparcel` private Docker network. The TrackParcel Compose project retains
only Valkey after cutover.

Linkar has a `linkar-web` Dokploy Application attached to the existing `linkar`
private Docker network. The Linkar Compose project retains worker, migration,
and Valkey services after cutover. Only one Linkar worker remains active.

Each Application receives the corresponding production environment variables,
including a Redis URL whose host is the stable Compose service alias `valkey`.
Each Application exposes port 3000 to Dokploy Traefik but no host port.

The Application health check calls `http://localhost:3000/api/health`. A release
is ready only when the route returns HTTP 200 and the application reports its
database and Redis dependencies as healthy.

The Swarm update policy is:

```json
{
  "Parallelism": 1,
  "Delay": 10000000000,
  "FailureAction": "rollback",
  "Monitor": 60000000000,
  "Order": "start-first"
}
```

Each web Application runs one steady-state replica. During a rollout, Swarm
temporarily runs the old and new replicas together. Traefik continues routing
to the healthy old replica until the new task becomes healthy.

## Source and release flow

Both projects publish immutable `sha-<40-character-commit>` images to GHCR.
Linkar retains its existing Dockerfile workflow. TrackParcel gains an equivalent
production Dockerfile and container workflow so its private source repository
does not need to be cloned by Dokploy and its health endpoint can report the
commit baked into the running image.

Dokploy Applications use the GHCR `main` tag for candidate discovery, while the
CI release record and health endpoint use the immutable SHA identity. Production
deployment is triggered only after the repository's tests, lint, build, and
container publication succeed.

Dokploy remains private. GitHub Actions connects over SSH with a dedicated key
whose server-side `authorized_keys` entry forces a root-owned deployment script;
it cannot request an interactive shell or choose another command. The script
accepts only a 40-character hexadecimal commit, calls Dokploy through localhost,
waits for health, and verifies that the public health endpoint reports that exact
commit. Separate keys restrict TrackParcel and Linkar to their own release path.

## Database migrations and worker releases

Schema changes are never coupled blindly to web replacement. A migration is
run as a separate one-shot operation using `DIRECT_URL` after a database backup.
Migrations must be backward-compatible with both the old and new web versions
during the overlap window.

For Linkar, the web Application is promoted first. After it is healthy, the
Compose worker image is updated to the identical commit and restarted
gracefully. Valkey remains running throughout, so queued jobs persist. A worker
release is complete only when the new worker reports healthy and its release
matches the web release.

## Cutover procedure

1. Capture current Dokploy Compose definitions, domains, environments, and
   container health as rollback evidence.
2. Create each Application without production domains and attach it to the
   existing private network.
3. Copy the web service environment without logging secret values.
4. Configure build source, port, health check, resource limits, start-first
   update, and health-based rollback.
5. Deploy the currently-live commit and validate it on a temporary Cloudflare
   hostname.
6. Transfer production domains from the Compose web service to the Application.
   Cloudflare DNS and tunnels do not change.
7. Verify public routes, TLS, release SHA, static assets, database, and Redis.
8. Remove only the old Compose web service after the Application has served
   healthy production traffic. Keep the Compose definition rollback copy.
9. Install the forced-command deployment keys as repository Actions secrets,
   enable deployment after the green container build, and perform a no-op or
   documentation release while continuously probing the public health endpoint.

## Failure handling and rollback

- A failed parallel Application deployment does not affect the live Compose web.
- Before domain transfer, rollback means deleting or stopping only the new
  Application.
- During domain transfer, restore the domain objects to the Compose web service
  if public validation fails.
- After cutover, Swarm automatically rolls back an unhealthy Application task.
- Valkey volumes are never recreated or deleted by this work.
- Linkar worker and web are never upgraded simultaneously. A failed worker
  update is rolled back independently while the web Application stays live.
- The Hostinger rollback environment remains untouched until the owner approves
  decommissioning.

## Security and access

- Dokploy remains reachable only through an administrator SSH tunnel.
- Git access is limited to the two production repositories.
- GitHub deployment keys have no general-purpose server shell access; each key
  is bound to one root-owned release command.
- No registry, GitHub, Cloudflare, or application secrets are committed.
- Application and worker ports are not published on the Netcup public address.
- Temporary validation DNS records are removed after acceptance.

## Acceptance criteria

- Both public health endpoints remain continuously reachable during a test
  deployment, with no 5xx responses or connection failures.
- Each new release reports the expected Git SHA and healthy database/Redis
  dependencies before the old task is removed.
- A deliberately unhealthy candidate automatically retains or restores the
  previous healthy web release.
- Linkar has exactly one healthy worker, and its image release matches the live
  web release after promotion.
- TrackParcel and Linkar Valkey key counts persist across the topology change.
- Direct public access to ports 80, 443, 3000, 3001, and 6379 remains blocked.
- A push to `main` deploys only after the repository's verification checks pass.

## Operational constraint

Start-first updates protect application releases, but they cannot eliminate a
full-host outage. A Netcup reboot or host failure still interrupts both products
until a second origin is introduced.
