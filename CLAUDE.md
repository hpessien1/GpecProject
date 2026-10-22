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
- `admin` — GPEC staff, at `#admin`. Today they log in and manage products and prices (with a
  change history); viewing orders and enquiries is still planned. Accounts are created only with
  `npm run admin:create` (Section 7); there is no sign-up.

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
- **GPEC staff member — site administrator.** Updates prices and products and follows up
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
route already does this: it takes `{ productId, quantity }` and looks up name and reference in the
`products` collection (`services/products.ts`), refusing unknown or archived products. Keep that
pattern for orders.

### 4.3 Validate every input

Every route validates body, params, and query before any logic runs (see
`backend/src/validation/enquiry.ts`). Unknown fields are rejected — the Mongoose schemas use
`strict: 'throw'`. A route that accepts ad-hoc, unvalidated data is a bug.

### 4.4 Every UI restriction needs a matching server check

A disabled button or client-side validation enforces nothing. Example: the "Submit order" button is
hidden when the cart is empty, and the server separately rejects an empty `items` array. When you
add a frontend gate, confirm the backend enforces the same condition.

### 4.5 Admin access

- Every admin route requires authentication **and** an admin role check, in one shared middleware:
  `middleware/requireAdmin.ts` (only the `admin` role exists, so a valid session is the role check).
  It also refuses changes whose `Origin` is not a `CLIENT_ORIGIN`.
- Customer orders and enquiries are readable only by admins. Ask of every new list route: "If an
  anonymous visitor calls this, do they see anyone's data?"
- Admin sessions: a random session token in an `httpOnly`, `SameSite=Strict` cookie (`Secure` in
  production, path `/api/admin`), lasting 8 hours. Only its SHA-256 hash is stored
  (`AdminSession`), so logging out or deactivating an account takes effect at once. No tokens in
  `localStorage`. All frontend HTTP goes through `frontend/src/services/` (`adminApi.ts`).
- Passwords: scrypt at OWASP's minimum cost, built into Node (`services/passwords.ts`). Unknown
  emails take as long to reject as wrong passwords, and both get the same message.
- Admins change their own password at `#admin/password` (current password required, at least 15
  characters per NIST SP 800-63B, no composition rules); it ends their other sessions. Wrong current
  passwords count toward the login rate limit.
- Admins cannot demote, deactivate, or delete themselves. **No 2FA yet** (the user chose to leave
  it out for now, 2026-10-21); reconsider before real prices go live.

### 4.6 Audit trail for admin changes

Every price change, product change, and order status change made by an admin records **who**,
**what** (old and new value), and **when**. *Why:* prices appear on the live site and drive real
payments; GPEC must be able to answer "who changed this price and when?"

Implemented for products and for enquiry and contact-request status (`models/AuditRecord.ts`,
`services/adminProducts.ts`, `services/adminRequests.ts`): the change and its record are written in
**one MongoDB transaction**, so nothing changes without a record.
Only fields whose value actually changes are recorded. Transactions need a replica set: Atlas is
one, and the tests use an in-memory replica set.

### 4.7 Rate limiting and spam protection

Implemented in `backend/src/app.ts` with `express-rate-limit`: `POST /api/enquiries` and
`POST /api/contact-requests` each have their own per-IP budget — 10 requests per 15 minutes in
production, 100 in development and test (set in `src/config.ts`). The production limit is the
security boundary; the looser one exists so manual and automated checks do not lock the developer
out. Keep that difference deliberate. Admin login has a stricter budget that counts **failed**
attempts only: 5 per 15 minutes in production, 50 otherwise. Still needed: order creation and the
Paystack webhook (its own limiter). All visitors are anonymous, so key by IP. The in-memory store
only works with one API instance (Section 6.3).

**Spam trap.** Both public forms include a hidden `website` field (`components/SpamTrapField.tsx`):
off-screen, skipped by Tab, hidden from screen readers. If it arrives with a value
(`validation/fields.ts`, `isLikelySpam`), the route answers `201` with a normal-looking reference
but saves nothing, so scripts get no signal. Absent or empty is normal. Any new public form uses the
same component and check.

