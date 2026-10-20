# CLAUDE.md — GPEC Website

@AGENTS.md

---

## 0. How To Read This File

This file is the standing instruction set for anyone (human or AI) working in this repository. It
holds engineering conventions. Company facts and service descriptions live in
[`README.md`](README.md); content and scope rules live in [`AGENTS.md`](AGENTS.md) (imported above);
shop and payment behaviour lives in [`ECOMMERCE_REQUIREMENTS.md`](ECOMMERCE_REQUIREMENTS.md). Do not
copy facts from those files into this one — link to them.

**Precedence when rules conflict:**

1. Explicit instructions from the user in the current conversation.
2. **Product Principles** (Section 2) and the content and scope rules in `AGENTS.md`.
3. **Security Invariants** (Section 4).
4. Everything else in this file.
5. General engineering defaults and "best practices".

If a generic best practice conflicts with a Product Principle or Security Invariant, the
principle/invariant wins. **Flag the conflict and ask. Do not quietly pick one.**

**When something here looks wrong or outdated,** say so and propose a correction. Do not ignore it
silently and do not follow it blindly. Rules that no longer match the code are bugs in this file.

---

## 1. Project Overview

**GPEC Website** is the company profile and online sales channel for GPEC, a Nigeria-based
engineering company working on electrical control and distribution panels, solar energy, and the
sale of electrical, solar, electronic, and industrial products.

**The problem it solves:** Customers need one trustworthy place to understand what GPEC does, see
real evidence of its work, find the right product, and either buy it or ask GPEC for help. Technical
buyers want to identify a part without calling first; less technical customers need plain-language
guidance and an easy way to ask for a recommendation or quote.

**How it is built:** A React + Vite single-page frontend (`frontend/`) with hash-based routing,
talking to an Express 5 REST API (`backend/`) backed by MongoDB through Mongoose. Both are written
in strict TypeScript. Product checkout
will redirect customers to Paystack's hosted payment page; the site never handles card details.
Production runs in Docker containers managed by Coolify on a Hetzner Cloud VPS, with the database
on MongoDB Atlas.

**User roles:**
- `customer` — anonymous visitor. Browses, adds to cart, submits enquiries, and (planned) pays for
  orders through Paystack. No customer accounts.
- `admin` — **planned.** GPEC staff who manage products and prices and view orders and enquiries.
  Prices set here appear on the customer-facing site. Not built yet; no authentication exists today.

**Core domains:** products (catalogue, prices), cart, orders (planned, paid), payments (planned,
Paystack), fulfilment (pickup or delivery), enquiries (quotes and general contact).

---

## 2. Product Principles

These principles override generic engineering instincts. When a technical "best practice"
conflicts with one of these, the principle wins — flag the conflict and ask. They will be updated as
the project grows.

1. **Verified facts only.** Never invent company history, clients, projects, product data, specs,
   prices, stock, certifications, or performance claims. Missing information becomes a clearly
   marked placeholder, never plausible-looking copy. *Why:* the site is GPEC's public record; one
   invented claim undermines every real one.
2. **Card data never touches GPEC systems.** Customers pay on Paystack's hosted page. The server
   decides every amount and is the only thing that marks an order paid, after confirming with
   Paystack. *Why:* keeps PCI scope minimal and stops a tampered browser from setting its own price.
3. **Real evidence over claims.** Show GPEC's actual projects and products. Illustrative images are
   labelled as illustrative and are never captioned as GPEC's own work. Customer names and project
   media appear only with permission.
4. **Plain language for both audiences.** Every technical term is explained without dropping the
   specification or safety detail a technical buyer needs.
5. **Ask only for what GPEC needs.** Forms collect the minimum to fulfil the request, and fields
   depend on context (pickup orders do not ask for a delivery address). Personal data comes with
   privacy wording.

---

## 3. Target Users (Personas)

> **DRAFT — for the project owner to check.** These are derived from the README brief, not from
> user research. Replace or confirm them once GPEC has real customer insight.

When a request is ambiguous, ask: **"Which persona is this for?"**

- **Procurement officer — industrial or commercial buyer.** Buys against a specification or part
  number for a plant, contractor, or facility. Needs: search by part number or rating, clear specs
  and model numbers, a current price, bulk quantities, a formal order reference. Primary risks:
  vague specs, prices that do not match the invoice, no paper trail.
- **Maintenance technician — replacing a failed part.** Something is down and needs a matching
  replacement fast. Needs: compatibility details, a way to send a nameplate photo or drawing,
  pickup option, quick response. Primary risks: buying an incompatible part, slow replies.
- **Homeowner or small-business owner — considering solar.** Not technical, wants reliable power.
  Needs: plain explanations, guidance instead of choosing parts by price, a simple way to request an
  assessment. Primary risks: jargon, unclear costs, fear of being mis-sold.
- **GPEC staff member — site administrator (planned).** Updates prices and products and follows up
  orders and enquiries. Needs: simple editing without touching code, a clear list of paid orders
  and enquiries, a history of who changed what. Primary risks: a wrong price going live, missed
  orders.

