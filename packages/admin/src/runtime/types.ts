// What the admin reads from the CMS API (see nuxt-atelier's api/schema.ts and the collection endpoints).
import type { Field, Fields } from '#atelier/shared/fields'

export type { Field, Fields }
export type ContentAction = 'create' | 'read' | 'update' | 'delete' | 'publish'
export type Capability = 'users' | 'roles' | 'settings' | 'media' | 'redirects'

interface ContentType {
  name: string
  fields: Fields
  /** Fields the user may read but not change. */
  readOnly: string[]
  can: Record<ContentAction, boolean>
  /** Of the allowed actions, those limited to the user's own entries. */
  ownOnly: ContentAction[]
  routable: boolean
  localized: boolean
  versioned: boolean
  admin?: { icon?: string, group?: string, columns?: string[] }
}
export interface CollectionType extends ContentType { labels?: { singular?: string, plural?: string } }
export interface SingletonType extends ContentType { label?: string }

export interface AdminSchema {
  user: { id: string, role: string }
  capabilities: Capability[]
  locales: { codes: string[], default: string, fallback: Record<string, string[]> }
  collections: CollectionType[]
  singletons: SingletonType[]
  blocks: Record<string, { name: string, label?: string, fields: Fields, options: Fields }>
}

export interface AdminUser { id: string, email: string, name?: string | null, role: string }

export interface Entry {
  id: string
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  path?: string | null
  publishedVersion: number | null
  locale?: string
  translations?: Record<string, string>
  data: Record<string, unknown>
}
export interface EntryList { items: Entry[], total: number, next: string | null }

/** An API error, as the CMS answers it: a status, a message, a stable `code` and details. */
export interface AdminApiError {
  status: number
  message: string
  code?: string
  /** Validation errors by field path. */
  errors?: { path: string, message: string }[]
  /** Fields the user isn't allowed to change. */
  fields?: string[]
}
