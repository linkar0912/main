# Automation Editing and Mobile Builder Design

## Goal

Make every saved automation reopen as the exact editable configuration the user created, make draft and activation state explicit, replace raw inline failures with actionable popups, and make the full campaign builder fast to use on a phone.

## Root causes

- The Prisma repository destructures `definition` out of an automation patch but never includes it in the database update. Production therefore preserves the old automation JSON even though the API reports success.
- The route snapshots version history after the update, so the “previous” version is actually the new state.
- The version-2 builder does not send `status: "DRAFT"` when saving edits to an active campaign.
- Existing version-2 campaigns initialize with only the first wizard step unlocked.
- Version-2 campaign priority is not passed into or rendered by its editor.
- Builder failures are rendered below the entire step content, often outside the viewport, and raw API codes can reach that location.
- At phone widths, the large desktop preview follows the form, the action row is not optimized as a thumb-reachable control, and Reel cards consume too much vertical space.

## Persistence and state design

`Repository.updateAutomation` will accept optional snapshot metadata. In the Prisma implementation, reading the current row, inserting its history snapshot when requested, and updating the row will happen inside one short transaction. The database update will explicitly persist `definition` as JSON and keep its numeric version synchronized. The memory implementation will provide the same observable behavior.

The automation PATCH route will pass the current user as the snapshot actor whenever name or definition changes. It will not perform a second post-update snapshot. An edit request will carry the intended final status, so an existing automation is updated and paused or activated in one request. New automations will also accept an explicit final status so creation does not leave a partial draft when activation was requested.

Saving a draft always results in `DRAFT`. Saving and activating always results in `ACTIVE`, with `activatedAt` set according to existing next-media re-arming rules. Editing must preserve the provider pin and every definition field.

## Editing experience

When an existing automation opens, all wizard steps are immediately available. The current configuration initializes every field, including priority. Users may move directly to the section they want, change it, review it, and save without re-entering earlier fields.

The version-2 builder will expose priority under Guardrails, using the same bounded integer rules as classic automations. The Save buttons retain their literal semantics for both new and existing records.

## Error and success presentation

A reusable fixed notification popup will appear near the top-right on desktop and span the safe content width on mobile. Errors remain visible until dismissed, use `role="alert"`, receive focus when appropriate, and contain plain language plus the corrective action. Success notifications may dismiss automatically but remain announced through `role="status"`.

Known backend codes such as `invalid_channel_target` and `invalid_channel_definition` will be translated at the API boundary or client error mapper. Validation errors will identify the relevant wizard step and take the user there before showing the popup. No builder save error will be rendered at the bottom of the page.

## Mobile design

At widths up to 680px:

- The builder uses one edge-to-edge content column with compact step cards.
- The step navigation becomes a sticky current-step header with progress text and compact indicators instead of six long horizontal labels.
- Back, Next, Save draft, and Save & activate live in a sticky bottom action bar that respects safe-area insets; primary actions fill available width and remain at least 44px tall.
- The permanent phone preview is removed from document flow. A “Preview” control opens it in a dismissible bottom sheet.
- The media picker becomes a touch-friendly portrait rail with clear selected states, scroll snapping, and compact captions. Selection remains keyboard accessible.
- Step markers no longer consume a separate grid column, field groups collapse to one column, and long URLs/messages wrap without causing horizontal overflow.

Desktop keeps the current two-column editor and sticky preview.

## Testing and QA

Regression tests will prove that definition JSON changes persist through the production-style repository path, snapshots contain the pre-edit state, Save draft pauses an active campaign, Save & activate persists edits and status together, existing campaigns unlock all steps, priority round-trips, and API codes become popup copy.

Component tests will cover the mobile preview sheet and Reel selection semantics. Local visual QA will run at desktop, tablet, 390px phone, and 360px phone widths in light and dark themes. The full test suite, lint, typecheck, production build, and database migration checks must pass before deployment.

## Non-goals

This change does not alter Meta delivery behavior, create new automation trigger types, or redesign the desktop visual language beyond the controls needed for reliable editing.
