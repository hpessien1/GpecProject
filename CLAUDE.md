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
- `customer` — anonymous visitor. Browses, adds to cart, and buys and pays through Paystack,
  choosing pickup or delivery (with a delivery area). Questions of any kind go through the contact form; there
  are no "order enquiries". No customer accounts.
- `admin` — GPEC staff, at `#admin`. They log in, manage products, prices, stock, and delivery areas
  (with a change history), follow up orders, and follow up contact requests. Accounts are created only with
  `npm run admin:create` (Section 7); there is no sign-up.

**Core domains:** products (catalogue, prices), cart, orders, payments (Paystack), fulfilment
(pickup, or delivery by area), contact requests (questions, quotes, and general contact).

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
- **GPEC staff member — site administrator.** Updates prices, products, and stock and follows up
  orders and contact requests. Needs: simple editing without touching code, a clear list of paid
  orders and contact requests, a history of who changed what. Primary risks: a wrong price going live, missed
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
  index on its ID. A duplicate delivery (Paystack retries) is detected and skipped. Store only the
  fields the code reads, not the full payload. Paystack's events carry no event ID of their own, so
  the ID is the event name plus the transaction's `id` (`charge.success:4099260516`). If processing
  fails, the record is removed and the answer is `500`, so Paystack's retry is processed.
