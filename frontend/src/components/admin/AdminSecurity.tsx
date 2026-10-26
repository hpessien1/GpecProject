import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import PasswordInput from './PasswordInput'
import QrCode from './QrCode'
import RecoveryCodes from './RecoveryCodes'
import SecondStepFields, { readSecondStep } from './SecondStepFields'
import { twoFactorContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { disableTwoFactor, enableTwoFactor, getTwoFactorStatus, regenerateRecoveryCodes, sendAccountCode, startAppSetup } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { TwoFactorMethod, TwoFactorStatus } from '../../types'

interface AdminSecurityProps {
  email: string
  onSessionEnded: () => void
  // Tells the page around it that two-step login is now on or off (the banner).
  onChanged: (enabled: boolean) => void
}

type Step =
  | { kind: 'overview' }
  | { kind: 'app', secret: string, uri: string }
  | { kind: 'email' }
  | { kind: 'codes', codes: string[] }
  | { kind: 'confirm', action: 'disable' | 'regenerate' }

const methodNames: Record<TwoFactorMethod, string> = { app: 'an authenticator app', email: 'codes by email' }

// The admin's own two-step login (#admin/security): turn it on with an authenticator app or email
// codes, see how many recovery codes are left, make new ones, or turn it off.
export default function AdminSecurity({ email, onSessionEnded, onChanged }: AdminSecurityProps) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'overview' })
  const [chosen, setChosen] = useState<TwoFactorMethod | null>(null)
  const [useRecovery, setUseRecovery] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: 'error' | 'status', text: string } | null>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    getTwoFactorStatus()
      .then((loaded) => {
        if (!isCurrent) return
        setStatus(loaded)
        setChosen(loaded.available.app ? 'app' : loaded.available.email ? 'email' : null)
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load your two-step login settings.')
      })
    return () => { isCurrent = false }
  }, [onSessionEnded])

  useEffect(() => { if (message) messageRef.current?.focus() }, [message])
  // A new step's heading takes focus (the recovery codes focus their own).
  useEffect(() => { if (step.kind !== 'codes' && step.kind !== 'overview') document.getElementById('admin-security-step')?.focus() }, [step])

  // Runs a request with the busy state, field errors, and a message; 401 ends the session.
  async function run<T>(request: () => Promise<T>, onSuccess: (result: T) => void) {
    setMessage(null)
    setErrors({})
    setIsBusy(true)
    try {
      onSuccess(await request())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setErrors(error.errors)
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Something went wrong. Please try again.' })
    } finally {
      setIsBusy(false)
    }
  }

  function begin(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (chosen === 'app') void run(startAppSetup, (setup) => setStep({ kind: 'app', ...setup }))
    else if (chosen === 'email') void run(sendAccountCode, (sent) => { setStep({ kind: 'email' }); setMessage({ kind: 'status', text: sent.message }) })
  }

  function enable(event: SubmitEvent<HTMLFormElement>, method: TwoFactorMethod) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = String(formData.get('password') ?? '')
    const code = String(formData.get('code') ?? '').replace(/\s/g, '')
    void run(() => enableTwoFactor(method, password, code), ({ recoveryCodes, ...next }) => {
      setStatus(next)
      onChanged(true)
      setStep({ kind: 'codes', codes: recoveryCodes })
    })
  }

  function confirm(event: SubmitEvent<HTMLFormElement>, action: 'disable' | 'regenerate') {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = String(formData.get('password') ?? '')
    const secondStep = readSecondStep(formData)
    if (action === 'disable') {
      void run(() => disableTwoFactor(password, secondStep), (next) => {
        setStatus(next)
        onChanged(false)
        setStep({ kind: 'overview' })
        setMessage({ kind: 'status', text: 'Two-step login is off. Logging in now needs only your password.' })
      })
    } else {
      void run(() => regenerateRecoveryCodes(password, secondStep), ({ recoveryCodes, ...next }) => {
        setStatus(next)
        setStep({ kind: 'codes', codes: recoveryCodes })
      })
    }
  }

  const back = () => { setStep({ kind: 'overview' }); setMessage(null); setErrors({}); setUseRecovery(false) }
  const resendButton = <button type="button" className="admin-link-button" onClick={() => void run(sendAccountCode, (sent) => setMessage({ kind: 'status', text: sent.message }))}>Email me a code</button>
  // Every change here asks for the password: a browser left logged in is not enough.
  const passwordField = (idPrefix: string) => <div className="admin-field">
    <label htmlFor={`${idPrefix}-password`}>Password</label>
    <PasswordInput id={`${idPrefix}-password`} name="password" required autoComplete="current-password" aria-describedby={errors.password ? `${idPrefix}-password-error` : undefined} />
    {errors.password && <small className="admin-field-error" id={`${idPrefix}-password-error`}>{errors.password}</small>}
  </div>

  let body = null
  if (loadError) body = <p className="form-error" role="alert">{loadError}</p>
  else if (!status) body = <p className="admin-loading" role="status">Loading…</p>
  else if (step.kind === 'codes') body = <RecoveryCodes codes={step.codes} email={email} onDone={back} />
  else if (step.kind === 'app') {
    body = <section className="admin-security-step" aria-labelledby="admin-security-step">
      <h2 id="admin-security-step" tabIndex={-1}>Set up your authenticator app</h2>
      <ol className="admin-security-steps">{twoFactorContent.appSteps.map((line) => <li key={line}>{line}</li>)}</ol>
      <div className="admin-qr-layout">
        <QrCode value={step.uri} label="QR code to add GPEC Admin to your authenticator app" />
        <div>
          <p className="admin-security-key-label">Key, if you cannot scan:</p>
          {/* Groups of four, as most apps show it; spaces are ignored when typed in. */}
          <p className="admin-security-key"><code>{step.secret.match(/.{1,4}/g)?.join(' ')}</code></p>
          <p className="admin-security-key-label">Type: time-based, 6 digits.</p>
        </div>
      </div>
      <form className="admin-form" onSubmit={(event) => enable(event, 'app')}>
        {passwordField('setup')}
        <SecondStepFields idPrefix="setup" useRecovery={false} onToggle={() => undefined} allowRecovery={false} codeLabel="6-digit code from the app" errors={errors} />
        <div className="admin-security-buttons">
          <button className="button button-primary" type="submit" disabled={isBusy}>{isBusy ? 'Checking…' : <>Turn on two-step login <Arrow /></>}</button>
          <button type="button" className="button button-outline" onClick={back}>Cancel</button>
        </div>
      </form>
    </section>
  } else if (step.kind === 'email') {
    body = <section className="admin-security-step" aria-labelledby="admin-security-step">
      <h2 id="admin-security-step" tabIndex={-1}>Check your email</h2>
      <p>Enter your password, to confirm it is you, and the 6-digit code we emailed to {email}. From now on, a code like this is emailed to you each time you log in.</p>
      <form className="admin-form" onSubmit={(event) => enable(event, 'email')}>
        {passwordField('setup')}
        <SecondStepFields idPrefix="setup" useRecovery={false} onToggle={() => undefined} allowRecovery={false} codeLabel="6-digit code from the email" errors={errors} />
        <p className="admin-help">{resendButton}</p>
        <div className="admin-security-buttons">
          <button className="button button-primary" type="submit" disabled={isBusy}>{isBusy ? 'Checking…' : <>Turn on two-step login <Arrow /></>}</button>
          <button type="button" className="button button-outline" onClick={back}>Cancel</button>
        </div>
      </form>
    </section>
  } else if (step.kind === 'confirm' && status.method) {
    const isDisable = step.action === 'disable'
    body = <section className="admin-security-step" aria-labelledby="admin-security-step">
      <h2 id="admin-security-step" tabIndex={-1}>{isDisable ? 'Turn off two-step login' : 'Make new recovery codes'}</h2>
      <p>{isDisable ? twoFactorContent.disableWarning : 'Your current recovery codes stop working, and you get ten new ones.'} To confirm it is you, enter your password and a code.</p>
      <form className="admin-form" onSubmit={(event) => confirm(event, step.action)}>
        {passwordField('security')}
        <SecondStepFields idPrefix="security" useRecovery={useRecovery} onToggle={() => setUseRecovery((current) => !current)} codeLabel={status.method === 'app' ? '6-digit code from your app' : '6-digit code from your email'} errors={errors} />
        {status.method === 'email' && !useRecovery && <p className="admin-help">{resendButton}</p>}
        <div className="admin-security-buttons">
          <button className="button button-primary" type="submit" disabled={isBusy}>{isBusy ? 'Checking…' : isDisable ? 'Turn off two-step login' : 'Make new recovery codes'}</button>
          <button type="button" className="button button-outline" onClick={back}>Cancel</button>
        </div>
      </form>
    </section>
  } else if (status.method) {
    body = <section className="admin-security-step" aria-labelledby="admin-security-status">
      <h2 id="admin-security-status"><span className="admin-status admin-status-approved">On</span> Using {methodNames[status.method]}</h2>
      {status.enabledAt && <p>Turned on <time dateTime={status.enabledAt}>{formatDateTime(status.enabledAt)}</time>.</p>}
      <p>Recovery codes left: <strong>{status.recoveryCodesLeft}</strong> of 10.</p>
      {status.recoveryCodesLeft <= 3 && <p className="admin-notice admin-notice-strong">{twoFactorContent.recovery.lowWarning}</p>}
      {status.method === 'app' && !status.available.app && <p className="admin-notice">Codes from your app cannot be checked right now (the website’s settings for authenticator apps are missing). Log in with a recovery code, and ask the site administrator.</p>}
      <div className="admin-security-buttons">
        <button type="button" className="button button-outline" onClick={() => { setStep({ kind: 'confirm', action: 'regenerate' }); setMessage(null) }}>Make new recovery codes</button>
        <button type="button" className="button button-outline" onClick={() => { setStep({ kind: 'confirm', action: 'disable' }); setMessage(null) }}>Turn off two-step login</button>
      </div>
      <p className="admin-help">To switch between the app and email codes, turn two-step login off, then on again with the other.</p>
    </section>
  } else {
    body = <section className="admin-security-step" aria-labelledby="admin-security-status">
      <h2 id="admin-security-status"><span className="admin-status admin-status-draft">Off</span> Logging in needs only your password</h2>
      <form className="admin-form" onSubmit={begin}>
        <fieldset className="admin-security-methods">
          <legend>How would you like to get your codes?</legend>
          {(['app', 'email'] as const).map((method) => <label key={method} className={`admin-security-method${status.available[method] ? '' : ' is-unavailable'}`}>
            <input type="radio" name="method" value={method} checked={chosen === method} disabled={!status.available[method]} onChange={() => setChosen(method)} />
            <span>{twoFactorContent.methods[method].label}<small>{status.available[method] ? twoFactorContent.methods[method].hint : twoFactorContent.methods[method].unavailable}</small></span>
          </label>)}
        </fieldset>
        <button className="button button-primary" type="submit" disabled={isBusy || !chosen}>{isBusy ? 'Starting…' : <>Continue <Arrow /></>}</button>
      </form>
    </section>
  }

  return <section aria-labelledby="admin-security-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {twoFactorContent.page.eyebrow}</p><h1 id="admin-security-title" tabIndex={-1}>{twoFactorContent.page.title}</h1></div>
    </div>
    <p className="admin-intro">{twoFactorContent.page.intro}</p>
    {message && <p className={message.kind === 'error' ? 'form-error' : 'success-message'} role={message.kind === 'error' ? 'alert' : 'status'} tabIndex={-1} ref={messageRef}>{message.text}</p>}
    <div className="admin-security">{body}</div>
  </section>
}
