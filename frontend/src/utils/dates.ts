// "21 Oct 2026, 11:32" in the visitor's own time zone. The server stores times in UTC.
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDateTime(isoDate: string) {
  return dateTimeFormat.format(new Date(isoDate))
}

// "14 Oct 2026". Dates without a time are read as UTC so the day never shifts.
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' })

export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(isoDate))
}
