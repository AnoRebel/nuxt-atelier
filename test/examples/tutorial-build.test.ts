import { fileURLToPath } from 'node:url'
// Every chapter of the Rayleigh tutorial builds: its state (scripts/tutorial.ts), in examples/rayleigh/.steps/
// so the example's dependencies resolve, built with `nuxi build`.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { assemble, CHAPTERS, EXAMPLE } from '../../scripts/tutorial'

// the app's own nuxi, not npx: npm reads the root package.json, whose Bun overrides it rejects
const NUXI = fileURLToPath(new URL('../../examples/rayleigh/node_modules/.bin/nuxi', import.meta.url))

describe('the Rayleigh tutorial\'s chapters', () => {
  it.each(CHAPTERS.map((chapter, index) => [index + 1, chapter] as const))('chapter %i (%s) builds', async (n) => {
    const dir = join(EXAMPLE, '.steps', String(n))
    assemble(n - 1, dir)
    const { stdout } = await promisify(execFile)(NUXI, ['build'], { cwd: dir, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_ENV: 'production' } })
    expect(stdout).toContain('Build complete')
  }, 600_000)
})
