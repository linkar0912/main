# Plain-Language Product Copy Design

## Goal

Make Linkar understandable to someone who knows Instagram or Facebook but does not know automation, webhook, CRM, funnel, trigger, delivery, or provider terminology.

## Audience and Voice

The primary reader is a creator or small-business owner trying to answer comments and messages automatically. Copy uses familiar channel actions, short active sentences, and the words people see inside Instagram and Facebook.

Linkar’s voice is calm, direct, and helpful. It explains what will happen and what the person should do next. It does not expose internal architecture unless a support or operator screen requires it.

## Vocabulary Rules

Use the user-facing term on customer surfaces:

| Internal term | Customer-facing term |
| --- | --- |
| automation | automatic reply, except in navigation where Automations remains the product category |
| trigger | when this happens |
| action | Linkar will do this |
| automation surface | works with |
| provider | Instagram, Facebook, email, or the named service |
| delivery | message or reply |
| participant/recipient | person |
| payload | information |
| webhook | connected app or instant update, unless shown in advanced support diagnostics |
| funnel | journey |
| opt-in | asks permission / agreed to receive the message |
| tracked link | link with click counting |
| workspace | team account when the distinction matters; otherwise omit it |

Navigation labels that people learn as product nouns—Home, Automations, Quick Automation, Insights, Contacts, Inbox, Settings, and My Profile—remain stable.

## Template Naming

Template names describe the customer outcome first. Descriptions explain the moment that starts it and the reply that follows. Internal chains such as “Comment keyword → public reply → DM opt-in → follow check” are removed from the gallery and replaced with one plain sentence.

Examples:

- “Follow-gated Reel campaign” becomes “Send a link after someone follows you.”
- “Auto-DM links from comments” becomes “Send a link when someone comments.”
- “Default reply” becomes “Reply to every new message.”
- “Story mention reply” becomes “Thank people who mention you in a Story.”

The builder may show a quiet “How it works” summary using natural steps, but it does not show implementation labels as primary copy.

## Screen Audit

The audit covers every customer-facing string in the marketing site, authentication, Home, Automations, Quick Automation, builder, previews, activity, Insights, Contacts, Inbox, Settings, Billing, My Profile, Help, empty states, loading states, validation, and error messages.

Admin/operator language remains precise because its audience needs operational terms, but labels are expanded where abbreviations or implementation names are unclear.

## Copy Patterns

- Buttons state the result: “Save reply,” “Connect Instagram,” “Apply invite,” “Turn on automatic replies.”
- Form labels ask for familiar information: “What should Linkar look for?” and “What should Linkar send?”
- Supporting text gives one concrete example when the field is unfamiliar.
- Errors state what happened and the next step without blaming the person.
- Empty states explain the benefit and offer one action.
- Success feedback repeats the action’s button vocabulary.
- Technical detail is placed behind “View details” only when it helps support or diagnosis.

## Consistency Mechanism

Create a small copy module for repeated navigation names, common actions, statuses, and provider labels. Template metadata owns each template’s display name, one-sentence description, and plain “How it works” steps. Copy is not assembled from fragments that create awkward grammar.

## Accessibility and International Readiness

Copy remains meaningful without color or icons, avoids idioms, uses sentence case, and keeps instructions separate from placeholders. Accessible names describe the action, not the icon. The pass does not add localization, but avoids structures that would prevent it later.

## Testing and Review

- repository scan for banned customer-facing terms, with allowlists for code, tests, operator diagnostics, and legal text;
- template metadata tests ensuring every template has a clear name, description, and steps;
- interaction tests updated to assert outcome-based labels;
- manual first-time-user walkthrough from signup to an active reply;
- marketing and app screenshots reviewed at mobile and desktop widths to catch truncation caused by new copy;
- final read-through by a non-technical person or an equivalent moderated usability pass.

## Non-Goals

This workstream does not rename database fields, API contracts, source-code types, legal terminology that must remain exact, or the Automations navigation category.

