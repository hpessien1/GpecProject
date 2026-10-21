// GPEC's nine business areas, in the brief's order (README.md, "GPEC's Areas of Work"); each text is
// condensed from the brief's own description. Keep all nine (AGENTS.md). Clicking an area on the home
// page features it in the large panel.
//   topic: the contact-form topic its "Learn more" pre-selects (one of contactSubjects below).
//   image: until GPEC supplies real photos, areas 2-9 reuse the closest existing image and are marked
//   illustrative, so no picture is presented as GPEC's own work (CLAUDE.md, Principle 3). Three are
//   stills from the Afrizone project (owner's request), already shown under Projects; permission to
//   name that client is still to be confirmed by GPEC (CLAUDE.md Known Gaps).
export interface ServiceArea {
  number: string
  title: string
  text: string
  tag: string
  topic: string
  image: string
  imageAlt: string
  illustrative: boolean
}

const solarArray = { image: '/assets/portfolio-solar-array.jpg', imageAlt: 'Solar panel array in a landscape at sunset', illustrative: true }
const productLineup = { image: '/assets/product-lineup.png', imageAlt: 'Electrical products and panel accessories laid out together', illustrative: true }
const annotatedPanel = { image: '/assets/control-panel-annotated-clean.png', imageAlt: 'Electrical control enclosure with breakers, metering, and control components', illustrative: true }
const cabinets = { image: '/assets/portfolio-control-panel.jpg', imageAlt: 'Industrial electrical control and distribution cabinets', illustrative: true }
const afrizoneEnclosure = { image: '/assets/portfolio-afrizone-panel-poster.jpg', imageAlt: 'Electrical enclosure shown open, with indicator lights and industrial connectors', illustrative: true }
const afrizoneSockets = { image: '/assets/portfolio-electrical-components-poster.jpg', imageAlt: 'Electrical distribution enclosure with industrial socket outlets and breaker modules', illustrative: true }
const afrizoneDetails = { image: '/assets/portfolio-afrizone-panel-details-poster.jpg', imageAlt: 'Close view of socket outlets, breakers, and wiring inside an electrical enclosure', illustrative: true }

export const services: ServiceArea[] = [
  { number: '01', title: 'Electrical panels', text: 'Design, build, modification, and support for industrial control and power distribution panels.', tag: 'Engineering', topic: 'Electrical panels', image: '/assets/electrical-panels-product.png', imageAlt: 'Industrial electrical control panel with breakers, copper busbars, inverter, and control components', illustrative: false },
  { number: '02', title: 'Solar energy', text: 'Solar system assessment, component selection, installation support, and energy solutions for homes and businesses.', tag: 'Energy', topic: 'Solar energy', ...solarArray },
  { number: '03', title: 'Electrical sales', text: 'Cables, breakers, switches, sockets, lighting, and distribution equipment for building, maintenance, and industrial work.', tag: 'Supply', topic: 'Electrical products', ...afrizoneEnclosure },
  { number: '04', title: 'Solar sales', text: 'Solar modules, inverters, battery systems, charge controllers, and packaged solar solutions.', tag: 'Supply', topic: 'Solar products', ...solarArray },
  { number: '05', title: 'Solar accessories', text: 'Mounting rails, connectors, solar-rated cables, combiner boxes, disconnects, and surge protection to complete an installation.', tag: 'Accessories', topic: 'Solar accessories', ...productLineup },
  { number: '06', title: 'Electrical accessories', text: 'Cable glands, lugs, terminals, conduits, enclosures, junction boxes, and trunking for safe installation.', tag: 'Accessories', topic: 'Electrical accessories', ...afrizoneSockets },
  { number: '07', title: 'Electronics', text: 'Sensors, power supplies, meters, control modules, and testing equipment, matched to your existing system.', tag: 'Supply', topic: 'Electronics', ...annotatedPanel },
  { number: '08', title: 'Industrial sales', text: 'Motors, drives, pumps, automation equipment, and instrumentation, sourced against your specification or part number.', tag: 'Supply', topic: 'Industrial products', ...cabinets },
  { number: '09', title: 'Industrial accessories', text: 'Control switches, push buttons, indicator lamps, terminal blocks, panel hardware, and replacement parts.', tag: 'Accessories', topic: 'Industrial accessories', ...afrizoneDetails },
]

export const panelCapabilities: [number: string, title: string, text: string][] = [
  ['01', 'New panels', 'New control and distribution panels shaped around operating requirements, available space, and site conditions.'],
  ['02', 'Panel modification', 'Practical changes for outdated panels, new equipment, added capacity, and changing processes.'],
  ['03', 'Control systems', 'Panel layouts for starting, stopping, monitoring, and protecting equipment and processes.'],
  ['04', 'Power distribution', 'Power routing for circuits and equipment with the protective devices required by the project.'],
  ['05', 'Testing', 'Functional checks and testing support aligned with the agreed project scope and requirements.'],
  ['06', 'Site requirements', 'Panel solutions planned around loads, maintenance needs, operating conditions, and site constraints.'],
]

