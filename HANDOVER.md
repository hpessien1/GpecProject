# Next-session handover

Last updated: 2026-10-21. Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first.
```

## Where things stand

- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md).
  - Done: step 1 (quick fixes), step 2 (CI, hardening, tests), step 4 (products in MongoDB), and
    step 6 for now (admin panel: login, products and prices with change history, enquiry and
    contact-request lists with a recorded follow-up status, own-password changes).
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
- **Last session (2026-10-21), latest work:**
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
  (original against itself) and shown to catch a planted hover-only bug. The tool lived in the
  session scratchpad, not the repository; ask if you want it kept as a test.

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
- **Tests:** 152 backend tests (Vitest, in-memory MongoDB replica set). 86 frontend Playwright tests (2 run at one width only)
  in `frontend/e2e/` (`npm test`; `npm run check:contrast` for contrast) against the production
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

1. Ask whether the latest commits are pushed and CI is green.
2. Step 3: help the project owner set up Atlas and Coolify from `docs/RUNBOOK.md` if asked; never
   deploy. **Check that Coolify's `MONGODB_URI` uses `gpec`, not `gpec_dev`, and that
   `NODE_ENV=production` is set.**
3. When GPEC creates its AWS account: walk through RUNBOOK 1.6 (SES domain, production access,
   sending-only key, Coolify settings), then fill in the email region in the privacy notice.
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
