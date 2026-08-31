# Facebook Automation Parity Design

## Goal

Make Facebook a first-class Linkar automation channel rather than a connected Page with one partially exposed action. Linkar will provide dedicated Facebook Page-comment templates and a complete Facebook Messenger automation experience, while preserving the existing Instagram product and sharing the reliable parts of the automation platform.

Facebook Page-comment automation can launch under the permissions already requested. Facebook Messenger will be fully implemented and tested but unavailable for customer activation until Linkar receives the required Meta approval and the platform owner enables the capability.

## Approved Product Decisions

- Linkar will support both Facebook Page public-comment replies and Facebook Messenger automations.
- The product will use a shared automation foundation with channel-specific capability modules, not a duplicate Facebook application and not additional conditionals inside the existing monolithic builder.
- Creation will be channel-first: provider, connected account or Page, automation category, then template or blank flow.
- Facebook Page comments and Facebook Messenger both target a connected Facebook Page, but expose different triggers, actions, policy checks, previews, and delivery adapters.
- Facebook Messenger code and UI will ship behind a server-enforced rollout state that defaults to `OFF`.
- Existing Facebook Page-comment features remain usable while Messenger approval is pending.
- Existing Instagram connections, automations, contacts, sequences, broadcasts, deliveries, and history will be preserved through additive migrations.
- New automations must target an explicit connected account or Page. Legacy unpinned Instagram automations keep their current all-connected-account behavior.
- Instagram and Facebook identities are never automatically merged.
- Linkar will not offer a trigger or action that its current Meta permissions and provider policy do not permit.

## Scope

### Facebook Page comments

- Keyword and catch-all triggers on top-level comments.
- Optional targeting of selected Page posts or all Page posts.
- Keyword match modes, negative keywords, and reply-once-per-person behavior.
- Public nested replies beneath the triggering comment.
- Reply variants, schedules, priority, and daily send limits.
- Templates, builder validation, local simulator, Facebook post preview, versions, duplication, activation, activity, and delivery diagnostics.

Page-authored comments and nested replies remain ignored. Comment automation does not create a Messenger identity and does not privately message a commenter unless Meta separately supplies a valid messaging interaction or opt-in.

### Facebook Messenger

- Message keyword and catch-all triggers.
- First-contact, referral, Get Started, postback, and quick-reply triggers when delivered by Meta.
- Text, image, link, button, and quick-reply actions supported by the Messenger adapter.
- Email and structured-field collection.
- Contact tags, score, lead status, assignment, notes, source attribution, suppression, and opt-out handling.
- Timed sequences and eligible broadcasts.
- Messaging-window, opt-in, permission, and capability enforcement.
- Templates, builder validation, Messenger preview, local simulator, versions, duplication, activation, activity, and delivery diagnostics.

### Shared product surfaces

- Channel-aware automation list, filters, status, and account/Page badges.
- Channel-aware template picker and blank-flow entry.
- Activity, execution history, retries, version restoration, and duplication.
- Audience, sequence, and broadcast filters by provider and connection.
- Platform-owner capability controls and permission health.
- Help content and Meta reviewer instructions that describe only enabled functionality.

## Explicit Non-Goals

- Facebook post publishing, scheduling, ads management, Page inbox replacement, or comment deletion.
- Cross-channel identity matching based on names, emails, or inferred identity.
- Sending a Messenger message to a Page commenter who has not established an eligible messaging relationship.
- Scraping Facebook or driving Facebook user interfaces.
- Enabling Messenger production sends before Meta approval and owner activation.
- Rewriting the Instagram connection tables or replacing the existing Instagram runner in one release.
- Claiming that every Instagram-only trigger has a Facebook equivalent. Story mentions remain Instagram-only unless Meta exposes an approved Facebook event with equivalent semantics.

## Capability Architecture

### Channel target

Application code uses a channel target with three fields:

- `provider`: `INSTAGRAM` or `FACEBOOK`.
- `connectionId`: the connected Instagram account ID or Facebook Page ID.
- `surface`: `COMMENT` or `MESSAGING`.

The existing `instagramAccountId` and `facebookPageId` columns remain the concrete connection pins. `Automation` gains a provider field that is backfilled to `FACEBOOK` when `facebookPageId` is present and `INSTAGRAM` otherwise. Surface is derived from the validated trigger family rather than stored redundantly.

New create and update requests require `provider` and an explicit connection pin. The server rejects conflicting provider, connection, trigger, and action combinations. Existing unpinned rows are treated as legacy Instagram automations and remain editable without being silently repinned.

### Capability registry

A central registry describes each provider and surface:

