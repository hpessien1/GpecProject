# Ecommerce Product Ordering Requirements

## Objective

Provide a simple product catalogue where users can view products, inspect full product images, add multiple products to a cart, and submit an order enquiry through a details form.

Online payment is out of scope. Order submission sends product and customer details for manual follow-up.

## Scope

### Included

- Product display
- Product image preview and full-image view
- Multi-product cart
- Quantity changes and item removal
- Order summary
- Customer details form
- Order enquiry submission
- Confirmation after submission

### Excluded

- Online payment
- Payment gateway integration
- Card or bank detail collection
- User account registration or login
- Automatic order fulfilment
- Shipping payment or live delivery calculation

## Functional Requirements

### 1. Product Catalogue

- Display products in a responsive catalogue.
- Each product must show:
  - Product name
  - Main image
  - Short description
  - Available specifications where applicable
  - Product reference or part number where applicable
  - Add to cart action
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
  - Unit quantity
  - Quantity controls
  - Remove action
  - Current item count
- Adding an existing product must increase its quantity instead of creating an unnecessary duplicate line.
- Users can update quantity or remove products before ordering.
- Cart must retain selected items while the user browses other products during the same session.
- Empty cart state must explain that products can be added before submitting an order.

### 4. Order Action

- Cart must include an `Order` or `Submit order enquiry` action.
- Clicking this action must navigate the user to the order details form.
- The form must receive the current cart contents.
- If cart is empty, order action must be disabled or redirect the user back to the catalogue with a clear message.

### 5. Order Details Form

Collect only information required to process the enquiry:

- Full name
- Company name, optional
- Email address
- Phone number
- Delivery or project location, optional
- Additional requirements or notes, optional

The form must also display the selected products and quantities as a read-only order summary.

Required fields must have visible labels and validation messages. Email format must be validated before submission.

### 6. Submission and Confirmation

- Submitting the form creates an order enquiry, not a paid order.
- No payment fields, payment buttons, or payment gateway steps may appear.
- Show a confirmation message after successful submission.
- Confirmation must include an enquiry reference when available.
- Explain that a representative will contact the user to confirm availability, pricing, and next steps.
- Clear the cart after successful submission.
- Preserve entered form values when validation fails.

## Suggested User Flow

1. User opens catalogue.
2. User selects product image to inspect full image.
3. User closes image view.
4. User adds one or more products to cart.
5. User adjusts quantities or removes items.
6. User clicks `Order`.
7. System navigates to order details form.
8. User enters contact details and reviews cart summary.
9. User submits order enquiry.
10. System shows confirmation and clears cart.

## Acceptance Criteria

- Product catalogue displays product cards with working images and add-to-cart actions.
- Clicking any product image opens its full image without leaving the catalogue context.
- Cart supports multiple product types and quantities greater than one.
- Cart supports quantity updates and item removal.
- Order action navigates to form with selected products and quantities visible.
- Form validates required customer details and email format.
- Successful submission creates an enquiry and shows confirmation.
- No online payment functionality or payment data collection exists anywhere in the flow.
- Empty cart and validation errors are clearly communicated.
- Flow works on desktop and mobile layouts.