---

## 4. Security Invariants

These rules are non-negotiable. Flag conflicts — do not skip them. Some only bite once the admin
panel or payments exist; they are kept here so they are designed in, not retrofitted.

### 4.1 Payments (Paystack)

Several of these rules come from fixes made in a sister project (Vision 25) that uses the same
Paystack flow; the *Why* notes record the failure each one prevents.

- **No card data, ever.** No card, bank, or PIN fields anywhere in the site. Customers are
  redirected to Paystack's hosted page (`authorization_url` from the Initialize Transaction API).
- **The server computes every amount** — subtotal, delivery fee, Paystack fee, total — from its own
  product prices and fee rules. The client sends only product IDs, quantities, and the fulfilment
  choice. Never accept a price, total, fee, currency, or callback URL from the request.
- **Currency comes from server configuration** and the server refuses to start a payment if it is
  not set. Never fall back to a default currency. *Why:* a silent default can charge in the wrong
  currency.
- **Paid means verified by the server.** An order becomes `paid` only after the server confirms the
  transaction with Paystack and checks that status is `success` **and** amount (in minor units)
  **and** currency match the stored order. The customer landing on the callback URL proves
  nothing. *Why:* checking amount without currency let a charge in a cheaper currency pass.
- **Two confirmation paths, one function.** Paystack's webhook and the callback-return verify
  (`GET /transaction/verify/:reference`) both call the **same** `markOrderPaid` function, which
  uses an atomic conditional update (`status: 'pending_payment' → 'paid'`). Only the caller that
  wins that update sends emails. The verify path is required because Paystack cannot reach
  `localhost`, and the webhook can arrive after the customer returns. *Why:* separate code paths
  drifted apart in Vision 25 — one checked the amount before marking paid, the other did not.
- **Status only moves forward.** A `charge.failed` event or a late duplicate must never move a
  `paid` order back to `failed` or `pending_payment`.
- **Webhook route:** mounted **before** `express.json()` with `express.raw({ type:
  'application/json' })` and its own rate limiter. Verify `x-paystack-signature` (HMAC SHA-512 of
  the raw body with the secret key) using `crypto.timingSafeEqual`, then parse the JSON **only after**
  the signature passes. Unsigned or malformed requests get a quiet 400, never a 500.
- **Webhook idempotency:** store each received event in a `WebhookEvent` collection with a unique
  index on Paystack's event `id`. A duplicate delivery (Paystack retries) is detected and skipped.
  Store only the fields the code reads, not the full payload.
- **Reference = the order's MongoDB `_id`.** Unique per attempt, and Paystack treats a repeated
  reference as the same transaction.
- **Create, then initialize, then roll back on failure.** Create the order as `pending_payment`,
  call Initialize Transaction, and delete the order if that call fails, so no dangling unpaid orders
  are left behind.
- **Refuse to start payment for an order that is already paid.** *Why:* a customer with two tabs
  open could otherwise pay twice.
- **`callback_url` is built on the server** from the `FRONTEND_URL` setting and sent per
  transaction. *Why:* a client-supplied return address can send customers to a phishing page right
  after paying.
- **Secret key stays on the server** (`PAYSTACK_SECRET_KEY`), never in the frontend bundle, logs,
  or error messages. If it is missing, payment routes return `503 PAYMENT_CONFIG_ERROR` instead of
  crashing.
- **Test mode is visible:** the server derives a `paystackTestMode` flag from whether the key starts
  with `sk_test_` and exposes it publicly; the checkout shows a "TEST MODE" badge. Switching to live
  keys requires explicit direction from the project owner.
- **Paystack fee is passed to the customer** as a separate, visible line in the order summary
  before they pay. The fee rule (percentage, flat amount, cap) is configuration taken from GPEC's
  Paystack plan, never hard-coded from memory. The product prices themselves are never changed.

### 4.2 Never accept server-controlled fields from the client

Fields like `price`, `amount`, `deliveryFee`, `status`, `paid`, `reference`, `role`, `isAdmin` are
decided by the server. Do not include them in input validation at all — use allowlists. The enquiry
route already does this: it takes `{ productId, quantity }` and looks up name and reference in
`backend/src/data/catalogue.ts`. Keep that pattern for orders.

### 4.3 Validate every input

Every route validates body, params, and query before any logic runs (see
`backend/src/validation/enquiry.ts`). Unknown fields are rejected — the Mongoose schemas use
`strict: 'throw'`. A route that accepts ad-hoc, unvalidated data is a bug.

### 4.4 Every UI restriction needs a matching server check

A disabled button or client-side validation enforces nothing. Example: the "Submit order" button is
hidden when the cart is empty, and the server separately rejects an empty `items` array. When you
add a frontend gate, confirm the backend enforces the same condition.

### 4.5 Admin access (when the admin panel is built)

