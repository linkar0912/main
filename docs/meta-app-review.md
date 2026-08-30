# Linkar Meta App Review runbook

This runbook is for the first production deployment of Linkar. Meta’s dashboard labels and permission requirements can change, so confirm the current product documentation and the scopes shown in your app before submitting.

Reference the current [Meta Instagram Private Replies collection](https://www.postman.com/meta/instagram/request/23987686-189d7215-22b3-403f-b2f5-a46c7e66a514) and [Meta comment webhook example](https://www.postman.com/meta/instagram/request/23987686-db99ce99-bf76-475c-8b76-718576c11cae) while validating the live payloads.

## 1. Prepare the business and test accounts

Use the business owner’s Meta developer account to create and own the Instagram and Facebook apps. Do not use a throwaway personal account as the long-term app owner. Keep a separate Instagram Professional test account for the reviewer, a second Instagram account that can comment or send a DM, a test Facebook Page, and a Facebook account that can leave test comments.

Before requesting advanced access, make sure:

- the app has a recognizable name, icon, contact email, privacy URL, terms URL, and data-deletion instructions URL;
- the connected Instagram account is eligible for the current Instagram Login/Business Login product flow;
- the Facebook test user can manage the test Page and the Page appears in the Graph API Page list;
- the business has completed Meta Business Verification if Meta requests it;
- the production domain is verified in the Meta Business settings when required;
- the reviewer can sign in without an invitation that expires during review.

## 2. Deploy the app before submission

The owner must supply all of the following before this production procedure can
be completed:

- the final public Linkar domain and a monitored support mailbox;
- Coolify/server access and private PostgreSQL and Valkey connection values;
- the Instagram and Facebook app IDs, app secrets, and the business account that owns them;
- a stable token-encryption key, a high-entropy webhook verify token, and a
  session signing secret (`AUTH_SESSION_SECRET`); and
- two eligible Instagram test accounts: one connected Professional account and
  one account that can send test comments and direct messages; and
- one Facebook test Page plus a separate account that can leave a top-level comment on its public post.

Set these production values on the web app and worker:

```dotenv
# The Coolify stack refuses to start without META_APP_ID, META_APP_SECRET,
# FACEBOOK_APP_ID, FACEBOOK_APP_SECRET and FACEBOOK_VERIFY_TOKEN. Set all five
# before deploying - a missing one is a failed boot, not a silent degrade.
APP_NAME=Linkar
NEXT_PUBLIC_APP_URL=https://linkar.in
SUPPORT_EMAIL=<owner-monitored-support-email>
AUTH_SESSION_SECRET=<at least 32 random characters>
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_TOKEN_ENCRYPTION_KEY=<64 hex characters from openssl rand -hex 32>
META_REDIRECT_URI=https://linkar.in/api/meta/oauth/callback
META_VERIFY_TOKEN=<long random verify token>
META_API_VERSION=v25.0
META_SCOPES=instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_TOKEN_ENCRYPTION_KEY=<optional dedicated 64 hex characters>
FACEBOOK_REDIRECT_URI=https://linkar.in/api/facebook/oauth/callback
FACEBOOK_VERIFY_TOKEN=<long random verify token>
FACEBOOK_API_VERSION=v25.0
FACEBOOK_SCOPES=pages_show_list,pages_manage_engagement,pages_manage_metadata,pages_read_engagement,pages_read_user_content
```

Apply committed migrations and start both production processes:

```bash
pnpm build
pnpm db:migrate:deploy
pnpm start
pnpm worker
```

Use a process manager to keep the web app and worker alive. Do not run
production with demo mode, an ephemeral filesystem, a development URL,
`pnpm db:migrate`, or `pnpm db:seed`.

## 3. Configure the Meta app

In the Meta developer dashboard, configure the Instagram Login/Business Login for Instagram product using the current product name shown in the dashboard.

Use these deployed URLs:

| Meta field | Linkar URL |
| --- | --- |
| OAuth redirect URI | `https://linkar.in/api/meta/oauth/callback` |
| Webhooks callback URL | `https://linkar.in/api/meta/webhook` |
| Data deletion callback URL | `https://linkar.in/api/meta/data-deletion` |
| Privacy policy URL | `https://linkar.in/privacy` |
| Terms URL | `https://linkar.in/terms` |
| Data deletion instructions URL | `https://linkar.in/data-deletion` |
| Support URL | `https://linkar.in/support` |

Set the webhook verify token in the dashboard to the same value as `META_VERIFY_TOKEN`. Configure these five app-level webhook fields in Meta:

- `comments`
- `messages`
- `messaging_postbacks`
- `messaging_optins`
- `messaging_referral`

After OAuth, Linkar subscribes the connected Professional account through `/{ig-user-id}/subscribed_apps` on `graph.instagram.com`: the extended set is requested first (`comments`, `messages`, plus Messenger-era `messaging_*` names where the platform accepts them) and automatically falls back to just `comments,messages` if Meta rejects any field - a rejected field never fails the connection, and `/api/meta/connection/health` reports exactly what Meta is sending. Story-mention automations need **no extra field** - Meta delivers story mentions as `messages` payloads with a `story_mention` attachment. First-contact welcome automations likewise rely only on inbound messaging events; Meta does not offer a follower webhook, so "new follower" greetings are implemented as once-per-person first-contact greetings. Request only the permissions required by the product - no new permission is needed for follower verification, since `GET /{igsid}?fields=is_user_follow_business` is covered by the existing messaging scope:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

The code does not request publishing, insights, ads, or unrelated permissions. If Meta presents a renamed or replacement scope, update `META_SCOPES` and the App Review explanation together.

Configure the separate Facebook Login for Business app with these deployed URLs:

| Meta field | Linkar URL |
| --- | --- |
| OAuth redirect URI | `https://linkar.in/api/facebook/oauth/callback` |
| Webhooks callback URL | `https://linkar.in/api/facebook/webhook` |
| Deauthorization callback URL | `https://linkar.in/api/facebook/deauthorize` |
| Data deletion callback URL | `https://linkar.in/api/facebook/data-deletion` |

Set the Facebook webhook verify token to `FACEBOOK_VERIFY_TOKEN`, subscribe the Page object to `feed`, and request only `pages_show_list`, `pages_manage_metadata`, `pages_manage_engagement`, `pages_read_engagement`, and `pages_read_user_content`. Linkar uses these permissions to list Pages, subscribe the selected Page, read public Page-post comments, and publish public replies. It does not request or implement Facebook Messenger or private replies. After connecting, verify `/api/facebook/connection/health` reports no missing `feed` field.

## 4. Verify the deployed app yourself

1. Call `GET https://linkar.in/api/health`. Confirm three things, not just the first:
   - `mode` is `configured` and both `dependencies` report `ok`;
   - `integrations` reports `{"instagram": "configured", "facebook": "configured"}` - `mode` only tracks the database and Redis, so it says `configured` even with no Meta credentials at all;
   - `release` matches the commit you expect to be live. It is baked into the image at build time, so a mismatch means the deploy did not take.
2. Open `/privacy`, `/terms`, `/data-deletion`, and `/support` in a private browser window. Confirm they load without login and use the final business contact details.
3. Sign in at `/login` with the configured owner account, open Settings, and choose **Connect Instagram**.
4. Complete the official Meta login with the test Instagram Professional account.
5. Confirm the callback returns to Settings and shows the account as connected.
6. Create this follow-gated Reel campaign, using a test Reel on the connected Professional account:
   - Trigger: Instagram comment on the selected test Reel, keyword `guide`.
   - Opening message: a private reply with an opt-in quick reply (for example, button label "Get the guide").
   - Follow gate (required): a not-following message with an "I've followed" recheck quick reply.
   - Delivery: a private message containing a real test URL, released only after the follow check passes.
7. Activate the campaign.
8. Using the second Instagram test account - while it does **not** yet follow the connected Professional account - comment `guide` on the test Reel.
9. Confirm the opening private reply arrives with the opt-in quick reply, and tap it. This is the opening interaction that establishes consent and captures the commenter's Instagram-scoped ID.
10. Confirm the false-follow prompt arrives immediately after: because the second account does not yet follow the connected account, Linkar sends the configured not-following message with the "I've followed" recheck quick reply.
11. From the second test account, follow the connected Instagram Professional account (the follow action).
12. Tap "I've followed". Confirm Linkar rechecks the follower relationship against Meta and delivers the configured link message exactly once - this is the successful delivery.
13. Tap "I've followed" again to resend an identical recheck event; confirm it does not produce a second delivery for the same participant.
14. Pause the campaign and repeat the comment event from a third account or a fresh comment; confirm no new opening reply is sent while paused.
15. Choose **Connect Facebook Page**, complete Facebook authorization, select the test Page, and confirm webhook health reports `feed` subscribed.
16. Create and activate a Facebook comment automation pinned to that Page. From the separate Facebook account, add a top-level public comment containing the configured keyword and confirm Linkar posts exactly one public nested reply.
17. Add a Page-authored comment and a nested reply. Confirm Linkar ignores both and does not create a reply loop.

## 5. App Review submission copy

Use plain, testable language in each permission explanation:

> Linkar lets a connected Instagram Professional account owner build a follow-gated Reel campaign: a public reply and a private opening message reply to a matching comment, an explicit opt-in tap, a follower check against the account's own audience via Meta's API, and a private message with a link delivered only once Meta confirms the commenter follows the connected account. We do not generate copy with AI, scrape Instagram, or message anyone outside this explicit comment-triggered, opt-in, and follow-verified flow.

Request only the three permissions required by the product:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

For the Facebook Page flow, request only:

- `pages_show_list`
- `pages_manage_metadata`
- `pages_manage_engagement`
- `pages_read_engagement`
- `pages_read_user_content`

Use this permission explanation:

> Linkar lets a Page manager select a Facebook Page, receive top-level public comments on Page posts, and publish one configured public reply beneath a matching comment. Linkar ignores comments authored by the Page and nested comments to prevent reply loops. Linkar does not send Facebook Messenger messages or private replies.

For the reviewer instructions, provide:

- the production URL;
- reviewer credentials for the owner login: the owner email and a password created for review (never commit the plaintext password or any Meta access token to Git; rotate the password after review completes);
- the test Instagram username and login path accepted by Meta's review process for the connected Professional account;
- the second Instagram test account used to comment, noting that it does not yet follow the connected account so the reviewer can observe the false-follow prompt;
- the exact campaign name, the trigger phrase (`guide`), the opt-in button label, and the recheck button label ("I've followed");
- the expected message sequence and where to observe each step: opening private reply with opt-in button → tap opt-in → false-follow prompt with recheck button → follow the connected account → tap "I've followed" → delivered link message;
- confirmation that the delivered link is only sent once Meta's `is_user_follow_business` field returns `true` for that commenter.

Record one uninterrupted screencast covering, in order: signing in and connecting the test Instagram account, building the campaign (Reel selection, keyword `guide`, opening message, follow gate, delivery link), activating it, commenting `guide` from the second account, tapping the opt-in button, receiving the false-follow prompt, following the connected account, tapping "I've followed", and the delivered link message arriving. Do not narrate or display any access token, and do not include the reviewer password on screen.

## 6. Submission blockers to resolve before clicking Submit

- Replace every placeholder domain, email address, secret, and Meta credential.
- Confirm the OAuth redirect URI matches character-for-character, including HTTPS and path.
- Confirm the webhook endpoint is publicly reachable and returns the challenge on GET.
- Confirm the owner login redirects unauthenticated dashboard/API requests and the reviewer credentials work.
- Confirm the connected account shows its real Instagram username, proving profile lookup and webhook subscription completed.
- Confirm all five webhook fields (`comments`, `messages`, `messaging_postbacks`, `messaging_optins`, `messaging_referral`) show as subscribed for the connected account.
- Confirm the selected Facebook Page reports the `feed` webhook field and all five Facebook Page permissions are granted.
- Confirm `X-Hub-Signature-256` requests are accepted only with the correct App Secret.
- Confirm the worker is running and can reach Redis and PostgreSQL: its container healthcheck now probes `/health` on `WORKER_HEALTH_PORT` (default 3001), so the orchestrator reporting the worker healthy is sufficient evidence.
- Confirm the app is not in demo mode.
- Confirm your business, test accounts, and app roles meet Meta’s current eligibility rules.
- Capture the screencast described in section 5 in case Meta asks for one.
