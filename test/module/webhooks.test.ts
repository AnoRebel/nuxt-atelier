import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { connectionCheckedSend, decryptSecret, encryptSecret, isInternalAddress, newSecret, sign, targetProblem } from '../../packages/core/src/runtime/server/webhooks'

describe('webhook signatures', () => {
  it('signs as the Standard Webhooks reference does', async () => {
    // the example in the Standard Webhooks specification and its reference libraries
    const signature = await sign('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'msg_p5jXN8AQM9LWM0D4loKWxJek', 1614265330, '{"test": 2432232314}')
    expect(signature).toBe('v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=')
  })

  it('makes 24-byte secrets, and keeps them encrypted at rest', async () => {
    const secret = newSecret()
    expect(secret).toMatch(/^whsec_[\w+/]{32}$/)
    const key = 'ab'.repeat(32)
    const stored = await encryptSecret(secret, key)
    expect(stored).not.toContain(secret.slice(6))
    expect(await decryptSecret(stored, key)).toBe(secret)
    await expect(decryptSecret(stored, 'cd'.repeat(32))).rejects.toThrow()
  })
})

describe('webhook targets', () => {
  it('knows internal addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', 'not-an-ip'])
      expect(isInternalAddress(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])
      expect(isInternalAddress(ip), ip).toBe(false)
  })

  it('refuses URLs reaching internal addresses, by name too, unless allowlisted', async () => {
    const lookup = async (host: string) => ({ 'hooks.example.com': ['93.184.216.34'], 'sneaky.example.com': ['93.184.216.34', '10.0.0.5'] } as Record<string, string[]>)[host] ?? []
    expect(await targetProblem('https://hooks.example.com/in', [], lookup)).toBeUndefined()
    expect(await targetProblem('https://sneaky.example.com/in', [], lookup)).toBe('sneaky.example.com resolves to an internal address (10.0.0.5); allowlist it in webhooks.allow if that\'s intended')
    expect(await targetProblem('http://127.0.0.1:3000/', [], lookup)).toMatch(/^127\.0\.0\.1 is an internal address/)
    expect(await targetProblem('http://[::1]/', [], lookup)).toMatch(/^::1 is an internal address/)
    expect(await targetProblem('http://localhost/', [], lookup)).toMatch(/internal address/)
    expect(await targetProblem('http://127.0.0.1:3000/', ['127.0.0.1'], lookup)).toBeUndefined()
    expect(await targetProblem('https://nowhere.example.com/', [], lookup)).toBe('nowhere.example.com doesn\'t resolve')
    expect(await targetProblem('ftp://hooks.example.com/', [], lookup)).toBe('Use a full http(s):// URL')
    expect(await targetProblem('https://user:pass@hooks.example.com/', [], lookup)).toMatch(/credentials/)
    // without DNS (Workers), only literal addresses and localhost can be checked
    expect(await targetProblem('https://sneaky.example.com/in', [])).toBeUndefined()
  })
})

describe('webhook delivery', () => {
  it('checks the addresses the connection itself resolves, so a rebinding host is refused', async () => {
    const server = createServer((_, res) => res.writeHead(204).end())
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://localhost:${(server.address() as { port: number }).port}/hook`
    const init = { headers: { 'content-type': 'application/json' }, body: '{}', timeoutMs: 5000 }
    try {
      // `localhost` stands in for a public name that resolves to an internal address at connect time
      await expect((await connectionCheckedSend([]))!(url, init)).rejects.toThrow(/internal address/)
      expect(await (await connectionCheckedSend(['localhost']))!(url, init)).toBe(204)
    }
    finally {
      server.close()
    }
  })
})
