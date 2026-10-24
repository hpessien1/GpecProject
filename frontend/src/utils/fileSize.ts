// A file's size as people read it: "820 kB", "2.4 MB" (1 kB = 1,024 bytes, as file managers show it).
export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
