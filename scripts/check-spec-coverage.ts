// Spec coverage: every scenario of the change's specs is verified by an automated check, listed in
// test/spec-coverage.json as { "<capability>/<scenario>": { file, test } }, `test` a substring of `file` (an
// it() title, or a CI step). Fails on a scenario with no check, a listed one the specs no longer have, and a
// check that isn't where the list says.
//   bun scripts/check-spec-coverage.ts   (also test/docs/spec-coverage.test.ts, in CI)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const SPECS = `${root}openspec/changes/nuxt-atelier-v1/specs/`

/** Every scenario, as `<capability>/<name>`. */
function scenarios(): string[] {
  return readdirSync(SPECS).toSorted().flatMap(capability =>
    [...readFileSync(`${SPECS}${capability}/spec.md`, 'utf8').matchAll(/^#### Scenario: (.+)$/gm)].map(m => `${capability}/${m[1]!.trim()}`))
}

export function coverageProblems(): string[] {
  const map = JSON.parse(readFileSync(`${root}test/spec-coverage.json`, 'utf8')) as Record<string, { file: string, test: string } | unknown[]>
  const listed = Object.entries(map).filter(([key]) => key !== 'unmapped') as [string, { file: string, test: string }][]
  const all = new Set(scenarios())
  const problems = [
    ...[...all].filter(s => !map[s]).map(s => `no automated check for ${s}`),
    ...listed.filter(([key]) => !all.has(key)).map(([key]) => `${key} isn't a scenario of the specs`),
  ]
  for (const [key, { file, test }] of listed) {
    if (!existsSync(`${root}${file}`))
      problems.push(`${key}: ${file} doesn't exist`)
    else if (!readFileSync(`${root}${file}`, 'utf8').includes(test))
      problems.push(`${key}: ${file} has no ${JSON.stringify(test)}`)
  }
  return problems
}

if (import.meta.main) {
  const problems = coverageProblems()
  if (problems.length) {
    console.error(problems.map(p => `✗ ${p}`).join('\n'))
    process.exit(1)
  }
  console.log(`Every one of the ${scenarios().length} spec scenarios has an automated check.`)
}
