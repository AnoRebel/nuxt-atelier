import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../../packages/core/src/options'

const error = (options: unknown) => {
  try {
    resolveOptions(options)
  }
  catch (e) {
    return (e as Error).message
  }
  throw new Error('expected invalid options')
}

describe('module options', () => {
  it('fills the zero-config defaults', () => {
    expect(resolveOptions({})).toMatchObject({
      database: { url: 'file:.data/atelier.sqlite' },
      storage: { driver: 'local', dir: '.data/uploads' },
      auth: { provider: 'builtin' },
      admin: { base: '/admin' },
      limits: { maxPageSize: 100, maxBodySize: 1024 * 1024 },
    })
  })

  it('rejects options that aren\'t an object with a readable message', () => {
    expect(() => resolveOptions(undefined as never)).toThrow('[nuxt-atelier] Invalid module options:\n  - atelier = undefined:')
  })

  it('keeps valid overrides', () => {
    const o = resolveOptions({ database: { url: 'postgres://u@db/cms' }, admin: { base: '/cms/admin' }, limits: { maxPageSize: 50 } })
    expect([o.database.url, o.admin.base, o.limits.maxPageSize, o.limits.dbPoolSize]).toEqual(['postgres://u@db/cms', '/cms/admin', 50, 10])
  })

  it('rejects an unsupported database URL scheme, naming option, value and accepted schemes', () => {
    expect(error({ database: { url: 'mongodb://localhost/cms' } })).toContain(
      'atelier.database.url = "mongodb://localhost/cms": unsupported scheme; accepted: file:, libsql:, postgres:, postgresql:, mysql:, mariadb:',
    )
  })

  it('rejects an invalid admin base', () => {
    expect(error({ admin: { base: 'admin/' } })).toContain('atelier.admin.base = "admin/": expected a path like "/admin"')
    expect(error({ admin: { base: '/api/admin' } })).toContain('atelier.admin.base = "/api/admin": must not be under "/api"')
  })

  it('rejects invalid limits with the accepted range', () => {
    const message = error({ limits: { maxPageSize: 0, jobConcurrency: 2.5 } })
    expect(message).toContain('atelier.limits.maxPageSize = 0: expected an integer from 1 to 1000')
    expect(message).toContain('atelier.limits.jobConcurrency = 2.5: expected an integer from 1 to 64')
  })

  it('rejects unknown options (typos)', () => {
    expect(error({ databse: {} })).toContain('atelier.databse: unknown option; accepted: database, storage, auth, admin, limits')
    expect(error({ limits: { pageSize: 5 } })).toContain('atelier.limits.pageSize: unknown option; accepted: maxBodySize,')
  })
})