**Behind Coolify's proxy, `trust proxy` is set to one hop in production only.** Without it every
request appears to come from the proxy's IP, so one shared budget blocks every visitor at once.
Outside production it stays off, so a forged `X-Forwarded-For` header cannot dodge the limit.
`tests/rateLimit.test.ts` covers both.

### 4.8 Secrets and configuration

- No secrets in source, logs, error messages, or the client bundle. `.env` files are gitignored by
  the root `.gitignore`. Never paste real secrets (Atlas connection string, Paystack keys) into a
  chat with an AI assistant.
- Every variable has a dummy entry in `backend/.env.example` or `frontend/.env.example`.
- Production secrets live in Coolify's environment-variable store, not in a `.env` file on the
  server. Test and live values differ.
- Configuration is validated at startup by `backend/src/config.ts` (Zod): the server exits with a
  readable list of problems. `MONGODB_URI` is required in production; `CLIENT_ORIGIN` is a
  comma-separated list of exact origins, never `*` or `null`, https-only in production. Empty
  variables count as unset. Add every new variable to this schema and to `.env.example`, and read
  settings from the `Config` object rather than `process.env` elsewhere.
- Never log card-adjacent data, tokens, or full customer personal details.

### 4.10 HTTP hardening

- `helmet()` sets security headers on every API response; JSON bodies are capped at 32kb.
- **Query-operator injection** (e.g. `{ "fullName": { "$gt": "" } }`) is blocked by the validators,
  not by a sanitising middleware: `validation/fields.ts`'s `text()` keeps only strings, so objects
  become empty values. Every new validator must coerce fields to primitive types this way before
  they reach a query. (`express-mongo-sanitize` is not used — it is unmaintained and breaks on
  Express 5.)

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
  `items [{ productId, name, reference, quantity }]`, `status`, timestamps.
- **ContactRequest** (`backend/src/models/ContactRequest.ts`) — `reference` (unique,
  `GPEC-C-YYYY-XXXXXXXX`), `fullName`, `company`, `email`, `phone`, `subject`, `message`, `status`,
  timestamps.
- **Request status** (both of the above, `models/requestStatus.ts`; same list in the frontend's
  `RequestStatus`): `new` → `in_progress` → `closed`. Every request starts as `new` (never taken
  from the customer); admins may move it to any status, including reopening. Admins read, search,
  and change the status of requests and add internal notes; they cannot edit or delete requests.
