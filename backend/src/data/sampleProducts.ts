// Sample products used to fill the catalogue until GPEC supplies its real product list. Names,
// references, descriptions, and specifications are NOT GPEC-supplied: every product is seeded with
// isPlaceholder: true, and the shop labels it as a sample. No prices. Loaded by scripts/seedProducts.ts.
export interface SampleProduct {
  id: string
  name: string
  reference: string
  description: string
  specs: string[]
  image: string
  alt: string
}

export const sampleProducts: SampleProduct[] = [
  { id: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', description: 'Control and distribution panel built around your operating requirements and site conditions.', specs: ['415 V', 'IP54 enclosure', 'Made to order'], image: '/assets/electrical-panels-product.png', alt: 'Open industrial electrical control panel with breakers and copper busbars' },
  { id: 'protection-001', name: 'Circuit protection assembly', reference: 'GPEC-CPA-014', description: 'Protection components for reliable switching, isolation, and distribution.', specs: ['DIN rail', 'Three phase', 'Panel ready'], image: '/assets/control-panel-annotated-clean.png', alt: 'Electrical control enclosure showing breakers, metering, and isolator components' },
  { id: 'solar-001', name: 'Solar power package', reference: 'GPEC-SOL-020', description: 'Solar modules, inverter equipment, and balance-of-system components for project supply.', specs: ['Site assessed', 'Inverter ready', 'Project supply'], image: '/assets/portfolio-solar-array.jpg', alt: 'Solar panel array in a landscape at sunset' },
  { id: 'distribution-001', name: 'Power distribution enclosure', reference: 'GPEC-PD-008', description: 'Enclosure and protection configuration for routing power safely to connected equipment.', specs: ['Custom layout', 'Busbar option', 'Industrial use'], image: '/assets/portfolio-control-panel.jpg', alt: 'Industrial electrical control and distribution cabinets' },
  { id: 'components-001', name: 'Industrial electrical components', reference: 'GPEC-IEC-033', description: 'Breakers, contactors, terminals, switches, and related parts sourced to specification.', specs: ['Part-number search', 'Technical support', 'Replacement ready'], image: '/assets/portfolio-electrical-components-poster.jpg', alt: 'Electrical distribution enclosure with industrial socket outlets and breaker modules' },
  { id: 'accessories-001', name: 'Panel accessories', reference: 'GPEC-PA-042', description: 'Cable management, terminals, labels, and mounting hardware for panel installation and maintenance.', specs: ['Specification led', 'Site suitable', 'Project supply'], image: '/assets/product-lineup.png', alt: 'Industrial electrical products and panel accessories' },
  { id: 'metering-001', name: 'Power metering kit', reference: 'GPEC-PMK-051', description: 'Metering equipment for tracking voltage, current, energy use, and operating conditions.', specs: ['Three phase', 'DIN rail', 'Panel ready'], image: '/assets/control-panel-annotated-clean.png', alt: 'Electrical control enclosure with metering components' },
  { id: 'isolation-001', name: 'Main isolator switch', reference: 'GPEC-MIS-062', description: 'Isolation switch options for safe equipment shutdown and maintenance access.', specs: ['Rotary handle', 'Lockable option', 'Rated selection'], image: '/assets/electrical-panels-product.png', alt: 'Industrial electrical control panel containing isolator switches' },
  { id: 'terminal-001', name: 'Terminal block set', reference: 'GPEC-TB-074', description: 'Terminal blocks and markers for clear, serviceable panel wiring connections.', specs: ['DIN rail', 'Numbered markers', 'Cable sized'], image: '/assets/product-lineup.png', alt: 'Industrial electrical products and panel accessories' },
  { id: 'starter-001', name: 'Motor starter assembly', reference: 'GPEC-MSA-085', description: 'Motor starting and protection components specified for connected loads and duty.', specs: ['Contactor', 'Overload protection', 'Control ready'], image: '/assets/portfolio-control-panel.jpg', alt: 'Industrial electrical control and distribution cabinets' },
  { id: 'inverter-001', name: 'Variable speed drive', reference: 'GPEC-VSD-097', description: 'Drive solution for controlling motor speed, torque, and process performance.', specs: ['Motor matched', 'Parameter setup', 'Panel integration'], image: '/assets/control-panel-annotated-clean.png', alt: 'Electrical control enclosure with variable speed drive' },
  { id: 'solar-inverter-001', name: 'Solar inverter package', reference: 'GPEC-SIP-108', description: 'Inverter and protection equipment selected for solar generation projects.', specs: ['System matched', 'Protection included', 'Site assessed'], image: '/assets/portfolio-solar-array.jpg', alt: 'Solar panel array in a landscape at sunset' },
  { id: 'cable-001', name: 'Industrial cable accessories', reference: 'GPEC-ICA-119', description: 'Glands, lugs, conduits, labels, and cable support accessories for installation work.', specs: ['Size matched', 'Site suitable', 'Project supply'], image: '/assets/product-lineup.png', alt: 'Industrial electrical products and panel accessories' },
  { id: 'replacement-001', name: 'Replacement parts enquiry', reference: 'GPEC-RPE-130', description: 'Parts sourced against supplied references, drawings, photos, and technical requirements.', specs: ['Part-number search', 'Technical review', 'Compatibility checked'], image: '/assets/portfolio-electrical-components-poster.jpg', alt: 'Electrical distribution enclosure with industrial socket outlets and breaker modules' },
]
