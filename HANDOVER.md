# Next-session handover

Last updated: 2026-10-21. Start a new session with:

```text
Continue work on the GPEC website at /home/worlanyo/Desktop/GpecProject.
Read CLAUDE.md, ROADMAP.md, and HANDOVER.md first. Steps 1 and 2 of the roadmap are done;
step 3's files (Dockerfiles, runbook) are ready and waiting on the project owner's Coolify setup.
```

## Where things stand

- **Plan and progress:** [`ROADMAP.md`](ROADMAP.md). Steps 1 (quick fixes) and 2 (CI, hardening,
  tests) are done. Step 3 (deploy on Coolify): Dockerfiles and [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
  are done and checked locally; the Coolify and Atlas setup and first deploy are the project
  owner's, and need domain names from GPEC. Then products in MongoDB, Paystack checkout, and the
  admin panel.
- **Rules and conventions:** [`CLAUDE.md`](CLAUDE.md), including the Paystack rules (Section 4.1),
  deployment checklist (Section 7), and known gaps (Section 14).
- **Scope change (2026-10-20):** online payment through Paystack's hosted checkout is in scope, with
  fixed prices from a planned admin panel and pickup or delivery. See
  [`ECOMMERCE_REQUIREMENTS.md`](ECOMMERCE_REQUIREMENTS.md). The shop is still enquiry-only in code.

## What exists

- **Frontend** (`frontend/`): React 19 + Vite 8, strict TypeScript. Landing page with a working
  contact form, and a shop (`#shop`, `#shop/order`) with 14 sample products, cart in
  `localStorage`, and an order enquiry form.
- **Backend** (`backend/`): Express 5 + Mongoose 8, strict TypeScript.
  - Routes: `GET /api/health`, `POST /api/enquiries`, `POST /api/contact-requests`.
  - Zod-validated config, helmet, per-IP rate limits, production database guard.
  - 34 Vitest tests on an in-memory MongoDB.
- **Docker:** `backend/Dockerfile` (port 5001) and `frontend/Dockerfile` (nginx, port 8080, needs
  the `VITE_API_BASE_URL` build argument). Setup and deploy steps in `docs/RUNBOOK.md`.
- **CI:** `.github/workflows/ci.yml` runs type-checks, builds, tests, `npm audit`, and gitleaks on
  every push to `main`. First run on GitHub passed on 2026-10-20 (commit `254b449`).

## Environment

- **Database:** one MongoDB Atlas cluster. `gpec_dev` for local development (`backend/.env`), `gpec`
  for production (Coolify). Never paste the connection string into a chat.
- **Run locally:** `cd backend && npm run dev` (port 5001) and `cd frontend && npm run dev`
  (port 5173). Health check: `curl http://localhost:5001/api/health`.
- **Git:** commit on `main`. Push to both remotes over SSH (the SSH key is the `kworlanyo` account):
  - `git push origin main` → `hpessien1/GpecProject`
  - `git push backup main` → `kworlanyo/GpecProject`
- **Hosting:** Hetzner Cloud via Coolify, deployed by the project owner only.

## Open items for the next session

1. Make sure the latest commit is pushed to both remotes and CI is still green.
2. Roadmap step 3, remaining: the project owner sets up Atlas users and Coolify by following
   `docs/RUNBOOK.md`, then deploys. **Check that Coolify's `MONGODB_URI` uses `gpec`, not
   `gpec_dev`, and that `NODE_ENV=production` is set.** Help with that if asked; never deploy.
3. Ask GPEC for the information in ROADMAP.md, "Needed from GPEC" (domain names, prices, currency,
   Paystack account, delivery and pickup details, policies, contact details).
4. If waiting on step 3, step 4 (products in MongoDB) can start without GPEC's real product data,
   using the existing sample products marked as placeholders.

## History

The project was started on another developer's macOS machine (`/Users/happinessessien/GP-website`)
and moved to this Linux machine on 2026-10-20. The macOS-specific setup notes (Homebrew MongoDB,
port 5000 conflict) no longer apply; the port 5001 choice is recorded in CLAUDE.md's lessons learned.
