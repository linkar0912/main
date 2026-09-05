# Product UI and Billing Polish Design

## Goal

Make the workspace feel fast, clear, and premium while fixing the specific billing, navigation, profile, dashboard, template-picker, and automation-builder issues reported from production.

## Scope

This workstream covers:

- popup feedback for every premium-invite redemption outcome;
- selecting an active plan when an operator creates an invite code;
- a polished, dark-mode-safe invite creation and redemption experience;
- removing Pricing from the signed-in sidebar;
- redesigning My Profile;
- fixing the template picker at 390px mobile width;
- showing the Home “Start here” recipes only when the workspace has no automations;
- matching Home Reply volume to the Insights chart language and components;
- replacing Home’s Create automation action with Quick Automation;
- removing the Test run simulator from every builder surface;
- removing the workspace footer’s brand and resource directory, and moving all resource links into Settings → Policies;
- restrained interaction and confirmation motion.

It does not configure Razorpay, restructure data loading, rewrite every product string, deploy production, or delete accounts. Those belong to separate workstreams.

## Existing-System Findings

- `PremiumInviteCode` already references `PlanDefinition`, but `createPremiumInviteService()` always looks up `agency` and the admin form has no plan field.
- Invite redemption currently renders success and error banners inside Billing instead of using the existing fixed `ActionNotice` popup pattern.
- checkout availability is intentionally derived from runtime Razorpay configuration and is not a presentational bug.
- Home’s “Start here” recipe section renders unconditionally; the separate setup checklist already knows whether automations exist.
- Home and Insights duplicate their reply-volume chart implementations.
- `AutomationSimulator` is rendered by the builder and calls a dedicated simulation route that sends no Meta messages.
- all workspace resource links currently live in `AppShell`; Settings → Policies is the correct permanent home.

## Product Behavior

### Invite redemption feedback

Submitting an invite code produces one fixed popup using the same vocabulary as the action performed:

- success: “Invite applied” and the selected plan plus expiry date;
- already used: “This invite has already been used”;
- expired or revoked: “This invite is no longer active”;
- an active promotion already exists: “This workspace already has invite access”;
- invalid: “We couldn’t find that invite. Check the code and try again”;
- network/server failure: “We couldn’t apply the invite. Try again.”

The popup uses `role="status"` for success and `role="alert"` for failure, supports dismissal, auto-dismisses non-critical feedback, and remains readable in both themes. The redemption card also refreshes billing data and reports the actual granted plan rather than assuming Agency.

### Admin invite creation

The form loads active plan definitions and requires a plan selection. The request sends a trusted plan key; the service resolves an active plan server-side and persists its ID. Retired, missing, or Free plans are rejected. Existing Agency codes continue to work unchanged.

The creation panel uses Linkar’s panel tokens rather than literal white backgrounds. The selected plan includes a compact summary of limits, the one-time plaintext code remains copyable, and validation/error feedback uses the fixed popup. Code listings retain the plan name and status without revealing the code.

### Navigation and policies

Pricing is removed from `accountNavigation`; billing remains available in Settings. The signed-in footer is reduced to the copyright line, without duplicate brand or resource links. Settings → Policies contains Support, Terms, Privacy, Cookies, Acceptable use, Data processing, Service providers, and Data deletion as a responsive, keyboard-accessible link list.

### Home

The top-right action is a normal link to `/quick-automation` labelled “Quick Automation.” The recipe-oriented “Start here” section renders only after automation data resolves and only when `automations.length === 0`. Existing workspaces go directly from the greeting to performance and automation summaries.

Home and Insights consume one shared reply-volume chart component and shared day normalization. Home keeps its compact summary strip; chart visuals, legend, date labels, empty state, and accessible description match Insights.

### My Profile

My Profile becomes a compact account page with:

1. an identity header containing avatar, name/email, role, plan, verification, and membership date;
2. a connected-channels section with Instagram and Facebook accounts;
3. account and security actions grouped by purpose instead of one oversized information card.

Unknown asynchronously loaded values render skeletons rather than incorrect Free/Unverified claims. Mobile stacks identity facts and actions without table-like columns. Dark mode uses semantic surface, line, ink, muted, success, and accent tokens only.

### Template picker mobile layout

At 720px and below the picker is a full-height sheet. Its header and search stay visible; the channel chooser becomes a compact two-choice row; the automation destination becomes plain-language supporting text; categories become a single horizontally scrollable tab row instead of wrapping into a tall block; and only the template-results region scrolls. At 390px no control or category is clipped, the close button remains visible, and the sheet respects safe-area insets.

### Remove Test run

Remove `AutomationSimulator` from all builder variants and remove its styles, component tests, route tests, and route. The pure simulator library may remain only if another production consumer exists; otherwise it and its tests are removed. Preview remains available because it teaches the final customer experience without introducing a second technical testing workflow.

## Visual and Motion Direction

The base palette remains the current Linkar black/white surfaces with yellow for primary action, magenta for selected or promotional state, green for success, and semantic muted/line tokens. No literal white surface may be used for an interactive panel.

The memorable moment is invite confirmation: the popup settles into place and the granted-plan label updates once. Other motion is functional—sheet opening, dismissing feedback, selecting a plan, and revealing copied state. Motion uses existing timing tokens, avoids repeated entrance animation, and is disabled under `prefers-reduced-motion`.

## Testing

- unit and component tests for plan selection, trusted resolution, invalid plans, and actual-plan redemption copy;
- popup success/error/dismissal/accessibility tests;
- AppShell and Settings policy-link coverage;
- Home tests for zero, one, and loading automation states and the Quick Automation link;
- shared chart tests and removal of duplicated chart logic;
- Profile light/dark and responsive assertions;
- Playwright coverage at 390×844 for the template picker and mobile preview;
- repository-wide checks proving no Test run or simulator endpoint remains reachable;
- focused visual review in light, dark, desktop, and mobile modes.

## Rollout

Ship this workstream independently after tests, lint, typecheck, build, and responsive visual checks pass. Existing URLs remain stable except the intentionally removed simulation API, which is private and unused outside the builder.

