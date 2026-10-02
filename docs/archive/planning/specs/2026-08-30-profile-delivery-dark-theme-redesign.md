# Profile, Delivery, and Dark Theme Redesign

## Goal

Give Linkar one coherent account and theme system across My Profile, Workspace settings, and the public marketing site. The redesign improves information hierarchy, removes repeated decorative accent strips, and guarantees readable text on every dark, yellow, and magenta surface without changing account, channel, delivery, or authentication behavior.

## Scope

This project includes four connected improvements:

1. Redesign My Profile as a compact account workspace.
2. Redesign the Delivery section in Workspace settings around the quiet-hours task.
3. Remove repeated yellow, magenta, and dark decorative strips from Settings cards.
4. Add a complete dark theme to the marketing page and correct contrast throughout the application.

The work is presentation-only. Existing APIs, form actions, OAuth flows, channel data, messaging settings, validation rules, and persistence remain unchanged.

## Shared Visual Direction

Linkar keeps its current typography and brand identity:

- Bricolage Grotesque for page, section, and card headings.
- Manrope for body copy and controls.
- JetBrains Mono for labels, metadata, and compact actions.
- Volt yellow and Linkar magenta remain signature colors, not general-purpose backgrounds.

The interface uses hierarchy created by spacing, neutral borders, surface elevation, and grouping. Decorative top strips are removed. Accent color appears only where it communicates interaction, state, or brand identity.

### Theme Palette

Light mode continues to use white and neutral gray surfaces. Dark mode uses:

- Night canvas: `#101116`
- Graphite panel: `#1c1d24`
- Raised surface: `#25262e`
- Primary text: `#f4f4f5`
- Volt yellow: `#fff100`
- Linkar magenta: `#fa0cf7`

Two semantic foreground roles are required:

- `on-accent`: dark ink for text and icons placed on magenta.
- `on-volt`: dark ink for text and icons placed on yellow.

Accent-colored text on neutral dark surfaces uses a lighter readable magenta role rather than the darker hover color used in light mode.

## My Profile Information Architecture

My Profile becomes a three-level account workspace.

### Account Overview

A single compact overview card spans the content width. It contains:

- Avatar, display name, email address, and membership date.
- Role, plan, and email verification as structured account facts.
- Verification guidance and resend action when the email is not verified.

The facts use aligned labels and values instead of a loose row of colored chips. Verification may use a status icon, but no item uses a decorative colored strip.

### Primary and Supporting Content

Below the overview, the desktop layout uses a two-column grid:

- Main column: Password and sessions.
- Supporting column: Connected channels followed by Workspace links.

The security card retains both password change and sign-out-everywhere actions. The two operations are separated by a neutral divider and keep their existing form submissions.

Connected channels displays Instagram and Facebook as separate compact rows with brand marks, status, and connection date when available. The primary action remains Connect a channel or Manage channels.

Workspace links retains Team and invitations, Help centre, Privacy policy, and Data deletion.

On narrow screens, the account overview and all cards stack in reading order. Actions become full-width only where needed. Long email addresses and channel identifiers wrap without overflow.

## Delivery Settings Information Architecture

Delivery uses a task-focused two-column layout on wide screens.

### Quiet Hours Configuration

The main card contains:

- A clear section heading and concise behavior description.
- An explicit enabled or disabled status beside the quiet-hours control.
- Start time, end time, and timezone grouped as one scheduling field set when enabled.
- Validation or save feedback adjacent to the configuration.
- A save action anchored to the card footer.

Direct replies remain explicitly described as never delayed. Existing loading, validation, and save behavior remain unchanged.

### Operational Context

A supporting column stacks two neutral cards:

- Protected by default: the existing data-handling guarantees.
- Environment: Demo mode or Connected mode with the existing setup guidance link.

The support cards are visually secondary to quiet-hours configuration and have no accent strips.

On tablet and mobile, the supporting column moves below the main configuration card. Time fields stack when space is limited.

## Settings Decoration Cleanup

Remove the following decorative treatments:

- Yellow top border on the workspace summary introduction.
- Magenta top border on the Instagram connection card.
- Dark top border on the Facebook Page card.
- Any repeated card stripe introduced only for decoration.

The workspace summary remains a compact neutral status surface. Instagram and Facebook remain distinguishable through their official transparent brand marks, labels, and content.

## Application Contrast Contract

Every filled brand surface must use an explicit foreground role:

- Magenta buttons, active indices, status labels, chips, and preview controls use `on-accent`.
- Yellow navigation items, plan tags, badges, and highlights use `on-volt`.
- Dark ink buttons in dark mode use a dark foreground only when the ink token resolves to a light fill.
- Accent text on dark neutral surfaces uses the readable dark-theme accent text token.

