import { expect, test } from 'vitest'
import { ESLint } from 'eslint'

test('public-api-only rule flags every forbidden pattern in the fixture', async () => {
  const eslint = new ESLint({ ignore: false })
  const [result] = await eslint.lintFiles(['test/lint/forbidden-internals.fixture.ts'])
  const hits = result!.messages
    .filter(m => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax')
    .map(m => m.line)

  // 2: fs write import, 4: #build, 5: nuxt/dist, 6: nitropack internal,
  // 10: _layers, 11: _installedModules, 13: fs.mkdir (line 12's bare call is caught by its import on line 2)
  expect([...new Set(hits)].toSorted((a, b) => a - b)).toEqual([2, 4, 5, 6, 10, 11, 13])
})
