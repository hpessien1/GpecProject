# GPEC Enquiry API

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to a non-production database (a separate
   Atlas database or a local MongoDB). Never use the production cluster locally.
2. Run `npm install`.
3. Run `npm run dev` (runs the TypeScript source with `tsx` and restarts on changes).

Other scripts:

- `npm run typecheck` — type-check without emitting files.
- `npm run build` — compile `src/` to `dist/`.
- `npm start` — run the compiled server (`dist/server.js`).

API base URL: `http://localhost:5001/api`

## Routes

- `GET /api/health`
- `POST /api/enquiries`

`POST /api/enquiries` accepts customer details, optional location and notes, plus order items. It saves an enquiry only. No payment details are accepted or stored.
