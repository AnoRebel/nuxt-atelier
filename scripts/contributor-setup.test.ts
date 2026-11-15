import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { setupCommands } from './contributor-setup'

test('reads the setup commands CI follows from CONTRIBUTING.md', () => {
  const commands = setupCommands(readFileSync(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8'))
  expect(commands[0]).toBe('bun install')
  expect(commands).toEqual(expect.arrayContaining(['bun run build', 'bun run test', 'bun run dev', 'bun run docs:build']))
  // the packages are built before anything that loads them
  expect(commands.indexOf('bun run build')).toBeLessThan(Math.min(...['bun run typecheck', 'bun run test', 'bun run dev'].map(c => commands.indexOf(c))))
})
