# GPEC API

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to the `gpec_dev` database. Never use the
   production `gpec` database locally.
2. Run `npm install`.
3. Run `npm run seed:products` once, to add the sample products (safe to repeat: existing products
   are never changed).
4. Create an admin account for yourself: `npm run admin:create -- --email you@example.com --name "Your Name"`.
   It prints a random password once. `--reset` gives an existing admin a new password and logs them out
   everywhere. To try price editing locally, add `CURRENCY=NGN` to `.env` (leave it unset in production
   until GPEC confirms the currency).
5. Run `npm run dev` (runs the TypeScript source with `tsx` and restarts on changes).

Other scripts:

- `npm run typecheck` — type-check without emitting files.
- `npm run build` — compile `src/` to `dist/`.
- `npm start` — run the compiled server (`dist/server.js`).

API base URL: `http://localhost:5001/api`

Production runs the `Dockerfile` in this folder (`docker build -t gpec-api backend` from the repository
root). Setup and deployment: [`docs/RUNBOOK.md`](../docs/RUNBOOK.md).

## Routes

- `GET /api/health`: `200 {"status":"ok"}` when MongoDB answers a ping within 2 seconds, otherwise
  `503 {"status":"unavailable"}` (also used by the Docker health check); one ping's answer serves
  every check for 5 seconds

**Public reads** (audit M-08): `GET /api/health`, `/api/products`, `/api/content/:page`, and
`/api/contact-requests/options` share one per-IP budget (1000 per 15 minutes in production,
`429` past it); product photos have their own (3000). The catalogue and each page are read from the
database at most once every 30 seconds and read again as soon as a product or page changes in this
process (`utils/freshness.ts`). Product photos are kept in memory (`services/imageCache.ts`).
- `GET /api/products`
- `GET /api/content/:page` (`privacy`, `refunds`, `faq`)
- `POST /api/contact-requests`, `GET /api/contact-requests/options`
- Checkout: `GET /api/checkout`, `POST /api/checkout/quote`, `POST /api/checkout/orders`,
  `GET /api/checkout/orders/:paymentReference`, `POST /api/checkout/orders/:paymentReference/transfer-sent`;
  Paystack webhook: `POST /api/paystack/webhook`
- Admin "forgot password" (no login): `POST /api/admin/session/password-reset`,
  `POST /api/admin/session/password-reset/confirm`
- Admin (login required; see below): `POST`, `GET`, `DELETE /api/admin/session`;
  `POST /api/admin/session/two-factor`, `POST /api/admin/session/two-factor/email-code` (the code step
  of a login, with its challenge cookie); `POST /api/admin/session/two-factor-prompt/dismiss`;
  `GET /api/admin/account/two-factor`, `POST …/app`, `…/email-code`, `…/enable`, `…/disable`,
  `…/recovery-codes`; `POST /api/admin/session/password`;
  `GET`, `POST /api/admin/products`; `GET`, `PATCH /api/admin/products/:id`;
  `GET /api/admin/products/:id/history`; `GET /api/admin/contact-requests`, `GET`,
  `PATCH /api/admin/contact-requests/:reference`, `GET`, `POST /api/admin/contact-requests/:reference/notes`,
  `GET /api/admin/contact-requests/:reference/history`, `GET /api/admin/contact-requests/:reference/files/:id`;
  `GET /api/admin/orders`, `GET`, `PATCH /api/admin/orders/:reference`,
  `GET`, `POST /api/admin/orders/:reference/notes`, `GET /api/admin/orders/:reference/history`;
  `GET`, `POST /api/admin/delivery-areas`; `GET`, `PATCH /api/admin/delivery-areas/:id`;
  `GET /api/admin/delivery-areas/:id/history`; `GET`, `PATCH /api/admin/bank-transfer`,
  `GET /api/admin/bank-transfer/history`; `GET`, `PATCH /api/admin/customer-email`,
  `GET /api/admin/customer-email/history`; `GET /api/admin/security-log`; `GET /api/admin/content`, `GET`, `PATCH /api/admin/content/:page`,
  `GET /api/admin/content/:page/history`;
  `POST /api/admin/orders/:reference/transfer-received`, `POST /api/admin/orders/:reference/transfer-not-received`,
  `POST /api/admin/orders/:reference/check-payment`, `POST /api/admin/orders/:reference/close-payment`;
  `POST /api/admin/product-images`
