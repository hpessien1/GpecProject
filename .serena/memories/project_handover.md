# GPEC project handover

## Current architecture
- Root project: `/Users/happinessessien/GP-website`.
- React/Vite frontend in `frontend/`.
- Express/MongoDB backend in `backend/`.
- Product shop routes are hash-based: `#shop` and `#shop/order`.
- App is split into `pages`, `components`, `components/shop`, `data`, and `services`.

## Ecommerce implemented
- Product catalogue: 14 sample products, 6 per page with pagination.
- Product card opens a modal with fixed image and independently scrollable details pane.
- Cart uses `localStorage` key `gpec-order-cart`; supports add, quantity update, remove.
- Order enquiry has no payment flow.
- Product/order client remains in `frontend/src/pages/StorePage.jsx`.
- API client: `frontend/src/services/enquiryApi.js`.

## Backend implemented
- `backend/src/server.js`: Express bootstrap, MongoDB connection.
- `backend/src/app.js`: CORS, JSON middleware, health route, error handling.
- `backend/src/routes/enquiries.js`: `POST /api/enquiries`.
- `backend/src/models/Enquiry.js`: Mongoose enquiry schema.
- `backend/src/validation/enquiry.js`: input validation and server-side product ID validation.
- `backend/src/data/catalogue.js`: server-side canonical list matching frontend product IDs.
- API accepts customer details, optional location/notes, and `{ productId, quantity }` items. It canonicalizes name/reference server-side. It does not accept payment data.

## Local services
- MongoDB Community 8.0 installed and verified with `mongosh --quiet --eval 'db.runCommand({ ping: 1 })'` returning `{ ok: 1 }`.
- MongoDB service: `mongodb-community@8.0` via Homebrew.
- Config was missing after install. Created `/opt/homebrew/etc/mongod.conf` with local db path `/opt/homebrew/var/mongodb`, log `/opt/homebrew/var/log/mongodb/mongo.log`, bind IP `127.0.0.1,::1`, port `27017`, and timezone path `/usr/share/zoneinfo`.
- API port was changed from 5000 to 5001 because port 5000 is occupied by macOS Control Center. Backend and frontend default settings and `.env.example` use 5001.
- Run backend: `cd /Users/happinessessien/GP-website/backend && npm run dev`.
- Health check: `curl http://localhost:5001/api/health` returns `{"status":"ok"}`.
- Run frontend: `cd /Users/happinessessien/GP-website/frontend && npm run dev`.

## Validation performed
- `npm run build` passed after frontend/backend integration.
- Backend syntax checks passed.
- Backend validation module test passed.
- API started successfully on port 5001 and `/api/health` returned 200.

## Recommended next work
1. Perform a browser end-to-end submission and confirm MongoDB `gpec.enquiries` document.
2. Replace sample products with approved GPEC product data/images.
3. Move product catalogue to MongoDB and expose product API routes.
4. Add authenticated admin management only after requirements are agreed.

## Rules
- Follow `AGENTS.md`: no invented company facts, project claims, client information, pricing, stock, certifications, or performance claims.
- Keep no-payment enquiry design.
- Maintain accessibility and responsive design.
