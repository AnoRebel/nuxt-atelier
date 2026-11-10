import type { S3Options } from './driver'
import { registerStorageDriver } from '#atelier/server'
import { useRuntimeConfig } from 'nuxt/server'
import { createS3Driver } from './driver'

export default () => {
  registerStorageDriver(() => {
    const options = useRuntimeConfig().atelierS3 as S3Options
    const missing = (['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const).filter(key => !options[key])
    if (missing.length)
      throw new Error(`[@nuxt-atelier/storage-s3] Set ${missing.map(key => `NUXT_ATELIER_S3_${key.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()}`).join(', ')}`)
    return createS3Driver(options)
  })
}
