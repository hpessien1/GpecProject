import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import AdminOlderEntries from './AdminOlderEntries'
import { siteContentAdmin, siteContentFieldLabels, siteContentItemLabels } from '../../data/adminContent'
import { siteContentPages } from '../../data/siteContentCopy'
import { ApiError } from '../../services/apiClient'
import { getAdminSiteContent, getOlderSiteContentHistory, updateSiteContent } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { EditableSiteContentFields, SiteContentChange, SiteContentKey, SiteContentPage, SiteContentResponse, SiteContentSection } from '../../types'

interface AdminSiteContentEditorProps {
  pageKey: SiteContentKey
  onSessionEnded: () => void
}

// A section being edited, with a key that stays the same while sections move.
interface DraftSection extends SiteContentSection {
  id: number
}

interface Draft {
  title: string
  intro: string
  approved: boolean
  sections: DraftSection[]
}

let nextSectionId = 1

function toDraft(page: SiteContentPage): Draft {
  return { title: page.title, intro: page.intro, approved: page.approved, sections: page.sections.map((section) => ({ ...section, id: nextSectionId++ })) }
}

const trimmedSections = (sections: SiteContentSection[]) => sections.map(({ heading, body }) => ({ heading: heading.trim(), body: body.trim() }))

// Only what differs from the saved page is sent; the sections go as a whole list, in their new order.
function changesFrom(draft: Draft, page: SiteContentPage) {
  const changes: Partial<EditableSiteContentFields> = {}
  if (draft.title.trim() !== page.title) changes.title = draft.title.trim()
  if (draft.intro.trim() !== page.intro) changes.intro = draft.intro.trim()
  if (draft.approved !== page.approved) changes.approved = draft.approved
  const sections = trimmedSections(draft.sections)
  if (JSON.stringify(sections) !== JSON.stringify(page.sections)) changes.sections = sections
  return changes
}

// What a saved change did to the sections, by heading: added, removed, reworded, or reordered.
function SectionChanges({ from, to, item }: { from: SiteContentSection[], to: SiteContentSection[], item: string }) {
  const headingsBefore = from.map((section) => section.heading)
  const headingsAfter = to.map((section) => section.heading)
  const added = to.filter((section) => !headingsBefore.includes(section.heading))
  const removed = from.filter((section) => !headingsAfter.includes(section.heading))
  const reworded = to.flatMap((section) => {
    const before = from.find((old) => old.heading === section.heading)
    return before && before.body !== section.body ? [{ heading: section.heading, before: before.body, after: section.body }] : []
  })
  const kept = headingsAfter.filter((heading) => headingsBefore.includes(heading))
  const reordered = kept.join('\n') !== headingsBefore.filter((heading) => headingsAfter.includes(heading)).join('\n')
  return <>
    {added.map((section) => <li key={`added-${section.heading}`}><strong>{item} added</strong>: {section.heading}</li>)}
    {removed.map((section) => <li key={`removed-${section.heading}`}><strong>{item} removed</strong>: {section.heading}</li>)}
    {reworded.map((change) => <li key={`reworded-${change.heading}`}>
      <strong>Text changed</strong>: {change.heading}
      <details className="admin-content-diff"><summary>Show the text before and after</summary><p><strong>Before:</strong> {change.before}</p><p><strong>After:</strong> {change.after}</p></details>
    </li>)}
    {reordered && <li><strong>Order changed</strong></li>}
  </>
}

function ChangeLine({ change, item }: { change: SiteContentChange, item: string }) {
  if (change.field === 'sections') return <SectionChanges from={change.from} to={change.to} item={item} />
  if (change.field === 'approved') return <li><strong>{siteContentFieldLabels.approved}</strong>: {change.from ? 'Yes' : 'No'} → {change.to ? 'Yes' : 'No'}</li>
  return <li><strong>{siteContentFieldLabels[change.field]}</strong>: {change.from || '(empty)'} → {change.to || '(empty)'}</li>
}

