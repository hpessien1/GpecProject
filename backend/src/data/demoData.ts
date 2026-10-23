// Demo orders and contact requests for showing the admin screens (the owner's request, 2026-10-22).
// The demo command refuses the production database unless given --production, and the demo records
// must be removed from it before launch (scripts/seedDemoData.ts).
// Names, companies, addresses, prices, and messages are invented. Emails use the reserved
// example.com domain and phone numbers start +234 000, so no real person can be reached from them.
// References all contain "DE0000", which is how the remove command finds them.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export interface DemoOrderLine {
  productId: string
  name: string
  reference: string
  // Naira; stored in kobo.
  unitPrice: number
  quantity: number
}

export interface DemoStatusStep {
  to: string
  // How long after the order was placed.
  after: number
}

export interface DemoOrder {
  reference: string
  age: number
  customer: { fullName: string, company: string, email: string, phone: string }
  fulfilmentMethod: 'pickup' | 'delivery'
  deliveryAddress: string
  // Naira; stored in kobo. For delivery orders, the fee of their demo area (deliveryAreaName).
  deliveryFee: number
  deliveryAreaName?: string
  items: DemoOrderLine[]
  paymentStatus: 'pending_payment' | 'paid' | 'failed'
  // Bank transfer orders carry the sample bank details and no Paystack fee; transferReported: the
  // customer pressed "I have sent the transfer" this long after ordering.
  paymentMethod?: 'paystack' | 'bank_transfer'
  transferReported?: number
  // The fulfilment steps staff took, in order (paid orders only).
  steps: DemoStatusStep[]
  note?: { text: string, after: number }
}

export interface DemoContactRequest {
  reference: string
  age: number
  fullName: string
  company: string
  email: string
  phone: string
  subject: string
  message: string
  steps: DemoStatusStep[]
  note?: { text: string, after: number }
}

const line = (productId: string, name: string, reference: string, unitPrice: number, quantity: number): DemoOrderLine => ({ productId, name, reference, unitPrice, quantity })

