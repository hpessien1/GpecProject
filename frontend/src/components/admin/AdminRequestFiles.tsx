import { requestFileUrl } from '../../services/adminApi'
import { formatFileSize } from '../../utils/fileSize'
import type { AdminRequestKind, RequestAttachment } from '../../types'

interface AdminRequestFilesProps {
  kind: AdminRequestKind
  reference: string
  files: RequestAttachment[]
}

// Photos and PDFs the customer attached. Photos show as thumbnails that open full size in a new tab;
// PDFs always download (the API sends them that way), so nothing a customer sent runs inside the site.
export default function AdminRequestFiles({ kind, reference, files }: AdminRequestFilesProps) {
  if (files.length === 0) return null
  return <section className="admin-request-files" aria-labelledby="admin-request-files-title">
    <h2 id="admin-request-files-title">Attached files ({files.length})</h2>
    <ul>
      {files.map((file) => {
        const url = requestFileUrl(kind, reference, file.id)
        const size = formatFileSize(file.size)
        return <li key={file.id}>
          {file.contentType === 'application/pdf'
            ? <a className="admin-request-file" href={url} download={file.name}><span className="admin-request-file-icon" aria-hidden="true">PDF</span><span className="admin-request-file-name">{file.name}</span><small>{size} · download</small></a>
            : <a className="admin-request-file" href={url} target="_blank" rel="noopener"><img src={url} alt="" loading="lazy" /><span className="admin-request-file-name">{file.name}</span><small>{size} · opens in a new tab</small></a>}
        </li>
      })}
    </ul>
  </section>
}
