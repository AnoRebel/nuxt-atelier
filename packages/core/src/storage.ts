// `nuxt-atelier/storage`: the media storage driver contract, for writing a driver (see @nuxt-atelier/storage-s3)
export { createLocalDriver, storageKey } from './runtime/server/media/storage'
export type { StorageDriver, StoredFile } from './runtime/server/media/storage'
