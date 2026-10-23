// "Showing 11–12 of 12 orders" above a paged list: the shop's catalogue and the admin lists.
export function showingRange(page: number, pageSize: number, shownCount: number, total: number, noun: { one: string, many: string }) {
  const first = (page - 1) * pageSize + 1
  return `Showing ${first}–${first + shownCount - 1} of ${total} ${total === 1 ? noun.one : noun.many}`
}
