import type { SecondStep } from '../../types'

interface SecondStepFieldsProps {
  idPrefix: string
  useRecovery: boolean
  onToggle: () => void
  codeLabel: string
  errors: Record<string, string>
  // Whether the recovery-code alternative is offered.
  allowRecovery?: boolean
}

// The 6-digit code field, or a recovery code instead, with a button to switch between them.
export default function SecondStepFields({ idPrefix, useRecovery, onToggle, codeLabel, errors, allowRecovery = true }: SecondStepFieldsProps) {
  const field = useRecovery ? 'recoveryCode' : 'code'
  const errorId = `${idPrefix}-${field}-error`
  return <div className="admin-field">
    <label htmlFor={`${idPrefix}-${field}`}>{useRecovery ? 'Recovery code' : codeLabel}</label>
    {useRecovery
      ? <input key="recovery" id={`${idPrefix}-recoveryCode`} name="recoveryCode" required autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={22} placeholder="abcde-fghij" aria-describedby={errors.recoveryCode ? errorId : undefined} />
      : <input key="code" id={`${idPrefix}-code`} name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="123456" aria-describedby={errors.code ? errorId : undefined} />}
    {errors[field] && <small className="admin-field-error" id={errorId}>{errors[field]}</small>}
    {allowRecovery && <button type="button" className="admin-link-button" onClick={onToggle}>{useRecovery ? 'Use a 6-digit code instead' : 'Use a recovery code instead'}</button>}
  </div>
}

// What the form holds: the code with spaces removed, or the recovery code as typed.
export function readSecondStep(formData: FormData): SecondStep {
  const recoveryCode = formData.get('recoveryCode')
  if (typeof recoveryCode === 'string') return { recoveryCode: recoveryCode.trim() }
  return { code: String(formData.get('code') ?? '').replace(/\s/g, '') }
}
