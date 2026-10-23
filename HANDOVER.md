# Next-session handover

Last updated: 2026-10-23 (end of session: admin pagination). Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything up to `7dbbae0` is pushed and CI is green (run 40004439376, 3 min 39 s).
  Two commits come after it and are **not pushed**: `9cf7fc1` (the previous handover) and the admin
  pagination commit. The user pushes, then check with `gh run list -R hpessien1/GpecProject` (the
  `gh` login `v25-hub` can read this repository's runs; it cannot push). Every CI step passed
  locally on the pagination commit.
- **The live site is a test environment until the owner says it is production ready** (owner,
  2026-10-23). GPEC's team uses it to see how everything behaves and knows not to use it for real
  business. So: every feature comes with demo data there too (`seed:demo`), sample values are
  labelled rather than blocked, and "replace/remove before launch" goes on the launch checklist
  (CLAUDE.md Section 7). Real-money safety still holds: Paystack test keys only.
- **Live addresses:** `https://gpecengineering.com` and `https://api.gpecengineering.com` (Hetzner
  CX23 in Nuremberg, Coolify, DNS on Cloudflare). Server, accounts, and exact Coolify settings:
  [`docs/RUNBOOK.md`](docs/RUNBOOK.md). The user deploys by pressing Deploy in Coolify; nothing
  deploys on push.
- **What is deployed:** the website and API were last deployed at `48beb9d` (company profile,
  prices). **Checkout, delivery areas, bank transfer, the new demo data, and admin pagination are not
  deployed yet** (open item 1). Production has `CURRENCY=NGN`, email (SES, eu-north-1, still in the sandbox), and
  photo uploads (S3).
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1, 2, 4, 5 (built, test mode), and 6 are
  done; step 3 (deploy) is live with the Atlas lock-down still to do.
- **Company facts:** [`README.md`](README.md) "Company Profile", from GPEC's PDF (git-ignored, 23 MB,
  public repository; never commit it).
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack and bank transfer (4.1), admin access (4.5), data
  model (5), deployment, launch checklist, and CI (7), email and photos (8), styling and contrast
  (9), known gaps (14), lessons learned (15). Every command: [`docs/COMMANDS.md`](docs/COMMANDS.md).

## Decisions made with the owner (2026-10-23)

- **Content:** GPEC's profile is approved as written (light grammar fixes), its photos as they are.
  Legal name **GPEC Engineering Company Limited**; address #19 King Slope Street, Woji, off Alcon
  Road, **Port Harcourt, Rivers State**, which is also the **pickup location**. Twelve business areas.
- **Payments:** prices in **naira (NGN)**; **customers pay the Paystack fee** as its own line (rule
  from the five `PAYSTACK_*` settings; Paystack's published rate 1.5% + ₦100, ₦100 waived under
  ₦2,500, capped at ₦2,000; GPEC to confirm its plan). In Paystack's dashboard, *Preferences*:
  "Pass transaction fees to customers" stays **unticked** (the site adds the fee itself; ticking it
  would charge twice), American Express stays off (4.5% uncapped).
- **Delivery fees by area** (chosen over km-based fees: no mapping service, no customer addresses
  sent to one). Staff manage areas and fees at `#admin/delivery`; a per-product "Delivery
  available" switch makes a product pickup only.
- **Bank transfer** (owner's request, adapted from Vision 25): Nigerian details only (bank, account
  name, 10-digit NUBAN; offered only with NGN); no processing fee; the customer gets the details and
  the order reference as narration and can press "I have sent the transfer"; staff confirm on the
  order that the money arrived, or close it as not received **by hand** (no automatic expiry); stock
  is not held while waiting. Every change to the bank details is recorded and emailed to all admins.
- **Sample bank details** ("Sample Bank (not real)", `0000000000`) are what the screen starts with,
  labelled "do not send money" everywhere; usable on the live site while it is tested.
- Every account (Hetzner, Cloudflare, AWS, Paystack, Atlas) is in the project owner's name with the
  user invited; the user has no Atlas dashboard access.

## The shop and admin, as the owner wants them

- **Customers either buy or ask.** Buy in the shop (Paystack or bank transfer; pickup or delivery,
  a delivery area and address only for delivery); questions go through the contact form. **No order
  enquiries** anywhere.
- **Availability is staff's job:** archive a product, or mark it out of stock (switch, optional
  count; customers never see the count). Paid orders reduce counted stock.
