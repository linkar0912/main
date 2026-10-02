# WorkflowGallery implementation contract

## Target paths

- TSX: `src/components/marketing/workflow-gallery.tsx`
- CSS: `src/components/marketing/workflow-gallery.module.css`
- Test: `src/components/marketing/workflow-gallery.test.tsx`

This is a client component because desktop selection and mobile expansion are click/keyboard-driven. Its server state selects the first workflow and renders useful matching content.

## Original Linkar copy

- H2: “Build the path your audience actually needs.”
- Intro: “Start with a real moment, then decide what Linkar should remember, send, or hand back.”

| Id / label | Description | Builder preview nodes |
|---|---|---|
| `guide-delivery` / Guide delivery | “Send the right resource, then ask what the person wants to solve.” | Keyword trigger → Send guide → Ask goal |
| `lead-qualifier` / Lead qualifier | “Capture one useful answer before deciding the next branch.” | DM phrase → Ask question → Save answer → Branch |
| `timed-nurture` / Timed nurture | “Return with a relevant check-in while the conversation remains active.” | Reply received → Wait 18 hours → Send check-in |
| `human-handoff` / Human handoff | “Pause when nuance or intent calls for a person, with context intact.” | Intent signal → Pause flow → Add to queue |

Preview chrome labels: “Flow canvas”, “Live logic”, and selected workflow title. These are Linkar UI concepts, not a copied interface.

## Semantic DOM hierarchy

```text
section#workflows[aria-labelledby="gallery-title"]
├─ header
│  ├─ h2#gallery-title
│  └─ p
└─ div
   ├─ div[role="tablist"][aria-label="Workflow examples"][aria-orientation="vertical"] (desktop)
   │  └─ button[role="tab"][aria-selected][aria-controls] × 4
   ├─ div (desktop panel stage)
   │  └─ div[role="tabpanel"][aria-labelledby]
   │     └─ figure (semantic React builder preview + figcaption)
   └─ div (mobile accordion)
      └─ section × 4
         ├─ h3 > button[aria-expanded][aria-controls]
         └─ div (answer/panel) > p + figure
```

Desktop tab UI is hidden from the accessibility tree on mobile; the accordion is hidden on desktop. There is one accessible representation at a time.

## Exact layout

- Desktop `>= 1024px`: Canvas section, padding `clamp(120px, 11vw, 176px) clamp(32px, 4.45vw, 72px)`; header max width `980px`; gallery margin-top `72px`, 12-column grid. Tablist spans columns `1–4`; stage spans `5–12`; gap `56px`; each tab is full width, minimum height `92px`; stage aspect ratio `1.32 / 1`, minimum height `600px`.
- Tablet `768px–1023px`: padding `112px 32px`; gallery is `280px minmax(0, 1fr)` with `32px` gap; stage minimum height `520px`; labels may wrap to two lines.
- Mobile `<= 767px`: padding `88px 20px`; desktop tab/stage hidden; accordion one column; trigger minimum height `76px`; panel padding `0 0 32px`; preview aspect ratio auto, minimum height `360px`; rows separated by `1px` Ink at `16%`.

## Visual values

- Canvas `#ffffff` surface, Ink `#050505` type, Bone `#f7f6ef` stage.
- Selected desktop tab: Signal magenta `#fa0cf7` left bar `6px` and Ink text; inactive labels use Ink at `58%`.
- Builder frame: Ink, radius `28px`, padding `20px`; nodes use Canvas and Bone; active connector uses Volt `#fff100`.
- H2 uses display maximum; tabs and node labels use `--font-mono`; descriptions use `--font-sans`.

## State transitions

Initial selected id is `guide-delivery`. Desktop click or keyboard selection updates the visible panel. The outgoing panel fades to `0` and moves `16px`; the incoming panel fades to `1` at rest over `360ms cubic-bezier(.43,.195,.02,1)`. Node connector drawing follows within `450ms`. Content data, not imperative DOM mutation, drives the preview.

Desktop keyboard behavior follows tabs: Arrow Down/Right selects next, Arrow Up/Left selects previous, Home selects first, End selects last, wrapping at ends. Selection and focus move together.

On mobile, the first accordion is initially open. Clicking a closed item opens it and closes the previous item; clicking the open item leaves it open, ensuring one useful preview is always visible. Native Enter/Space behavior activates triggers.

## Assets

N/A for image media. Builder frames, nodes, ports, connector paths, and icons are locally authored React/CSS/SVG. No external URL, embedded logo, or copied application frame is allowed.

## Focus behavior

Tab and accordion triggers use a visible `2px` Ink ring with `3px` offset. Focus never moves into the panel on selection. When the responsive mode changes, preserve the selected workflow id and do not strand focus in a hidden subtree.

## Reduced motion

Keep click and keyboard selection. Replace panel motion and connector drawing with immediate content replacement; selected content is always visible. Mobile panels open without height sliding. No state or copy is removed.

## Test contract

Assert exact four workflows, first initial selection, click selection, tab roles/relationships, full arrow/Home/End behavior, mobile accordion relationships and one-open invariant, selected content under reduced motion, and locally rendered preview nodes.