export const panelComponents = ['Motor starters', 'Contactors', 'Relays', 'Variable speed drives', 'Programmable controllers', 'Meters', 'Switches', 'Breakers', 'Isolators', 'Busbars']

export const productGroups: [title: string, description: string][] = [
  ['Electrical', 'Panels, protection, cables, switches, and installation materials'],
  ['Solar', 'Modules, batteries, inverters, controllers, and system accessories'],
  ['Electronics', 'Sensors, meters, power supplies, and control devices'],
  ['Industrial', 'Equipment, controls, accessories, and replacement parts'],
]

// Must match contactSubjects in backend/src/validation/contactRequest.ts, which rejects anything else.
export const contactSubjects = ['Electrical panels', 'Solar energy', 'Electrical products', 'Solar products', 'Solar accessories', 'Electrical accessories', 'Electronics', 'Industrial products', 'Industrial accessories', 'Other inquiry']

export const steps: [number: string, title: string, text: string][] = [
  ['01', 'Tell us what you need', 'Share your project requirement, part number, quantity, or technical drawing.'],
  ['02', 'Get the right solution', 'GPEC reviews technical needs and confirms the most suitable service or product path.'],
  ['03', 'Move your work forward', 'Receive a clear quote and next steps from the GPEC team.'],
]

// Main menu, in the order the brief requires (README.md, "Recommended Website Structure"). The shop
// is reached from the highlighted button beside the menu.
export const navigationLinks: [href: string, label: string][] = [
  ['#home', 'Home'],
  ['#about', 'About'],
  ['#services', 'Services'],
  ['#products', 'Products'],
  ['#projects', 'Projects'],
  ['#current-work', 'Current Work'],
  ['#contact', 'Contact'],
]

// MOCK CONTENT (2026-10-21, at the project owner's request): placeholder copy so the About and
// Current Work sections have something in them while GPEC prepares its own. It makes no specific
// claims (no dates founded, numbers, certifications, client names, or photos) and, at the owner's
// request, is shown without a "sample" label, so nothing on the page marks it as mock. Replace both
// with GPEC-approved text before launch (ROADMAP.md, "Needed from GPEC").

// MOCK: not yet approved by GPEC (see the note above).
export const aboutContent = {
  eyebrow: 'About GPEC',
  title: 'Engineering, energy, and supply.',
  // Shown under the heading, in the left column.
  lead: 'GPEC is an engineering company based in Nigeria, working on electrical control and distribution panels and solar energy, and supplying electrical, solar, electronic, and industrial products.',
  // Shown in the right column, above the highlights.
  paragraphs: [
    'We work with industrial, commercial, and residential customers who need power they can rely on. Our team designs, builds, and modifies control and distribution panels, plans solar systems around how a site actually uses energy, and sources the electrical, electronic, and industrial parts that keep equipment running.',
    'Every job starts with the customer’s requirement: the load, the site, and how the system will be maintained. We explain our recommendations in plain language and confirm specifications before any work or supply begins.',
  ],
  highlights: [
    ['Safety first', 'Panels and installations are planned around protection, isolation, and safe maintenance access.'],
    ['Built to specification', 'Components are selected and checked against the agreed requirement, not just on price.'],
    ['Clear communication', 'Customers get straightforward updates, quotes, and next steps at each stage.'],
  ] as [title: string, text: string][],
}

export interface CurrentWorkUpdate {
  title: string
  // The kind of customer or site only; no names without the customer's permission.
  site: string
  status: string
  // ISO date of the last update, shown on the page.
  updated: string
  summary: string
}

// MOCK: not yet approved by GPEC (see the note above).
export const currentWorkContent = {
  eyebrow: 'Current work',
  title: 'Work in progress.',
  intro: 'Updates on active GPEC projects, each marked with its current stage and the date it was last updated.',
  // Shown under the heading, above the project cards.
  lead: 'From panel upgrades to solar installations, here is what our team is working on right now.',
  empty: 'No current work has been published yet.',
  updates: [
    { title: 'Motor control centre upgrade', site: 'Manufacturing plant', status: 'Installation', updated: '2026-10-14', summary: 'Replacing ageing starters with a new motor control panel, including overload protection and clearer labelling for the maintenance team.' },
    { title: 'Rooftop solar and battery backup', site: 'Commercial office building', status: 'Design', updated: '2026-10-09', summary: 'Sizing panels, inverter, and batteries from the building’s measured daytime load to reduce generator running hours.' },
    { title: 'Distribution board replacement', site: 'Warehouse', status: 'Testing', updated: '2026-10-02', summary: 'New distribution board with metering installed; final checks and handover documentation are under way.' },
  ] as CurrentWorkUpdate[],
}

// MOCK (2026-10-21, at the project owner's request): footer contact details until GPEC supplies real
// ones. Deliberately unreachable, so no customer can contact a stranger by mistake: example.com is a
// domain reserved for examples (RFC 2606) and the phone number is not valid. Replace before launch.
export const companyContact = {
  email: 'info@example.com',
  phone: '+234 000 000 0000',
  location: 'Nigeria',
  hours: 'Mon–Fri, 8:00–17:00',
}