- Every admin route requires authentication **and** an admin role check, in one shared middleware.
- Customer orders and enquiries are readable only by admins. Ask of every new list route: "If an
  anonymous visitor calls this, do they see anyone's data?"
- Admin sessions: refresh tokens in `httpOnly`, `Secure`, `SameSite` cookies; no tokens in
  `localStorage`. All frontend HTTP goes through the shared service layer in
  `frontend/src/services/`.
- Admins cannot demote, deactivate, or delete themselves. Consider 2FA for admin accounts.

### 4.6 Audit trail for admin changes

Every price change, product change, and order status change made by an admin records **who**,
**what** (old and new value), and **when**. *Why:* prices appear on the live site and drive real
payments; GPEC must be able to answer "who changed this price and when?"

### 4.7 Rate limiting and spam protection

Not implemented yet. Needed on `POST /api/enquiries`, order creation, the Paystack webhook (its own
limiter), and (later) admin login with a stricter limit. All visitors are anonymous, so key by IP.
Any in-memory limiter only works with one API instance (Section 6.3).

**Behind Coolify's proxy, set `app.set('trust proxy', 1)`.** Without it every request appears to
come from the proxy's IP, so one shared budget blocks every visitor at once.

### 4.8 Secrets and configuration

- No secrets in source, logs, error messages, or the client bundle. `.env` files are gitignored by
  the root `.gitignore`. Never paste real secrets (Atlas connection string, Paystack keys) into a
  chat with an AI assistant.
- Every variable has a dummy entry in `backend/.env.example` or `frontend/.env.example`.
- Production secrets live in Coolify's environment-variable store, not in a `.env` file on the
  server. Test and live values differ.
- Validate required configuration at startup with a schema and fail fast with a clear message.
  Reject `*` or `null` in allowed CORS origins, and require HTTPS origins in production.
- Never log card-adjacent data, tokens, or full customer personal details.

### 4.10 HTTP hardening (not implemented yet)

`helmet()` for security headers, a request body size limit (already 32kb on JSON), and
`express-mongo-sanitize` (or equivalent) so query operators like `$gt` in user input cannot reach
MongoDB queries.

### 4.9 Customer personal data

Orders and enquiries hold names, emails, phone numbers, and addresses. Collect only what is needed
(Principle 5), never return it from public routes, and keep it out of logs.

---

## 5. Data Model Conventions

**Databases:** one MongoDB Atlas cluster holds two databases.

| Database | Used by | Rule |
|---|---|---|
| `gpec_dev` | Local development and testing | Test data only; safe to clear |
| `gpec` | Production (Coolify) | Real customer data; never written to from a developer machine |

The database name comes from the `MONGODB_URI` path (`.../gpec_dev?...`). The app connects to
whichever database the URI names, so check the name whenever the variable is set.

**Startup guard:** when `NODE_ENV=production`, `backend/src/server.ts` refuses to start unless the
connected database is exactly `gpec` (this also catches Atlas's default `test` when the URI has no
name), and logs which database it found. The guard only works if production sets
`NODE_ENV=production`. Do not remove or weaken it.

**Current entities:**

- **Enquiry** (`backend/src/models/Enquiry.ts`) — `reference` (unique, `GPEC-YYYY-XXXXXXXX`),
  `customer { fullName, company, email, phone }`, `location`, `notes`,
  `items [{ productId, name, reference, quantity }]`, `status` (`'new'` only), timestamps.
