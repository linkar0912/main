# Meta App Review Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce truthful, permission-specific evidence for Linkar's live Instagram and Facebook workflows and submit the existing Meta app for review.

**Architecture:** Treat the deployed application, Meta configuration, connected test accounts, and reviewer form as four independent readiness gates. Capture recordings only after the live end-to-end behavior passes, then attach each recording to the matching permission request and verify the final submission summary before sending it.

**Tech Stack:** Linkar production app, Meta for Developers dashboard, Brave Browser, macOS screen recording, Meta Graph API health endpoints

**Spec:** `docs/meta-app-review.md`

## Global Constraints

- Use only the permissions implemented by Linkar and visible in the current Meta dashboard.
- Never display or record access tokens, app secrets, passwords, or private environment values.
- Use real test accounts and real live callbacks; do not simulate reviewer evidence.
- Keep Facebook Page public-comment evidence separate from Instagram private-reply evidence.
- Do not request Facebook Messenger permissions because customer Facebook Messenger delivery is not enabled.

---

### Task 1: Audit production and Meta readiness

**Files:**
- Read: `docs/meta-app-review.md`
- Read: `src/lib/meta/oauth.ts`
- Read: `src/lib/facebook/oauth.ts`

**Interfaces:**
- Consumes: production health and connection-health endpoints, current Meta dashboard configuration
- Produces: a pass/fail checklist for legal URLs, callbacks, scopes, webhook fields, reviewer accounts, and live test content

- [ ] Verify production health and the deployed release.
- [ ] Verify privacy, terms, data-deletion, and support pages without authentication.
- [ ] Inspect the current Meta app, its products, requested permissions, and review status.
- [ ] Verify Instagram and Facebook connection health in Linkar Settings.
- [ ] Confirm the connected professional account, test commenter account, Facebook Page, public test posts, and reviewer login path exist.

### Task 2: Rehearse the Instagram review path

**Files:**
- Read: `docs/meta-app-review.md`

**Interfaces:**
- Consumes: connected Instagram Professional account and second Instagram test account
- Produces: one verified follow-gated Reel run with a single final delivery

- [ ] Create or select the `guide` Reel automation in production.
- [ ] Confirm the opening message, opt-in action, false-follow prompt, recheck action, and final link are reviewer-safe.
- [ ] Run the flow from the second test account while initially not following.
- [ ] Confirm the link is delivered only after the follow check and only once.

### Task 3: Rehearse the Facebook Page review path

**Files:**
- Read: `docs/meta-app-review.md`

**Interfaces:**
- Consumes: connected Facebook Page and separate Facebook commenter account
- Produces: one verified top-level Page-comment reply with loop-prevention evidence

- [ ] Create or select an active Facebook Page-comment automation.
- [ ] Trigger it from the separate account on a public Page post.
- [ ] Confirm exactly one nested public reply is created.
- [ ] Confirm Page-authored and nested comments do not trigger reply loops.

### Task 4: Capture and verify review recordings

**Files:**
- Create locally: review-ready `.mov` or `.mp4` evidence files outside the repository

**Interfaces:**
- Consumes: the rehearsed Instagram and Facebook workflows
- Produces: recordings that show the exact UI steps associated with each requested permission

- [ ] Record the Instagram connection, automation setup, trigger, opt-in, follow check, and one-time delivery without exposing credentials.
- [ ] Record Facebook Page selection, automation setup, top-level comment, public reply, and loop-prevention behavior.
- [ ] Replay each file and verify legibility, continuity, audio/privacy, and absence of secrets.

### Task 5: Prepare and submit the Meta review

**Files:**
- Read: `docs/meta-app-review.md`

**Interfaces:**
- Consumes: verified recordings, reviewer instructions, credentials, and current permission list
- Produces: a submitted Meta App Review request with a saved submission identifier/status

- [ ] Attach each recording to the matching Instagram or Facebook permission request.
- [ ] Enter the production URL, reviewer login path, exact trigger phrase, button labels, and expected message sequence.
- [ ] Confirm the final request includes only implemented permissions and no Facebook Messenger claim.
- [ ] Review the final summary for accuracy, then submit and record the resulting status.
