import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { generateReference, REFERENCE_PATH } from '../../scripts/api-reference'

it('documents the public API as the source has it (run `bun run docs:api` to regenerate)', () => {
  expect(readFileSync(REFERENCE_PATH, 'utf8')).toBe(generateReference())
}, 60_000)
