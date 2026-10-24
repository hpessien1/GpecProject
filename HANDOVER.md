# Next-session handover

Last updated: 2026-10-24 (home page changes, site content, two-step login, fonts; later: project
clips fix and files on the contact form).
Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything is pushed up to `9f7750a` and CI is green (run 40086446507, 5 min 57 s).
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
- **What is deployed:** everything up to `9f7750a` (the user reported the deploy and its checks
  done on 2026-10-24): Paystack test settings and `TWO_FACTOR_ENCRYPTION_KEY` in Coolify, the test
  webhook URL in Paystack, demo data reloaded, and the live checks from the previous open item 1.
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1, 2, 4, 5 (built, test mode), and 6 are
  done; step 3 (deploy) is live with the Atlas lock-down still to do.
- **Company facts:** [`README.md`](README.md) "Company Profile", from GPEC's PDF (git-ignored, 23 MB,
  public repository; never commit it).
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack and bank transfer (4.1), admin access and two-step
  login (4.5), data model (5), deployment, launch checklist, and CI (7), email and photos (8),
  styling, fonts, and contrast (9), known gaps (14), lessons learned (15). Every command:
  [`docs/COMMANDS.md`](docs/COMMANDS.md).

## This session (2026-10-24), in order

1. **Home page** (`63771fb`):
   - *What we do*: the featured area's photo is above the text and shown whole, over a heavily
     blurred, darkened copy of itself (the user's choice from a comparison of three options); one
     spacing variable, `--feature-gap`.
   - **Current Work removed** from the page and the menu (user: no longer needed); README, AGENTS.md,
     and CLAUDE.md no longer ask for it.
   - More padding around the Projects video clips; on phones, snapped clips keep the side padding.
2. **Site content** (`c691dfd`): staff edit the **FAQ** (a new home-page section above the contact
   form), a new **refunds, cancellations, and returns policy** (`#refunds`, linked from the footer
   and checkout), and the **privacy notice**, in the admin panel's *Site content* tab, without a
   developer. Plain-text format (blank line = paragraph, `- ` = bullet, `[brackets]` = highlighted
   placeholder), never rendered as HTML. A save is live at once and recorded. Each page shows "Draft
   for GPEC's review" until an admin ticks *Approved*. **The policy and FAQ wording is the
   developer's proposal at the user's request**: GPEC must approve or rewrite it (and fill each
   [bracket]) before launch.
3. **Two-step login for admins** (`dfb4d1d`): optional, each admin turns it on or off at
   `#admin/security` (header link *Two-step login*). Authenticator app (QR code, new `qrcode`
   package, approved) or emailed codes; ten recovery codes; a banner suggesting it until it is on
   ("Not now" until the next login); `admin:create -- --disable-2fa` for a lost phone. App secrets
   are encrypted with the new **`TWO_FACTOR_ENCRYPTION_KEY`** setting (RUNBOOK 1.9); without it the
   app option is off. Details in CLAUDE.md 4.5.
4. **Fonts** (same commit, user's choice from a comparison): labels in Manrope (`--label`), semibold,
   0.8rem (were DM Mono, 0.72rem; the user found them too small); IBM Plex Mono (`--mono`,
   self-hosted) only for codes, 0.85rem and up. DM Mono removed.
5. **Security fix** (`9f7750a`): body-parser 2.3.0 → 2.4.0 (GHSA-27r3-jxmh-p828, denial of service),
   which had failed CI's dependency audit. Lockfile only; approved by the user.
6. **Project clips** (later the same day, not yet committed): on screens wider than about 1700px
   the three videos ran past the bottom of their box and were cut off; both grids now have a row of
   fixed height. The existing browser test measured the wrong box and now checks 1920 and 2560px.
7. **Files on the contact form** (not yet committed; CLAUDE.md Section 8): optional photos and PDFs,
   up to 5 of 10 MB, seen by staff on the request page. New package `multer` 2.5.0 (approved; 2.4.0
   has a high-severity advisory). Demo requests DE000002 and DE000004 get sample files. Privacy
   notice starting text updated.

Found and fixed along the way: any recovery code was accepted (Mongoose's automatic `updatedAt`
makes every update count as a change); admin accounts from before two-step login broke the status
page (fields missing on old records); the 2FA page's radio buttons took the text-box style; outline
buttons showed the browser's grey; the admin order page and the refunds heading scrolled sideways
at 320px. Lessons are in CLAUDE.md Section 15.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript. Home page (twelve areas, About,
  Projects, FAQ, contact form), shop (`#shop`), checkout (`#shop/order`), payment result
  (`#shop/payment/<reference>`; Paystack returns to `/shop/payment-complete`, which `main.tsx`
  turns into that route), policies (`#privacy`, `#refunds`, text from the API), admin (`#admin`).
- **Backend** (`backend/`): Express 5 + Mongoose 8. Routes in `backend/README.md`. Checkout in
  `services/checkout.ts`, Paystack only in `services/paystack.ts`, site content in
  `services/siteContent.ts` (starting text `data/siteContentDefaults.ts`), two-step login in
  `services/twoFactor.ts`, `totp.ts`, `secretBox.ts`.
- **Tests:** 505 backend tests (Vitest, in-memory MongoDB); Playwright against the production build
  with sample API data: 297 behaviour tests at desktop and phone (plus 3 skipped: the 2 from before
  and the attach button's keyboard check, desktop only) and 20
  contrast tests (10 parts at 2 widths) (`frontend/e2e/support/sampleApi.ts`; keep it in step with
  the API).
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
- **Run locally:** `docs/COMMANDS.md`. The user runs their own dev servers on 5173 and 5001; do not
  stop them. Browser tests use 4173. Docker works on this machine (useful to try CI images).
- **While the user's Vite server runs,** edit frontend files with the Edit tool, not scripts that
  rewrite them: Vite once served a half-written file as empty and the admin page went blank (check
  with `curl -s localhost:5173/src/<file> | wc -c`; `touch` the file to fix).
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Before calling a change done,** run every CI step locally, and for any new screen look at
  screenshots at desktop and 390px: tests alone missed a broken layout this session. Read the whole
  Playwright summary, not just the last lines.
- **Temporary test scripts** never stay in `frontend/e2e/`; use the scratchpad.

## Open items for the next session

- **Replies to customer emails** (built 2026-10-24, not yet deployed): customer emails now reply to
  an address staff set in the admin panel (*Emails*, `#admin/emails`; GPEC's published Gmail address
  until changed), recorded and emailed to all admins like bank details. After deploying, check it
  shows the right inbox. Forwarding `notifications@gpecengineering.com` with Cloudflare Email Routing
  was considered and skipped (the user, 2026-10-24: the reply-to is enough); steps in RUNBOOK 1.6,
  step 9, if it is ever wanted.

0. **Deploy the contact-form files** (the user acts; the assistant guides):
   - **First**, in AWS IAM, add `arn:aws:s3:::gpec-product-images/request-files/*` to the
     `gpec-product-images` key's policy (RUNBOOK 1.7, step 3), and to the development key if
     `backend/.env` has `S3_*` settings. Without it, requests with files fail; without files they work.
   - Deploy `gpec-api`, then `gpec-web`.
   - Demo files: existing demo requests are never changed, so in the `gpec-api` terminal run
     `node dist/scripts/seedDemoData.js --production --remove`, then `… --production` (this also
     resets the other demo records to their starting state). It reports "Attached 3 sample files".
   - Privacy notice: if it was already saved in *Site content* on the live site, add the attachments
     wording from `backend/src/data/siteContentDefaults.ts` there (a saved copy does not update).
   - Check: a `[TEST]` request with a photo and a PDF; both on its admin page; the photo opens, the
     PDF downloads; a phone upload too.
1. **Illustrative images** (`portfolio-control-panel.jpg`, `portfolio-solar-array.jpg`,
   `product-lineup.png`): **kept** (user, 2026-10-24) because the sample products use them. Remove
   them once GPEC's real products replace the samples and nothing refers to them.
2. **Later (user, 2026-10-24):** raise the remaining small text that was never monospaced (button
   text 0.76rem, form hints 0.75–0.78rem, a few admin labels 0.72–0.75rem) to match the 0.8rem labels.
3. **Later (user, 2026-10-24) — finish the live setup:** Atlas lock-down (needs the Atlas owner: `gpec-prod`/`gpec-dev` users,
   network access, new `MONGODB_URI`, database region for the privacy notice); SES production access
   (requested); AWS paid plan before 2027-04-22; 2FA on the Paystack account (its dashboard asks).
4. **From GPEC** (ROADMAP "Needed from GPEC"): approval of the refunds policy, FAQ, and privacy
   notice (Site content, every [bracket] filled in); real bank details; delivery areas and fees;
   collection hours; the Paystack rate on its plan; real products with prices; business hours and
   social links; registration number; whether Afrizone may be named; the first video's sound.
5. **Before launch** (CLAUDE.md Section 7 checklist): the policies approved, real bank details, demo
   data removed, samples archived, every admin using two-step login, live Paystack keys only with
   GPEC's approval.
6. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling).

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
