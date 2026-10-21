import { useEffect, useRef, useState } from 'react'
import AdminProductForm from './AdminProductForm'
import type { ProductFormValues } from './AdminProductForm'
import AdminProductHistory from './AdminProductHistory'
import { ApiError } from '../../services/apiClient'
import { createProduct, getAdminProduct, updateProduct } from '../../services/adminApi'
import type { AdminProduct, CurrencyInfo, EditableProductFields } from '../../types'

interface AdminProductEditorProps {
  // undefined: creating a new product.
  productId?: string
  currency: CurrencyInfo | null
  // Shown once after arriving here, e.g. "Product created."
  flash: string
  onCreated: (productId: string) => void
  onSessionEnded: () => void
}

// Only the fields that differ are sent, so the change history lists exactly what the admin changed.
function changedFields(product: AdminProduct, values: ProductFormValues) {
  const changes: Partial<EditableProductFields> = {}
  const fields = ['name', 'reference', 'description', 'specs', 'image', 'alt', 'price', 'isPlaceholder', 'status', 'sortOrder'] as const
  for (const field of fields) {
    if (JSON.stringify(values[field]) !== JSON.stringify(product[field])) Object.assign(changes, { [field]: values[field] })
  }
  return changes
}

export default function AdminProductEditor({ productId, currency, flash, onCreated, onSessionEnded }: AdminProductEditorProps) {
  const [product, setProduct] = useState<AdminProduct | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(flash ? { kind: 'success', message: flash } : null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  // Changes after each save, so the form and history show the saved values.
  const [savedVersion, setSavedVersion] = useState(0)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const isNew = productId === undefined

  useEffect(() => {
    if (isNew) return
    let isCurrent = true
    getAdminProduct(productId)
      .then((loaded) => { if (isCurrent) setProduct(loaded) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the product.')
      })
    return () => { isCurrent = false }
  }, [isNew, productId, onSessionEnded])

  // The save button is disabled while saving, which drops keyboard focus; move it to the result.
  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(values: ProductFormValues) {
    setResult(null)
    setServerErrors({})
    let changes: Partial<EditableProductFields> = {}
    if (product) {
      changes = changedFields(product, values)
      if (Object.keys(changes).length === 0) {
        setResult({ kind: 'success', message: 'No changes to save.' })
        return
      }
    }
    setIsSaving(true)
    try {
      if (product) {
        setProduct(await updateProduct(product.id, changes))
        setSavedVersion((version) => version + 1)
        setResult({ kind: 'success', message: 'Changes saved.' })
      } else {
        const created = await createProduct(values)
        onCreated(created.id)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setServerErrors(error.errors)
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the product.' })
    } finally {
      setIsSaving(false)
    }
  }

  const title = isNew ? 'Add product' : product?.name ?? 'Edit product'
  return <section aria-labelledby="admin-editor-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {isNew ? 'New product' : product?.reference ?? 'Product'}</p><h1 id="admin-editor-title" tabIndex={-1}>{title}</h1></div>
      <a className="text-link" href="#admin">Back to products</a>
    </div>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !isNew && !product ? <p className="admin-loading" role="status">Loading product…</p>
      : <div className="admin-editor-layout">
        <AdminProductForm key={`form-${savedVersion}`} product={product} currency={currency} isSaving={isSaving} serverErrors={serverErrors} onSubmit={handleSubmit} />
        {product && <AdminProductHistory key={`history-${savedVersion}`} productId={product.id} currency={currency} onSessionEnded={onSessionEnded} />}
      </div>}
  </section>
}