export const demoOrders: DemoOrder[] = [
  {
    reference: 'GPEC-O-2026-DE000001', age: 2 * HOUR,
    customer: { fullName: 'Adaeze Okafor', company: 'Brightline Facilities Ltd', email: 'adaeze.okafor@example.com', phone: '+234 000 000 0101' },
    fulfilmentMethod: 'delivery', deliveryAddress: '14 Admiralty Way, Lekki Phase 1, Lagos', deliveryFee: 35000, deliveryAreaName: 'Lagos',
    items: [line('panel-001', 'Custom control panel', 'GPEC-CP-001', 1850000, 1), line('terminal-001', 'Terminal block set', 'GPEC-TB-074', 45000, 2)],
    paymentStatus: 'paid', steps: [],
  },
  {
    reference: 'GPEC-O-2026-DE000002', age: 1 * DAY,
    customer: { fullName: 'Ibrahim Musa', company: '', email: 'ibrahim.musa@example.com', phone: '+234 000 000 0102' },
    fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryFee: 0,
    items: [line('isolation-001', 'Main isolator switch', 'GPEC-MIS-062', 38500, 2)],
    paymentStatus: 'paid', steps: [{ to: 'processing', after: 3 * HOUR }],
  },
  {
    reference: 'GPEC-O-2026-DE000003', age: 3 * DAY,
    customer: { fullName: 'Chinedu Eze', company: 'Eze & Sons Engineering', email: 'chinedu.eze@example.com', phone: '+234 000 000 0103' },
    fulfilmentMethod: 'delivery', deliveryAddress: '27 Ogui Road, Enugu, Enugu State', deliveryFee: 25000, deliveryAreaName: 'South-East states',
    items: [line('solar-001', 'Solar power package', 'GPEC-SOL-020', 2450000, 1)],
    paymentStatus: 'paid', steps: [{ to: 'processing', after: 5 * HOUR }, { to: 'out_for_delivery', after: 2 * DAY }],
    note: { text: 'Dispatched with the GPEC van this morning. Customer asked for a call 30 minutes before arrival.', after: 2 * DAY + HOUR },
  },
  {
    reference: 'GPEC-O-2026-DE000004', age: 2 * DAY,
    customer: { fullName: 'Funmilayo Adebayo', company: '', email: 'funmi.adebayo@example.com', phone: '+234 000 000 0104' },
    fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryFee: 0,
    items: [line('metering-001', 'Power metering kit', 'GPEC-PMK-051', 210000, 1)],
    paymentStatus: 'paid', steps: [{ to: 'processing', after: 2 * HOUR }, { to: 'ready_for_pickup', after: 1 * DAY }],
    note: { text: 'Called the customer: collecting on Friday morning.', after: 1 * DAY + 2 * HOUR },
  },
  {
    reference: 'GPEC-O-2026-DE000005', age: 12 * DAY,
    customer: { fullName: 'Emeka Nwosu', company: 'Nwosu Cold Rooms', email: 'emeka@example.com', phone: '+234 000 000 0105' },
    fulfilmentMethod: 'delivery', deliveryAddress: 'Plot 9, Kubwa Industrial Layout, Abuja, FCT', deliveryFee: 30000, deliveryAreaName: 'Abuja (FCT)',
    items: [line('inverter-001', 'Variable speed drive', 'GPEC-VSD-097', 640000, 2)],
    paymentStatus: 'paid', steps: [{ to: 'processing', after: 4 * HOUR }, { to: 'out_for_delivery', after: 2 * DAY }, { to: 'completed', after: 3 * DAY }],
  },
  {
    reference: 'GPEC-O-2026-DE000006', age: 9 * DAY,
    customer: { fullName: 'Halima Bello', company: '', email: 'halima.bello@example.com', phone: '+234 000 000 0106' },
    fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryFee: 0,
    items: [line('accessories-001', 'Panel accessories', 'GPEC-PA-042', 27500, 4)],
    paymentStatus: 'paid', steps: [{ to: 'processing', after: 1 * HOUR }, { to: 'ready_for_pickup', after: 6 * HOUR }, { to: 'completed', after: 1 * DAY }],
  },
  {
    reference: 'GPEC-O-2026-DE000007', age: 6 * DAY,
    customer: { fullName: 'Tunde Bakare', company: 'Bakare Printing Press', email: 'tunde.bakare@example.com', phone: '+234 000 000 0107' },
    fulfilmentMethod: 'delivery', deliveryAddress: '5 Iwo Road, Ibadan, Oyo State', deliveryFee: 35000, deliveryAreaName: 'South-West states (outside Lagos)',
    items: [line('starter-001', 'Motor starter assembly', 'GPEC-MSA-085', 385000, 1)],
    paymentStatus: 'paid', steps: [{ to: 'cancelled', after: 4 * HOUR }],
    note: { text: 'Customer asked to cancel before dispatch: they ordered the wrong rating.', after: 3 * HOUR },
  },
  {
    reference: 'GPEC-O-2026-DE000008', age: 5 * HOUR,
    customer: { fullName: 'Ngozi Obi', company: '', email: 'ngozi.obi@example.com', phone: '+234 000 000 0108' },
    fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryFee: 0,
    items: [line('solar-inverter-001', 'Solar inverter package', 'GPEC-SIP-108', 1275000, 1)],
    paymentStatus: 'pending_payment', steps: [],
  },
  {
    reference: 'GPEC-O-2026-DE000009', age: 1 * DAY + 6 * HOUR,
    customer: { fullName: 'Samuel Okon', company: 'Okon Marine Services', email: 'samuel.okon@example.com', phone: '+234 000 000 0109' },
    fulfilmentMethod: 'delivery', deliveryAddress: '42 Marian Road, Calabar, Cross River State', deliveryFee: 25000, deliveryAreaName: 'South-South states',
    items: [line('cable-001', 'Industrial cable accessories', 'GPEC-ICA-119', 64000, 3)],
    paymentStatus: 'failed', steps: [],
  },
  {
    reference: 'GPEC-O-2026-DE00000A', age: 1 * DAY + 2 * HOUR,
    customer: { fullName: 'Aisha Lawal', company: 'Lawal Hospitality', email: 'aisha.lawal@example.com', phone: '+234 000 000 0110' },
    fulfilmentMethod: 'delivery', deliveryAddress: '18 Aba Road, Port Harcourt, Rivers State', deliveryFee: 3500, deliveryAreaName: 'Port Harcourt: GRA, D-Line, Rumuola, Aba Road',
    items: [line('protection-001', 'Circuit protection assembly', 'GPEC-CPA-014', 295000, 2), line('terminal-001', 'Terminal block set', 'GPEC-TB-074', 45000, 1)],
    paymentStatus: 'paid', steps: [{ to: 'processing', after: 2 * HOUR }],
  },
  {
    reference: 'GPEC-O-2026-DE00000B', age: 3 * HOUR,
    customer: { fullName: 'Blessing Amadi', company: 'Amadi Water Works', email: 'blessing.amadi@example.com', phone: '+234 000 000 0111' },
    fulfilmentMethod: 'delivery', deliveryAddress: '7 Woji Road, Woji, Port Harcourt, Rivers State', deliveryFee: 2500, deliveryAreaName: 'Port Harcourt: Woji, Trans-Amadi, Elelenwo',
    items: [line('metering-001', 'Power metering kit', 'GPEC-PMK-051', 210000, 2)],
    paymentStatus: 'pending_payment', paymentMethod: 'bank_transfer', transferReported: 2 * HOUR, steps: [],
  },
  {
    reference: 'GPEC-O-2026-DE00000C', age: 20 * HOUR,
    customer: { fullName: 'Yusuf Danjuma', company: '', email: 'yusuf.danjuma@example.com', phone: '+234 000 000 0112' },
    fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryFee: 0,
    items: [line('isolation-001', 'Main isolator switch', 'GPEC-MIS-062', 38500, 1)],
    paymentStatus: 'pending_payment', paymentMethod: 'bank_transfer', steps: [],
  },
]

