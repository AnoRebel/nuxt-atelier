// The request's site, from its host (see sites.ts): on `event.context.atelier.site`. A host no site has,
// without a fallback site, answers 404; health checks answer anyway (probes reach a server by its address).
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { apiError } from '../errors'
import { useAtelierServerConfig } from '../index'
import { resolveRequestSite } from '../sites'

export default defineEventHandler((event) => {
  const config = useAtelierServerConfig() as unknown as { sites: import('../sites').SitesConfig, auth: { trustProxy: boolean } }
  if (!config.sites.list)
    return
  if (!resolveRequestSite(event, config.sites, config.auth.trustProxy) && !getRequestURL(event).pathname.startsWith('/api/_atelier/health/'))
    throw apiError(404, 'No site is served at this address')
})
