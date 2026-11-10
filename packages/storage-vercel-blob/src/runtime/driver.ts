// Media in Vercel Blob. Every file is stored private and served by Nuxt Atelier's own handler, so a private
// item can't be fetched past it from a public blob URL. Large files go up as multipart uploads.
import type { StorageDriver } from 'nuxt-atelier/storage'
import * as blob from '@vercel/blob'

export interface VercelBlobOptions {
  /** The store's read-write token (BLOB_READ_WRITE_TOKEN). */
  token: string
}

/** The SDK functions the driver uses: the real ones, or a stand-in in tests. */
export type BlobSdk = Pick<typeof blob, 'put' | 'get' | 'head' | 'del' | 'BlobNotFoundError'>

export function createVercelBlobDriver(options: VercelBlobOptions, sdk: BlobSdk = blob): StorageDriver {
  const { token } = options
  const { put, get, head, del } = sdk
  const missing = (error: unknown) => error instanceof sdk.BlobNotFoundError
  return {
    name: 'vercel-blob',
    async put(key, body, info) {
      await put(key, body, { access: 'private', token, contentType: info.contentType, addRandomSuffix: false, allowOverwrite: true, multipart: true })
    },
    async get(key) {
      try {
        const result = await get(key, { access: 'private', token })
        if (!result || result.statusCode !== 200)
          return undefined
        return { stream: result.stream, size: result.blob.size }
      }
      catch (error) {
        if (missing(error))
          return undefined
        throw error
      }
    },
    async head(key) {
      try {
        return { size: (await head(key, { token })).size }
      }
      catch (error) {
        if (missing(error))
          return undefined
        throw error
      }
    },
    async delete(key) {
      await del(key, { token })
    },
  }
}