- **RequestNote** (`backend/src/models/RequestNote.ts`) — a staff note on an enquiry or contact
  request: `targetType` (`enquiry` | `contactRequest`), `targetId` (the request's `reference`),
  `text` (up to 2000 characters), `author { adminId, email, name }` (copied at the time),
  `createdAt`. Admin-only; never edited or deleted, so each note is its own who/what/when record
  and needs no separate AuditRecord.
- **Product** (`backend/src/models/Product.ts`) — the single source of the catalogue. `_id` is the
  short internal key (e.g. `panel-001`, lowercase letters, digits, hyphens), used in carts and
  enquiry items; `reference` (unique, e.g. `GPEC-CP-001`) is the customer-facing product code. Do
  not confuse them. Also `name`, `description`, `specs`, `image`, `alt`, `price` (integer in the
  currency's smallest unit, `null` until GPEC sets it), `isPlaceholder` (sample data, labelled in
  the shop), `status` (`active` | `archived`), `sortOrder`, timestamps. `GET /api/products` returns
  active products **without** `price` until step 5 configures the currency.
  The 14 current products are samples from `backend/src/data/sampleProducts.ts`, loaded by
  `npm run seed:products` (Section 11).

- **AdminUser** — `email` (unique), `name`, `passwordHash`, `role` (`admin`), `isActive`,
  `lastLoginAt`. **AdminSession** — `tokenHash`, `admin`, `expiresAt` (TTL index deletes expired
  sessions). **AuditRecord** — `action`, `targetType`, `targetId`, `actor { adminId, email, name }`
  (copied at the time), `changes [{ field, from, to }]`, `createdAt`; never edited or deleted.

**Planned entities** (define fully when built, and update this section):

- **Order** — `_id` (also the Paystack reference), customer-facing reference, items with **unit
  price snapshotted at order time**, fulfilment method (`pickup` | `delivery`), delivery address
  (only for delivery), delivery fee, subtotal, Paystack fee, total charged, currency, status (e.g.
  `pending_payment`, `paid`, `failed`, `cancelled` — confirm the set before building), `paidAt`.
- **WebhookEvent** — Paystack event `id` (unique index), event type, minimal payload, processing
  status, timestamps (Section 4.1).

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
├── ROADMAP.md                # Order of work to launch, with status; update as steps finish
├── HANDOVER.md               # Current state and next steps for a new session; update at session end
├── .github/workflows/ci.yml  # CI: type-checks, builds, tests, audit, secret scan
├── docs/RUNBOOK.md           # Coolify and Atlas setup, deploy, rollback, incidents (for the owner)
├── docs/COMMANDS.md          # Every command the developer runs, local and production
├── backend/                  # Express 5 + Mongoose API (TypeScript, compiled to dist/)
│   ├── Dockerfile            # Production image (build context: backend/)
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── tests/                # Vitest + Supertest; helpers.ts gives testApp() and an in-memory DB
│   └── src/
│       ├── server.ts         # Loads config, connects MongoDB, production database guard, listens
│       ├── config.ts         # Zod-validated environment settings (the only reader of process.env)
│       ├── app.ts            # helmet, CORS, JSON parsing, rate limits, routes, 404, error handler
│       ├── errors.ts         # HttpError, ValidationError, NotFoundError, ConflictError
│       ├── middleware/       # requireAdmin.ts: the one admin login check
│       ├── routes/           # HTTP wiring: public (products, enquiries, contact) and admin* routers
│       ├── validation/       # Hand-written validators; fields.ts holds the shared helpers
│       ├── models/           # Enquiry, ContactRequest, RequestNote, Product, AdminUser, AdminSession, AuditRecord
│       ├── services/         # Business logic: products, admin*, passwords, currency, email, emailTemplates, notifications
│       ├── scripts/          # Commands: seedProducts.ts, createAdmin.ts
│       ├── utils/            # reference.ts: customer-facing reference numbers
│       └── data/             # sampleProducts.ts: placeholder products for the seed script
└── frontend/                 # React + Vite SPA (TypeScript)
    ├── Dockerfile            # Builds the site, serves it with nginx (build context: frontend/)
    ├── nginx/                # nginx server config and security headers (incl. the CSP)
    ├── e2e/                  # Playwright browser tests and the contrast check; support/sampleApi.ts
    ├── playwright.config.ts  # Projects: desktop, phone, contrast; serves the production build itself
    ├── vite.config.ts
    ├── tsconfig*.json        # tsconfig.app.json (src/) and tsconfig.node.json (vite.config.ts)
    ├── public/assets/        # Images and videos served at /assets/...
    └── src/
        ├── main.tsx          # Entry point
        ├── App.tsx           # Hash router: #shop, #shop/order, #privacy, #admin… (lazy-loaded), else landing
        ├── types.ts          # Shared shapes: Product, CartEntry, CartLine, StoreMode, enquiry API
        ├── pages/            # LandingPage.tsx, StorePage.tsx, PrivacyPage.tsx, AdminPage.tsx
        ├── components/       # Header, Footer, ServiceShowcase, SpamTrapField, PlaceholderText, …; shop/, admin/
        ├── data/             # Site copy (landingContent.ts, privacyContent.ts, adminContent.ts)
        ├── services/         # apiClient.ts (all HTTP), *Api.ts per resource, cartStorage.ts
        ├── utils/            # money.ts: price input and display (no floating-point maths)
        ├── fonts/            # Self-hosted font files and their licences (no Google Fonts calls)
        └── styles/           # CSS by area: base, site (header/footer), home, shop, privacy, admin
```

### 6.2 Layering

- **Today:** route → validator → service or model. `services/products.ts` holds the catalogue
  queries; `routes/enquiries.ts` validates, looks products up through that service, then calls
  `Enquiry.create` directly. Acceptable at this size.
- **As the backend grows (orders, payments, admin):** put business logic in `services/`
  (pricing, Paystack calls, order state changes). Routes stay thin: authenticate → authorize →
  validate → call service → respond. Paystack API calls live in one module, not scattered across
  routes.
- Site copy lives in `frontend/src/data/`, separate from layout (AGENTS.md workflow step 5). Keep it
  that way.

### 6.3 Runtime topology

Run **exactly one API instance**. The rate limiters and the per-recipient email confirmation cap
keep their counts in memory. Before running two instances, move that state to a shared store. In Coolify, set the
API replica count to 1 and do not enable autoscaling; this is enforced only by that setting, not
by code.

### 6.4 Responses and errors

- The central error handler in `backend/src/app.ts` maps JSON syntax errors and Mongoose validation
  errors to 400 and everything else to 500. Extend it; do not hand-roll error JSON in routes.
- Error responses use `{ message, code?, errors? }`, with a stable machine-readable `code` (e.g.
  `ADMIN_AUTH_REQUIRED`, `CURRENCY_NOT_CONFIGURED`, later `ORDER_ALREADY_PAID`) when the frontend
  needs to react to a specific case. Throw the classes in `backend/src/errors.ts` (`HttpError`,
  `ValidationError` 400, `NotFoundError` 404, `ConflictError` 409); the central handler turns them
  into responses. The admin routes use them; the older form routes still build their 400s inline.
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

All commands, including production ones, are collected for the developer in
[`docs/COMMANDS.md`](docs/COMMANDS.md). Keep it in step when commands change.

```bash
# Install
cd backend && npm install
cd frontend && npm install

# Run locally. backend/.env sets MONGODB_URI to the gpec_dev database on the shared Atlas
# cluster — never the production gpec database (Section 5, "Databases").
cd backend && npm run seed:products   # first time: adds the sample products to gpec_dev
cd backend && npm run admin:create -- --email you@example.com --name "Your Name"   # prints a password once
cd backend && npm run admin:create -- --email you@example.com --reset             # new password, ends sessions
cd backend && npm run dev      # tsx watch src/server.ts
cd frontend && npm run dev     # Vite dev server

# Checks — all must pass before a change is "done" (CI runs the same).
cd frontend && npm run lint        # oxlint
cd backend && npm run lint         # oxlint
cd frontend && npm run typecheck   # tsc -b (site, browser tests, configs)
cd backend && npm run typecheck    # source and tests
cd backend && npm test             # Vitest, in-memory MongoDB
cd frontend && npm run build       # type-checks, then builds
cd frontend && npm test            # Playwright browser tests, desktop and phone (builds and serves the site itself)
cd frontend && npm run check:contrast   # WCAG text contrast, every page and state (about a minute)
curl http://localhost:5001/api/health   # must return {"status":"ok"} (503 if MongoDB is unreachable)
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
- `backend/.env.example`: `PORT`, `MONGODB_URI`, `CLIENT_ORIGIN`, `CURRENCY` (ISO code such as
  `NGN`; **unset until GPEC confirms it** — admins cannot set prices and no payment can start while
  it is unset), `FRONTEND_URL` (the public site; links in emails, later the Paystack callback), and
  the email settings `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `EMAIL_FROM`,
  `STAFF_NOTIFICATION_EMAILS` (all or none). Payments will add `PAYSTACK_SECRET_KEY` and the
  Paystack fee settings — add them to `.env.example` when implemented.
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

**Release steps (manual, by the project owner; full detail in [`docs/RUNBOOK.md`](docs/RUNBOOK.md)):**
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

**Docker images** (`backend/Dockerfile`, `frontend/Dockerfile`): multi-stage builds, base images
pinned to an exact version **and** digest (upgrade steps in each file's header), `npm ci`, non-root
users (`node` for the API; `nginx` on port 8080 via `nginx-unprivileged` for the site), a
`HEALTHCHECK`. Never bake secrets into an image.

- The backend image sets `ENV NODE_ENV=production`, which the database startup guard (Section 5)
  depends on. `server.ts` handles `SIGTERM` so a redeploy finishes open requests instead of being
  killed after Docker's 10-second timeout.
- `VITE_API_BASE_URL` is compiled into the site, so it is a **build** argument. The frontend build
  refuses a missing or non-https value, and the same value sets the CSP's `connect-src`. A new
  external source (Paystack script, analytics, another font host) needs a CSP change in
  `frontend/nginx/security-headers.conf`.
- nginx sends the security headers from `frontend/nginx/security-headers.conf` (CSP,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS), `no-cache`
  for `index.html`, and falls back to `index.html` for unknown paths. **Caching:** `/assets/` mixes
  Vite's hashed bundles with GPEC's unhashed photos and videos from `public/assets/`, so only the
  hashed `.js`/`.css` files are cached for a year (immutable); media is cached for a day, so a
  replaced photo with the same name still shows up.
- Checked locally on 2026-10-21 by building both images, running them against a throwaway MongoDB
  container, and driving the site in a browser (no CSP violations, both forms saved).

**Health check:** `/api/health` returns `200 {"status":"ok"}` only when MongoDB answers a ping within
2 seconds (`services/health.ts`); otherwise `503`, and Docker marks the container unhealthy. During a
database outage the proxy may then stop sending traffic to the API, so the site's forms show their
"could not reach GPEC" message either way.

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

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`, with read-only
permissions:

- **Frontend:** `npm ci`, `npm run lint`, `npm run build` (type-checks first).
- **Browser:** `npm ci`, installs Chromium, then `npx playwright test`: behaviour tests at desktop
  and phone width and the text-contrast check, against the production build with sample API data.
- **Backend:** `npm ci`, `npm run typecheck` (source and tests), `npm run lint`, `npm run build`,
  `npm test`.
- **Docker:** builds both production images (never pushes them), so a broken Dockerfile fails here
  rather than at deploy.
- **Security:** `npm audit --omit=dev --audit-level=high` in both packages, and a checksum-verified
  gitleaks scan of the full history.

Third-party actions are pinned to a commit SHA with the version in a comment. CI never deploys.

**Linting is oxlint, not ESLint.** typescript-eslint needs the TypeScript compiler's JavaScript API,
which TypeScript 7 (native) does not ship, and it supports TypeScript only up to 6.0. oxlint parses
TypeScript itself. Config: `.oxlintrc.json` in each package; only the "correctness" category (likely
bugs) plus React hook and accessibility rules. Every switched-off rule and every
`oxlint-disable-next-line` carries its reason.

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

### Email / notifications (Amazon SES)
Each new enquiry and contact request emails GPEC staff (details, reply-to the customer, and a link
to it in the admin panel) and sends the customer a plain-text confirmation with their reference.
- `services/email.ts` is the only code that talks to SES (`@aws-sdk/client-sesv2`); `Mailer` lets
  tests use `RecordingMailer` (`tests/helpers.ts`) instead. Templates: `services/emailTemplates.ts`.
- `services/notifications.ts` decides who gets what. Routes call it **after** sending the response,
  and it never throws: a failed email is logged with the reference and error type only, and the
  customer's request stands. Spam-trapped or invalid submissions send nothing.
- Plain text only; subjects contain only server-made references, never customer input.
- Customer confirmations are capped at 3 per address per hour (in memory; one API instance), so
  the forms cannot be used to flood a stranger's inbox. Staff notifications are not capped.
- **Off until configured.** All five `SES_*`/`EMAIL_*`/`STAFF_*` settings plus `FRONTEND_URL`, or
  none; a partial set stops the server at startup (`config.ts`). GPEC has no AWS account yet;
  setup: `docs/RUNBOOK.md` Section 1.6. A sending-only IAM key, never the root account.

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
- **In-page links must not change the hash.** The router reads `location.hash`, so a plain
  `href="#shop-main"` is a route change and leaves the page. Skip links call `preventDefault()` and
  focus the target, which has `tabIndex={-1}` (see `StorePage.tsx`, `AdminPage.tsx`).

### Data
- All HTTP goes through `frontend/src/services/`. No inline `fetch` in components.
- Display prices from the server's data; never compute a payable total that the server does not
  recompute.
- Show distinct loading, empty, and error states for every data view.
- The cart lives in `localStorage` under `gpec-order-cart` (`services/cartStorage.ts`) and stores
  only `{ id, quantity }`. Do not store prices or personal data there. Entries for products that
  are no longer listed are dropped once the catalogue loads.

### Forms
- Every field has a visible `<label>`. Required fields are marked and validated.
- Keep entered values when submission fails.
- Client validation is UX only; the server validates again (Section 4.4).

### Styling
- Plain CSS in `frontend/src/styles/`, one file per area. Do not add CSS frameworks, CSS-in-JS, or
  UI component libraries without discussing it first.
  - `base.css`: fonts, the colour and font variables, page defaults, accessibility helpers, and
    pieces several areas share (buttons, eyebrow labels, form messages).
  - `site.css`: the public header and footer (home page and privacy notice).
  - `home.css`, `shop.css`, `privacy.css`: one area each. The admin screens reuse the shop header,
    page buttons, and status messages from `shop.css`.
  - `admin.css`: imported by `pages/AdminPage.tsx`, so it loads only with the admin screens.
- **Load order matters.** `main.tsx` imports base, site, home, shop, privacy in that order;
  `admin.css` arrives last. With equal specificity the later rule wins, so a rule belongs in the
  file of the one area whose classes it uses (two areas: `base.css`), and admin rules must only
  match admin markup, because `admin.css` stays loaded if an admin then visits the public pages.
- Each file is in sections with a comment header, in page order; a section's `@media` rules follow
  its other rules. **One rule per selector per media query:** before adding one, search for the
  selector (`grep -rn "^\.name {" frontend/src/styles/`) and extend the existing rule. The three
  deliberate exceptions (`.panel-feature`, `.component-list`, `.process.section`) say why in a comment.
- The stylesheets are formatted by Prettier (`frontend/.prettierrc.json`): run `npm run format` in
  `frontend/` after editing them; CI runs `npm run format:check`. Prettier touches **only** these
  files (root `.prettierignore`); the TypeScript keeps the project's own style (single quotes, no
  semicolons).
