import { useEffect, useState } from 'react'
import ContentBody from './ContentBody'
import DraftNotice from './DraftNotice'
import { siteContentPages, siteContentStates } from '../data/siteContentCopy'
import { getSiteContent } from '../services/contentApi'
import type { SiteContentPage } from '../types'

// The FAQ on the home page (#faq), as GPEC's staff last saved it in the admin panel. Each question
// opens and closes on its own.
export default function FaqSection() {
  const [page, setPage] = useState<SiteContentPage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    getSiteContent('faq')
      .then((loaded) => { if (isCurrent) setPage(loaded) })
      .catch((loadError: unknown) => { if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'Unable to load the questions.') })
    return () => { isCurrent = false }
  }, [])

  return <section className="faq section" id="faq" aria-labelledby="faq-title">
    <div className="section-heading">
      <div><p className="eyebrow"><span /> {siteContentPages.faq.eyebrow}</p><h2 id="faq-title">{page?.title ?? 'Frequently asked questions'}</h2></div>
      {page?.intro && <p>{page.intro}</p>}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p>
      : !page ? <p className="faq-loading" role="status">{siteContentStates.loading}</p>
      : <>
        {!page.approved && <DraftNotice />}
        {page.sections.length === 0 ? <p className="faq-empty">{siteContentStates.empty}</p>
          : <div className="faq-list">{page.sections.map((section, index) => <details key={index} className="faq-item">
            <summary>{section.heading}</summary>
            <div className="faq-answer"><ContentBody text={section.body} /></div>
          </details>)}</div>}
      </>}
  </section>
}
