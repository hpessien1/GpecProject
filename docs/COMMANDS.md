# Command Reference

Every command the developer runs for the GPEC website, grouped by when you need it. Commands assume
you start in the repository root (`/home/worlanyo/Desktop/GpecProject`). Background and reasons:
[`CLAUDE.md`](../CLAUDE.md) (engineering rules) and [`RUNBOOK.md`](RUNBOOK.md) (production).

- **Last updated:** 2026-10-21
- **Never** paste a real `MONGODB_URI`, password, or Paystack key into a chat, an issue, or this file.
- **Two databases:** `gpec_dev` (your machine) and `gpec` (the live site). Commands in sections 1–7
  use `gpec_dev` through `backend/.env`. Section 8 is for the live site and is run only from Coolify.

---

## 1. First-time setup on a new machine

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

cp -n backend/.env.example backend/.env     # -n: never overwrites an existing .env; then edit it (below)
cp -n frontend/.env.example frontend/.env   # the default API address works locally
```

In `backend/.env`, set `MONGODB_URI` to the `gpec_dev` database (the part before `?` must end in
`/gpec_dev`). To try price editing locally, also set `CURRENCY=NGN`. Leave the email settings unset
locally (email stays off) unless you are testing Amazon SES itself.

```bash
cd backend && npm run seed:products        # adds the 14 sample products (safe to repeat)
cd backend && npm run admin:create -- --email you@example.com --name "Your Name"
```

`admin:create` prints a password **once**. Log in with it at `http://localhost:5173/#admin`, then
use **Change password** to set your own.

## 2. Everyday development

Two terminals:

```bash
cd backend && npm run dev                  # API on http://localhost:5001 (restarts on changes)
cd frontend && npm run dev                 # site on http://localhost:5173
```

If a page shows "404 Not Found" from the frontend, the server was started from the wrong folder.
Stop it and run `npm --prefix frontend run dev` from the repository root.

| Page | Address |
|---|---|
| Home | http://localhost:5173/ |
| Shop | http://localhost:5173/#shop |
| Admin | http://localhost:5173/#admin |
| Admin: orders | http://localhost:5173/#admin/orders |
| Admin: contact requests | http://localhost:5173/#admin/contact-requests |
| API health | http://localhost:5001/api/health (should show `{"status":"ok"}`; `503` means MongoDB cannot be reached) |

If the site shows a blank page with "504 Outdated Optimize Dep" in the browser console after
installing packages, stop the frontend (`Ctrl+C`) and start it again.

## 3. Checks before committing

All must pass (CI runs the same on GitHub):

```bash
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm run build && cd ..
cd backend && npm run lint && npm run typecheck && npm test && cd ..
```

Browser tests and the text-contrast check. They build the site and serve it themselves (port 4173),
answering the API with sample data, so neither `npm run dev`, the API, nor the database is needed:

```bash
cd frontend && npx playwright install chromium   # first time on a machine only (about 150 MB)
cd frontend && npm test                          # behaviour tests, desktop and phone (about 10 s)
cd frontend && npm run check:contrast            # every page and state (about a minute)
```

After editing a stylesheet in `frontend/src/styles/`, format it (Prettier formats only those files):

```bash
cd frontend && npm run format
```

Useful extras:

```bash
cd frontend && npx playwright test e2e/shop.spec.ts --headed   # one file, with the browser visible
cd frontend && npx playwright test --ui                         # pick and watch tests interactively
```

A failing test prints what it expected and what it found. A failing contrast check lists each
piece of text with the contrast found, the minimum needed, and where it appears.

Optional, the same Docker builds CI runs:

```bash
docker build -t gpec-api backend
docker build --build-arg VITE_API_BASE_URL=https://api.example.com/api -t gpec-web frontend
```

## 4. Admin accounts (your machine, `gpec_dev`)