// Demo delivery areas across Nigeria, from GPEC's base in Woji, Port Harcourt (the owner's request,
// 2026-10-23: GPEC's team should see delivery working; they change or replace them later). The fees
// are invented. Removed by name with the rest of the demo data.
export const demoDeliveryAreas: { name: string, description: string, fee: number }[] = [
  { name: 'Port Harcourt: Woji, Trans-Amadi, Elelenwo', description: 'Close to GPEC in Woji: Woji, Trans-Amadi, Elelenwo, Rumuibekwe, Peter Odili Road.', fee: 2500 },
  { name: 'Port Harcourt: GRA, D-Line, Rumuola, Aba Road', description: 'Old and New GRA, D-Line, Rumuola, Aba Road, Mile 1 to Mile 3, Diobu.', fee: 3500 },
  { name: 'Port Harcourt: Rumuokoro, Choba, Eliozu, Ada George', description: 'Rumuokoro, Choba, Eliozu, Rukpokwu, Ada George, Rumuodara.', fee: 4500 },
  { name: 'Rivers State, outside Port Harcourt', description: 'e.g. Onne, Eleme, Oyigbo, Bori, Ahoada, Omoku.', fee: 10000 },
  { name: 'South-South states', description: 'Akwa Ibom, Bayelsa, Cross River, Delta, Edo.', fee: 25000 },
  { name: 'South-East states', description: 'Abia, Anambra, Ebonyi, Enugu, Imo.', fee: 25000 },
  { name: 'Abuja (FCT)', description: 'Federal Capital Territory.', fee: 30000 },
  { name: 'Lagos', description: 'Lagos State.', fee: 35000 },
  { name: 'South-West states (outside Lagos)', description: 'Ekiti, Ogun, Ondo, Osun, Oyo.', fee: 35000 },
  { name: 'Northern states', description: 'All states in the North Central, North East, and North West.', fee: 40000 },
]

