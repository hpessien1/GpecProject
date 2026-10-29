# Next-session handover

Last updated: 2026-10-29 (end of session: the **second security audit** started; three of its five
findings fixed and committed locally, **not pushed or deployed**; the first audit stays closed).
Earlier: 2026-10-28, everything up to `0c9b03a` pushed, CI green, deployed by the user.
Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything up to `0c9b03a` is pushed, CI green (run 40677641975). **Not pushed
  yet** (the user pushes): `6eb3e61` (first audit close-out docs), `ca9f1ad` (S2-M04),
  `e485181` (S2-M02), and the S2-M01 commit with this handover. Locally on 2026-10-29: backend 676
  tests, lint, type-check, build (after S2-M01); browser 367 (+5 skipped), contrast 20, frontend
  lint, type-check, format, build (after S2-M02; S2-M01 changed no frontend code). The user pushes; check with
  `gh run list -R hpessien1/GpecProject` (the `gh` login `v25-hub` can read this repository's runs;
  it cannot push).
- **The live site is a test environment until the owner says it is production ready** (owner,
  2026-10-23). GPEC's team uses it to see how everything behaves. So: every feature comes with demo
  data there too (`seed:demo`), sample values are labelled rather than blocked, and "replace/remove
  before launch" goes on the launch checklist (CLAUDE.md Section 7). Real-money safety still holds:
  Paystack test keys only.
- **Live addresses:** `https://gpecengineering.com` and `https://api.gpecengineering.com` (Hetzner
  CX23 in Nuremberg, Coolify, DNS on Cloudflare). Server, accounts, and exact Coolify settings:
  [`docs/RUNBOOK.md`](docs/RUNBOOK.md). The user deploys by pressing Deploy in Coolify; nothing
  deploys on push.
- **What is deployed:** everything up to `0c9b03a` (both `gpec-api` and `gpec-web`, 2026-10-28,
  the user). The three second-audit fixes need a deploy of both (`gpec-web` for the security log's
  counted entries) once pushed and CI is green.
- **Two owner steps from this session, not confirmed done** (ask the user): RUNBOOK 1.2 item 7 (a
  1 GB memory limit on `gpec-api` in Coolify, audit M-04) and item 8 (check that port 5001 on the
  server's IP cannot be reached directly, audit M-08: the per-visitor limits trust the proxy's
  address).
- **Admin roles are planned** (user, 2026-10-27): two people run the admin side today; GPEC intends
  to add roles that can do some admin functions but not all. Design new admin features so they can be
  limited per role later (only `admin` exists now; the security log stays with full admins).
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1, 2, 4, 5 (test mode), and 6 are done;
  step 3 (deploy) is live with the Atlas lock-down still to do.
- **Company facts:** [`README.md`](README.md) "Company Profile", from GPEC's PDF (git-ignored, 23 MB,
  public repository; never commit it).
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack and bank transfer (4.1), admin access and two-step
  login (4.5), audit trail and security log (4.6), data model (5), deployment, launch checklist, and
  CI (7), email, order update emails, photos, and contact-form files (8), styling and contrast (9),
  product catalogue checklist (11), known gaps (14), lessons learned (15). Every command:
  [`docs/COMMANDS.md`](docs/COMMANDS.md).

## This session (2026-10-28, second half)

