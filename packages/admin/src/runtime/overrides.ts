// Overrides by name: a component AtelierAdmin<Name> registered by the app or a layer (a file
// app/atelier-admin/<Name>.vue, see module.ts) replaces the kit's <Name>: a view (Home, CollectionList,
// EntryEdit, Users, Roles, RoleEdit, SignIn, Setup, NotFound, Brand) or a field input (FieldText,
// FieldDate, FieldRelation…, after the field's type).
import type { Component } from 'vue'
import { getCurrentInstance } from 'vue'

/** The app's override of `name`, else `fallback`. Call in setup. */
export function useOverrides() {
  const components = getCurrentInstance()?.appContext.components ?? {}
  return <T extends Component | undefined>(name: string, fallback?: T): Component | T => components[`AtelierAdmin${name}`] ?? fallback as T
}

/** `multiSelect` → `MultiSelect`, `geo-point` → `GeoPoint` */
export const pascal = (name: string) => name.replace(/(?:^|[-_])(\w)/g, (_, c: string) => c.toUpperCase()).replace(/^\w/, c => c.toUpperCase())