- Stable provider and surface identifiers.
- Supported trigger and action kinds.
- Required connection type and Meta permissions.
- Compatible templates.
- Builder sections and validation rules.
- Preview renderer.
- Simulator adapter.
- Delivery adapter.
- Runtime rollout state.

The template picker, builder, API validation, activation service, simulator, and admin health screens all read the same registry. UI visibility is not an authorization boundary; API and runner validation independently enforce the declared capabilities.

### Builder decomposition

The current classic builder is split into focused units:

- Channel and connection selection.
- Trigger configuration.
- Conditions and keyword matching.
- Action sequence editing.
- Data collection.
- Follow-ups and sequence enrollment.
- Schedule, priority, and limits.
- Review and activation.
- Provider preview.

Each section receives a capability description and a typed draft rather than reading global channel conditionals. Instagram behavior must remain unchanged during extraction. Campaign version 2 stays Instagram-only until a separate Facebook campaign design is approved.

### Runtime separation

Provider clients and event normalization remain separate:

- The Instagram webhook and client keep Instagram-specific payload and delivery semantics.
- The existing Facebook feed webhook and comment runner keep Page-comment semantics.
- A Facebook Messenger normalizer and runner handle messages, postbacks, referrals, quick replies, and supported opt-ins.

Reusable services own channel-neutral behavior: schedule evaluation, keyword matching, deduplication, execution claims, daily limits, delivery ownership, contact field collection, sequence timing, broadcast segmentation, suppression, and activity recording. Provider adapters decide whether a recipient is eligible and how a supported action is sent.

## Data Model

### Automation

`Automation` gains `provider` with an indexed enum value. Backfill rules are deterministic:

- Non-null `facebookPageId` becomes `FACEBOOK`.
- All other existing rows become `INSTAGRAM`.

Database and service validation enforce that Facebook automations have `facebookPageId`, new Instagram automations have `instagramAccountId`, and the two pins are mutually exclusive. Legacy unpinned Instagram rows are exempt only from the new-pin requirement.

Definitions remain versioned JSON. Trigger and action schemas gain provider-aware validation without rewriting stored version-1 Instagram definitions. New Messenger trigger kinds are added only to the version that declares them; older definitions retain their existing interpretation.

### Contacts

`AutomationContact` becomes channel-addressable through additive fields:

- `provider`.
- `connectionId`.
- `providerUserId`.
- `messagingEligibleUntil` when the provider returns an enforceable eligibility boundary.
- `lastOptInAt`, `optInType`, and `optedOutAt` where applicable.

Existing `instagramAccountId` and `igScopedUserId` remain during compatibility migration and are backfilled into the new fields. Facebook Messenger contacts use the Page ID as `connectionId` and the Page-scoped person ID as `providerUserId`. The canonical uniqueness rule is `(workspaceId, provider, connectionId, providerUserId)`.

Sequence enrollment continues to reference `AutomationContact`, so existing Instagram enrollment history survives. All repository methods gain channel-target variants before legacy Instagram-only methods are retired.

### Sequences

`AutomationSequence` gains `provider` and optional `connectionId`. A sequence is provider-bound because available action shapes and delivery policy differ. An enrollment must reference a contact with the same provider and, when pinned, the same connection.

Sequence jobs re-evaluate permission, connection, suppression, opt-out, and provider eligibility immediately before every step. A closed messaging window pauses or cancels delivery according to the provider result; it is never bypassed by a previously scheduled job.

### Broadcasts

`Broadcast` gains `provider`, `connectionId`, a versioned action payload, and an explicit eligibility segment. Facebook broadcasts are created only for Messenger contacts currently eligible under Meta policy or an approved opt-in mechanism. The final recipient query is evaluated when the broadcast starts, and every delivery rechecks eligibility before sending.

The existing `all_contacts` and `captured_email` segments remain valid for Instagram. Provider-specific segments must be explicitly named and validated rather than silently reusing an incompatible Instagram segment.

### Outbound delivery

`OutboundDelivery` gains `provider` and `connectionId`. Existing `instagramAccountId` remains during migration. Delivery keys include provider and connection so the same provider-scoped user ID cannot collide across Pages or channels.

Payloads store only the channel action required for retry. Access tokens are loaded from the current encrypted connection at send time and are never copied into queue payloads or delivery records.

### Facebook connection capability health

`FacebookPageConnection` stores the sanitized granted-permission names and the last successful permission check time. It does not store debug tokens or raw permission responses. Health is computed against the registry requirements for Page comments and Messenger separately.

## Templates

Templates gain `provider`, `surface`, `requiredCapabilities`, and a typed setup definition. The picker never offers a template whose required capability is unsupported by the selected connection.

### Facebook Page-comment templates

