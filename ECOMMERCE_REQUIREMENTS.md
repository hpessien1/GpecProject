# Ecommerce Product Ordering and Payment Requirements

## Objective

Provide a product catalogue where customers can view products and prices, inspect full product images, add multiple products to a cart, choose pickup or delivery, and pay online through Paystack.

Prices are fixed and set by GPEC through the admin panel. Payment happens on Paystack's hosted payment page: the customer is redirected to Paystack to pay and returned to the GPEC site afterwards. GPEC's website never collects, sees, or stores card details.

The shop is for buying: there are no "order enquiries" about price or availability. Customers either buy in the shop or ask GPEC through the contact form, which also handles general service requests and quotes (for example, a custom panel design or a solar site assessment). Contact requests are not paid online.

> **Status (2026-10-23):** Built: catalogue (from MongoDB), cart, stock, and checkout with Paystack (test mode) or bank transfer to GPEC's account (confirmed by staff): pickup or delivery, delivery areas and fees managed by staff, a server-worked order summary with the payment processing fee, the redirect to Paystack, server verification (return page and signed webhook), confirmation, emails, and stock reduced on payment. Online payment switches on once GPEC's Paystack settings are added on the server (`docs/RUNBOOK.md` 1.8); until then checkout shows the order and says online payment is not available yet. The products are labelled samples until GPEC supplies its real list. Live keys need GPEC's approval.

## Scope

### Included

- Product display with price
- Product image preview and full-image view
- Multi-product cart with line totals and subtotal
- Quantity changes and item removal
- Fulfilment choice: pickup or delivery
- Customer details form
- Order summary with subtotal, delivery fee, and total
- Online payment through Paystack's hosted payment page (redirect), or bank transfer to GPEC's account
- Server-side payment verification
- Confirmation after verified payment
- Admin price and product management (built: login, create, edit, archive, change history)

### Excluded

