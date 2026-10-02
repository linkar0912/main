# Linkar visual consistency and responsive repair

**Date:** 2026-08-25  
**Status:** Approved direction  
**Scope:** Authenticated Linkar workspace UI

## Purpose

Make every authenticated screen feel like one product and remain usable from a 390px phone through a wide desktop. This pass fixes the visual defects observed in the live deployment and the supplied screenshots without changing automation, messaging, authentication, or account behavior.

The existing Volt identity remains: confident black typography, a white canvas, compact utility labels, and a bright brand signature. The repair disciplines that identity into one semantic color system, one spacing rhythm, and reusable responsive patterns.

## Evidence from the live audit

The audit covered Home, Automations, Sequences, Broadcasts, Settings, Profile, Help, the new/edit automation builders, and Campaign Activity at 1440px, 768px, and 390px.

Confirmed defects:

- Automations and Campaign Activity overflow horizontally at 390px.
- Settings compresses connection copy into an unreadable column because a full-width action remains in a desktop flex row.
- Automation management controls are pushed off-screen and use 32px targets.
- Builder progress removes every step label below 860px.
- Several navigation, icon, link, and form controls are below a comfortable touch size.
- Shared `.panel` margins, padding, and parent grid gaps compound into excessive whitespace on Profile, Settings, and Help.
- Sequence actions are visually split: “Add step” sits at the left while the primary submit action is isolated at the far right.
- Builder helper copy collides with “Add variation” instead of forming a clear action-and-note group.
- The dashboard chart removes the visual track for zero days, making the few active days appear attached to the final metric rather than part of a 14-day series.
- Decorative orange, purple, magenta, yellow, and green compete without stable semantic roles.

## Design system

### Color roles

Existing tokens will be consolidated by role rather than expanded with route-specific colors.

- **Ink (`#17181d`)**: primary text, primary buttons, completed progress.
- **Paper (`#ffffff`)**: canvas and raised surfaces.
- **Bone (`#f7f6ef`)**: quiet fills, chart field, hover and empty states.
- **Line (`#e7e5dc`)**: borders and structural dividers.
- **Volt (`#fff100`)**: current navigation and rare brand-signature moments only.
- **Magenta (`#fa0cf7`)**: focus, selected in-content controls, and the primary chart series. Darker magenta remains the accessible text treatment on pale surfaces.
- **Green, amber, red**: success, warning, and danger only.

Purple and orange stop acting as arbitrary component accents. The secondary chart series uses a neutral ink tint, while the Popular badge uses Volt with ink text. Dark mode uses the same semantic roles on graphite surfaces.

### Typography and control hierarchy

The existing Bricolage Grotesque, Manrope, and JetBrains Mono roles remain. Headings use the display face, body copy uses Manrope, and compact actions/data labels use the mono face.

Primary actions remain ink-filled pills. Secondary actions remain outlined. Text links are reserved for low-emphasis navigation. Icon-only controls receive at least a 40px desktop target and 44px mobile target, with visible focus states.

### Spacing and surfaces

The page gutter remains responsive, but vertical rhythm moves to explicit stacks:

- 8px for tightly related text.
- 16px inside control groups.
- 24px between related sections.
- 40px between major page regions.

Panels inside a grid or stack will not also contribute an independent bottom margin. Cards are used only where containment matters; otherwise a section heading and divider provide structure. This removes the large empty bands visible on Profile and Settings.

## Component repairs

### App shell and shared controls

- Preserve the desktop sidebar and mobile drawer.
- Increase the mobile menu control and standalone navigation targets to 44px.
- Normalize fields to a 44px minimum height.
- Add shared action-row and helper-note patterns so buttons and supporting copy never compete on one baseline.
- Make footer/policy links comfortable touch targets on narrow screens.

### Home

- Keep the three quick-start cards and headline hierarchy.
- Restyle Popular as a Volt badge instead of an unrelated orange badge.
- Render the 14-day chart inside one continuous full-width plot field with a baseline/grid treatment. Zero days remain legible without individual empty card tracks.
- Use magenta for replies and an ink tint for people reached.

