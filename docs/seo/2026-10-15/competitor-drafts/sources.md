# Competitor fact sheet (checked 15 October 2026)

Every fact below comes from the vendor's own public page, read on 15 October 2026 unless a different date is given. "Browser" means the page was read in a real Chrome session (Manychat blocks command-line fetches with a Cloudflare check; the check passed on its own, nothing was clicked to pass it). "Fetch" means a plain HTTPS request; the saved HTML is in `raw/`.

Prices change often. Re-check every row before publishing and at least once a quarter.

## Linkar (our product)

| Fact | Value | Source |
|---|---|---|
| Plans and monthly price | Free ₹0, Creator ₹199, Growth ₹499, Agency ₹999 | https://linkar.in/pricing (fetch, `raw/linkar_pricing.txt`); `src/lib/billing/catalog.ts` lines 4-60 |
| Annual price | Creator ₹1,990, Growth ₹4,990, Agency ₹9,990 ("Save 2 months") | `src/lib/billing/catalog.ts` (`annualPaise`); live /pricing toggle text |
| Tax | "Every price includes applicable GST." | https://linkar.in/pricing |
| Payment | Razorpay; UPI, cards and netbanking, in rupees | https://linkar.in/pricing ("Checkout" block) |
| Free plan | 1,000 deliveries a month, 5 automations, 1 Instagram account, 1 Facebook Page, 1 seat, no card | /pricing; `catalog.ts` lines 4-17 |
| Creator | 5,000 deliveries, 20 automations, 2 + 2 accounts, 2 seats, 10 sequences, tracked links | /pricing; `catalog.ts`; `prisma/seed.ts` line 8 |
| Growth | 25,000 deliveries, 50 automations, 5 + 5 accounts, 5 seats, 25 sequences, 10 broadcasts a month, exports | /pricing; `prisma/seed.ts` line 9 |
| Agency | 50,000 deliveries, 100 automations, 10 + 10 accounts, 10 seats, 50 sequences, 25 broadcasts a month | /pricing; `prisma/seed.ts` line 10 |
| Plan-gated features | Only sequences, broadcasts, tracked links, team, Facebook and exports are gated | `src/lib/entitlements/types.ts` lines 13-20; `prisma/seed.ts` lines 7-10 |
| Meter | One outbound message = one delivery; incoming is free; rejected sends are given back; resets on the 1st (UTC); at the limit sending stops, no overage | /pricing "What counts as a delivery" |
| Plan changes | Take effect at the next cycle; no proration | /pricing FAQ; https://linkar.in/refund-policy |
| Refunds | No refund for a period that has started, except duplicate charges, charges after cancellation, plans that could not be activated, or where law requires | https://linkar.in/refund-policy |
| Trial | No paid-plan trial; the Free plan is the way to try | https://linkar.in/refund-policy ("You can try every core feature on it before you pay.") |
| Instagram features | Comment to DM (posts and Reels), keyword replies, Story replies, Story mention replies, first-message welcome, email capture, follow-gated campaigns, lead qualification, DM follow-ups, human handoff, link tracking, analytics, reply variants, no-code builder, contacts | `src/content/seo/features.ts` |
| Facebook | Facebook Page public comment replies only; not Messenger DMs | `src/content/seo/features.ts` (facebook-comment-auto-reply FAQ) |
| Not offered | AI-written replies (keyword replies FAQ says "No"); DM on follow (instagram-dm-automation FAQ); WhatsApp, TikTok, Telegram, SMS, email channels (none in repo copy) | `src/content/seo/features.ts` |

## Manychat

