import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { productFieldLabels } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { uploadProductImage } from '../../services/adminApi'
import { productImageUrl } from '../../services/productApi'

// Same limits as the server (backend/src/services/productImages.ts), which checks again.
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

interface ProductImageFieldProps {
  initialImage: string
  // Off until the server's photo storage is set up; then a site image path is typed instead.
  uploadsEnabled: boolean
  error?: string
  onUploadingChange: (isUploading: boolean) => void
  onSessionEnded: () => void
}

type UploadState = { kind: 'idle' } | { kind: 'uploading' } | { kind: 'uploaded' } | { kind: 'error', message: string }

function checkFile(file: File) {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return 'This photo is in HEIC format, which the site cannot use. Choose a JPEG or PNG version: on an iPhone, set Settings › Camera › Formats to “Most Compatible”, or share the photo as JPEG.'
  if (!UPLOAD_TYPES.includes(file.type)) return 'Choose a JPEG, PNG, or WebP photo.'
  if (file.size > MAX_UPLOAD_BYTES) return `This photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Choose one under 10 MB.`
  return ''
}

// The product photo, with a preview of what the shop will show. With uploads on, staff choose a photo
// from the device they are using (laptop file picker, or the photo library or camera on a phone);
// the preview shows it the moment it is chosen, then the resized version the server saved. The
// product changes only when the form is saved.
export default function ProductImageField({ initialImage, uploadsEnabled, error, onUploadingChange, onSessionEnded }: ProductImageFieldProps) {
  const [image, setImage] = useState(initialImage)
  // With uploads off, the typed path is previewed when the admin leaves the box, not on every key.
  const [typedPreview, setTypedPreview] = useState(initialImage)
  // The chosen file, shown straight away while it uploads (a blob: address on this device only).
  const [localPreview, setLocalPreview] = useState('')
  const [upload, setUpload] = useState<UploadState>({ kind: 'idle' })
  // The preview address that failed to load, if any. Tied to the address, so a broken preview (a
  // file that is not really a photo) cannot hide the next one.
  const [failedSrc, setFailedSrc] = useState('')

  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared, so choosing the same file again after an error still triggers a change.
    event.target.value = ''
    if (!file) return
    const problem = checkFile(file)
    if (problem) {
      setUpload({ kind: 'error', message: problem })
      return
    }
    setLocalPreview(URL.createObjectURL(file))
    setUpload({ kind: 'uploading' })
    onUploadingChange(true)
    try {
      setImage(await uploadProductImage(file))
      setLocalPreview('')
      setUpload({ kind: 'uploaded' })
    } catch (uploadError) {
      setLocalPreview('')
      if (uploadError instanceof ApiError && uploadError.status === 401) return onSessionEnded()
      const message = uploadError instanceof ApiError && uploadError.code === 'PAYLOAD_TOO_LARGE' ? 'This photo is too large. Choose one under 10 MB.'
        : uploadError instanceof Error ? uploadError.message : 'Unable to upload the photo.'
      setUpload({ kind: 'error', message })
    } finally {
      onUploadingChange(false)
    }
  }

  const shown = uploadsEnabled ? image : typedPreview
  const previewSrc = localPreview || (shown ? productImageUrl(shown) : '')
  const previewFailed = previewSrc !== '' && failedSrc === previewSrc
  const caption = upload.kind === 'uploading' ? 'Uploading your photo…'
    : upload.kind === 'uploaded' ? 'New photo, as the shop will show it. Save the product to use it.'
    : previewFailed ? 'No image found at this address.'
    : shown ? 'Current photo.' : 'No photo yet.'
  const describedBy = ['product-image-hint', error && 'product-image-error', upload.kind === 'error' && 'product-image-upload-error'].filter(Boolean).join(' ')

  return <div className="admin-field admin-image-field">
    <label htmlFor="product-image">{productFieldLabels.image}</label>
    <figure className="admin-image-preview" aria-busy={upload.kind === 'uploading'}>
      {previewSrc && !previewFailed ? <img src={previewSrc} alt="" onError={() => setFailedSrc(previewSrc)} />
        : <div className="admin-image-empty" aria-hidden="true">No photo</div>}
      <figcaption role="status">{caption}</figcaption>
    </figure>
    {uploadsEnabled ? <>
      <input id="product-image" type="file" accept={UPLOAD_TYPES.join(',')} disabled={upload.kind === 'uploading'} onChange={handleFileChange} aria-describedby={describedBy} />
      <input type="hidden" name="image" value={image} />
      <small id="product-image-hint">From this laptop, phone, or tablet: JPEG, PNG, or WebP, up to 10 MB. Large photos are resized for the shop, and camera details such as location are removed.</small>
    </> : <>
      <input id="product-image" name="image" required maxLength={300} value={image} onChange={(event) => setImage(event.target.value)} onBlur={() => setTypedPreview(image.trim())} aria-describedby={describedBy} />
      <small id="product-image-hint">A file already on the site, e.g. /assets/electrical-panels-product.png. Photo uploads are switched on once GPEC’s image storage is set up.</small>
    </>}
    {upload.kind === 'error' && <small className="admin-field-error" id="product-image-upload-error" role="alert">{upload.message}</small>}
    {error && <small className="admin-field-error" id="product-image-error">{error}</small>}
  </div>
}
