import { pbkdf2Sync, scryptSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../packages/core/src/runtime/server/auth/password'

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').replace(/=+$/, '')
const salt = new Uint8Array(16).fill(7)

describe('password hashing', () => {
  it('hashes with scrypt, encoding its parameters, and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$[\w+/]{22}\$[\w+/]{43}$/)
    expect(await hashPassword('correct horse battery staple')).not.toBe(hash) // salted
    expect(await verifyPassword('correct horse battery staple', hash)).toEqual({ valid: true, needsRehash: false })
    expect(await verifyPassword('wrong', hash)).toEqual({ valid: false, needsRehash: false })
    expect(await verifyPassword('anything', 'not a hash')).toEqual({ valid: false, needsRehash: false })
  })

  it('verifies a PBKDF2 hash (edge runtimes) and asks to upgrade it where scrypt works', async () => {
    const key = pbkdf2Sync('secret', salt, 600_000, 32, 'sha256')
    const hash = `$pbkdf2-sha256$i=600000$${b64(salt)}$${b64(key)}`
    expect(await verifyPassword('secret', hash)).toEqual({ valid: true, needsRehash: true })
    expect(await verifyPassword('Secret', hash)).toEqual({ valid: false, needsRehash: false })
  })

  it('verifies a hash with weaker scrypt settings and asks to upgrade it', async () => {
    const key = scryptSync('secret', salt, 32, { N: 2 ** 14, r: 8, p: 1 })
    expect(await verifyPassword('secret', `$scrypt$ln=14,r=8,p=1$${b64(salt)}$${b64(key)}`)).toEqual({ valid: true, needsRehash: true })
  })
})
