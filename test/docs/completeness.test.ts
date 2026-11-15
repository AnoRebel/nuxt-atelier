import { expect, it } from 'vitest'
import { docsProblems } from '../../scripts/check-docs'

it('has an editor guide for every admin feature and TSDoc on every public API value', () => {
  expect(docsProblems()).toEqual([])
}, 60_000)
