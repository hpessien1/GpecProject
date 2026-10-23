# GPEC Website Roadmap

The order of work from today to launch. Each step lists what it delivers and why it comes where it
does. Update this file as steps are completed or the plan changes.

- **Last updated:** 2026-10-23
- **Related documents:** [`README.md`](README.md) (company brief), [`ECOMMERCE_REQUIREMENTS.md`](ECOMMERCE_REQUIREMENTS.md)
  (shop and payment behaviour), [`CLAUDE.md`](CLAUDE.md) (engineering rules and known gaps)

## Status at a glance

| Step | Status |
|---|---|
| 1. Quick fixes | Done (2026-10-21) |
| 2. Groundwork: CI, hardening, tests | Done (2026-10-21) |
| 3. Deploy early on Coolify | Live (2026-10-22), not announced — Atlas users and access list still needed |
| 4. Products in MongoDB | Done (2026-10-21) |
| 5. Checkout and Paystack (test mode) | Not started — needs GPEC information |
| 6. Admin panel | Done for now (2026-10-21) — order lists come with step 5 |

Already done: TypeScript conversion (frontend and backend), dependency pinning, root `.gitignore`,
`gpec_dev` / `gpec` database split with a production startup guard, backup remote on `kworlanyo`.

Also done (2026-10-21), outside the numbered steps: a site-wide text-contrast audit and fixes
(WCAG AA in every page state), a spam trap on both public forms, keyboard focus fixes in the shop,
and a draft privacy notice at `#privacy` awaiting GPEC's details. Then: oxlint in both packages, Playwright
browser tests for the frontend, the contrast check and browser tests in CI, and the menu matching the
brief (Home · About · Services · Products · Projects · Current Work · Contact, plus Shop), with a
hamburger menu on tablets and phones and new About and Current Work sections awaiting GPEC's content. Later the same day: all nine business areas on the home page, and email
notifications through Amazon SES (staff notification and customer confirmation for each enquiry and
contact message), built and off until GPEC's SES account exists. Then: an interactive Services
showcase (choose any of the nine areas to feature it; "Learn more" opens the contact form with its
topic chosen) and one contact-form topic per business area. Last that day: the stylesheet cleaned
and split by area (`frontend/src/styles/`, admin styles loaded only with the admin screens),
checked for zero visual change; `/api/health` now checks the database; the illustrative portfolio
cards no longer claim to be GPEC's work.

CI's first run on GitHub passed (2026-10-20); latest green run on commit `55542da` (2026-10-22). Session handover notes are in
[`HANDOVER.md`](HANDOVER.md).

---

## 1. Quick fixes

Small, visible problems that are cheap to fix now.

- [x] Order confirmation no longer says the backend is "not connected". It now gives the reference
      and says a GPEC representative will follow up.
- [x] Landing-page contact form sends to the backend and is saved. New route
      `POST /api/contact-requests` (reference `GPEC-C-YYYY-XXXXXXXX`); the form shows the reference
      on success, keeps the entered values with a clear message on failure, and moves keyboard focus
      to the result.
- [x] Stop tracking `frontend/dist` and `.DS_Store` in git.

Found along the way and fixed: network failures showed the browser's raw "Failed to fetch"; both
forms now show a readable message.

## 2. Groundwork: CI, hardening, tests

The safety net that has to exist before any payment code is written.

- [x] GitHub Actions CI on every push and pull request (`.github/workflows/ci.yml`): type-checks,
      builds, tests, dependency audit, and a gitleaks secret scan. First run on GitHub passed.
- [x] Backend hardening: configuration validated at startup (`src/config.ts`), security headers
      (`helmet`), `trust proxy` in production, per-IP rate limits on both form routes (10 per 15
      minutes in production).
- [x] Automated backend tests: 34 tests (Vitest, Supertest, in-memory MongoDB) covering
      configuration, security headers, CORS, rate limits, and both form routes.

Not done in this step (moved to "Later"): a linter, frontend tests, and bot protection beyond rate
limits.

