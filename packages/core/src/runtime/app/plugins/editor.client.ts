// The visual editor's way into a page: with `?_atelier=edit`, ask the server whether this is an edit session
// (exchanging the editor's token for its cookie the first time), and only then load the bridge. Visitors'
// pages run just this check of the query, and never download the bridge.
import { defineNuxtPlugin, useRoute } from '#imports'

export default defineNuxtPlugin({
  name: 'atelier:editor',
  async setup(nuxtApp) {
    const query = useRoute().query
    if (query._atelier !== 'edit' || window.parent === window)
      return
    const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))?.slice('atelier-csrf='.length)
    const token = typeof query._atelier_token === 'string' ? query._atelier_token : undefined
    const response = await fetch('/api/_atelier/editor/session', token
      ? { method: 'POST', headers: { 'content-type': 'application/json', ...csrf ? { 'x-atelier-csrf': csrf } : {} }, body: JSON.stringify({ token }) }
      : {})
    if (!response.ok)
      return // no edit session: the page as anyone sees it
    const { startBridge } = await import('../editor/bridge')
    // once the page is on screen: before, there's nothing to measure
    if (nuxtApp.isHydrating)
      nuxtApp.hook('app:suspense:resolve', () => startBridge(nuxtApp))
    else
      startBridge(nuxtApp)
  },
})
