# Linkar marketing behavior contract

## Interaction ownership

The exact interaction models are:

- **Header direction/hero threshold is scroll-driven.**
- **Reveal regions are intersection-driven.**
- **The Volt story is scroll-driven on desktop and document-flow on mobile.**
- **Gallery is click-driven desktop/accordion mobile.**
- **FAQ and mobile menu are click/keyboard-driven.**
- **Reduced motion disables all nonessential transforms.**

These are separate behaviors. A click must not stand in for scroll progress, and scroll position must not change accordion selection.

## Shared motion values

| Token | Exact value | Use |
|---|---|---|
| Snap easing | `cubic-bezier(.43,.195,.02,1)` | CTA rolls, chapter scene transitions, purposeful state changes |
| Entrance easing | `cubic-bezier(.22,.61,.21,1)` | Intersection reveals and gentle opacity transitions |
| Reveal duration | `600–750ms` | Ordinary reveal regions |
| Control duration | `220–450ms` | Buttons, menus, accordions, and selected-state changes |
| Reveal travel | `48–56px` | Manifesto and standard vertical entrances |

Animation styles are expressed with CSS custom properties. No component writes layout-affecting properties every frame.

## Header scroll controller

One client controller, throttled by `requestAnimationFrame`, reads scroll position and direction.

- Initial state: `hero`, transparent, visible, light foreground.
- When the hero bottom crosses the header threshold: `solid`, Canvas background, Ink foreground.
- After the hero, a downward delta greater than `8px` while the page is more than `96px` beyond the threshold sets `hidden`.
- Any upward delta greater than `4px` sets `visible`.
- Within `24px` of the page top, restore `hero` and `visible` regardless of the previous direction.
- The controller never hides the header while the mobile menu is open or while keyboard focus is inside the header.
- Cleanup cancels the pending animation frame and removes the scroll listener.

## Intersection reveals

The shared `use-reveal.ts` client utility owns ordinary entrance observation.

- Default observer: `threshold: 0.18`, `rootMargin: "0px 0px -10% 0px"`.
- Regions render readable at the server boundary; enhancement adds the pre-reveal state only after JavaScript and observer support are confirmed.
- A region reveals once and is unobserved immediately after activation.
- Default transition: opacity `0 → 1`, translateY `56px → 0`, `700ms`, entrance easing.
- Child staggering is CSS-only and capped at `80ms` increments; content order remains logical without motion.
- Cleanup disconnects the observer.

## Volt story progress

At `>= 1024px`, a single requestAnimationFrame-throttled scroll controller computes normalized story progress from the story bounds. Four chapter activation bands map to indices `0–3`; the active copy and product scene use that index. The component writes progress and index custom properties, not inline geometry.

At `768px–1023px`, the story uses document flow by default: each chapter copy is followed by its corresponding scene, avoiding an undersized sticky stage. At `<= 767px`, this document-flow behavior is mandatory.

Server rendering exposes all four chapters. If scripting fails, the document-flow fallback remains useful at every width.

## Workflow gallery

Desktop (`>= 768px`) uses one selected item at a time. Buttons update the selected id on click, move `aria-selected`, and reveal the matching panel. Arrow Up/Down, Home, and End move selection and focus within the list. Panels stay in the DOM only when their content is visible to assistive technology.

Mobile (`<= 767px`) renders the same items as accordions. Each trigger is a button with `aria-expanded` and `aria-controls`; clicking the open item leaves it open so one useful example is always visible. Enter and Space use native button behavior.

## FAQ and mobile menu

FAQ rows use native buttons. Each button controls a uniquely identified answer region with `aria-expanded` and `aria-controls`. Multiple answers may be open because questions are independent. Enter and Space toggle through native semantics.

The mobile menu opens only from its labelled button. Opening it moves focus to the close button, prevents background scrolling, and marks the sheet as a modal dialog. Tab and Shift+Tab remain inside. Escape closes it and returns focus to the opener. Selecting any menu link also closes it. Cleanup restores page scrolling.

## Focus and hover

- Every interactive element has a visible `2px` focus ring with at least `3px` offset.
- The ring uses Volt on Ink surfaces and Ink on light or magenta surfaces.
- Hover is never the only signal for selected, expanded, or active state.
- Moving regions pause when hovered only when this does not hide content; the proof rail is the only continuous marquee.
- Anchor targets remain visible below the fixed header.

## Reduced motion

When `prefers-reduced-motion: reduce` matches:

- Remove parallax, marquee translation, CTA text rolls, stagger delays, vertical entrance travel, horizontal runway movement, product-scene transforms, and pinned story transitions.
- Render reveal regions immediately at full opacity.
- Render all story chapters in document flow regardless of width.
- Keep gallery and FAQ state changes functional, with at most a brief color or opacity change and no sliding height animation.
- Keep header threshold/color logic but do not animate the header transform; direction-based hiding is disabled so the header remains visible.
- Smooth scrolling is disabled.

Reduced motion preserves hierarchy and all content; it does not substitute blank placeholders.

## Resilience and verification

- Anchor navigation, all primary links, and complete textual content work without JavaScript.
- Observers, media-query listeners, event listeners, scroll locks, and animation frames are cleaned up on unmount.
- Client state initializes to the same visible content emitted by the server to prevent hydration drift.
- Tests cover header threshold/direction, menu Escape and focus return, initial story content, gallery keyboard selection, FAQ semantics, and reduced-motion initial presentation.

