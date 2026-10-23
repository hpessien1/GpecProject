interface PaginationProps {
  // Names the navigation for screen readers, e.g. "Order list pages".
  label: string
  page: number
  totalPages: number
  onSelect: (page: number) => void
}

// Every page when there are few; otherwise the first, the last, and the pages either side of the
// current one, with "…" for the gaps, so the row still fits a phone with dozens of pages.
function visiblePages(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const shown = [...new Set([1, page - 1, page, page + 1, totalPages])].filter((number) => number >= 1 && number <= totalPages).sort((a, b) => a - b)
  return shown.flatMap((number, index) => {
    const previous = shown[index - 1]
    if (previous === undefined || number === previous + 1) return [number]
    // A gap of one page shows that page rather than "…", which would hide no more than a number.
    return number === previous + 2 ? [previous + 1, number] : ['gap' as const, number]
  })
}

// Previous, the page numbers, and Next: the shop's catalogue and the admin lists.
export default function Pagination({ label, page, totalPages, onSelect }: PaginationProps) {
  return <nav className="shop-pagination" aria-label={label}>
    <button type="button" onClick={() => onSelect(page - 1)} disabled={page <= 1}>Previous</button>
    {visiblePages(page, totalPages).map((number, index) => number === 'gap'
      ? <span key={`gap-${index}`} className="shop-pagination-gap" aria-hidden="true">…</span>
      : <button type="button" key={number} className={number === page ? 'is-active' : ''} aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => onSelect(number)}>{number}</button>)}
    <button type="button" onClick={() => onSelect(page + 1)} disabled={page >= totalPages}>Next</button>
  </nav>
}