export const demoContactRequests: DemoContactRequest[] = [
  {
    reference: 'GPEC-C-2026-DE000001', age: 30 * 60 * 1000,
    fullName: 'Oluwaseun Ajayi', company: 'Golden Crust Bakery', email: 'seun.ajayi@example.com', phone: '+234 000 000 0201', subject: 'Solar energy',
    message: 'We run a small bakery in Ibadan and lose power most afternoons. Could GPEC assess our site for a solar system with battery backup? We use two ovens and a chest freezer.',
    steps: [],
  },
  {
    reference: 'GPEC-C-2026-DE000002', age: 4 * HOUR,
    fullName: 'Kelechi Onyeka', company: 'Onyeka Water Works', email: 'kelechi.onyeka@example.com', phone: '+234 000 000 0202', subject: 'Electrical panels',
    message: 'We need a control panel for two 15 kW borehole pumps with automatic changeover between them. Can you quote, and how long would it take to build?',
    steps: [],
  },
  {
    reference: 'GPEC-C-2026-DE000003', age: 1 * DAY,
    fullName: 'Mariam Yusuf', company: '', email: 'mariam.yusuf@example.com', phone: '', subject: 'Electrical products',
    message: 'Do you stock 63A three-pole MCCBs? I need six units for a new distribution board.',
    steps: [],
  },
  {
    reference: 'GPEC-C-2026-DE000004', age: 2 * DAY,
    fullName: 'Victor Eze', company: 'Eze Plastics Ltd', email: 'victor@example.com', phone: '+234 000 000 0204', subject: 'Industrial products',
    message: 'The motor starter on our extrusion line keeps tripping. Can someone visit to check the panel and recommend a replacement?',
    steps: [{ to: 'in_progress', after: 3 * HOUR }],
    note: { text: 'Site visit booked for Thursday at 10am. Bring a spare overload relay.', after: 4 * HOUR },
  },
  {
    reference: 'GPEC-C-2026-DE000005', age: 3 * DAY,
    fullName: 'Blessing Udoh', company: '', email: 'blessing.udoh@example.com', phone: '+234 000 000 0205', subject: 'Solar products',
    message: 'Please send the datasheet for your solar inverter package and confirm whether it works with lithium batteries.',
    steps: [{ to: 'in_progress', after: 1 * DAY }],
  },
  {
    reference: 'GPEC-C-2026-DE000006', age: 10 * DAY,
    fullName: 'Gbenga Afolabi', company: 'Afolabi Estates', email: 'gbenga.afolabi@example.com', phone: '+234 000 000 0206', subject: 'Other inquiry',
    message: 'Do you offer maintenance contracts for the distribution boards on a residential estate of 40 houses?',
    steps: [{ to: 'in_progress', after: 1 * DAY }, { to: 'closed', after: 4 * DAY }],
    note: { text: 'Sent a proposal by email; customer will come back next quarter.', after: 4 * DAY },
  },
  {
    reference: 'GPEC-C-2026-DE000007', age: 14 * DAY,
    fullName: 'Zainab Sani', company: '', email: 'zainab.sani@example.com', phone: '', subject: 'Electrical accessories',
    message: 'Which cable glands would suit 16 mm² armoured cable going into your power distribution enclosure?',
    steps: [{ to: 'closed', after: 1 * DAY }],
  },
  {
    reference: 'GPEC-C-2026-DE000008', age: 6 * DAY,
    fullName: 'Peter Akpan', company: 'Akpan Clinics', email: 'peter.akpan@example.com', phone: '+234 000 000 0208', subject: '',
    message: 'Our clinic needs a reliable backup for a vaccine fridge and the lights in two consulting rooms. What would you recommend?',
    steps: [{ to: 'in_progress', after: 2 * HOUR }],
  },
]

// Demo prices (naira) for the sample products, so GPEC can try buying (the owner's request,
// 2026-10-23); the same prices as in the demo orders above. Invented. Set only on sample products that
// have no price, and cleared again on removal only where staff have not changed them.
// "Replacement parts" stays unpriced, so the shop's "Price to be confirmed" shows too.
export const demoPrices: Record<string, number> = {
  'panel-001': 1850000,
  'protection-001': 295000,
  'solar-001': 2450000,
  'distribution-001': 980000,
  'components-001': 45000,
  'accessories-001': 27500,
  'metering-001': 210000,
  'isolation-001': 38500,
  'terminal-001': 45000,
  'starter-001': 385000,
  'inverter-001': 640000,
  'solar-inverter-001': 1275000,
  'cable-001': 64000,
}
