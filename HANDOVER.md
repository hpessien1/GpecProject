# Next-session handover

Last updated: 2026-10-23. Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything up to `55542da` is pushed and CI is green (run 39802616748). The
  last commit of the session (font sizes, two layout fixes, this handover) is committed but **not pushed**;
  the user pushes, then check CI with `gh run list -R hpessien1/GpecProject` (the `gh` login
  `v25-hub` can read this repository's runs; it cannot push).
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md).
  - Done: step 1 (quick fixes), step 2 (CI, hardening, tests), step 4 (products in MongoDB),
    step 6 (admin panel: products, prices, stock, photos, orders, contact requests).
  - Step 3 is **live but not announced** (2026-10-22): `https://gpecengineering.com` and
    `https://api.gpecengineering.com` on a Hetzner CX23 with Coolify, DNS on Cloudflare. Details,
    accounts, and the exact Coolify settings are in [`docs/RUNBOOK.md`](docs/RUNBOOK.md) 1.0–1.3
    and Section 5.
  - Waiting on GPEC: step 5, Paystack checkout (currency, Paystack account and fee rule, delivery
    fees, pickup location). Everything else for checkout is ready to build on: the Order model,
    the admin Orders screens, and the Checkout page that currently says payment is not available.
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack (4.1), admin access (4.5), data model (5), product
  photos and email (8), styling and contrast (9), known gaps (14), lessons learned (15).
- **Commands:** [`docs/COMMANDS.md`](docs/COMMANDS.md) lists every command, local and production.

## The shop and admin, as the owner wants them (corrected 2026-10-22)

- **Customers either buy or ask.** The shop is for buying through Paystack, with pickup or delivery
  (a delivery address only for delivery). Any question goes through the home page's contact form.
  There are **no order enquiries** anywhere (removed; CLAUDE.md Lessons Learned).
- **Availability is staff's job:** archive a product to take it out of the shop, or mark it out of
  stock (switch, plus an optional stock count; customers never see the count). Out-of-stock
  products stay visible, labelled, and cannot be added to the cart.
- **Until Paystack is set up,** checkout shows the order and says online payment is not available
  yet, with a link to the contact form.
- **Admin tabs:** Products · Orders · Contact requests.
  - Orders: list with a stage per order (Awaiting payment, Payment failed, New, Processing, Ready
    for pickup or Out for delivery, Completed, Cancelled; the owner chose this payment + fulfilment
    model), search, counts, detail page with items, totals, pickup/delivery, payment, a status menu
    (paid orders only), history, and notes. Payment status is never changed by staff.
  - Contact requests: search, status (New, In progress, Closed), history, notes.
  - Products: prices (need `CURRENCY`), stock, photo upload with preview (needs S3).
