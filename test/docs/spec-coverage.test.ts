import { expect, it } from 'vitest'
import { coverageProblems } from '../../scripts/check-spec-coverage'

it('verifies every spec scenario with an automated check (test/spec-coverage.json)', () => {
  expect(coverageProblems()).toEqual([])
})
