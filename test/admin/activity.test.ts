// The dashboard's recent activity names every audit action in words, not by its key (`entry.published`).
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import en from '../../packages/admin/src/runtime/i18n/en'

it('has English words for every audit action', () => {
  const source = readFileSync(new URL('../../packages/core/src/runtime/server/auth/audit.ts', import.meta.url), 'utf8')
  const union = source.slice(source.indexOf('export type AuditAction'), source.indexOf('export interface AuditInput'))
  const actions = [...union.matchAll(/'([a-z]+\.[a-z-]+)'/g)].map(m => m[1])
  expect(actions.length).toBeGreaterThan(20)
  expect(actions.filter(action => !(`home.action.${action}` in en))).toEqual([])
})
