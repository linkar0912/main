# Automation Workspace Refresh

## Goal

Make Facebook Page automations publish reliably, make the main automation paths easier to discover, add a complete insights destination, and bring every authenticated screen onto one consistent responsive layout system.

## Confirmed root cause

The version 1/classic builder creates or updates an automation but never sends the follow-up status change used by the version 2 Instagram campaign builder. Repository creation defaults to `DRAFT`, so every newly created Facebook Page automation remains a draft even when the user expects it to run.

## Navigation

The workspace sidebar will contain Home, Automations, Quick Automation, Insights, Contacts, Inbox, and Settings. Sequences and Broadcasts will remain available at their existing URLs for backward compatibility, but will be removed from the primary sidebar and from the Automations screen's redundant sub-navigation.

Quick Automation will live at `/quick-automation`. Insights will live at `/insights`. Both routes will have loading states consistent with the existing App Router screens.

## Facebook activation and preview

The classic builder will expose two explicit final actions: `Save draft` and `Save & activate`. Both create or update the complete automation first. Activation then performs the same `ACTIVE` status update already used by the campaign builder. If the first request succeeds and activation fails, the UI will state that the automation was saved as a draft and explain that activation failed.

Editing an already active automation will preserve its active status unless the user explicitly chooses `Save draft`. The builder will report the final state accurately and return the final saved record to its caller.

The existing Facebook preview will be upgraded to the same quality level as the Instagram preview: a polished mobile device frame, Page identity, post media/body, comment thread, nested Page reply, and clear preview-only messaging. It will continue using live connected Page identity where available and safe fallback content otherwise.

## Quick Automation

Quick Automation is an Instagram Reel-first flow because the current media API exposes connected Instagram media while Facebook Page media fetching is not part of the existing product contract.

The page has two sequential selections:

1. Load connected Instagram media, filter to Reels, and display every fetched Reel in a responsive thumbnail grid with pagination through the existing cursor API.
2. After one Reel is selected, show automation recipes compatible with Instagram comment automation. Selecting a recipe routes to the existing builder with the recipe and Reel ID preselected.

The builder URL will carry only stable identifiers. The builder will resolve current media display data itself, while the persisted definition keeps the existing sanitized media snapshot contract and excludes transient CDN URLs.

Empty, loading, disconnected-account, expired-token, and API-failure states will each provide a specific recovery action.

## Insights

The Insights page will reuse the existing `/api/insights` data contract and present:

- key metrics for people reached, replies sent, captured contacts, opt-outs, and current-month usage;
- a 14-day activity chart;
- the participant funnel;
- top Reel/post performance;
- a CSV export action;
- useful empty and error states.

No schema or migration is required. The page will derive rates defensively when denominators are zero and will remain usable when any optional data group is empty.

## Layout system

Authenticated screens will use shared page-width, horizontal-padding, header, card, grid, and responsive-breakpoint rules. The pass will cover Home, Automations, Quick Automation, Insights, Contacts, Inbox, Settings, Profile, Help, automation create/edit/activity, Sequences, and Broadcasts even though the last two leave primary navigation.

The visual direction stays faithful to Linkar's current high-contrast monochrome workspace with its yellow interaction accent. The signature interaction is the Reel-to-flow handoff on Quick Automation; surrounding pages stay quiet and systematic. The pass includes keyboard focus, overflow prevention, mobile navigation, touch targets, reduced-motion behavior, and readable empty states.

## Testing

Implementation will use failing tests first. Coverage will include:

- classic/Facebook save-as-draft and save-and-activate request sequences;
- activation failure messaging and active-edit behavior;
- sidebar destinations and removal of Sequences/Broadcasts from primary navigation;
- Quick Automation Reel filtering, pagination, recipe selection, and builder prefill;
- Insights loading, metrics, empty states, and export link;
- Facebook preview structure and accessible labels;
- route rendering and responsive overflow regressions where practical.

After focused tests, the full unit suite, lint, typecheck, production build, and Playwright suite will run. Visual QA will inspect all authenticated routes at desktop, tablet, and mobile widths. Final production verification will use Brave as requested.

## Deployment

Deployment will use the repository's existing Coolify deployment command only after all local checks pass. Production verification will confirm navigation, Insights, Quick Automation, Facebook preview, and the activation behavior in Brave. Creating or activating a real social automation will only be done in the explicitly supplied Linkar workspace and will avoid sending test messages to third parties.
