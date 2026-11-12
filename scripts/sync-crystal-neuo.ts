/**
 * Copy the crystal-neuo design system into the admin (packages/admin/src/runtime/crystal-neuo/).
 *
 *   bun scripts/sync-crystal-neuo.ts <path-to-crystal-neuo-checkout>
 *
 * The checkout must be built (`bun run build` at its root). Everything under that directory is replaced;
 * don't edit those files by hand. The admin renders in a shadow root, so the copy is adapted on the way in:
 *   - the stylesheet's document selectors (`:root`, `html`, `body`) become the shadow root's (`:host`, and
 *     the admin's root element `[data-atelier-admin]`);
 *   - components look for the focused element inside the shadow root, where `document.activeElement` is
 *     only the shadow host;
 *   - relative imports drop their `.ts` extension, which the package build (mkdist) compiles to `.js`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = resolve(process.argv[2] ?? '')
const dest = fileURLToPath(new URL('../packages/admin/src/runtime/crystal-neuo', import.meta.url))
const pkgs = join(src, 'packages')
const ROOT = '[data-atelier-admin]'

/** The stylesheet, scoped to the admin's shadow root instead of the document. */
export function forShadowRoot(css: string): string {
  return css
    .replace(/(^|[\s,(]):root\b/gm, '$1:host')
    .replace(/(^|[\s,(])html:has\(/gm, `$1${ROOT}:has(`)
    .replace(/(^|[\s,(])html(?=\s*[{,])/gm, '$1:host')
    .replace(/(^|[\s,(])body(?=\s*[{,[])/gm, `$1${ROOT}`)
    .replace(/(^|[\s,(])body(?=\s+\[)/gm, `$1${ROOT}`)
}

/** Component source, with focus lookups that see into the shadow root. */
export function forShadowDom(source: string): string {
  return source.replaceAll('document.activeElement', '(document.activeElement?.shadowRoot?.activeElement ?? document.activeElement)')
}

/** Relative imports without their `.ts` extension. */
export const withoutTsExtensions = (source: string): string => source.replace(/(from\s+["']\.{1,2}\/[^"']*?)\.ts(["'])/g, '$1$2')

/** Copies a directory of TypeScript sources, without their tests and with extensionless imports. */
function copySources(from: string, to: string) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    if (name.endsWith('.test.ts'))
      continue
    writeFileSync(join(to, name), withoutTsExtensions(readFileSync(join(from, name), 'utf8')))
  }
}

if (import.meta.main) {
  const required = ['css/dist/crystal-neuo.css', 'tokens/runtime/index.ts', 'contract/src/index.ts', 'vue/src/index.ts']
  for (const file of required) {
    if (!existsSync(join(pkgs, file))) {
      console.error(`Missing ${join(pkgs, file)}. Pass a crystal-neuo checkout and run its build first.`)
      process.exit(1)
    }
  }

  rmSync(dest, { recursive: true, force: true })
  mkdirSync(join(dest, 'css'), { recursive: true })
  writeFileSync(join(dest, 'css/crystal-neuo.css'), forShadowRoot(readFileSync(join(pkgs, 'css/dist/crystal-neuo.css'), 'utf8')))
  copySources(join(pkgs, 'tokens/runtime'), join(dest, 'runtime'))
  copySources(join(pkgs, 'contract/src'), join(dest, 'contract'))

  // components import the contract by package name: point them at the copy
  mkdirSync(join(dest, 'components'))
  for (const name of readdirSync(join(pkgs, 'vue/src'))) {
    if (name === 'shims-vue.d.ts' || name === 'index.ts' || name.endsWith('.test.ts'))
      continue
    const text = readFileSync(join(pkgs, 'vue/src', name), 'utf8')
    writeFileSync(join(dest, 'components', name), withoutTsExtensions(forShadowDom(text.replaceAll('"@crystal-neuo/contract"', '"../contract/index"'))))
  }

  const git = (args: string[]) => Bun.spawnSync(['git', '-C', src, ...args]).stdout.toString().trim()
  const version = JSON.parse(readFileSync(join(pkgs, 'vue/package.json'), 'utf8')).version
  const dirty = git(['status', '--porcelain', '--', 'packages']) ? ' (with uncommitted changes)' : ''
  writeFileSync(join(dest, 'VERSION'), `crystal-neuo ${version}\ncommit ${git(['rev-parse', 'HEAD'])}${dirty}\ndate ${git(['log', '-1', '--format=%cs'])}\n`)
  console.log(`Synced crystal-neuo ${version} into ${dest}`)
}
