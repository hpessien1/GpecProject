import { useEffect, useState } from 'react'
import AdminOlderEntries from './AdminOlderEntries'
import { securityLogContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { getSecurityLog } from '../../services/adminApi'
import { describeBrowser } from '../../utils/browser'
import { formatDateTime } from '../../utils/dates'
import type { SecurityLogEntry, SecurityLogResponse } from '../../types'

interface AdminSecurityLogProps {
  onSessionEnded: () => void
}

interface EntryProps {
  entry: SecurityLogEntry
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

// The security log, newest first, for every account or one: logins and attempts, changes to admins'
// own logins, and customer records opened (backend models/SecurityEvent.ts). Read only.
export default function AdminSecurityLog({ onSessionEnded }: AdminSecurityLogProps) {
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<{ accountId: string, log: SecurityLogResponse } | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let isCurrent = true
    getSecurityLog(accountId || null)
      .then((log) => { if (isCurrent) setData({ accountId, log }) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the security log.')
      })
    return () => { isCurrent = false }
  }, [accountId, onSessionEnded])

  // Shown only once the chosen account's entries have arrived, not the previous account's.
  const log = data && data.accountId === accountId ? data.log : null
  return <section aria-labelledby="admin-security-log-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {securityLogContent.eyebrow}</p><h1 id="admin-security-log-title" tabIndex={-1}>{securityLogContent.title}</h1></div>
    </div>
    <p className="admin-intro">{securityLogContent.intro}</p>
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : <>
        {/* In .admin-form for the admin screens' field look; not a form, as there is nothing to send. */}
        {data && <div className="admin-form admin-security-filter">
          <div className="admin-field">
            <label htmlFor="security-log-account">{securityLogContent.filterLabel}</label>
            <select id="security-log-account" value={accountId} onChange={(event) => { setLoadError(''); setAccountId(event.target.value) }}>
              <option value="">{securityLogContent.allAccounts}</option>
              {data.log.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.email})</option>)}
            </select>
          </div>
        </div>}
        {!log ? <p className="admin-loading" role="status">Loading the security log…</p>
          : <div className="admin-history admin-security-log">
            <AdminOlderEntries kind="securityLog" newest={log.entries} cursor={log.cursor} loadOlder={(before) => getSecurityLog(accountId || null, before)} onSessionEnded={onSessionEnded}>
              {(entries) => entries.length === 0 ? <p>{securityLogContent.empty}</p>
                : <ol>{entries.map((entry, index) => <Entry key={`${entry.createdAt}-${index}`} entry={entry} />)}</ol>}
            </AdminOlderEntries>
          </div>}
      </>}
  </section>
}
