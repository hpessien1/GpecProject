import { useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { deliveryAreaFieldLabels, deliveryAreaStatusLabels } from '../../data/adminContent'
import { inputToMinorUnits, minorUnitsToInput } from '../../utils/money'
import type { AdminDeliveryArea, CurrencyInfo, EditableDeliveryAreaFields } from '../../types'

// sortOrder and status are only on the edit form; a new area is active and goes to the end of the list.
export type DeliveryAreaFormValues = Omit<EditableDeliveryAreaFields, 'sortOrder' | 'status'> & Partial<Pick<EditableDeliveryAreaFields, 'sortOrder' | 'status'>>

interface AdminDeliveryAreaFormProps {
  // null when adding a new area.
  area: AdminDeliveryArea | null
  currency: CurrencyInfo
  isSaving: boolean
  serverErrors: Record<string, string>
  onSubmit: (values: DeliveryAreaFormValues) => void
}

export default function AdminDeliveryAreaForm({ area, currency, isSaving, serverErrors, onSubmit }: AdminDeliveryAreaFormProps) {
  const [feeError, setFeeError] = useState('')
  const errors: Record<string, string> = { ...serverErrors, ...(feeError && { fee: feeError }) }
  const idPrefix = area ? `area-${area.id}` : 'area-new'
  const describedBy = (name: string, hint: boolean) => [hint && `${idPrefix}-${name}-hint`, errors[name] && `${idPrefix}-${name}-error`].filter(Boolean).join(' ') || undefined
  const error = (name: string) => errors[name] && <small className="admin-field-error" id={`${idPrefix}-${name}-error`}>{errors[name]}</small>

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const field = (name: string) => String(formData.get(name) ?? '').trim()
    const fee = inputToMinorUnits(field('fee'), currency)
    if (fee === undefined || fee === null) {
      setFeeError(`Enter an amount such as 3000${currency.minorUnitDigits ? ` or 3000.${'5'.padEnd(currency.minorUnitDigits, '0')}` : ''}; 0 for free delivery.`)
      return
    }
    setFeeError('')
    onSubmit({
      name: field('name'),
      description: field('description'),
      fee,
      ...(area ? { status: field('status') === 'archived' ? 'archived' : 'active', sortOrder: Number(field('sortOrder')) } : {}),
    })
  }

  return <form className="admin-form" onSubmit={handleSubmit}>
    <div className="admin-field">
      <label htmlFor={`${idPrefix}-name`}>{deliveryAreaFieldLabels.name}</label>
      <input id={`${idPrefix}-name`} name="name" required maxLength={120} defaultValue={area?.name} aria-describedby={describedBy('name', false)} />
      {error('name')}
    </div>
    <div className="admin-field">
      <label htmlFor={`${idPrefix}-description`}>{deliveryAreaFieldLabels.description}</label>
      <input id={`${idPrefix}-description`} name="description" maxLength={300} defaultValue={area?.description} aria-describedby={describedBy('description', true)} />
      <small id={`${idPrefix}-description-hint`}>Optional. Shown to customers, e.g. the districts or towns included.</small>
      {error('description')}
    </div>
    <div className="admin-field">
      <label htmlFor={`${idPrefix}-fee`}>{deliveryAreaFieldLabels.fee}</label>
      <input id={`${idPrefix}-fee`} name="fee" required inputMode="decimal" defaultValue={area ? minorUnitsToInput(area.fee, currency) : ''} aria-describedby={describedBy('fee', true)} />
      <small id={`${idPrefix}-fee-hint`}>In {currency.code}, per order. 0 for free delivery.</small>
      {error('fee')}
    </div>
    {area && <>
      <div className="admin-field">
        <label htmlFor={`${idPrefix}-status`}>{deliveryAreaFieldLabels.status}</label>
        <select id={`${idPrefix}-status`} name="status" defaultValue={area.status}>
          {Object.entries(deliveryAreaStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {error('status')}
      </div>
      <div className="admin-field">
        <label htmlFor={`${idPrefix}-sortOrder`}>{deliveryAreaFieldLabels.sortOrder}</label>
        <input id={`${idPrefix}-sortOrder`} name="sortOrder" type="number" step={1} required defaultValue={area.sortOrder} aria-describedby={describedBy('sortOrder', true)} />
        <small id={`${idPrefix}-sortOrder-hint`}>Lower numbers appear first at checkout.</small>
        {error('sortOrder')}
      </div>
    </>}
    <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>{area ? 'Save changes' : 'Add area'} <Arrow /></>}</button>
  </form>
}
