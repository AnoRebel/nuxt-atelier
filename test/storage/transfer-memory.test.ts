// Large transfers stream: a 30,000-entry collection (a 150 MB archive) goes out and back in, and a 200 MB
// file is uploaded to the media library and downloaded, each holding under 64 MB more than it started with. Each phase runs in a process of its own
// (transfer-memory.ts), and the probe is calibrated: reading the archive whole must show about its size.
import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const CEILING = 64 * 1024 * 1024
const script = fileURLToPath(new URL('./transfer-memory.ts', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'atelier-transfer-memory-'))
const phase = async (...args: string[]) => JSON.parse((await promisify(execFile)('bun', [script, ...args], { maxBuffer: 1024 * 1024 })).stdout) as Record<string, number>

describe('large transfer memory', () => {
  it('stream a 150 MB archive within the memory ceiling', async () => {
    await phase('seed', dir, '30000')
    const exported = await phase('export', dir)
    expect(exported.archive).toBeGreaterThan(150 * 1000 * 1000)
    const imported = await phase('import', dir)
    expect(imported.count).toBe(30_000)
    const buffered = await phase('buffer', dir)
    expect(buffered.peak).toBeGreaterThan(exported.archive! * 0.8) // the probe sees memory held
    expect(exported.peak).toBeLessThan(CEILING)
    expect(imported.peak).toBeLessThan(CEILING)
  }, 600_000)

  it('stream a 200 MB upload and its download within the memory ceiling', async () => {
    const media = await phase('upload', dir, '200')
    expect(media.received).toBe(media.size)
    expect(media.uploaded).toBeLessThan(CEILING)
    expect(media.downloaded).toBeLessThan(CEILING)
  }, 600_000)
})
