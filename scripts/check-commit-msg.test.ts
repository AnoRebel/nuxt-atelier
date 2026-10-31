import { expect, test } from 'bun:test'
import { isValidCommitMessage } from './check-commit-msg'

test('accepts semantic commits', () => {
  for (const msg of ['feat: add blocks', 'fix(core): guard null', 'refactor(admin)!: drop api', 'ci: matrix\n\nbody', 'Merge branch \'main\''])
    expect(isValidCommitMessage(msg)).toBe(true)
})

test('rejects non-semantic commits', () => {
  for (const msg of ['added stuff', 'feature: x', 'feat:no space', 'fix(core): ', '# comment only'])
    expect(isValidCommitMessage(msg)).toBe(false)
})