| Fact | Value | Source |
|---|---|---|
| Plans (monthly billing) | Free $0; Essential $17; Pro $39; Business $99; Advanced $199 | https://manychat.com/pricing (browser, "Monthly" toggle) |
| Plans (annual billing) | Essential $14/mo ($168/yr, 18% off); Pro $29/mo ($348/yr, 25% off); Business $69/mo ($828/yr, 30% off); Advanced $139/mo ($1,668/yr, 30% off) | https://manychat.com/pricing (browser, default view); help article below |
| Active Contacts included each month | 25 / 250 / 2,500 / 7,500 / 25,000 | https://manychat.com/pricing |
| Extra Active Contact, monthly billing | n/a / $0.10 / $0.05 / $0.025 / $0.004 | https://manychat.com/pricing comparison table |
| Extra Active Contact, annual billing | n/a / $0.082 / $0.038 / $0.018 / $0.0028 | same |
| Active Contact definition | "One person = one Active Contact for the month"; overages are charged, automations keep running; an overage threshold can be set | /pricing FAQ |
| Tax and currency | "Prices do not include tax. The price is determined by the user's billing country." | /pricing |
| Channels | Free and Essential: any 2 of Instagram, TikTok, Facebook Messenger, Telegram. Pro: any 3 including WhatsApp, SMS, Email. Business and Advanced: all | /pricing (Wayback copy of 9 Oct 2026 and live page) |
| Free plan | 25 Active Contacts, up to 4 live triggers, 1 user, basic inbox, Manychat branding | /pricing |
| Essential | Unlimited automations, collect contact info, tags, 2 users, no branding | /pricing; help article ("lead capture tools") |
| Pro and above | Broadcasts and Manychat AI | /pricing |
| Team | Users 1 / 2 / 3 / 5 / 10; shared team inbox with assignments on Business and Advanced | /pricing |
| Trial and refunds | No card for Free; 14-day trial on Essential or Pro; refund if cancelled within 30 days of first purchase | /pricing FAQ; help article |
| Plan changes | Upgrades start immediately and are prorated; downgrades at next period | /pricing FAQ |
| Pricing model date | New model introduced 2 March 2026; older accounts move country by country | https://help.manychat.com/hc/en-us/articles/25800347122716-Manychat-subscription-How-to-choose-the-right-one-for-you (browser) |
| Instagram features | Send links, reply to comments, reply to DMs, DM new followers, collect emails and numbers, giveaways, lead magnets, bookings | https://manychat.com/product/instagram (browser) |
| Follow check | "Request to Follow" use case | https://get.manychat.com/use-case/request-to-follow (browser) |
| Email capture triggers | "comments, keywords, Story replies, or links"; sync to CRM or email platform | https://get.manychat.com/use-case/collect-emails (browser) |
| Partner status (their claim) | "Official Meta Business Partner" | /pricing FAQ |
| Archived copy | Same prices on 9 Oct 2026 | https://web.archive.org/web/20261009114350/https://manychat.com/pricing (`raw/mc_pricing.txt`) |

## Zorcha (registered in India)

| Fact | Value | Source |
|---|---|---|
| Company | "Zorcha is proudly made and registered in India"; Zorcha Software Pvt Ltd | https://zorcha.com/ (FAQ JSON-LD and footer) |
| Free | ₹0: unlimited automations, unlimited DMs, unlimited contacts, Ask for Follow, basic analytics, AI FAQ (20 FAQs), link in bio | https://zorcha.com/in/pricing/ (fetch) |
| Pro | ₹1,199/mo monthly; ₹899/mo billed quarterly; ₹799/mo billed yearly. Adds collect phone/email, follow up, basic flow builder, advanced analytics | same |
| Ultimate | ₹2,999/mo (₹2,249 quarterly, ₹1,999 yearly). Adds advanced flow builder, integrations, broadcasts | same |
| Business | ₹8,999/mo (₹6,999 quarterly, ₹5,999 yearly). Adds AI conversation with a knowledge base | same |
| Tax | Not stated on the pricing page; FAQ says GST invoices are available | https://zorcha.com/ FAQ |
| Has a vs Manychat page | "Free Manychat Alternative: Zorcha vs Manychat (2026)", reviewed 28 Sep 2026 | https://zorcha.com/compare/manychat/ |

