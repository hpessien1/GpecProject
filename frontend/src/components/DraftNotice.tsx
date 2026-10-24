import { draftNotice } from '../data/siteContentCopy'

// Shown on a staff-edited page until an admin marks its wording approved (admin, Site content).
export default function DraftNotice() {
  return <p className="content-draft" role="note">{draftNotice}</p>
}
