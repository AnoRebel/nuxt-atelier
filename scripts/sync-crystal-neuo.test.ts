import { describe, expect, it } from 'vitest'
import { forShadowDom, forShadowRoot, withoutTsExtensions } from './sync-crystal-neuo'

describe('crystal-neuo for the admin\'s shadow root', () => {
  it('moves document selectors to the shadow root and the admin\'s root element', () => {
    expect(forShadowRoot(':root {\n  --a: 1;\n}\nhtml {\n  color-scheme: light;\n}\nbody {\n  margin: 0;\n}\n:where(body [data-theme]) {}\nhtml:has(dialog[open]) {}'))
      .toBe(':host {\n  --a: 1;\n}\n:host {\n  color-scheme: light;\n}\n[data-atelier-admin] {\n  margin: 0;\n}\n:where([data-atelier-admin] [data-theme]) {}\n[data-atelier-admin]:has(dialog[open]) {}')
    expect(forShadowRoot('/* against body text */ .cn-toast__body {}')).toBe('/* against body text */ .cn-toast__body {}')
  })

  it('finds focus inside the shadow root, and imports without .ts', () => {
    expect(forShadowDom('x === document.activeElement')).toBe('x === (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement)')
    expect(withoutTsExtensions('import { cn } from "./cn.ts";\nexport * from \'../contract/index.ts\'\nimport x from "pkg.ts"'))
      .toBe('import { cn } from "./cn";\nexport * from \'../contract/index\'\nimport x from "pkg.ts"')
  })
})