- Public product photos: `GET /api/product-images/:hash.webp`

`GET /api/products` returns `{ products: [...], currency }`: every active product in display order,
with `id`, `name`, `reference`, `description`, `specs`, `image`, `alt`, `category` (`electrical`,
`solar`, `electronics`, `industrial`, or `null` until staff choose one), `isPlaceholder` (true for
sample data not supplied by GPEC), `inStock` (false when staff marked it out of stock or its counted
stock is 0; the count itself is never returned), `deliveryAvailable` (false for pickup-only
products), and `price` (in the currency's smallest unit, e.g.
kobo; `null` until staff set it). `currency` is `{ code, minorUnitDigits }` from the `CURRENCY`
setting. While `CURRENCY` is unset, `currency` is `null` and products carry no `price`, so a bare
number is never shown.

There are no order enquiries: customers buy in the shop (Paystack checkout) or ask through the
contact form.

### Checkout and Paystack

Payments are on only when all five `PAYSTACK_*` settings, `CURRENCY`, and `FRONTEND_URL` are set
(`config.ts`); otherwise `GET /api/checkout` says `paymentsAvailable: false` and the other checkout
routes answer `503 PAYMENT_CONFIG_ERROR`. The browser sends only product IDs, quantities, the
fulfilment choice, and the customer's details; every amount is worked out here
(`services/checkout.ts`), and any other field (price, total, fee, currency, status, return address)
is refused with `400`.

- `GET /api/checkout` → `{ paymentsAvailable, testMode, currency, deliveryAreas: [{ id, name,
  description, fee }] }` (active areas only).
- `POST /api/checkout/quote` with `{ items: [{ productId, quantity }], fulfilmentMethod: 'pickup' |
  'delivery', deliveryAreaId }` → `{ items, deliveryAreaName, currency, subtotal, deliveryFee,
  paystackFee, total }`, the same figures the order will use. Refusals are `409` with a `code`:
  `PRODUCT_UNAVAILABLE` (unknown or archived), `OUT_OF_STOCK`, `NOT_ENOUGH_STOCK` (more than the
  counted stock; the count is never shown), `PRICE_NOT_SET`, `PICKUP_ONLY` (delivery with a
  pickup-only product), `DELIVERY_AREA_UNAVAILABLE`; `errors` names the products.
- `POST /api/checkout/orders` with the basket plus `fullName`, `email`, `phone` (required),
  `company`, `notes`, and `deliveryAddress` (required for delivery, refused for pickup) creates the
  order as `pending_payment`, starts a Paystack transaction (reference = the order's random `_id`,
  `callback_url` = `FRONTEND_URL/shop/payment-complete`), and returns `201 { reference,
  authorizationUrl }`. If Paystack does not start it, the order is deleted and the answer is `502
  PAYMENT_START_FAILED`. Spam-trapped requests look normal and save nothing. Rate limit: as the
  contact form (10 per 15 minutes per IP in production).
- `GET /api/checkout/orders/:paymentReference` asks Paystack about the payment (unless already
  paid), runs `markOrderPaid`, and returns the order's reference, payment status, items, and amounts,
  with no personal details. `502 PAYMENT_CHECK_FAILED` when Paystack cannot be reached.
- `POST /api/paystack/webhook` (raw body, `x-paystack-signature` HMAC SHA-512 checked in constant
  time, then parsed): `charge.success` runs the same `markOrderPaid`, `charge.failed` marks an unpaid
  order failed. Each event is stored in `webhookevents` (unique `eventId`), so a repeat is skipped.
  Unsigned or malformed requests get a quiet `400`.

**Bank transfer.** Every basket body also takes `paymentMethod`: `paystack` (the default) or
`bank_transfer`. Bank transfer is open while staff have switched it on with complete details and
`CURRENCY` is `NGN` (the account is Nigerian); otherwise `503 BANK_TRANSFER_UNAVAILABLE`. It has no
Paystack fee. `GET /api/checkout` adds `paymentMethods` and `bankTransfer` (the details). `POST
/orders` with `bank_transfer` saves the order unpaid with a copy of the details and returns `201 {
reference, paymentMethod, paymentReference }`; the result route returns `bankTransfer` (details,
`payBy`, `reportedAt`) and never asks Paystack. `POST /orders/:paymentReference/transfer-sent` (no
body) records that the customer says they paid, once, and emails staff. Staff then call `POST
/api/admin/orders/:reference/transfer-received` (paid: same settlement as Paystack, plus an
`order.payment` audit record) or `transfer-not-received` (closed as failed, recorded); both refuse
Paystack orders (`409 NOT_A_TRANSFER`) and settled ones (`409 TRANSFER_ALREADY_SETTLED`). `GET` /
`PATCH /api/admin/bank-transfer` read and change `enabled`, `bankName`, `accountName`,
`accountNumber` (10 digits), `instructions`, `payWithinDays` (1–30), with the change history and
`isSample` (still the starting sample details, labelled "do not send money" wherever shown); turning
it on needs the bank, name, and number; every change emails all active admins. The admin order list
adds the stages `awaiting_transfer` and `transfer_reported`.

