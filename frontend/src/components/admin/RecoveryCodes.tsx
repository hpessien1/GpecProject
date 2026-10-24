import { useEffect, useRef, useState } from 'react'
import { twoFactorContent } from '../../data/adminContent'

interface RecoveryCodesProps {
  codes: string[]
  email: string
  onDone: () => void
}

// The ten recovery codes, shown once: copy, download as a text file, then confirm they are saved.
export default function RecoveryCodes({ codes, email, onDone }: RecoveryCodesProps) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const text = [`GPEC admin recovery codes for ${email}`, 'Each code works once.', '', ...codes].join('\n')

  useEffect(() => { headingRef.current?.focus() }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied.')
    } catch {
      setCopied('Copying is not allowed here: select the codes and copy them yourself.')
    }
  }

  function download() {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    link.download = 'gpec-admin-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return <section className="admin-recovery" aria-labelledby="admin-recovery-title">
    <h2 id="admin-recovery-title" tabIndex={-1} ref={headingRef}>{twoFactorContent.recovery.title}</h2>
    <p>{twoFactorContent.recovery.text}</p>
    <ol className="admin-recovery-codes">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
    <div className="admin-recovery-actions">
      <button type="button" className="button button-outline" onClick={() => void copy()}>Copy codes</button>
      <button type="button" className="button button-outline" onClick={download}>Download as a text file</button>
    </div>
    <p className="admin-recovery-copied" role="status">{copied}</p>
    <div className="admin-field admin-checkbox">
      <label><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /> {twoFactorContent.recovery.confirm}</label>
    </div>
    <button type="button" className="button button-primary" disabled={!saved} onClick={onDone}>Done</button>
  </section>
}
