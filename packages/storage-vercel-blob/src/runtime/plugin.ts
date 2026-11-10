import { registerStorageDriver } from '#atelier/server'
import { useRuntimeConfig } from 'nuxt/server'
import { createVercelBlobDriver } from './driver'

export default () => {
  registerStorageDriver(() => {
    const token = (useRuntimeConfig().atelierVercelBlob as { token: string }).token || process.env.BLOB_READ_WRITE_TOKEN
    if (!token)
      throw new Error('[@nuxt-atelier/storage-vercel-blob] Connect a Blob store to the project (it sets BLOB_READ_WRITE_TOKEN), or set NUXT_ATELIER_VERCEL_BLOB_TOKEN')
    return createVercelBlobDriver({ token })
  })
}
