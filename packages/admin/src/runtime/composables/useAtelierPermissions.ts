// What the signed-in user may do, from the schema the server sent (the server checks every request again).
import type { Capability, ContentAction } from '../types'
import { useAtelierAdminSchema } from './useAtelierAdminSchema'

export function useAtelierPermissions() {
  const { schema } = useAtelierAdminSchema()
  const type = (name: string) => schema.value?.collections.find(c => c.name === name) ?? schema.value?.singletons.find(s => s.name === name)
  return {
    /** Whether the user may do `action` on the collection or singleton `name` (on some entries, for own-only rules). */
    can: (action: ContentAction, name: string) => type(name)?.can[action] ?? false,
    /** Whether `action` is limited to the user's own entries. */
    ownOnly: (action: ContentAction, name: string) => type(name)?.ownOnly.includes(action) ?? false,
    /** Whether the user manages an admin area (users, roles, media…). */
    manages: (capability: Capability) => schema.value?.capabilities.includes(capability) ?? false,
    /** Whether the user may change `field` of `name` (not read-only for their role). */
    canWrite: (name: string, field: string) => !(type(name)?.readOnly.includes(field) ?? true),
  }
}