- **Product catalogue** — not in the database yet. It exists **twice**:
  `frontend/src/data/catalogueProducts.ts` (display data) and `backend/src/data/catalogue.ts` (the
  server's canonical ID → name/reference list). **The `id` values must match in both files.**
  Product `id` (e.g. `panel-001`) is the internal key; `reference` (e.g. `GPEC-CP-001`) is the
  customer-facing product code. Do not confuse them.

**Planned entities** (define fully when built, and update this section):

- **Product** in MongoDB, edited from the admin panel, replacing both catalogue files. Price stored
  as an integer in the currency's minor unit.
- **Order** — `_id` (also the Paystack reference), customer-facing reference, items with **unit
  price snapshotted at order time**, fulfilment method (`pickup` | `delivery`), delivery address
  (only for delivery), delivery fee, subtotal, Paystack fee, total charged, currency, status (e.g.
  `pending_payment`, `paid`, `failed`, `cancelled` — confirm the set before building), `paidAt`.
- **WebhookEvent** — Paystack event `id` (unique index), event type, minimal payload, processing
  status, timestamps (Section 4.1).
- **Admin user** and **audit record** (Section 4.6).

**General rules:**

- Store money as integers in the smallest currency unit. The company is in Nigeria; the currency is
  expected to be NGN (kobo) but is **not confirmed** — do not hard-code it until confirmed.
- Snapshot prices onto the order. A later admin price change must not alter past orders.
- Status values are a fixed enum, shared between backend and frontend.
- Index fields used in filters and sorts (`reference`, `status`, `createdAt`).
- Store timestamps in UTC (Mongoose `timestamps: true` does this); convert only for display.
- Prefer archiving over deleting products that past orders reference.

---

## 6. Architecture

### 6.1 Repository layout

```
/
├── AGENTS.md                 # Content and scope rules (imported above)
├── README.md                 # Company brief: services, pages, launch requirements (source of truth)
├── ECOMMERCE_REQUIREMENTS.md # Shop, checkout, and payment behaviour
├── HANDOVER.md               # Historical notes from the previous developer (macOS paths)
├── backend/                  # Express 5 + Mongoose API (TypeScript, compiled to dist/)
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts         # Loads env, connects MongoDB, starts the server
│       ├── app.ts            # CORS, JSON parsing, routes, 404 and central error handler
│       ├── routes/           # HTTP wiring (enquiries.ts)
│       ├── validation/       # Hand-written input validators (enquiry.ts)
│       ├── models/           # Mongoose schemas (Enquiry.ts)
│       └── data/             # Server-side canonical catalogue (catalogue.ts)
└── frontend/                 # React + Vite SPA (TypeScript)
    ├── vite.config.ts
    ├── tsconfig*.json        # tsconfig.app.json (src/) and tsconfig.node.json (vite.config.ts)
    ├── public/assets/        # Images and videos served at /assets/...
    └── src/
        ├── main.tsx          # Entry point
        ├── App.tsx           # Hash router: #shop, #shop/order, else landing page
        ├── types.ts          # Shared shapes: Product, CartEntry, CartLine, StoreMode, enquiry API
        ├── pages/            # LandingPage.tsx, StorePage.tsx
        ├── components/       # Header, Footer, LogoLockup, Arrow; shop/ for store components
        ├── data/             # Site copy (landingContent.ts) and catalogue (catalogueProducts.ts)
        ├── services/         # API client (enquiryApi.ts)
        └── styles.css        # All styles, one global stylesheet
```

### 6.2 Layering

- **Today:** route → validator → model. `routes/enquiries.ts` validates, then calls
  `Enquiry.create` directly. Acceptable at this size.
- **As the backend grows (orders, payments, admin):** add a `services/` layer for business logic
  (pricing, Paystack calls, order state changes). Routes stay thin: authenticate → authorize →
  validate → call service → respond. Paystack API calls live in one module, not scattered across
  routes.
- Site copy lives in `frontend/src/data/`, separate from layout (AGENTS.md workflow step 5). Keep it
  that way.

### 6.3 Runtime topology

Run **exactly one API instance**. Nothing currently lives only in memory, but the planned rate
limiter will. Before running two instances, move that state to a shared store. In Coolify, set the
API replica count to 1 and do not enable autoscaling; this is enforced only by that setting, not
by code.

### 6.4 Responses and errors

- The central error handler in `backend/src/app.ts` maps JSON syntax errors and Mongoose validation
  errors to 400 and everything else to 500. Extend it; do not hand-roll error JSON in routes.
- Error responses use `{ message, errors? }`. Keep that shape for new routes, and add a stable
  machine-readable `code` (e.g. `PAYMENT_CONFIG_ERROR`, `ORDER_ALREADY_PAID`) when the frontend
  needs to show a specific message. When the backend grows, introduce a small set of error classes
  (`ValidationError` 400, `NotFoundError` 404, `ConflictError` 409, plus 401/403 for admin) handled
  by that one handler.
- Only log errors with status ≥ 500 as server errors. A declined card is normal operation.
- Never leak internal error details or stack traces to the client.

### 6.5 Concurrency

- Marking an order paid must happen at most once (Section 4.1): use a conditional update on status.
- Disable submit buttons while a request is in flight (the order form already does this), and
  remember the server must still tolerate a double submit.

---

## 7. Tech Stack & Commands

**Stack:** TypeScript 7 in strict mode on both sides (ES modules). React 19 + Vite 8 frontend.
Node.js 22, Express 5, Mongoose 8, MongoDB. Payments: Paystack (planned, hosted redirect checkout).

- Frontend: Vite compiles the TypeScript; `tsc -b` only type-checks (`tsconfig.app.json` for
  `src/`, `tsconfig.node.json` for `vite.config.ts`).
- Backend: `tsx` runs TypeScript directly in development; `tsc` compiles to `backend/dist/` for
  production. Relative imports end in `.js` even though the files are `.ts` — Node's ES module
  resolution requires it.
- Shared shapes live in `frontend/src/types.ts`. The backend has its own types until a shared
  package is introduced with the orders work.

```bash
# Install
cd backend && npm install
cd frontend && npm install

# Run locally. backend/.env sets MONGODB_URI to the gpec_dev database on the shared Atlas
# cluster — never the production gpec database (Section 5, "Databases").
cd backend && npm run dev      # tsx watch src/server.ts
cd frontend && npm run dev     # Vite dev server

# Checks — all must pass before a change is "done". No lint or tests exist yet (see Known Gaps).
cd frontend && npm run typecheck   # tsc -b
cd backend && npm run typecheck    # tsc --noEmit
cd frontend && npm run build       # type-checks, then builds
curl http://localhost:5001/api/health   # must return {"status":"ok"}
# ...plus the browser verification in Section 10.

# Build / run production output
cd frontend && npm run build && npm run preview
cd backend && npm run build && npm start   # node dist/server.js

# Inspect saved enquiries (paste the gpec_dev URI from backend/.env; never print it in shared logs)
mongosh "<MONGODB_URI>" --eval 'db.enquiries.find().sort({createdAt:-1}).limit(5)'
```

**Ports:**

| Service | Port |
|---|---|
| Frontend (Vite dev) | 5173 |
| Backend API | 5001 |
| MongoDB (only if run locally; normally Atlas) | 27017 |

**Environment:**
- `backend/.env.example`: `PORT`, `MONGODB_URI`, `CLIENT_ORIGIN`. Payments will add
  `PAYSTACK_SECRET_KEY`, `FRONTEND_URL` (for the Paystack callback), the currency, and the Paystack
  fee settings — add them to `.env.example` when implemented.
- `frontend/.env.example`: `VITE_API_BASE_URL`. Anything prefixed `VITE_` is public; never put a
  secret there.
- `MONGODB_URI` points to MongoDB Atlas. The database name is the path segment before `?`:
  `.../gpec_dev?...` locally, `.../gpec?...` in production. The real value lives only in
  `backend/.env` locally and in Coolify in production.

### Deployment

**Never deploy, publish, or touch the server without explicit direction.** The project owner
deploys.

**Where it runs:**

| Part | Where | Notes |
|---|---|---|
| Backend API | Hetzner VPS, Docker, managed by Coolify | Exactly 1 replica |
| Frontend | Hetzner VPS, Docker (nginx serving the Vite build), Coolify | Static files |
| MongoDB | MongoDB Atlas (external) | Network access limited to the Hetzner server IP |
| HTTPS | Coolify's proxy (Traefik) with Let's Encrypt | Auto-renewing certificates |

**Release steps (manual, by the project owner):**
1. Confirm GitHub Actions CI is green on the `main` commit to ship.
2. In the Coolify dashboard, open the resource and press **Deploy**. On the first deploy, and
   whenever the variable is edited, check that `MONGODB_URI` ends in **`/gpec?`** — never
   `/gpec_dev?`, which is the local development database. An AI assistant helping with deployment
   must raise this check with the project owner.
3. Immediately check `/api/health`, load the home page and the shop, and (after payments exist)
   make a test-mode checkout.

**Rollback:** Coolify keeps past deployments. Open the resource's **Deployments** tab and redeploy
the last good one. This rolls back code only — data written by a bad release needs separate repair.

**Do not add auto-deploy** (a workflow that deploys on push). Vision 25 removed its auto-deploy
workflows as an unreviewed path to production.

**Docker images (to be created):** multi-stage builds, base images pinned to an exact version,
`npm ci`, run as the non-root `node` user, a `HEALTHCHECK`. The backend image sets
`ENV NODE_ENV=production`, which the database startup guard (Section 5) depends on. The frontend image serves the build with
nginx, sending security headers (Content-Security-Policy, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`), long caching for `/assets/`, `no-cache` for
`index.html`, and falling back to `index.html` for unknown paths. Never bake secrets into an image.

**Health check limits:** `/api/health` only proves the Node process is running; it does not check
MongoDB. A green health check does not mean the database is reachable.

**Before launch (infrastructure checklist):**
- Atlas cluster on a tier with **automated backups** (the free M0 tier has none), and one backup
  restore actually tested.
- Atlas network access limited to the Hetzner server IP plus the developer's current IP (needed
  because local development uses the same cluster), never `0.0.0.0/0`.
- **Separate Atlas database users:** a development user with `readWrite` on `gpec_dev` only, and a
  production user with `readWrite` on `gpec` only. The credentials on a developer laptop then
  cannot touch production data even by mistake.
- **Coolify `MONGODB_URI` uses the production user and the `gpec` database, not `gpec_dev`.**
- Secrets set in Coolify only; Paystack live keys added only with GPEC's approval.
- Paystack dashboard webhook URL set to the production API's HTTPS webhook route.
- HTTPS works on every domain, HTTP redirects to HTTPS, and `Strict-Transport-Security` is present.
- API replica count is 1 with no autoscaling.
- A named person owns each incident type: leaked secret, payment webhook outage, database restore —
  with the logins needed (Coolify, Atlas, Paystack, GitHub) ready.

### Continuous integration (planned)

GitHub Actions on every push and pull request to `main`: `npm ci`, `npm run typecheck` in both
packages, frontend build and lint, backend build and tests, `npm audit --omit=dev --audit-level=high`, and a gitleaks secret scan. Pin third-party
actions to a commit SHA. CI never deploys.

---

## 8. Backend Conventions

### DO
- Validate every input with a validator in `backend/src/validation/` before any logic.
- Look up names, references, and prices server-side from the canonical product data.
- Use the central error handler and the `{ message, errors? }` shape.
- Return only the fields the client needs (the enquiry route returns `reference` and `createdAt`).
- Paginate list endpoints and cap page size server-side (admin lists).
- Name files by resource (`routes/orders.ts`, `validation/order.ts`, `models/Order.ts`).

### DO NOT
- Accept prices, totals, fees, statuses, or references from the client (Section 4.2).
- Add a route without a validator.
- Call Paystack from a route directly once a payments service exists — go through it.
- Swallow errors silently. If you deliberately ignore one, log it and comment why.

### Payments (Paystack) — planned
All Paystack HTTP calls live in one module (e.g. `services/paystack.ts`); the rules are in
Section 4.1.
1. `POST` order route: validate items and fulfilment choice → compute subtotal, delivery fee,
   Paystack fee, and total on the server → create order `pending_payment` → call Initialize
   Transaction with `reference` = order `_id`, amount in minor units, configured currency, and a
   server-built `callback_url` → on failure delete the order → return `authorization_url` →
   frontend redirects.
2. Paystack redirects the customer to the callback URL → frontend asks the server to verify →
   server calls Verify Transaction and runs `markOrderPaid`.
3. Webhook route (raw body, signature verified, event recorded in `WebhookEvent`) runs the same
   `markOrderPaid`.
4. Only the caller that wins `markOrderPaid`'s conditional update sends confirmation emails. Show
   the confirmation and clear the cart only after verified payment.
5. Failed or abandoned payment: order stays unpaid; customer can retry. Never create a second order
   silently for the same cart without a clear rule.
6. Paystack API errors (e.g. a declined card) return `400` with a clear message and are not logged
   as server errors.

### Email / notifications — planned
README requires a confirmation to the customer and routing to GPEC staff. Recipients, sender
address, and the email provider are not chosen yet. Keep templates in version control.

### File uploads — planned
README asks for drawings and photos on quote forms. When built: validate type and size on the
server, keep files private, generate short-lived download links for admins only, and never store a
raw public URL on the record.

---

## 9. Frontend Conventions

### Structure
- One component per file. Pages in `pages/`, shared components in `components/`, store components
  in `components/shop/`.
- Props are typed with an `interface <Component>Props` directly above the component. Data shapes
  used in more than one file go in `src/types.ts`; use `import type` for type-only imports.
- Form submit handlers take React's `SubmitEvent<HTMLFormElement>` (`FormEvent` is deprecated).
- Routing is hash-based in `App.tsx`. Any new route must be added there.
- **Before creating a new page, read the existing pages and match their shell** (skip link, header,
  `main` with an id, footer).

### Data
- All HTTP goes through `frontend/src/services/`. No inline `fetch` in components.
- Display prices from the server's data; never compute a payable total that the server does not
  recompute.
- Show distinct loading, empty, and error states for every data view.
- The cart lives in `localStorage` under `gpec-order-cart` and stores only `{ id, quantity }`. Do
  not store prices or personal data there.

### Forms
- Every field has a visible `<label>`. Required fields are marked and validated.
- Keep entered values when submission fails.
- Client validation is UX only; the server validates again (Section 4.4).

### Styling
- One global stylesheet: `frontend/src/styles.css`. Do not add CSS frameworks, CSS-in-JS, or UI
  component libraries without discussing it first.
- Brand colours and fonts are CSS custom properties on `:root` (`--ink`, `--forest`, `--deep`,
  `--lime`, `--cream`, `--sand`, `--muted`, `--line`, `--mono`, `--sans`, `--serif`). **New code uses
  these variables**, not new hex values. (Existing code has many hard-coded colours — see Known
  Gaps.)
- The existing CSS is desktop-first (`max-width` media queries). Reuse the existing breakpoints
  (1100, 820, 540px are the main ones) rather than inventing new ones.
- No inline styles except genuinely dynamic values. Respect the existing
  `prefers-reduced-motion` rules.

### Responsive design
- New UI is responsive from its first commit.
- **Always check at 390px width** and at desktop width. No horizontal page scroll, ever.
- Modals become full-width on mobile.

### Accessibility (minimum bar, also required by AGENTS.md)
- Every control has an accessible name; icon-only buttons get `aria-label`.
- Text contrast meets WCAG AA (4.5:1 normal, 3:1 large).
- Visible focus styles on links, buttons, and inputs.
- Dialogs trap focus while open, close on Escape, and return focus to the trigger.
- Meaningful images have descriptive `alt`; decorative ones use `alt=""`.

---

## 10. Testing & Verification

### 10.1 "Done" means verified, not "the code looks right"

1. `npm run typecheck` passes in both `frontend/` and `backend/`, and `npm run build` succeeds in
   `frontend/`. Do not silence a type error with `any`, `as`, or `!` unless the value is genuinely
   known (e.g. the `#root` element) — fix the type. Lint and tests do not exist yet — when they are
   added, they become mandatory here.
2. **For any UI change, drive the real app in a browser** at 390px and desktop width. Rereading
   JSX/CSS is not verification.
3. **For the shop:** catalogue → open product → add to cart → change quantity → order form → submit
   → confirmation shown → record present in MongoDB (`mongosh` command in Section 7).
4. **For payments:** use Paystack **test keys only**. Verify success, failure, and abandoned
   payment, and that a replayed webhook does not mark an order paid twice. Call the API directly
   with a tampered price or total and confirm the server ignores it.
5. **Verify server-side enforcement** by calling the API directly with the condition unmet (expect
   the specific error), then met.

### 10.2 Test design
- Planned tooling: Jest + Supertest with `mongodb-memory-server` for API tests; Playwright with
  `@axe-core/playwright` for browser flows and accessibility checks.
- Cover unhappy paths: missing fields, unknown product ID, quantity out of range, empty cart,
  invalid webhook signature, amount mismatch, **currency mismatch**, a tampered price or fee in the
  request, a replayed webhook, webhook and callback verify arriving together, a `charge.failed`
  after `paid`, and double submission.
- Use a separate test database, never shared or production data (never the `gpec` database).

### 10.3 Safety while verifying
- Test records go in `gpec_dev`, clearly marked (e.g. `[TEST]` in the name) and deleted afterwards.
  Never run scripts against the production `gpec` database.
- Never run a delete/update with an empty or broad filter. Run the equivalent read first.
- Delete throwaway scripts and screenshots when done.

---

## 11. Change Checklists

### Adding a new backend route
1. Validator in `backend/src/validation/` (server-controlled fields excluded).
2. Model/schema with indexes on filter/sort fields; `strict: 'throw'`.
3. Route in `backend/src/routes/`, registered in `app.ts`.
4. If admin-only: auth + role middleware (Section 4.5) and audit record for mutations (Section 4.6).
5. Client function in `frontend/src/services/`.
6. Add any new env variable to `.env.example`.
7. Update `backend/README.md` route list and, if behaviour changed, `ECOMMERCE_REQUIREMENTS.md`.

### Changing the product catalogue (until it moves to MongoDB)
1. Edit **both** `frontend/src/data/catalogueProducts.ts` and `backend/src/data/catalogue.ts`.
2. Keep `id` values identical in both.
3. Use only GPEC-supplied product data; mark anything else as a placeholder.

### Adding a new frontend page
1. Match the existing page shell; add the hash route in `App.tsx` and the navigation link.
2. Copy in `frontend/src/data/`, layout in the component.
3. Loading, empty, and error states; accessible labels.
4. Verify in a browser at 390px and desktop.

### Adding a UI gate
1. Find the endpoint the action calls.
2. Confirm the same condition is enforced there; add it if missing.
3. Test the endpoint directly with the condition unmet.

---

## 12. Working Habits

### Before acting
- **Read before asking.** Check this file, `README.md`, `AGENTS.md`, `ECOMMERCE_REQUIREMENTS.md`,
  and the code before asking a question the repository already answers.
- **Ask when the decision is genuinely the user's** (product behaviour, prices, scope, company
  facts); pick sensible defaults for purely technical choices and say what you chose.
- **For security fixes or anything touching payments, explain the problem in plain terms and get
  confirmation before changing behaviour.**

### Actions that need explicit permission
- Committing, pushing, merging, deploying, or publishing.
- Sending anything to customers or third parties (AGENTS.md).
- Switching Paystack to live keys or processing a real payment.
- Deleting or overwriting files or data you did not create in this session.
- Installing new dependencies or changing infrastructure/configuration.
- Adding analytics, tracking, advertising, or external services (AGENTS.md).

Permission for one instance does not carry over to the next unless the user says so.

### While working
- Keep diffs focused. Do not reformat unrelated code.
- Match the surrounding style: function components, two-space indent, no semicolons, single quotes.
- If you find a **pre-existing** problem, flag it as its own item (and add it to Known Gaps if it is
  not fixed now). Do not silently fix unrelated code.

### After a fix — the recheck pass
Re-read every file you touched for leftover code from abandoned approaches, stale comments, unused
values, and stale user-facing text (see Lessons Learned).

### Reporting
- State what was done, what was verified and how, what was not verified, and what failed.
- Every summary includes a plain-language explanation a non-developer at GPEC would understand.
- List any company details still needed from GPEC (AGENTS.md workflow step 8).

---

## 13. Documentation Must Stay In Sync With Behaviour

- **`README.md`** — company facts, pages, quote and ordering flow, launch checklist.
- **`ECOMMERCE_REQUIREMENTS.md`** — catalogue, cart, checkout, payment, fulfilment behaviour.
- **`backend/README.md`** — API routes and local setup.
- **`AGENTS.md`** — whenever `README.md` changes, review `AGENTS.md` (and this file) in the same
  task.

Update the relevant document in the same change whenever you add a user-facing capability, change
the steps or conditions of a flow, change a business rule (price handling, delivery fee, payment
status), or add a new failure path. No update needed for pure refactors or styling-only changes.

---

## 14. Known Gaps

Pre-existing issues to be fixed over time. Remove an item when it is fixed.

**Repository**
- `frontend/dist` and `.DS_Store` are still committed (`node_modules` and `.env` are now covered by
  the root `.gitignore`).
- No lint or automated tests in either package.
- No GitHub Actions CI workflow yet.

**Deployment**
- No Dockerfiles, nginx config, or Coolify resources yet.
- No startup configuration validation; `helmet`, input sanitising, and `trust proxy` not set.
- `/api/health` does not check the database.
- `webDevPractice` is an empty file at the root.
- `HANDOVER.md` and `.serena/memories/project_handover.md` describe the previous developer's macOS
  setup (`/Users/happinessessien/...`, Homebrew MongoDB).

**Content (AGENTS.md rules)**
- Sample products in both catalogue files have invented references and specs (e.g. "415 V",
  "IP54 enclosure") and are not marked as placeholders. No prices exist yet.
- Portfolio cards label images "Illustrative visual" but also say "Built by the GPEC team".
- The client name "Afrizone" is published; permission is unconfirmed.
- Navigation (About, Services, Products, Shop, Work, Portfolio) does not match the required
  Home · About · Services · Products · Projects · Current Work · Contact; "Work" and "Portfolio"
  both point to `#work`. No Current Work section.
- Only six of the nine business areas are shown; the accessory categories are merged.
- Footer says "Company contact details to be added"; no phone, email, or address anywhere.

**Functionality**
- The landing-page contact form does not submit anywhere; it only shows a success message
  (`frontend/src/pages/LandingPage.tsx`).
- The order confirmation text still says "When GPEC backend is connected…" although it is
  (`frontend/src/components/shop/OrderForm.tsx`).
- The shop is still enquiry-only: no prices, no pickup/delivery choice, no Paystack integration.
- Product catalogue is duplicated between frontend and backend instead of served from MongoDB.
- No admin panel or authentication.
- No customer confirmation emails, no spam protection or rate limiting, no file uploads, no privacy
  notice.
- Product modal does not trap focus or return focus to the card when closed.

**Styling**
- `styles.css` contains many hard-coded colour values alongside the `:root` variables.
- Breakpoints are desktop-first with several one-off widths (1100, 980, 900, 820, 650, 600, 540px).

**Open business decisions (needed from GPEC)**
- Currency: expected NGN, not confirmed.
- Delivery fee rule for delivery orders: unknown. Do not invent one.
- Pickup location and hours.
- Refund, cancellation, and returns policy for paid orders.
- Who receives order and enquiry notifications.
- Paystack fee rule from GPEC's Paystack plan, and confirmation that passing the fee to customers is
  allowed under GPEC's Paystack terms.
- Atlas cluster tier (must include backups before launch).

---

## 15. Lessons Learned

- **Before 2026-10-20 — Port 5000 clash.** The API's default port moved from 5000 to 5001 because
  macOS Control Center occupies 5000. **Rule:** keep 5001 as the default in code and both
  `.env.example` files.
- **Before 2026-10-20 — Stale confirmation text.** The order confirmation kept saying the backend
  was "not connected" after it was connected. **Rule:** when a feature's state changes, search for
  user-facing text that describes the old state.
- **2026-10-20 — Dependencies committed.** `backend/.gitignore` only covered `backend/`, so
  `frontend/node_modules` was committed. A root `.gitignore` was added and the folder untracked
  with `git rm -r --cached`. **Rule:** a `.gitignore` only applies to its own folder and below,
  and does not untrack files already committed — check `git status` for generated files before
  committing.
- **2026-10-20 — Scope change: online payment.** The shop was built as enquiry-only; GPEC then
  decided to take payment through Paystack with fixed, admin-managed prices and pickup or delivery.
  **Rule:** when scope changes, update `ECOMMERCE_REQUIREMENTS.md`, `README.md`, `AGENTS.md`, and
  this file in the same task, so no document still forbids the new behaviour.
- **2026-10-20 — Practices adopted from Vision 25.** Paystack, deployment (Coolify on Hetzner,
  MongoDB Atlas), CI, and hardening practices were reviewed in the sister project and adopted
  where they fit GPEC's size (Sections 4.1, 4.7, 4.8, 4.10, 7). Heavier pieces (job queues,
  malware scanning, metrics dashboards, recurring charges) were deliberately left out. **Rule:**
  keep this file short; a very large instruction file gets rules missed.
- **2026-10-21 — Database name missing from the URI.** The first local connection string had no
  database name, so the verification enquiry was written to Atlas's default `test` database.
  The project then settled on one cluster with `gpec_dev` (local) and `gpec` (production).
  **Rule:** confirm the connected database name (not the URI) after any `MONGODB_URI` change.