- **Admin tabs:** Products · Orders · Delivery · Bank details · Contact requests.
- **Pagination** (owner, 2026-10-23: "look at what is on the shop page and implement same or better"):
  **ten per page** everywhere in the admin, chosen so the demo data shows the paging; the shop's
  numbered page buttons; "Showing 11–12 of 12 orders" on every list.

## Latest session (2026-10-23, after the handover above was first written): admin pagination

The three main admin lists already had server-side pages (50 or 25 per page, Previous/Next only), but:
change histories stopped silently at the newest 50 entries and staff notes at 100 (every paid order
adds a "Sold online" entry to each counted product, so price changes would drop out of sight); the
delivery-area list had no pages; and opening an item and going back reset the list to page 1 with
the filter and search cleared.

Built (one commit):
- **Backend:** `ADMIN_PAGE_SIZE = 10` and the paging helpers in `backend/src/utils/paging.ts`; list
  replies add `pageSize`; delivery areas are paged (`?page=`); one `pageNumber` check
  (`validation/fields.ts`) for every list. Histories (`services/auditHistory.ts`, shared by products,
  orders, contact requests, delivery areas, bank details) and notes (`services/staffNotes.ts`) are paged
  by **cursor** (`?before=`, validated in `validation/olderPage.ts`): the record's reply carries the
  newest page and `historyCursor`/`notesCursor`; new routes `GET …/orders/:ref/history|notes`,
  `GET …/contact-requests/:ref/history|notes`, `GET …/bank-transfer/history`. A cursor rather than a
  page number, so a sale or note added while staff read never shows an entry twice.
- **Frontend:** `components/Pagination.tsx`, the shop's control made shared (shop and the four admin
  lists): every page number when there are up to 7, otherwise `1 … 5 6 7 … 12`, wrapping on phones.
  `components/admin/AdminOlderEntries.tsx` adds "Show older changes/notes" under every history and
  notes list (focus kept; "That is every change, back to the first." when done; errors shown with a
  retry). `utils/rememberedState.ts` keeps each list's page, filter, and search in memory while an
  item is open (cleared on login); a remembered page past the end shows the last page.
  `utils/paging.ts` writes the "Showing …" line (the shop uses it too).
- **Tests:** backend `tests/olderPages.test.ts` (paging to the oldest entry, same-millisecond entries,
  an entry added between pages, bad cursors, 404s, admin only) plus list-size updates; browser
  `e2e/adminPaging.spec.ts` (20 tests); a new contrast part "admin pages and older entries". Planted
  faults (cursor tie-break removed, "Show older" replacing instead of adding, list memory not saved,
  pale "Show older" text) each turned a test red.

## Earlier that day (2026-10-23), in order

1. Checked: `48beb9d` pushed, CI green, both resources redeployed, live API on NGN.
2. **Checkout with Paystack** (test mode), delivery areas, the "Delivery available" switch, and
   **bank transfer** (`3b3ad8e`). Tested against a stand-in Paystack only.
3. **Demo data for the shop** and sample bank details (`600a9cf`): `seed:demo` now adds 10 delivery
   areas across Nigeria, demo prices on 13 sample products, two bank-transfer orders, and switches
   bank transfer on with the sample details. Found and fixed: saving only "switch on" stored blank
   bank details.
4. **Secret scan fix** (`8e8c74d`): gitleaks flagged made-up Paystack keys in the tests; tests now use
   `sk_test_fake`-style values, and `.gitleaksignore` lists exactly the three old findings.
5. **Faster CI** (`7dbbae0`): browser jobs run in Playwright's pinned image (installing Chromium had
   taken 8 minutes), as two jobs side by side (behaviour tests; contrast), and the contrast check is
   14 self-contained parts. Whole run: about 15 minutes → **3 min 39 s**.

Also found and fixed: a stale admin price hint, stale "orders appear once Paystack is set up" text,
the contrast checker reading radio values as text, the admin order page showing a Paystack fee line
on transfers, a cut-off admin label, and a number sent as an account number clearing it.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript. Home page (twelve areas, About,
  Projects, Current Work **still mock**, contact form), shop (`#shop`), checkout (`#shop/order`),
  payment result (`#shop/payment/<reference>`; Paystack returns to `/shop/payment-complete`, which
  `main.tsx` turns into that route), draft privacy notice (`#privacy`, now covering orders,
  Paystack, and bank transfer), admin (`#admin`).
