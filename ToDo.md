--Start backend:
cd backend
npm run dev

--Start frontend:
cd frontend
npm run dev


--Confirm MongoDB saved enquiry:
mongosh gpec --eval 'db.enquiries.find().sort({createdAt:-1}).limit(5)'

