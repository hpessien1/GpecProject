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

// A day as a date box holds it ("2026-10-21"), on the visitor's own calendar, as formatDateTime shows.
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// The moment a date box's day starts on the visitor's own calendar, or a number of days later.
export function startOfLocalDay(day: string, addDays = 0) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date + addDays)
}
