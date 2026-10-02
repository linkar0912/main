# Inbox Operations and Production Readiness Design

## Goal

Finish Linkar's text-only customer inbox, restore Facebook Page activity visibility, make large inboxes navigable without fixed caps, expose and enable the follow-gated campaign rollout safely, repair end-to-end browser coverage, and verify the four live Meta delivery paths in production.

## Product boundaries

- The conversation inbox remains Instagram-only because Facebook Page commenters do not establish a Messenger identity or messaging eligibility.
- Facebook Page comments appear in a separate activity view inside Inbox. They are inspectable activity records, not messageable contacts.
- Manual inbox replies support text only, with the existing 1,000-character limit and Instagram 24-hour messaging-window enforcement.
- This project does not add attachments, images, voice messages, internal notes, Facebook Messenger, WhatsApp, or provider-history scraping.
- Existing contact tags are the inbox labels. There is no second label system.
- Existing `assigneeUserId` is the inbox assignment authority. There is no duplicate assignee field.

## User experience

Inbox has two top-level views:

1. **Instagram conversations** shows the contact roster and selected conversation.
2. **Facebook activity** shows top-level Facebook Page comment events and their delivery outcome when available.

The Instagram roster supports:

- cursor-based incremental loading;
- search;
- open and closed states;
- unread-only filtering;
- assigned-to-me, unassigned, and all-assignees filtering;
- favourite-only filtering;
- label filtering using contact tags;
- reminders due now, scheduled later, and all reminders;
- newest activity, oldest activity, and unread-first sorting.

Selecting a contact marks the conversation read after its messages load. Closing a conversation does not suppress the contact and does not stop automations. Suppression remains a separate contact-level safety control. A new inbound message automatically reopens a closed conversation and makes it unread. A reminder is cleared explicitly by the user; opening the conversation alone does not clear it.

The conversation header provides compact controls for open/closed, favourite, reminder, and assignment. Labels continue to be edited through the existing contact detail surface so the product does not create two competing editors.

The Facebook activity view supports newest-first pagination, Page/source filtering when multiple Pages are connected, keyword search over locally stored summaries, and an outcome badge. It never presents a reply composer.

## Persistence model

Add these fields to `AutomationContact` through an additive Prisma migration:

- `inboxStatus String @default("OPEN")`
- `inboxFavorite Boolean @default(false)`
- `inboxReminderAt DateTime?`
- `inboxLastReadAt DateTime?`

Add indexes supporting workspace/status, workspace/reminder, and workspace/last-seen roster queries. Existing rows become open, non-favourite, without reminders, and unread when they contain inbound activity newer than `inboxLastReadAt`.

`tags` remains the label collection and `assigneeUserId` remains assignment state. `lastSeenAt` is the stable roster ordering key. Inbound contact reconciliation must set `lastSeenAt`, reopen `inboxStatus`, and leave `inboxLastReadAt` unchanged. This makes new inbound activity unread without storing a redundant boolean.

## Pagination and query contracts

All cursors are opaque, versioned, URL-safe base64 JSON and validated server-side. Invalid cursors return HTTP 400. Cursors include the ordered timestamp and stable record ID so equal timestamps cannot duplicate or skip records.

### Contact roster

`GET /api/inbox` accepts:

- `cursor`
- `limit`, clamped from 1 to 100 with a default of 40
- `query`
- `status=open|closed|all`
- `unread=true|false`
- `assignment=all|mine|unassigned`
- `favorite=true|false`
- `label`
- `reminder=all|due|scheduled`
- `sort=newest|oldest|unread`

It returns `{ contacts, nextCursor }`. Search and filters execute before pagination. The server returns an `unread` boolean derived from the latest inbound timestamp versus `inboxLastReadAt`.

### Conversation history

`GET /api/inbox/[contactId]` accepts `cursor` and `limit` and returns `{ messages, nextCursor }`, ordered chronologically for display. The first request fetches the newest page; older pages prepend when the user chooses **Load earlier messages**. Queries are scoped directly to the selected Instagram account and Instagram-scoped user ID instead of scanning a fixed number of workspace events.

### Inbox state mutations

`PATCH /api/inbox/[contactId]` accepts one strict operation at a time:

