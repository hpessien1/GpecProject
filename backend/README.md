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

- `GET /api/health`
- `GET /api/products`
- `POST /api/enquiries`
- `POST /api/contact-requests`
- Admin (login required; see below): `POST`, `GET`, `DELETE /api/admin/session`;
  `POST /api/admin/session/password`;
  `GET`, `POST /api/admin/products`; `GET`, `PATCH /api/admin/products/:id`;
  `GET /api/admin/products/:id/history`

`GET /api/products` returns `{ products: [...] }`: every active product in display order, with `id`,
`name`, `reference`, `description`, `specs`, `image`, `alt`, and `isPlaceholder` (true for sample
data not supplied by GPEC). Prices are not returned until checkout (roadmap step 5) configures the
currency.

`POST /api/enquiries` accepts customer details, optional location and notes, plus order items (`productId` and `quantity`). Each product must be active in the database; its name and reference are copied from there, never from the request. It saves an enquiry only. No payment details are accepted or stored.

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
  failed-attempt limit.
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
- `GET /:id/history` returns the last 50 changes: who, when, and each field's old and new value.
