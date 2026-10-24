import { useEffect, useState } from 'react'
import Arrow from '../Arrow'
import { siteContentAdmin } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { listSiteContent } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { SiteContentSummary } from '../../types'

interface AdminSiteContentListProps {
  onSessionEnded: () => void
}

// The pages staff can edit, whether each is still a draft, and when it last changed.
export default function AdminSiteContentList({ onSessionEnded }: AdminSiteContentListProps) {
  const [pages, setPages] = useState<SiteContentSummary[] | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    listSiteContent()
      .then((loaded) => { if (isCurrent) setPages(loaded.pages) })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load the site content.')
      })
    return () => { isCurrent = false }
  }, [loadAttempt, onSessionEnded])

  function retry() {
    setError('')
    setLoadAttempt((attempt) => attempt + 1)
  }

  return <section aria-labelledby="admin-content-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {siteContentAdmin.eyebrow}</p><h1 id="admin-content-title" tabIndex={-1}>{siteContentAdmin.title}</h1></div>
    </div>
    <p className="admin-intro">{siteContentAdmin.intro}</p>
    <p className="admin-notice">{siteContentAdmin.draftNote}</p>
    {error ? <div className="shop-status" role="alert"><p>{error}</p><button type="button" className="button button-primary" onClick={retry}>Try again</button></div>
      : !pages ? <p className="admin-loading" role="status">Loading site content…</p>
      : <ul className="admin-product-list admin-content-list">{pages.map((page) => <li key={page.key}>
        <div className="admin-product-main"><strong>{page.title}</strong></div>
        <span><span className={`admin-status admin-status-${page.approved ? 'approved' : 'draft'}`}>{page.approved ? siteContentAdmin.status.approved : siteContentAdmin.status.draft}</span></span>
        <span className="admin-content-updated">Updated <time dateTime={page.updatedAt}>{formatDateTime(page.updatedAt)}</time></span>
        <a className="admin-edit-link" href={`#admin/content/${page.key}`} aria-label={`Edit ${page.title}`}>Edit <Arrow /></a>
      </li>)}</ul>}
  </section>
}