## SuperProfile (Cosmofeed Technologies Pvt. Ltd.)

| Fact | Value | Source |
|---|---|---|
| Company | "SuperProfile by Cosmofeed Technologies Pvt. Ltd."; India page title "Complete Toolkit for Creators In India" | https://superprofile.bio/in (fetch) |
| Starter (free) | Link-in-bio store, unlimited AutoDMs on Reels and Posts, up to 10 leads with lead magnets, "Advanced AutoDM flows (ask to follow, email collection etc.)", monetisation apps | https://superprofile.bio/in/pricing (fetch and browser) |
| Creator | "Starts at ₹99 for first month, then ₹499". Adds AutoDM across posts, Stories and Lives, follow-ups, up to 5 Instagram accounts, unlimited leads, scheduler, AI replies, comment moderation | same |
| Pro | "Let's talk" (custom) | same |
| Tax | Not stated | same |

## Interakt (Jio Haptik Technologies Limited)

| Fact | Value | Source |
|---|---|---|
| Company | "© Jio Haptik Technologies Limited" | https://www.interakt.shop/pricing/ footer |
| Starter | ₹999/mo (+taxes), one channel; with Instagram chosen: "Includes Instagram Only" | https://www.interakt.shop/pricing/ (browser, Monthly toggle) |
| Growth | ₹2,799/mo (+taxes), WhatsApp and Instagram | same |
| Advanced | ₹3,799/mo (+taxes), WhatsApp and Instagram | same |
| Enterprise | On request | same |
| Instagram features | Unlimited DMs and comments, "Price Please" automation, giveaway automation, custom auto replies, shared inbox for Instagram DMs and comments | same; https://www.interakt.shop/instagram-automation/ |
| WhatsApp cost | Template messages charged per message (for example Marketing ₹0.970 on Growth) | same |
| Free plan | None shown; "Start Free Trial" | same |

## InstantDM (INR pricing offered; company location not stated on the pages checked)

| Fact | Value | Source |
|---|---|---|
| Free | ₹0: 500 DM automations a month, 5 automated posts, 3 trigger words per automation, AI comment replies, 1 Instagram account | https://instantdm.com/pricing (fetch; INR values in `data-inr-*` attributes) |
| Legend Pro | ₹999/mo monthly or ₹833/mo billed yearly ($12 or $9.99). Unlimited automation up to 800 an hour, Instagram and Facebook, Story, Live and next-post automation, email and phone capture, follow gate | same; plan table rows parsed from `aria-label` values |
| Trendsetter | ₹1,999/mo or ₹1,666/mo yearly ($29.99 or $24.99). Flow Editor with AI agent, ads automation, API access | same |
| Trendsetter Pro | ₹4,999/mo or ₹4,165/mo yearly ($59.99 or $49.99) | same |
| Free-plan limits on features | Story replies, DM keywords, follow gate, email capture and Facebook are "Not included" on Free | same, plan table |
| Trial | 7-day free trial on paid plans; no card for Free | same |
| Payments | Stripe and Razorpay | https://instantdm.com/privacy |
| Tax | Not stated | same |

## Demand signals (qualitative only, no volumes)

Google autocomplete with `gl=in`, `hl=en`, 15 Oct 2026 (`raw/autocomplete_in.txt`):

- "manychat alternative india", "manychat alternative indian", "manychat alternative for instagram india"
- "manychat india pricing", "manychat pricing plan india", "manychat subscription india"
- "manychat competitors in india", "manychat indian alternative", "indian manychat"
- "manychat vs superprofile", "manychat vs linkdm", "manychat vs creator flow", "manychat vs chatfuel"
- "manychat free alternative", "manychat free plan limit", "is manychat free", "is manychat safe"
- "instagram automation tool india", "instagram automation tool kaise use kare"

Autocomplete shows that a query exists, not how often it is searched. Search Console has 0 impressions for linkar.in, and DataForSEO is not installed, so no volume or difficulty data was available.
