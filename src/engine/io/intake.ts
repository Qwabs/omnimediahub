/*
 * File intake: drop → File[]. Understands folders (via webkitGetAsEntry)
 * and expands ZIP archives with fflate.
 */
import { unzipSync } from 'fflate'
import { MEDIA_EXTENSIONS, extensionOf } from '@/engine/ops'

type FsEntry = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (callback: (file: File) => void, error?: (err: unknown) => void) => void
  createReader?: () => {
    readEntries: (callback: (entries: FsEntry[]) => void, error?: (err: unknown) => void) => void
  }
}

const readFile = (entry: FsEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file?.(resolve, reject))

const readDirectory = (entry: FsEntry): Promise<FsEntry[]> =>
  new Promise((resolve, reject) => {
    const reader = entry.createReader?.()
    if (!reader) return resolve([])
    const all: FsEntry[] = []
    const step = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) return resolve(all)
        all.push(...entries)
        step()
      }, reject)
    }
    step()
  })

async function walk(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry)
    if (file.size > 0) out.push(file)
    return
  }
  if (entry.isDirectory) {
    const children = await readDirectory(entry)
    for (const child of children) await walk(child, out)
  }
}

/** Collect files from a drop event, following folders. */
export async function collectFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? [])
  const entries: FsEntry[] = []

  for (const item of items) {
    if (item.kind !== 'file') continue
    const getEntry = (item as unknown as { webkitGetAsEntry?: () => FsEntry | null })
      .webkitGetAsEntry
    const entry = getEntry ? getEntry.call(item) : null
    if (entry) entries.push(entry)
  }

  if (entries.length === 0) return Array.from(dataTransfer.files ?? [])

  const out: File[] = []
  for (const entry of entries) await walk(entry, out)
  return out
}

export const isArchive = (file: File): boolean =>
  file.type === 'application/zip' || extensionOf(file.name) === 'zip'

/** Expand any ZIPs, keeping media entries only. */
export async function expandArchives(files: File[], limit = 2000): Promise<File[]> {
  const out: File[] = []
  for (const file of files) {
    if (!isArchive(file)) {
      out.push(file)
      continue
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const entries = unzipSync(bytes)
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/') || path.startsWith('__MACOSX/')) continue
        const name = path.split('/').pop() ?? path
        if (!MEDIA_EXTENSIONS.has(extensionOf(name))) continue
        out.push(new File([data as BlobPart], name))
        if (out.length >= limit) return out
      }
    } catch {
      // Not a readable archive — pass it through so the engine can explain.
      out.push(file)
    }
  }
  return out
}
