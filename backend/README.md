# GPEC Enquiry API

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to the `gpec_dev` database. Never use the
   production `gpec` database locally.
2. Run `npm install`.
3. Run `npm run seed:products` once, to add the sample products (safe to repeat: existing products
   are never changed).
4. Run `npm run dev` (runs the TypeScript source with `tsx` and restarts on changes).

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

`GET /api/products` returns `{ products: [...] }`: every active product in display order, with `id`,
`name`, `reference`, `description`, `specs`, `image`, `alt`, and `isPlaceholder` (true for sample
data not supplied by GPEC). Prices are not returned until checkout (roadmap step 5) configures the
currency.

`POST /api/enquiries` accepts customer details, optional location and notes, plus order items (`productId` and `quantity`). Each product must be active in the database; its name and reference are copied from there, never from the request. It saves an enquiry only. No payment details are accepted or stored.

`POST /api/contact-requests` accepts the landing-page contact form: `fullName`, `email`, and `message` (required), plus optional `company`, `phone`, and `subject` (one of the form's listed options). It saves the request and returns a `GPEC-C-YYYY-XXXXXXXX` reference.
