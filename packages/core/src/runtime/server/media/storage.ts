// Where media files live: a driver behind one streaming interface (Web Streams), so files never have to
// fit in memory. The local driver writes under a directory (`.data/uploads` by default) that the app serves
// itself; nothing is linked into `public/`.
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

export interface StoredFile {
  stream: ReadableStream<Uint8Array>
  size: number
}

export interface StorageDriver {
  name: string
  /** Writes a file; resolves once all of it is stored. */
  put: (key: string, body: ReadableStream<Uint8Array>, info: { contentType: string }) => Promise<void>
  /** The file, or undefined when there's none. */
  get: (key: string) => Promise<StoredFile | undefined>
  /** Its size, or undefined when there's none. */
  head: (key: string) => Promise<{ size: number } | undefined>
  /** Removes it; nothing happens when it's already gone. */
  delete: (key: string) => Promise<void>
}

/** A storage key: `<id>/<file name>`, the name reduced to safe characters. */
export function storageKey(id: string, filename: string): string {
  const name = filename.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^[.-]+|-+$/g, '').slice(-120) || 'file'
  return `${id}/${name}`
}

/** Files on the server's disk, under `dir` (relative to the working directory). */
export function createLocalDriver(dir: string): StorageDriver {
  const root = resolve(dir)
  const path = (key: string) => {
    const file = resolve(root, key)
    if (!file.startsWith(root + sep) || key.includes('\0'))
      throw new Error(`Storage key "${key}" is outside the storage directory`)
    return file
  }
  return {
    name: 'local',
    async put(key, body) {
      const file = path(key)
      await mkdir(dirname(file), { recursive: true })
      const partial = `${file}.part`
      // opened first and closed before cleaning up, so a failed upload never leaves a file behind
      const handle = await open(partial, 'w')
      try {
        for await (const chunk of body as unknown as AsyncIterable<Uint8Array>)
          await handle.write(chunk)
        await handle.close()
        await rename(partial, file) // never a half-written file under its name
      }
      catch (error) {
        await handle.close().catch(() => {})
        await rm(partial, { force: true })
        await rmdir(dirname(file)).catch(() => {})
        throw error
      }
    },
    async get(key) {
      const file = path(key)
      const info = await stat(file).catch(() => undefined)
      if (!info?.isFile())
        return undefined
      return { stream: Readable.toWeb(createReadStream(file)) as unknown as ReadableStream<Uint8Array>, size: info.size }
    },
    async head(key) {
      const info = await stat(path(key)).catch(() => undefined)
      return info?.isFile() ? { size: info.size } : undefined
    },
    async delete(key) {
      const file = path(key)
      await rm(file, { force: true })
      await rmdir(dirname(file)).catch(() => {}) // the id's folder, when that left it empty
    },
  }
}
