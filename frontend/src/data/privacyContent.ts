// Privacy notice copy (#privacy). DRAFT: written from what the website actually does, but not yet
// approved by GPEC or reviewed by a legal adviser. Text inside [[double brackets]] is a placeholder
// GPEC must supply or confirm; the page highlights it. Update this file whenever the site starts
// collecting new data, adds a service (e.g. Paystack, email), or GPEC supplies the missing details.

export const privacyStatus = 'Draft — this notice has not yet been approved by GPEC. Highlighted items are placeholders still to be confirmed.'

export const privacyLastUpdated = '[[date GPEC approves this notice]]'

export const privacyIntro = 'This notice explains what information this website collects when you contact GPEC, why we collect it, who can see it, and the choices you have.'

export interface PrivacySection {
  title: string
  paragraphs?: string[]
  list?: string[]
}

export const privacySections: PrivacySection[] = [
  {
    title: 'Who we are',
    paragraphs: [
      'This website is run by [[GPEC’s registered company name and registration number]], [[registered address]].',
      'For any question about your information, contact [[privacy contact email address]].',
    ],
  },
  {
    title: 'What we collect and why',
    paragraphs: ['We only collect what you type into our forms, and only to respond to you.'],
    list: [
      'Contact form: your name and email address (required), and your company, phone number, the topic you choose, and your message. We use these to reply to your enquiry and to email you a confirmation with your reference number.',
      'We never ask for card or bank details on this website. If online payment is added later, payment details will be entered on our payment provider’s own secure page, and this notice will be updated before that happens.',
    ],
  },
  {
    title: 'What we do not do',
    list: [
      'We do not use analytics, advertising, or tracking tools, and we do not set cookies for visitors.',
      'Our fonts and images are served from this website, so loading a page does not share your details with other companies.',
      'We do not sell your information or use it for marketing without asking you first.',
    ],
  },
  {
    title: 'Information stored in your browser',
    paragraphs: [
      'Your cart is saved in your own browser (its “local storage”) so it is still there when you come back. It holds only the product codes and quantities you chose, never your name or contact details. Emptying the cart, or clearing this site’s data in your browser settings, removes it.',
      'GPEC staff who log in to manage the website use a login cookie. Visitors do not.',
    ],
  },
  {
    title: 'Who can see your information',
    paragraphs: [
      'Your enquiries can be read only by authorised GPEC staff, through a password-protected area of the website. Each staff member has their own account, and changes they make are recorded. Staff may add notes on how they followed up your enquiry; these are kept with it and seen only by staff.',
      'The information is stored in a database run for us by MongoDB Atlas ([[database region, shown on the cluster’s page in MongoDB Atlas]]). The website runs on a server rented from Hetzner in Nuremberg, Germany. These companies store the data for us; they do not use it for their own purposes.',
      'Emails about your enquiry, a confirmation to you and a notification to GPEC staff, are sent through Amazon Web Services’ email service, Amazon SES, from its Stockholm, Sweden region. It sends the emails for us and does not use your details for its own purposes.',
      'This means your information is stored and processed outside Nigeria.',
    ],
  },
  {
    title: 'How long we keep it',
    paragraphs: ['[[How long GPEC keeps contact messages, and what happens after that, e.g. deleted after a set number of years]]'],
  },
  {
    title: 'Your choices',
    paragraphs: [
      'You can ask us what information we hold about you, ask us to correct it, or ask us to delete it, by contacting [[privacy contact email address]].',
      '[[Legal basis and data-protection rights wording, to be confirmed by GPEC with its legal adviser, for example under the Nigeria Data Protection Act 2023]]',
    ],
  },
  {
    title: 'How we protect it',
    paragraphs: [
      'The website uses an encrypted (HTTPS) connection, access to enquiries is limited to staff accounts, and the forms are protected against automated abuse.',
      'To stop automated abuse, the website briefly counts how many times each internet (IP) address sends a form, and how many confirmation emails go to each email address. These counts are kept only in the server’s working memory, are never saved with your enquiry, and are cleared within an hour.',
    ],
  },
  {
    title: 'Changes to this notice',
    paragraphs: ['If we change how we use your information, we will update this page and the date above.'],
  },
]
