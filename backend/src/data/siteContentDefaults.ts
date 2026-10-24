// What the privacy notice, the refunds policy, and the FAQ say until GPEC's staff first save them in
// the admin panel (#admin/content). From then on the saved text in the database is used instead.
//
// DRAFTS for GPEC to review (2026-10-24). The privacy notice is written from what the website actually
// does. The refunds policy and the FAQ were written by the developer at the user's request, as
// proposals: every rule in the policy is GPEC's to decide, and the pages show a "Draft" banner until
// an admin marks them approved. Text in [square brackets] is a value still to be confirmed; the site
// highlights it. Format: a blank line starts a new paragraph, and a line starting with "- " is a bullet.
import type { SiteContentKey } from '../models/SiteContent.js'

export interface SiteContentSection {
  heading: string
  body: string
}

export interface SiteContentFields {
  title: string
  intro: string
  sections: SiteContentSection[]
}

// Shown as "Last updated" until the page is first saved.
export const DEFAULTS_WRITTEN = new Date('2026-10-24T00:00:00Z')

const CONTACT = 'gpecengineeringcompanylimited@gmail.com'

export const SITE_CONTENT_DEFAULTS: Record<SiteContentKey, SiteContentFields> = {
  privacy: {
    title: 'Privacy notice',
    intro: 'This notice explains what information this website collects when you contact GPEC or buy from the shop, why we collect it, who can see it, and the choices you have.',
    sections: [
      {
        heading: 'Who we are',
        body: `This website is run by GPEC Engineering Company Limited ([company registration number]), [registered address, if different from #19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State].

For any question about your information, contact ${CONTACT}.`,
      },
      {
        heading: 'What we collect and why',
        body: `We only collect what you type into our forms, and only to respond to you or fulfil your order.

- Contact form: your name and email address (required), and your company, phone number, the topic you choose, and your message. We use these to reply to your enquiry and to email you a confirmation with your reference number.
- Shop orders: your name, email address, and phone number (required), your company and any notes (optional), the products you order, and whether you collect the order or have it delivered. For delivery we also ask for your delivery area and address; for pickup we do not ask for an address. We use these to fulfil your order, contact you about it, and email you a confirmation.
- Payment: you pay on Paystack’s own secure page, or by bank transfer to GPEC’s account. We never ask for, see, or store your card details or banking logins. Paystack tells us whether the payment succeeded and how much was paid. If you pay by bank transfer, GPEC’s bank statement shows the payment as your bank sends it (usually the account name and the narration you enter); staff use it only to match your payment to your order.`,
      },
      {
        heading: 'What we do not do',
        body: `- We do not use analytics, advertising, or tracking tools, and we do not set cookies for visitors.
- Our fonts and images are served from this website, so loading a page does not share your details with other companies.
- We do not sell your information or use it for marketing without asking you first.`,
      },
      {
        heading: 'Information stored in your browser',
        body: `Your cart is saved in your own browser (its “local storage”) so it is still there when you come back. It holds only the product codes and quantities you chose, never your name or contact details. Emptying the cart, or clearing this site’s data in your browser settings, removes it.

GPEC staff who log in to manage the website use a login cookie. Visitors do not.`,
      },
      {
        heading: 'Who can see your information',
        body: `Your enquiries and orders can be read only by authorised GPEC staff, through a password-protected area of the website. Each staff member has their own account, and changes they make are recorded. Staff may add notes on how they followed up your enquiry; these are kept with it and seen only by staff.

The information is stored in a database run for us by MongoDB Atlas ([database region, shown on the cluster’s page in MongoDB Atlas]). The website runs on a server rented from Hetzner in Nuremberg, Germany. These companies store the data for us; they do not use it for their own purposes.

Payments are handled by Paystack. To take your payment we send Paystack your email address, the amount, and your order reference. Paystack handles your payment details under its own privacy policy.

Emails about your enquiry or order, a confirmation to you and a notification to GPEC staff, are sent through Amazon Web Services’ email service, Amazon SES, from its Stockholm, Sweden region. It sends the emails for us and does not use your details for its own purposes.

This means your information is stored and processed outside Nigeria.`,
      },
      {
        heading: 'How long we keep it',
        body: '[How long GPEC keeps contact messages and orders, and what happens after that, e.g. deleted after a set number of years (orders may need to be kept longer for tax and accounting)]',
      },
      {
        heading: 'Your choices',
        body: `You can ask us what information we hold about you, ask us to correct it, or ask us to delete it, by contacting ${CONTACT}.

[Legal basis and data-protection rights wording, to be confirmed by GPEC with its legal adviser, for example under the Nigeria Data Protection Act 2023]`,
      },
      {
        heading: 'How we protect it',
        body: `The website uses an encrypted (HTTPS) connection, access to enquiries and orders is limited to staff accounts, and the forms are protected against automated abuse.

To stop automated abuse, the website briefly counts how many times each internet (IP) address sends a form, and how many confirmation emails go to each email address. These counts are kept only in the server’s working memory, are never saved with your enquiry, and are cleared within an hour.`,
      },
      {
        heading: 'Changes to this notice',
        body: 'If we change how we use your information, we will update this page and the date above.',
      },
    ],
  },

  refunds: {
    title: 'Refunds, cancellations, and returns',
    intro: 'What happens if you need to cancel an order, an item arrives faulty or is not what you ordered, or you change your mind. This policy covers products bought in GPEC’s online shop.',
    sections: [
      {
        heading: 'Your rights',
        body: `This policy does not take away any rights you have under Nigerian consumer law, including the Federal Competition and Consumer Protection Act 2018.

Services such as design, installation, and repairs are agreed with you in GPEC’s quote, and are covered by the terms in that quote rather than by this policy.`,
      },
      {
        heading: 'Cancelling an order',
        body: `You can cancel a paid order at any time before you collect it or before it leaves for delivery. Contact us with your order reference (it starts with GPEC-O) and we will refund the full amount you paid, including the delivery fee and the payment processing fee.

Once an order has been collected or sent out, it can no longer be cancelled, but it may be returned under the sections below.`,
      },
      {
        heading: 'Orders paid by bank transfer',
        body: `If you chose bank transfer and do not send the money within the time shown at checkout, we close the order. Nothing is charged, so there is nothing to refund.

If your transfer arrives after the order was closed, we will contact you to either continue with the order or send the money back.`,
      },
      {
        heading: 'Faulty, damaged, or wrong items',
        body: `Please check your order when you collect it or when it is delivered.

If an item is faulty, damaged, or not what you ordered, tell us within [7] days of collection or delivery, with your order reference and, if you can, photos of the item and its label or nameplate. Please do not install or use an item you believe is faulty.

Once we have checked the item, we will repair it, replace it, or refund it in full, whichever suits the problem. For faulty or wrong items, GPEC pays the cost of getting the item back to us [within our delivery areas].`,
      },
      {
        heading: 'If you change your mind',
        body: `You can return an item you no longer need within [7] days of collection or delivery, as long as it is unused, in its original packaging, and with everything it came with.

We refund the price of the item once we have received and checked it. The delivery fee and the payment processing fee are not refunded, and you are responsible for bringing or sending the item back to our Woji address.`,
      },
      {
        heading: 'Items we cannot take back',
        body: `Unless they are faulty or not what you ordered, we cannot take back:

- items ordered or sourced specially for you, for example against your part number or specification
- items that have been installed, wired, or used
- cable and other materials cut to the length you asked for

We will tell you before you pay if an item is ordered specially for you.`,
      },
      {
        heading: 'Warranty',
        body: `Where a product comes with a manufacturer’s warranty, we will help you make a claim. [Warranty periods and what they cover, for each product type, to be confirmed by GPEC.]

A warranty does not cover damage from incorrect installation, misuse, or electrical faults outside the product (for example power surges), unless the manufacturer’s terms say otherwise.`,
      },
      {
        heading: 'How refunds are paid',
        body: `- Paid through Paystack: the refund goes back to the card or account you paid with. Your bank may take a few working days to show it.
- Paid by bank transfer: we send the refund to a Nigerian bank account in your name. We will ask you for the account details by phone or email; we never ask for your card details, PIN, or banking password.

We aim to send every approved refund within [10] working days.`,
      },
      {
        heading: 'How to ask for a cancellation, return, or refund',
        body: `Contact us using the form on our home page, by email at ${CONTACT}, or by phone on the numbers at the bottom of this page. Please include your order reference.`,
      },
    ],
  },

  faq: {
    title: 'Frequently asked questions',
    intro: 'Quick answers about buying from GPEC, paying, pickup and delivery, and returns. If your question is not here, send us a message using the form below.',
    sections: [
      {
        heading: 'How do I buy a product?',
        body: 'Open the shop, add the products you need to your cart, and go to checkout. Choose pickup or delivery, enter your contact details, and pay. You receive an email confirming your order with its reference number.',
      },
      {
        heading: 'How can I pay?',
        body: `- Online through Paystack’s secure payment page.
- By bank transfer to GPEC’s account, using your order reference as the narration.

GPEC never asks for your card details: card payments happen on Paystack’s page, not on this website.`,
      },
      {
        heading: 'Why is there a payment processing fee?',
        body: 'Paystack charges a fee for each online payment. It is shown as its own line in your order summary before you pay, so you always see the full amount. Bank transfer has no processing fee.',
      },
      {
        heading: 'How does paying by bank transfer work?',
        body: 'After you place the order, you see GPEC’s bank details, the exact amount, and your order reference. Send the money with the order reference as the narration, then press “I have sent the transfer”. Your order is confirmed once GPEC’s staff see the money arrive in GPEC’s account. Please pay within the time shown, or the order is closed.',
      },
      {
        heading: 'Where can I collect my order?',
        body: 'Pickup orders are collected from #19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State. Once your order is ready, GPEC contacts you to agree a time. [Collection hours, to be confirmed by GPEC.]',
      },
      {
        heading: 'Do you deliver?',
        body: `Yes, to the delivery areas listed at checkout. Choose your area and the delivery fee is added to your order summary before you pay. A few products are pickup only; checkout tells you if your order contains one.

[Typical delivery times, to be confirmed by GPEC.]`,
      },
      {
        heading: 'Why does a product say “Price to be confirmed”?',
        body: 'Its price has not been set in the shop yet, so it cannot be bought online. Send us a message with the product and the quantity you need, and we will reply with a price.',
      },
      {
        heading: 'A product is out of stock. Can I still get it?',
        body: 'Out-of-stock products stay in the shop, labelled, but cannot be added to the cart. Send us a message and we will tell you when it is expected or suggest an alternative.',
      },
      {
        heading: 'I need a part that is not in the shop. Can you help?',
        body: 'Yes. GPEC sources electrical, solar, electronic, and industrial products. Send us a message with the part number, rating, or the details on the nameplate, and the quantity, and we will reply with what we can supply.',
      },
      {
        heading: 'Can GPEC install what I buy?',
        body: 'GPEC designs and installs solar systems, builds and installs control and distribution panels, and carries out electrical installation and repairs. Tell us what you need using the form below and we will reply with a quote.',
      },
      {
        heading: 'Can I cancel or return an order?',
        body: 'Yes. You can cancel before you collect your order or before it is sent out, and faulty or wrong items can be returned. The details are in our Refunds, cancellations, and returns policy, linked at the bottom of every page.',
      },
      {
        heading: 'Do products come with a warranty?',
        body: '[Which products carry a warranty and for how long, to be confirmed by GPEC.] Where a product has a manufacturer’s warranty, GPEC helps you make a claim.',
      },
      {
        heading: 'How do I contact GPEC?',
        body: `Use the form below, email ${CONTACT}, or call +234 703 197 5609 or +234 701 541 1707. [Business hours, to be confirmed by GPEC.]`,
      },
    ],
  },
}
