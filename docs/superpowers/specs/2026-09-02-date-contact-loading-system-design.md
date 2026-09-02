# Date, Contact Identity, and Loading System Design

## Objective

Make Linkar's workspace and admin interfaces feel coherent while loading, display chronological data consistently, and ensure an Inbox conversation opens with the same resolved Instagram identity shown in the activity list.

## Confirmed problems

- The Insights chart deliberately blanks every second x-axis label, making the date sequence appear incomplete.
- Contact lists are ordered by record update time rather than the user-facing `lastSeenAt` value.
- The Inbox activity endpoint resolves an Instagram username, but the contact-detail endpoint does not return it; the modal falls back to the last six characters of an internal contact id.
- Historical contact reconciliation creates a contact at reconciliation time while assigning an older `lastSeenAt`, so “First seen” can appear later than “Last seen.”
- Route and client loading states use different shapes, spacing, shells, and animation treatments. Several are generic large gray rectangles that do not match the loaded page.

## Product scope

The system covers all authenticated workspace screens and all `/admin` screens. Public authentication and legal pages retain the lightweight root loader because they do not use the workspace or admin application shells.

## Date behavior

- Insights combines reply and reach series by ISO day, sorts them ascending, and displays a continuous chronological sequence.
- Desktop shows every day label in the 14-day window. Narrow layouts reduce visible labels with CSS while retaining every date in the DOM and in accessible chart descriptions.
- Contact ordering uses `lastSeenAt` descending with stable id ordering.
- User-facing date-time strings use a shared compact format such as `2 Sep, 13:37`.
- Reconciled contacts preserve the earliest known interaction as `createdAt`; `lastSeenAt` never moves backward when an older event is reconciled.

## Inbox identity behavior

- The contact-detail endpoint resolves the Instagram username from the same identity tuple used by the activity and contacts endpoints.
- The modal displays `@username` first, then email, and only then a neutral “Instagram contact” fallback. It never presents an internal database id as a username.
- Clicking any Instagram activity with a contact id opens a labeled dialog with matching identity and timeline content.

## Loading architecture

`src/components/skeleton.tsx` owns small structural primitives and named screen compositions. Route `loading.tsx` files only choose the correct composition. Client-side fetch states reuse the content portion of the same composition rather than separate `loading-line` placeholders.

The primitive vocabulary is:

- application shell frame: workspace or admin chrome;
- page header: eyebrow/title/lede/actions;
- toolbar: search and filters;
- metric strip;
- chart plot;
- list/table rows;
- form or settings groups.

Each screen composes only the shapes that correspond to its loaded layout. Skeleton blocks use one restrained neutral shimmer, consistent spacing and radius tokens, no dark feature panels, no decorative separators, and no arbitrary full-card slabs.

## Visual direction

- Canvas: `#FAFAF8`
- Surface: `#FFFFFF`
- Ink: `#17171C`
- Muted text: `#6F7079`
- Subtle border: `#E7E3DA`
- Linkar accent: `#F000E8`

The existing typography remains in place. Alignment is left-led and follows the real page grid. Motion is limited to the shimmer and is disabled under `prefers-reduced-motion`.

## Accessibility and resilience

- Loading regions expose `aria-busy="true"` and a useful accessible name.
- Decorative skeleton blocks remain hidden from assistive technology.
- Loading compositions do not introduce focusable elements.
- Existing error and empty states remain distinct from loading states.
- Route loaders follow Next.js 16 `loading.tsx` behavior and remain lightweight Server Components.

## Verification

- Component tests cover complete sorted chart labels, modal identity, click-through behavior, and page-shaped client loaders.
- API/repository tests cover username resolution, chronological contact ordering, and historical reconciliation timestamps.
- Skeleton tests cover workspace/admin shells, screen composition landmarks, and reduced decorative separators.
- Lint, typecheck, relevant test files, full tests, and local Brave visual checks must pass.
- No deployment is part of this work.
