import { useRef, useState } from 'react'
import Arrow from './Arrow'
import { services } from '../data/landingContent'

interface ServiceShowcaseProps {
  // Called by every "Learn more" link, which also goes to the contact form.
  onAskAbout: (topic: string) => void
}

// The nine business areas: one featured in the large panel, the other eight as cards. Choosing a card
// swaps it with the featured area, so the other cards never move. The card's title is the button
// (stretched over the whole card); "Learn more" stays a separate link to the contact form.
export default function ServiceShowcase({ onAskAbout }: ServiceShowcaseProps) {
  const [featured, setFeatured] = useState(0)
  // Which area each of the eight card positions shows.
  const [slots, setSlots] = useState(() => services.map((_, index) => index).slice(1))
  const [announcement, setAnnouncement] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const area = services[featured]

  function feature(slot: number) {
    const chosen = slots[slot]
    setSlots((current) => current.map((index, position) => position === slot ? featured : index))
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
      <div className="service-feature-copy">
        <div className="service-feature-top"><span>{area.number}</span><span>{area.tag}</span></div>
        <div className="service-feature-body">
          <h3>{area.title}</h3>
          <span className="service-feature-rule" aria-hidden="true" />
          <p>{area.text}</p>
          <a href="#contact" onClick={() => onAskAbout(area.topic)} aria-label={`Ask about ${area.title}`}>Learn more <Arrow /></a>
        </div>
      </div>
      <div className="service-feature-visual">
        <div className="service-feature-image">
          <img src={area.image} alt={area.imageAlt} />
          {area.illustrative && <span className="service-image-note">Illustrative image</span>}
        </div>
      </div>
    </article>
    <p className="visually-hidden" aria-live="polite">{announcement}</p>
    <div className="service-support-grid">{slots.map((index, slot) => {
      const service = services[index]
      // Keyed by position, so a chosen card's button keeps keyboard focus after the swap.
      return <article className="service-mini-card" key={slot}>
        <div className="service-mini-top"><span>{service.number}</span><span>{service.tag}</span></div>
        <h3><button type="button" className="service-select" aria-controls="service-feature" onClick={() => feature(slot)}><span className="visually-hidden">Show </span>{service.title}<span className="visually-hidden"> in the panel above</span></button></h3>
        <span className="service-mini-rule" aria-hidden="true" />
        <a href="#contact" onClick={() => onAskAbout(service.topic)} aria-label={`Ask about ${service.title}`}>Learn more <Arrow /></a>
      </article>
    })}</div>
  </div>
}
