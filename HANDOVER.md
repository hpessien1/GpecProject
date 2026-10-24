# Next-session handover

Last updated: 2026-10-24 (end of session: project clips, contact-form files, reply-to address,
order update emails, product categories).
Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything is pushed up to `12ab46c` and CI is green (run 40132472294, 6 min 3 s).
  The user pushes; check with `gh run list -R hpessien1/GpecProject` (the `gh` login `v25-hub` can
  read this repository's runs; it cannot push). This handover's own commit comes after it.
- **The live site is a test environment until the owner says it is production ready** (owner,
  2026-10-23). GPEC's team uses it to see how everything behaves. So: every feature comes with demo
  data there too (`seed:demo`), sample values are labelled rather than blocked, and "replace/remove
  before launch" goes on the launch checklist (CLAUDE.md Section 7). Real-money safety still holds:
  Paystack test keys only.
- **Live addresses:** `https://gpecengineering.com` and `https://api.gpecengineering.com` (Hetzner
  CX23 in Nuremberg, Coolify, DNS on Cloudflare). Server, accounts, and exact Coolify settings:
  [`docs/RUNBOOK.md`](docs/RUNBOOK.md). The user deploys by pressing Deploy in Coolify; nothing
  deploys on push.
- **What is deployed:** everything up to `9f7750a` (checkout in Paystack test mode, delivery areas,
  bank transfer, site content, two-step login; the user reported the deploy and its checks done on
  2026-10-24). **Not deployed yet:** everything from this session (open item 1).
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1, 2, 4, 5 (test mode), and 6 are done;
  step 3 (deploy) is live with the Atlas lock-down still to do.
- **Company facts:** [`README.md`](README.md) "Company Profile", from GPEC's PDF (git-ignored, 23 MB,
  public repository; never commit it).
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack and bank transfer (4.1), admin access and two-step
  login (4.5), audit trail (4.6), data model (5), deployment, launch checklist, and CI (7), email,
  order update emails, photos, and contact-form files (8), styling and contrast (9), product
  catalogue checklist (11), known gaps (14), lessons learned (15). Every command:
  [`docs/COMMANDS.md`](docs/COMMANDS.md).

## This session (2026-10-24, second half), in order

1. **Project clips** (`e54b37c`): on screens wider than about 1700px the three videos ran past the
   bottom of their box and were cut off; the box and the gallery now have rows of fixed height. The
   browser test had measured the gallery (which overflowed with them) and now measures the visible
   box, at 1920 and 2560px too.
2. **Files on the contact form** (`e54b37c`; CLAUDE.md Section 8): optional photos and PDFs, up to 5
   of 10 MB each, seen only by staff on the request page (photos open, PDFs always download). Photos
   are re-saved without camera details; PDFs checked and stored as sent; private bucket folder
   `request-files/`. New package `multer` 2.5.0 (approved; 2.4.0 has a high-severity advisory).
   Demo requests DE000002 and DE000004 get sample files. Privacy notice starting text updated.
3. **Reply-to address** (`f144b0c`): customer emails (contact, paid order, bank transfer) reply to an
   address staff set in a new admin tab, *Emails* (`#admin/emails`); GPEC's published Gmail address
   until changed. Recorded and emailed to all admins, like bank details. Forwarding the sending
   address with Cloudflare Email Routing was considered and **skipped** (user: the reply-to is
   enough; steps kept, marked optional, in RUNBOOK 1.6 step 9).
4. **Order update emails** (`c21f084`): moving an order to ready for pickup, out for delivery, or
   cancelled, and closing an unpaid transfer, email the customer unless staff untick "Tell the
   customer by email" (ticked by default; the user's choice over automatic). The order history shows
   "Customer emailed". Contact-request status changes still email nobody.
