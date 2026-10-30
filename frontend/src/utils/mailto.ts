// A mailto: link to one address with the site's own subject. Both sides of the @ are encoded, so `?`,
// `&`, `%`, or `#` in a customer's address (the server refuses them since audit S4-L01, but older
// requests and orders may hold them) stay part of the address instead of adding recipients or fields.
export function mailtoLink(address: string, subject: string) {
  const at = address.lastIndexOf('@')
  const recipient = at < 0 ? encodeURIComponent(address) : `${encodeURIComponent(address.slice(0, at))}@${encodeURIComponent(address.slice(at + 1))}`
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}`
}
