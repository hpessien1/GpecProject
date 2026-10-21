# GPEC Website Roadmap

The order of work from today to launch. Each step lists what it delivers and why it comes where it
does. Update this file as steps are completed or the plan changes.

- **Last updated:** 2026-10-21
- **Related documents:** [`README.md`](README.md) (company brief), [`ECOMMERCE_REQUIREMENTS.md`](ECOMMERCE_REQUIREMENTS.md)
  (shop and payment behaviour), [`CLAUDE.md`](CLAUDE.md) (engineering rules and known gaps)

## Status at a glance

| Step | Status |
|---|---|
| 1. Quick fixes | Done (2026-10-21) |
| 2. Groundwork: CI, hardening, tests | Done (2026-10-21) |
| 3. Deploy early on Coolify | In progress — files ready; Coolify and Atlas setup by the project owner |
| 4. Products in MongoDB | Done (2026-10-21) |
| 5. Checkout and Paystack (test mode) | Not started — needs GPEC information |
| 6. Admin panel | Done for now (2026-10-21) — order lists come with step 5 |

Already done: TypeScript conversion (frontend and backend), dependency pinning, root `.gitignore`,
`gpec_dev` / `gpec` database split with a production startup guard, backup remote on `kworlanyo`.

Also done (2026-10-21), outside the numbered steps: a site-wide text-contrast audit and fixes
(WCAG AA in every page state), a spam trap on both public forms, keyboard focus fixes in the shop,
and a draft privacy notice at `#privacy` awaiting GPEC's details. The contrast check is a project
command (`cd frontend && npm run check:contrast`); it is not in CI yet, because it needs a browser
and the running site.

CI's first run on GitHub passed (2026-10-20). Session handover notes are in
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
- [ ] Coolify on the Hetzner VPS: resources, environment variables, HTTPS, replica count 1
      (runbook Section 1). Needs the domain names.
- [ ] **Check that Coolify's `MONGODB_URI` uses `gpec`, not `gpec_dev`.** (The startup guard will
      refuse to start otherwise, as long as `NODE_ENV=production` is set.)
- [ ] Atlas: separate database users for `gpec_dev` and `gpec`; network access limited to the
      Hetzner IP and the developer's IP; a cluster tier with backups before launch.
- [ ] First deploy and the post-deploy checks in runbook Section 2.

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

- [ ] Order model, checkout form with pickup or delivery, and order summary with the Paystack fee
      line.
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
- [x] Order enquiries and contact requests for GPEC staff: newest-first lists with status filters
      and counts, detail pages with email and phone links, and a follow-up status (New, In
      progress, Closed) whose every change is recorded (who, from, to, when).
- [ ] Order lists (with step 5).
- [ ] Before launch: decide on 2FA for admins; admin account management screen (optional).

---

## Needed from GPEC

These block launch, and several block steps 4 to 6. Ask early.

- [ ] Real product list: names, specifications, photos, and **prices**.
- [ ] Currency confirmation (NGN expected). Until then admins cannot enter prices.
- [ ] Names and emails of the GPEC staff who need admin accounts.
- [ ] Privacy notice details and approval: legal company name and number, address, privacy contact
      email, how long enquiries are kept, and legal wording from their adviser (draft at `#privacy`).
- [ ] Paystack business account, and confirmation that passing the Paystack fee to customers is
      allowed under GPEC's Paystack terms.
- [ ] Delivery fee rules and delivery areas; pickup location and hours.
- [ ] Refund, cancellation, and returns policy.
- [ ] Phone, email, address, business hours, and social links for the site.
- [ ] Domain names for the website and the API (blocks the first deploy).
- [ ] Named owners and logins for Coolify, Atlas, GitHub, Paystack, and the domain registrar
      (runbook Section 5).
- [ ] Who receives order and enquiry notifications.
- [ ] Permission to name Afrizone, and approved real project photos.

## Later / not yet scheduled

- Confirmation emails to customers and notifications to GPEC staff (provider not chosen).
- File uploads on the quote form (drawings, nameplate photos).
- Navigation and page structure to match the brief (Home, About, Services, Products, Projects,
  Current Work, Contact) and all nine business areas.
- Linting and frontend tests.
- Image uploads for products (admins can only pick images already on the site).