```bash
# Create an account. Prints a random password once.
cd backend && npm run admin:create -- --email person@example.com --name "Full Name"

# Forgotten password: prints a new one and logs that person out everywhere.
cd backend && npm run admin:create -- --email person@example.com --reset
```

Each person gets their **own** account, never a shared one: the change history records who changed
each price. After logging in with the printed password, each person sets their own under
**Change password** (at least 15 characters).

## 5. Products (your machine, `gpec_dev`)

```bash
cd backend && npm run seed:products        # adds any missing sample product; never changes existing ones
```

Everything else (adding real products, prices, stock, archiving) is done in the admin panel.

### Demo orders and contact requests (`gpec_dev` only)

For showing the admin screens: 10 orders in every stage and 8 contact requests in every status.
The command refuses the production `gpec` database.

```bash
cd backend && npm run seed:demo                # adds the demo records that are missing (safe to repeat)
cd backend && npm run seed:demo -- --remove    # removes exactly the demo records, with their history and notes
```

Status history and notes are added only if an admin account exists. If the API is already running
when new routes are added and the Orders tab says "Route not found", restart the API (`npm run dev`).

## 6. Looking inside the development database

Paste the `gpec_dev` URI from `backend/.env` in place of `<MONGODB_URI>`. Do not run these against
the live `gpec` database.

```bash
mongosh "<MONGODB_URI>" --eval 'db.contactrequests.find().sort({createdAt:-1}).limit(5)'
mongosh "<MONGODB_URI>" --eval 'db.products.find({}, {name:1, reference:1, price:1, status:1})'
mongosh "<MONGODB_URI>" --eval 'db.adminusers.find({}, {email:1, name:1, isActive:1, lastLoginAt:1})'
mongosh "<MONGODB_URI>" --eval 'db.auditrecords.find().sort({createdAt:-1}).limit(10)'
```

Before any update or delete, run the matching `find` first and check what it returns.

## 7. Git

Commit on `main`, then push to both remotes (only you push):

```bash
git status                                 # nothing unexpected (no .env, node_modules, dist)
git push origin main                       # hpessien1/GpecProject
git push backup main                       # kworlanyo/GpecProject
```

Then check that the CI run on GitHub is green.

---

## 8. Live site (production, run from Coolify only)

Never run these from your own machine. Open the **API** resource in Coolify → **Terminal**. These
commands touch the live `gpec` database, so each needs `--production`; without it they refuse.

**First deploy only.** The full setup (Atlas users, Coolify resources, environment variables) is in
[`RUNBOOK.md`](RUNBOOK.md) Section 1. After the API is deployed:

```sh
# Optional: show the 14 labelled sample products until GPEC's real list arrives (GPEC's choice).
node dist/scripts/seedProducts.js --production
```

**Admin accounts for GPEC staff.** Run once per person, with their real name and email:

```sh
node dist/scripts/createAdmin.js --production --email staff@example.com --name "Full Name"
```

1. Copy the printed password and give it to that person privately (phone or in person).
2. They log in at `https://<site-domain>/#admin`.
3. They choose their own password under **Change password** straight away.

Create one for yourself too: your `gpec_dev` account does not exist on the live site.

**Forgotten password** (prints a new one and logs them out everywhere):

```sh
node dist/scripts/createAdmin.js --production --email staff@example.com --reset
```

**Someone leaves GPEC:** in MongoDB Atlas, open *Browse Collections* → database `gpec` →
`adminusers`, find their email, and set `isActive` to `false`. Their sessions stop working at once.
(There is no screen or command for this yet.)

**Turning on prices** once GPEC confirms the currency: in Coolify, set `CURRENCY` on the API
resource (e.g. `NGN`) and redeploy the API. Until then, admins cannot enter prices.

**Deploy, check, and roll back:** [`RUNBOOK.md`](RUNBOOK.md) Sections 2 and 3. Before every first
deploy and after any change to `MONGODB_URI`, confirm it ends in `/gpec?` (never `/gpec_dev?`).