**Security log** (audit M-06): `GET /api/admin/security-log` (admin only, read only; `?account=<admin
ID>` for one account, `?from=` and `?to=` (date-times such as `2026-10-25T23:00:00.000Z`; `from`
included, `to` not; the site sends the start of the first day and of the day after the last, on the
admin's own calendar), `?page=` for a numbered page, ten per page) answers `{ entries, page, pageSize,
totalPages, total, accounts }`. Each entry: `action`, `outcome`, `reason` (the API error code when it failed),
`detail`, `account { name, email, role }` or `null`, `target { type, id }` or `null`, `via`, `ip`,
`userAgent`, `createdAt`. Written by the server for logins, account changes, refused origins, the
admin command, and opening an order, contact request, or attached file; kept 12 months.

**The password again** (`middleware/requirePassword.ts`): `PATCH /api/admin/bank-transfer`, `PATCH
/api/admin/customer-email`, and `POST …/transfer-received` also need the admin's current password as
`password` in the body (`400` with `errors.password` when missing, `400 WRONG_PASSWORD` when wrong,
nothing changed). Wrong ones count toward one per-IP limit shared by the three (`429` after 5 in 15
minutes in production). The password is removed before the change is validated and is never stored.

`markOrderPaid` checks that Paystack reports `success` with exactly the order's amount and currency,
then moves the order from unpaid (or failed) to `paid` with a conditional update. Only the caller
that wins reduces counted stock (never below 0; recorded as `product.sale` in the product's history)
and emails staff and the customer.

After saving, the contact form route emails GPEC staff and send the customer a confirmation, when
Amazon SES is configured (`docs/RUNBOOK.md` Section 1.6); otherwise email is off and nothing is sent.
Email never delays or breaks the response. Emails to customers carry a reply-to address that staff
set in the admin panel: `GET` / `PATCH /api/admin/customer-email` read and change `{ replyTo }` (a
valid email address, required, nothing else), with its change history and `emailOn`; until the
first save it is GPEC's published address. Every change is recorded (`customerEmail.update`) and
emailed to all active admins. Staff emails reply to the customer.

Both public form routes have a spam trap: a request whose `website` field has a value gets a normal
`201` with a reference but is not saved (see `validation/fields.ts`). Leave the field out or empty.

`POST /api/contact-requests` accepts the landing-page contact form: `fullName`, `email`, and `message` (required), plus optional `company`, `phone`, and `subject` (one of the form's listed options). It saves the request and returns a `GPEC-C-YYYY-XXXXXXXX` reference.

Files are optional. With files, the same fields come as `multipart/form-data`, plus up to 5 files in
`files` (each up to 10 MB, 25 MB together): JPEG, PNG, or WebP photos, re-saved as WebP (upright, at most 2400×2400,
camera details removed), or PDFs (checked to start with `%PDF-` and end with `%%EOF`, stored as
sent). They go to the private S3 bucket under `request-files/<random id>`, never a public address.
Refusals: a file that is neither gets `400 VALIDATION_ERROR` naming it (and nothing is saved); more
than 5 files `400 TOO_MANY_FILES`; a file over 10 MB `413 FILE_TOO_LARGE`; files over 25 MB together
`413 FILES_TOO_LARGE` (refused before reading when the stated size is too large; a multipart form with
no stated size gets `411`); files while the `S3_*` settings are unset `503 FILE_UPLOADS_OFF` (also
before reading). Upload limits (audit M-04; `UPLOAD_LIMITS` in `routes/contactRequests.ts`): one form
with files at a time per sender, `429 UPLOAD_IN_PROGRESS`; at most 3 at once across the site,
`503 UPLOADS_BUSY` with `Retry-After: 60`; over 5 minutes to arrive, `408 UPLOAD_TOO_SLOW`. Forms
without files (JSON) are never held up. Photos are re-saved one at a time across the API. The text
fields are checked first. The emails say how many
files came, without attaching them. `GET /api/contact-requests/options` answers `{ fileUploads }`
(whether the form offers attachments); it is outside the form's rate limit, inside the public
reads' budget.

### Admin routes

All admin responses are sent with `Cache-Control: no-store`.

- `POST /api/admin/session` with `{ email, password }` logs in and sets the `gpec_admin_session`
  cookie (httpOnly, SameSite=Strict, Secure in production, 8 hours). Wrong email and wrong password
  both return `401 INVALID_CREDENTIALS`. Failed attempts are limited per IP (5 per 15 minutes in
  production). `GET` returns the logged-in admin, the configured currency (`{ code, minorUnitDigits }`
  or `null`), and `twoFactor: { enabled, prompt }`; `DELETE` logs out.
- **Two-step login.** For an admin who has it on, the right password answers `{ twoFactorRequired:
  true, method: 'app' | 'email', emailHint, emailAvailable, emailCodeSent }` and sets the
  `gpec_admin_login` cookie (10 minutes) instead of a session, cancelling any earlier login waiting
  for its code; for email, the code is emailed after answering, at most five login codes per account
  per hour (`emailCodeSent: false` past that: the last code sent still works). Until the code is
  entered, this answer counts toward the failed-login limit. `POST /api/admin/session/two-factor`
  with `{ code }` (6 digits) or `{ recoveryCode }` completes the login: `400 WRONG_CODE` with tries
  left, `401 LOGIN_EXPIRED` after five wrong codes or 10 minutes, `409 APP_CODES_UNAVAILABLE` without
  the encryption key, `429 CODES_PAUSED` after ten wrong 6-digit codes for the account in an hour
  (recovery codes still work). `…/two-factor/email-code` sends a new email code (`429 CODE_TOO_SOON`
  within a minute, `CODE_LIMIT` after five for the login or the account's hour).
  `…/two-factor-prompt/dismiss` closes the banner until the next login.
- `/api/admin/account/two-factor` (logged in, own account only): `GET` → `{ method, enabledAt,
  recoveryCodesLeft, available: { app, email } }`; `POST /app` → `{ secret, uri }` (Base32 key and
  `otpauth://` link, 15 minutes to confirm); `POST /email-code` emails a code; `POST /enable` with
  `{ method, password, code }` → the status plus `recoveryCodes` (shown once; ends other sessions);
  `POST /disable` and `POST /recovery-codes` with `{ password, code | recoveryCode }`. All three
  answer `400 WRONG_PASSWORD` / `WRONG_CODE`, both counted per IP.
- `POST /api/admin/session/password` with `{ currentPassword, newPassword }` changes the logged-in
  admin's password (new one at least 15 characters, different from the current one), ends their
  other sessions, reset links, and logins waiting for a code, and sets a new session cookie for this
  browser (the old one stops working). A wrong current password gets `400 WRONG_PASSWORD` and counts toward the
  failed-attempt limit. A new password known from a data breach gets `400 PASSWORD_BREACHED`: the
  server asks `api.pwnedpasswords.com` (sending only the first 5 characters of the password's
  SHA-1 hash) and, if that service cannot be reached within 3 seconds, allows the change and logs
  a warning.
- `POST /api/admin/session/password-reset` with `{ email }` always answers `202` with the same
  message, then (after answering) emails an active admin a link `<FRONTEND_URL>/#admin/reset-password/<token>`
  that works once for 30 minutes and cancels any earlier link. At most 3 emails per address per hour;
  every request counts toward a per-IP limit (5 per 15 minutes in production). `503
  PASSWORD_RESET_UNAVAILABLE` when email is not configured; `400` for a missing or invalid address.
- `POST /api/admin/session/password-reset/confirm` with `{ token, newPassword }` sets the password
  (same rules and breach check as above; a refused password leaves the link usable), ends all that
  admin's sessions, other reset links, and logins waiting for a code, clears this browser's cookie, emails the admin that the password changed, and
  returns `204`. An unknown, expired, used, or malformed link, or a deactivated account, gets `400
  RESET_LINK_INVALID`, which counts toward a per-IP limit.
- Every command (creating admins, seeding, checks) is listed in [`docs/COMMANDS.md`](../docs/COMMANDS.md).
- Every `/api/admin/products` route needs that cookie (`401 ADMIN_AUTH_REQUIRED` otherwise), and
  changes from an origin not in `CLIENT_ORIGIN` get `403`.
- **Pages.** Every admin list (products, orders, contact requests, delivery areas) takes `?page=N`
  (a whole number from 1; anything else is `400`) and answers ten items with `page`, `pageSize`,
  `totalPages`, and `total`; a page past the end is empty. Change histories and staff notes come ten
  at a time, newest first: the record's reply carries the newest page with `historyCursor` (and
  `notesCursor`), `null` when there is nothing older; otherwise pass it as `?before=` to the
  `…/history` or `…/notes` route for the next page, which answers `{ history, historyCursor }` or
  `{ notes, notesCursor }`. A cursor names the last entry shown, so an entry added meanwhile never
  appears twice; one that is not a cursor gets `400`. Size: `ADMIN_PAGE_SIZE` in `src/utils/paging.ts`.