5. **Product categories** (`12ab46c`): the home page's four Products cards now all carry GPEC's own
   photos and open the shop filtered (`#shop/category/solar`); the shop has All plus four filter
   links with counts; staff choose a category in the product form (recorded); uncategorised
   products appear only under All. The seed command fills in missing categories on sample products
   only (the user's choice).

Also answered: SES production access (requested 2026-10-23) usually takes up to a day, AWS quotes up
to 96 hours; check the support case for questions if nothing by about 2026-10-27. No need to
upgrade the AWS plan for it now (it is on the launch checklist anyway).

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript. Home page (twelve areas, About,
  Products cards, Projects, FAQ, contact form with optional files), shop (`#shop`,
  `#shop/category/<category>`), checkout (`#shop/order`), payment result
  (`#shop/payment/<reference>`; Paystack returns to `/shop/payment-complete`, which `main.tsx`
  turns into that route), policies (`#privacy`, `#refunds`, text from the API), admin (`#admin`,
  tabs Products, Orders, Delivery, Bank details, Contact requests, Site content, Emails).
- **Backend** (`backend/`): Express 5 + Mongoose 8. Routes in `backend/README.md`. Checkout in
  `services/checkout.ts`, Paystack only in `services/paystack.ts`, site content in
  `services/siteContent.ts`, two-step login in `services/twoFactor.ts`, contact-form files in
  `services/requestFiles.ts` (photo re-saving shared in `services/photos.ts`), reply-to in
  `services/customerEmail.ts`, all emails in `services/notifications.ts` and `emailTemplates.ts`.
- **Tests:** 529 backend tests (Vitest, in-memory MongoDB); Playwright against the production build
  with sample API data: 315 behaviour tests at desktop and phone (plus 3 skipped: 2 from before and
  the attach button's keyboard check, desktop only) and 20 contrast tests (10 parts at 2 widths)
  (`frontend/e2e/support/sampleApi.ts`; keep it in step with the API).
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
  stop them (stop only your own, by port). Browser tests use 4173. Docker works on this machine.
- **While the user's Vite server runs,** edit frontend files with the Edit tool, not scripts that
  rewrite them (check with `curl -s localhost:5173/src/<file> | wc -c`; a types-only file is
  served as `export {};`, which is normal).
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Before calling a change done,** run every CI step locally, look at screenshots of every new
  screen at desktop and 390px, read the whole Playwright summary, and break the code once to see
  each new test fail.
- **Temporary test scripts** never stay in `frontend/e2e/`; use the scratchpad.

## Open items for the next session

1. **Deploy this session's work** (the user acts; the assistant guides), in this order:
   - **First, AWS IAM:** add `arn:aws:s3:::gpec-product-images/request-files/*` to the
     `gpec-product-images` key's policy (RUNBOOK 1.7, step 3). Without it, contact requests with
     files fail (without files they work) and the demo command below fails storing files.
   - Deploy `gpec-api`, then `gpec-web`.
   - In the `gpec-api` terminal (the owner's go-ahead, CLAUDE.md Section 11):
     `node dist/scripts/seedProducts.js --production` (no remove step: it only fills in missing
     categories on the sample products), then
     `node dist/scripts/seedDemoData.js --production --remove` and
     `node dist/scripts/seedDemoData.js --production` (demo files; resets the demo records;
     reports "Attached 3 sample files").
   - Privacy notice: if it was already saved in *Site content*, add the attachments wording there
     (bullet under "What we collect and why", and two changes under "Who can see your
     information"; text in `backend/src/data/siteContentDefaults.ts`). A saved copy does not update.
   - Check: *Emails* shows the right reply-to inbox; a `[TEST]` contact request with a photo and a
     PDF (the photo opens, the PDF downloads; try a phone); each order update email on a demo order
     with an SES-verified address (sandbox); the home page's four product cards and the shop filters.
2. **Illustrative images** (`portfolio-control-panel.jpg`, `portfolio-solar-array.jpg`,
   `product-lineup.png`, and `electrical-panels-product.png`, whose source is unknown): kept while
   the sample products and the Services panel use them; remove when GPEC's real products and
   photos replace them.
3. **Later (user, 2026-10-24):** raise the remaining small text (button text 0.76rem, form hints
   0.75–0.78rem, a few admin labels 0.72–0.75rem) to match the 0.8rem labels.
4. **Later (user, 2026-10-24) — finish the live setup:** Atlas lock-down (needs the Atlas owner:
   `gpec-prod`/`gpec-dev` users, network access, new `MONGODB_URI`, database region for the privacy
   notice); SES production access (requested 2026-10-23); AWS paid plan before 2027-04-22; 2FA on
   the Paystack account.
5. **From GPEC** (ROADMAP "Needed from GPEC"): approval of the refunds policy, FAQ, and privacy
   notice (every [bracket] filled in, including how long attached files are kept); real bank
   details; delivery areas and fees; collection hours (the "ready for pickup" email could then state
   them); the Paystack rate on its plan; real products with prices and categories; business hours
   and social links; registration number; whether Afrizone may be named; the first video's sound.
6. **Before launch** (CLAUDE.md Section 7 checklist): the policies approved, real bank details, demo
   data removed, samples archived, every admin using two-step login, live Paystack keys only with
   GPEC's approval.
7. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling).

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
