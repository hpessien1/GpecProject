# Next-session handover

Last updated: 2026-10-23 (end of session). Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything up to `76d6ed6` is pushed and CI is green (run 39945525835). The last
  commit of the session (GPEC's company profile on the site, shop prices, this handover) is
  committed but **not pushed**; the user pushes, then check CI with
  `gh run list -R hpessien1/GpecProject` (the `gh` login `v25-hub` can read this repository's runs;
  it cannot push).
- **The site is live but not announced** at `https://gpecengineering.com` and
  `https://api.gpecengineering.com` (Hetzner CX23 in Nuremberg, Coolify, DNS on Cloudflare). Server,
  accounts, and the exact Coolify settings: [`docs/RUNBOOK.md`](docs/RUNBOOK.md) 1.0–1.7 and
  Section 5. The user deploys by pressing Deploy in Coolify; nothing deploys on push.
- **What is on the live site now:** the API was last deployed with "forgot password"; the website
  was **not** redeployed since then, so it lacks the forgot-password screens, the privacy notice's
  regions, and everything from the last commit. Production holds the 14 labelled sample products,
  the demo orders and contact requests (`seedDemoData.js --production`), and the user's admin
  account. Email (SES, eu-north-1, still in the sandbox) and photo uploads (S3) are on.
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1, 2, 4, and 6 are done; step 3 (deploy)
  is live with the Atlas lock-down still to do; step 5 (Paystack checkout) is next, waiting on the
  delivery fee decision and GPEC's details.
- **Company facts:** [`README.md`](README.md) "Company Profile", merged from GPEC's PDF
  (*GPEC Engineering Company Concept – Portfolio*, 2026-10-23). The PDF is in the project folder but
  **git-ignored** (23 MB, public repository); never commit it.
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack (4.1), admin access and forgot password (4.5), data
  model (5), deployment and Coolify variables (7), product photos and email (8), styling and
  contrast (9), known gaps (14), lessons learned (15).
- **Commands:** [`docs/COMMANDS.md`](docs/COMMANDS.md) lists every command, local and production.

## Decisions made with the owner (2026-10-23)

- **Content:** GPEC's profile is approved for the site: its text with light grammar corrections, its
  photos as they are (date and place stamps included, no cropping; people in them may be shown),
  the product brands visible in them, and its safety and quality wording as written. The legal name
  is **GPEC Engineering Company Limited**; the address is #19 King Slope Street, Woji, off Alcon
  Road, **Port Harcourt, Rivers State**. The hero ("Powering what comes next.") stays.
- **Twelve business areas:** the nine originals plus Installation & repairs, Generators & power, and
  Security & smart home (instrumentation sits under panels as E&I). AGENTS.md and README updated.
- **Payments:** prices in **naira (NGN)**; **customers pay the Paystack fee**, as its own line.
  Paystack publishes 1.5% + ₦100 for local payments, the ₦100 waived under ₦2,500, capped at ₦2,000
  (the user had said "1.95% or so"; GPEC must confirm the rate on its own plan).
- **Prices show in the public shop** (owner's request) once `CURRENCY=NGN` is set on the API: each
  price, "Price to be confirmed" when unpriced, and a price "each" on cart and checkout lines. No
  totals in the browser; checkout's server computes them.
- **Delivery fee rule: the user will come back on it.** Do not start checkout's delivery part
  before that (options offered: pickup only for now, one flat fee from a setting, or fees by area).
- **Demo data on the live site** for GPEC to try, removed before launch (launch checklist).
- Every account (Hetzner, Cloudflare, AWS, Paystack, Atlas) is in the project owner's name with the
  user invited as a member; the user has no Atlas dashboard access (connection string only).

## The shop and admin, as the owner wants them

- **Customers either buy or ask.** The shop is for buying through Paystack, with pickup or delivery
  (a delivery address only for delivery). Any question goes through the home page's contact form.
  There are **no order enquiries** anywhere (CLAUDE.md Lessons Learned).
- **Availability is staff's job:** archive a product to take it out of the shop, or mark it out of
  stock (switch, plus an optional stock count; customers never see the count).
- **Until Paystack is set up,** checkout shows the order and says online payment is not available
  yet, with a link to the contact form.
- **Admin tabs:** Products · Orders · Contact requests; "Forgot your password?" on the login screen
  (an emailed link, once, 30 minutes).

## This session (2026-10-22 to 2026-10-23), in order

All commits on `main`; details in each commit message and in CLAUDE.md.

1. **First deployment** with the user, step by step from screenshots: domain on Cloudflare, Hetzner
   server, Coolify, the API and website (`bd86149`, docs). Found and fixed on the way: Coolify's
   "Available at Buildtime" must be off for the API's variables.
2. Demo data allowed on the live database with `--production` (`31b0fe5`).
3. Amazon SES and S3 set up (eu-north-1, the free-plan project is locked to it); the photo key needed
   `s3:ListBucket`, or a missing photo answered 500 instead of 404 (`87281ce`).
4. "Forgot password" for admins (`5cfc6ef`).
5. Privacy notice: server and email regions (`76d6ed6`).
6. GPEC's company profile on the site and in the README; twelve areas; real photos in Services and
   Projects; footer contacts; prices in the public shop (last commit). Found and fixed: the
   Projects intro forced onto one line overflowed the page between 900 and 1180px; side-by-side
   values pulled text away from their titles; a merged ROADMAP line; a stale "(planned)" in
   ECOMMERCE_REQUIREMENTS.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript.
  - Home page: twelve business areas with GPEC's photos, About (profile, vision, mission, six
    values), Projects ("Our workmanship" and the Afrizone videos), Current Work (**still mock**),
    contact form (thirteen topics), footer with GPEC's real contacts.
  - Shop (`#shop`, checkout at `#shop/order`) with prices, draft privacy notice (`#privacy`), admin
    (`#admin`, forgot password at `#admin/forgot-password`).
  - All text meets WCAG AA contrast in every state; spam trap on the contact form.
- **Backend** (`backend/`): Express 5 + Mongoose 8, strict TypeScript. Routes in
  `backend/README.md`. Zod-validated config, helmet, per-IP rate limits, production database guard.
  `CURRENCY` decides whether prices are editable and public.
- **Tests:** 238 backend tests (Vitest, in-memory MongoDB replica set); 168 Playwright tests (desktop,
  phone, and the contrast check) against the production build with sample API data
  (`frontend/e2e/support/sampleApi.ts`; keep it in step with the API). oxlint in both packages.
- **CI** (`.github/workflows/ci.yml`): lint, type-check, build, tests, browser tests and contrast,
  Docker builds, `npm audit`, gitleaks. Never deploys.

## Environment

- **Database:** one MongoDB Atlas cluster (`gpeccluster`). `gpec_dev` locally (`backend/.env`),
  `gpec` in production (Coolify). Never paste the connection string into a chat.
- **Run locally:** `docs/COMMANDS.md`. The user runs their own dev servers on 5173 and 5001; do not
  stop them. Browser tests use port 4173 themselves.
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Before calling a change done,** run every CI step locally, lint and `npm run format:check`
  included.
- **Temporary test scripts** (screenshots, measurements) never stay in `frontend/e2e/`: the full run
  picks them up (CLAUDE.md Lessons Learned).

## Open items for the next session

1. Check CI after the user pushes. Then the user deploys **both** `gpec-api` and `gpec-web` and sets
   **`CURRENCY=NGN`** on `gpec-api` (Buildtime unticked) and redeploys it, so staff can enter prices
   and the shop shows them. Check the live shop and home page afterwards.
2. **Delivery fee decision** (the user will answer), then build step 5 checkout on the existing
   Order model (CLAUDE.md 4.1 and 8): pickup/delivery form, server-computed totals with the Paystack
   fee line (rate from configuration, never hard-coded), refuse out-of-stock products, reduce
   counted stock on payment, the same `markOrderPaid` for webhook and verify, test keys only.
3. **Finish the live setup** (the user acts in the dashboards and sends screenshots; the assistant
   guides and never deploys):
   - **Atlas lock-down** (needs the Atlas owner): `gpec-prod` / `gpec-dev` users, network access to
     `2.31.87.31` plus the user's IP, then a new `MONGODB_URI` in Coolify; also the database region
     for the privacy notice. Confirm the empty `gpec.enquiries` leftover was dropped.
   - SES: production access requested (AWS asked for details; the user replied). Once approved,
     verify by sending a `[TEST]` contact request; set `STAFF_NOTIFICATION_EMAILS` to GPEC's staff
     when named (the user's own for now). Try "forgot password" live.
   - The AWS project must move to a paid plan with a spend limit before launch (free plan ends
     2027-04-22).
4. From GPEC (ROADMAP "Needed from GPEC"): dated Current Work updates, business hours and social
   links, registration number, pickup location and hours, refund policy, the Paystack rate on its
   plan, the real product list with prices, whether Afrizone may be named, and the first video's
   sound (speech or not).
5. When GPEC's real product list arrives: enter it with `isPlaceholder: false`, archive the samples.
   **Before launch:** `seedDemoData.js --production --remove` on the live site.
6. Optional tidy-up, needing the owner's OK: the illustrative images no longer used by the site
   (`portfolio-control-panel.jpg`, `portfolio-solar-array.jpg`, `product-lineup.png`) are still
   used by the browser tests' sample data; switching the tests to the new photos would let them go.
7. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling).
8. **Working preferences:** fix problems found along the way and name them in the report (owner,
   2026-10-22); during screenshot-guided setup, answer directly and explain only real consequences.

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
