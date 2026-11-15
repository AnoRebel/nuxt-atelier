// Authorization: one `can()` for the API, the admin and the editor. Roles are plain data, so they can
// live in config or in the database. Collections and singletons share one namespace of names.

export type ContentAction = 'create' | 'read' | 'update' | 'delete' | 'publish' | 'comment'
/** Admin areas a role can manage. */
export type Capability = 'users' | 'roles' | 'settings' | 'media' | 'redirects' | 'forms' | 'ai'

export interface ContentPermission {
  actions: readonly ContentAction[]
  /** Of `actions`, those allowed only on entries the user created (`read`, `update`, `delete`, `publish`). */
  ownOnly?: readonly ContentAction[]
  /** Top-level fields this role can neither read nor write. */
  hidden?: readonly string[]
  /** Top-level fields this role can read but not write. */
  readOnly?: readonly string[]
}

export interface Role {
  /** Shown in the admin. */
  label?: string
  /** Admin areas this role manages. */
  capabilities?: readonly Capability[]
  /**
   * Permissions per collection or singleton name. `'*'` applies to every one without its own entry;
   * an entry replaces it, it isn't merged.
   */
  content?: Readonly<Record<string, ContentPermission>>
}

/** The built-in role that can do everything. It can't be redefined, and the last one can't be removed. */
export const ADMIN_ROLE = 'admin'

/**
 * The role of visitors who aren't signed in: on the content API they may only read, and only what's
 * published. By default they read everything; define a role with this name to narrow it.
 */
export const PUBLIC_ROLE = 'public'
export const DEFAULT_PUBLIC_ROLE: Role = { label: 'Visitors', content: { '*': { actions: ['read'] } } }

/** What `can()` needs to know about a user. */
export interface PolicyUser { id: string, role: string }

/** What `can()` needs to know about an entry: who created it. */
export interface PolicyEntry { createdBy?: string | null }

export type Roles = Readonly<Record<string, Role>>

export interface FieldAccess {
  hidden: ReadonlySet<string>
  readOnly: ReadonlySet<string>
}

/** JSON with object keys sorted: equal values give equal strings whatever the key order (Postgres JSONB reorders). */
const canonical = (value: unknown) => JSON.stringify(value ?? null, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).toSorted(([a], [b]) => a < b ? -1 : 1)) : x)

const NO_FIELDS: FieldAccess = { hidden: new Set(), readOnly: new Set() }
const CAPABILITIES = new Set<string>(['users', 'roles', 'settings', 'media', 'redirects', 'forms', 'ai'] satisfies Capability[])

/** The permission checks for a set of roles: `can(user, action, type)`, field access, capabilities. The API, the admin and the visual editor all ask it. */
export function createPolicy(roles: Roles) {
  if (ADMIN_ROLE in roles)
    throw new Error(`[nuxt-atelier] The "${ADMIN_ROLE}" role is built in and can do everything; it can't be redefined`)

  const permission = (user: PolicyUser, resource: string): ContentPermission | undefined => {
    const content = roles[user.role]?.content
    return content?.[resource] ?? content?.['*']
  }

  /**
   * Whether `user` may do `action` on `resource`: a collection or singleton name for content
   * actions, a capability for `'manage'`. With an own-only action and no `entry`, it answers whether
   * the user may do it on some entries (to show the action); pass the entry to decide for that one.
   */
  function can(user: PolicyUser | null | undefined, action: ContentAction, resource: string, entry?: PolicyEntry): boolean
  function can(user: PolicyUser | null | undefined, action: 'manage', capability: Capability): boolean
  function can(user: PolicyUser | null | undefined, action: ContentAction | 'manage', resource: string, entry?: PolicyEntry): boolean {
    if (!user)
      return false
    if (user.role === ADMIN_ROLE)
      return true
    if (action === 'manage')
      return CAPABILITIES.has(resource) && (roles[user.role]?.capabilities?.includes(resource as Capability) ?? false)
    const rule = permission(user, resource)
    if (!rule?.actions.includes(action))
      return false
    if (entry === undefined || action === 'create' || !rule.ownOnly?.includes(action))
      return true
    return entry.createdBy != null && entry.createdBy === user.id
  }

  return {
    can,

    /** Whether `action` is limited to the user's own entries: lists filter by creator when it is. */
    ownOnly(user: PolicyUser, action: ContentAction, resource: string): boolean {
      return user.role !== ADMIN_ROLE && (permission(user, resource)?.ownOnly?.includes(action) ?? false)
    },

    /** The fields the user can't read (`hidden`) or can only read (`readOnly`). */
    fields(user: PolicyUser, resource: string): FieldAccess {
      const rule = user.role === ADMIN_ROLE ? undefined : permission(user, resource)
      return rule ? { hidden: new Set(rule.hidden), readOnly: new Set(rule.readOnly) } : NO_FIELDS
    },

    /** Entry data without the fields the user can't read. */
    readable<T extends Record<string, unknown>>(user: PolicyUser, resource: string, data: T): Partial<T> {
      const { hidden } = this.fields(user, resource)
      return Object.fromEntries(Object.entries(data).filter(([key]) => !hidden.has(key))) as Partial<T>
    },

    /**
     * Fields a write would change that the user can't write. `before` is the stored data, or
     * undefined when creating; a field sent unchanged is fine.
     */
    unwritable(user: PolicyUser, resource: string, data: Record<string, unknown>, before?: Record<string, unknown>): string[] {
      const { hidden, readOnly } = this.fields(user, resource)
      return Object.keys(data).filter(key => (hidden.has(key) || readOnly.has(key))
        && canonical(data[key]) !== canonical(before?.[key]))
    },
  }
}

export type Policy = ReturnType<typeof createPolicy>
