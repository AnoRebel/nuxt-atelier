// With @nuxtjs/robots: our rules (the admin's or the options', the admin and API kept out) join its own.
import type { RobotsGroup } from '../crawlers'
import type { RequestEvent } from 'nuxt/server'
import { useServerHooks } from 'nuxt/server'
import { singleSite, useAtelierSite } from '../index'
import { useRobotsGroups } from '../crawlers'

interface RobotsContext { groups: (RobotsGroup & { comment?: string[] })[], event?: RequestEvent }

export default () => {
  ;(useServerHooks().hook as (name: 'robots:config', fn: (ctx: RobotsContext) => Promise<void>) => void)('robots:config', async (ctx) => {
    for (const group of await useRobotsGroups(ctx.event ? useAtelierSite(ctx.event) : singleSite)) {
      const same = ctx.groups.find(g => g.userAgent.toSorted().join('\n') === group.userAgent.toSorted().join('\n'))
      if (same) {
        same.allow = [...new Set([...same.allow, ...group.allow])]
        same.disallow = [...new Set([...same.disallow, ...group.disallow])]
      }
      else {
        ctx.groups.push({ comment: [], ...group })
      }
    }
  })
}
