import { useEffect, useState } from 'react'
import ContentBody from '../components/ContentBody'
import DraftNotice from '../components/DraftNotice'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { siteContentPages, siteContentStates } from '../data/siteContentCopy'
import { getSiteContent } from '../services/contentApi'
import { formatDate } from '../utils/dates'
import type { SiteContentPage } from '../types'

interface PolicyPageProps {
  pageKey: 'privacy' | 'refunds'
}

// The privacy notice (#privacy) and the refunds policy (#refunds), in the words GPEC's staff last
// saved in the admin panel.
export default function PolicyPage({ pageKey }: PolicyPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [page, setPage] = useState<SiteContentPage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // App.tsx gives each page its own instance (keyed by route), so there is no earlier page to clear.
    let isCurrent = true
    window.scrollTo({ top: 0, behavior: 'instant' })
    getSiteContent(pageKey)
      .then((loaded) => { if (isCurrent) setPage(loaded) })
      .catch((loadError: unknown) => { if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'Unable to load this page.') })
    return () => { isCurrent = false }
  }, [pageKey])

  useEffect(() => {
    const previousTitle = document.title
    if (page) document.title = `${page.title} | GPEC`
    return () => { document.title = previousTitle }
  }, [page])

  return <div className="site-shell">
    {/* Moves focus without changing the hash: "#main" would be read as a route and leave this page. */}
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
    <Header menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} onCloseMenu={() => setMenuOpen(false)} />
    <main id="main" className="policy-page" tabIndex={-1}>
      <section className="policy-hero">
        <p className="eyebrow"><span /> {siteContentPages[pageKey].eyebrow}</p>
        <h1>{page?.title ?? (error ? 'Page unavailable' : siteContentStates.loading)}</h1>
        {page?.intro && <p>{page.intro}</p>}
      </section>
      <div className="policy-body">
        {error ? <p className="form-error" role="alert">{error}</p>
          : !page ? <p className="policy-loading" role="status">{siteContentStates.loading}</p>
          : <>
            {!page.approved && <DraftNotice />}
            <p className="policy-updated">Last updated: <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time></p>
            {page.sections.length === 0 ? <p>{siteContentStates.empty}</p>
              : page.sections.map((section, index) => <section key={index} className="policy-section">
                <h2>{section.heading}</h2>
                <ContentBody text={section.body} />
              </section>)}
          </>}
      </div>
    </main>
    <Footer />
  </div>
}
