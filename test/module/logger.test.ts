import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger, redact } from '../../packages/core/src/runtime/server/logger'

describe('server logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('redacts secrets at any depth, and credentials in URLs', () => {
    expect(redact({ email: 'a@b.c', password: 'hunter2', nested: [{ apiKey: 'k', authorization: 'Bearer x', ok: 1 }], submission: { name: 'Ada' } }))
      .toEqual({ email: 'a@b.c', password: '[redacted]', nested: [{ apiKey: '[redacted]', authorization: '[redacted]', ok: 1 }], submission: '[redacted]' })
    expect(redact('connect postgres://cms:s3cret@db:5432/atelier failed')).toBe('connect postgres://[redacted]@db:5432/atelier failed')
    expect(redact(new Error('ECONNREFUSED mysql://root:pw@127.0.0.1/x'))).toMatchObject({ name: 'Error', message: 'ECONNREFUSED mysql://[redacted]@127.0.0.1/x' })
  })

  it('writes one JSON line per entry in production, with the correlation id', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('Sign-in failed', { requestId: 'r-1', password: 'hunter2' })
    const entry = JSON.parse(warn.mock.calls[0]![0] as string)
    expect(entry).toMatchObject({ level: 'warn', source: 'nuxt-atelier', message: 'Sign-in failed', requestId: 'r-1', password: '[redacted]' })
    expect(warn.mock.calls[0]![0]).not.toContain('hunter2')
  })

  it('writes readable lines in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('Applied migrations: 0001_init')
    expect(info).toHaveBeenCalledWith('[nuxt-atelier] Applied migrations: 0001_init')
  })
})
