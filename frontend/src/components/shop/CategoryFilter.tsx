import { productGroups } from '../../data/landingContent'
import type { Product, ProductCategory } from '../../types'

interface CategoryFilterProps {
  current: ProductCategory | null
  // The whole catalogue, to show how many products each group has before it is opened.
  products: Product[]
}

// All · Electrical · Solar · Electronics · Industrial. Links, not buttons: each group has its own
// address (#shop/category/solar), so a filtered view can be shared and the back button works.
export default function CategoryFilter({ current, products }: CategoryFilterProps) {
  const links = [
    { href: '#shop', label: 'All', count: products.length, isCurrent: current === null },
    ...productGroups.map((group) => ({ href: `#shop/category/${group.category}`, label: group.title, count: products.filter((product) => product.category === group.category).length, isCurrent: current === group.category })),
  ]
  return <nav className="shop-categories" aria-label="Product categories">
    {links.map((link) => <a key={link.href} href={link.href} aria-current={link.isCurrent ? 'page' : undefined}>{link.label} <span aria-label={`${link.count} ${link.count === 1 ? 'product' : 'products'}`}>{link.count}</span></a>)}
  </nav>
}
