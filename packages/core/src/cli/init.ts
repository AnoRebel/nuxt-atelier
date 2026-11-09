// `atelier init`: what a new project needs besides the module: secrets in .env and a first collection.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const secret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))

const STARTER = `import { blocks, defineCollection, slug, text } from '#atelier/server'

// Pages of the site, served at /{slug}, with their content as blocks
export default defineCollection({
  versioned: true,
  route: { pattern: '/{slug}' },
  fields: {
    title: text({ required: true }),
    slug: slug({ required: true, unique: true, from: 'title' }),
    content: blocks(),
  },
})
`

/** Sets up `root`, never overwriting: returns what it did, one line each. */
export function init(root: string): string[] {
  const done: string[] = []
  const envFile = join(root, '.env')
  const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  const missing = [['NUXT_APP_SECRET', 'signs sessions and preview links'], ['NUXT_ATELIER_JOBS_SECRET', 'authorizes the background job trigger']]
    .filter(([name]) => !new RegExp(`^${name}=`, 'm').test(env))
  if (missing.length) {
    const lines = missing.map(([name, purpose]) => `# ${purpose}\n${name}=${secret()}`).join('\n')
    writeFileSync(envFile, `${env}${env && !env.endsWith('\n') ? '\n' : ''}${lines}\n`)
    done.push(`Added ${missing.map(([name]) => name).join(' and ')} to .env (keep it out of git)`)
  }
  const collections = join(root, 'server/atelier/collections')
  if (!existsSync(collections) || !readdirSync(collections).length) {
    mkdirSync(collections, { recursive: true })
    writeFileSync(join(collections, 'pages.ts'), STARTER)
    done.push('Wrote server/atelier/collections/pages.ts, a first collection')
  }
  return done
}