- Keyword comment reply.
- Reply to every comment.
- Product or pricing FAQ.
- Availability or opening-hours reply.
- Giveaway acknowledgement.
- Support acknowledgement.
- Per-post campaign reply.

Every template uses only a comment trigger and one public nested reply action. Templates may prefill safe example text but never contain a real customer URL, Page ID, or credential.

### Facebook Messenger templates

- Conversation starters.
- Keyword instant reply.
- Default reply.
- Main menu.
- Welcome first-time contact.
- Referral or ad welcome.
- Email capture.
- Lead qualification.
- FAQ flow.
- Support triage.
- Follow-up sequence.
- Eligible subscriber broadcast.

Messenger templates remain in the code catalog in every rollout state. They are hidden from ordinary workspaces while the rollout state is `OFF`, available only to explicitly allowlisted internal or reviewer workspaces while it is `INTERNAL`, and available to eligible customer workspaces while it is `ENABLED`. Direct API calls enforce the same state.

## Creation and Editing Experience

“New automation” follows a single channel-first flow:

1. Select Instagram or Facebook.
2. Select a connected account or Page.
3. Select Page comments or Messenger when Facebook is chosen.
4. Select a compatible template or blank flow.
5. Configure, simulate, review, and save.

Changing provider, connection, or surface after configuration shows an impact summary. Incompatible trigger and action data is removed only after explicit confirmation. The builder never attempts to reinterpret an Instagram private reply as a Facebook public reply or Messenger message.

Facebook Page-comment editing includes post scope, keyword behavior, exclusions, reply variants, reply-once, schedule, priority, limit, and public reply. Facebook Messenger editing includes inbound trigger, action sequence, data collection, follow-ups, sequence enrollment, schedule, priority, and limit.

Previews are truthful and local-only:

- Page comments render a Facebook Page post, the visitor’s top-level comment, and the Page’s nested public reply.
- Messenger renders a Facebook conversation with supported message components.
- Instagram continues using its existing post and DM previews.

The automation list, activity screen, simulator, duplicate action, and versions modal show provider, surface, and connection consistently.

## Feature Gating and Administration

Messenger availability uses a durable platform rollout state controlled from the owner admin console. The server is the authority:

- `OFF`: ordinary and internal workspaces cannot create or activate Messenger automations.
- `INTERNAL`: only explicitly allowlisted internal or reviewer workspaces can create and activate Messenger automations.
- `ENABLED`: eligible customer workspaces can create and activate Messenger automations.

Production defaults to `OFF`. Test fixtures may select another state explicitly; no environment infers approval from the presence of an app secret.

Enabling Messenger requires all of the following:

- Rollout state changed by an MFA-authenticated platform owner.
- Meta app configuration present.
- Required permission approval recorded in the owner-controlled capability record.
- Selected Page currently grants every registry-required permission.
- Page webhook subscription includes the required Messenger fields.

The owner console shows rollout state, the `INTERNAL` workspace allowlist, required permissions, Page permission drift, webhook subscription health, recent delivery failures, and affected workspaces. It can disable Messenger globally without disconnecting Pages or deleting drafts. Capability changes produce admin audit events.

Customer APIs return a stable `capability_disabled`, `permission_missing`, or `connection_unhealthy` error rather than generic provider failures. Existing Page-comment activation is not blocked by missing Messenger permission.

## Webhooks and Event Processing

Facebook webhook verification and signature validation remain shared at the endpoint boundary. Payload parsing separates Page feed changes from Messenger events before queueing.

Every normalized event contains provider, connection, provider event ID, event type, sender identity when permitted, timestamp, and the minimum event-specific payload. Queue job IDs include provider and connection. Duplicate webhook deliveries resolve to one execution claim.

The Messenger runner processes only workspaces and Pages that are active, connected, permission-healthy, and capability-enabled. It resolves automations pinned to the Page, applies provider-aware trigger matching, records the execution result, and sends through the Facebook Messenger client.

## Messaging Eligibility and Safety

- Provider eligibility is checked at activation where possible and immediately before every send.
- Linkar follows Meta’s current messaging-window, opt-in, and message-category rules rather than hard-coding a promise that policy will never change.
- Comment activity alone does not create Messenger eligibility.
- A Page-scoped ID is never used under a different Page.
- Contact suppression and opt-out stop automation, sequence, and broadcast sends.
- Page disconnection pauses its automations and cancels or safely skips pending provider work.
- Every send reserves its limit before the provider call and records known-sent, known-not-sent, or ambiguous outcomes without blind duplication.
- Retryable failures use bounded backoff; permanent permission and policy errors do not retry indefinitely.
- Customer-visible activity uses redacted reasons and never exposes tokens or raw provider identifiers.

