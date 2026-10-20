# Next-session handover

Copy this prompt into next session:

```text
Continue work on GPEC website at /Users/happinessessien/GP-website.

Read AGENTS.md, README.md, and HANDOVER.md first. Preserve existing design and behavior unless I request changes.

Project state:
- Frontend: React/Vite in frontend/.
- Backend: Express/MongoDB in backend/.
- Shop uses hash routes: #shop and #shop/order.
- Catalogue has 14 sample products with 6 products per page and pagination.
- Product cards open modal with fixed image panel and independently scrollable details panel.
- Cart uses localStorage key gpec-order-cart. It supports add, quantity changes, and remove.
- Orders are enquiries only. No payments.
- Frontend order form sends POST request through frontend/src/services/enquiryApi.js.
- Backend endpoint: POST /api/enquiries. It validates data, validates product IDs server-side, saves MongoDB enquiry, and returns an enquiry reference.
- Backend health route: GET /api/health.
- API default port is 5001. Port 5000 is occupied by macOS Control Center.
- MongoDB local URL: mongodb://127.0.0.1:27017/gpec.

Important files:
- frontend/src/pages/StorePage.jsx
- frontend/src/services/enquiryApi.js
- frontend/src/data/catalogueProducts.js
- backend/src/server.js
- backend/src/app.js
- backend/src/routes/enquiries.js
- backend/src/models/Enquiry.js
- backend/src/validation/enquiry.js
- backend/src/data/catalogue.js

Run locally:
1. MongoDB should be running: brew services start mongodb-community@8.0
2. Backend: cd backend && npm run dev
3. Frontend: cd frontend && npm run dev
4. Health check: curl http://localhost:5001/api/health

MongoDB configuration was repaired manually because Homebrew did not create it:
- /opt/homebrew/etc/mongod.conf
- dbPath: /opt/homebrew/var/mongodb
- log: /opt/homebrew/var/log/mongodb/mongo.log
- bind IP: 127.0.0.1,::1
- port: 27017
- timezone path: /usr/share/zoneinfo

Checks already passed:
- Frontend npm run build
- Backend syntax checks
- Backend enquiry validation check
- MongoDB ping returned { ok: 1 }
- Backend health endpoint returned {"status":"ok"}

Recommended next step: submit an order through browser, then confirm saved enquiry:
mongosh gpec --eval 'db.enquiries.find().sort({createdAt:-1}).limit(5)'

After this: replace sample products with approved data; then move catalogue data into MongoDB and add product API routes.
```
