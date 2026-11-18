/**
 * The `x-atelier-csrf` header a signed-in browser sends with writes to the CMS API: the `atelier-csrf`
 * cookie's value (none when no one is signed in). Pages send it too, so editors can use the site's forms.
 */
export function csrfHeaders(): Record<string, string> {
  const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))?.slice('atelier-csrf='.length)
  return csrf ? { 'x-atelier-csrf': csrf } : {}
}
