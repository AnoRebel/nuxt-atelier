// The Better Auth auth adapter: Better Auth on the CMS database (its Drizzle adapter), with CMS roles
// kept on its user (`role`). A Better Auth user without a role can sign in but isn't a CMS user.
import type { AuthAdapter, AuthUser, NewUser } from '#atelier/server'
import type { AtelierBetterAuthConfig } from '../../config'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getSchema } from 'better-auth/db'
import { createError, deriveSecret, useRuntimeConfig } from 'nuxt/server'
import { useAtelierDatabase, useAtelierTables } from '#atelier/server'
import { tableOf, withAtelierModels } from '../../config'

interface BetterAuthUser { id: string, email: string, name: string, role?: string | null }

const PROVIDERS = { sqlite: 'sqlite', postgres: 'pg', mysql: 'mysql' } as const

async function create(config: AtelierBetterAuthConfig) {
  const driver = await useAtelierDatabase()
  const tables = await useAtelierTables()
  const options = withAtelierModels(config.betterAuth)
  const schema = Object.fromEntries(Object.keys(getSchema(options)).map(model => [model, tables[tableOf(model)]]))
  const missing = Object.entries(schema).filter(([, table]) => !table).map(([model]) => tableOf(model))
  if (missing.length)
    throw new Error(`[nuxt-atelier] Better Auth's tables aren't in the schema: ${missing.join(', ')}. Export them from server/atelier/tables.ts: \`export default defineTables(betterAuthTables(auth))\`.`)

  const siteUrl = (useRuntimeConfig().public as { atelier?: { siteUrl?: string } }).atelier?.siteUrl
  const userHook = options.databaseHooks?.user?.create?.before
  return betterAuth({
    ...options,
    secret: options.secret ?? await deriveSecret('nuxt-atelier:better-auth'),
    baseURL: options.baseURL ?? (siteUrl || undefined),
    basePath: '/api/auth',
    database: drizzleAdapter(driver.db, { provider: PROVIDERS[driver.dialect], schema, transaction: driver.capabilities.transactions }),
    databaseHooks: {
      ...options.databaseHooks,
      user: {
        ...options.databaseHooks?.user,
        create: {
          ...options.databaseHooks?.user?.create,
          async before(user, context) {
            const own = userHook ? await userHook(user, context) : undefined
            if (own === false)
              return false
            const data = { ...user, ...own?.data } as typeof user & { role?: string | null }
            // users the CMS creates already have a role; the others (sign-up, OAuth) get mapRole's
            return { data: { ...data, role: data.role ?? await config.mapRole?.(data) ?? null } }
          },
        },
      },
    },
  })
}

let instance: ReturnType<typeof create> | undefined

/** The Better Auth instance, created on first use. */
export function useBetterAuth(config: AtelierBetterAuthConfig) {
  instance ??= create(config).catch((error) => {
    instance = undefined
    throw error
  })
  return instance
}

const toUser = (user: BetterAuthUser): AuthUser => ({ id: user.id, email: user.email, name: user.name || null, role: user.role ?? '' })

export async function createBetterAuthAdapter(config: AtelierBetterAuthConfig): Promise<AuthAdapter> {
  const auth = await useBetterAuth(config)
  const context = await auth.$context
  const internal = context.internalAdapter
  const copyCookies = (event: { res: { headers: Headers } }, response: Response) => {
    for (const cookie of response.headers.getSetCookie())
      event.res.headers.append('set-cookie', cookie)
  }
  const setPassword = async (userId: string, password: string) => {
    const hash = await context.password.hash(password)
    const credential = (await internal.findAccounts(userId)).find(a => a.providerId === 'credential')
    if (credential)
      await internal.updatePassword(userId, hash)
    else
      await internal.linkAccount({ userId, providerId: 'credential', accountId: userId, password: hash })
  }
  const found = async (id: string) => {
    const user = await internal.findUserById(id) as BetterAuthUser | null
    if (!user)
      throw createError({ status: 404, message: `No user "${id}"` })
    return user
  }

  return {
    name: 'better-auth',

    async getUser(event) {
      const session = await auth.api.getSession({ headers: event.req.headers })
      const user = session?.user as BetterAuthUser | undefined
      return user?.role ? toUser(user) : null
    },

    async signIn(event, { email, password }) {
      const response = await auth.api.signInEmail({ body: { email, password }, headers: event.req.headers, asResponse: true })
      if (!response.ok)
        throw createError({ status: 401, message: 'Wrong email or password' })
      copyCookies(event, response)
      const { user } = await response.json() as { user: BetterAuthUser }
      if (!user.role)
        throw createError({ status: 403, message: 'You\'re signed in, but have no role in the CMS yet: ask an administrator' })
      return toUser(user)
    },

    async signOut(event) {
      copyCookies(event, await auth.api.signOut({ headers: event.req.headers, asResponse: true }))
    },

    users: {
      list: async () => ((await internal.listUsers()) as BetterAuthUser[]).map(toUser),
      get: async id => (await internal.findUserById(id).then(u => u && toUser(u as BetterAuthUser))) ?? null,

      async create(user: NewUser) {
        if (await internal.findUserByEmail(user.email.trim().toLowerCase()))
          throw createError({ status: 409, message: `A user with the email ${user.email} already exists` })
        const created = await internal.createUser({ email: user.email.trim().toLowerCase(), name: user.name ?? '', role: user.role, emailVerified: false }) as BetterAuthUser
        if (user.password !== undefined)
          await setPassword(created.id, user.password)
        return toUser(created)
      },

      async update(id, changes) {
        await found(id)
        const fields = Object.fromEntries(Object.entries({ email: changes.email?.trim().toLowerCase(), name: changes.name, role: changes.role }).filter(([, v]) => v !== undefined))
        const updated = Object.keys(fields).length ? await internal.updateUser(id, fields) as BetterAuthUser : await found(id)
        if (changes.password !== undefined) {
          await setPassword(id, changes.password)
          await internal.deleteUserSessions(id) // a reset signs out every session
        }
        return toUser(updated)
      },

      async delete(id) {
        await internal.deleteUserSessions(id)
        await internal.deleteUser(id)
      },
    },
  }
}