## 3. Deploy early on Coolify

Prove the deployment path before payments. Paystack's webhook also needs a public HTTPS address.

- [x] Dockerfiles (2026-10-21): `backend/Dockerfile` and `frontend/Dockerfile` with nginx, security
      headers, and a Content-Security-Policy. Both built and checked locally: database guard, health
      checks, non-root users, clean shutdown, and both forms working through the containers.
- [x] CI builds both Docker images on every push, so a broken Dockerfile fails before deploy.
- [x] Short runbook: [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — Atlas and Coolify setup, deploy, roll
      back, common problems. The payments section is filled in during step 5.
- [x] Domain `gpecengineering.com` on Cloudflare; Hetzner CX23 server in Nuremberg; Coolify with its
      dashboard on HTTPS and port 8000 closed (2026-10-22, runbook 1.0).
- [x] Coolify resources `gpec-api` and `gpec-web` from the public repository, deployed by hand
      (no auto-deploy). Checked from outside on 2026-10-23: `/api/health` ok, HTTPS and redirects,
      security headers, the site built with the right API address, CORS.
- [x] **Coolify's `MONGODB_URI` uses `gpec`, not `gpec_dev`** (the health check passes, which the
      startup guard only allows on `gpec`).
- [ ] Atlas: separate database users for `gpec_dev` and `gpec`; network access limited to the
      Hetzner IP and the developer's IP; a cluster tier with backups before launch. **Needs the
      Atlas owner**; production uses the developer's shared login until then.
- [ ] Remaining post-deploy checks (runbook Section 2): a `[TEST]` contact request on the live
      site, then deleted; first admin account (runbook 1.4).
- [ ] Sample products and demo orders and contact requests on the live site for GPEC to try (owner's
      choice, 2026-10-23; runbook 1.5). **Remove the demo records before launch.**

The project owner deploys; the AI assistant prepares files and instructions only.

## 4. Products in MongoDB

- [x] Product model (`models/Product.ts`) and `GET /api/products`. Price is stored as an integer in
      the smallest currency unit (kobo if NGN is confirmed), empty until GPEC sets it, and not sent
      to the shop until step 5 configures the currency. Products are archived, never deleted.
- [x] Duplicated catalogue files removed; the shop loads products from the API, with loading,
      error, and empty states, and enquiries look products up in the database.
- [x] Seed script (`npm run seed:products`): adds the 14 sample products, never overwrites, refuses
      the production database without `--production`. The shop labels them as samples.
- [ ] Replace the samples with GPEC's real product list when it arrives (needs GPEC).

## 5. Checkout and Paystack (test mode)

Follows the payment rules in `CLAUDE.md` Section 4.1 and `ECOMMERCE_REQUIREMENTS.md`.

- [x] Checkout page in place: shows the order and says online payment is not available yet, with a
      link to the contact form (2026-10-22). The shop's order enquiry form was removed.
- [ ] Order model, checkout form with pickup or delivery, and order summary with the Paystack fee
      line. Refuse out-of-stock products on the server; paid orders reduce counted stock.
- [ ] Paystack initialize, redirect, callback verify, and signed webhook — one shared "mark paid"
      function.
- [ ] Tests for tampered prices, currency mismatch, replayed webhooks, and double submission.
- [ ] Live keys only with GPEC's approval.

## 6. Admin panel

- [x] Admin login at `#admin` (2026-10-21): email and password (scrypt), server-side sessions in a
      secure cookie, strict failed-login limit, accounts created by command only. No customer
      accounts. 2FA left out for now by the user's choice.
- [x] Product and price management: create, edit, archive; every change and its history record are
      saved together (who, old value, new value, when). Prices need the `CURRENCY` setting, which
      stays unset until GPEC confirms the currency.
- [x] Each admin changes their own password in the panel (other sessions end); every command is
      listed in [`docs/COMMANDS.md`](docs/COMMANDS.md).
