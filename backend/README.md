# GPEC Enquiry API

## Local setup

1. Start local MongoDB.
2. Copy `.env.example` to `.env`.
3. Run `npm install`.
4. Run `npm run dev`.

API base URL: `http://localhost:5001/api`

## Routes

- `GET /api/health`
- `POST /api/enquiries`

`POST /api/enquiries` accepts customer details, optional location and notes, plus order items. It saves an enquiry only. No payment details are accepted or stored.
