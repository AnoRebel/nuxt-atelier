// Nuxt DevTools panels for Nuxt Atelier, in development only: the content schema, migrations (with an
// action to apply them), background jobs (with retry) and the admin. A dev dependency: nothing of it
// reaches a production build, and core has no DevTools code.
//
// DevTools 4 (on Vite DevTools) registers docks and commands from `devtools:ready`; Nuxt 4.6 still ships
// DevTools 3, where that hook never fires, so the custom tabs of `devtools:customTabs` stand in. Actions
// change data, so they never run when `devtools.disableAuthorization` lets any browser that reaches the
// dev server call them.
import type { ModuleCustomTab } from '@nuxt/devtools-kit/types'
import type { NuxtModule } from '@nuxt/schema'
import { addDevServerHandler, defineNuxtModule } from '@nuxt/kit'
import { defineEventHandler, getRouterParam, setResponseHeader } from 'h3'
import { applyProjectMigrations, listJobs, projectFromNuxt, retryJob, withMigrationLock } from 'nuxt-atelier/project'
import { renderPanel } from './panel'

export const PANEL = '/__atelier_devtools'
const SECTIONS = ['schema', 'migrations', 'jobs'] as const

/** What DevTools 4 hands `devtools:ready`: just the parts used here. */
interface ReadyContext {
  docks: { register: (dock: { id: string, type: 'iframe', title: string, icon: string, url: string, groupId?: string }) => unknown }
  commands?: { register: (command: { id: string, title: string, handler: () => unknown }) => unknown }
}

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@nuxt-atelier/devtools', configKey: 'atelierDevtools', compatibility: { nuxt: '>=4.6.0' } },
  setup(_, nuxt) {
    const devtools = nuxt.options.devtools as boolean | { enabled?: boolean, disableAuthorization?: boolean } | undefined
    if (!nuxt.options.dev || devtools === false || (typeof devtools === 'object' && devtools.enabled === false))
      return
    const authorized = !(typeof devtools === 'object' && devtools.disableAuthorization)
    const project = () => projectFromNuxt(nuxt)
    const adminBase = () => ((nuxt.options.runtimeConfig.public as { atelier?: { admin?: { base?: string } } }).atelier?.admin?.base ?? '/admin')

    addDevServerHandler({
      route: `${PANEL}/:section`,
      handler: defineEventHandler(async (event) => {
        const section = getRouterParam(event, 'section') as typeof SECTIONS[number]
        if (!SECTIONS.includes(section))
          return new Response('Not found', { status: 404 })
        setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
        return renderPanel(await project(), section)
      }),
    })

    /** Changes data: only over DevTools' authorized connection. */
    const guarded = (action: () => Promise<unknown>) => async () => {
      if (!authorized)
        throw new Error('[nuxt-atelier] Actions are off while devtools.disableAuthorization is set: any browser reaching the dev server could run them')
      return action()
    }
    const applyMigrations = guarded(async () => {
      const p = await project()
      return withMigrationLock(p.databaseUrl, () => applyProjectMigrations(p))
    })

    const docks = [
      ...SECTIONS.map(section => ({ id: `atelier:${section}`, title: `Atelier: ${section}`, icon: section === 'schema' ? 'i-lucide-database' : section === 'migrations' ? 'i-lucide-git-merge' : 'i-lucide-list-checks', url: `${PANEL}/${section}` })),
      { id: 'atelier:admin', title: 'Atelier: admin', icon: 'i-lucide-layout-dashboard', url: adminBase() },
    ]

    // DevTools 4: docks, and the actions as commands
    let ready = false
    ;(nuxt.hook as (name: string, fn: (ctx: ReadyContext) => void) => void)('devtools:ready', (ctx) => {
      ready = true
      for (const dock of docks)
        ctx.docks.register({ ...dock, type: 'iframe', url: dock.id === 'atelier:admin' ? adminBase() : dock.url, groupId: 'nuxt' })
      ctx.commands?.register({ id: 'atelier:apply-migrations', title: 'Atelier: apply pending migrations', handler: applyMigrations })
    })

    // DevTools 3: custom tabs, and the actions in a launch view
    ;(nuxt.hook as (name: string, fn: (tabs: ModuleCustomTab[]) => Promise<void>) => void)('devtools:customTabs', async (tabs) => {
      if (ready)
        return
      for (const dock of docks)
        tabs.push({ name: dock.id.replace(':', '-'), title: dock.title, icon: dock.icon.replace('i-lucide-', 'lucide:'), category: 'modules', view: { type: 'iframe', src: dock.id === 'atelier:admin' ? adminBase() : dock.url } })
      const failed = await listJobs(await project(), 'failed').catch(() => [])
      tabs.push({
        name: 'atelier-actions',
        title: 'Atelier: actions',
        icon: 'lucide:play',
        category: 'modules',
        view: {
          type: 'launch',
          description: authorized
            ? 'Apply the pending migrations to the dev database, or queue a failed background job again.'
            : 'Actions are off while devtools.disableAuthorization is set.',
          actions: authorized
            ? [
                { label: 'Apply pending migrations', handle: async () => void await applyMigrations() },
                ...failed.slice(0, 10).map(job => ({ label: `Retry ${job.name} (${job.id.slice(0, 8)})`, handle: guarded(async () => retryJob(await project(), job.id)) as () => Promise<void> })),
              ]
            : [],
        },
      })
    })
  },
})

export default module
