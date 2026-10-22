# Next-session handover

Last updated: 2026-10-22. Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md).
  - Done: step 1 (quick fixes), step 2 (CI, hardening, tests), step 4 (products in MongoDB), and
    step 6 for now (admin panel: login, products and prices with change history, enquiry and
    contact-request lists with search, a recorded follow-up status, and internal staff notes,
    own-password changes).
  - Waiting on the project owner: step 3, the first deploy. Dockerfiles and
    [`docs/RUNBOOK.md`](docs/RUNBOOK.md) are ready; Coolify and Atlas setup need domain names.
  - Waiting on GPEC: step 5, Paystack checkout (currency, Paystack account and fee rule, delivery
    fees), then the admin order lists.
- **Rules:** [`CLAUDE.md`](CLAUDE.md): Paystack rules (4.1), contrast rules (Section 9), email (8),
  deployment (7), known gaps (14), lessons learned (15).
- **Commands:** [`docs/COMMANDS.md`](docs/COMMANDS.md) lists every command, local and production.
- **Mock content on the live pages** (owner's request, unlabelled on the page): About, Current
  Work, and the footer contact details (unreachable `info@example.com`, invalid phone). The 14
  products are labelled samples. Services areas 2–9 show existing photos labelled "Illustrative
  image" (three are Afrizone stills, at the owner's request). All must be replaced with GPEC's real
  content before launch.
- **Stylesheets:** `frontend/src/styles/` (base, site, home, shop, privacy; admin loads only with
  the admin screens). Rules in CLAUDE.md Section 9. Formatted by Prettier 3.9.9
  (`frontend/.prettierrc.json`, `npm run format`; CI runs `npm run format:check`); the root
  `.prettierignore` limits Prettier to those files.
- **Last session (2026-10-22): admin search and internal notes** (committed, not pushed):
  - The order-enquiry and contact-request lists have a search box (reference, customer name,
    company, or email; `?q=` on the list routes, matched literally and ignoring case; status counts
    cover the matches).
  - Each request's detail page has "Internal notes": staff add a note (up to 2000 characters),
    shown newest first with author and time. Notes are never edited or deleted, so they are their
    own record (new `RequestNote` model; CLAUDE.md Section 5). `POST /:reference/notes`.
  - The draft privacy notice now says staff may add follow-up notes, seen only by staff.
  - Checked: 13 new backend tests and 3 new browser tests (both widths), each shown to fail on a
    planted bug; the contrast check covers the new states (search with no matches, note added, note
    error); screenshots at 390px and 1440px, no horizontal scroll.
  - Then (committed, not pushed): a Show/Hide button on every admin password field
    (`components/admin/PasswordInput.tsx`). It hides the password again when the form is sent, so
    browsers still offer to save it, and turns spell-check off.
  - Then (committed, not pushed): new admin passwords known from data breaches are refused, checked
    with Have I Been Pwned's free Pwned Passwords API (approved by the user; only a 5-character
    hash prefix leaves the server; if unreachable, the change goes ahead and is logged). Checked
    against the live service once ("password" refused, a random one accepted).
  - Then (committed, not pushed): a live character counter under the new password ("9 of 15
    characters", then "15 characters ✓ long enough"); screen readers hear only the moment it is
    long enough. No strength meter, by choice: it would disagree with the real rules (length and
    the breach check).
  - Then (committed, not pushed): **product photo uploads** from the admin's laptop, phone, or tablet,
    with a preview (current photo, the chosen one at once, then the resized one). Amazon S3 and
    `sharp` approved by the user. Private bucket; the API checks, re-encodes, and serves photos
    (CLAUDE.md Section 8, "Product photos"). Off until GPEC's S3 bucket exists (RUNBOOK 1.7). Found
    and fixed on the way: the CSP blocked images from the API and `blob:` previews, and the
    Dockerfile's `sed` replaced only the first `__API_ORIGIN__` on a line (would have broken every
    API call once a second one was added); `e2e/csp.spec.ts` now applies the real policy. Oversized
    JSON bodies now get 413 instead of 500. Both Docker images built and checked locally (`sharp`
    works in the Alpine API image). Your one-line `.admin-history-meta` size change (0.65 → 0.75rem)
    is included; contrast passes.
  - Then (committed, not pushed): the shop and admin headers show the same GPEC logo as the home page
    (`LogoLockup`, same size and position; its offset moved to `base.css`); phone shop/admin header
    84px like the home page. A browser test checks every page's header uses the same logo file.
    The logo now loads resized WebP copies (`gpec-engineering-logo-plinth-360.webp` and `-540.webp`,
    28 and 48 kB) instead of the 1.1 MB PNG, which stays in `public/assets/` unchanged as the source.
    The shop header's "Product ordering" label is plain text beside the logo, no longer part of the
    link home (it looked like a shop link but went to the landing page).
  - Then (committed, not pushed): **scope correction from the owner: no order enquiries.** Customers
    buy in the shop (Paystack; pickup or delivery) or ask through the contact form. Removed the
    shop's enquiry form, `POST /api/enquiries`, the Enquiry model, its emails, and the Order
    enquiries admin tab. Added a stock switch and optional stock count per product (out-of-stock
    products stay in the shop, labelled, not buyable; customers never see the count), a Checkout
    page that says online payment is not available yet (link to the contact form), and an Orders
    admin tab that explains orders arrive with Paystack. CLAUDE.md Lessons Learned has the rule.
    The sample product `replacement-001` is renamed "Replacement parts" in the seed data; in
    `gpec_dev` it keeps its old name until edited in the admin panel (the seed never changes
    existing products).
  - Then (committed, not pushed): **Orders screens and demo data.** Order model (payment status set
    only by the server; fulfilment status moved by staff, with history and notes), admin Orders list
    and detail, and `npm run seed:demo` (10 orders in every stage, 8 contact requests; `gpec_dev`
    only; `-- --remove` deletes exactly them). Demo data is loaded in `gpec_dev`. The user's
    `tsx watch` API missed the new route until restarted by hand; if a new route answers "Route
    not found", restart `npm run dev` (noted in docs/COMMANDS.md).
