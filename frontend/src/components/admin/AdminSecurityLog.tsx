import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import Pagination from '../Pagination'
import { securityLogContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { getSecurityLog } from '../../services/adminApi'
import { describeBrowser } from '../../utils/browser'
import { formatDateTime, localDay, startOfLocalDay } from '../../utils/dates'
import { showingRange } from '../../utils/paging'
import { useRememberedState } from '../../utils/rememberedState'
import type { SecurityLogEntry, SecurityLogResponse } from '../../types'

interface AdminSecurityLogProps {
  onSessionEnded: () => void
}

interface EntryProps {
  entry: SecurityLogEntry
}

// What is shown: the page, the account ('' for all), and the first and last day ('' for open-ended),
// as the date boxes hold them.
interface Position {
  page: number
  accountId: string
  from: string
  to: string
}

// What happened, in plain words: the action, or what failed and why.
function describe(entry: SecurityLogEntry) {
  const { actions, failedActions, details, reasons } = securityLogContent
  if (entry.outcome === 'failure') {
    const what = failedActions[entry.action] ?? actions[entry.action]
    const why = entry.reason ? reasons[entry.reason] ?? entry.reason : ''
    return why ? `${what}: ${why}` : what
  }
  const detail = entry.detail ? details[entry.detail] ?? entry.detail : ''
  return detail ? `${actions[entry.action]} (${detail})` : actions[entry.action]
}

// The order or contact request an entry is about, linked so staff can look at it.
function Target({ target }: Pick<SecurityLogEntry, 'target'>) {
  if (!target) return null
  const reference = target.type === 'file' ? target.id.split('/')[0] : target.id
  const href = target.type === 'order' ? `#admin/orders/${encodeURIComponent(reference)}` : `#admin/contact-requests/${encodeURIComponent(reference)}`
  return <> <a href={href}>{reference}</a></>
}

function Entry({ entry }: EntryProps) {
  const failed = entry.outcome === 'failure'
  return <li className={failed ? 'admin-security-failed' : undefined}>
    <p className="admin-history-meta">
      <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.account ? `${entry.account.name} (${entry.account.email})` : securityLogContent.unknownAccount}
    </p>
    <p className="admin-security-what">
      {failed && <span className="admin-status admin-status-failed">{securityLogContent.failed}</span>}
      {describe(entry)}<Target target={entry.target} />
    </p>
    <p className="admin-security-where">
      {entry.via === 'command line' ? securityLogContent.commandLine
        : <>From <span className="admin-mono">{entry.ip || 'an unknown address'}</span> · <span title={entry.userAgent}>{describeBrowser(entry.userAgent)}</span></>}
    </p>
  </li>
}