- `{ action: "mark_read" }`
- `{ action: "set_status", status: "OPEN" | "CLOSED" }`
- `{ action: "set_favorite", favorite: boolean }`
- `{ action: "set_reminder", reminderAt: ISO timestamp | null }`
- `{ action: "set_assignment", assigneeUserId: string | null }`

Every mutation is workspace-scoped. Assignment validates that the target user belongs to the workspace. Reminder timestamps must be valid and no more than one year ahead. Existing optimistic version handling is used where the repository already exposes it.

### Facebook activity

`GET /api/activity` gains an opaque cursor and returns `{ items, nextCursor }`. Its existing event-type filter remains supported. The Inbox Facebook view requests only `facebook.comment.created` records.

## Repository responsibilities

Repository interfaces gain focused methods for:

- filtered, cursor-paginated inbox contacts;
- per-recipient inbound event pages;
- per-recipient outbound delivery pages;
- cursor-paginated webhook activity;
- inbox-state mutation.

Both Prisma and memory repositories implement identical semantics so unit tests and demo mode remain authoritative. Prisma queries perform filtering and pagination in the database. No endpoint loads every contact or every workspace event into application memory.

## Follow-gated campaign rollout

`GET /api/health` adds a non-secret capability object:

```json
{
  "capabilities": {
    "followGatedCampaigns": "enabled"
  }
}
```

The value is `enabled` or `disabled`; it exposes no credentials. Production deployment configuration sets `FOLLOW_GATED_CAMPAIGNS_ENABLED=true` for both web and worker services. The release procedure verifies the returned capability after deployment so web and worker configuration drift is detectable. The worker health/operations view also reports the flag without exposing environment values.

## Production smoke testing

Smoke testing uses the already submitted Meta app and designated test accounts. It must not expose tokens or credentials in logs or screenshots.

The controlled run verifies:

1. An Instagram test comment triggers the configured private reply or DM.
2. A follow-gated campaign with an initially non-following test account sends the opt-in path, verifies the follow, and delivers the final link exactly once.
3. The resulting Instagram contact appears in Inbox and accepts one text reply while the 24-hour window is open.
4. A separate Facebook account leaves one top-level Page comment and receives exactly one nested public Page reply; Page-authored and nested comments do not loop.

Before each run, identify the exact test automation and test post. Do not reuse a production customer campaign. Record only event IDs, timestamps, safe status codes, and pass/fail outcomes in a release verification note. If a required test account, post, or login is unavailable, the smoke item is reported as externally blocked rather than simulated.

## Browser test repair

The Playwright suite remains behavior-oriented. Tests are updated to current accessible roles, names, and routes instead of adding brittle CSS selectors or suppressing assertions.

Required browser coverage includes:

- marketing hero and current header behavior;
- signup confirmation behavior;
- current automation builder labels and activation controls;
- inbox contact pagination and loading;
- unread/read transition;
- open/closed, favourite, reminder, assignment, label, filter, and sort behavior;
- older-message pagination;
- Facebook activity pagination and absence of a reply composer;
- responsive inbox behavior;
- existing authenticated dashboard, settings, profile, contacts, sequences, broadcasts, insights, and Facebook Page automation journeys.

The suite runs against a production build where practical. A failing assertion is fixed by tracing whether the product or test is wrong; tests are not deleted merely to reach green.

## Error handling and accessibility

- Pagination failures preserve already loaded rows and expose a retry action.
- Optimistic inbox-state changes roll back on API failure and announce the error.
- Filter controls have explicit accessible names and remain keyboard operable.
- Unread state is conveyed through text or accessible labels, not colour alone.
- Reminder dates render in the workspace/browser locale while APIs exchange ISO timestamps.
- Facebook activity makes the no-Messenger boundary explicit.
- Reduced-motion preferences remain respected.

## Verification gates

- New repository and route behavior follows red-green TDD in both memory and Prisma-backed paths where feasible.
- Prisma migration applies cleanly to an existing database and a fresh database.
- Unit tests, lint, typecheck, production build, and the complete Playwright suite pass.
- Production health reports the deployed release, healthy database and Redis, configured Instagram and Facebook integrations, and `followGatedCampaigns: "enabled"`.
- Each live smoke flow has evidence from a real provider interaction or an explicit external-blocker report.
- No attachment, image-message, voice-message, internal-note, Facebook Messenger, or WhatsApp UI is introduced.
