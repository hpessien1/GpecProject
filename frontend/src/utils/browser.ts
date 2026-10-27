// A browser's self-description (its User-Agent) in plain words, such as "Chrome on Android", for the
// security log. Only a guess from what the browser says about itself; the full text is kept too.
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/curl\/|Wget\/|python-requests|node-fetch|axios\//i, 'a script, not a browser'],
]

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iPhone or iPad'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

export function describeBrowser(userAgent: string) {
  if (!userAgent) return 'Unknown browser'
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  if (!browser) return system ? `Unknown browser on ${system}` : 'Unknown browser'
  return system && !browser.startsWith('a script') ? `${browser} on ${system}` : browser
}