- **Session before (2026-10-21)** (commit `eb436d7`, pushed; CI green):
  - Stylesheet cleanup and split (options A then B from the old item 6): 5,172 lines in one file
    became about 4,000 lines in six files; the public pages' CSS went from 76 kB to 54 kB (admin
    styles, 6.7 kB, load only with #admin). Removed: 103 selectors for an older design, 153
    declarations always overridden by a later copy of the same rule, 54 that repeated a value
    already set, 69 overridden by newer rules or with no effect; 57 duplicate rule blocks merged;
    42 hex colours became variables.
    Verified with no visual change: see "How the CSS cleanup was checked" below.
  - `/api/health` now checks MongoDB (503 when it does not answer in 2 seconds).
  - The two portfolio cards with illustrative images no longer say "Built by the GPEC team".
  - The empty `webDevPractice` file is gone.
- **How the CSS cleanup was checked:** the original and the cleaned site were built and driven into
  the same 45 states (every page, form error, sending and sent states, cart, product window, menu
  open, every admin screen, public pages after visiting admin). In each state, at 21 widths, every
  element's computed style (with `::before`, `::after`, `::placeholder`) and position were compared,
  with hover and focus forced on each element the CSS styles in those states, and full-page
  screenshots were compared pixel for pixel. The comparison was first proven deterministic
  (original against itself) and shown to catch a planted hover-only bug. It caught three real
  regressions in a first attempt (caused by a bug in the cleanup tooling), which were fixed before
  the commit. The tool lived in the session scratchpad, not the repository; ask the user if they
  want it kept as a test for future CSS changes.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript.
  - Home page: Services showcase with all nine business areas (`components/ServiceShowcase.tsx`),
    About, Projects, Current Work, contact form (ten topics); the brief's menu (hamburger at 1100px
    and below).
  - Shop (`#shop`, `#shop/order`): products from the API, cart in `localStorage`, order enquiry.
  - Draft privacy notice (`#privacy`) with highlighted placeholders for GPEC.
  - Admin panel (`#admin`, lazy-loaded).
  - All text meets WCAG AA contrast in every state; spam trap on both public forms.