// The security log, newest first, a page at a time, for every account or one, and between two days if
// staff choose: logins and attempts, changes to admins' own logins, and customer records opened
// (backend models/SecurityEvent.ts). Read only.
export default function AdminSecurityLog({ onSessionEnded }: AdminSecurityLogProps) {
  // Kept while staff open an order or request from an entry and come back.
  const [position, setPosition] = useRememberedState<Position>('securityLog', { page: 1, accountId: '', from: '', to: '' })
  const { page, accountId, from, to } = position
  const [fromText, setFromText] = useState(from)
  const [toText, setToText] = useState(to)
  const [datesError, setDatesError] = useState('')
  // The latest day the date boxes offer, as the screen opened.
  const [today] = useState(() => localDay(new Date()))
  const [data, setData] = useState<{ position: Position, log: SecurityLogResponse } | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let isCurrent = true
    // The days are counted on the admin's own calendar, as the entries' times are shown on it; the last
    // day runs up to the start of the next.
    getSecurityLog(page, accountId || null, from ? startOfLocalDay(from) : null, to ? startOfLocalDay(to, 1) : null)
      .then((log) => {
        if (!isCurrent) return
        // The list got shorter since this page was chosen (a remembered page, or entries deleted after
        // 12 months): show its last page rather than an empty one.
        if (page > log.totalPages) setPosition({ page: log.totalPages, accountId, from, to })
        else setData({ position: { page, accountId, from, to }, log })
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the security log.')
      })
    return () => { isCurrent = false }
  }, [page, accountId, from, to, onSessionEnded, setPosition])

  function chooseAccount(nextAccountId: string) {
    setLoadError('')
    setPosition({ page: 1, accountId: nextAccountId, from, to })
  }

  function applyDates(nextFrom: string, nextTo: string) {
    setFromText(nextFrom)
    setToText(nextTo)
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setDatesError(securityLogContent.datesOutOfOrder)
      return
    }
    setDatesError('')
    setLoadError('')
    setPosition({ page: 1, accountId, from: nextFrom, to: nextTo })
  }

  function handleDatesSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    applyDates(fromText, toText)
  }

  // Back to the top of the list, as a new page would load.
  function choosePage(nextPage: number) {
    setPosition({ page: nextPage, accountId, from, to })
    document.getElementById('admin-security-log-title')?.focus()
  }

  // Shown only once the chosen page's entries have arrived, not the previous choice's.
  const shown = data?.position
  const log = shown && shown.page === page && shown.accountId === accountId && shown.from === from && shown.to === to ? data.log : null
  return <section aria-labelledby="admin-security-log-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {securityLogContent.eyebrow}</p><h1 id="admin-security-log-title" tabIndex={-1}>{securityLogContent.title}</h1></div>
    </div>
    <p className="admin-intro">{securityLogContent.intro}</p>
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : <>
        {data && <form className="admin-form admin-security-filter" role="search" aria-label="Filter the security log" onSubmit={handleDatesSubmit} noValidate>
          <div className="admin-field">
            <label htmlFor="security-log-account">{securityLogContent.filterLabel}</label>
            <select id="security-log-account" value={accountId} onChange={(event) => chooseAccount(event.target.value)}>
              <option value="">{securityLogContent.allAccounts}</option>
              {data.log.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.email})</option>)}
            </select>
          </div>
          <div className="admin-security-dates">
            <div className="admin-field">
              <label htmlFor="security-log-from">{securityLogContent.fromLabel}</label>
              <input id="security-log-from" type="date" max={toText || today} value={fromText} onChange={(event) => setFromText(event.target.value)} aria-describedby="security-log-dates-help" />
            </div>
            <div className="admin-field">
              <label htmlFor="security-log-to">{securityLogContent.toLabel}</label>
              <input id="security-log-to" type="date" min={fromText || undefined} max={today} value={toText} onChange={(event) => setToText(event.target.value)} aria-describedby="security-log-dates-help" />
            </div>
            <div className="admin-search-row">
              <button className="button button-primary" type="submit">{securityLogContent.showDates}</button>
              {(from || to || fromText || toText) && <button className="text-link" type="button" onClick={() => applyDates('', '')}>{securityLogContent.clearDates}</button>}
            </div>
          </div>
          <small id="security-log-dates-help" className="admin-security-dates-help">{securityLogContent.datesHelp}</small>
          {datesError && <p className="form-error" role="alert">{datesError}</p>}
        </form>}
        {!log ? <p className="admin-loading" role="status">Loading the security log…</p>
          : log.entries.length === 0 ? <div className="shop-status" role="status"><p>{accountId || from || to ? securityLogContent.emptyFiltered : securityLogContent.empty}</p></div>
          : <>
            <p className="admin-count">{showingRange(page, log.pageSize, log.entries.length, log.total, { one: 'entry', many: 'entries' })}</p>
            <div className="admin-history admin-security-log">
              <ol>{log.entries.map((entry, index) => <Entry key={`${entry.createdAt}-${index}`} entry={entry} />)}</ol>
            </div>
            {log.totalPages > 1 && <Pagination label="Security log pages" page={page} totalPages={log.totalPages} onSelect={choosePage} />}
          </>}
      </>}
  </section>
}