- **Demo data is loaded in `gpec_dev`** (owner's request, for showing GPEC the screens): 10 orders
  in every stage and 8 contact requests, realistic and unmarked on screen, with `example.com`
  emails and `+234 000` phones. `cd backend && npm run seed:demo -- --remove` deletes exactly them;
  remove them before GPEC enters real data there. The command refuses the `gpec` database.

## This session (2026-10-22), in order

All commits on `main`; details in each commit message and in CLAUDE.md.

1. Admin search and internal notes on requests.
2. Admin passwords: Show/Hide button; new passwords checked against Have I Been Pwned's free
   Pwned Passwords API (user-approved; only a 5-character hash prefix leaves the server); a live
   "9 of 15 characters" counter. ("Forgot password" followed on 2026-10-23.)
3. Product photo uploads to a private Amazon S3 bucket via the API, resized and re-encoded with
   `sharp` (user-approved), with previews. Off until GPEC's S3 bucket exists (RUNBOOK 1.7). The CSP
   now allows images from the API and `blob:`; `e2e/csp.spec.ts` checks the real policy.
4. The same GPEC logo in every header, from small WebP copies (the 1.1 MB PNG stays as the source).
5. Order enquiries removed; stock handling; Checkout page.
6. Order model, Orders screens, demo data (`npm run seed:demo`).
7. CI: fixed a lint error, and updated `actions/checkout` to v7.0.1 and `actions/setup-node` to
   v7.1.0 (Node 24; CI green).
8. Larger admin text: field labels, table headings, badges, product codes, list details, form
   labels, and the header's "Admin" label went from about 9–10px to about 11.5–12px; the line above
   an order's total now runs the full width (also on phones).
9. Larger text on the public pages too: 36 sizes under 0.7rem (home, shop, header, footer) raised
   to about 0.72rem; only the decorative hero illustration label stays small. A sweep at 320–1440px
   found two older layout faults, both fixed: the home page's panels section crushed its text
   column between 821 and about 1170px (now stacked up to 1100px, and the heading sizes to its
   column above that), and the shop header at 320px in checkout was 5px too wide.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript.
  - Home page: nine business areas, About, Projects, Current Work, contact form (ten topics).
  - Shop (`#shop`, checkout at `#shop/order`), draft privacy notice (`#privacy`), admin (`#admin`).
  - All text meets WCAG AA contrast in every state; spam trap on the contact form.
- **Backend** (`backend/`): Express 5 + Mongoose 8, strict TypeScript. Routes in
  `backend/README.md`. Zod-validated config, helmet, per-IP rate limits, production database guard.
  - An admin account exists in `gpec_dev` (the user's). Accounts are made by `npm run admin:create`.
  - `CURRENCY` is unset until GPEC confirms it (no prices until then).
  - Email (Amazon SES) and photo storage (Amazon S3) are built but **off** until GPEC's AWS
    account exists (RUNBOOK 1.6 and 1.7).
- **Tests:** 216 backend tests (Vitest, in-memory MongoDB replica set); 140 frontend Playwright
  tests (2 run at one width only) plus the contrast check, against the production build with
  sample API data (`frontend/e2e/support/sampleApi.ts`; keep it in step with the API). oxlint in
  both packages.
- **CI** (`.github/workflows/ci.yml`): lint, type-check, build, tests, browser tests and contrast,
  Docker builds, `npm audit`, gitleaks. Never deploys.

## Environment

- **Database:** one MongoDB Atlas cluster. `gpec_dev` locally (`backend/.env`), `gpec` in production
  (Coolify). Never paste the connection string into a chat. GPEC intends to start on the free M0
  tier (0.5 GB, 10 GB out per week, 4 daily snapshots at most).
- **Run locally:** `docs/COMMANDS.md`. The user runs their own dev servers on 5173 and 5001; do not
  stop them. If a newly added API route answers "Route not found", the user's `tsx watch` missed
  the change: ask them to restart `npm run dev`. Browser tests use port 4173 themselves.
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Before calling a change done,** run every CI step locally, lint included (a missed lint run
  failed CI once this session).

## Open items for the next session

1. Check CI after the user pushes the last commit.
2. **Finish the live setup** (the user does each step in the dashboards and sends screenshots; the
   assistant guides and never deploys):
   - Post-deploy checks: a `[TEST]` contact request on the live site, then deleted; the first admin
     account from the `gpec-api` terminal (RUNBOOK 1.4). Whether to show the sample products is
     GPEC's call (1.5).
   - **Atlas is not locked down** (CLAUDE.md Known Gaps): production uses the user's own Atlas
     login, which reaches both databases, and the user has no Atlas dashboard access. The Atlas
     owner must create `gpec-prod` / `gpec-dev` and limit network access to `2.31.87.31` plus the
     user's IP; then replace `MONGODB_URI` in Coolify and redeploy the API.
   - The user was advised to drop the empty `gpec` database (only an empty `enquiries`
     collection left from the removed feature); confirm it was done.
   - The owner chose (2026-10-23) to load the sample products and the demo orders and contact
     requests on the live site so GPEC can try it: `seedProducts.js --production`, then (after the
     admin account) `seedDemoData.js --production` in the `gpec-api` terminal (RUNBOOK 1.5).
     **Before launch, `seedDemoData.js --production --remove`** (CLAUDE.md launch checklist).
3. **AWS, region eu-north-1 (Stockholm; the free-plan project is locked to it):** the user has
   member access to the project owner's AWS Settings project (free plan until 2027-04-22; the owner
   must upgrade before launch). Done 2026-10-23: SES domain verified (DKIM, DMARC), production
   access requested (up to 96 hours), sending key and email settings in Coolify; S3 bucket
   `gpec-product-images`, key (with `s3:ListBucket`, RUNBOOK 1.7), and settings in Coolify; a live
   photo upload worked. Still to do: verify a staff
   address in SES and send a `[TEST]` contact request; set `STAFF_NOTIFICATION_EMAILS` to GPEC's
   staff once they say who (it is the user's own for now). The privacy notice names the server and
   email regions (2026-10-23); the Atlas owner must supply the database region. "Forgot password" for admins was built on 2026-10-23 (CLAUDE.md 4.5); try it
   on the live site once your address is verified in SES (deploy the API and the site first).
4. Paystack: the user has test-mode access as a member. When GPEC confirms the details, build step 5 checkout on the existing Order model (CLAUDE.md 4.1 and
   8): checkout form with pickup or delivery, server-computed totals, refuse out-of-stock products,
   reduce counted stock on payment, the same `markOrderPaid` for webhook and verify, test keys only.
   Confirm with GPEC: currency, delivery fee rule, Paystack fee rule, pickup location and hours.
5. Ask GPEC for everything in ROADMAP.md "Needed from GPEC" (real About, Current Work, contact
   details, product list with prices, photos, privacy details, refund policy).
6. When GPEC sends its real product list, enter it with `isPlaceholder: false`, archive the samples,
   and remove the demo data from `gpec_dev`.
7. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling): align the
   breakpoints; optionally turn the two repeated hex colours into variables.
8. **Working preference (owner, 2026-10-22):** fix problems found along the way instead of logging
   them in Known Gaps; still say in the report what was found and fixed.

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
