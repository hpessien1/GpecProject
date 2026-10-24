// "21 Oct 2026, 11:32" in the visitor's own time zone. The server stores times in UTC.
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDateTime(isoDate: string) {
  return dateTimeFormat.format(new Date(isoDate))
}
