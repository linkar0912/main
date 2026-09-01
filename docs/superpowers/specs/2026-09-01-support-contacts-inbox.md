# Support, Contacts, and Inbox Design

## Goal

Turn Linkar's existing help content, contact records, activity feed, and connection-health data into a cohesive customer support and conversation workspace without exposing provider credentials.

## User-facing behavior

- Help keeps the existing page title but replaces the oversized hero card with one full-width, icon-led live-search field.
- Help search matches topic metadata, question text, and rendered answer text.
- A no-result query is recorded once after the user pauses typing; article readers can submit Helpful or Not helpful feedback once per article view.
- Automations, Sequences, Broadcasts, and Settings show a compact contextual `Need help?` link into the matching Help topic.
- Contacts becomes a first-class sidebar destination with search, lead-stage filters, email/export affordances, and the existing profile/timeline/handoff detail experience.
- Activity becomes Inbox while retaining `/activity` for compatibility. Instagram rows open their associated contact and full timeline when one exists. Facebook Page comments remain visible in the same feed but do not offer Instagram-only human handoff.
- Settings exposes `Copy diagnostics`. The copied JSON contains only allowlisted connection state, webhook subscription field names, timestamps, and recent failure IDs/codes. It never contains access tokens, secrets, raw provider errors, message text, emails, or contact identifiers.

## Data and privacy

- Help analytics are workspace-scoped and session-authenticated.
- Search analytics store a normalized query capped at 120 characters and the result count. No IP address, user agent, or provider data is stored.
- Article feedback stores the stable article key, boolean rating, and timestamp.
- Diagnostics are generated on demand in the browser from already-authorized APIs and are never persisted by the new feature.

## Constraints

- Preserve current Instagram and Facebook permission boundaries.
- Facebook Page support remains public-comment activity only; do not imply Messenger support or human handoff for Facebook.
- Preserve all unrelated dirty-worktree changes.
- Do not commit, push, or deploy.
