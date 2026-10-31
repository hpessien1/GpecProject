import { useRef, useState } from 'react'
import Arrow from './Arrow'
import { services } from '../data/landingContent'

interface ServiceShowcaseProps {
  // Called by every enquiry link, which also goes to the contact form.
  onAskAbout: (topic: string) => void
}

// One business area is featured in the large panel (photo above, text below); all twelve remain in
// fixed card positions. Choosing a card updates the featured area without reordering cards.
export default function ServiceShowcase({ onAskAbout }: ServiceShowcaseProps) {
  const [featured, setFeatured] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const area = services[featured]

  function feature(chosen: number) {
    setFeatured(chosen)
    setAnnouncement(`Showing ${services[chosen].title}`)
    // On narrow screens the panel is above the cards; bring it into view if it has scrolled away.
    const panel = panelRef.current
    if (panel && panel.getBoundingClientRect().top < 0) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panel.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }

  return <div className="service-showcase">
    <article className="service-feature-card" id="service-feature" ref={panelRef}>
      <div className="service-feature-visual">
        <div className="service-feature-image">
          {/* A blurred copy fills the space a wide or tall photo leaves; decorative, so no alt text. */}
          <img className="service-feature-backdrop" src={area.image} alt="" />
          <img className="service-feature-photo" src={area.image} alt={area.imageAlt} />
          {area.illustrative && <span className="service-image-note">Illustrative image</span>}
        </div>
      </div>
      <div className="service-feature-copy">
        <div className="service-feature-top"><span>{area.number}</span><span>{area.tag}</span></div>
        <div className="service-feature-body">
          <h3>{area.title}</h3>
          <span className="service-feature-rule" aria-hidden="true" />
          <p>{area.text}</p>
          <div className="service-card-actions">
            <a href="#contact" onClick={() => onAskAbout(area.topic)} aria-label={`Make an enquiry about ${area.title}`}>Make enquiry <Arrow /></a>
            <a className="service-shop-link" href="#shop" aria-label={`Shop products related to ${area.title}`}>Shop <Arrow /></a>
          </div>
        </div>
      </div>
    </article>
    <p className="visually-hidden" aria-live="polite">{announcement}</p>
    <div className="service-support-grid">{services.map((service, index) => {
      return <article className="service-mini-card" key={service.title}>
        <div className="service-mini-top"><span>{service.number}</span><span>{service.tag}</span></div>
        <h3><button type="button" className="service-select" aria-controls="service-feature" onClick={() => feature(index)}><span className="visually-hidden">Show </span>{service.title}<span className="visually-hidden"> in the panel above</span></button></h3>
        <span className="service-mini-rule" aria-hidden="true" />
        <div className="service-card-actions">
          <a href="#contact" onClick={() => onAskAbout(service.topic)} aria-label={`Make an enquiry about ${service.title}`}>Make enquiry <Arrow /></a>
          <a className="service-shop-link" href="#shop" aria-label={`Shop products related to ${service.title}`}>Shop <Arrow /></a>
        </div>
      </article>
    })}</div>
  </div>
}
