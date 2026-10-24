import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../components/Arrow'
import Header from '../components/Header'
import Footer from '../components/Footer'
import PlaceholderText from '../components/PlaceholderText'
import FaqSection from '../components/FaqSection'
import ServiceShowcase from '../components/ServiceShowcase'
import RequestFilesField from '../components/RequestFilesField'
import SpamTrapField from '../components/SpamTrapField'
import { aboutContent, contactSubjects, panelCapabilities, panelComponents, productGroups, steps } from '../data/landingContent'
import { fetchContactRequestOptions, submitContactRequest } from '../services/contactApi'

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [contactReference, setContactReference] = useState('')
  const [contactError, setContactError] = useState('')
  // Controlled, so a service's "Learn more" can pre-select its topic.
  const [contactSubject, setContactSubject] = useState('')
  // Optional attachments, offered once the API says GPEC's file storage is set up.
  const [fileUploads, setFileUploads] = useState(false)
  const [contactFiles, setContactFiles] = useState<File[]>([])
  const contactResultRef = useRef<HTMLParagraphElement>(null)
  const closeMenu = () => setMenuOpen(false)

  // The submit button is disabled while sending, which drops keyboard focus; move it to the result instead.
  useEffect(() => { contactResultRef.current?.focus() }, [contactReference, contactError])

  // Arriving from another page with a section link (e.g. #about from the shop or privacy notice): the
  // browser looked for the section before this page existed, so scroll to it once it does.
  useEffect(() => { document.getElementById(window.location.hash.slice(1))?.scrollIntoView() }, [])

  useEffect(() => {
    let isCurrent = true
    fetchContactRequestOptions()
      .then((options) => { if (isCurrent) setFileUploads(options.fileUploads) })
      // Deliberately quiet: the form works without attachments, so it simply does not offer them.
      .catch(() => {})
    return () => { isCurrent = false }
  }, [])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setContactError('')
    setContactReference('')
    setIsSending(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const field = (name: string) => String(formData.get(name) ?? '')
    try {
      const response = await submitContactRequest({
        fullName: field('name'),
        company: field('company'),
        email: field('email'),
        phone: field('phone'),
        subject: field('subject'),
        message: field('message'),
        website: field('website'),
      }, fileUploads ? contactFiles : [])
      setContactReference(response.reference)
      form.reset()
      setContactSubject('')
      setContactFiles([])
    } catch (error) {
      setContactError(error instanceof Error ? error.message : 'Unable to send your inquiry. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return <div className="site-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <Header menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} onCloseMenu={closeMenu} />
    <main id="main">
      <section className="hero" id="home"><div className="hero-copy"><p className="eyebrow"><span /> Engineering • energy • supply</p><h1>Powering<br /><em>what comes</em><br />next.</h1><p className="hero-text">GPEC brings together electrical engineering, solar energy solutions, and industrial supply for work that needs to perform.</p><div className="hero-actions"><a className="button button-primary" href="#contact">Start a project <Arrow /></a><a className="text-link" href="#shop">Shop products <Arrow /></a></div></div><div className="hero-art" aria-label="Abstract electrical panel illustration" role="img"><div className="orb orb-one" /><div className="orb orb-two" /><div className="grid-panel"><span className="panel-label">GPEC / SYSTEM READY</span><span className="signal signal-one" /><span className="signal signal-two" /><span className="signal signal-three" /><div className="panel-lines"><i /><i /><i /><i /></div><div className="panel-node node-one" /><div className="panel-node node-two" /><div className="panel-node node-three" /></div></div><p className="hero-tagline">Engineered for real-world conditions</p><div className="hero-footer"><span>GPEC / Engineering &amp; energy solutions</span><a href="#about">Scroll to discover <span aria-hidden="true">↓</span></a></div></section>

      <section className="about section" id="about"><div className="about-heading"><p className="eyebrow"><span /> {aboutContent.eyebrow}</p><h2>{aboutContent.title}</h2><p className="about-lead">{aboutContent.lead}</p></div><div className="about-body">{aboutContent.paragraphs.map((paragraph) => <p key={paragraph}><PlaceholderText text={paragraph} /></p>)}<ul className="about-highlights">{aboutContent.highlights.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}</ul><h3 className="about-values-title">{aboutContent.valuesTitle}</h3><ul className="about-highlights about-values">{aboutContent.values.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}</ul></div></section>

      <section className="services section" id="services"><div className="section-heading"><div><p className="eyebrow"><span /> Services</p><h2>Solutions with<br /><em>purpose.</em></h2></div><p>Engineering expertise and product knowledge, brought together for projects that cannot afford uncertainty.</p></div><ServiceShowcase onAskAbout={setContactSubject} /></section>

      <section className="panel-feature section" id="panels"><div className="panel-feature-main"><div className="panel-feature-copy"><p className="eyebrow"><span /> Built around your requirements</p><h2>Control &amp;<br /><em>distribution panels.</em></h2><p>GPEC designs, builds, constructs, and modifies electrical control and distribution panels for industrial and commercial settings. Each project begins with the load, operating requirements, available space, site conditions, and maintenance needs.</p><a className="button button-primary" href="#contact">Discuss your panel requirement <Arrow /></a></div><div className="panel-visual"><img src="/assets/control-panel-annotated-clean.png" alt="Annotated electrical control and distribution panel showing the main isolator, metering, control devices, cable management, variable speed drive, distribution breakers, and busbar system" /></div></div><div className="panel-capability-grid">{panelCapabilities.map(([number, title, text]) => <article className="panel-capability-card" key={number}><i className={`capability-icon icon-${number}`} aria-hidden="true" /><span>{number}</span><h3>{title}</h3><p>{text}</p><a href="#contact" aria-label={`Discuss ${title}`}>Discuss <Arrow /></a></article>)}</div><div className="panel-detail-row"><article className="panel-summary"><i className="panel-summary-icon control-panel-icon" aria-hidden="true" /><div><span>Control panels</span><p>Organize components that start, stop, monitor, and protect machines or processes.</p></div></article><article className="panel-summary"><i className="panel-summary-icon distribution-panel-icon" aria-hidden="true" /><div><span>Distribution panels</span><p>Route power to circuits or equipment through breakers, isolators, busbars, metering, and protective devices.</p></div></article><div className="component-list"><span>Typical components</span><div className="component-chip-list">{panelComponents.map((component, index) => <div className="component-chip" key={component}><i className={`component-symbol symbol-${index + 1}`} aria-hidden="true" /><small>{component}</small></div>)}</div></div></div></section>
      <section className="products section" id="products"><div className="products-heading"><div className="products-title-block"><p className="eyebrow"><span /> Products</p><h2>Source with<br /><em>confidence.</em></h2></div><p className="products-intro">Find the electrical, solar, electronic, and industrial products your project calls for. Give us a part number, specification, or application and we will help identify a suitable option.</p></div><nav className="product-category-grid" aria-label="Product categories">{productGroups.map(({ category, title, description, image }, index) => <a href={`#shop/category/${category}`} className="product-category" key={category} aria-label={`Shop ${title.toLowerCase()} products`}><img className="product-category-image" src={image} alt="" /><span className="product-category-number">0{index + 1}</span><strong>{title}</strong><small>{description}</small></a>)}</nav><p className="products-sourcing">Can’t find what you need? <a href="#contact">Send us the part number or specification</a> and we will source it.</p></section>

      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/media-has-caption -- the video gallery scrolls sideways, so tabIndex lets keyboard users scroll it. Captions: the first clip has a sound track; GPEC must confirm whether it contains speech (CLAUDE.md Known Gaps). */}
      <section className="work section work-dark" id="projects"><div className="work-top"><div><p className="eyebrow"><span /> Projects</p><h2>Work that <em>speaks clearly.</em></h2></div></div><div className="work-intro-card"><p>Every completed project is a chance to show technical ability, careful execution, and commitment to our clients’ requirements, and above all, a deep commitment to a lasting relationship.</p></div><div className="work-cards"><article className="work-card electric"><div className="work-image"><img src="/assets/gpec-control-panel-lineup.jpg" alt="Line-up of control panel sections with controller displays, indicator lamps, selector switches, and emergency stop buttons" /><span className="work-image-category">Control</span></div><div className="work-card-copy"><p>Our workmanship</p><h3>Power and<br />control panels</h3><p className="work-project-summary">Control panels designed and built for power reliability and electrical system performance, with controllers, indicator lamps, and switches arranged for safe operation.</p><span>From GPEC’s own work</span></div></article><article className="work-card solar"><div className="work-image"><img src="/assets/gpec-solar-panel-installation.jpg" alt="Installation team positioning a solar panel on a sloped roof" /><span className="work-image-category">Energy</span></div><div className="work-card-copy"><p>Our workmanship</p><h3>Solar energy<br />solutions</h3><p className="work-project-summary">Solar system design, installation, monitoring, and maintenance, tailored to each client, whether a business or a home.</p><span>From GPEC’s own work</span></div></article><article className="work-card work-video-feature"><div className="work-image work-video-image"><div className="work-video-gallery" role="region" aria-label="Three Afrizone project video clips; scroll to view all" tabIndex={0}><video controls playsInline preload="metadata" poster="/assets/portfolio-electrical-components-poster.jpg" aria-label="Video of an electrical distribution enclosure with blue industrial socket outlets and breaker modules"><source src="/assets/portfolio-electrical-components.mp4" type="video/mp4" />Your browser does not support embedded video.</video><video controls playsInline preload="metadata" muted poster="/assets/portfolio-afrizone-panel-poster.jpg" aria-label="Muted video showing the Afrizone electrical enclosure exterior and interior"><source src="/assets/portfolio-afrizone-panel-muted.mp4" type="video/mp4" />Your browser does not support embedded video.</video><video controls playsInline preload="metadata" muted poster="/assets/portfolio-afrizone-panel-details-poster.jpg" aria-label="Muted video showing close views of socket outlets, breakers, and wiring in the Afrizone enclosure"><source src="/assets/portfolio-afrizone-panel-details-muted.mp4" type="video/mp4" />Your browser does not support embedded video.</video></div><span className="work-image-category">Afrizone</span><small className="work-image-note">3 project clips</small></div><div className="work-card-copy"><p>Delivered project</p><h3>Industrial<br />distribution panel</h3><p className="work-project-description">Across all three clips, the enclosure is shown closed and open. Red, amber, and blue indicator lights and industrial connectors appear on the exterior. Inside, blue socket outlets are arranged in rows alongside breaker modules, mounting rails, and routed wiring, bringing connection and protection components together in one cabinet.</p><span>Built and delivered by GPEC team</span></div></article></div></section>

      <section className="process section"><div className="section-heading"><div><p className="eyebrow"><span /> How we work</p><h2>Clear from<br /><em>first contact.</em></h2></div><a className="button button-outline" href="#contact">Request a quote <Arrow /></a></div><ol className="steps">{steps.map(([number, title, text]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section>

      <FaqSection />

      <section className="contact section" id="contact"><div className="contact-heading"><p className="eyebrow"><span /> Contact</p><h2>Tell us what<br />you are <em>building.</em></h2><p>Send an inquiry for a service, product, replacement part, or project requirement. A GPEC representative will respond using the contact details you provide.</p></div><form className="quote-form" onSubmit={handleSubmit}><div className="field-row"><label>Full name<input name="name" required placeholder="Your name" /></label><label>Company <input name="company" placeholder="Company name" /></label></div><div className="field-row"><label>Email address<input name="email" type="email" required placeholder="you@company.com" /></label><label>Phone number<input name="phone" type="tel" placeholder="Your phone number" /></label></div><label>What can we help with?<select name="subject" value={contactSubject} onChange={(event) => setContactSubject(event.target.value)}><option value="" disabled>Select a service or product</option>{contactSubjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label>Your requirement<textarea name="message" rows={4} required placeholder="Tell us about your project, product specification, quantity, or part number." /></label>{fileUploads && <RequestFilesField files={contactFiles} onChange={setContactFiles} disabled={isSending} />}<SpamTrapField /><div className="form-footer"><p>By submitting, you agree that GPEC may use these details to respond to your inquiry. See our <a href="#privacy" target="_blank" rel="noopener">privacy notice<span className="visually-hidden"> (opens in a new tab)</span></a>.</p><button className="button button-primary" type="submit" disabled={isSending}>{isSending ? 'Sending inquiry…' : <>Send inquiry <Arrow /></>}</button></div>{contactError && <p className="form-error" role="alert" tabIndex={-1} ref={contactResultRef}>{contactError}</p>}{contactReference && <p className="success-message" role="status" tabIndex={-1} ref={contactResultRef}>Thank you. Your inquiry reference is <strong>{contactReference}</strong>. A GPEC representative will respond using the contact details you provided.</p>}</form></section>
    </main>
    <Footer />
  </div>
}
