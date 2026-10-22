# GPEC Enquiry API

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
  `503 {"status":"unavailable"}` (also used by the Docker health check)
- `GET /api/products`
- `POST /api/enquiries`
- `POST /api/contact-requests`
- Admin (login required; see below): `POST`, `GET`, `DELETE /api/admin/session`;
  `POST /api/admin/session/password`;
  `GET`, `POST /api/admin/products`; `GET`, `PATCH /api/admin/products/:id`;
  `GET /api/admin/products/:id/history`; `GET /api/admin/enquiries`, `GET`, `PATCH /api/admin/enquiries/:reference`,
  `POST /api/admin/enquiries/:reference/notes`; `GET /api/admin/contact-requests`, `GET`,
  `PATCH /api/admin/contact-requests/:reference`, `POST /api/admin/contact-requests/:reference/notes`;
  `POST /api/admin/product-images`
- Public product photos: `GET /api/product-images/:hash.webp`

`GET /api/products` returns `{ products: [...] }`: every active product in display order, with `id`,
`name`, `reference`, `description`, `specs`, `image`, `alt`, and `isPlaceholder` (true for sample
data not supplied by GPEC). Prices are not returned until checkout (roadmap step 5) configures the
currency.

`POST /api/enquiries` accepts customer details, optional location and notes, plus order items (`productId` and `quantity`). Each product must be active in the database; its name and reference are copied from there, never from the request. It saves an enquiry only. No payment details are accepted or stored.

After saving, both public form routes email GPEC staff and send the customer a confirmation, when
Amazon SES is configured (`docs/RUNBOOK.md` Section 1.6); otherwise email is off and nothing is sent.
Email never delays or breaks the response.

Both public form routes have a spam trap: a request whose `website` field has a value gets a normal
`201` with a reference but is not saved (see `validation/fields.ts`). Leave the field out or empty.

`POST /api/contact-requests` accepts the landing-page contact form: `fullName`, `email`, and `message` (required), plus optional `company`, `phone`, and `subject` (one of the form's listed options). It saves the request and returns a `GPEC-C-YYYY-XXXXXXXX` reference.

### Admin routes

All admin responses are sent with `Cache-Control: no-store`.

- `POST /api/admin/session` with `{ email, password }` logs in and sets the `gpec_admin_session`
  cookie (httpOnly, SameSite=Strict, Secure in production, 8 hours). Wrong email and wrong password
  both return `401 INVALID_CREDENTIALS`. Failed attempts are limited per IP (5 per 15 minutes in
  production). `GET` returns the logged-in admin and the configured currency
  (`{ code, minorUnitDigits }` or `null`); `DELETE` logs out.
- `POST /api/admin/session/password` with `{ currentPassword, newPassword }` changes the logged-in
  admin's password (new one at least 15 characters, different from the current one) and ends their
  other sessions. A wrong current password gets `400 WRONG_PASSWORD` and counts toward the
  failed-attempt limit. A new password known from a data breach gets `400 PASSWORD_BREACHED`: the
  server asks `api.pwnedpasswords.com` (sending only the first 5 characters of the password's
  SHA-1 hash) and, if that service cannot be reached within 3 seconds, allows the change and logs
  a warning.
- Every command (creating admins, seeding, checks) is listed in [`docs/COMMANDS.md`](../docs/COMMANDS.md).
- Every `/api/admin/products` route needs that cookie (`401 ADMIN_AUTH_REQUIRED` otherwise), and
  changes from an origin not in `CLIENT_ORIGIN` get `403`.
- `GET /api/admin/products?page=N` lists all products, archived ones included, 50 per page, with
  `price` in the smallest currency unit.
- `POST` creates a product (`id`, `name`, `reference`, `description`, `image`, `alt` required; `specs`,
  `price`, `isPlaceholder`, `status`, `sortOrder` optional). `PATCH /:id` changes any of those
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
- `GET /:id/history` returns the last 50 changes: who, when, and each field's old and new value.
- `GET /api/admin/enquiries?page=N&status=new|in_progress|closed&q=text` (all optional) lists order
  enquiries newest first, 25 per page, with `counts` per status. `q` (up to 100 characters) keeps
  requests whose reference, customer name, company, or email contains it, ignoring case; the counts
  then cover only the matches. `GET /:reference` returns everything the customer sent plus the
  status history and staff `notes` (newest first, last 100). `PATCH /:reference` with `{ status }`
  (and nothing else) changes the follow-up status and records who, from, to, and when.
  `POST /:reference/notes` with `{ text }` (up to 2000 characters, and nothing else) adds an
  internal note under the logged-in admin's name and returns `201` with the same body as `GET`.
  Unknown or malformed references get `404`. `/api/admin/contact-requests` works the same way.
  New requests are always `new`; customer details and notes cannot be edited or deleted here.