- Card, bank, or PIN fields on the GPEC website
- Storing card details in any form
- Payment providers other than Paystack
- Customer account registration or login
- Automatic order fulfilment
- Delivery fees calculated from distance or a map (fees come from GPEC's own list of delivery areas; see below)

## Functional Requirements

### 1. Product Catalogue

- Display products in a responsive catalogue.
- Each product must show:
  - Product name
  - Main image
  - Short description
  - Price, as set by GPEC
  - Available specifications where applicable
  - Product reference or part number where applicable
  - Add to cart action
  - "Out of stock" when GPEC cannot supply it for now (see Stock)
- Prices shown must come from GPEC's current price data. Never display invented or estimated prices.

#### Categories

- Four categories, the same as the home page's Products cards: **Electrical, Solar, Electronics, Industrial** (accessories under their main group). Staff choose one per product in the admin panel (recorded like any change).
- The shop shows filters (All and the four, each with its number of products); each has its own address (`#shop/category/solar`), and the home page's cards open the shop on their category. A product without a category is listed only under All.
- A category with nothing listed says so and offers the contact form: GPEC can source products it does not list.

#### Stock

- Availability is managed by GPEC staff in the admin panel, not asked about by customers.
- A product GPEC no longer sells is archived: it leaves the shop.
- A product GPEC cannot supply for now is marked out of stock: it stays in the shop, labelled "Out of stock", and cannot be added to the cart or bought. The server refuses it at checkout too.
- Staff may also keep a stock count for a product (optional). When counted, the product is out of stock at 0. Paid orders reduce the count (never below 0), and cancelling a paid order puts back what it took (2026-10-28). Customers see only in stock or out of stock, never the count.
- Each product page offers a way to ask GPEC a question before buying, through the contact form.
- Product cards must remain usable on desktop and mobile screens.

### 2. Full Product Image

- Clicking a product image must open a larger image view.
- Full-image view may use a modal, lightbox, or dedicated product view.
- User must be able to close the view and return to the catalogue.
- Image view must support keyboard and touch interaction where applicable.
- Images must include descriptive alternative text.

### 3. Cart

- Users can add multiple different products to one cart.
- Users can add more than one unit of the same product.
- Cart must show:
  - Product name
  - Product image thumbnail
  - Unit price
  - Unit quantity
  - Line total
  - Quantity controls
  - Remove action
  - Current item count
  - Subtotal
- Adding an existing product must increase its quantity instead of creating an unnecessary duplicate line.
- Users can update quantity or remove products before checkout.
- Cart must retain selected items while the user browses other products during the same session.
- The cart stores product IDs and quantities only. Prices are always taken from the server.
- Empty cart state must explain that products can be added before checking out.

### 4. Checkout Action

- Cart must include a `Checkout` action.
- Clicking this action must navigate the user to the checkout form.
- The form must receive the current cart contents.
- If cart is empty, the checkout action must be disabled or redirect the user back to the catalogue with a clear message.

### 5. Checkout Form

Collect only information required to fulfil the order:

- Full name
- Company name, optional
- Email address
- Phone number
- Fulfilment method: **Pickup** or **Delivery** (required)
- Delivery area, **only for Delivery**: chosen from GPEC's list
- Delivery address, **required only when Delivery is selected**; hidden and not collected for Pickup
- Additional requirements or notes, optional

Pickup orders have no delivery fee and are collected from GPEC at #19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State (confirmed by the project owner, 2026-10-23); GPEC contacts the customer to agree a collection time.

#### Delivery areas and fees

Delivery is within Nigeria. The fee depends on where the order goes, through **delivery areas** that GPEC staff manage in the admin panel (*Delivery*): each area has a name (for example "Port Harcourt: Woji, GRA, Trans-Amadi" or "Within 10 km of Woji"), an optional description of what it covers, and a fee per order. The customer picks their area at checkout and the server adds that area's fee. A customer whose area is not listed can choose pickup or contact GPEC. Chosen with the project owner on 2026-10-23 instead of a distance calculation, which would need a paid mapping service and send customers' addresses to it.

- Every change to an area (name, fee, archiving) records who made it and when. Archived areas are no longer offered. Past orders keep the area name and fee they were charged.
- With no areas listed, customers can only choose pickup.
- Staff can mark a product as not delivered (*Delivery available* switched off, e.g. a large panel): an order containing it can only be picked up, the checkout says why, and the server refuses delivery for it.
- One fee per order and area; it does not depend on the size or number of items.

The form must also display a read-only order summary: products, quantities, unit prices, subtotal, delivery fee, payment processing fee, and total.

Prices and payments are in Nigerian naira (NGN), confirmed by GPEC on 2026-10-23. GPEC wants customers to pay the Paystack transaction fee: it is added to the customer's total as a separate, clearly labelled "Payment processing fee" line, shown before the customer is redirected to pay. Product prices are not changed. The fee rule comes from GPEC's Paystack plan, as server configuration.

Required fields must have visible labels and validation messages. Email format must be validated before submission. The form must include privacy wording explaining how GPEC uses the customer's details, with links (opening in a new tab, so the form keeps what was typed) to the privacy notice and to the refunds, cancellations, and returns policy.

### 6. Payment (Paystack or bank transfer)

The customer chooses how to pay when both are open: **Paystack** (Section 6 below) or **bank transfer** (6a). Each is offered only while it is set up: Paystack through its server settings, bank transfer while GPEC staff have entered the bank details and switched it on in the admin panel (*Bank details*).

- Submitting the checkout form creates an order on the server with status `pending_payment`.
- The server calculates the subtotal, delivery fee, payment processing fee, and total from its own price data and fee rules. Prices, fees, totals, currency, and return addresses sent by the browser are ignored.
- The server refuses to start a payment for an order that is already paid. Each press of "Pay" creates a new order with its own payment reference; an order the customer abandons on Paystack's page stays "Awaiting payment" in the admin panel, and nothing was charged. Staff can close such an order with "Close as not paid" (after confirming): the website asks Paystack first, and the order closes (shown as "Payment failed", with who closed it in the history) only if Paystack has no completed payment; if Paystack has the payment, the order becomes paid instead. The customer is not emailed. If the customer still finishes paying later, the order becomes paid as usual.
- The server creates a Paystack transaction with a unique order reference and returns Paystack's payment page URL.
- The customer is redirected to Paystack's hosted payment page to pay.
- After payment, Paystack returns the customer to the GPEC site.
- The order is marked `paid` only after the server confirms the payment with Paystack (verified webhook or transaction verification) and the reference, amount, and currency match the order.
- If Paystack took a payment but the website never heard about it (for example the server stopped while handling Paystack's message and the customer closed the page), the order stays "Awaiting payment". Paystack resends its message and the website finishes the work then. Staff can also press "Check payment with Paystack" on the order: the website asks Paystack, and the order becomes paid only if Paystack confirms the full amount in the right currency. The history records who asked.
- The same payment must never be applied twice, even if Paystack sends a notification more than once.
- While Paystack test keys are in use, the site must show a visible "Test mode" notice.

#### Payment methods on Paystack's page (decision pending with GPEC)

Paystack's page currently offers four ways to pay. The website does not choose them: Paystack shows
every method switched on in GPEC's Paystack dashboard, so GPEC can turn any of them off there,
without a change to the website. In every one, the customer pays on Paystack's own page, GPEC's
website never sees card or bank details, and an order becomes paid only when Paystack confirms the
full amount arrived. If a method confirms later (some transfers do), the order shows as awaiting
payment until Paystack's confirmation arrives a few moments afterwards.

| Method on Paystack's page | What the customer does | Good for |
|---|---|---|
| **Card** | Types in a debit or credit card (Visa, Mastercard, or Verve); their bank may ask for a PIN or a one-time code sent to their phone. | The most familiar way to pay online; works for customers with any bank. |
| **Bank** ("Pay with Bank") | Chooses their Nigerian bank and approves the payment from their bank account, through Paystack. | Customers who have no card, or prefer not to use it. |
| **Transfer** ("Pay with Transfer") | Paystack shows a temporary account number for this one payment; the customer sends the exact amount from their bank app, and Paystack confirms it automatically. | Customers used to paying by transfer, without GPEC staff checking the bank account. |
| **USSD** | Dials their bank's code on a phone (for example `*xxx#`) and follows the prompts. Needs no internet or smartphone. | Customers on basic phones or with poor internet. |

Points to raise with GPEC:

- **Paystack's "Transfer" is not the site's own "Bank transfer" option (6a).** With Paystack's, the
  money goes through Paystack, the Paystack fee applies, and the order is confirmed automatically.
  With the site's own option, the money goes straight to GPEC's account, there is no Paystack fee,
  and staff confirm it by hand. Offering both may confuse customers; GPEC may prefer to keep only one.
- **Fees:** the site adds one "Payment processing fee" using one rate for every method. Check in
  GPEC's Paystack dashboard that every method switched on costs the same; if not, tell the developer.
- **More methods, more completed orders:** each method switched off is a way some customers can no
  longer pay. Switching off only what GPEC has a reason not to offer is the usual choice.
- Source: Paystack's documentation, "Payment Channels" (checked 2026-10-26), and the test-mode
  payment page seen on 2026-10-26.

### 6a. Bank transfer

Added 2026-10-23 at the project owner's request, adapted from the sister project Vision 25.

- **Bank details for Nigeria:** staff enter the bank name, the account name, and the 10-digit account number (NUBAN), plus optional instructions and how many days customers have to pay (1 to 30; 3 to start). No sort code, branch, or SWIFT code: Nigerian transfers do not need them. Bank transfer is offered only while the shop currency is naira (NGN).
- The screen starts with plainly fake sample details ("Sample Bank (not real)", account number 0000000000) for staff to replace. While the site is being tested they can be switched on (the demo data does this), always labelled "do not send money". They must be replaced before launch.
- Every change to the bank details needs the admin's password as well as their login, and is recorded (who, old and new value, when) and emailed to every active admin, because a quietly changed account number would send customers' money elsewhere.
- **No payment processing fee**: that fee is Paystack's charge, and Paystack is not involved.
- Placing the order creates it unpaid, with a copy of the bank details given, and empties the cart. The customer sees, and is emailed, the account details, the exact amount, the order reference to use as the **narration**, and the date to pay by. GPEC staff are emailed that an order awaits a transfer.
- The customer can press "I have sent the transfer". It tells staff (one email) and marks the order "Transfer reported"; it proves nothing.
- Staff check GPEC's bank account and, on the order, confirm "transfer received" (ticking that the full amount arrived with that narration, and entering their password). Only then is the order paid: stock goes down, and the paid emails go to the customer and staff. The confirmation is recorded with who and when.
- If the money never arrives, staff close the order as not received (recorded; on the order, "Did the money arrive?" has a separate box for each answer). Nothing closes it automatically (owner's choice, 2026-10-23), and stock is not held while waiting. The customer is emailed that the order is closed, and asked to reply with the details if they did send the money, unless staff untick "Tell the customer by email".
- The admin Orders list shows unpaid transfers as "Awaiting transfer" or "Transfer reported".

### 7. Confirmation

- After verified payment, show a confirmation with the order reference, items, amount paid, and fulfilment method. (For a bank transfer, the page first shows how to pay; it shows the confirmation once staff have confirmed the money arrived.)
- For pickup orders, explain where to collect the order (the Woji address) and that GPEC will contact the customer to agree a time (collection hours not yet supplied).
- For delivery orders, explain that GPEC will contact the customer about delivery.
- Clear the cart only after payment is verified.
- Send a confirmation email to the customer and notify GPEC staff (built; staff recipients to be confirmed by GPEC).
- If payment fails or is abandoned, keep the cart, explain that no payment was taken, and let the customer try again.
- Preserve entered form values when validation fails.

### 8. Admin Price and Product Management

- GPEC staff sign in to a protected admin panel.
- Admins can create, edit, and archive products, set their prices, and mark them out of stock or keep a stock count.
- Price changes appear on the customer-facing catalogue.
- A price change does not alter the price of orders already placed.
- Every price, product, and order status change records who made it and when.
- Admins can view orders and their fulfilment details, and manage delivery areas and fees.
- **Completed** and **Cancelled** are final (2026-10-28, the user's decision): staff confirm before choosing either, and the order's status cannot be changed afterwards (the server refuses it too). Staff can still add notes. Cancelling puts back into the stock count whatever the order took from it, shown in each product's history as "Returned to stock".
- When staff move an order to **Ready for pickup**, **Out for delivery**, or **Cancelled**, the customer is emailed about it (2026-10-24, the user's choice), unless staff untick "Tell the customer by email" (ticked by default: untick it when the customer already knows, or when correcting a mistake). A cancellation email points to the refunds policy and promises nothing more. The order's history shows "Customer emailed". Other status changes, and contact-request status changes, send nothing.

## Suggested User Flow

1. User opens catalogue.
2. User selects product image to inspect full image.
3. User closes image view.
4. User adds one or more products to cart.
5. User adjusts quantities or removes items.
6. User clicks `Checkout`.
7. User enters contact details and chooses Pickup or Delivery (entering an address for Delivery).
8. User reviews the order summary and total.
9. User submits the form and is redirected to Paystack.
10. User pays on Paystack and is returned to the GPEC site.
11. System verifies the payment, shows confirmation, and clears the cart.

## Open Decisions (to be confirmed by GPEC)

- The delivery areas and their fees (staff enter them in the admin panel).
- The Paystack fee rate on GPEC's own plan (Paystack publishes 1.5% + ₦100 for local payments, the ₦100 waived under ₦2,500, capped at ₦2,000; checked 2026-10-23), and confirmation that passing it to customers is allowed under GPEC's Paystack terms.
- Which payment methods Paystack's page offers: card, bank, transfer, USSD, or fewer (Section 6, "Payment methods on Paystack's page"; GPEC switches them in its Paystack dashboard). The user is asking GPEC (2026-10-26).
- Collection hours for pickup (the location is the Woji address).
- Approval of the refunds, cancellations, and returns policy (a draft for GPEC's review is at `#refunds` since 2026-10-24; staff edit it in the admin panel, Site content).
- Recipients for order notifications.

## Acceptance Criteria

- Product catalogue displays product cards with working images, prices, and add-to-cart actions.
- Clicking any product image opens its full image without leaving the catalogue context.
- Cart supports multiple product types and quantities greater than one, with correct line totals and subtotal.
- Cart supports quantity updates and item removal.
- Checkout action navigates to the form with selected products, quantities, and prices visible.
- Choosing Pickup hides the delivery address and adds no delivery fee; choosing Delivery requires an address.
- Form validates required customer details and email format.
- The order summary shows the payment processing fee as its own line before payment, and the amount charged by Paystack equals the displayed total.
- The server rejects or ignores any client-supplied price, fee, or total.
- Customers are redirected to Paystack to pay; no card or bank fields exist anywhere on the GPEC site.
- An order is marked paid only after server-side verification with Paystack.
- A repeated Paystack notification does not mark an order paid twice.
- Failed or abandoned payments leave the cart intact and show a clear message.
- Successful payment shows confirmation with the order reference and clears the cart.
- Empty cart and validation errors are clearly communicated.
- Flow works on desktop and mobile layouts.
