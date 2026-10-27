type AdminSection = 'products' | 'orders' | 'delivery' | 'bank-transfer' | 'contact-requests' | 'content' | 'emails' | 'security-log' | null

interface AdminSectionNavProps {
  current: AdminSection
}

const sections = [
  { id: 'products', label: 'Products', href: '#admin' },
  { id: 'orders', label: 'Orders', href: '#admin/orders' },
  { id: 'delivery', label: 'Delivery', href: '#admin/delivery' },
  { id: 'bank-transfer', label: 'Bank details', href: '#admin/bank-transfer' },
  { id: 'contact-requests', label: 'Contact requests', href: '#admin/contact-requests' },
  { id: 'content', label: 'Site content', href: '#admin/content' },
  { id: 'emails', label: 'Emails', href: '#admin/emails' },
  // When GPEC adds roles with fewer permissions, this stays with full admins (backend routes/adminSecurityLog.ts).
  { id: 'security-log', label: 'Security log', href: '#admin/security-log' },
] as const

// The admin's main sections. Inside the page rather than the header, so it stays visible on phones.
export default function AdminSectionNav({ current }: AdminSectionNavProps) {
  return <nav className="admin-sections" aria-label="Admin sections">
    {sections.map((section) => <a key={section.id} href={section.href} aria-current={current === section.id ? 'page' : undefined}>{section.label}</a>)}
  </nav>
}
