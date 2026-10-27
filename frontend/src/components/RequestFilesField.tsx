import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { formatFileSize } from '../utils/fileSize'

// Same limits as the server (backend/src/services/requestFiles.ts), which checks again.
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

interface RequestFilesFieldProps {
  files: File[]
  onChange: (files: File[]) => void
  disabled: boolean
}

// Why a chosen file cannot be attached, or '' if it can.
function problemWith(file: File) {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return `“${file.name}” is in HEIC format. Choose a JPEG version: on an iPhone, set Settings › Camera › Formats to “Most Compatible”, or share the photo as JPEG.`
  if (!UPLOAD_TYPES.includes(file.type)) return `“${file.name}” is not a JPEG, PNG, or WebP photo or a PDF.`
  if (file.size > MAX_FILE_BYTES) return `“${file.name}” is ${formatFileSize(file.size)}. Each file must be 10 MB or smaller.`
  return ''
}

interface FilePreviewProps {
  file: File
}

// A small preview beside each file, so the customer can see they picked the right photo: the photo
// itself, read in the browser (nothing is sent until the form is), or a tile saying PDF. Decorative:
// the file's name is next to it. A photo the browser cannot show gets a plain tile instead.
function FilePreview({ file }: FilePreviewProps) {
  const isPhoto = file.type.startsWith('image/')
  const [failed, setFailed] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  // The browser's own address for the file, given to the image directly and released when the file
  // leaves the list, so its memory is freed.
  useEffect(() => {
    const image = imageRef.current
    if (!isPhoto || !image) return
    const address = URL.createObjectURL(file)
    image.src = address
    return () => URL.revokeObjectURL(address)
  }, [file, isPhoto, failed])
  if (!isPhoto) return <span className="quote-file-preview" aria-hidden="true">PDF</span>
  if (failed) return <span className="quote-file-preview" aria-hidden="true">Photo</span>
  return <img ref={imageRef} className="quote-file-preview" alt="" onError={() => setFailed(true)} />
}

// Choosing a file already in the list does not add it twice.
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size

// Optional photos or drawings for the contact form (a nameplate, a drawing, the site). Files can be
// added a few at a time and removed one by one, so the list here, not the browser's picker, is what
// will be sent. The picker itself is visually hidden behind its label, which looks like a button.
export default function RequestFilesField({ files, onChange, disabled }: RequestFilesFieldProps) {
  const [problems, setProblems] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])]
    // Cleared, so choosing the same file again after removing it still triggers a change.
    event.target.value = ''
    const found: string[] = []
    const next = [...files]
    let total = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of chosen) {
      const problem = problemWith(file)
      if (problem) found.push(problem)
      else if (next.some((kept) => sameFile(kept, file))) continue
      else if (next.length >= MAX_FILES) found.push(`“${file.name}” was not added: you can attach up to ${MAX_FILES} files.`)
      else if (total + file.size > MAX_TOTAL_BYTES) found.push(`“${file.name}” was not added: the files together must be 25 MB or smaller, and this would make ${formatFileSize(total + file.size)}.`)
      else {
        next.push(file)
        total += file.size
      }
    }
    setProblems(found)
    onChange(next)
  }

  function remove(index: number) {
    setProblems([])
    onChange(files.filter((_, i) => i !== index))
    inputRef.current?.focus()
  }

  return <div className="quote-files">
    <p className="quote-files-title">Photos or drawings <span>(optional)</span></p>
    <input ref={inputRef} id="contact-files" className="visually-hidden" type="file" multiple accept={UPLOAD_TYPES.join(',')} disabled={disabled} onChange={handleChange} aria-describedby={problems.length > 0 ? 'contact-files-hint contact-files-problems' : 'contact-files-hint'} />
    <label className="quote-files-button" htmlFor="contact-files">{files.length > 0 ? 'Add more files' : 'Attach photos or PDFs'}</label>
    <small id="contact-files-hint">Up to {MAX_FILES} files, each up to 10 MB and 25 MB together: JPEG, PNG, or WebP photos, or PDF documents, such as a nameplate, a drawing, or the site. Only GPEC staff can see them. Photos are re-saved without hidden details such as where they were taken.</small>
    {files.length > 0 && <ul className="quote-file-list" aria-label="Attached files">
      {files.map((file, index) => <li key={`${file.name}-${file.size}`}>
        <FilePreview file={file} />
        <span className="quote-file-name">{file.name}</span>
        <span className="quote-file-size">{formatFileSize(file.size)}</span>
        <button type="button" disabled={disabled} onClick={() => remove(index)} aria-label={`Remove ${file.name}`}>Remove</button>
      </li>)}
    </ul>}
    {problems.length > 0 && <div className="quote-files-problems" id="contact-files-problems" role="alert">{problems.map((problem) => <p key={problem}>{problem}</p>)}</div>}
  </div>
}
