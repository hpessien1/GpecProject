import type { ProductCategory } from '../types'

// GPEC's twelve business areas, in the brief's order (README.md, "GPEC's Areas of Work"); each text is
// condensed from the brief and GPEC's company profile. Keep all twelve (AGENTS.md). Clicking an area
// on the home page features it in the large panel.
//   topic: the contact-form topic its "Learn more" pre-selects (one of contactSubjects below).
//   image: photos of GPEC's own work and stock from its company profile (2026-10-23), shown as GPEC
//   supplied them, date and place stamps included. illustrative: true would label a picture that is
//   not GPEC's own work (CLAUDE.md, Principle 3); none needs it now.
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

export const services: ServiceArea[] = [
  { number: '01', title: 'Electrical panels', text: 'Design, build, modification, and support for industrial control and power distribution panels, switchgear, and electrical and instrumentation (E&I) systems.', tag: 'Engineering', topic: 'Electrical panels', image: '/assets/electrical-panels-product.png', imageAlt: 'Industrial electrical control panel with breakers, copper busbars, inverter, and control components', illustrative: false },
  { number: '02', title: 'Solar energy', text: 'Solar system design, installation, monitoring, and maintenance for homes and businesses, from commercial and industrial (C&I) systems to mini-grids for communities with little or no access to the main grid.', tag: 'Energy', topic: 'Solar energy', image: '/assets/gpec-solar-rooftop-array.jpg', imageAlt: 'Rows of solar panels installed along a long building roof', illustrative: false },
  { number: '03', title: 'Electrical sales', text: 'Cables, breakers, switches, sockets, lighting, and distribution equipment for building, maintenance, and industrial work.', tag: 'Supply', topic: 'Electrical products', image: '/assets/gpec-socket-distribution-enclosure.jpg', imageAlt: 'Open distribution enclosure with rows of industrial socket outlets and breakers', illustrative: false },
  { number: '04', title: 'Solar sales', text: 'Solar modules, inverters, battery systems, charge controllers, and packaged solar solutions.', tag: 'Supply', topic: 'Solar products', image: '/assets/gpec-solar-street-light.jpg', imageAlt: 'Solar-powered street light beside its box', illustrative: false },
  { number: '05', title: 'Solar accessories', text: 'Mounting rails, connectors, solar-rated cables, combiner boxes, disconnects, and surge protection to complete an installation.', tag: 'Accessories', topic: 'Solar accessories', image: '/assets/gpec-solar-inverter-room.jpg', imageAlt: 'Wall-mounted solar inverters wired through DC and AC isolator boxes and cable trays', illustrative: false },
  { number: '06', title: 'Electrical accessories', text: 'Cable glands, lugs, terminals, conduits, enclosures, junction boxes, and trunking for safe installation.', tag: 'Accessories', topic: 'Electrical accessories', image: '/assets/gpec-busbar-insulators.jpg', imageAlt: 'Copper busbar links mounted on red insulators beside a contactor on a mounting plate', illustrative: false },
  { number: '07', title: 'Electronics', text: 'Sensors, power supplies, meters, control modules, and testing equipment, matched to your existing system.', tag: 'Supply', topic: 'Electronics', image: '/assets/gpec-variable-speed-drive.jpg', imageAlt: 'Variable speed drive with its keypad, installed beside a control box with indicator lamps', illustrative: false },
  { number: '08', title: 'Industrial sales', text: 'Motors, drives, pumps, automation equipment, and instrumentation, sourced against your specification or part number.', tag: 'Supply', topic: 'Industrial products', image: '/assets/gpec-boxed-drive-stock.jpg', imageAlt: 'Boxed industrial drive from Schneider Electric stacked on pallets', illustrative: false },
  { number: '09', title: 'Industrial accessories', text: 'Control switches, push buttons, indicator lamps, terminal blocks, panel hardware, and replacement parts.', tag: 'Accessories', topic: 'Industrial accessories', image: '/assets/gpec-contactor-insulators.jpg', imageAlt: 'Contactor, DIN rail, and copper busbar links on red insulators', illustrative: false },
  { number: '10', title: 'Installation & repairs', text: 'Industrial, commercial, community, and domestic wiring and installation, lighting, electric vehicle (EV) systems, fault diagnosis, electrical repairs, and coil rewinding.', tag: 'Installation', topic: 'Installation and repairs', image: '/assets/gpec-motor-repair-technicians.jpg', imageAlt: 'Two technicians in overalls working on an industrial motor', illustrative: false },
  { number: '11', title: 'Generators & power', text: 'Generator installation, troubleshooting, repair, and after-sales service, power system analysis, upgrades, and optimization, and Power as a Service (PaaS).', tag: 'Power', topic: 'Generators and power systems', image: '/assets/gpec-generator-set.jpg', imageAlt: 'Enclosed diesel generator set installed outdoors', illustrative: false },
  { number: '12', title: 'Security & smart home', text: 'Solar-powered and mains-powered CCTV with real-time remote monitoring, and smart home automation to monitor and control homes and offices remotely.', tag: 'Security', topic: 'Security and smart home', image: '/assets/gpec-cctv-camera.jpg', imageAlt: 'Multi-lens CCTV camera held in a hand', illustrative: false },
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

// The four product groups: the home page's Products cards, and the shop's category filters (the
// backend's PRODUCT_CATEGORIES, models/Product.ts, in the same order). Each card opens the shop on its
// category. The photos are GPEC's own, the same ones as the matching sales areas in `services` above;
// faded behind each card's text, they are decorative (no alt text).
export const productCategoryLabels: Record<ProductCategory, string> = {
  electrical: 'Electrical',
  solar: 'Solar',
  electronics: 'Electronics',
  industrial: 'Industrial',
}

export const productGroups: { category: ProductCategory, title: string, description: string, image: string }[] = [
  { category: 'electrical', title: productCategoryLabels.electrical, description: 'Panels, protection, cables, switches, and installation materials', image: '/assets/gpec-socket-distribution-enclosure.jpg' },
  { category: 'solar', title: productCategoryLabels.solar, description: 'Modules, batteries, inverters, controllers, and system accessories', image: '/assets/gpec-solar-street-light.jpg' },
  { category: 'electronics', title: productCategoryLabels.electronics, description: 'Sensors, meters, power supplies, and control devices', image: '/assets/gpec-variable-speed-drive.jpg' },
  { category: 'industrial', title: productCategoryLabels.industrial, description: 'Equipment, controls, accessories, and replacement parts', image: '/assets/gpec-boxed-drive-stock.jpg' },
]

// Must match contactSubjects in backend/src/validation/contactRequest.ts, which rejects anything else.
export const contactSubjects = ['Electrical panels', 'Solar energy', 'Electrical products', 'Solar products', 'Solar accessories', 'Electrical accessories', 'Electronics', 'Industrial products', 'Industrial accessories', 'Installation and repairs', 'Generators and power systems', 'Security and smart home', 'Other inquiry']

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
  ['#contact', 'Contact'],
]