- **Backend** (`backend/`): Express 5 + Mongoose 8. Routes in `backend/README.md`. Checkout in
  `services/checkout.ts` (one `settleOrder` for Paystack and confirmed transfers), Paystack calls
  only in `services/paystack.ts`, fee rule `services/paystackFee.ts`, signed idempotent webhook.
- **Tests:** 395 backend tests (Vitest, in-memory MongoDB); Playwright against the production build
  with sample API data: 228 behaviour tests at desktop and phone (plus 2 skipped, as before) and 16
  contrast tests (8 parts at 2 widths)
  (`frontend/e2e/support/sampleApi.ts`; keep it in step with the API).
- **CI** (`.github/workflows/ci.yml`): lint, type-check, build, tests, two browser jobs, Docker
  builds, `npm audit`, gitleaks. Never deploys. Upgrading `@playwright/test` means updating the
  browser job's image tag and digest too (a CI step fails if they differ).

## Environment

- **Database:** one Atlas cluster. `gpec_dev` locally (`backend/.env`), `gpec` in production
  (Coolify). Never paste a connection string or key into a chat.
- **Local Paystack:** the user was adding the test key and fee settings to `backend/.env`; the
  backend log said "Online payment is off", so they were not being read yet (likely not saved,
  commented out, in the wrong file, or the backend not restarted: `tsx watch` does not reload on
  `.env` changes). Once read, the log says `Paystack is in test mode: no real money moves.` Ask
  before reading `.env`; list setting names only, never values.
- **Run locally:** `docs/COMMANDS.md`. The user runs their own dev servers on 5173 and 5001; do not
  stop them. Browser tests use 4173. Docker works on this machine (useful to try CI images).
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Before calling a change done,** run every CI step locally. Read the whole Playwright summary,
  not just the last lines (failures print above the "passed" line).
- **Temporary test scripts** never stay in `frontend/e2e/`; use the scratchpad.

## Open items for the next session

1. **Deploy and fill the live site** (the user acts in Coolify; the assistant guides):
   - Add the five `PAYSTACK_*` settings to `gpec-api` (runtime only, Buildtime unticked; values in
     RUNBOOK 1.8), and set the **test** webhook URL in Paystack to
     `https://api.gpecengineering.com/api/paystack/webhook`.
   - Deploy `gpec-api`, then `gpec-web`.
   - In the `gpec-api` terminal: `node dist/scripts/seedDemoData.js --production --remove`, then
     `node dist/scripts/seedDemoData.js --production` (refreshes the demo orders with delivery areas
     and adds the new demo data).
   - Check: delivery areas and bank details in the admin; a pickup and a delivery order in the shop;
     a Paystack **test-card** payment end to end (returns to "Your order is paid", order in Orders,
     emails arrive); a bank-transfer order, "I have sent the transfer", then "Confirm transfer
     received" in the admin. This is the first test against Paystack's real test API.
2. **Unused illustrative images** (`portfolio-control-panel.jpg`, `portfolio-solar-array.jpg`,
   `product-lineup.png`): the user asked to remove them, but the backend's sample products
   (`data/sampleProducts.ts`) and five products in both databases use them, so deleting them would
   break those photos. Recommended: keep them until GPEC's real products replace the samples.
   Waiting on the user's choice.
3. **Finish the live setup:** Atlas lock-down (needs the Atlas owner: `gpec-prod`/`gpec-dev` users,
   network access, new `MONGODB_URI`, database region for the privacy notice); SES production access
   (requested; then a `[TEST]` contact request and "forgot password" live); AWS paid plan before
   2027-04-22; 2FA on the Paystack account (its dashboard asks for it).
4. **From GPEC** (ROADMAP "Needed from GPEC"): real bank details, real delivery areas and fees,
   collection hours, the Paystack rate on its plan, real products with prices, dated Current Work
   updates, business hours and social links, registration number, refund policy, whether Afrizone
   may be named, the first video's sound.
5. **Before launch** (CLAUDE.md Section 7 checklist): real bank details, demo data removed
   (`seedDemoData.js --production --remove`), samples archived, live Paystack keys only with GPEC's
   approval, and a decision on admin 2FA (an admin login can now confirm payments and change the bank
   account).
6. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling).
7. After deploying, check the pagination on the live admin: with the demo data, Products (14) and
   Orders (12) show two pages; Delivery (10 areas) shows one.

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
