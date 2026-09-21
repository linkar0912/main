# Performance runbook

How Linkar keeps screen loads fast, what to check before blaming the stack,
and where the real latency budget goes. The short version: page speed here is
a data-fetching architecture question, not a framework or language question.

## Measure the right thing

Never judge screen speed on `next dev`. Dev mode compiles every route on
first visit and ships unminified, double-rendered (StrictMode) React. Always
benchmark the production build:

```sh
pnpm build && pnpm start
curl -o /dev/null -w 'TTFB: %{time_starttransfer}s\n' http://localhost:3000/dashboard
```

Reference numbers from a local production build: static marketing pages render
in 2-10ms TTFB. Anything slower than that has a data or network cause, not a
rendering cause.

## Region co-location (the single biggest infrastructure lever)

The Postgres database lives behind the Supabase pooler in
`ap-southeast-1` (Singapore). Every query pays one network round trip, roughly
60-160ms from outside that region, and a single API request can need several
queries (session snapshot + the route's own reads).

**The application server must run in the same region as the database.**
Deploy the Next.js container (Dokploy) and the worker in `ap-southeast-1`.
If the server sits in another region, every screen pays hundreds of
milliseconds of pure network latency that no code change can remove.

Check it after every infrastructure change:

```sh
# Run from the app server, not your laptop:
time node -e "require('net').connect(6543, 'aws-0-ap-southeast-1.pooler.supabase.com').on('connect', function(){ this.end(); })"
```

Anything consistently above ~20ms from server to pooler means the regions
drifted apart.

## Architecture: where the time used to go, and what fixed it

1. **Persistent shell.** `app/(app)/layout.tsx` mounts `<AppShell>` once per
   session. Screens no longer render their own shell, so navigation swaps
   only the page content and never refetches the sidebar bootstrap.
2. **Server-rendered first paint.** `app/(app)/dashboard/page.tsx` and
   `app/(app)/automations/page.tsx` are async Server Components that fetch via
   the repository in one parallel batch and pass `initial*` props to the
   client screens. The screens seed their client caches
   (`seedWorkspaceData`, `seedAutomations`) so post-hydration fetches resolve
   from cache. Follow this pattern when adding a heavy screen.
3. **Session validation costs one parallel lookup.** `getSessionAccessSnapshot`
   replaced the serial membership-then-access-state query pair.
   `getRequestSession()` (React `cache()`) lets a layout and its page share
   one validation per RSC render. Route handlers use `getValidatedSession()`
   as before.
4. **Client caches are stale-while-revalidate.** `workspace-data.ts` serves
   confirmed data instantly (fresh for two minutes) and refreshes in the
   background. Never block render on a refetch; never bypass the cache with a
   raw `fetch` from a screen.

## Finding a genuinely slow query

The schema already indexes the hot paths (workspaceId composites on
Automation, AutomationParticipant, AutomationContact, OutboundDelivery,
WebhookEvent, and friends; userId on WorkspaceMember). If a screen is still
slow after the architecture rules above:

1. Read the `measureServerOperation` timings in the server logs - every
   repository call on the critical paths is wrapped, so the slow operation
   shows up by name (e.g. `workspace.bootstrap.repository`).
2. Reproduce the query with `EXPLAIN ANALYZE` against the production pooler.
3. Add a composite index matching the actual `WHERE`/`ORDER BY` shape, via a
   normal `prisma migrate dev` migration. Prefer extending an existing index
   over adding a parallel one.
4. If a list query is unbounded, cap it with cursor pagination (the inbox
   cursor pattern) rather than an index.
