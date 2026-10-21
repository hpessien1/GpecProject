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
- **Formatting:** `frontend/src/styles.css` is formatted by Prettier 3.9.9 (`frontend/.prettierrc.json`,
  `npm run format`; CI runs `npm run format:check`). The root `.prettierignore` limits Prettier to
  that one file, so editors' format-on-save cannot reformat the TypeScript code.
- **Last session (2026-10-21), latest work:** all nine business areas; an interactive Services
  showcase (choose a card to feature it; cards swap places; "Learn more" opens the contact form with
  that area's topic chosen); one contact-form topic per business area; email notifications through
  Amazon SES (built, off until GPEC has an AWS account).

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
- **Tests:** 149 backend tests (Vitest, in-memory MongoDB replica set). 84 frontend Playwright tests
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
6. **For discussion with the user: is a ~5,000-line `styles.css` right for a site this size?**
   Facts measured on 2026-10-21 (`frontend/src/styles.css`):
   - Most of the growth is formatting: the same rules were about 1,060 lines (one rule per line)
     before Prettier put one property per line (now 5,173 lines, 867 rule blocks).
   - **102 rule blocks repeat a selector already defined in the same scope** (82 selectors), and the
     later copy silently overrides the earlier one. This caused a bug on 2026-10-21: edits to the
     earlier `.service-feature-card` rules had no effect.
   - **About 37 classes from an older design are no longer used anywhere** (e.g. `cabinet-*`,
     `schematic-*`, `label-*`, `sun-ring`, `product-slab`, `service-grid`, `intro-*`). Careful:
     `admin-status-*`, `icon-0*`, and `symbol-*` look unused but are built in code.
   - 163 hard-coded hex colours alongside 296 uses of the colour variables; 8 different breakpoints
     where CLAUDE.md wants 3 main ones (1100, 820, 540).
   Options, for the user to choose:
   - **A. Clean up, keep one file:** delete unused rules, merge each duplicate into one rule, replace
     hard-coded colours with variables, align breakpoints. Likely a much smaller file with the same
     structure (CLAUDE.md's "one global stylesheet" rule unchanged).
   - **B. Split by area:** after A, split into a few files (base, home, shop, admin, privacy). Easier
     to find things; admin styles could load only with the admin page (it is already lazy-loaded).
     Needs CLAUDE.md's one-stylesheet rule updated.
   - **C. CSS Modules per component:** styles next to each component; biggest change, and a new
     convention to agree first.
   Suggested: **A, then B.** The safety net is in place: `npm run check:contrast` and the browser
   tests catch visual and behaviour regressions, and `npm run format:check` keeps the formatting.
7. Without GPEC, remaining options are in CLAUDE.md's Known Gaps. Ask the user before choosing.

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The macOS-specific setup notes (Homebrew MongoDB,
port 5000 conflict) no longer apply; the port 5001 choice is recorded in CLAUDE.md's lessons learned.
