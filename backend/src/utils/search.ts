// A case-insensitive pattern that matches the search text literally, so characters such as "." or
// "(" mean themselves. Used by the admin list searches.
export function literalPattern(text: string) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

// A MongoDB filter matching the text in any of the fields, or everything when the text is empty.
export function searchFilter(text: string, fields: string[]) {
  return text ? { $or: fields.map((field) => ({ [field]: literalPattern(text) })) } : {}
}