- Brand colours and fonts are CSS custom properties on `:root` in `base.css` (`--ink`, `--forest`,
  `--deep`, `--lime`, `--lime-soft`, `--cream`, `--sand`, `--muted`, `--placeholder`, `--line`,
  `--mono`, `--sans`, `--serif`). **New code uses these variables**, not new hex values. Existing
  hex values are white and one-off shades in gradients (see Known Gaps).
- **Text contrast (WCAG AA): 4.5:1 for normal text, 3:1 for large text (24px+, or 18.66px+ bold),
  in every state: hover, focus, error, disabled, and phone width.** Audited on 2026-10-21 across all
  pages; keep it that way:
  - `--muted` (`#3f4c6b`) passes on cream, white, and the orange-tinted panels. Do not lighten it.
  - `--lime` orange text is only for dark navy backgrounds (`--deep`, `--ink`). It fails on cream
    (2.1:1) and on the mid-blue hover colour (3.5:1); use `--lime-soft` on mid-blue and `--ink` or
    `--forest` on light backgrounds.
  - Text over photos or gradients needs a solid backing or a strong overlay; check the lightest part
    of the image, not the average.
  - A colour set on a hover or error state must be checked against that state's background. Two
    rules with equal specificity let the later one win, which once left the "Request a quote"
    button's text the same colour as its hover background.
  - Animated text must stay readable at its faintest frame (the hero tagline never drops below 70%
    opacity).
  - Text that is part of a decorative illustration (inside a `role="img"` element, such as the
    hero's "GPEC / SYSTEM READY") is exempt.
  - Minimum text size for labels is about `.55rem`; smaller text is unreadable whatever its contrast.
  - **Run `cd frontend && npm run check:contrast` after any change to colours, styles, or layout**
    (CI runs it too). It checks every page and state at both widths, including hover, against the
    production build with sample API data, using axe-core and a pixel comparison. A new page or
    state must be added to `frontend/e2e/contrast.spec.ts`. Exemptions go in `EXEMPT` in
    `e2e/support/contrast.ts`, each with a reason.
- **Navigation:** the menu items live in `data/landingContent.ts` (`navigationLinks`), in the brief's
  order, with Shop as the highlighted button. Above 1100px the full menu sits in the header; at
  1100px and below it collapses into the hamburger ("Menu") button, because the eight items no
  longer fit. Adding an item means checking the 1101–1440px header still fits on one line.
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
   known (e.g. the `#root` element) — fix the type. `npm test` passes in `backend/`, and backend
   changes come with tests. `npm run lint` passes in both. `npm test` passes in `frontend/`, and
   user-visible frontend changes come with browser tests in `frontend/e2e/`.
2. **For any UI change, drive the real app in a browser** at 390px and desktop width. Rereading
   JSX/CSS is not verification.
   For style or layout changes, also run `npm run check:contrast` in `frontend/`.
3. **For the shop:** catalogue → open product → add to cart → change quantity → order form → submit
   → confirmation shown → record present in MongoDB (`mongosh` command in Section 7).
4. **For payments:** use Paystack **test keys only**. Verify success, failure, and abandoned
   payment, and that a replayed webhook does not mark an order paid twice. Call the API directly
   with a tampered price or total and confirm the server ignores it.
5. **Verify server-side enforcement** by calling the API directly with the condition unmet (expect
   the specific error), then met.

### 10.2 Test design
- Backend tests: Vitest + Supertest in `backend/tests/`, run with `npm test`. Each test file gets
  an in-memory MongoDB via `useTestDatabase()` and an app via `testApp()` (`tests/helpers.ts`);
  collections are emptied after every test. Tests never connect to Atlas.
- Frontend tests: Playwright in `frontend/e2e/`, run with `npm test` (desktop and phone projects).
  `support/sampleApi.ts` answers every API call inside the browser with sample data (same routes and
  shapes as the real API; keep it in step) and records what the site sent, so tests check payloads
  and can make the "server" fail. No backend or database. Prefer roles and labels
  (`getByRole`, `getByLabel`) over CSS classes, so tests follow what users see.
- Check that a new test can fail: temporarily break the code it protects and confirm the test turns
  red.
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

### Changing the product catalogue
1. Products live in MongoDB and are edited in the admin panel (`#admin`), which records every
   change. The seed script only **adds** missing sample products
   (`cd backend && npm run seed:products`); it never changes or removes existing ones.
2. Real GPEC products are entered with "Sample listing" unticked (`isPlaceholder: false`). Use only
   GPEC-supplied data; anything else stays marked as a sample.
3. Remove a product by setting `status: 'archived'`, not by deleting it — past enquiries and
   orders refer to it.
4. The seed script refuses the production `gpec` database unless run with `--production`; that
   needs the project owner's go-ahead (runbook).

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

**Deployment**
- Coolify resources and Atlas users not set up yet (Dockerfiles and runbook exist).
- No domain names chosen yet; the runbook uses `<site-domain>` and `<api-domain>`.

**Content (AGENTS.md rules)**
- The 14 products are samples with invented references and specs (e.g. "415 V", "IP54
  enclosure"). The shop labels each one "Sample listing · details to be confirmed by GPEC" until
  GPEC's real product list replaces them. No prices exist yet.
- The client name "Afrizone" is published; permission is unconfirmed.
- About and Current Work (home page) contain **mock content**, added at the project owner's request
  (2026-10-21). It avoids specific claims (no years, numbers, certifications, client names, or
  photos). At the owner's request **nothing on the page marks it as mock**; only the code comments
  in `data/landingContent.ts` do. **Before launch, replace both with GPEC-approved text.**
- The first project video (`portfolio-electrical-components.mp4`) has a sound track and no captions.
  GPEC must confirm whether it contains speech; if so, add captions (a `<track>`), otherwise mute it
  or remove the track. Marked in `LandingPage.tsx` with an `oxlint-disable` comment.
- The footer shows **mock contact details** (owner's request, 2026-10-21): `info@example.com` (a
  domain reserved for examples) and an invalid phone number, so no customer can reach a stranger.
  Replace with GPEC's real details in `data/landingContent.ts` (`companyContact`) before launch.

**Functionality**
- The shop is still enquiry-only: no prices, no pickup/delivery choice, no Paystack integration.
- The contact-form topic list is duplicated (`frontend/src/data/landingContent.ts` and
  `backend/src/validation/contactRequest.ts`); a backend test fails if the two differ.
- Services areas 2–9 use existing photos marked "Illustrative image" (some repeat; three are
  Afrizone project stills, at the owner's request) until GPEC supplies a photo per area.
- Staff reply to requests by email or phone outside the site (the detail page links to both); the
  site does not record replies, only the notes staff add. Request search is a case-insensitive
  substring match with no index, which is fine for GPEC's volume; revisit (text index) if the
  lists reach tens of thousands of requests.
- No admin 2FA, no admin account management in the panel (create, reset, and deactivate are by
  command or database only; each admin can change their own password), and no image uploads (product images must already be in
  `public/assets/`).
- Email notifications are built but **off**: GPEC has no Amazon SES account yet (RUNBOOK 1.6).
  No bounce or complaint handling yet (SES can report these through SNS).
- No file uploads.
- The privacy notice (`#privacy`) is a **draft**: GPEC must supply the highlighted placeholders
  (legal name, privacy contact, retention, hosting regions, legal wording) and approve it.

**Styling**
- About 68 hex colours remain outside `:root` (2026-10-21; 163 before the cleanup): 45 are white
  (`#fff`), the rest one-off shades, mostly in gradients. Only `#ff8b1f` (bright orange, 4 uses) and
  `#0a225f` (navy gradient end, 3 uses) repeat; they could become variables.
- Breakpoints are desktop-first with several one-off widths (1100, 980, 900, 820, 650, 600, 540px).
  Aligning them to 1100/820/540 would change layouts between the old and new widths, so it needs a
  design decision and a browser check, not a cleanup.
- No favicon: every page load requests `/favicon.ico` and gets a 404. Needs GPEC's logo mark.

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
- **2026-10-21 — TypeScript 7 and linting.** typescript-eslint could not run: the native TypeScript 7
  package has no JavaScript compiler API. oxlint was used instead. **Rule:** before adding a tool
  that reads TypeScript, check it supports the project's TypeScript version.
- **2026-10-21 — A test tool needs testing too.** The first contrast checker compared text against
  the wrong pixels (full-page screenshots resize the window) and its hover pass skipped most
  elements, yet it reported "all clear". **Rule:** plant a known problem and confirm a check catches
  it before trusting a passing result.
- **2026-10-21 — Invisible text found only by measuring.** A contrast audit found the order form's
  error message was white on a white form (invisible since it was written), dark-on-dark hover text,
  and orange-on-cream labels. Reading the CSS had not caught them. **Rule:** check contrast by
  measuring the rendered page (all states and both widths), not by reading colour values.
- **2026-10-21 — Database name missing from the URI.** The first local connection string had no
  database name, so the verification enquiry was written to Atlas's default `test` database.
  The project then settled on one cluster with `gpec_dev` (local) and `gpec` (production).
  **Rule:** confirm the connected database name (not the URI) after any `MONGODB_URI` change.
- **2026-10-21 — Refactoring CSS without changing the look.** The stylesheet cleanup was checked by
  comparing every element's computed style in the old and new builds, in every page state, at many
  widths, with hover and focus forced, plus screenshots. A planted hover-only bug was caught by the
  computed styles but not by the screenshots, and the comparison also caught the build minifier
  rewriting `background` with `background-size` in one rule. **Rule:** for a CSS refactor, compare
  computed styles across states and widths; screenshots alone miss hover and focus states.
