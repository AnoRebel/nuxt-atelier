// Post-build check for the prerendered docs. Broken internal links already fail
// `nuxt build` (nitro.prerender.failOnError). This catches what doesn't:
// - an MDC component that doesn't exist renders as a PascalCase tag (`::foo-bar` → <FooBar>),
//   which never appears in valid SSR output
// - a content page the crawler never reached, so neither check ran on it
// - app.config.ts not loaded (it belongs in app/ once that directory exists): no "edit this page" links
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const out = join(root, '.output/public')
const errors: string[] = []

for (const file of globSync('**/*.md', { cwd: join(root, 'content') })) {
  const route = file.replace(/\.md$/, '').split('/').map(s => s.replace(/^\d+\./, '')).filter(s => s !== 'index').join('/')
  if (!existsSync(join(out, route ? `${route}.html` : 'index.html')))
    errors.push(`content/${file}: not prerendered (no link reaches /${route})`)
}

for (const file of globSync('**/*.html', { cwd: out })) {
  const tags = new Set(readFileSync(join(out, file), 'utf8').match(/(?<=<)[A-Z][\w-]*/g))
  for (const tag of tags)
    errors.push(`${file}: unknown MDC component <${tag}>`)
}

if (!readFileSync(join(out, 'getting-started/introduction.html'), 'utf8').includes('/edit/main/docs/'))
  errors.push('getting-started/introduction.html: no "edit this page" link, so app/app.config.ts wasn\'t loaded')

if (errors.length) {
  console.error(`Docs check failed:\n${errors.map(e => `  ${e}`).join('\n')}`)
  process.exit(1)
}
console.log('Docs check passed')
