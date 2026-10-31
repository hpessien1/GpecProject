import { useEffect, useState } from 'react'
import Arrow from '../components/Arrow'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { panelCapabilityDetailCopy } from '../data/landingContent'
import type { PanelCapability } from '../data/landingContent'

interface PanelCapabilityPageProps {
  capability: PanelCapability
}

export default function PanelCapabilityPage({ capability }: PanelCapabilityPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [number, title, summary] = capability

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const previousTitle = document.title
    document.title = `${title} | Electrical Panels | GPEC`
    return () => { document.title = previousTitle }
  }, [title])

  return <div className="site-shell">
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
    <Header menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} onCloseMenu={() => setMenuOpen(false)} />
    <main id="main" className="panel-capability-page" tabIndex={-1}>
      <section className="panel-capability-detail-hero">
        <a className="panel-capability-back" href="#panels">Back to electrical panels</a>
        <p className="eyebrow"><span /> Electrical panels / {number}</p>
        <h1>{title}</h1>
        <p className="panel-capability-detail-summary">{summary}</p>
      </section>
      <section className="panel-capability-detail-body" aria-label={`${title} details`}>
        {panelCapabilityDetailCopy.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <a className="button button-primary" href="#contact">Discuss your requirement <Arrow /></a>
      </section>
    </main>
    <Footer />
  </div>
}
