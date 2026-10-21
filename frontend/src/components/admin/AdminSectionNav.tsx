type AdminSection = 'products' | 'enquiries' | 'contact-requests' | null

interface AdminSectionNavProps {
  current: AdminSection
}

const sections = [
  { id: 'products', label: 'Products', href: '#admin' },
  { id: 'enquiries', label: 'Order enquiries', href: '#admin/enquiries' },
  { id: 'contact-requests', label: 'Contact requests', href: '#admin/contact-requests' },
] as const

// The admin's main sections. Inside the page rather than the header, so it stays visible on phones.
export default function AdminSectionNav({ current }: AdminSectionNavProps) {
  return <nav className="admin-sections" aria-label="Admin sections">
    {sections.map((section) => <a key={section.id} href={section.href} aria-current={current === section.id ? 'page' : undefined}>{section.label}</a>)}
  </nav>
}