- `GET /api/admin/products?page=N` lists all products, archived ones included, with `price` in the
  smallest currency unit.
- `POST` creates a product (`id`, `name`, `reference`, `description`, `image`, `alt` required; `specs`,
  `category` (one of the four, or `null`), `price`, `isPlaceholder`, `outOfStock` (true/false), `stockQuantity` (`null` = not counted, or a
  whole number from 0), `status`, `sortOrder` optional). `PATCH /:id` changes any of those
  except `id`. Unknown fields and wrong types get `400`; a duplicate `id` or `reference` gets
  `409 PRODUCT_CONFLICT`; a price while `CURRENCY` is unset gets `409 CURRENCY_NOT_CONFIGURED`.
  There is no delete: set `status` to `archived`.
- `POST /api/admin/product-images` takes one photo as the request body, with `Content-Type`
  `image/jpeg`, `image/png`, or `image/webp` (up to 10 MB; larger gets `413 PAYLOAD_TOO_LARGE`). The
  server re-encodes it (upright, at most 1600×1600, WebP, camera details removed), stores it in the
  private S3 bucket, and answers `201 { image: "product-images/<sha256>.webp" }`: the value to save
  in a product's `image`. Anything that is not really one of those formats gets `400`. While the
  `S3_*` settings are unset it answers `503 IMAGE_UPLOADS_OFF`, and the session replies say
  `imageUploads: false`.
