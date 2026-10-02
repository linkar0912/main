# Isolated runtime checks

Production server: localhost:3100; database/Redis disabled. External browser requests were aborted. This used a local build whose NEXT_PUBLIC variables could already have been inlined at build time; absence of a session, not live authentication, was tested.

- `/`: HTTP 200.
- `/pricing`: HTTP 200.
- `/login`: HTTP 200.
- `/signup`: HTTP 200.
- `/dashboard`: redirected to the login screen.
- `/api/workspace/bootstrap`: HTTP 401, Unauthorized.
- `/contacts`, `/insights`, `/quick-automation`: HTTP 200, stayed on their own URLs, displayed the application shell and Unauthorized/bootstrap errors.

Chrome refused the Razorpay script under the response CSP:

```text
Loading the script 'https://checkout.razorpay.com/v1/checkout.js' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' https://*.googletagmanager.com". The action has been blocked.
```

Restarting the same build with GA_MEASUREMENT_ID=G-AUDITRUNTIME produced:

| Path | Status | Runtime ID present | gtag loader present |
|---|---|---|---|
| / | 200 | false | false |
| /pricing | 200 | false | false |
| /login | 200 | true | true |

These values are synthetic. No real analytics collection or payment was attempted.
