// The <style> blocks of the app's admin pages and overrides. CSS a component adds to the document's <head>
// can't reach the admin's shadow root, so the module compiles those blocks to strings (module.ts) and each
// lands here as a stylesheet adopted by the admin, after its own: never in the site's <head>.
const sheets = new Map<string, CSSStyleSheet>()
const roots = new Set<ShadowRoot>()

/** A component's style block, by `key` (its file and index): new, or changed in development. */
export function adoptAdminStyle(key: string, css: string): void {
  if (typeof CSSStyleSheet === 'undefined') // the server: there's no admin to style
    return
  let sheet = sheets.get(key)
  if (!sheet)
    sheets.set(key, sheet = new CSSStyleSheet())
  sheet.replaceSync(css)
  for (const root of roots) {
    if (!root.adoptedStyleSheets.includes(sheet))
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  }
}

/** Adopts the styles so far and those still to come into the admin's `root`; the returned function stops. */
export function adoptAdminStyles(root: ShadowRoot): () => void {
  roots.add(root)
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...sheets.values()]
  return () => roots.delete(root)
}
