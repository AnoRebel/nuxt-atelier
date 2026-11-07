// The auth adapter: how the CMS finds out who's asking, signs people in and out, and manages users.
// Swapping it (built-in, Better Auth, your own) leaves roles and permissions (`can()`) unchanged.
import type { RequestEvent } from 'nuxt/server'

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  /** A role name from the CMS roles, or `admin`. */
  role: string
}

export interface NewUser {
  email: string
  name?: string | null
  role: string
  /** Omit for users who sign in another way (OAuth). */
  password?: string
}

export interface AuthAdapter {
  /** Shown in errors and the admin. */
  name: string
  /** The signed-in user for this request, or null. */
  getUser: (event: RequestEvent) => Promise<AuthUser | null>
  /** Signs in with email and password, starting a session. Throws a 401 error for bad credentials. */
  signIn: (event: RequestEvent, credentials: { email: string, password: string }) => Promise<AuthUser>
  /** Ends this request's session; it can't be used again. */
  signOut: (event: RequestEvent) => Promise<void>
  users: {
    list: () => Promise<AuthUser[]>
    get: (id: string) => Promise<AuthUser | null>
    create: (user: NewUser) => Promise<AuthUser>
    update: (id: string, changes: Partial<NewUser>) => Promise<AuthUser>
    delete: (id: string) => Promise<void>
  }
  /** Sign-in options besides the password form, for the login screen. */
  oauthProviders?: () => { id: string, name: string, url: string }[]
}

/** Returns the adapter, after checking it has every required operation. */
export function defineAuthAdapter<T extends AuthAdapter>(adapter: T): T {
  const missing = [
    ...(['getUser', 'signIn', 'signOut'] as const).filter(op => typeof adapter[op] !== 'function'),
    ...(['list', 'get', 'create', 'update', 'delete'] as const).filter(op => typeof adapter.users?.[op] !== 'function').map(op => `users.${op}`),
  ]
  if (missing.length)
    throw new Error(`[nuxt-atelier] Auth adapter "${adapter.name}" is missing: ${missing.join(', ')}`)
  return adapter
}
