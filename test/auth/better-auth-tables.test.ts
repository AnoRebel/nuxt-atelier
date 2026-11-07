import { twoFactor } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'
import { betterAuthTables } from '../../packages/auth-better-auth/src/config'
import { buildTables } from '../../packages/core/src/runtime/server/db/tables'

describe('betterAuthTables()', () => {
  it('turns Better Auth\'s schema, plugins included, into Atelier tables for every engine', () => {
    const tables = betterAuthTables({ betterAuth: { plugins: [twoFactor()] } })
    expect(Object.keys(tables)).toEqual(['atelier_ba_users', 'atelier_ba_sessions', 'atelier_ba_accounts', 'atelier_ba_verifications', 'atelier_ba_two_factor'])
    expect(tables.atelier_ba_users!.columns).toMatchObject({
      email: { type: 'string', required: true, unique: true },
      createdAt: { type: 'date', required: true },
      role: { type: 'string', required: false }, // the CMS role
      twoFactorEnabled: { type: 'boolean' },
    })
    expect(tables.atelier_ba_two_factor!.columns.userId).toMatchObject({ references: { table: 'atelier_ba_users', onDelete: 'cascade' } })
    for (const dialect of ['sqlite', 'postgres', 'mysql'] as const)
      expect(Object.keys(buildTables(dialect, { collections: {}, singletons: {}, tables }))).toContain('atelier_ba_two_factor')
  })
})