// One staff-edited page: its title, introduction, sections (or questions), and whether GPEC has
// approved the wording. Saving puts it on the website at once; the history keeps every earlier version.
export default function AdminSiteContentEditor({ pageKey, onSessionEnded }: AdminSiteContentEditorProps) {
  const [data, setData] = useState<SiteContentResponse | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  // The control to focus after sections move, appear, or disappear (moving them would drop focus).
  const focusTarget = useRef<string | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const labels = siteContentItemLabels[pageKey]

  useEffect(() => {
    let isCurrent = true
    getAdminSiteContent(pageKey)
      .then((loaded) => {
        if (!isCurrent) return
        setData(loaded)
        setDraft(toDraft(loaded.page))
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load this page.')
      })
    return () => { isCurrent = false }
  }, [pageKey, onSessionEnded])

  useEffect(() => { resultRef.current?.focus() }, [result])

  // After every render, so it runs once the moved, added, or remaining sections are on the page.
  useEffect(() => {
    if (!focusTarget.current) return
    const target = document.getElementById(focusTarget.current)
    focusTarget.current = null
    // A move button that is now at the end of the list is disabled: use the other one.
    if (target instanceof HTMLButtonElement && target.disabled) target.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    else target?.focus()
  })

  const changes = data && draft ? changesFrom(draft, data.page) : {}
  const hasChanges = Object.keys(changes).length > 0

  function updateSection(id: number, field: 'heading' | 'body', value: string) {
    setDraft((current) => current && { ...current, sections: current.sections.map((section) => section.id === id ? { ...section, [field]: value } : section) })
  }

  function moveSection(index: number, step: -1 | 1) {
    if (!draft) return
    const target = index + step
    if (target < 0 || target >= draft.sections.length) return
    const sections = [...draft.sections]
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    setDraft({ ...draft, sections })
    focusTarget.current = `content-${sections[target].id}-${step < 0 ? 'up' : 'down'}`
  }

  function removeSection(index: number) {
    if (!draft) return
    const sections = draft.sections.filter((_, position) => position !== index)
    setDraft({ ...draft, sections })
    const next = sections[index] ?? sections[index - 1]
    focusTarget.current = next ? `content-${next.id}-heading` : 'content-add'
  }

  function addSection() {
    if (!draft) return
    const section = { id: nextSectionId++, heading: '', body: '' }
    setDraft({ ...draft, sections: [...draft.sections, section] })
    focusTarget.current = `content-${section.id}-heading`
  }

  function discard() {
    if (!data) return
    setDraft(toDraft(data.page))
    setServerErrors({})
    setResult(null)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data || !draft) return
    if (!hasChanges) {
      setResult({ kind: 'success', message: siteContentAdmin.noChanges })
      return
    }
    setResult(null)
    setServerErrors({})
    setIsSaving(true)
    try {
      const saved = await updateSiteContent(pageKey, changes)
      setData(saved)
      setDraft(toDraft(saved.page))
      setResult({ kind: 'success', message: siteContentAdmin.saved })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setServerErrors(error.errors)
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save this page.' })
    } finally {
      setIsSaving(false)
    }
  }

  const fieldError = (name: string) => serverErrors[name] && <small className="admin-field-error" id={`content-error-${name.replaceAll('.', '-')}`}>{serverErrors[name]}</small>
  const describedBy = (hint: string | null, name: string) => [hint, serverErrors[name] ? `content-error-${name.replaceAll('.', '-')}` : null].filter(Boolean).join(' ') || undefined

  return <section aria-labelledby="admin-content-edit-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> <a href="#admin/content">{siteContentAdmin.title}</a></p><h1 id="admin-content-edit-title" tabIndex={-1}>{data?.page.title ?? 'Loading…'}</h1></div>
      <a className="admin-edit-link" href={siteContentPages[pageKey].href} target="_blank" rel="noopener">View on the website<span className="visually-hidden"> (opens in a new tab)</span> <Arrow /></a>
    </div>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !data || !draft ? <p className="admin-loading" role="status">Loading the page…</p>
      : <div className="admin-editor-layout">
        <form className="admin-form admin-content-form" onSubmit={handleSubmit}>
          <div className="admin-notice admin-content-help" id="content-format-help">
            <p>How to format the text:</p>
            <ul>{siteContentAdmin.formatHelp.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
          <div className="admin-field">
            <label htmlFor="content-title">{siteContentFieldLabels.title}</label>
            <input id="content-title" value={draft.title} maxLength={120} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-describedby={describedBy(null, 'title')} />
            {fieldError('title')}
          </div>
          <div className="admin-field">
            <label htmlFor="content-intro">{siteContentFieldLabels.intro}</label>
            <textarea id="content-intro" value={draft.intro} rows={3} maxLength={1000} onChange={(event) => setDraft({ ...draft, intro: event.target.value })} aria-describedby={describedBy(null, 'intro')} />
            {fieldError('intro')}
          </div>

          <fieldset className="admin-content-sections">
            <legend>{labels.item}s ({draft.sections.length})</legend>
            {fieldError('sections')}
            {draft.sections.map((section, index) => <fieldset key={section.id} className="admin-content-section">
              <legend>{labels.item} {index + 1}</legend>
              <div className="admin-field">
                <label htmlFor={`content-${section.id}-heading`}>{labels.heading}</label>
                <input id={`content-${section.id}-heading`} value={section.heading} maxLength={200} required onChange={(event) => updateSection(section.id, 'heading', event.target.value)} aria-describedby={describedBy(null, `sections.${index}.heading`)} />
                {fieldError(`sections.${index}.heading`)}
              </div>
              <div className="admin-field">
                <label htmlFor={`content-${section.id}-body`}>{labels.body}</label>
                <textarea id={`content-${section.id}-body`} value={section.body} rows={6} maxLength={4000} required onChange={(event) => updateSection(section.id, 'body', event.target.value)} aria-describedby={describedBy('content-format-help', `sections.${index}.body`)} />
                {fieldError(`sections.${index}.body`)}
              </div>
              <div className="admin-content-actions">
                <button type="button" id={`content-${section.id}-up`} className="admin-show-older" disabled={index === 0} onClick={() => moveSection(index, -1)} aria-label={`Move up: ${labels.item.toLowerCase()} ${index + 1}`}>Move up</button>
                <button type="button" id={`content-${section.id}-down`} className="admin-show-older" disabled={index === draft.sections.length - 1} onClick={() => moveSection(index, 1)} aria-label={`Move down: ${labels.item.toLowerCase()} ${index + 1}`}>Move down</button>
                <button type="button" className="admin-show-older admin-content-remove" onClick={() => removeSection(index)} aria-label={`Remove ${labels.item.toLowerCase()} ${index + 1}`}>Remove</button>
              </div>
            </fieldset>)}
            <button type="button" id="content-add" className="button button-outline" onClick={addSection}>Add a {labels.item.toLowerCase()}</button>
          </fieldset>

          <div className="admin-field admin-checkbox">
            <label><input type="checkbox" checked={draft.approved} onChange={(event) => setDraft({ ...draft, approved: event.target.checked })} aria-describedby="content-approved-hint" /> {siteContentAdmin.approvedLabel}</label>
            <small id="content-approved-hint">{siteContentAdmin.approvedHint}</small>
            {fieldError('approved')}
          </div>
          {fieldError('body')}
          {hasChanges && <p className="admin-notice" role="status">{siteContentAdmin.unsaved}</p>}
          <div className="admin-content-submit">
            <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Save and publish <Arrow /></>}</button>
            {hasChanges && <button type="button" className="button button-outline" onClick={discard}>Discard changes</button>}
          </div>
        </form>
        <section className="admin-history" aria-labelledby="admin-content-history-title">
          <h2 id="admin-content-history-title">Change history</h2>
          <AdminOlderEntries kind="history" newest={data.history} cursor={data.historyCursor} loadOlder={(before) => getOlderSiteContentHistory(pageKey, before)} onSessionEnded={onSessionEnded}>
            {(history) => history.length === 0 ? <p>No changes yet: the website shows the text the page started with.</p>
              : <ol>{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
                <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
                <ul>{entry.changes.map((change) => <ChangeLine key={change.field} change={change} item={labels.item} />)}</ul>
              </li>)}</ol>}
          </AdminOlderEntries>
        </section>
      </div>}
  </section>
}
