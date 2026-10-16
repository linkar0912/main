# Can Linkar get a customer's account banned?

Date: 16 October 2026. Code reviewed at commit `e1d9184` (main, the version that is live). Meta's policy pages were read on 16 October 2026. No code was changed for this report.

**Updated the same day, for three reasons.**

- Every claim was checked by independent verifiers, and the wrong or overstated ones were corrected. The appendix "Independent verification" lists every change.
- Fixes for most of the gaps were written after the report, on branch `ban-risk-fixes` (commit `77e8262`). They are **not deployed yet**. Sections 3 and 4 say which gaps they close and what is still open. Until the next deploy, the "today" descriptions apply.
- Checking those fixes found three more gaps, now fixed on branch `inspection-fixes` and also not deployed yet. See "Verification fixes" at the end of section 4.

How to read this report:

- **[Known]** means it was confirmed in the code or on an official Meta page.
- **[Reported]** means users or vendors said it on a forum or blog. It is not verified.
- **[Estimate]** means it is judgement. Meta, ManyChat and the other vendors publish no ban or restriction rates, so every likelihood level below is an estimate.
- **[Unverified]** means it could not be checked.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy** means the code is written and committed but is not live yet.

---

## 1. Bottom line

**Today**, for a typical Linkar user in normal, steady use, the chance that Linkar causes a **permanent** account disable is **very low**, and the chance of a **temporary** comment or DM block is **low**. The realistic risk is a **temporary restriction**, such as being blocked from commenting or from DMing new people. Forum users report these lasting from a few days to about 30 days [Reported]. The risk is concentrated in high-volume bursts on Instagram: typically a viral post where the automation posts many public comment replies, or where thousands of comments each trigger a near-identical DM. "Thousands" is not a threshold: one user reported a 30-day DM block after about 800 DMs.

**Does the bottom line move once the fixes ship?** The levels stay in the same bands. What changes is the size of the viral-post risk and what happens after a block:

- Public replies on a busy post are tapered and then skipped, instead of being queued up and posted for hours afterwards.
- Private replies are capped at 400 an hour per account instead of 750.
- If Meta blocks an Instagram account, Linkar stops sending from it for 24 hours, emails the owners and restarts slowly. Today it keeps trying on every new comment and DM.
- The default link templates send a button first and the link only after a tap.

What stays open after the deploy:

- the follow-gate decision;
- a separate domain for tracked links;
- admin monitoring of which workspaces cause Meta errors;
- a daily cap on public replies (up to 250 an hour is still allowed);
- extending the block pause to Facebook Page replies.

These levels rest on three things:

