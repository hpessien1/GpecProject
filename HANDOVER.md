# Next-session handover

Last updated: 2026-10-25 (end of session: larger small text, menu with FAQ, section labels matching
the menu, panels section moved after Services).
Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Git and CI:** everything is pushed up to `59e136c` and CI is green (run 40137434745, 7 min 7 s).
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
- **What is deployed:** everything up to `59e136c`: nothing is waiting to deploy. The user deployed
  the previous session's work (S3 policy, both resources, seed commands, privacy wording, checks) on
  2026-10-24, and `gpec-web` with this session's work on 2026-10-25. Checked from outside: `/api/health`
  ok, `fileUploads: true`, all 14 sample products have a category, the saved privacy notice mentions
  attached files, and the live site's code has the FAQ menu item.
- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1, 2, 4, 5 (test mode), and 6 are done;
  step 3 (deploy) is live with the Atlas lock-down still to do.
- **Company facts:** [`README.md`](README.md) "Company Profile", from GPEC's PDF (git-ignored, 23 MB,
  public repository; never commit it).
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack and bank transfer (4.1), admin access and two-step
  login (4.5), audit trail (4.6), data model (5), deployment, launch checklist, and CI (7), email,
  order update emails, photos, and contact-form files (8), styling and contrast (9), product
  catalogue checklist (11), known gaps (14), lessons learned (15). Every command:
  [`docs/COMMANDS.md`](docs/COMMANDS.md).

## This session (2026-10-24/25), in order

1. **Previous session's deploy** confirmed (the user did it; checked from outside, see above).
2. **Larger small text** (`b6d649e`): button text, form hints, notes, admin labels, the menu, and the
   footer raised from 0.7–0.78rem to 0.8rem, like the labels (CLAUDE.md Section 9 has the grep to
   check). Found and fixed: on phones the footer's copyright line was 0.48rem (about 8px). The larger
   text made the ten "Typical components" names overlap on desktop (the user spotted it; the
   sideways-scroll test could not, see CLAUDE.md Lessons): the list now has as many columns as fit,
   symbol beside name on phones, no dividing lines; a browser test checks nine widths.
3. **Menu and labels** (`59e136c`, the user's request): FAQ added to the menu (Home · About ·
   Services · Products · Projects · FAQ · Contact, plus Shop; README and AGENTS updated); each
   section's small label is its menu word (the big slogans stay); the Control & distribution panels
   section moved to directly after Services; the footer follows the menu. The header still fits on
   one line from 1101px (216px to spare).

The previous session (project clips, contact-form files, reply-to address, order update emails,
product categories) is described in ROADMAP.md and CLAUDE.md. SES production access (requested
2026-10-23): if nothing by about 2026-10-27, check the AWS support case for questions.

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
  with sample API data: 319 behaviour tests at desktop and phone (plus 3 skipped: 2 from before and
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

1. **Tidy-up on the live site:** delete the `[TEST]` contact request from the 2026-10-24 deploy check
   if it is still there (only a check; CLAUDE.md Section 10.3; needs the user, in the database).
2. **Illustrative images** (`portfolio-control-panel.jpg`, `portfolio-solar-array.jpg`,
   `product-lineup.png`, and `electrical-panels-product.png`, whose source is unknown): kept while
   the sample products and the Services panel use them; remove when GPEC's real products and
   photos replace them.
3. Done 2026-10-25, committed, **not yet pushed or deployed** (`gpec-web` only): the phone menu
   fills the screen; the two repeated hex colours are variables; a browser tab icon from the logo's
   helmet (`frontend/public/favicon.ico`, `apple-touch-icon.png`). Also confirmed by the user that
   day: `TWO_FACTOR_ENCRYPTION_KEY` is set in Coolify, and Afrizone may be named.
4. **Later (user, 2026-10-24) — finish the live setup:** Atlas lock-down (needs the Atlas owner:
   `gpec-prod`/`gpec-dev` users, network access, new `MONGODB_URI`, database region for the privacy
   notice); SES production access (requested 2026-10-23); AWS paid plan before 2027-04-22; 2FA on
   the Paystack account.
5. **From GPEC** (ROADMAP "Needed from GPEC"): approval of the refunds policy, FAQ, and privacy
   notice (every [bracket] filled in, including how long attached files are kept); real bank
   details; delivery areas and fees; collection hours (the "ready for pickup" email could then state
   them); the Paystack rate on its plan; real products with prices and categories; business hours
   and social links; registration number; the first video's sound.
6. **Before launch** (CLAUDE.md Section 7 checklist): the policies approved, real bank details, demo
   data removed, samples archived, every admin using two-step login, live Paystack keys only with
   GPEC's approval.
7. Stylesheet follow-ups needing a decision (CLAUDE.md Known Gaps, Styling).

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The stylesheet was cleaned up and split on
2026-10-21, checked for zero visual change by comparing computed styles in 45 page states at 21
widths (the tool is not in the repository; ask the user if they want it kept for future CSS work).