- `GET /api/product-images/<sha256>.webp` (public) serves an uploaded photo from the bucket, cached
  for a year (`immutable`); unknown names get `404`.
- `GET /:id/history?before=` returns a page of changes: who, when, and each field's old and new value.
- `GET /api/admin/contact-requests?page=N&status=new|in_progress|closed&q=text` (all optional) lists
  contact requests newest first, with `counts` per status. `q` (up to 100 characters) keeps
  requests whose reference, customer name, company, or email contains it, ignoring case; the counts
  then cover only the matches. `GET /:reference` returns everything the customer sent plus the
  newest page of its status history and of staff `notes`. `PATCH /:reference` with `{ status }`
  (and nothing else) changes the follow-up status and records who, from, to, and when.
  `POST /:reference/notes` with `{ text }` (up to 2000 characters, and nothing else) adds an
  internal note under the logged-in admin's name and returns `201` with the same body as `GET`.
  Unknown or malformed references get `404`.
  New requests are always `new`; customer details and notes cannot be edited or deleted here.
  `GET /:reference` includes `attachments` (`id`, `name`, `contentType`, `size`; empty for requests
  from before attachments existed), and `GET /:reference/files/:id` sends one of them: only a file
  listed on that request, with `Content-Security-Policy: default-src 'none'; sandbox` and
  `Cross-Origin-Resource-Policy: same-site` (the admin panel shows photos from the API's address);
  PDFs always as a download (`Content-Disposition: attachment`). Anything else gets `404`.
- `GET /api/admin/orders?page=N&stage=…&q=text` (all optional) lists orders newest first, each
  with a `stage`: `awaiting_payment` or `payment_failed` for unpaid orders, otherwise the
  fulfilment status (`new`, `processing`, `ready_for_pickup`, `out_for_delivery`, `completed`,
  `cancelled`), with `counts` per stage, the total, the currency, and pickup or delivery. `q`
  searches as for contact requests. `GET /:reference` returns the order (items with prices at order
  time, amounts in the smallest unit, `currency` info, `paymentReference` for Paystack), its status
  history, and staff `notes` (newest pages), plus `emailOn` and `paystackOn` (online payment is set up). `PATCH /:reference` with
  `{ fulfilmentStatus, notifyCustomer? }` (and nothing else)
  moves a **paid** order along and records it: unpaid orders get `409 ORDER_NOT_PAID`, a pickup
  order cannot be `out_for_delivery` nor a delivery order `ready_for_pickup` (`400`), and a
  `completed` or `cancelled` order is final (`409 ORDER_CLOSED`; sending the status it has is a
  harmless `200`). Cancelling puts back what the order's sale took from each counted product (its
  `product.sale` records), recorded as `product.restock` under the admin who cancelled. Payment status,
  items, amounts, and customer details cannot be changed here. `notifyCustomer: true` (the screen's
  "Tell the customer by email", ticked by default) emails the customer after the change is saved,
  only for `ready_for_pickup`, `out_for_delivery`, and `cancelled`, only when the status really
  changes, and only while email is on; the history entry then has `customerEmailed: true`.
  `transfer-not-received` takes the same optional `{ notifyCustomer }` (the customer is told the
  order is closed and asked for details if they did pay); `transfer-received` takes only `{ password }`. `POST /:reference/check-payment` (no body; audit
  finding M-07) asks Paystack about a Paystack order not yet paid, through the same `markOrderPaid`
  as the webhook, and answers the order plus `paymentCheck`: `paid` (now, recorded as `order.payment`
  with who asked, paid emails sent), `already_paid` (Paystack not asked), `failed` (recorded),
  `not_paid` (unfinished or abandoned), `not_found` (no such transaction), or `mismatch` (amount or
  currency differ; not paid). Bank-transfer orders get `409 NOT_A_PAYSTACK_ORDER`; with payments off
  `503 PAYMENT_CONFIG_ERROR`; Paystack unreachable `502 PAYMENT_CHECK_FAILED`. No password: Paystack
  decides, not the admin. `POST /:reference/close-payment` (no body) closes a Paystack order the
  customer left without paying: it asks Paystack the same way and answers the same outcomes, except
  that where the check would say `not_paid` or `not_found` the order becomes `failed`, recorded as
  `order.close` with who closed it (`closed`; `already_closed` if it was settled meanwhile). No email
  to anyone. Only an order still `pending_payment` (otherwise `409 PAYMENT_ALREADY_CLOSED`, Paystack
  not asked). A payment the customer still completes later marks it paid as usual. `POST /:reference/notes` as for
  contact requests. Orders are created by checkout; demo orders by `npm run seed:demo` (on the live
  database only with `--production`, removed before launch). Delivery orders include
  `deliveryAreaName`; every order has `customerNotes`.
