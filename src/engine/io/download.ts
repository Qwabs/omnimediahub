/*
 * Output: single-file downloads and streaming ZIP bundles.
 */
import { downloadZip } from 'client-zip'

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser a beat to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Stream a ZIP of all results (never materialises the archive twice). */
export async function downloadZipOf(
  items: { name: string; blob: Blob }[],
  zipName: string,
): Promise<void> {
  if (items.length === 0) return
  const response = downloadZip(
    items.map((item) => ({ name: item.name, input: item.blob, lastModified: new Date() })),
  )
  const blob = await response.blob()
  downloadBlob(blob, zipName)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit]}`
}

export function sizeDelta(from: number, to: number): string {
  if (from <= 0) return formatBytes(to)
  const change = Math.round(((to - from) / from) * 100)
  const sign = change > 0 ? '+' : ''
  return `${formatBytes(from)} → ${formatBytes(to)} (${sign}${change}%)`
}