## API Validation

Create, update, duplicate, version restore, activate, simulate, sequence, broadcast, and admin mutation routes all validate provider capability server-side.

Validation rejects:

- Cross-workspace connection IDs.
- Conflicting Instagram and Facebook pins.
- A trigger or action unsupported by the selected surface.
- Messenger activation while the platform flag is disabled.
- Missing Page permissions or unhealthy webhook subscription.
- Sequence enrollment into a provider-incompatible contact.
- Broadcast segments that include ineligible or cross-connection recipients.
- Unknown definition fields and unsupported definition versions.

## Activity and Error Handling

Activity distinguishes:

- Matched.
- Sent.
- Skipped by condition.
- Duplicate.
- Outside schedule.
- Daily limit reached.
- Suppressed or opted out.
- Messaging window expired.
- Capability disabled.
- Permission missing.
- Connection unhealthy.
- Provider retry scheduled.
- Permanently failed.

Provider error details are mapped to safe stable result codes. Full sanitized diagnostics remain available to the platform owner. A Facebook-specific failure cannot blank Instagram activity or stop an unrelated provider worker.

## Testing Strategy

### Unit tests

- Registry consistency: every template uses supported triggers and actions.
- Provider-aware definition validation.
- Keyword, exclusion, post-targeting, reply-once, schedule, priority, and limit behavior.
- Messenger eligibility, opt-out, suppression, and Page-scoped identity isolation.
- Delivery-key uniqueness across providers and connections.
- Sequence and broadcast compatibility checks.
- Rollout-state and permission-health enforcement.

### API and repository tests

- Create and update validation for every provider and surface.
- Cross-workspace Page rejection.
- Additive contact and delivery migration backfill.
- Provider-bound sequence enrollment and broadcast selection.
- Activation rejection while Messenger is disabled.
- Permission-health drift and recovery.
- Duplicate, version restore, pause, retry, and admin controls.

### Component tests

- Channel-first picker and account/Page selection.
- Provider-filtered categories and templates.
- Channel-switch impact confirmation.
- Builder field visibility and provider-specific validation.
- Facebook Page-comment and Messenger previews.
- Channel badges, filters, activity reasons, and disabled approval state.

### Integration tests

- Facebook Page webhook through normalized event, queue, matcher, API client, and execution record.
- Messenger message, postback, referral, quick reply, opt-out, and delivery flows using signed fixtures.
- Retry and ambiguous-delivery ownership behavior.
- Sequence and broadcast sends with eligibility changes between scheduling and dispatch.
- Instagram regression coverage proving unchanged definitions produce unchanged requests and results.

### End-to-end tests

- Create and activate a Facebook Page-comment template and observe its simulated and recorded reply.
- Verify that `OFF` rejects Messenger creation and activation through both UI and direct API calls.
- Select `INTERNAL` in a controlled environment, allowlist a reviewer workspace, create message and sequence flows, process fixtures, and verify activity.
- Production smoke tests run with Messenger disabled until Meta approval.

## Rollout

### Phase 1: shared foundation

Extract the capability registry and builder sections under regression tests. Backfill provider identity additively. No visible Instagram behavior changes.

### Phase 2: Facebook Page-comment product

Ship channel-first creation, Page-comment templates, complete builder controls, simulator, preview, activity, filtering, and diagnostics. Keep the existing comment runner as the delivery authority.

### Phase 3: Messenger implementation behind flag

Ship Messenger contact storage, webhook normalization, runner, client, templates, builder, preview, sequences, broadcasts, activity, and admin health with the production capability disabled.

### Phase 4: Meta approval preparation

Prepare the additional permission request, test calls, reviewer account path, Page setup, screencasts, permission descriptions, and data-handling answers. This phase does not submit the review without explicit owner authorization.

### Phase 5: controlled enablement

After Meta approval, verify production permission and webhook health, enable Messenger for an internal workspace, run smoke tests, then enable it globally through the owner console. The feature can be disabled globally without data loss.

## Completion Criteria

- Facebook appears as a first-class channel throughout automation creation and management.
- Facebook Page-comment templates are usable in production under existing permissions.
- Messenger templates and workflows are fully implemented and tested but cannot send in production while disabled.
- Server validation prevents unsupported or unapproved operations even when called directly.
- Sequences and broadcasts are provider-aware and enforce recipient eligibility at dispatch.
- Existing Instagram automation, contact, sequence, broadcast, and delivery tests remain green.
- The owner can inspect Facebook permission health and control Messenger availability without editing secrets.
- No production Messenger send occurs before Meta approval and explicit owner enablement.