- **Unguessable references.** The order's `_id` is made from 12 random bytes (`randomOrderId` in
  `services/checkout.ts`), not a default ObjectId, which counts up: the payment result page is
  opened by this reference alone. That page shows no personal details either way.
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
- **Bank transfer** (2026-10-23, the owner's request) is the one payment that is not confirmed by
  Paystack: staff confirm on the order that the money arrived (`confirmTransferReceived`), which uses
  the same settlement as `markOrderPaid` (`settleOrder`: conditional update, stock, emails) and
  writes an `order.payment` AuditRecord in the same transaction. `markOrderPaid` refuses bank-transfer
  orders, and the transfer actions refuse Paystack orders. A customer's "I have sent the transfer"
  proves nothing. GPEC's bank details (`BankTransferSettings`) decide where money goes: every change
  is recorded and emailed to all active admins. The account is Nigerian (bank, account name, 10-digit
  NUBAN), so bank transfer is offered only while `CURRENCY` is NGN. No Paystack fee on transfers.
  The screen starts with plainly fake **sample details** (`SAMPLE_BANK_DETAILS`: "Sample Bank (not
  real)", account number `0000000000`) for staff to replace (owner's request, 2026-10-23). They can
  be switched on, including on the live site while it is being tested (`seed:demo` does it), and are
  always labelled "do not send money" at checkout, on the instructions, and in the email.
- **Paystack fee is passed to the customer** as a separate, visible line in the order summary
  before they pay. The fee rule (percentage, flat amount, cap) is configuration taken from GPEC's
  Paystack plan, never hard-coded from memory. The product prices themselves are never changed.

### 4.2 Never accept server-controlled fields from the client

Fields like `price`, `amount`, `deliveryFee`, `status`, `paid`, `reference`, `role`, `isAdmin` are
decided by the server. Do not include them in input validation at all — use allowlists. Orders
must take only `{ productId, quantity }` per item and look up name, reference, price, and stock in
the `products` collection, refusing unknown, archived, or out-of-stock products.

### 4.3 Validate every input

Every route validates body, params, and query before any logic runs (see
`backend/src/validation/contactRequest.ts`). Unknown fields are rejected — the Mongoose schemas use
`strict: 'throw'`. A route that accepts ad-hoc, unvalidated data is a bug.

### 4.4 Every UI restriction needs a matching server check

A disabled button or client-side validation enforces nothing. Example: an out-of-stock product's
"Add to cart" button is disabled, and the checkout refuses that product on the server too
(`OUT_OF_STOCK`); a pickup-only product disables delivery in the form, and the server refuses
delivery for it (`PICKUP_ONLY`). When you
add a frontend gate, confirm the backend enforces the same condition.

### 4.5 Admin access

- Every admin route requires authentication **and** an admin role check, in one shared middleware:
  `middleware/requireAdmin.ts` (only the `admin` role exists, so a valid session is the role check).
  It also refuses changes whose `Origin` is not a `CLIENT_ORIGIN`.
- Customer orders and contact requests are readable only by admins. Ask of every new list route: "If an
  anonymous visitor calls this, do they see anyone's data?"
- Admin sessions: a random session token in an `httpOnly`, `SameSite=Strict` cookie (`Secure` in
  production, path `/api/admin`), lasting 8 hours. Only its SHA-256 hash is stored
  (`AdminSession`), so logging out or deactivating an account takes effect at once. No tokens in
  `localStorage`. All frontend HTTP goes through `frontend/src/services/` (`adminApi.ts`).
- Passwords: scrypt at OWASP's minimum cost, built into Node (`services/passwords.ts`). Unknown
  emails take as long to reject as wrong passwords, and both get the same message.
- Admins change their own password at `#admin/password` (current password required, at least 15
  characters per NIST SP 800-63B, no composition rules); it ends their other sessions. Wrong current
  passwords count toward the login rate limit. New passwords known from data breaches are refused
  (`400 PASSWORD_BREACHED`), checked with Have I Been Pwned's free Pwned Passwords API
  (`services/breachedPasswords.ts`; approved by the user 2026-10-22). Only the first 5 characters
  of the password's SHA-1 hash leave the server. If the service cannot be reached the change goes
  ahead and the skip is logged. Tests pass a stand-in (`noBreaches` in `tests/helpers.ts`) and
  never reach the internet. Every password form uses the same check; passwords generated by
  `admin:create` are random and skip it.
- **Forgot password** (built 2026-10-23, needs email): `#admin/forgot-password` asks for an address
  and always gets the same `202` reply; the lookup and email happen after replying, so neither the
  reply nor its timing shows who is an admin. The emailed link `#admin/reset-password/<token>`
  carries 32 random bytes after `#` (never sent to a server, so never in logs); only the SHA-256 is
  stored (`AdminPasswordReset`, TTL). It works **once, for 30 minutes**; a newer link cancels it. The
  page removes the token from the address bar and history at once. Setting the password uses the
  same length and breach rules (a refused password does not use up the link), ends **all** that
  admin's sessions, and emails them that it changed. Limits: requests per IP (every request counts)
  and 3 emails per address per hour; refused links per IP (both reuse `adminLoginRateLimit`'s
  numbers). With email off the request gets `503 PASSWORD_RESET_UNAVAILABLE`; `admin:create --reset`
  still works.
- Admins cannot demote, deactivate, or delete themselves. **No 2FA yet** (the user chose to leave
  it out for now, 2026-10-21); reconsider before real prices go live.

### 4.6 Audit trail for admin changes

Every price change, product change, and order status change made by an admin records **who**,
**what** (old and new value), and **when**. *Why:* prices appear on the live site and drive real
payments; GPEC must be able to answer "who changed this price and when?"

Implemented for products and for contact-request status (`models/AuditRecord.ts`,
`services/adminProducts.ts`, `services/adminRequests.ts`): the change and its record are written in
**one MongoDB transaction**, so nothing changes without a record.
Only fields whose value actually changes are recorded. Transactions need a replica set: Atlas is
one, and the tests use an in-memory replica set.

### 4.7 Rate limiting and spam protection

Implemented in `backend/src/app.ts` with `express-rate-limit`: `POST /api/contact-requests` has a
per-IP budget (each public form route gets its own) — 10 requests per 15 minutes in
production, 100 in development and test (set in `src/config.ts`). The production limit is the
security boundary; the looser one exists so manual and automated checks do not lock the developer
out. Keep that difference deliberate. Admin login has a stricter budget that counts **failed**
attempts only: 5 per 15 minutes in production, 50 otherwise. Checkout has its own budgets
(`orderRateLimit` 10, `checkoutReadRateLimit` 120 for quotes and payment checks), and the Paystack
webhook its own (300). All visitors are anonymous, so key by IP. The in-memory store
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

Orders and contact requests hold names, emails, phone numbers, and addresses. Collect only what is needed
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

- **ContactRequest** (`backend/src/models/ContactRequest.ts`) — `reference` (unique,
  `GPEC-C-YYYY-XXXXXXXX`), `fullName`, `company`, `email`, `phone`, `subject`, `message`, `status`,
  timestamps.
- **Request status** (contact requests, `models/requestStatus.ts`; same list in the frontend's
  `RequestStatus`): `new` → `in_progress` → `closed`. Every request starts as `new` (never taken
  from the customer); admins may move it to any status, including reopening. Admins read, search,
  and change the status of requests and add internal notes; they cannot edit or delete requests.
- **RequestNote** (`backend/src/models/RequestNote.ts`) — a staff note on a contact request:
  `targetType` (`contactRequest`), `targetId` (the request's `reference`),
  `text` (up to 2000 characters), `author { adminId, email, name }` (copied at the time),
  `createdAt`. Admin-only; never edited or deleted, so each note is its own who/what/when record
  and needs no separate AuditRecord.
- **Product** (`backend/src/models/Product.ts`) — the single source of the catalogue. `_id` is the
  short internal key (e.g. `panel-001`, lowercase letters, digits, hyphens), used in carts and
  orders; `reference` (unique, e.g. `GPEC-CP-001`) is the customer-facing product code. Do
  not confuse them. Also `name`, `description`, `specs`, `image` (a site file, `/assets/…`, or an
  uploaded photo, `product-images/<sha256>.webp`, served by the API; Section 8), `alt`, `price` (integer in the
  currency's smallest unit, `null` until GPEC sets it), `isPlaceholder` (sample data, labelled in
  the shop), `outOfStock` (staff's switch) and `stockQuantity` (optional count; `null` = not
  counted), `status` (`active` | `archived`), `sortOrder`, timestamps. **Stock:** a product is out
  of stock when the switch is on or the count is 0 (`isInStock`, same rule in the frontend's
  `utils/stock.ts`). Out-of-stock products stay in the shop, labelled, and cannot be added to the
  cart; archiving removes a product from the shop. Customers see only `inStock`, never the count.
  `deliveryAvailable` (default true; off means pickup only). The count goes down when an order is
  paid (never below 0, recorded as AuditRecord `product.sale`, with `orderReference` and no actor);
  checkout refuses a quantity above the count. `GET /api/products` returns
  active products with `price` (or `null` if unpriced) and `currency` once `CURRENCY` is set; while it
  is unset, no prices and `currency: null` (2026-10-23, owner's request). The shop shows each price,
  "Price to be confirmed" for unpriced products (which cannot be bought online), and a price "each" on
  cart and checkout lines; totals come only from the server's checkout quote.
  The 14 current products are samples from `backend/src/data/sampleProducts.ts`, loaded by
  `npm run seed:products` (Section 11).

- **AdminUser** — `email` (unique), `name`, `passwordHash`, `role` (`admin`), `isActive`,
  `lastLoginAt`, `passwordChangedAt`. **AdminSession** — `tokenHash`, `admin`, `expiresAt` (TTL
  index deletes expired sessions). **AdminPasswordReset** — the same shape for "forgot password"
  links: `tokenHash` (unique), `admin`, `expiresAt` (TTL); deleted when used or replaced.
  **AuditRecord** — `action`, `targetType`, `targetId`, `actor { adminId, email, name }`
  (copied at the time; `null` only for `product.sale`, which has `orderReference` instead),
  `changes [{ field, from, to }]`, `createdAt`; never edited or deleted.

- **DeliveryArea** (`backend/src/models/DeliveryArea.ts`, 2026-10-23) — `name` (unique),
  `description`, `fee` (smallest unit, per order), `status` (`active` | `archived`), `sortOrder`,
  timestamps. Staff manage them at `#admin/delivery`; every change is an AuditRecord
  (`deliveryArea.create` / `.update`). The owner chose areas over distance-based fees (2026-10-23):
  no mapping service, no customer addresses sent to one. Customers choosing delivery pick one.
- **BankTransferSettings** (`backend/src/models/BankTransferSettings.ts`) — one record (`_id`
  `bank-transfer`): `enabled`, `bankName`, `accountName`, `accountNumber` (10 digits), `instructions`,
  `payWithinDays` (1–30). Managed at `#admin/bank-transfer`; AuditRecord `bankTransfer.update`.
  Orders also have `paymentMethod` (`paystack` | `bank_transfer`, default `paystack`), `bankTransfer`
  (the details given, copied), and `transferReportedAt`.
- **WebhookEvent** (`backend/src/models/WebhookEvent.ts`) — `eventId` (unique), `event`,
  `reference`, `outcome` (`processed` | `ignored`), timestamps (Section 4.1).

- **Order** (`backend/src/models/Order.ts`; built 2026-10-22, before checkout, so staff screens and
  demo data exist) — `_id` (also the Paystack reference), `reference` (unique,
  `GPEC-O-YYYY-XXXXXXXX`), `customer { fullName, company, email, phone }`,
  `items [{ productId, name, reference, unitPrice, quantity, lineTotal }]` (**unit price snapshotted
  at order time**), `fulfilmentMethod` (`pickup` | `delivery`), `deliveryAddress` (delivery only), `deliveryArea
  { areaId, name }` (delivery only, copied at the time), `customerNotes`,
  `currency` (the order's own), `subtotal`, `deliveryFee`, `paystackFee`, `total` (smallest unit),
  `paymentStatus` (`pending_payment` | `paid` | `failed`; **set only by the server**, after
  Paystack confirms), `paidAt`, `fulfilmentStatus` (`new` → `processing` → `ready_for_pickup` or
  `out_for_delivery` → `completed`, or `cancelled`; staff move paid orders only; pickup orders are
  never "out for delivery" and delivery orders never "ready for pickup"; every change is an
  AuditRecord `order.status`), timestamps. The admin list shows one **stage** per order: unpaid
  orders as "Awaiting payment" or "Payment failed", paid ones by fulfilment status (the user chose
  this two-part model, 2026-10-22). Staff notes reuse **RequestNote** (`targetType: 'order'`).
  Checkout creates orders (`services/checkout.ts`); the demo command adds demo ones.

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
│       ├── routes/           # HTTP wiring: public (products, product images, contact, checkout, Paystack webhook) and admin* routers
│       ├── validation/       # Hand-written validators; fields.ts holds the shared helpers
│       ├── models/           # ContactRequest, Order, DeliveryArea, WebhookEvent, RequestNote, Product, AdminUser, AdminSession, AdminPasswordReset, AuditRecord
│       ├── services/         # Business logic: products, checkout, paystack, paystackFee, deliveryAreas, admin*, passwords, breachedPasswords, currency, email, emailTemplates, notifications, imageStore, productImages
│       ├── scripts/          # Commands: seedProducts.ts, seedDemoData.ts, createAdmin.ts
│       ├── utils/            # reference.ts: customer-facing reference numbers
│       └── data/             # sampleProducts.ts (seed products); demoData.ts (demo orders and contact requests)
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
        ├── App.tsx           # Hash router: #shop, #shop/order, #shop/payment/<ref>, #privacy, #admin… (lazy-loaded), else landing
        ├── types.ts          # Shared shapes: Product, CartEntry, CartLine, StoreMode, contact and admin API
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
  queries; `routes/contactRequests.ts` validates, then calls `ContactRequest.create` directly.
  Acceptable at this size.
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
- Disable submit buttons while a request is in flight (the contact form already does this), and
  remember the server must still tolerate a double submit.

---

## 7. Tech Stack & Commands

**Stack:** TypeScript 7 in strict mode on both sides (ES modules). React 19 + Vite 8 frontend.
Node.js 22, Express 5, Mongoose 8, MongoDB. Payments: Paystack (hosted redirect checkout).

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
cd backend && npm run seed:demo       # demo orders and contact requests (gpec_dev; -- --remove to delete)
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

# Inspect saved contact requests (paste the gpec_dev URI from backend/.env; never print it in shared logs)
mongosh "<MONGODB_URI>" --eval 'db.contactrequests.find().sort({createdAt:-1}).limit(5)'
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
  `STAFF_NOTIFICATION_EMAILS` (all or none), and the photo storage settings `S3_REGION`,
  `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (all or none), and the Paystack settings `PAYSTACK_SECRET_KEY`,
  `PAYSTACK_FEE_PERCENT`, `PAYSTACK_FEE_FLAT`, `PAYSTACK_FEE_FLAT_WAIVED_BELOW`, `PAYSTACK_FEE_CAP`
  (all or none; they also need `CURRENCY` and `FRONTEND_URL`; amounts in kobo).
- `frontend/.env.example`: `VITE_API_BASE_URL`. Anything prefixed `VITE_` is public; never put a
  secret there.
- `MONGODB_URI` points to MongoDB Atlas. The database name is the path segment before `?`:
  `.../gpec_dev?...` locally, `.../gpec?...` in production. The real value lives only in
  `backend/.env` locally and in Coolify in production.

### Deployment

**Never deploy, publish, or touch the server without explicit direction.** The project owner
deploys, or the developer with the owner's go-ahead; an AI assistant only guides.

**Where it runs** (live since 2026-10-22, not announced; addresses, server, and accounts in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md)):

| Part | Where | Notes |
|---|---|---|
| Backend API | `https://api.gpecengineering.com`: Hetzner CX23 (Nuremberg), Docker, Coolify resource `gpec-api` | Exactly 1 replica |
| Frontend | `https://gpecengineering.com`: same server, nginx serving the Vite build, `gpec-web` | Static files; `www.` redirects |
| MongoDB | MongoDB Atlas (external) | Network access limited to the Hetzner server IP (not yet: Known Gaps) |
| DNS | Cloudflare (also the registrar) | A records **DNS only**, not proxied, so Coolify can get certificates |
| HTTPS | Coolify's proxy (Traefik) with Let's Encrypt | Auto-renewing certificates |

**Release steps (manual; full detail in [`docs/RUNBOOK.md`](docs/RUNBOOK.md)):**
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
workflows as an unreviewed path to production. For the same reason Coolify reads the (public)
repository through its *Public Git Repository* source, which adds no webhooks; its *GitHub App*
source would deploy on every push.

**Coolify variables:** on `gpec-api`, **no** variable is "Available at Buildtime": Coolify passes
build-time variables into the image build, where `NODE_ENV=production` makes `npm ci` skip the
TypeScript compiler and the connection string would end up in the build. On `gpec-web`,
`VITE_API_BASE_URL` **must** be build-time.

**Docker images** (`backend/Dockerfile`, `frontend/Dockerfile`): multi-stage builds, base images
pinned to an exact version **and** digest (upgrade steps in each file's header), `npm ci`, non-root
users (`node` for the API; `nginx` on port 8080 via `nginx-unprivileged` for the site), a
`HEALTHCHECK`. Never bake secrets into an image.

- The backend image sets `ENV NODE_ENV=production`, which the database startup guard (Section 5)
  depends on. `server.ts` handles `SIGTERM` so a redeploy finishes open requests instead of being
  killed after Docker's 10-second timeout.
- `VITE_API_BASE_URL` is compiled into the site, so it is a **build** argument. The frontend build
  refuses a missing or non-https value, and the same value sets the CSP's `connect-src` and
  `img-src` (uploaded photos come from the API). The Dockerfile's `sed` must replace every
  occurrence (`g`): the address appears twice on one line. `e2e/csp.spec.ts` applies the real policy
  in the browser tests, because `vite preview` sends none. A new
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
- Atlas cluster on a tier with **automated backups** (GPEC intends to start on the free M0 tier,
  2026-10-22, which per MongoDB's docs can keep only 4 daily snapshots, with no point-in-time
  restore, 0.5 GB of storage, and 10 GB out per week), and one backup
  restore actually tested.
- Atlas network access limited to the Hetzner server IP plus the developer's current IP (needed
  because local development uses the same cluster), never `0.0.0.0/0`.
- **Separate Atlas database users:** a development user with `readWrite` on `gpec_dev` only, and a
  production user with `readWrite` on `gpec` only. The credentials on a developer laptop then
  cannot touch production data even by mistake.
- **Coolify `MONGODB_URI` uses the production user and the `gpec` database, not `gpec_dev`.**
- Secrets set in Coolify only; Paystack live keys added only with GPEC's approval.
- Paystack dashboard webhook URL set to the production API's HTTPS webhook route.
- HTTPS works on every domain, HTTP redirects to HTTPS, and `Strict-Transport-Security` is present
  (checked 2026-10-23 on the site and the API).
- API replica count is 1 with no autoscaling.
- The AWS project upgraded from the free plan (which ends 2027-04-22) to a paid plan with a spend
  limit.
- **Real bank details entered** in the admin panel (*Bank details*): the sample ones ("Sample Bank
  (not real)", `0000000000`) replaced, or bank transfer switched off.
- **Demo data removed from the live `gpec` database** (`node dist/scripts/seedDemoData.js
  --production --remove` in the `gpec-api` terminal; it reports how many it removed), and the sample
  products archived once GPEC's real ones are in.
- A named person owns each incident type: leaked secret, payment webhook outage, database restore —
  with the logins needed (Coolify, Atlas, Paystack, GitHub) ready.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`, with read-only
permissions:

- **Frontend:** `npm ci`, `npm run lint`, `npm run build` (type-checks first).
- **Browser:** two jobs side by side, inside Playwright's own image (Chromium and its libraries
  included; pinned to the version of `@playwright/test` and a digest, and a step fails if the two
  differ): the behaviour tests at desktop and phone width, and the text-contrast check, both against
  the production build with sample API data. (2026-10-23: installing Chromium on the plain runner
  took up to 8 minutes and the run about 15; expected now: about 5, not yet measured on CI.)
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
- Return only the fields the client needs (the contact route returns `reference` and `createdAt`).
- Paginate list endpoints and cap page size server-side (admin lists).
- Name files by resource (`routes/orders.ts`, `validation/order.ts`, `models/Order.ts`).

### DO NOT
- Accept prices, totals, fees, statuses, or references from the client (Section 4.2).
- Add a route without a validator.
- Call Paystack from a route directly once a payments service exists — go through it.
- Swallow errors silently. If you deliberately ignore one, log it and comment why.

### Payments (Paystack)
Built 2026-10-23 (test mode; setup in `docs/RUNBOOK.md` 1.8). All Paystack HTTP calls live in
`services/paystack.ts` (`PaystackClient`; tests pass `FakePaystack` from `tests/helpers.ts`); the
order flow is `services/checkout.ts`; the fee rule is `services/paystackFee.ts` (the charge is grossed
up so GPEC receives the full order value after Paystack's fee; the rule comes from the five
`PAYSTACK_*` settings). The rules are in Section 4.1. Routes: `routes/checkout.ts`,
`routes/paystackWebhook.ts`.
1. `POST` order route: validate items and fulfilment choice → compute subtotal, delivery fee,
   Paystack fee, and total on the server → create order `pending_payment` → call Initialize
   Transaction with `reference` = order `_id`, amount in minor units, configured currency, and a
   server-built `callback_url` → on failure delete the order → return `authorization_url` →
   frontend redirects.
2. Paystack redirects the customer to `FRONTEND_URL/shop/payment-complete?reference=…` (a path,
   because Paystack appends a query, which a `#` address would swallow); `main.tsx` turns it into
   `#shop/payment/<reference>` → the page asks the server → server calls Verify Transaction and runs
   `markOrderPaid`.
3. Webhook route (raw body, signature verified, event recorded in `WebhookEvent`) runs the same
   `markOrderPaid`.
4. Only the caller that wins `markOrderPaid`'s conditional update sends confirmation emails. Show
   the confirmation and clear the cart only after verified payment.
5. Failed or abandoned payment: order stays unpaid (or `failed`); the cart is kept. The rule for
   retrying: each "Pay" creates a new order; abandoned ones stay "Awaiting payment" for staff.
6. A declined card happens on Paystack's page, not in this API. Paystack refusing to start or check
   a payment answers `502` (`PAYMENT_START_FAILED`, `PAYMENT_CHECK_FAILED`) and is logged with the
   order reference only.

### Email / notifications (Amazon SES)
Each new contact request emails GPEC staff (details, reply-to the customer, and a link
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
  none; a partial set stops the server at startup (`config.ts`). On in production since
  2026-10-23 (region eu-north-1); setup: `docs/RUNBOOK.md` Section 1.6. A sending-only IAM key, never the root account.

### Product photos (Amazon S3)
Admins upload a product photo from their own device in the product form (approved, with Amazon S3
and `sharp`, by the user 2026-10-22). Off until the four `S3_*` settings are set; until then the form
takes a site image path (`/assets/…`) and the session reply's `imageUploads` is `false`.
- The browser sends the file as the body of `POST /api/admin/product-images` (admin only; JPEG, PNG,
  or WebP; 10 MB). `services/productImages.ts` opens it with `sharp` (anything that is not really one
  of those formats is refused, fail closed), turns it upright, fits it in 1600×1600, and re-encodes it
  as WebP, which drops camera details such as GPS location. Only the re-encoded file is stored, named
  by its SHA-256 (`product-images/<hash>.webp`), and that name goes in the product's `image` field
  when the form is saved (recorded like any product change).
- The bucket is **private**. `GET /api/product-images/<hash>.webp` (public) reads it and serves it
  with a one-year immutable cache and `Cross-Origin-Resource-Policy: cross-origin` (the site is on
  another origin). `services/imageStore.ts` is the only code that talks to S3; tests use
  `MemoryImageStore` (`tests/helpers.ts`).
- Not copied from Vision 25 on purpose: direct browser-to-S3 uploads. They needed a staging prefix,
  upload intents, a cleanup job, and virus scanning; GPEC must resize on the server anyway, so nothing
  unchecked ever reaches the bucket.
- Photos are never deleted from the bucket: replaced ones, and ones uploaded but never saved, stay
  (a few hundred kB each).

### File uploads on the quote form — planned
README asks for drawings and photos on quote forms. When built: validate type and size on the
server, keep files private (a separate private prefix or bucket), generate short-lived download
links for admins only, never store a raw public URL on the record, and update the privacy notice.

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
  - **Text is at least about `.7rem`** (owner, 2026-10-22: 9–10px labels were too small to read;
    every label in the admin and on the public pages was raised to about `.72rem`; small monospaced
    capitals read smaller than their size). The only exception is the decorative "GPEC / SYSTEM
    READY" label inside the hero illustration (`.panel-label`, `role="img"`).
  - **Run `cd frontend && npm run check:contrast` after any change to colours, styles, or layout**
    (CI runs it too). It checks every page and state at both widths, including hover, against the
    production build with sample API data, using axe-core and a pixel comparison. A new page or
    state must be added to `frontend/e2e/contrast.spec.ts`, in the part whose pages it uses (each
    part is its own test with a fresh browser and sample API, so parts run side by side; a part
    must set up any state it needs, such as the cart). Exemptions go in `EXEMPT` in
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
3. **For the shop:** catalogue → open product → add to cart → change quantity → checkout (pickup, and delivery with an area; with payments off it says online payment
   is not available yet) → an
   out-of-stock product is labelled and cannot be added. With payments: → pay in test mode →
   confirmation → paid order present in MongoDB.
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
3. Remove a product by setting `status: 'archived'`, not by deleting it — orders will refer to it.
   If GPEC only cannot supply it for now, mark it out of stock instead (it stays in the shop).
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
- If you find a **pre-existing** problem, **fix it** in the same piece of work (owner's preference,
  2026-10-22) and name it in the report as found and fixed; never fix silently. Add to Known Gaps
  only what cannot be fixed now (it needs GPEC's information or an owner's decision).

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

**Deployment** (live since 2026-10-22, not announced)
- **The live site is public with mock Current Work entries**, sample products, and demo orders and
  requests. Do not share or announce the address until GPEC's real content is in.
- **Atlas is not locked down.** Production uses the developer's existing login, which reaches both
  `gpec` and `gpec_dev`, and the access list has not been checked (it may allow `0.0.0.0/0`). The
  developer has no Atlas dashboard access; the Atlas owner must create `gpec-prod` and `gpec-dev`,
  limit network access, and the `MONGODB_URI` in Coolify must then be replaced (RUNBOOK 1.1).
- The production `gpec` database held an empty `enquiries` collection (2 indexes) from the removed
  enquiry feature, found 2026-10-23; the developer was advised to drop it. Nothing reads it.
- Every account (Hetzner, Cloudflare, AWS, Paystack, Atlas) is in the project owner's own name, not
  GPEC's; moving them is the owner's decision (RUNBOOK Section 5).
- AWS (SES and S3) is in **eu-north-1 (Stockholm)**, not Frankfurt: the free-plan project is locked to
  the region it was created in. Fine for email and cached photos; no need to move.

**Content (AGENTS.md rules)**
- The 14 products are samples with invented references and specs (e.g. "415 V", "IP54
  enclosure"). The shop labels each one "Sample listing · details to be confirmed by GPEC" until
  GPEC's real product list replaces them. No prices exist yet.
- The client name "Afrizone" is published; permission is unconfirmed.
- Current Work (home page) contains **mock content**, added at the project owner's request
  (2026-10-21); GPEC's company profile has no dated updates to replace it. It avoids specific claims
  (no years, numbers, certifications, client names, or photos). At the owner's request **nothing on
  the page marks it as mock**; only the code comment in `data/landingContent.ts` does. **Before
  launch, replace it with GPEC-approved, dated updates.** (About, the footer contacts, the twelve
  service areas, and the project photos now come from GPEC's profile, 2026-10-23.)
- The first project video (`portfolio-electrical-components.mp4`) has a sound track and no captions.
  GPEC must confirm whether it contains speech; if so, add captions (a `<track>`), otherwise mute it
  or remove the track. Marked in `LandingPage.tsx` with an `oxlint-disable` comment.
- No business hours or social media links yet (not in GPEC's profile); the footer shows none.

**Functionality**
- Checkout is built. Paystack (test keys) works once the `PAYSTACK_*` settings are in Coolify
  (RUNBOOK 1.8); bank transfer, demo delivery areas, and demo prices on the sample products come with
  `seed:demo`. Collection hours are not known: the site says GPEC will contact the customer to agree
  a time.
- Bank transfer shows the sample bank details until GPEC's staff enter real ones. Staff confirm each
  transfer by hand, so there is no automatic match with the bank statement, and stock is
  not held while a transfer is awaited. Unpaid transfer orders are closed by hand (owner's choice).
  An admin's login can now confirm payments and change the bank account: another reason to decide
  on admin 2FA before launch.
- **The live site is a test environment until the owner says it is production ready** (owner,
  2026-10-23): GPEC's team uses it to see how everything behaves, so new features come with demo data
  there too, rather than staying off.
- **Demo data** (owner's request, 2026-10-22, for showing GPEC the admin screens): 12 orders (two by
  bank transfer), 8 contact requests, and 10 delivery areas across Nigeria with invented fees, from
  `data/demoData.ts`, plus bank transfer switched on with the sample details; realistic and unmarked on screen at the owner's request,
  with `example.com` emails and `+234 000` phone numbers. `npm run seed:demo` adds them,
  `npm run seed:demo -- --remove` removes exactly them (orders and requests by their `DE0000`
  references, with their history and notes; delivery areas by name) and switches bank transfer back
  off, unless real bank details were entered. The command refuses the `gpec` database and `NODE_ENV=production` unless run
  with `--production`: the owner chose (2026-10-23) to show the demo data on the live site too, so
  GPEC can try it before launch. **It must be removed from `gpec` before launch** (checklist in
  Section 7); until then real contact requests sent through the live site would sit among the demo
  ones. Their prices and Paystack fees are invented (the fee uses an illustrative 1.5% + ₦100,
  capped at ₦2,000, only in the demo data). Demo orders do not change stock counts.
- Order enquiries were removed (2026-10-22): the `enquiries` collection may still exist, empty or
  with test records, in `gpec_dev`; nothing reads it. The sample product `replacement-001` was
  renamed "Replacement parts" in `data/sampleProducts.ts` (was "Replacement parts enquiry"); the
  seed script never changes existing products, so a database seeded earlier keeps the old name
  until it is edited in the admin panel.
- The contact-form topic list is duplicated (`frontend/src/data/landingContent.ts` and
  `backend/src/validation/contactRequest.ts`); a backend test fails if the two differ.
- Staff reply to requests by email or phone outside the site (the detail page links to both); the
  site does not record replies, only the notes staff add. Request search is a case-insensitive
  substring match with no index, which is fine for GPEC's volume; revisit (text index) if the
  lists reach tens of thousands of requests.
- No admin 2FA, no admin account management in the panel (create and deactivate are by command or
  database only; each admin can change their own password or reset it by email).
- Product photo uploads are **on** in production since 2026-10-23 (bucket `gpec-product-images`,
  eu-north-1); the first live upload worked the same day.
- Email notifications are **on** in production since 2026-10-23, but SES is still in the sandbox
  (production access requested 2026-10-23): until approved, only verified addresses receive mail.
  Staff notifications go to the developer's address until GPEC names its staff. No bounce or
  complaint handling beyond SES's account-level suppression list (SES can report these through SNS).
- No file uploads on the quote form.
- The privacy notice (`#privacy`) is a **draft**: GPEC must supply the highlighted placeholders
  (registration number, registered address if different from the service location, retention,
  legal wording) and approve it. The legal name and contact email were filled in on 2026-10-23
  (GPEC's published email is used as the privacy contact; GPEC may name another). Hosting is filled in
  (2026-10-23: server in Nuremberg, Germany; email from Stockholm, Sweden) except the **Atlas
  database region**, which only the Atlas owner can see.

**Styling**
- About 68 hex colours remain outside `:root` (2026-10-21; 163 before the cleanup): 45 are white
  (`#fff`), the rest one-off shades, mostly in gradients. Only `#ff8b1f` (bright orange, 4 uses) and
  `#0a225f` (navy gradient end, 3 uses) repeat; they could become variables.
- Breakpoints are desktop-first with several one-off widths (1100, 980, 900, 820, 650, 600, 540px).
  Aligning them to 1100/820/540 would change layouts between the old and new widths, so it needs a
  design decision and a browser check, not a cleanup.
- No favicon: every page load requests `/favicon.ico` and gets a 404. Needs GPEC's logo mark.

**Open business decisions (needed from GPEC)**
- The delivery areas and their fees (staff enter them at `#admin/delivery`). Do not invent any.
- Collection hours for pickup (the location is the Woji address, confirmed by the owner 2026-10-23).
- Refund, cancellation, and returns policy for paid orders.
- Who receives order and contact-request notifications.
- The Paystack fee rate on GPEC's own plan. Paystack publishes 1.5% + ₦100 for local payments, the
  ₦100 waived under ₦2,500, capped at ₦2,000 (checked 2026-10-23); confirm in GPEC's dashboard, and
  that passing the fee to customers is allowed under GPEC's Paystack terms. (Decided 2026-10-23: the
  currency is NGN, and customers pay the Paystack fee.)
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
- **2026-10-22 — Scope correction: no order enquiries.** The shop still carried an enquiry form
  ("GPEC will confirm availability and pricing"), and a reply described enquiries as staying beside
  checkout. The owner corrected it: customers either buy (Paystack, pickup or delivery) or ask
  through the contact form; availability is managed by staff (archive, or mark out of stock).
  **Rule:** the shop never asks customers to "enquire" about price or availability.
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
- **2026-10-23 — New content broke a layout made for old content.** The Projects intro was set to
  `white-space: nowrap` for a one-line sentence; GPEC's longer text then made the page 1300px wide
  between 900 and 1180px. Only a before/after screenshot comparison at several widths caught it.
  **Rule:** after a content change, check the page for sideways scrolling across the whole width
  range (320–1600px), not just at 390px and desktop.
- **2026-10-23 — A temporary test script overwrote its own baseline.** A screenshot script left in
  `frontend/e2e/` ran during the full test suite and replaced the "before" pictures it was meant to
  compare against. **Rule:** temporary Playwright scripts are deleted straight after use, and
  baselines are written outside the folder the suite reads.
