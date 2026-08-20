# ReplyConnect Meta App Review runbook

This runbook is for the first production deployment of ReplyConnect. Meta’s dashboard labels and permission requirements can change, so confirm the current product documentation and the scopes shown in your app before submitting.

Reference the current [Meta Instagram Private Replies collection](https://www.postman.com/meta/instagram/request/23987686-189d7215-22b3-403f-b2f5-a46c7e66a514) and [Meta comment webhook example](https://www.postman.com/meta/instagram/request/23987686-db99ce99-bf76-475c-8b76-718576c11cae) while validating the live payloads.

## 1. Prepare the business and test accounts

Use the business owner’s Meta developer account to create and own the app. Do not use a throwaway personal account as the long-term app owner. Keep a separate Instagram Professional test account for the reviewer and a second Instagram account that can comment or send a DM during testing.

Before requesting advanced access, make sure:

- the app has a recognizable name, icon, contact email, privacy URL, terms URL, and data-deletion instructions URL;
- the connected Instagram account is eligible for the current Instagram Login/Business Login product flow;
- the business has completed Meta Business Verification if Meta requests it;
- the production domain is verified in the Meta Business settings when required;
- the reviewer can sign in without an invitation that expires during review.

## 2. Deploy the app before submission

Set these production values on the web app and worker:

```dotenv
APP_NAME=ReplyConnect
NEXT_PUBLIC_APP_URL=https://app.example.com
SUPPORT_EMAIL=support@example.com
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_TOKEN_ENCRYPTION_KEY=<64 hex characters from openssl rand -hex 32>
META_REDIRECT_URI=https://app.example.com/api/meta/oauth/callback
META_VERIFY_TOKEN=<long random verify token>
META_API_VERSION=v25.0
META_SCOPES=instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages
```

Run the migration and start both processes:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm start
pnpm worker
```

Use a process manager to keep the web app and worker alive. Do not run production with demo mode, an ephemeral filesystem, or a development URL.

## 3. Configure the Meta app

In the Meta developer dashboard, configure the Instagram Login/Business Login for Instagram product using the current product name shown in the dashboard.

Use these deployed URLs:

| Meta field | ReplyConnect URL |
| --- | --- |
| OAuth redirect URI | `https://app.example.com/api/meta/oauth/callback` |
| Webhooks callback URL | `https://app.example.com/api/meta/webhook` |
| Data deletion callback URL | `https://app.example.com/api/meta/data-deletion` |
| Privacy policy URL | `https://app.example.com/privacy` |
| Terms URL | `https://app.example.com/terms` |
| Data deletion instructions URL | `https://app.example.com/data-deletion` |
| Support URL | `https://app.example.com/support` |

Set the webhook verify token in the dashboard to the same value as `META_VERIFY_TOKEN`. Subscribe only to the comment and messaging fields needed by the current product flow. Request only the permissions required by the MVP:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

The code does not request publishing, insights, ads, or unrelated permissions. If Meta presents a renamed or replacement scope, update `META_SCOPES` and the App Review explanation together.

## 4. Verify the deployed app yourself

1. Call `GET https://app.example.com/api/health`; confirm the response reports `configured`.
2. Open `/privacy`, `/terms`, `/data-deletion`, and `/support` in a private browser window. Confirm they load without login and use the final business contact details.
3. Open Settings and choose **Connect Instagram**.
4. Complete the official Meta login with the test Instagram Professional account.
5. Confirm the callback returns to Settings and shows the account as connected.
6. Create this automation:
   - Trigger: Instagram comment
   - Match: keyword `guide`
   - Action: private reply or link DM, using a real test URL
7. Activate the automation.
8. From the second Instagram test account, comment `guide` on the selected test post.
9. Confirm the configured reply arrives once. Send a second identical event only to confirm deduplication; it must not produce a second reply for the same provider event ID.
10. Create an inbound-DM keyword rule such as `price`, send that DM from the second test account, and confirm the exact configured response.
11. Pause the automation and repeat the event; confirm no new reply is sent.

## 5. App Review submission copy

Use plain, testable language in each permission explanation:

> ReplyConnect lets a connected Instagram Professional account owner create explicit keyword or any-message rules. When Meta sends a comment or inbound-message webhook, ReplyConnect evaluates the saved rule and sends the exact reply configured by the account owner. We do not generate copy with AI, scrape Instagram, or send follower blasts.

For the reviewer instructions, provide:

- the production URL;
- the test Instagram username and login path accepted by Meta’s review process;
- the second account to use for a comment/DM event, if Meta allows it;
- the exact automation name and trigger phrase (`guide` or `price`);
- the expected reply text and where to observe it;
- a note that follower-to-DM automation is intentionally not part of this submission.

## 6. Submission blockers to resolve before clicking Submit

- Replace every `example.com` and placeholder email/domain.
- Confirm the OAuth redirect URI matches character-for-character, including HTTPS and path.
- Confirm the webhook endpoint is publicly reachable and returns the challenge on GET.
- Confirm `X-Hub-Signature-256` requests are accepted only with the correct App Secret.
- Confirm the worker is running and can reach Redis and PostgreSQL.
- Confirm the app is not in demo mode.
- Confirm your business, test accounts, and app roles meet Meta’s current eligibility rules.
- Capture a short screen recording of the reviewer flow in case Meta asks for one.
