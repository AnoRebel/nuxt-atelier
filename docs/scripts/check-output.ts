// Post-build check for the prerendered docs. Broken internal links already fail
// `nuxt build` (nitro.prerender.failOnError). This catches what doesn't:
// - an MDC component that doesn't exist renders as a PascalCase tag (`::foo-bar` → <FooBar>),
//   which never appears in valid SSR output
// - a content page the crawler never reached, so neither check ran on it
// - app.config.ts not loaded (it belongs in app/ once that directory exists): no "edit this page" links
// - the plain-text index for language models (llms.txt, llms-full.txt) missing, or missing pages
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

// every page is in the full plain-text docs, by its title
const llms = join(out, 'llms.txt')
const full = join(out, 'llms-full.txt')
if (!existsSync(llms) || !readFileSync(llms, 'utf8').includes('/llms-full.txt'))
  errors.push('llms.txt: missing, or doesn\'t point to llms-full.txt')
else if (!existsSync(full))
  errors.push('llms-full.txt: missing')
else {
  const text = readFileSync(full, 'utf8')
  for (const file of globSync('**/*.md', { cwd: join(root, 'content') })) {
    const title = /^title: *(\S.*)$/m.exec(readFileSync(join(root, 'content', file), 'utf8'))?.[1]?.trim().replace(/^['"]|['"]$/g, '')
    if (title && !text.includes(title))
      errors.push(`llms-full.txt: no "${title}" (content/${file})`)
  }
}

if (errors.length) {
  console.error(`Docs check failed:\n${errors.map(e => `  ${e}`).join('\n')}`)
  process.exit(1)
}
console.log('Docs check passed')