The contrast pass covers workspace navigation, profile chips, settings tabs, buttons, badges, status labels, automation builder controls, Instagram previews, help controls, and any other component using magenta or yellow as a fill.

Official Instagram and Facebook glyph colors are not replaced by theme colors. Their surrounding surfaces remain neutral and readable.

## Marketing Dark Theme Architecture

The marketing page stops forcing a light color scheme. Its root exposes semantic marketing theme roles consumed by every section:

- Canvas
- Raised canvas
- Panel
- Inverse panel
- Primary text
- Muted text
- Border
- Overlay
- On-accent
- On-volt

Light mode maps these roles to the current white editorial design. Dark mode maps them to Night, Graphite, and Raised surfaces.

### Header and Navigation

- The transparent hero header remains readable over the hero image.
- The solid scrolled header uses the current theme surface and border.
- Solutions and Resources panels use the current theme panel, text, muted text, and dividers.
- The backdrop remains dark and translucent.
- Get Started, Sign In, language, and theme controls keep visible focus and hover states.
- The mobile menu uses the same dark-theme roles and remains readable in both stored themes.

Header surface detection continues to control whether hero content needs a light or dark foreground. Theme mode and section tone work together rather than overriding each other with hard-coded colors.

### Marketing Sections

- Hero: retains its photographic dark treatment in both themes.
- Proof rail: white in light mode and Graphite in dark mode.
- Manifesto and workflow sections: alternate Canvas and Raised canvas.
- Automation story: keeps the yellow chapter surface; embedded cards and simulations adapt where they are not intentionally self-contained.
- Supported channels: remains yellow in both modes with dark text and white logo holders.
- Surface runway, comparison, workflow gallery, and setup: use theme surfaces and borders.
- FAQ: retains its inverse dark treatment.
- Final CTA: uses a dark-theme violet surface that preserves readable text and magenta actions.
- Footer: retains its dark treatment and remains visually connected to the dark marketing mode.

Self-contained Instagram, Facebook, phone, and workflow simulations may preserve fixed colors when those colors represent the external interface being previewed. Their surrounding explanatory cards still adapt to the theme.

## Theme Persistence

The existing theme toggle and `linkar-theme` storage key remain authoritative. The root layout continues applying the stored theme before first paint. No new theme provider or dependency is introduced.

Changing theme on the marketing page updates the header and every section immediately. Navigating to auth, legal, profile, or workspace pages preserves the same theme.

## Accessibility

- Text and meaningful icons target WCAG AA contrast for normal text.
- Yellow and magenta fills always use dark foregrounds.
- Focus indicators remain visible on neutral, yellow, magenta, image, and dark surfaces.
- Theme controls retain descriptive accessible names.
- Profile sections and Delivery sections use semantic headings and labelled regions.
- Existing settings tabs retain accurate `aria-pressed` states.
- Motion and smooth scrolling continue respecting `prefers-reduced-motion`.

## Responsive Behavior

- Profile uses a wide overview plus main and supporting columns on desktop, then one column below the existing content breakpoint.
- Delivery uses a main configuration column plus a supporting context column on desktop, then one column on tablet and mobile.
- Marketing themes do not change layout breakpoints.
- No themed surface may create horizontal overflow at 375px.

## Testing

Regression tests are written before implementation and prove:

- Profile renders a compact account overview with structured facts and separates Security, Connected channels, and Workspace links into their intended regions.
- Existing role, verification, Instagram, Facebook, password, and sign-out behavior remains present.
- Delivery renders quiet-hours configuration and operational context in distinct regions while preserving the existing inputs and save action.
- Settings cards no longer expose decorative strip classes or pseudo-element contracts.
- Filled accent and volt UI roles use their explicit contrast foreground tokens.
- The marketing root exposes adaptive theme roles rather than forcing light mode.
- Header mega menus and representative marketing sections consume semantic theme roles.
- Existing header navigation, theme toggle, connection, delivery, and profile behavior continues passing.

Visual verification covers desktop and 375px mobile widths in light and dark mode for the marketing home page, My Profile, Settings Connections, and Settings Delivery.

Final verification includes the focused regression tests, full Vitest suite, ESLint, TypeScript, branding validation, production build, and diff validation. Docker Compose validation remains conditional on Docker being available locally.

## Non-Goals

- No deployment.
- No backend, database, authentication, OAuth, or webhook changes.
- No new profile fields or avatar upload.
- No new delivery rules beyond the existing quiet-hours configuration.
- No new theme library or component framework.
- No changes to external Instagram or Facebook interface simulations unless contrast is broken in Linkar-owned controls.
