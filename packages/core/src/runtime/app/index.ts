// `#atelier`: the app-side public API
export { useAtelierConfig } from './composables/useAtelierConfig'
export * from '../shared/fields'
export type { AtelierCollections, AtelierSingletons, BlockInstance, CollectionEntry, FieldValue, InferEntry, JsonValue, RichTextDocument, SingletonEntry } from '../shared/infer'
export { ADMIN_ROLE, createPolicy } from '../shared/policy'
export type { Capability, ContentAction, ContentPermission, FieldAccess, Policy, PolicyEntry, PolicyUser, Role, Roles } from '../shared/policy'
