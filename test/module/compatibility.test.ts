import { hasNuxtCompatibility } from '@nuxt/kit'
import { describe, expect, it, vi } from 'vitest'
import module from '../../packages/core/src/module'

type Nuxt = Parameters<typeof module>[1]

// Runs @nuxt/kit's real compatibility check against a host reporting the given version
// (a Nuxt 4.5 install in the lockfile only for this assertion isn't worth it)
function host(version: string, enforceModuleCompatibility: boolean) {
  return {
    version,
    options: { atelier: {}, runtimeConfig: { public: {} }, experimental: { enforceModuleCompatibility } },
    hooks: { addHooks: () => {} },
    callHook: async () => {},
  } as unknown as Nuxt
}

describe('nuxt compatibility', () => {
  it('fails on Nuxt 4.5 with the required range', async () => {
    await expect(module({}, host('4.5.2', true))).rejects.toThrow('Nuxt version `>=4.6.0` is required but currently using `4.5.2`')
  })

  it('without enforcement, warns and skips setup', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await module({}, host('4.5.2', false))).toBeUndefined()
    warn.mockRestore()
  })

  it('accepts Nuxt 4.6 and 5', async () => {
    const { compatibility } = await module.getMeta!()
    for (const v of ['4.6.0', '4.7.1', '5.0.0'])
      expect(await hasNuxtCompatibility(compatibility!, host(v, true))).toBe(true)
  })
})
