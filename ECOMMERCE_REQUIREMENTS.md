# Ecommerce Product Ordering and Payment Requirements

## Objective

Provide a product catalogue where customers can view products and prices, inspect full product images, add multiple products to a cart, choose pickup or delivery, and pay online through Paystack.

Prices are fixed and set by GPEC through an admin panel (planned). Payment happens on Paystack's hosted payment page: the customer is redirected to Paystack to pay and returned to the GPEC site afterwards. GPEC's website never collects, sees, or stores card details.

General service requests and quotes (for example, a custom panel design or a solar site assessment) continue to use the contact and quote form described in `README.md`. They are not paid online.

> **Status (2026-10-21):** The catalogue (served from MongoDB), cart, and an enquiry-only order form are built. The products are labelled samples until GPEC supplies its real list. The admin panel's product and price management is built; prices stay unset until GPEC confirms the currency and are not shown to customers until checkout is built. Staff can read order enquiries in the admin panel and track each one as New, In progress, or Closed. Pickup/delivery choice, Paystack payment, and admin order views are not built yet.

## Scope

### Included

- Product display with price
- Product image preview and full-image view
- Multi-product cart with line totals and subtotal
- Quantity changes and item removal
- Fulfilment choice: pickup or delivery
- Customer details form
- Order summary with subtotal, delivery fee, and total
- Online payment through Paystack's hosted payment page (redirect)
- Server-side payment verification
- Confirmation after verified payment
- Admin price and product management (built: login, create, edit, archive, change history)

### Excluded

- Card, bank, or PIN fields on the GPEC website
- Storing card details in any form
- Payment providers other than Paystack
- Customer account registration or login
- Automatic order fulfilment
- Live delivery-cost calculation (delivery fee rules are not yet defined)

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
- Prices shown must come from GPEC's current price data. Never display invented or estimated prices.
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
- Delivery address, **required only when Delivery is selected**; hidden and not collected for Pickup
- Additional requirements or notes, optional

Pickup orders have no delivery fee. Delivery orders will carry a delivery fee once GPEC defines its delivery fee rules (see Open Decisions).

The form must also display a read-only order summary: products, quantities, unit prices, subtotal, delivery fee, payment processing fee, and total.

The Paystack transaction fee is added to the customer's total as a separate, clearly labelled "Payment processing fee" line, shown before the customer is redirected to pay. Product prices are not changed. The fee rule comes from GPEC's Paystack plan.

Required fields must have visible labels and validation messages. Email format must be validated before submission. The form must include privacy wording explaining how GPEC uses the customer's details.

### 6. Payment (Paystack)

- Submitting the checkout form creates an order on the server with status `pending_payment`.
- The server calculates the subtotal, delivery fee, payment processing fee, and total from its own price data and fee rules. Prices, fees, totals, currency, and return addresses sent by the browser are ignored.
- The server refuses to start a payment for an order that is already paid.
- The server creates a Paystack transaction with a unique order reference and returns Paystack's payment page URL.
- The customer is redirected to Paystack's hosted payment page to pay.
- After payment, Paystack returns the customer to the GPEC site.
- The order is marked `paid` only after the server confirms the payment with Paystack (verified webhook or transaction verification) and the reference, amount, and currency match the order.
- The same payment must never be applied twice, even if Paystack sends a notification more than once.
- While Paystack test keys are in use, the site must show a visible "Test mode" notice.

### 7. Confirmation

- After verified payment, show a confirmation with the order reference, items, amount paid, and fulfilment method.
- For pickup orders, explain how and where to collect the order (details to be supplied by GPEC).
- For delivery orders, explain that GPEC will contact the customer about delivery.
- Clear the cart only after payment is verified.
- Send a confirmation email to the customer and notify GPEC staff (planned; recipients to be confirmed).
- If payment fails or is abandoned, keep the cart, explain that no payment was taken, and let the customer try again.
- Preserve entered form values when validation fails.

### 8. Admin Price and Product Management

- GPEC staff sign in to a protected admin panel.
- Admins can create, edit, and archive products and set their prices.
- Price changes appear on the customer-facing catalogue.
- A price change does not alter the price of orders already placed.
- Every price, product, and order status change records who made it and when.
- Admins can view paid orders and their fulfilment details (planned, with orders).

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

- Currency (GPEC is in Nigeria; NGN expected but not confirmed).
- Delivery fee rules and delivery areas.
- Paystack fee rule from GPEC's Paystack plan, and confirmation that passing it to customers is allowed under GPEC's Paystack terms.
- Pickup location and collection hours.
- Refund, cancellation, and returns policy.
- Recipients for order notifications.
- Whether any products remain enquiry-only rather than purchasable.

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