### Automations

- Wrap row management controls in a dedicated action group.
- On mobile, place controls on a second row while keeping the name, status, and summary readable.
- Prevent summary text or actions from establishing an intrinsic width wider than the viewport.
- Give icon actions compliant targets without changing their behavior.

### Sequences and Broadcasts

- Keep the existing forms and API behavior.
- Group Add step, cancel, and submit controls in one footer row; stack them predictably on mobile.
- Normalize empty-state and list spacing.
- Ensure move/remove step controls meet target-size requirements.

### Automation builders

- Keep the step-by-step rendering and preview behavior.
- Make wizard progress horizontally scrollable with visible labels on mobile instead of unlabeled numbered dots.
- Stack “Add variation” with its explanation using the shared helper-note pattern.
- Normalize step marker colors to magenta for active/action and neutral ink/bone for structural or guardrail steps.
- Preserve the desktop preview column and collapse it cleanly below the current breakpoint.

### Campaign Activity

- Constrain media/caption containers so nowrap text cannot expand the page.
- Keep the responsive funnel, toolbar, journey, diagnostics, and side panels.
- Ensure filters and tools wrap without overflow and card metadata stays within each card.
- Preserve all participants and filtering behavior; this pass does not change API pagination.

### Settings

- Reflow the connection hero into a vertical mobile composition with full-width action placement.
- Remove compounded panel spacing inside settings grids.
- Keep status colors semantic and align connection/member controls consistently.
- Stack invitation fields and policy links with usable targets on mobile.

### Profile and Help

- Remove compounded margins between profile summary, security, and side cards.
- Keep the profile’s two-column desktop structure and single-column responsive structure.
- Use consistent card padding and divider rhythm.
- Retain Help’s distinctive hero, but align its magenta gradient with the same accent tokens and normalize FAQ/footer spacing.

## Accessibility and interaction

- Preserve semantic labels and keyboard behavior.
- Maintain visible `:focus-visible` treatment on every interactive control.
- Respect `prefers-reduced-motion` through the existing global rule.
- Avoid horizontal document scrolling at 390px, 768px, and desktop widths.
- Keep text contrast at WCAG AA levels by using the darker accent token for magenta text on pale backgrounds.

## Testing strategy

Implementation follows test-driven development.

1. Add or extend component tests for new semantic wrappers and stable action/helper grouping.
2. Extend Playwright layout coverage at 1440×1000, 768×900, and 390×844.
3. Assert that each authenticated route has no horizontal document overflow.
4. Assert mobile automation actions and activity captions remain inside the viewport.
5. Assert Settings’ connection copy retains a practical width and the action reflows below it.
6. Assert the chart plot occupies the available content width and uses the intended series tokens.
7. Assert Profile section gaps stay within the new rhythm and builder progress retains visible labels on mobile.
8. Run unit tests, lint, typecheck, build, and authenticated browser verification in light and dark themes.

## Files expected to change

- `app/globals.css`
- `src/components/automation-list.tsx`
- `src/components/automation-builder.tsx`
- `src/components/sequences-screen.tsx`
- `src/components/dashboard-screen.tsx`
- Focused component and Playwright tests under `src/components/` and `e2e/`

Markup changes remain presentational and local. No database schema, API contract, authentication flow, or automation execution logic changes are part of this work.

## Acceptance criteria

- All audited authenticated routes render without horizontal document scrolling at the three target widths.
- The supplied desktop flaws are visibly corrected: coherent sequence actions, separated builder helper copy, compact Profile spacing, and a balanced full-width chart.
- Settings remains readable and operable on a 390px viewport.
- Color communicates stable roles across every route and both themes.
- All primary and standalone mobile actions have at least a 44px target.
- Existing behavioral tests continue to pass, and new layout regressions are covered by automated checks.