- [x] Contact requests for GPEC staff (order enquiries were removed on 2026-10-22: customers buy
      in the shop or ask through the contact form): newest-first lists with status filters
      and counts, detail pages with email and phone links, and a follow-up status (New, In
      progress, Closed) whose every change is recorded (who, from, to, when).
- [x] Search the request lists by reference, customer name, company, or email, and add internal
      staff notes to any request (who and when shown; notes cannot be edited or deleted)
      (2026-10-22).
- [x] Out-of-stock switch and optional stock count per product; out-of-stock products stay in the
      shop, labelled, and cannot be added to the cart (2026-10-22).
- [x] Orders tab (2026-10-22): the Order model, list with stages, search, and counts, detail page
      (items, totals, pickup or delivery, payment), fulfilment status with history, and notes.
      Checkout (step 5) will create real orders; demo orders exist in `gpec_dev` (`npm run seed:demo`).
- [x] Larger text: labels, table headings, badges, and codes in the admin and on the public pages
      raised to about 12px at the owner's request (2026-10-22); two layout faults found and fixed
      (home page panels section between 821 and 1170px; shop header at 320px).
- [ ] Before launch: decide on 2FA for admins; admin account management screen (optional).
- [x] Product photo uploads from the admin's own device (laptop, phone, or tablet), with a preview:
      checked, resized, and stored in a private Amazon S3 bucket (2026-10-22). Off until GPEC's
      bucket exists.
- [x] "Forgot password" for admins (2026-10-23): an emailed link that works once for 30 minutes,
      the same reply for any address, its own limits, and a reset logs out everywhere and emails the
      admin. The command (`admin:create -- --reset`) stays as a fallback.

---

## Needed from GPEC

These block launch, and several block steps 4 to 6. Ask early.

- [ ] Real product list: names, specifications, photos, and **prices**.
- [ ] One photo per business area for the Services showcase (areas 2–9 show labelled illustrative
      images until then).
- [ ] Currency confirmation (NGN expected). Until then admins cannot enter prices.
- [ ] Names and emails of the GPEC staff who need admin accounts.
- [ ] Content for the About section (background, registrations, location) and approved
      current-work updates with dates. Unlabelled mock content fills both until then.
      **Replace both before launch**
      (`frontend/src/data/landingContent.ts`).
- [ ] Whether the first project video's sound contains speech (captions needed if so).
- [ ] Privacy notice details and approval: legal company name and number, address, privacy contact
      email, how long enquiries are kept, and legal wording from their adviser (draft at `#privacy`).
- [ ] Paystack: the account exists in test mode with the developer invited (2026-10-22); still
      needed: business verification, the fee rule from GPEC's plan, and confirmation that passing
      the Paystack fee to customers is allowed under GPEC's Paystack terms.
- [ ] Delivery fee rules and delivery areas; pickup location and hours.
- [ ] Refund, cancellation, and returns policy.
- [ ] Phone, email, address, business hours, and social links for the site. Mock, unreachable
      details are in the footer until then; **replace before launch**.
- [x] Domain names: `gpecengineering.com` and `api.gpecengineering.com` (2026-10-22).
- [ ] Named owners at GPEC for each account, and incident owners (runbook Section 5). For now every
      account is in the project owner's name, with the developer invited.
- [ ] Atlas owner: create the `gpec-prod` and `gpec-dev` users and limit network access (runbook
      1.1).
- [ ] Upgrade the AWS project from the free plan to a paid plan with a spend limit before launch.
- [ ] Who receives order and contact-request notifications (`STAFF_NOTIFICATION_EMAILS`; the
      developer's address for now).
- [x] Amazon SES: domain verified, sending key, email on in production (2026-10-23, eu-north-1).
      Production access requested; until AWS approves it, only verified addresses get mail.
- [x] S3 bucket for product photos and its key, uploads on in production and tested (2026-10-23).- [ ] Permission to name Afrizone, and approved real project photos.

## Later / not yet scheduled

- File uploads on the quote form (drawings, nameplate photos).
