import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { generateReference, REFERENCE_PATH } from '../../scripts/config-reference'

it('documents every module option (run `bun run docs:config` to regenerate)', () => {
  expect(readFileSync(REFERENCE_PATH, 'utf8')).toBe(generateReference())
})
