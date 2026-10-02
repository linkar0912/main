# Marketing Navigation and Workspace Settings Redesign

## Goal

Polish Linkar's marketing navigation and channel showcase, then redesign Workspace settings into a clear, responsive control center without changing existing authentication, connection, webhook, team, delivery, or policy behavior.

## Scope

This change includes four connected UI improvements:

1. Add visual separation before the yellow Supported channels section.
2. Give the Instagram and Facebook logo circles a pure white background while leaving the full section yellow.
3. Add an accessible Resources mega menu and smooth same-page anchor scrolling.
4. Redesign Workspace settings around clearer hierarchy, balanced channel cards, and responsive layouts.

No new backend endpoints, permissions, database changes, analytics, billing controls, or messaging capabilities are included.

## Marketing Channel Showcase

The Supported channels section remains a full-width yellow block with its existing grid texture, headline, copy, and two channel cards. A responsive white spacer separates it from the preceding Automation story section. The spacer belongs outside the yellow visual surface so the section reads as a distinct chapter rather than extra yellow padding.

The Instagram and Facebook marks remain inside bordered circular holders. Those holders use pure white in both cards, without cream, yellow, pink, or blue fills. The Facebook card may keep its pale blue card surface because the request only removes color behind the brand marks.

Spacing scales by viewport: desktop receives the strongest chapter break, tablet receives a moderate break, and mobile receives enough separation to avoid an accidental empty screen.

## Resources Mega Menu

Resources becomes a button in the desktop primary navigation, matching the existing Solutions trigger. Only one mega menu may be open at a time.

The menu contains two columns:

- Learn: How it works, Automation workflows, Frequently asked questions, and Help center.
- Company: Privacy policy, Terms of service, Data deletion, and Support.

Links point to existing Linkar sections and routes. The menu uses the current white floating panel, dark overlay, border, shadow, typography, and staged reveal animation so it feels native to the header instead of copied from the reference site.

Interaction requirements:

- Open by click or pointer entry on desktop.
- Close when another mega menu opens, a menu link is activated, the backdrop is clicked, Escape is pressed, or desktop navigation is hidden by a resize.
- Restore keyboard focus to the Resources trigger when Escape closes the menu.
- Expose accurate `aria-expanded`, `aria-controls`, and navigation labels.
- Keep resource destinations available in the existing mobile menu without adding a nested mobile mega menu.
- Disable decorative menu animations when reduced motion is requested.

## Smooth Scrolling

Same-page marketing anchors scroll smoothly and stop below the fixed marketing header. Cross-route navigation remains standard Next.js navigation.

The behavior is implemented with CSS `scroll-behavior` and `scroll-padding-top` on the marketing page boundary, plus existing or corrected `scroll-margin-top` values on anchor sections. Reduced-motion preferences switch scrolling back to immediate behavior.

## Workspace Settings Information Architecture

Workspace settings retains the five existing destinations: Connections, Delivery, Team, Policies, and Security. Connections, Delivery, Team, and Policies remain local tabs. Security remains a link to the profile security screen.

The redesigned page uses three levels:

1. A compact page introduction with workspace title, concise description, live or demo environment status, and total connected channel count.
2. A clear sticky section rail with consistent active, hover, count, and dark-mode states.
3. A focused content surface for the selected section.

### Connections

Instagram and Facebook appear as equal-width channel cards in a balanced two-column grid on wide screens and a single column on narrower screens. Each card contains:

- Official transparent brand mark on a neutral surface.
- Channel label and connection count.
- Short channel-specific capability description.
- Primary connection action.
- Connected account or Page rows when present.
- Webhook health summary integrated into the same channel card when health data exists.
- Reconnect guidance when Meta reports missing fields or a health-check error.

The Facebook Page picker remains inside the Facebook card after OAuth and stays fully usable on narrow screens. Long Page names, identifiers, error messages, and action labels must wrap without crushing the card or creating horizontal overflow.

### Delivery

Messaging quiet hours becomes the main settings panel with a clear enable control, grouped time and timezone fields, and a persistent save area. Data handling and environment information remain supporting panels beneath it.

### Team

Members and invitations retain all current actions. The invitation form and member list gain clearer grouping and responsive action placement.

### Policies and Security

Policies keeps the four public destinations in a structured link grid. Security remains discoverable from the section rail and is visually separated from workspace-level tabs.

## Visual System

The redesign reuses Linkar's existing design tokens, display and mono fonts, dark-mode variables, border radii, outlines, and yellow and pink accents. It does not introduce a new component library or new dependencies.

Cards use deliberate hierarchy instead of repeated generic panels: channel identity and primary actions are visually dominant, operational health is secondary, and destructive disconnect actions remain visually quiet until needed.

All layouts must work in light and dark themes. Focus indicators must remain visible against every surface.

## State and Data Flow

Existing fetches, OAuth redirects, state variables, route handlers, and action functions remain unchanged. The redesign reorganizes rendering and presentation only.

The Resources menu adds local header state. Opening Resources closes Solutions, and opening Solutions closes Resources. Existing body scroll locking remains limited to the mobile menu.

## Error Handling

Existing connection, webhook, invitation, and delivery errors remain visible in the section where the related action occurs. The redesign must not hide errors behind a closed tab during the action that generated them.

The menu has no network-dependent state and therefore needs no loading or error surface.

## Accessibility

- All menus and tabs remain operable by keyboard.
- Escape closes the active desktop mega menu and restores trigger focus.
- Section navigation uses descriptive labels and accurate active state.
- Icons never replace accessible text.
- Smooth scrolling respects `prefers-reduced-motion`.
- Focus rings and text contrast remain visible in light and dark modes.

## Testing

Regression tests are written before implementation and must prove:

- Resources exposes button semantics, correct destinations, mutual exclusion with Solutions, Escape focus restoration, backdrop close, and resize close.
- Marketing anchors remain present and Resources links to the intended existing sections and routes.
- Settings renders balanced Instagram and Facebook channel cards, keeps webhook health associated with the correct channel, preserves Page selection, and retains all section navigation.
- Existing connection, delivery, team, and policy behavior continues to pass.

CSS details that cannot be meaningfully asserted through component behavior are verified through focused visual inspection at desktop and mobile widths in both themes.

Final verification includes focused tests, the full Vitest suite, ESLint, TypeScript, Docker Compose validation, and the production build.

## Non-Goals

- No deployment.
- No backend or database changes.
- No new Facebook or Instagram permissions.
- No new public resource pages.
- No mobile nested mega menus.
- No analytics or workspace metrics beyond existing connection and member counts.
