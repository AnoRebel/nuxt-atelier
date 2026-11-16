import { existsSync } from 'node:fs'
import { expect, it } from 'vitest'
import { coverageProblems } from '../../scripts/check-spec-coverage'

// the specs (openspec/) are the maintainer's, not in the repository: checked where they're present
it.skipIf(!existsSync(new URL('../../openspec', import.meta.url)))('verifies every spec scenario with an automated check (test/spec-coverage.json)', () => {
  expect(coverageProblems()).toEqual([])
})