// From GPEC's company profile (2026-10-23), with light grammar corrections GPEC approved; the meaning
// is unchanged. Keep README.md ("Company Profile") in step.
export const aboutContent = {
  eyebrow: 'About GPEC',
  title: 'Engineering, energy, and supply.',
  // Shown under the heading, in the left column.
  lead: 'GPEC Engineering is an engineering service provider in Port Harcourt, Nigeria, focused on delivering practical, reliable, and efficient power, control, and electrical solutions, including Power as a Service (PaaS).',
  // Shown in the right column, above the vision and mission.
  paragraphs: [
    'We help industries, businesses, communities, and other facilities meet their ongoing needs for power, control, and electrical solutions, with professional approaches tailored to give you complete satisfaction, whether in design, installation, maintenance, troubleshooting, or repair.',
    'Our work is driven by a commitment to quality service delivery, safety, technical precision, and customer satisfaction. From installing power solutions to diagnosing electrical faults, we approach every project with careful planning and attention to detail.',
    'Our goal is to provide our clients with dependable engineering solutions, be it power solutions, the design and building of control systems, or sales with after-sales inspection and repairs: support that brings comfort, productivity, and long-term value.',
  ],
  highlights: [
    ['Our vision', 'To become a trusted engineering company known for dependable engineering solutions, quality sales services, and innovative approaches to power challenges.'],
    ['Our mission', 'To bring our clients satisfaction from our very first service, providing efficient and cost-effective engineering solutions from the first trial.'],
  ] as [title: string, text: string][],
  valuesTitle: 'Our core values',
  values: [
    ['Quality', 'Delivering work with consistent care, precision, focus, and attention to detail.'],
    ['Safety', 'Prioritizing safe working practices on every project.'],
    ['Integrity', 'Building clients’ trust through what we deliver and through lasting relationships, while upholding honesty and accountability.'],
    ['Innovation', 'Embracing the ever-changing practical technologies that improve the engineering landscape.'],
    ['Reliability', 'Providing solutions centered on each client’s particular needs.'],
    ['Customer satisfaction', 'Working toward dependable, satisfying results and lasting relationships built on trusted solutions, with the client at the center.'],
  ] as [title: string, text: string][],
}

// GPEC's contact details, from its company profile (2026-10-23); the city and legal name confirmed by
// the project owner. No business hours or social media links have been supplied yet, so none are shown.
export const companyContact = {
  legalName: 'GPEC Engineering Company Limited',
  email: 'gpecengineeringcompanylimited@gmail.com',
  phones: ['+234 703 197 5609', '+234 701 541 1707'],
  address: '#19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State',
}