1. **Close as not paid** (`1d680dd`, user's choice of three options): on an unpaid Paystack order,
   "The customer did not pay" asks Paystack once more and, only if no payment is found, marks the
   order "Payment failed" (confirmed in the dialog; AuditRecord `order.close`). A late payment still
   counts: `markOrderPaid` accepts `failed` orders.
2. **Admin header** (`db2159e`, `9a1be26`): the admin's name is a "Logged in as" label at the end of
   the row, not a link; at 1100px and below the tabs go into a Menu button, as on the public site.
3. **Security audit, last code fixes:** M-05 (`bcd6fad`, contact-form PDFs rebuilt from their pages
   by `services/pdfs.ts`; password-protected ones refused; no virus scanner, see below), L-02
   (`6dbbcb3`, `utils/emailBudget.ts`), L-03 (`0c9b03a`, `tidyPassword` in `services/passwords.ts`),
   and L-01 (local file permissions, nothing committed; now in CLAUDE.md 4.8 and COMMANDS).
4. **Audit closed** (the user, after CI and deploy): the Atlas lock-down and how long customer data
   is kept are deferred, in CLAUDE.md Known Gaps and the Section 7 launch checklist.

## Earlier this session (2026-10-28), in `5211d2c`

1. **Security log: date filter and pages** (user's request). "From" and "To" date boxes with "Show
   these dates" on the same line (user's follow-up), alongside the account list; numbered pages
   ("Showing 1–10 of N entries") instead of "Show older entries". The days are counted on the
   admin's own calendar, because the log shows times in the admin's own time zone: the site sends
   the start of the first day and the start of the day after the last (`?from=`/`?to=`, `to`
   excluded); the server refuses malformed or reversed ranges. Trade-off of numbered pages: an entry
   recorded while staff read can appear twice across pages (never skipped), as in the other lists.
2. **Completed and Cancelled are final** (user's decision, option 1 of three offered: confirm, then
   lock; no reopening). The server refuses any later change (`409 ORDER_CLOSED`); the order screen
   shows a note instead of the status list. **Cancelling returns stock** (user's choice): exactly
   what the order's `product.sale` records took, as `product.restock` under the admin who cancelled,
   in the same transaction ("Returned to stock · order … cancelled by …" in the product's history).
   Orders cancelled before this change got nothing back. Two staff cancelling at once return the
   stock once (the transaction restarts the later one; tested).
3. **Confirmation dialog** (user's request, replacing `window.confirm`):
   `components/admin/ConfirmDialog.tsx`, a native `<dialog>` with `showModal()`, used for Completed,
   Cancelled, and "Close as not received". It lists what follows (cannot be undone, stock put back,
   the website does not refund, whether the customer is emailed); answers say what they do
   ("Cancel order" / "Keep order"); focus starts on the safe answer; Tab wraps between the two
   buttons (the native dialog alone let Tab reach the browser's toolbar); Escape and a click outside
   keep the order; full width along the bottom on phones. CLAUDE.md Section 9 now says to use it,
   never `window.confirm`.

## Security audit (2026-10-26 to 2026-10-28, closed)

The user had an outside assessment written to `SECURITY_AUDIT_FIRST.md` at the repository root. **It
is git-ignored on purpose (`34b7eab`): it describes weaknesses still open and the repository is
public. Never commit it; read it locally.** Its "Remediation Status" table at the top says what is
fixed (with commits) and what is open; each fixed finding has a Status line.

**How the user wants each finding handled:** pick the next one, explain in plain terms why the fix
is needed, and **wait for the user's confirmation before changing anything**. Then write tests that
fail first, fix, break each safeguard to see a test fail, run every CI step locally (one suite at a
time), look at screenshots of changed screens at desktop and 390px, update CLAUDE.md /
`backend/README.md` / `ECOMMERCE_REQUIREMENTS.md` / RUNBOOK and the audit file's status, and commit
only when asked.

**Closed 2026-10-28.** Every finding the code could fix is fixed, tested, and deployed. If someone
raises a new finding, handle it the same way. Fixed, committed, and deployed:

- 2026-10-26: H-01 (`b342b0f`), M-01 (`1481f43`), M-03 (`2027a69`), M-02 (`b2eae90`; the user chose
  to include "transfer received"). What each does for staff is in CLAUDE.md Section 4.5 (search for
  "audit finding").
- 2026-10-27:
  - **M-07** (`f64aab4`): a Paystack webhook event is marked processed only once the order is
    settled, so Paystack's retry finishes interrupted work; staff have a "Check payment with
    Paystack" button on unpaid Paystack orders. No automatic periodic check (user's choice).
  - **M-04** (`556a844`): contact-form uploads limited before they are read: 25 MB of files per form
    (the user lowered it from 50), one upload per sender, 3 at once site-wide, 5 minutes to arrive;
    photos re-saved one at a time.
  - **Photo preview** on the contact form (`0773e95`, user's request).
  - **M-08** (`be9c89d`): the catalogue and site content kept for 30 s, the health check for 5 s,
    product photos in a 50 MB memory cache; per-visitor budgets for public reads.
  - **M-06** (`ed9463e`): a **Security log** tab in the admin panel (logins and failures, account
    changes, wrong re-entered passwords, refused origins, the admin command, and each order, contact
    request, or file staff open), kept 12 months (user's choice). The privacy notice was left
    unchanged: the user decided it is for customers, not staff.

- 2026-10-28: **M-05** (`bcd6fad`), **L-02** (`6dbbcb3`), **L-03** (`0c9b03a`); **L-01** local only.
  M-05 has no virus scanner: ClamAV needs more memory than the 4 GB server has, and GuardDuty is not
  offered on the AWS account's plan. The user tells GPEC's staff to scan PDFs on their own computers
  before opening them.

Deferred (not code; the user's decision at close-out): **H-02** (the Atlas owner, RUNBOOK 1.1) and
**data retention** (GPEC sets the periods, then the clean-up is built). Owner steps from the fixes, not
confirmed done: RUNBOOK 1.2 items 7 and 8.

## Previous session (2026-10-25/26), in order

1. **Phone menu** (`1c9024e`): the open hamburger menu fills the screen below the header (in the
   hero's navy, the hero's text used to show beneath it); the page behind stays still; Escape or
   tabbing out of the header closes it. **Colours:** `#ff8b1f` and `#0a225f` became `--lime-bright`
   and `--ink-light`.
2. **Tab icon** (`a4c8739`): `frontend/public/favicon.ico` (16/32/48) and `apple-touch-icon.png`,
   the helmet from GPEC's flat logo on a white tile (the blue circuit vanishes on dark tabs without
   it). Browsers cache icons: a hard refresh or a new tab shows it. Docs: 2FA key and Afrizone.
3. **Paystack test payments:** a ₦1,962,000 test order was refused as "Insufficient Funds" with the
   *success* test card (ending 4081); ₦27,000 went through. An undocumented limit of Paystack's test
   system, not a site problem; RUNBOOK 1.8 says to keep test orders small.
4. **Bank-transfer actions on an admin order** (`9ad9f63`, the user found them confusing): one
   question, "Did the money arrive?", with two boxes ("Yes, it arrived" with the checkbox and
   Confirm; "No, it did not arrive" with "Tell the customer by email" and a real "Close the order as
   not received" button). Confirming always emails the customer their order confirmation (while
   email is on); found and fixed: the success message claimed an email even with email off.
5. **Tests froze the laptop:** measuring Vitest's default (a test file per core, each with an
   in-memory MongoDB) took free memory from 13 GB to under 2 GB in about 8 s and froze the machine;
   the session restarted. Vision 25 had the same problem (it batches its tests). Local runs are now
   capped at four (`maxWorkers` in `backend/vitest.config.ts`, `workers` in
   `frontend/playwright.config.ts`; CI keeps its defaults): backend peak 2.5 GB in 90 s, browser
   tests about 4 GB in 2.1 min, contrast 2.6 min. **Run the three test commands one after another,
   never together, and never above the cap** (CLAUDE.md Lessons, `docs/COMMANDS.md` Section 3).
6. **Paystack payment methods explained for GPEC** (`5b052ce`): card, bank, transfer, and USSD, set
   in GPEC's Paystack dashboard (the code passes no list), in `ECOMMERCE_REQUIREMENTS.md` Section 6.
7. **Email provider alternatives** to SES (only if Amazon refuses production access): prices checked
   on each provider's own page, kept in Claude's memory, not in the repository. Recommendation: stay
   on SES.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript. Home page (twelve areas, About,
  Products cards, Projects, FAQ, contact form with optional files), shop (`#shop`,
  `#shop/category/<category>`), checkout (`#shop/order`), payment result
  (`#shop/payment/<reference>`; Paystack returns to `/shop/payment-complete`, which `main.tsx`
  turns into that route), policies (`#privacy`, `#refunds`, text from the API), admin (`#admin`,
  tabs Products, Orders, Delivery, Bank details, Contact requests, Site content, Emails, Security
  log; the last with a date filter and numbered pages). Steps that cannot be undone are confirmed
  in `components/admin/ConfirmDialog.tsx`.
- **Backend** (`backend/`): Express 5 + Mongoose 8. Routes in `backend/README.md`. Checkout in
  `services/checkout.ts`, Paystack only in `services/paystack.ts`, site content in
  `services/siteContent.ts`, two-step login in `services/twoFactor.ts`, contact-form files in
  `services/requestFiles.ts` (photo re-saving shared in `services/photos.ts`, PDFs rebuilt in `services/pdfs.ts`), reply-to in
  `services/customerEmail.ts`, all emails in `services/notifications.ts` and `emailTemplates.ts`,
  security log in `services/securityLog.ts`, short-lived public copies in `utils/freshness.ts`.
- **Tests:** 660 backend tests (Vitest, in-memory MongoDB); Playwright against the production build
  with sample API data: 365 behaviour tests at desktop and phone (plus 5 skipped: width-specific
  checks that apply to only one of the two projects) and 20 contrast
  tests (10 parts at 2 widths) (`frontend/e2e/support/sampleApi.ts`; keep it in step with the API).
- **CI** (`.github/workflows/ci.yml`): lint, type-check, build, tests, two browser jobs, Docker
  builds, `npm audit`, gitleaks. Never deploys. Upgrading `@playwright/test` means updating the
  browser job's image tag and digest too (a CI step fails if they differ).

## Environment

- **Database:** one Atlas cluster. `gpec_dev` locally (`backend/.env`), `gpec` in production
  (Coolify). Never paste a connection string or key into a chat.
- **Local settings the user may still need to add to `backend/.env`** (ask before reading `.env`;
  list setting names only, never values; the backend must be restarted after editing it, `tsx watch`
  does not reload `.env`):
  - `TWO_FACTOR_ENCRYPTION_KEY` (`openssl rand -base64 32`) for the authenticator-app option.
  - The Paystack test key and fee settings: on 2026-10-23 the log still said "Online payment is off".
  - The four `S3_*` settings: without them the local contact form offers no attachments (the dev
    API answered `fileUploads: false` on 2026-10-24). The key needs `request-files/*` too.
- **Local data:** run `npm run seed:products` once to give the `gpec_dev` sample products their
  categories, and `npm run seed:demo -- --remove` then `npm run seed:demo` for the demo files (only
  with the `S3_*` settings).
- **Run locally:** `docs/COMMANDS.md`. The user runs their own dev servers on 5173 and 5001; do not
  stop them (stop only your own, by port or process ID, never `pkill -f`). Browser tests use 4173.
  Docker works on this machine.
- **The laptop has 22 cores and 30 GB, often with much of it in use.** Run test suites one at a
  time; never raise the worker caps or run tests at Vitest's or Playwright's defaults here.
- **While the user's Vite server runs,** edit frontend files with the Edit tool, not scripts that
  rewrite them (check with `curl -s localhost:5173/src/<file> | wc -c`; a types-only file is
  served as `export {};`, which is normal).
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Before calling a change done,** run every CI step locally, look at screenshots of every new
  screen at desktop and 390px, read the whole Playwright summary, and break the code once to see
  each new test fail.
- **Temporary test scripts** never stay in `frontend/e2e/`; use the scratchpad. (A screenshot spec
  can run from the scratchpad with its own Playwright config that sets `testDir`, the web server's
  `cwd` to `frontend/`, and imports `@playwright/test` by absolute path.)
- **paystack.com/docs blocks automated reading;** `docs-v2.paystack.com` works but may be older.

## Open items for the next session

0. **Second security audit** (2026-10-28): `SECURITY_AUDIT_SECOND.md` at the repository root,
   git-ignored like the first; never commit it, and keep its details out of committed files. Handled
   the same way as the first (above: explain in plain terms, wait for the user's go-ahead, tests that
   fail first, break each safeguard, all checks one suite at a time, commit only when asked).
   Progress is in its "Remediation Status" table. Fixed 2026-10-29: S2-M04 (contact-form PDFs,
   `ca9f1ad`), S2-M02 (security log counts repeated refusals, `e485181`; the user chose 5 per
   address per 15 minutes), S2-M01 (turning on two-step login, committed with this handover).
   **Next: S2-M03** (password-reset confirmation), then **S2-L01**, which needs a decision from GPEC
   or the user before any code. After the commits: **push** (the user), check CI, deploy both
   resources (the user), then set the commits in the audit's status table.
1. **Ask whether RUNBOOK 1.2 items 7 and 8 were done** (Coolify memory limit; API port not reachable
   directly). **GPEC staff:** the live privacy notice's sentence about PDFs (Site content) should
   now say that PDF documents are rebuilt from their pages, which removes anything that could run
   when the file is opened, as well as hidden details such as its author.
2. **Waiting on GPEC:** which Paystack payment methods to keep (card, bank, transfer, USSD). The user
   is asking them with the explanation in `ECOMMERCE_REQUIREMENTS.md` Section 6. When they answer:
   GPEC switches methods in its Paystack dashboard; update that section, ROADMAP, and CLAUDE.md's
   open decisions. Also confirm that Verve cards are accepted (not checked in Paystack's docs).
3. **Tidy-up on the live site:** delete the `[TEST]` contact request from the 2026-10-24 deploy check
   if it is still there (only a check; CLAUDE.md Section 10.3; needs the user, in the database), and
   drop the empty `enquiries` collection in `gpec` (CLAUDE.md Known Gaps).
4. **SES production access** (requested 2026-10-23): if nothing by now (2026-10-27), check the AWS
   support case for questions. Alternatives only if refused (see item 7 above).
5. **Illustrative images** (`portfolio-control-panel.jpg`, `portfolio-solar-array.jpg`,
   `product-lineup.png`, and `electrical-panels-product.png`, whose source is unknown): kept while
   the sample products and the Services panel use them; remove when GPEC's real products and
   photos replace them.
6. **Later (user, 2026-10-24) — finish the live setup:** Atlas lock-down (most important; needs the
   Atlas owner: `gpec-prod`/`gpec-dev` users, network access, new `MONGODB_URI`, database region for
   the privacy notice); an Atlas tier with backups; AWS paid plan before 2027-04-22; 2FA on the
   Paystack account (its dashboard shows a banner asking for it).
7. **From GPEC** (ROADMAP "Needed from GPEC"): approval of the refunds policy, FAQ, and privacy
   notice (every [bracket] filled in, including how long customer data and attached files are
   kept, which the deferred clean-up then follows); real bank
   details; delivery areas and fees; collection hours (the "ready for pickup" email could then state
   them); the Paystack rate on its plan, for every payment method kept; real products with prices
   and categories; business hours and social links; registration number; the first video's sound.
8. **Before launch** (CLAUDE.md Section 7 checklist): the policies approved, real bank details, demo
   data removed, samples archived, every admin using two-step login, live Paystack keys only with
   GPEC's approval.
9. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling).

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
