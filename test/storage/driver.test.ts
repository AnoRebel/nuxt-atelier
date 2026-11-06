import { afterAll, describe, expect, it } from 'vitest'
import { connect, dialectOf, redact } from '../../packages/core/src/runtime/server/db/driver'
import { connectEngine, engines } from './env'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'

describe.each(engines)('%s driver', (name, url) => {
  const driver = connectEngine(url, { poolSize: 2 })
  afterAll(async () => (await driver).close())

  it('connects and queries', async () => {
    const { dialect, ping } = await driver
    expect(dialect).toBe(dialectOf(url))
    await expect(ping()).resolves.toBeUndefined()
    expect({ mariadb: 'mysql', d1: 'sqlite' }[name] ?? name).toBe(dialect)
  })
})

it('picks the dialect from the URL scheme', () => {
  expect(['file:a.db', 'libsql://x.turso.io', 'postgres://h/d', 'postgresql://h/d', 'mysql://h/d', 'mariadb://h/d'].map(dialectOf))
    .toEqual(['sqlite', 'sqlite', 'postgres', 'postgres', 'mysql', 'mysql'])
  expect(() => dialectOf('mongodb://u:secret@h/d')).toThrow('Unsupported database URL scheme in "mongodb://u:***@h/d"')
})

it('names the database without leaking the password when it is unreachable', async () => {
  await expect(connect('postgres://cms:hunter2@127.0.0.1:1/atelier', { loaders: allDrivers })).rejects.toThrow(/Can't connect to the postgres database at "postgres:\/\/cms:\*\*\*@127\.0\.0\.1:1\/atelier"/)
  expect(redact('mysql://root:p@ss@h/d')).toBe('mysql://root:***@h/d')
})
