import { useState } from 'react'
import type { ReactNode, SubmitEvent } from 'react'
import Arrow from '../Arrow'
import ProductImageField from './ProductImageField'
import { productFieldLabels, productStatusLabels } from '../../data/adminContent'
import { inputToMinorUnits, minorUnitsToInput } from '../../utils/money'
import type { AdminProduct, CurrencyInfo, EditableProductFields } from '../../types'

// sortOrder is left out for a new product with no position given, so the server adds it at the end.
export type ProductFormValues = Omit<EditableProductFields, 'sortOrder'> & { id: string, sortOrder?: number }

interface AdminProductFormProps {
  // null when creating a new product.
  product: AdminProduct | null
  currency: CurrencyInfo | null
  imageUploads: boolean
  isSaving: boolean
  serverErrors: Record<string, string>
  onSubmit: (values: ProductFormValues) => void
  onSessionEnded: () => void
}

interface FieldProps {
  name: keyof ProductFormValues
  errors: Record<string, string>
  hint?: string
  children: ReactNode
}

// A labelled field with its hint and error message, linked for screen readers.
function Field({ name, errors, hint, children }: FieldProps) {
  return <div className="admin-field">
    <label htmlFor={`product-${name}`}>{productFieldLabels[name]}</label>
    {children}
    {hint && <small id={`product-${name}-hint`}>{hint}</small>}
    {errors[name] && <small className="admin-field-error" id={`product-${name}-error`}>{errors[name]}</small>}
  </div>
}

function describedBy(name: string, errors: Record<string, string>, hint: boolean) {
  return [hint && `product-${name}-hint`, errors[name] && `product-${name}-error`].filter(Boolean).join(' ') || undefined
}

export default function AdminProductForm({ product, currency, imageUploads, isSaving, serverErrors, onSubmit, onSessionEnded }: AdminProductFormProps) {
  const [priceError, setPriceError] = useState('')
  const [imageError, setImageError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const errors: Record<string, string> = { ...serverErrors, ...(priceError && { price: priceError }), ...(imageError && { image: imageError }) }
  const isNew = product === null

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const field = (name: string) => String(formData.get(name) ?? '').trim()
    // A chosen photo is kept in a hidden field, which the browser's own required check skips.
    setImageError(field('image') ? '' : 'Choose a photo for the product.')
    if (!field('image')) return
    let price = product?.price ?? null
    if (currency) {
      const parsed = inputToMinorUnits(field('price'), currency)
      if (parsed === undefined) {
        setPriceError(`Enter an amount such as 1500${currency.minorUnitDigits ? ` or 1500.${'5'.padEnd(currency.minorUnitDigits, '0')}` : ''}, or leave it empty.`)
        return
      }
      price = parsed
    }
    setPriceError('')
    const sortOrder = field('sortOrder')
    onSubmit({
      id: isNew ? field('id') : product.id,
      name: field('name'),
      reference: field('reference'),
      description: field('description'),
      specs: field('specs').split('\n').map((spec) => spec.trim()).filter(Boolean),
      image: field('image'),
      alt: field('alt'),
      price,
      isPlaceholder: formData.get('isPlaceholder') === 'on',
      status: field('status') === 'archived' ? 'archived' : 'active',
      sortOrder: sortOrder === '' ? undefined : Number(sortOrder),
    })
  }

  return <form className="admin-form admin-product-form" onSubmit={handleSubmit}>
    {isNew && <Field name="id" errors={errors} hint="Internal key, e.g. panel-002. Lowercase letters, digits, and hyphens. Cannot be changed later.">
      <input id="product-id" name="id" required pattern="[a-z0-9\-]{1,60}" maxLength={60} aria-describedby={describedBy('id', errors, true)} />
    </Field>}
    <Field name="name" errors={errors}><input id="product-name" name="name" required maxLength={120} defaultValue={product?.name} aria-describedby={describedBy('name', errors, false)} /></Field>
    <Field name="reference" errors={errors} hint="The code customers see, e.g. GPEC-CP-001.">
      <input id="product-reference" name="reference" required maxLength={40} defaultValue={product?.reference} aria-describedby={describedBy('reference', errors, true)} />
    </Field>
    <Field name="description" errors={errors}><textarea id="product-description" name="description" required maxLength={1000} rows={4} defaultValue={product?.description} aria-describedby={describedBy('description', errors, false)} /></Field>
    <Field name="specs" errors={errors} hint="One per line, up to 10.">
      <textarea id="product-specs" name="specs" rows={4} defaultValue={product?.specs.join('\n')} aria-describedby={describedBy('specs', errors, true)} />
    </Field>
    <ProductImageField initialImage={product?.image ?? ''} uploadsEnabled={imageUploads} error={errors.image} onUploadingChange={setIsUploading} onSessionEnded={onSessionEnded} />
    <Field name="alt" errors={errors} hint="Describes the image for people who cannot see it.">
      <input id="product-alt" name="alt" required maxLength={300} defaultValue={product?.alt} aria-describedby={describedBy('alt', errors, true)} />
    </Field>
    <Field name="price" errors={errors} hint={currency ? `In ${currency.code}. Leave empty for no price. Prices are not shown in the shop until online checkout is built.` : 'Prices can be set once GPEC confirms the shop currency.'}>
      <input id="product-price" name="price" inputMode="decimal" disabled={!currency} defaultValue={currency ? minorUnitsToInput(product?.price ?? null, currency) : ''} aria-describedby={describedBy('price', errors, true)} />
    </Field>
    <Field name="status" errors={errors}>
      <select id="product-status" name="status" defaultValue={product?.status ?? 'active'} aria-describedby={describedBy('status', errors, false)}>
        {Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </Field>
    <Field name="sortOrder" errors={errors} hint={isNew ? 'Lower numbers appear first in the shop. Leave empty to add it at the end.' : 'Lower numbers appear first in the shop.'}>
      <input id="product-sortOrder" name="sortOrder" type="number" step={1} required={!isNew} defaultValue={product?.sortOrder} aria-describedby={describedBy('sortOrder', errors, true)} />
    </Field>
    <div className="admin-field admin-checkbox">
      <label><input name="isPlaceholder" type="checkbox" defaultChecked={product?.isPlaceholder ?? false} /> {productFieldLabels.isPlaceholder}: details are not yet supplied or approved by GPEC. The shop labels these “Sample listing”.</label>
      {errors.isPlaceholder && <small className="admin-field-error">{errors.isPlaceholder}</small>}
    </div>
    <button className="button button-primary" type="submit" disabled={isSaving || isUploading}>{isSaving ? 'Saving…' : isUploading ? 'Uploading photo…' : <>{isNew ? 'Create product' : 'Save changes'} <Arrow /></>}</button>
  </form>
}