1. **Linkar is an official-API tool.**
   - It uses Meta's own login (Instagram Login and Facebook Login) and the Graph API.
   - It never asks for the customer's Instagram or Facebook password. Customers only set a password for their Linkar account.
   - It does no scraping and uses no message tags.
   - It only messages people who reached out first: by commenting, sending a DM, replying to or mentioning the account in a Story, or tapping an ig.me link, a button or an opt-in. On Facebook Pages it sends no DMs at all, only public replies to comments.
   - So it avoids behaviours that Meta names, in separate documents, as grounds for action: password-sharing growth apps (Instagram, 2018), scraping (Meta's lawsuits and terms), messaging without consent (Developer Policies section 5) and misuse of message tags (Messenger policy, where the penalty is a messaging restriction). Meta publishes no single list of causes of third-party-app bans. Grouping them is this report's own summary.
2. **The code has a safeguard for each of Meta's main messaging rules, with known gaps.** Those rules are the 24-hour window, one private reply per comment, and honouring opt-outs. Linkar also sets its own per-account send ceilings. Only the 750 private replies an hour figure comes from Meta; the 250 DM and 250 public reply ceilings are Linkar's choice. The gaps are listed in section 3 (D, E, G, H and J), and most are fixed on the branch.
3. **Official tools still trip Meta's spam systems.** ManyChat describes itself as an official Meta Business Partner on Meta's APIs. Its users still report restrictions after viral spikes, mostly 30-day DM blocks, and comment blocks after sustained public replies [Reported]. No user gives their actual send rate. ManyChat staff say ManyChat spaces its sends to stay within Meta's rate limits, so these blocks probably came from Meta's spam scoring, not from breaking a published limit [Estimate]. An official tool lowers the risk but does not remove it.

Meta also makes mistakes with no tool involved. In June 2025 many users reported mass bans. Meta admitted a technical error only for some Facebook Groups and did not confirm errors for individual accounts [Known for Groups, Reported for accounts]. Some bans that customers blame on Linkar will have nothing to do with it.

| Outcome | Today [Estimate] | After the next deploy [Estimate] | What it rests on |
|---|---|---|---|
| Permanent disable caused only by Linkar, in normal use | Very low | Very low | Official API, replies only to people who engaged first, and most of Meta's hard messaging rules enforced in code, with known gaps (E, G, H, J). Meta says it usually disables an account only after repeated warnings and restrictions, although one severe violation can disable it at once. No source verifies a permanent ban caused only by an official-API connection. Several unverified posts in ManyChat thread 10265 (May to Aug 2026) report permanent disables that their authors blame on ManyChat. ManyChat staff relay that Meta told them ManyChat was not the cause. |
| Temporary comment or DM block, in normal use (tens to a few hundred automated replies a day) | Low | Low | Where forum reports give a volume, it is usually high: a viral reel, 800+ DMs, thousands of comment replies. Most reports give no volume at all. One comment block came after about 500 automated public replies a day for a week, with no viral post (thread 251). So a few hundred public replies a day is the top of this band, not safely inside it. The code does not enforce "normal use": plan caps limit monthly volume, but Facebook Page replies do not count toward them. |
| Temporary block during a viral Instagram post with public auto-replies (especially identical ones) or a burst of comment-triggered DMs | Realistic (could happen on any tool) | Realistic, but lower | Several ManyChat forum reports from 2024 to 2026, including 30-day DM blocks after viral reels. Meta's Spam policy targets very high-frequency activity, manual or automated, and allows restrictions at lower volumes when the content is repetitive. A link in the first DM appears only in forum advice, not in a report. No Facebook Page case was found. After the deploy there is no public-reply backlog, private replies are capped at 400 an hour and the link templates are two-step, but up to 250 public replies an hour are still possible. |
| Linkar keeps sending after Meta blocks the account | Yes: every new comment or DM triggers another attempt (gap E) | Instagram: sending stops for 24 hours, owners are emailed, slow restart. Facebook Page replies: not covered yet | Meta does not say whether continued attempts make enforcement worse. Its only guidance for error 368 is to wait and retry. |
| Meta restricts the Linkar app itself | Low likelihood, high impact | Unchanged | Meta's Platform Terms (section 7.e) let Meta suspend or remove an app, or cut specific permissions or features, with or without notice. A full suspension would stop every customer's automations; a narrower action would stop only the affected features. The action against the app does not by itself ban customers' accounts, but a customer whose own sending broke the Spam policy can still be restricted separately. Project notes say App Review is still pending [Unverified] (section L). |
| A ban that has nothing to do with Linkar | Always present, cannot be measured | Unchanged | Meta's own mistakes, such as the Facebook Groups error of June 2025. |

---

## 2. What keeps the risk low today (Linkar's own safeguards)

Everything in this section is **[Known]** from the code that is live now (`e1d9184`). Section 3 says what the branch changes.

| Safeguard | What it means for the customer | Evidence |
|---|---|---|
| **Official API and login only** | Linkar connects through Meta's official login. It never sees the customer's Instagram or Facebook password and does not imitate the Instagram app. | `src/lib/meta/client.ts:161` (graph.instagram.com only, API version pinned at :157); `src/lib/facebook/client.ts:64` (graph.facebook.com). Facebook calls made with an access token carry `appsecret_proof` when `FACEBOOK_APP_SECRET` is set (`client.ts:82`); signing is skipped if the secret is missing (`src/lib/facebook/appsecret-proof.ts:22`), and the two token exchanges send `client_secret` instead (`src/lib/facebook/oauth.ts:110`, `:123`). Webhooks are verified at `app/api/meta/webhook/route.ts:50`. Playwright is only a test tool (`package.json:54`). |
| **Only answers people who engaged first, inside Meta's 24-hour window** | When a broadcast is created, it is queued only for people whose last inbound message (a DM, quick reply, button tap or story mention) arrived in the previous 24 hours, newest first, up to 500 people. The "inactive 7 days / 30 days" segments cannot be created. Sequence steps are at most 23 hours apart, and a sequence is cancelled once the window closes. Broadcasts, follow-ups and sequence steps re-check the window just before sending, but against a looser field (see G). Manual inbox replies are checked against the latest inbound message. The window check treats a missing timestamp as closed. | `src/lib/prisma.ts:3686-3696`; trigger in `prisma/migrations/20260927140000_contact_last_inbound/migration.sql`; `app/api/broadcasts/route.ts:16`, `:26-32`; `src/lib/automation/sequence.ts:14`; `src/lib/automation/sequence-runner.ts:103-111`; `src/lib/automation/followup-runner.ts:108`; `app/api/inbox/[contactId]/route.ts:158-160`; `src/lib/messaging-window.ts:81-108`. |
| **No follow-ups after a comment** | A comment only allows one private reply, so Linkar refuses comment flows that schedule follow-ups. | `src/lib/automation/definition.ts:238`, `:278`. |
| **One private reply per comment** | Linkar does not try to send a second private reply to the same comment, which follows Meta's rule. For comment campaigns, a database key allows one participant per comment on each account, and the opening reply goes out only once. For classic comment flows, only one automation answers each comment, and each automation has its own execution key per comment. Classic flows also refuse a private reply when the comment is more than 7 days old. Campaign opening replies have no such check today (J). | `prisma/schema.prisma:594` (campaigns), `:824`, `:832`; `src/lib/automation/runner.ts:1271-1349`; 7-day check at `runner.ts:177`, `:233-241`. |
| **No message tags** | No DM carries a message tag. Misusing tags is a documented reason Meta restricts messaging. Quick-reply DMs are marked `messaging_type: "RESPONSE"`; all other DMs and private replies send only the recipient and the message. | `src/lib/meta/client.ts:198`, `:219` (quick replies); `:73-148` (all other payloads); no tag field anywhere in `src` or `app`. |
| **Per-account send ceilings** | Default ceilings per Instagram account: 750 private replies an hour (Meta's documented limit), 250 DMs an hour and 250 public comment replies an hour (both set by Linkar). A Facebook Page has only the 250 public-reply ceiling, because Linkar sends nothing else there. Broadcasts may use only 70% of the DM budget and go out about one every 20 seconds. The count runs per clock hour, so up to twice a ceiling can go out across an hour boundary, and the limiter lets everything through when Redis is down (H). | `src/lib/env.ts:431-448`; `src/lib/automation/send-rate-limiter.ts:27`, `:84-127`; `src/lib/queue.ts:507-527`. |
| **Opt-out and human handoff** | Someone who replies STOP is suppressed before any other logic runs. Every Instagram send path then skips them: live replies, campaigns, comment replies, email capture, follow-ups, sequences, broadcasts and manual inbox replies. Two exceptions: a lead email that is already queued is not re-checked, and Facebook Page replies have no opt-out (Linkar sends no DMs there). When a teammate replies by hand on Instagram, automations triggered by that person's new messages or comments stay silent for 12 hours. Sequences, follow-ups and broadcasts that are already queued can still send. | `src/lib/automation/runner.ts:386`, `:1148`, `:1201-1209`; `src/lib/automation/broadcast-runner.ts:138-141`; `src/lib/automation/lead-delivery.ts:96-138`; `src/lib/automation/manual-reply.ts:8`. |
| **No duplicate sends** | Each send has a unique delivery key. If Linkar gets no usable answer from Meta (its own 10-second timeout, a network failure or an unreadable reply), it records the send as unknown and never retries it. One exception: HTTP 5xx and 408 answers are treated as "not delivered" and retried, so a rare duplicate is still possible. | `prisma/schema.prisma:832`; `src/lib/automation/outbound-delivery.ts:61-69`, `:232-235`; `src/lib/meta/client.ts:351-360`. |
| **Stops when access is revoked** | If the customer removes Linkar in Instagram, Linkar deletes the connection and expires that account's open conversations, so sending stops. No email is sent in this case. If Meta says the token is invalid (error 190), or the token refresher finds it dead, the connection is marked expired and the owners are emailed. | `src/lib/meta/deauthorization.ts:8-19`; `src/lib/automation/outbound-delivery.ts:79-113`; `src/lib/meta/token-refresh.ts`. |
| **Minimum permissions** | Linkar asks for 3 Instagram permissions and 5 Facebook Page permissions. It does not ask for Messenger, publishing, ads or insights. | `src/lib/env.ts:395-399`, `:413-417`. |
| **Volume caps by plan** | Monthly deliveries are capped at 1,000 / 5,000 / 25,000 / 50,000 by plan. Broadcasts are only on Growth (10 a month) and Agency (25 a month). Each automation can also have an optional daily cap of up to 1,000. Facebook Page replies are not counted toward the monthly cap. | `src/lib/billing/catalog.ts:14-15`, `:30-31`, `:44-45`, `:58-59`; `src/lib/automation/definition.ts:334`; `src/lib/facebook/runner.ts:124-130`. |
| **Acceptable use policy** | Customers may not send unsolicited bulk messages. If a workspace breaches the policy, Linkar may pause the affected automations, suspend the workspace or close the account, without notice only for serious or ongoing breaches. This protects the shared Linkar app from one bad customer. | `app/acceptable-use/page.tsx:26` (banned content), `:35` (enforcement). |

---

## 3. What can still get an account restricted, and how Linkar handles it

Status key:

- **Protected**: the code handles it.
- **Partly protected**: there is a safeguard, but it has a gap.
- **Not protected**: the code does nothing here.

| # | Scenario | Today (live) | After the next deploy |
|---|---|---|---|
| A | Viral post with automatic public comment replies | Partly protected (weak) | Partly protected (much stronger) |
| B | The same text sent many times | Partly protected | Partly protected (hints added) |
| C | Follow gates (a follow required before the reward) | Not protected (policy risk, not a bug) | Unchanged, decision open |
| D | Many blocks and reports from recipients | Partly protected | Partly protected (opt-out fixed, monitoring open) |
| E | Linkar keeps sending after Meta blocks the account | Not protected | Protected on Instagram; Facebook Page replies not yet |
| F | Meta asks Linkar to slow down | Partly protected | Protected on Instagram; Facebook Page replies not yet |
| G | Messages outside the 24-hour window | Protected, with a small gap | Protected |
| H | Outbound throttling | Partly protected | Partly protected (fewer holes) |
| I | Link reputation | Partly protected | Partly protected (templates and shorteners fixed, shared domain open) |
| J | Private replies to old comments | Partly protected | Protected |
| K | Things the customer does outside Linkar | Outside Linkar's control | Unchanged |
| L | Meta restricts the Linkar app | Partly protected | Unchanged (monitoring open) |

### A. Viral post with automatic public comment replies: **Partly protected (weak) today**

- **Why it is risky.**
  - [Known] Meta's Spam policy bans posting or engaging at very high frequencies, whether done manually or automatically. It also lets Meta restrict accounts at lower volumes when there are other spam signals, such as repetitive content. Meta publishes no limit for public comment replies.
  - [Reported] One ManyChat user (Feb 2024, thread 251) was blocked from commenting about a week after installing ManyChat. In that week it had posted about 3,500 automated comment replies, with only 4 wordings, and sent about 3,500 DMs. DMs kept working.
  - [Reported] In July 2026 (thread 10634), Instagram put an account that used comment-to-DM automation into a security review. The prompt said 8,099 comments would be removed and 75 posts and reels archived. The user was still stuck at that prompt, so nothing is shown as actually removed.
  - [Reported] In thread 10265 (6 Jun 2026), a creator said a reel drew 1 million views and 12,000+ comments in 48 hours while comment-to-DM automations ran, and the account was then barred from sending DMs for 30 days. The 12,000 were comments people left, not replies the account sent, and the post gives no count of automated sends. So no hourly send rate can be worked out from it.
  - [Reported] In thread 251, a ManyChat Educator blamed the public "comment under comment" replies and called private replies safe. In thread 10265, one moderator advises turning public replies off when a post goes viral, while another moderator and ManyChat staff blamed sudden bursts of identical messages or did not separate public replies from DMs.
- **Linkar today.**
  - In Instagram comment campaigns, the schema allows zero public replies (`src/lib/automation/definition.ts:315`), but the campaign builder customers use requires at least one (`src/components/automation-builder.tsx:1919`). So in practice every campaign built in the dashboard posts public replies.
  - Classic Instagram comment flows send only a private reply. Classic Facebook Page flows do the opposite: their one reply is posted publicly under the comment (`src/lib/facebook/runner.ts:88-93`, `:439`).
  - By default, public replies are capped at 250 per clock hour for each Instagram account or Facebook Page (`src/lib/env.ts:444-448`; `src/lib/automation/send-rate-limiter.ts:53-61`). The setting can be changed per deployment, the cap is skipped when Redis is down, and up to about 500 can go out in any 60 minutes that span an hour boundary. An optional daily cap per automation (up to 1,000) drops replies once reached.
  - **Gap:** when the hourly cap is reached, public replies are **delayed, not dropped** (`src/lib/automation/campaign-runner.ts:569`, `:672-682`; `src/lib/facebook/runner.ts:340`). On a Facebook Page post with 8,000 matching comments, all 8,000 replies go out over about 32 hours. On Instagram, a delayed reply is dropped once the commenter finishes the DM flow or their conversation expires 24 hours after it started (`src/lib/prisma.ts:2418-2432`), so up to about 6,000 go out in the first day.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.**
  - Past half the hourly budget, a shrinking share of comments get a public reply. Once the budget is used up, the rest are skipped and recorded as skipped, never queued. This applies to Instagram campaigns and Facebook Page replies. Private replies and DMs are unaffected.
  - The campaign builder no longer requires a public reply, and the link templates prefill none.
  - Files: `src/lib/automation/send-rate-limiter.ts` (`admitPublicReply`), `src/lib/automation/campaign-runner.ts`, `src/lib/facebook/runner.ts`, `src/components/automation-builder.tsx`, `src/lib/automation/templates.ts`, `src/components/automation-activity.tsx`.
- **Still open.** The hourly ceiling is unchanged at 250. A post that keeps drawing comments all day can still get up to 250 public replies every hour, about 6,000 a day. The Feb 2024 block came at about 500 a day. A daily public-reply cap per account, or a lower hourly ceiling, would close this.

### B. The same text sent many times: **Partly protected**

- **Why it is risky.**
  - [Known] Meta's Spam policy names repetitive content as a spam signal.
  - [Reported] Some forum posts name repeated reply text as a factor, usually together with a burst of volume: the original poster's own guess in thread 251, one moderator in thread 10265 and one member in thread 10634. No Meta or ManyChat staff post says repetition alone is a trigger. The most common advice in these threads is to turn off public replies and cut volume, not to vary the wording.
- **Linkar today.**
  - Campaign public replies can have up to 5 wordings (`src/lib/automation/campaign-match.ts:41-46`; `definition.ts:315`). Campaign opening and delivery messages can have up to 5 extra versions (`campaign-runner.ts:159-164`).
  - Classic replies can have up to 4 extra versions in the engine (`src/lib/automation/engine.ts:37-41`; `definition.ts:135`), but the builder shows that editor only for Facebook Page replies (`automation-builder.tsx:999-1001`). Instagram classic private replies are one text in practice.
  - **Gap:** variants are optional. One identical public reply can go under every comment, and a broadcast is a single text sent to up to 500 people (`app/api/broadcasts/route.ts:25`).
- **Partly fixed on the ban-risk-fixes branch, ships with the next deploy.** The builder now suggests 3 to 5 wordings when a public reply has only one, and the broadcast screen asks for relevant, occasional broadcasts. Files: `src/components/automation-builder/action-section.tsx` (`ReplyVarietyHint`), `src/components/automation-builder.tsx`, `src/components/broadcasts-screen.tsx`.
- **Still open.** These are hints that never block a save. There is no warning when one text is about to go out at high volume, broadcasts still have no variants, and Instagram classic private replies still have no variant editor.

### C. Follow gates (a follow required before the reward): **Not protected (policy risk, not a bug)**

- **Why it is risky.**
  - [Known] Meta's Spam policy bans requiring people to engage before they can get promised content. Its definition of like or share gating explicitly includes follows.
  - [Known] The same policy bans offering anything of monetary value in exchange for engagement.
  - [Known] Developer Policy section 2.7 bars programs that facilitate buying, selling or exchanging followers (and likes, comments and more).
- **Mitigating facts.**
  - [Known] Meta's API offers the `is_user_follow_business` field that the gate reads.
  - [Reported] Competitors (InstantDM, SuperProfile, Zorcha, CreatorFlow) sell follow gates.
  - A search of Meta's pages, the ManyChat community, Reddit and vendor blogs on 16 Oct 2026 found no documented case of Meta acting against follow-gated DMs. This is weak evidence: Meta rarely says which behaviour caused a restriction. The nearest precedent is Facebook's 2014 ban on gating app or Page content behind a Page like.
- **Linkar today.**
  - The gate checks follow status only after the person taps the opt-in button, with a 10-second recheck cooldown and no polling (`src/lib/automation/campaign-runner.ts:1449-1475`).
  - The production env template turns the feature on (`.env.production.example:110`), and the production health check fails if it is off (`scripts/check-production-health.mjs:3-9`). The live value is set in Dokploy, outside the repo.
  - A new blank campaign starts with the follow gate switched on (`src/components/automation-builder.tsx:1761`).
  - The code is fine. The risk is that the feature, as designed, matches wording Meta prohibits.
- **Branch.** No change to the gate. The branch does add a non-gated two-step template, "Send a link when someone comments" (see I).
- **Still open: the follow-gate decision** (section 4, item 13). One caution: the `FOLLOW_GATED_CAMPAIGNS_ENABLED` flag switches off **all** campaigns, including the new two-step link templates. So the decision should change the default per campaign, not turn the flag off.

### D. Many blocks and reports from recipients: **Partly protected**

- **Why it is risky.** [Known] Developer Policy 5.6.1(b) tells apps to monitor their block rate. Section 5.4 says messaging that draws excessive negative feedback may be limited, paused, rate-limited or removed. Section 5.2(b) requires opt-out requests to be honoured immediately.
- **Linkar today.** Once an opt-out is recorded, every Instagram send path checks it just before sending. Two exceptions: a lead email that is already queued is not re-checked (`src/lib/automation/lead-delivery.ts:96-138`), and Facebook Page replies have no opt-out because Linkar sends no DMs there.
- **Gaps today:**
  - Opt-out only recognises 6 exact English phrases (`src/lib/automation/runner.ts:386`). "Stop!", "STOP.", "please stop" and Hindi phrasing are treated as normal messages.
  - Broadcasts carry no opt-out hint. The only hint is in the lead email footer (`runner.ts:408`).
  - Linkar has no view of block or report rates per workspace.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.**
  - Opt-out ignores punctuation and recognises more English phrasings plus Hindi and Hinglish, with tests so that ordinary messages are not caught (`src/lib/automation/runner.ts`, `src/lib/automation/runner-opt-out.test.ts`).
  - Broadcasts end with "Reply STOP to stop these messages.", added at send time unless the text already says it (`src/lib/automation/broadcast-opt-out.ts`, `src/lib/automation/broadcast-runner.ts`).
- **Still open.** No per-workspace view of block, report or opt-out rates (item 14). Queued lead emails are still not re-checked after STOP.

### E. Linkar keeps sending after Meta blocks the account: **Not protected today**

- **Why it is risky.**
  - [Known] Meta documents error 368 ("temporarily blocked for policies violations"). Its Messenger and Instagram error table puts the text "The business has been blocked from sending messages via the IG Messaging API" under code 100, subcode 2534029.
  - [Reported] A ManyChat community report (Oct 2024) shows the same text with the code "(#2022)".
  - [Reported] One ManyChat community member (thread 10634, 30 Jul 2026) advised pausing all automations for a couple of weeks, then ramping up slowly. That case was a security review, not an API send block. In thread 10265 one user said a one-week pause did not help. No Meta or ManyChat source gives a recovery timeline.
  - Whether continued attempts make enforcement worse is not documented. Meta's only guidance for 368 is to wait and retry, and for subcode 2534029 to fix any policy violations first.
- **Linkar today.**
  - **Gap:** error 368 is only turned into a message (`src/lib/meta/errors.ts:48`). The 2534029 / #2022 block falls through to a generic "rejected" message.
  - **Gap:** nothing pauses the account, nothing emails the owners and no block-specific alert appears. The only sign is a generic "N messages couldn't be sent in the last 7 days" item on Home (`src/lib/home-attention.ts:132-147`). The refused send itself is not retried, but every new comment and DM makes a new send attempt, and queued broadcasts, sequences and follow-ups keep trying.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.**
  - Error 368 and #2022 are recognised by code, subcode or Meta's message text, with a plain reason.
  - Every automatic Instagram send for that account stops for 24 hours (`ACCOUNT_BLOCK_PAUSE_HOURS`). Comments and messages that arrive during the pause get no automatic reply and are recorded as not sent; sequence steps wait and are tried again later. Nothing held is sent to Meta.
  - The owners are emailed once per pause, and Home shows a "Limited" item with the restart time. Manual inbox replies get a clear message instead of an error.
  - For the next 24 hours (`ACCOUNT_RECOVERY_HOURS`) the account sends at most 25% of its hourly DM ceiling (`ACCOUNT_RECOVERY_SEND_PERCENT`), so it restarts slowly.
  - The pause is kept in Redis and mirrored in memory, so a Redis outage still pauses the worker that saw the error.
  - Files: `src/lib/automation/account-pause.ts`, `src/lib/automation/outbound-delivery.ts`, `src/lib/meta/errors.ts`, `src/lib/home-attention.ts`, `app/api/inbox/[contactId]/route.ts`, `src/lib/env.ts`, `.env.production.example`.
- **Not finished in the commit** (the code says so itself, in `account-pause.ts` and `.env.production.example`):
  - Facebook Page comment replies do not pass the pause, so a blocked Page keeps trying.
  - The follow-gate "give it a few more seconds" notice does not pass it either.
  - Campaign comment-to-DM replies count toward the slow-restart budget but are not held by it, so the restart is less gentle for campaigns.
  - Subcode 2534029 itself is not in the code list. That case is caught only through Meta's message text.
  - The 24-hour pause and 25% restart are Linkar's own judgement. No Meta document gives a cool-down period.
  - On 16 Oct the worktree also held uncommitted edits that extend the pause to Facebook Page replies and the cooldown notice, and let campaign replies wait out the slow restart. They are not part of commit `77e8262` and were not reviewed here.

### F. Meta asks Linkar to slow down: **Partly protected today**

- **Linkar today.**
  - Meta's throttling codes 4, 17, 32, 613, 80002 and 80006 all get a plain "rate limited" message on Instagram calls (`src/lib/meta/errors.ts:35`, `:43`). Only 4, 17, 32 and 613 are actually retried (`src/lib/meta/client.ts:445-449`). 80002 and 80006 come back as HTTP 400 and fail for good, even though the stored message says "It will be retried".
  - **Gap:** live comment and DM replies are retried twice, after about 0.5 to 1 second and then about 1 to 2 seconds, then marked failed (`src/lib/queue.ts:84-85`, `:102-103`). Nothing slows the account's other sends.
  - **Gap:** Meta's usage headers are not read.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.**
  - Three throttling errors within 5 minutes pause the whole account for 15 minutes.
  - A throttled send waits 1, 5 and then 15 minutes. Live event retries now wait about 30 seconds, then up to 16 minutes, instead of seconds.
  - 80002 and 80006 are treated as throttling.
  - Meta's usage headers are read on throttled responses, and Meta's own "time to regain access" is honoured up to one hour.
  - Files: `src/lib/automation/account-pause.ts`, `src/lib/automation/outbound-delivery.ts`, `src/lib/meta/errors.ts`, `src/lib/meta/client.ts`, `src/lib/queue.ts`.
- **Still open.** Facebook Page replies are not covered in the commit (as in E). Usage headers are read only when Meta refuses a send, so Linkar does not slow down before Meta pushes back.

### G. Messages outside the 24-hour window: **Protected, with a small gap today**

When a broadcast is created, recipients are limited to people whose last inbound message (a DM, quick reply, button tap or story mention) arrived in the previous 24 hours (`src/lib/prisma.ts:3686-3696`).

- **Gap today [Known].**
  - The send itself can happen later: a scheduled broadcast has no upper limit on its start time, and quiet hours and slow fan-out add delay.
  - Just before each send, the broadcast, sequence and follow-up runners re-check the window using a looser field, `lastSeenAt` (`broadcast-runner.ts:151`, `:173`; `sequence-runner.ts:103`; `followup-runner.ts:108`, `:129`). For sequences and follow-ups this is the only window check.
  - `lastSeenAt` is also moved forward by opt-in and referral events (`src/lib/automation/runner.ts:328-337`), by the Contacts screen's background sync from comment events, and by Linkar's own participant updates (`app/api/contacts/route.ts:30-53`; `src/lib/prisma.ts:2481-2488`). None of these opens Meta's window.
- **Effect.**
  - Occasionally a scheduled broadcast, a late sequence step or a follow-up is attempted after the real DM window has closed.
  - Meta checks the window on its side and rejects such sends, so the expected result is a failed call, not a delivered message that breaks the rules. Linkar uses no message tags that could let such a message through.
  - Low risk.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.** The three runners re-check the window from the person's last inbound DM, the same timestamp that chose the broadcast recipients. Files: `src/lib/automation/last-inbound-dm.ts`, `broadcast-runner.ts`, `sequence-runner.ts`, `followup-runner.ts`.

### H. Outbound throttling: **Partly protected**

Linkar **does** throttle outgoing sends per account, on every automated send path (section 2). The holes today:

- **Redis outage.** If Redis is down or not configured, the limiter lets every send through (`src/lib/automation/send-rate-limiter.ts:107`, `:120`). Meta's own limits still apply.
- **Private replies.** The private-reply ceiling is set at Meta's limit of 750 an hour, not below it (`src/lib/env.ts:431-435`). [Reported] ManyChat users report restrictions after volumes whose implied averages are below 750 an hour, but no report gives an hourly or peak rate. ManyChat itself caps comment triggers at 12 a minute (about 720 an hour). The clearest numeric case (thread 251) was a block on public comments, with private DMs still working. So the forums show restrictions happen without exceeding Meta's limit, but do not show restrictions well below 750 private replies an hour.
- **Manual replies.** Manual inbox replies skip the limiter (`app/api/inbox/[contactId]/route.ts:138-176`). These are typed by a person, so this matters least.
- **Sequences and follow-ups.** Both draw on the full DM budget, not the 70% bulk share (`src/lib/automation/sequence-runner.ts:129`; `src/lib/automation/followup-runner.ts:142`).
- **Bursts.** The ceiling is a fixed clock-hour window, and only broadcasts are spaced out. Up to the full ceiling can go out in the first minutes of an hour, and up to twice the ceiling across an hour boundary.

**Partly fixed on the ban-risk-fixes branch, ships with the next deploy.**

- The default private-reply ceiling is lowered from 750 to 400 an hour (`src/lib/env.ts`, `.env.production.example`).
- When Redis is down, public replies and broadcasts use a small in-process budget (25% of the normal ceiling per process) instead of being let through (`src/lib/automation/send-rate-limiter.ts`).

**Still open.**

- When Redis is down, private replies and DMs that answer someone, including sequence steps and follow-ups, still go through unmetered. Meta's limits and the new throttle pause still apply.
- Sequences and follow-ups still use the full DM budget. Manual replies are still not counted. Hour-boundary bursts are unchanged.
- **Deploy check.** The old production template set `PRIVATE_REPLY_RATE_LIMIT_PER_HOUR=750` explicitly. If the live Dokploy settings were copied from it, that value overrides the new default of 400. Set it to 400 (or remove it) at deploy. [Unverified] what the live setting is.

### I. Link reputation: **Partly protected**

- **Why it is risky.**
  - [Known] Developer Policy 5.6.2(b) bans sending people off Instagram through deceptive or malicious URLs.
  - [Reported] Forum advice is to keep links out of the first message (ManyChat threads 10634 and 10707, including a community moderator in 10707). This is advice, not a Meta statement.
  - [Known, from news] On 4 April 2024 Meta flagged the Kansas Reflector's links as a security threat and removed every post linking to its site on Facebook, about 6,000 shares. Most were restored about 7 hours later, and Meta called it an error. On Instagram and Threads, only shares of one column were blocked.
- **Linkar today.**
  - Tracked links (campaign link deliveries and `/r/` short links) use Linkar's own domain, not a public URL shortener (`src/lib/automation/campaign-runner.ts:167-173`; `src/components/tracked-links-panel.tsx:350`). Classic flows do not use tracked links; they send the customer's own URL (`src/lib/automation/runner.ts:105-109`).
  - Campaign links are sent as a button (`campaign-runner.ts:1089-1097`; `src/lib/meta/client.ts:135-147`) and only redirect when tapped (`app/api/t/[id]/route.ts:89`). Destinations are checked for unsafe network addresses, such as private or local ones (`route.ts:53-60`; `src/lib/security/outbound-url.ts:118-144`). This is not a reputation or phishing check.
  - Linkar's own campaign flow already sends the link second, after an opening message and a tap.
- **Gaps today:**
  - [Estimate] Every customer's tracked links share `app.linkar.in` (`.env.production.example:7`), which is also the dashboard and login domain. One abusive customer could get the domain flagged for everyone. Suspended workspaces' links stop working, but a domain flag could outlast that.
  - Nothing blocks public URL shorteners as destinations (`src/lib/security/outbound-url.ts:118-144`).
  - The default link template (shown as "Send a link when someone comments") puts a raw link in the first private reply (`src/lib/automation/templates.ts:166`).
  - The "comment anything" template replies to every comment on every post (`templates.ts:356`).
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.**
  - The "Send a link when someone comments" and "Send a free guide from comments" templates now send a button first and the link only after the tap, with no public reply (`src/lib/automation/templates.ts`).
  - "Reply when someone comments anything" is labelled as meant for smaller posts.
  - Public link shorteners (bit.ly, tinyurl.com and about 25 others) are refused when an automation is saved or switched on (`src/lib/security/outbound-url.ts`, `src/lib/automation/definition.ts`).
- **Still open.**
  - A dedicated link domain, separate from the dashboard and login domain, and watching its reputation (item 12).
  - The shortener check runs only at save time, so automations already running keep sending. It does not cover `/r/` tracked links (`app/api/links/route.ts` is unchanged) or broadcast text.
  - Customers can still type a raw link into a classic private reply.

### J. Private replies to old comments: **Partly protected today**

- [Known] Meta's Private Replies page says a private reply must be sent within 7 days of the comment. Meta's page names no error for late replies; vendor docs report that the API rejects them, and Linkar already recognises that error text (`src/lib/meta/errors.ts:51`).
- Classic flows refuse to reply to comments older than 7 days (`src/lib/automation/runner.ts:177`, `:233-241`). Campaign opening replies have no such check (`src/lib/automation/campaign-runner.ts:847-924`), so an old backlog would be sent to Meta and rejected. Minor.
- **Fixed on the ban-risk-fixes branch, ships with the next deploy.** Campaign opening replies skip comments older than 7 days, including retries, using the comment's own time (`src/lib/automation/campaign-runner.ts`).

### K. Things the customer does outside Linkar: **Outside Linkar's control**

These raise risk on any tool:

- buying followers or likes;
- engagement pods (covered by Meta's ban on "exchanging for engagement");
- password-based growth apps on the same account;
- running several automation tools at once (forum and vendor advice, not a Meta source);
- earlier violations on the account;
- Meta's own mistaken bans.

[Known] In November 2018 Instagram removed fake likes, follows and comments made by third-party growth apps and asked those users to change their passwords. Meta has sued automation and fake-engagement vendors, some of which collected users' login details (2020 and 2022).

### L. Meta restricts the Linkar app: **Partly protected**

- [Known] Meta's Platform Terms let Meta suspend or remove a developer's app, or limit its access, with or without notice. Customers' accounts are not banned by that action, but their automations stop.
- The acceptable use policy and workspace suspension are the defence. Suspension stops sends on every runner. There is no automatic monitoring of which workspaces cause Meta errors. The admin overview shows a raw list of the most recent failed sends with their workspace (`src/lib/admin/overview.ts:102-112`), not grouped, filtered to Meta errors or alerted on.
- [Unverified] Project notes say App Review for the 8 permissions was resubmitted on 30 September 2026 and was "Review in progress". The live status was not checked. Until Meta grants Advanced Access, customers without a role on the app cannot connect at all.
- **Branch.** No change. **Still open:** per-workspace health monitoring (item 14).

---

## 4. Changes that lower the risk

Status of each change: **Fixed on the ban-risk-fixes branch, ships with the next deploy**, **Partly fixed** or **Open**.

### Code changes, in priority order

**Priority 1: do first**

1. **Pause and alert when Meta blocks an account.** Fixed on the ban-risk-fixes branch, ships with the next deploy, for Instagram (see E).
   - On error 368 or #2022, all automatic sends for the account stop for 24 hours, the owners are emailed, Home shows a "Limited" item, and sending restarts at 25% for 24 hours.
   - Repeated throttling errors pause the account for 15 minutes (item 4).
   - This closes gap E on Instagram. It is in line with forum and vendor advice: one ManyChat community member advised pausing all automations for a couple of weeks, InstantDM advises pausing during an appeal, and Zorcha advises pausing public replies for a few days after a comment block. No Meta document gives a cool-down period, and ManyChat staff advised appealing rather than pausing.
   - **Open:** extend it to Facebook Page replies and the follow-gate cooldown notice, and hold campaign replies during the slow restart.
2. **Viral-post guard for public replies.** Fixed on the ban-risk-fixes branch, ships with the next deploy (see A).
   - Past half the hourly budget, a shrinking share of comments get a public reply; once it is used, the rest are skipped, not delayed. Private replies keep going. Zorcha documents the same tapering approach (help article 13942354, 1 Apr 2026). Applies to Facebook Page replies too.
   - Viral-post volume is the main trigger in the evidence. Public replies (gap A) are the cause vendors and moderators most often name for comment blocks, but the longest blocks reported in 2026 were 30-day DM blocks after bursts of comment-triggered DMs (gap H). Gap A is a leading trigger and an easy fix, not proven to be the biggest single one.
   - **Open:** a daily cap on public replies per account, or a lower hourly ceiling.
3. **Use the inbound-DM timestamp in the window re-checks.** Fixed on the ban-risk-fixes branch, ships with the next deploy (see G).

**Priority 2**

4. **Cool down after Meta throttles.** Fixed on the ban-risk-fixes branch, ships with the next deploy, for Instagram (see F). **Open:** Facebook Page replies.
5. **Fail safe when Redis is down.** Partly fixed on the ban-risk-fixes branch, ships with the next deploy. Public replies and broadcasts use a small in-process budget. **Open:** private replies and DMs, including sequences and follow-ups, still go through unmetered.
6. **Broader opt-out and a broadcast opt-out line.** Fixed on the ban-risk-fixes branch, ships with the next deploy (see D). **Open:** re-check opt-out before sending a queued lead email.
7. **Add the 7-day check** to campaign opening replies. Fixed on the ban-risk-fixes branch, ships with the next deploy (see J).
8. **Lower the default private-reply ceiling** below Meta's 750 an hour. Fixed on the ban-risk-fixes branch, ships with the next deploy: 400 an hour. The number is a judgement call, because Meta publishes no safe figure. **At deploy:** check the live `PRIVATE_REPLY_RATE_LIMIT_PER_HOUR` setting (see H).
9. **Encourage variety.** Partly fixed on the ban-risk-fixes branch, ships with the next deploy: hints for 3 to 5 public-reply wordings and a note on broadcasts. **Open:** a warning when one text is about to go out at high volume, broadcast variants, and a variant editor for Instagram classic private replies.
10. **Sequences and follow-ups on the bulk share.** Open. Make them use the 70% bulk share, not the full DM budget (new item, from H).

**Priority 3**

11. **Safer templates.** Fixed on the ban-risk-fixes branch, ships with the next deploy (see I): the two link templates are two-step, and "comment anything" is labelled for smaller posts.
12. **Link hygiene.**
    - Block known public URL shorteners: Fixed on the ban-risk-fixes branch, ships with the next deploy, at save time for automations. **Open:** `/r/` tracked links, broadcast text and automations already running.
    - Move tracked links to a dedicated link domain, separate from the dashboard and login domain: **Open.**
    - Watch the link domain's reputation: **Open.**
13. **Follow gate decision.** Open. This is a business trade-off, because competitors sell the feature and no enforcement case was found. Two lower-risk options:
    - turn it off by default for new campaigns (today a blank campaign starts with it on), with a clear warning when switched on; or
    - offer a "soft gate" that always delivers the link and simply asks for a follow.
    Do this per campaign. Turning off `FOLLOW_GATED_CAMPAIGNS_ENABLED` would also stop the new two-step link templates.
14. **Per-workspace health monitoring in the admin panel.** Open. Track Meta block errors, window rejections and opt-out rates, so one bad workspace can be paused before it hurts the shared app. The new block pause records the data this needs.
15. **Optional bot-disclosure line.** Open. [Known] Meta requires disclosure that a chat is automated where the law requires it, and recommends it as good practice.
16. **Count manual inbox replies** against the account's DM budget. Open. This is the lowest priority.

### Verification fixes

Found while verifying the fixes above, and fixed on branch `inspection-fixes`. Not deployed yet.

- **Pausing now stops parked comment DMs.** When the owner pauses an automation, or uses "pause all automations" in the owner console, a comment whose DM is waiting out an account cool-down, or is replayed, no longer gets its public reply or opening DM. The person's progress is left as it is and expires in the hourly sweep. Taps on the opt-in and "I followed" buttons after a pause still finish; whether they should stop too is waiting on an owner decision. Files: `src/lib/automation/campaign-runner.ts`, `src/lib/automation/runner.ts`.
- **Instagram throttle codes are now retried on read calls.** 80002 and 80006 were recognised as throttling on sends, but a media lookup or follow check that got one failed the comment or the opt-in for good. The Instagram client now treats every code in `META_RATE_LIMIT_CODES` as retryable, so the two lists cannot drift apart, and a throttled read also counts toward the account's cool-down (F). Facebook Page calls do the same and keep 80001 retryable. Files: `src/lib/meta/client.ts`, `src/lib/facebook/client.ts`, `src/lib/automation/campaign-runner.ts`.
- **The Redis fail-safe now covers a stalled Valkey.** The Redis connections for the account pause and the send limiter now give up on a command after a deadline. So the in-process fallback in H also runs when Valkey accepts connections but stops answering, not only when it is down. Files: `src/lib/automation/account-pause.ts`, `src/lib/automation/send-rate-limiter.ts`.

### Customer guidance (no code needed)

- **Viral posts.** On posts you expect to take off, turn off public replies or use several different wordings. Private replies are the safer channel.
- **Variety.** Write 3 to 5 versions of each reply.
- **Links.** Do not put a raw link in the very first message. Use the opening message and button, then send the link.
- **Keywords.** Use a specific keyword rather than "any comment" on big posts.
- **Promises.** Deliver exactly what you promised, so people do not report the message.
- **Broadcasts.** Keep them relevant and occasional.
- **Follow gates.** Use them sparingly. Never offer cash, coupons or prizes in return for a follow. Meta's spam rules prohibit offering anything of monetary value for engagement.
- **Account hygiene.** Do not buy followers or likes, join engagement pods, use password-based growth apps, or connect several automation tools to the same account.
- **If Instagram limits your account.** Pause your automations, do not keep pushing, and appeal through Meta. Linkar cannot appeal for you (the acceptable use policy already says so). Once the fixes are live, Linkar also pauses automatic sends on a blocked Instagram account by itself.

---

## 5. What to tell customers (FAQ text for the site)

**Can using Linkar get my Instagram or Facebook account banned?**

Linkar connects through Meta's official login and APIs. It never asks for your Instagram or Facebook password. It only messages people who comment on your posts or message you first, and it stays inside the time limits Meta sets for replies. It stops messaging anyone who replies STOP, and it paces how fast each account sends. Together these avoid the main reasons third-party tools get accounts banned.

No tool can promise that your account will never be restricted. Meta makes that decision, its spam systems work separately from its published limits, and it sometimes restricts accounts by mistake. The most common problem reported across comment-to-DM tools is a temporary block on commenting or messaging after a post goes viral, especially when the same public reply is posted under thousands of comments or thousands of comments each trigger a DM.

To lower your risk:

- use several reply wordings;
- switch off public replies on posts you expect to take off;
- always deliver what you promise;
- use follow gates sparingly.

If Instagram ever limits your account, pause your automations and appeal to Meta. Linkar cannot appeal on your behalf.

Add once the fixes are live: "If Instagram limits your account, Linkar pauses automatic replies on it, emails you, and restarts slowly afterwards."

---

## Appendix: what was verified, and what was corrected

**Code.** Every file and line cited for today's behaviour was opened and checked at commit `e1d9184`. The fixes were read at commit `77e8262` on branch `ban-risk-fixes`. The branch's tests for the changed modules pass (12 test files, 503 tests, run on 16 Oct in the branch worktree, which also held the uncommitted edits noted in E).

**Meta pages.** These pages were read on 16 Oct 2026. Plain `curl` gets HTTP 200 from all of them. transparency.meta.com returns a JavaScript page without the policy text, so it was read through a browser-style web fetcher. developers.facebook.com returns full text.

- **Spam policy** (transparency.meta.com/policies/community-standards/spam/). Confirmed four points:
  - high-frequency activity, manual or automated;
  - restrictions at lower volume when there are other spam signals, such as repetitive content;
  - gating, with follows included in the definition of like or share gating;
  - offering anything of monetary value in exchange for engagement.
- **Developer Policies** (developers.facebook.com/devpolicy/, last updated 3 Feb 2026). Confirmed:
  - 2.7: no buying, selling or exchanging of followers, likes, comments and more;
  - 5.2(b): honour opt-outs immediately;
  - 5.4: excessive negative feedback can lead to limits;
  - 5.6.1(b): monitor your block rate;
  - 5.6.2(b): high-frequency bots, undelivered promises and deceptive or malicious URLs.
- **Platform Terms** (developers.facebook.com/terms/, last updated 3 Feb 2026). Section 7: enforcement at any time, with or without notice, up to suspending or removing the app.
- **Private Replies** (developers.facebook.com/docs/instagram-platform/private-replies/). Confirmed:
  - one message per comment (the page says "to the commenter", but Meta enforces it per comment);
  - sent within 7 days of the comment (the page names no error for late replies);
  - follow-ups only within 24 hours of the person's reply.
- **Rate limiting** (developers.facebook.com/documentation/business-messaging/messenger-platform/overview/rate-limiting). Confirmed:
  - 750 calls an hour per Instagram professional account for private replies to post and reel comments;
  - 300 calls a second for text, links, reactions and stickers;
  - sending pauses above 72,000 messages sent and received (no time window given);
  - possible limits when too many messages go to one thread.
- **Instagram Messaging overview and messaging guide.** Confirmed that apps must offer a path to a human agent, and that automated chats must disclose automation where the law requires it (recommended otherwise).
- **Graph API and Messenger error codes.** 368 "temporarily blocked for policies violations" (wait and retry); code 100, subcode 2534029 "the business has been blocked from sending messages"; window errors 10/2534022 and 10/2018278.
- **Restricting accounts** (transparency.meta.com, updated 12 Nov 2024). Confirmed:
  - a first strike is usually only a warning;
  - restrictions grow with more strikes (2 to 6: feature limits; 7 to 9: 1-day to 7-day blocks; 10 or more: 30 days);
  - strikes count on both Facebook and Instagram, but this ladder of restrictions applies only to Facebook accounts;
  - disabling usually comes after repeated violations.
- **Disabling accounts** (transparency.meta.com, updated 17 Jul 2025). One severe violation can disable an account at once.

**Other sources checked.**

- Instagram, "Reducing Inauthentic Activity on Instagram", 19 Nov 2018.
- Meta newsroom, 18 Jun 2020 (MGP25 and Massroot8) and 11 Aug 2022 (Brazil lawsuit).
- TechCrunch, 24 Jun 2025, on mass bans. Meta admitted a technical error for some Facebook Groups only.
- CNN and TheWrap, April 2024, on the Kansas Reflector.
- ManyChat community threads: 251 (community.manychat.com/general-q-a-43/banned-from-instagram-comments-251, Feb 2024), 10265 (/my-instagram-account-banned-10265, May to Aug 2026, 2 pages), 10634 (/instagram-restricted-10634, Jul 2026) and 10707 (Aug 2026).
- Vendor pages: Zorcha help articles 13942354 (public reply tapering, 1 Apr 2026), 15703062 and 13428057; InstantDM blog (29 Jul 2026); SuperProfile and CreatorFlow follow-gate pages.

**Corrections made to the earlier investigations.**

- **Throttling.** "No outbound throttling" is wrong. Per-account ceilings exist, with the holes listed in H.
- **24-hour window.** "Broadcasts outside the 24-hour window" is wrong at the point where recipients are chosen. Only the late re-check has a small gap (G).
- **ManyChat thread 10265.** It contains two posts saying an account was "permanently disabled" (1 Jun and 16 Aug 2026), plus several more reports of disabled or banned accounts with no stated end date, and many 30-day DM blocks. Only the opening post firmly blames ManyChat for a permanent disable, and one user with disabled accounts said he did not think ManyChat was the cause. The "Meta confirmed ManyChat was not the cause" statement came from a ManyChat team member (9 Jun 2026) passing on Meta's position. It is not an independent finding.
- **Policy numbering.** The high-frequency and deceptive-link rule is Developer Policy **5.6.2(b)**.
- **Hourly limit.** The Private Replies page itself states no hourly limit. The 750 an hour figure is on the rate-limiting page.
- **Dropped source.** Instagram's help article on password-sharing apps could not be retrieved, so this report relies on the 2018 Instagram announcement and Meta's lawsuits instead.
- **App Review.** The status comes from project notes dated 30 Sep 2026 and was not re-checked [Unverified].

---

## Appendix: Independent verification

**How it was done.**

- The report was split into 165 checkable claims.
- 100 claims went to three independent verifiers each: one read the code, one read the sources and tests, and one argued against the claim. A claim counted as confirmed when at least 2 of 3 agreed it held. One of them (S3-H-4) got only one vote back and was checked again by the batch verifier.
- The other 65 claims (mostly Meta policy, forum and link claims) were checked by a single batch verifier.
- Every claim marked "needs correction" or "false" was then re-checked before the report was edited. Where the verifiers were right the text was fixed. None of their corrections was rejected outright, although several levels were kept with a narrower wording (for example "Very low", "Realistic" and G's "Protected").

**Counts (165 claims).**

| Result | Count |
|---|---|
| Confirmed (held as written) | 104 |
| Corrected (overstated, too narrow, wrong scope or wrong citation; text changed) | 58 |
| Refuted (wrong; replaced) | 2 |
| Unverified (could not be checked; marked [Unverified]) | 1 |

Of the 104 confirmed, 55 were confirmed by at least 2 of 3 verifiers and 49 by the batch verifier. A few confirmed claims also gained a source or a precision note without a change of meaning: S4-1 (Zorcha citation), A-1 (thread URLs), A-3 (who said it), S3-I-3 (which links are tracked), S3-I-5 (network checks only), S3-I-10 (template's current title), S3-K-1 (which items rest on forum advice), S3-L-2 (admin overview), P-12, P-16 and P-17.

**Every claim that changed.**

| ID | Before | After | Why |
|---|---|---|---|
| S1-1 | The chance of losing an account because of Linkar is low. | Permanent disable very low; temporary block low, in normal, steady use. | Did not match the table's own two levels. |
| S1-3 | Temporary restriction of a few days to about 30 days, concentrated in thousands of public replies or near-identical DMs. | Duration marked [Reported]; bursts of comment-triggered DMs added; "thousands" is not a threshold. | Duration comes only from forum posts; one DM block followed about 800 DMs. |
| S1-4 | Very low, resting partly on "Meta's hard rules enforced in code". | Very low kept; "most of Meta's hard messaging rules, with known gaps (E, G, H, J)". | Overstated. |
| S1-5 | No source documents a permanent ban caused only by an official-API connection. | No source verifies one; several unverified forum posts blame ManyChat; ManyChat staff relay that Meta said it was not the cause. | Absolute wording ignored forum reports in thread 10265. |
| S1-6 | Low, because "forum reports cluster around volume spikes, not steady use". | Low kept; one block came at about 500 public replies a day with no spike, so that is the top of the band. | The stated reason did not hold at the top of the row's range. |
| S1-7 | Forum reports of blocks cluster around volume spikes, not steady use. | Reports that give a volume mostly describe high volume; most give none; the threads do not show steady use is safe. | Overstated. |
| S1-8 | Realistic, with public replies, identical text and a link in the first DM as equal triggers. | Realistic kept; Instagram only; DM bursts added; the link trigger is forum advice only. | No Facebook Page case found; no report ties a block to a link. |
| S1-9 | App restriction stops every automation; accounts are not banned. | Meta can also cut one feature; the app action does not ban accounts, but customers can be restricted for their own sending. | Platform Terms 7.e allow narrower actions and are silent on users. |
| S1-11 | Never asks for a password; messages only people who commented or messaged first. | Never asks for the Instagram or Facebook password; other first-contact triggers listed. | Linkar's own login takes a Linkar password; triggers are broader. |
| S1-12 | The code enforces Meta's hard rules, including per-account send ceilings. | Safeguards for the main rules, with known gaps; only the 750 figure is Meta's. | The 250 ceilings are Linkar's; gaps in G, H and J. |
| S1-13 | ManyChat is an official-API partner; users blocked "sometimes while staying under Meta's limits". | ManyChat describes itself as a partner; no user gives a send rate; staying under the limit is an [Estimate]. | No user said they stayed under a limit. |
| S2-4 | Every Facebook Graph call is signed. | Signed when the app secret is set; token exchanges use `client_secret`. | Signing is conditional. |
| S2-8 | Broadcasts only go to people who sent a DM in the last 24 hours. | Last inbound message (DM, quick reply, button tap, story mention) in the 24 hours before the broadcast was created. | Wider event set; checked at creation only. |
| S2-14 | Follow-ups are checked against the 24-hour window. | Checked, but against `lastSeenAt` (see G). | Precision about which timestamp. |
| S2-18 | A database unique key ensures one private reply per comment. | The key covers campaigns; classic flows rely on one winning automation and per-automation keys. | The cited key does not cover classic flows. |
| S2-19 | Private replies are only sent within 7 days of the comment. | Classic flows only; campaign opening replies had no check. | Contradicted section J. |
| S2-20 | Every DM is sent with `messaging_type: "RESPONSE"`. | No tags anywhere; only quick-reply sends set RESPONSE. | Most payloads omit `messaging_type`. |
| S2-23 | The limiter enforces the ceilings per account or Page. | Per Instagram account for all three; per Page for public replies only; clock hour; off when Redis is down. | Missing conditions. |
| S2-27 | Every send path skips opted-out contacts. | Every Instagram send path; Facebook Page replies and queued lead emails are exceptions. | Scope. |
| S2-28 | Automations stay silent for 12 hours after a manual reply. | Event-triggered Instagram automations only; queued sequences, follow-ups and broadcasts still send. | Overstated. |
| S2-30 | If Linkar cannot tell whether a send went through, it does not retry. | True for timeouts and network failures; HTTP 5xx and 408 are retried, so a rare duplicate is possible. | Missing exception. |
| S2-31 | After deauthorization, sending stops and the owners are emailed. | Sending stops; no email on this path; email only on error 190 or a dead token. | The deauthorization code sends no email. |
| S2-38 | The acceptable use policy says Linkar may pause or suspend a workspace. | May pause the affected automations, suspend the workspace or close the account (`page.tsx:35`). | Wording and citation. |
| S3-A-1 | Status: Not protected. | Partly protected (weak) today. | A 250 an hour cap exists; the key defines "not protected" as no safeguard. |
| S3-A-2 | ManyChat users had commenting blocked after about 3,500 replies in a week. | One user, with 4 wordings; DMs kept working. | Single report. |
| S3-A-3 | A security review removed 8,099 comments and archived 75 posts. | The review said they would be removed and archived; one unverified report. | Tense; nothing shown as done. |
| S3-A-4 | 30-day DM block after 12,000+ comments in 48 hours, about 250 an hour. | 12,000+ comments received by a viral reel; no count of sends; no hourly rate can be worked out. | The figure was incoming comments, not sends. |
| S3-A-5 | ManyChat's educator and moderators most often blame public replies. | The educator blames them; one moderator advises turning them off on viral posts; others blame bursts. | Overstated; a handful of posters. |
| S3-A-6 | Public replies are optional in comment campaigns. | Optional in the schema; the builder requires at least one (today). | The builder blocks saving without one. |
| S3-A-7 | Classic comment flows allow only a private reply. | Instagram only; Facebook classic flows post the reply publicly. | Facebook runner. |
| S3-A-8 | Public replies are capped at 250 an hour per account or Page. | Default 250 per clock hour, configurable, off when Redis is down, up to about 500 across an hour boundary. | Missing conditions. |
| S3-A-10 | 8,000 matching comments get 8,000 public replies over about 32 hours. | Facebook: yes. Instagram: delayed replies are dropped when the conversation closes or expires, so up to about 6,000. | Participant expiry after 24 hours. |
| S3-B-2 | Forum advice keeps returning to identical messages as a trigger. | Some posts name repeated text, usually with volume; the commonest advice is fewer public replies and less volume. | Overstated. |
| S3-B-3 | Variants exist for private replies, public replies and campaign messages. | Citation for campaign messages added; Instagram classic private replies have no variant editor in the builder. | Citations covered two of three parts; UI limit. |
| S3-C-4 | No documented case of Meta acting against follow-gated DMs. | A search on 16 Oct found none; weak evidence; 2014 like-gating precedent. | Absence of evidence. |
| S3-C-6 | The follow gate is switched on in the production config. | On in the production template; the health check fails if off; live value in Dokploy. | A template is not the live config. |
| S3-D-2 | Opt-outs are honoured at once on every send path. | Every Instagram send path; queued lead emails and Facebook replies are exceptions. | Scope. |
| S3-E-2 | Community advice is to pause for one to two weeks, then ramp up. | One community member advised it, after a security review; another user said a week's pause did not help. | Single unofficial post. |
| S3-E-5 | No pause and no alert to the owner. | No pause, no email, no block-specific alert; only a generic failed-messages count on Home. | A generic warning exists. |
| S3-F-2 | Throttling codes 4, 17, 32, 613, 80002 and 80006 are recognised. | All six get a message; only four are retried; 80002 and 80006 fail for good. | Recognition was message-only. |
| S3-F-3 | Throttled sends are retried after about 1 to 4 seconds. | Retried twice, after about 0.5 to 1 and 1 to 2 seconds. | Queue backoff maths. |
| S3-G-1 | Protected, with one small gap from the Contacts sync. | Status kept; gap also covers opt-in and referral events, scheduled broadcasts, and sequences and follow-ups. | Gap wider than stated. |
| S3-G-2 | Broadcasts do not go to people outside the 24-hour window. | Recipients are chosen at creation; the send can be later. | Checked at creation only. |
| S3-H-1 | Status: Protected, with holes. | Partly protected; follow-ups and hour-boundary bursts added to the holes. | Label not in the key; holes missing. |
| S3-H-4 | Forum reports show restrictions well below 750 private replies an hour. | Implied averages are below 750, but no report gives a rate; ManyChat caps at about 720; the clearest case was a comment block. | Overstated. |
| S3-I-2 | Forum advice says a raw link in the first DM is a trigger. | Forum advice (threads 10634, 10707) is to keep links out of the first message. | Right source; advice, not a report. |
| S3-I-4 | Link behind a button, citing `app/api/t/[id]/route.ts:35`. | Button from `campaign-runner.ts:1089-1097` and `meta/client.ts:135-147`; campaigns only. | The cited line is a state check. |
| S4-2 | The pause matches what Meta partners and forums advise. | In line with forum and vendor advice; no Meta document gives a cool-down period. | No partner source cited; ManyChat staff advised appealing. |
| S4-3 | Gap A is the biggest single trigger. | A leading trigger; the longest 2026 blocks were DM blocks after DM bursts. | The evidence does not rank it first. |
| P-13 | Meta rejects private replies to comments older than 7 days. | The 7-day limit is Meta's; the rejection error comes from vendor docs. | Meta's page names no error. |
| P-22 | A first strike is usually only a warning. | For Facebook accounts; the restriction ladder applies only to Facebook. | Page scope. |
| P-23 | Restrictions grow with more strikes. | Facebook only, with the steps listed; Instagram strikes count toward it. | Page scope. |
| P-24 | Disabling comes after repeated violations. | Usually; one severe violation can disable at once. | Disabling accounts page. |
| P-27 | Rules out "the causes Meta itself names for third-party-app bans". | Avoids behaviours Meta names in separate documents; the grouping is this report's. | No single Meta list exists. |
| P-29 | Meta can block with error 368 or "(#2022) The business has been blocked..." [Known]. | 368 and code 100/2534029 are Meta-documented; "(#2022)" comes from a ManyChat report. | Source of the #2022 wording. |
| P-36 | Meta disables accounts by mistake, as in the mass bans of June 2025. | Meta admitted an error for some Facebook Groups; individual account errors not confirmed. | Source scope. |
| P-37 | Meta wrongly flagged a news site's whole domain across Facebook and Instagram. | Kansas Reflector: whole domain on Facebook, restored in about 7 hours; one column on Instagram and Threads. | Source scope. |
| P-38 | Instagram made growth-app users change their passwords. | Asked them to. | Source wording. |
| A-2 (refuted) | Thread 10265 has one report of a permanent disable, not several. | Two "permanently disabled" posts, plus other disabled or banned accounts. | Page 2 of the thread was missed. |
| P-25 (refuted) | Meta's pages reject plain `curl` with HTTP 400. | Plain `curl` gets HTTP 200; transparency.meta.com returns no text without a browser-style fetcher. | Re-tested on 16 Oct. |
| S3-L-3 (unverified) | [Not re-checked] App Review "Review in progress". | [Unverified]: matches the notes; the live status was not checked. | Cannot be checked from the code. |
