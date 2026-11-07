// `@nuxt-atelier/auth-better-auth/config`: the Better Auth setup and its tables. No Nuxt imports, so the
// `atelier` CLI can load it to write migrations.
import type { BetterAuthOptions } from 'better-auth'
import type { TableSpec } from 'nuxt-atelier'
import { getSchema } from 'better-auth/db'

export interface AtelierBetterAuthConfig {
  /**
   * Better Auth options: providers, plugins (two-factor, passkeys, generic OAuth…). Nuxt Atelier sets
   * the database (the CMS's), the base path (`/api/auth`) and the table names; `secret` defaults to one
   * derived from `NUXT_APP_SECRET`, and `baseURL` to the public site URL.
   */
  betterAuth?: Omit<BetterAuthOptions, 'database' | 'basePath'>
  /**
   * The CMS role a new user gets, e.g. from their email domain. `null` (the default): none, so they can
   * sign in but reach nothing in the CMS until an administrator gives them a role.
   */
  mapRole?: (user: { email: string, name: string, emailVerified: boolean }) => string | null | Promise<string | null>
}

/** Returns the config, typed. Default-export it from `server/atelier/auth.ts`. */
export const defineAtelierBetterAuth = (config: AtelierBetterAuthConfig): AtelierBetterAuthConfig => config

const MODELS = {
  user: 'atelier_ba_users',
  session: 'atelier_ba_sessions',
  account: 'atelier_ba_accounts',
  verification: 'atelier_ba_verifications',
} as const

/** The Better Auth options with Atelier's table names, email and password sign-in, and the CMS role field. */
export function withAtelierModels(options: AtelierBetterAuthConfig['betterAuth'] = {}): BetterAuthOptions {
  return {
    ...options,
    emailAndPassword: { enabled: true, ...options.emailAndPassword },
    user: {
      ...options.user,
      modelName: MODELS.user,
      additionalFields: { ...options.user?.additionalFields, role: { type: 'string', required: false, input: false } },
    },
    session: { ...options.session, modelName: MODELS.session },
    account: { ...options.account, modelName: MODELS.account },
    verification: { ...options.verification, modelName: MODELS.verification },
  }
}

/** The SQL table of a Better Auth model: plugin models (`twoFactor`) become `atelier_ba_two_factor`. */
export const tableOf = (model: string) =>
  model.startsWith('atelier_') ? model : `atelier_ba_${model.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)}`

const columnType = (type: unknown): TableSpec['columns'][string]['type'] =>
  type === 'string' || type === 'number' || type === 'boolean' || type === 'date'
    ? type
    : Array.isArray(type) ? 'string' : 'json' // an enum is a string; string[] and number[] are JSON

/**
 * Better Auth's tables for this config, plugins included, for `server/atelier/tables.ts`:
 * `export default defineTables(betterAuthTables(auth))`. They're migrated with the content tables.
 */
export function betterAuthTables(config: AtelierBetterAuthConfig): Record<string, TableSpec> {
  const schema = getSchema(withAtelierModels(config.betterAuth))
  return Object.fromEntries(Object.entries(schema)
    .toSorted(([, a], [, b]) => a.order - b.order) // referenced tables first
    .map(([model, table]) => [tableOf(model), {
      columns: Object.fromEntries(Object.entries(table.fields).map(([key, field]) => [field.fieldName ?? key, {
        type: columnType(field.type),
        required: field.required === true,
        unique: field.unique === true,
        index: field.index === true,
        bigint: field.bigint === true,
        // cascade unless the plugin says otherwise, as Better Auth's own schema generator does
        ...field.references ? { references: { table: tableOf(field.references.model), onDelete: field.references.onDelete ?? 'cascade' } } : {},
      }])),
    }]))
}