- Site content (the privacy notice, the refunds policy, and the FAQ): `GET /api/content/:page` (public)
  returns `{ key, title, intro, sections: [{ heading, body }], approved, updatedAt }`, the text staff
  last saved, or the starting text in `data/siteContentDefaults.ts` until the first save (`404` for
  any other page). `GET /api/admin/content` lists the pages with `approved` and `updatedAt`;
  `GET /api/admin/content/:page` returns the page and the newest history; `PATCH` with any of `title`,
  `intro`, `sections` (the whole list, in order; each exactly `{ heading, body }`), `approved` saves
  and records it (`siteContent.update`, sections recorded before and after); `GET …/history?before=`.
  Limits: title 120, intro 1,000, heading 200, body 4,000 characters, 60 sections, 60,000 in all. The
  body may be up to 256kb on these routes only, read after the admin login check (32kb elsewhere).
- `/api/admin/delivery-areas`: `GET ?page=N` lists the areas, active ones first, archived ones too; `POST` with `{ name, fee,
  description? }` adds one (`fee` in the smallest unit; `409 CURRENCY_NOT_CONFIGURED` without a
  currency; `409 DELIVERY_AREA_CONFLICT` for a duplicate name); `PATCH /:id` with any of `name`,
  `description`, `fee`, `status` (`active` | `archived`), `sortOrder`; `GET /:id/history?before=`. There is
  no delete. Every change is recorded with who, old and new value, and when.
