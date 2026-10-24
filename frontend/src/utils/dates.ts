// "21 Oct 2026, 11:32" in the visitor's own time zone. The server stores times in UTC.
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDateTime(isoDate: string) {
  return dateTimeFormat.format(new Date(isoDate))
}

// "24 Oct 2026" on GPEC's own calendar (Nigeria), so a page's date is the same for every visitor.
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Lagos' })

export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(isoDate))
}