- **Backend** (`backend/`): Express 5 + Mongoose 8, strict TypeScript. Routes in
  `backend/README.md`. Zod-validated config, helmet, per-IP rate limits, production database guard.
  - Admin accounts by command only (`npm run admin:create`); none exists in `gpec_dev`.
  - `CURRENCY` is unset everywhere until GPEC confirms it (prices cannot be entered until then).
  - Email through Amazon SES is built but **off**: GPEC has no AWS account yet (RUNBOOK 1.6).
- **Tests:** 216 backend tests (Vitest, in-memory MongoDB replica set). 140 frontend Playwright
  tests (2 run at one width only) in `frontend/e2e/` (`npm test`; `npm run check:contrast` for contrast) against the production
  build with sample API data. oxlint in both packages (not ESLint: it cannot run on TypeScript 7).
- **CI** (`.github/workflows/ci.yml`): lint, type-check, build, backend tests, browser tests and
  contrast, Docker builds, `npm audit`, gitleaks. Never deploys.
- **Docker:** `backend/Dockerfile` (port 5001) and `frontend/Dockerfile` (nginx, port 8080, needs
  the `VITE_API_BASE_URL` build argument).

## Environment

- **Database:** one MongoDB Atlas cluster. `gpec_dev` locally (`backend/.env`), `gpec` in production
  (Coolify). Never paste the connection string into a chat.
- **Run locally:** see `docs/COMMANDS.md` Sections 1–2. The user often runs their own dev servers on
  5173 and 5001; do not stop them. Browser tests use port 4173 and start and stop it themselves.
- **Git:** commit on `main` when asked. **Only the user pushes** (to `origin` and `backup`).
- **Hosting:** Hetzner Cloud via Coolify, deployed by the project owner only.

## Open items for the next session

1. Everything up to `eb436d7` is pushed and CI is green. Eight later commits (handover update,
   search and notes, password Show/Hide, breach check and counter, product photo uploads, same logo
   everywhere, no order enquiries with stock and Orders tab, Orders screens and demo data) are
   committed but not pushed; the user pushes. CI has not yet run on them (it also builds both
   Docker images, which matters for `sharp`).
2. Step 3: Coolify is **not set up yet**; the user will say when it is. Then help with Atlas and
   Coolify from `docs/RUNBOOK.md`; never deploy. Coolify's health check now depends on the
   database (`/api/health` returns 503 if MongoDB does not answer), so a wrong `MONGODB_URI` shows
   as an unhealthy API. **Check that Coolify's `MONGODB_URI` uses `gpec`, not `gpec_dev`, and that
   `NODE_ENV=production` is set.**
3. When GPEC creates its AWS account: walk through RUNBOOK 1.6 (SES domain, production access,
   sending-only key, Coolify settings), then fill in the email region in the privacy notice, and
   RUNBOOK 1.7 (private S3 bucket and upload key for product photos).
   **Then build "forgot password" for admins**: the user requires it once email works (rules in
   CLAUDE.md Known Gaps).
4. Ask GPEC for everything in ROADMAP.md "Needed from GPEC", including real About, Current Work,
   and contact details to replace the mock content, and whether the first project video's sound
   contains speech (captions).
5. When GPEC sends its real product list, load it with `isPlaceholder: false` and archive the
   samples (CLAUDE.md Section 11).
6. Stylesheet follow-ups, each needing a decision (CLAUDE.md Known Gaps, Styling): align the
   breakpoints (980, 900, 650, 600 to 1100/820/540), which changes layouts at some widths and so
   needs a browser check; optionally turn the two repeated hex colours into variables.
7. Without GPEC, remaining options are in CLAUDE.md's Known Gaps. Ask the user before choosing.

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The macOS-specific setup notes (Homebrew MongoDB,
port 5000 conflict) no longer apply; the port 5001 choice is recorded in CLAUDE.md's lessons learned.
