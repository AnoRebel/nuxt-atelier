// Forms: definitions are checked as they're saved (names, options, patterns), and submissions older than
// their form's `retentionDays` are deleted daily (0 keeps them).
import type { FormDefinition } from '../../shared/forms'
import { useServerHooks } from 'nuxt/server'
import { definitionErrors, FORMS } from '../../shared/forms'
import { apiError } from '../errors'
import { allSites, useAtelierEntries, useAtelierSchema, useAtelierSubmissions } from '../index'
import { defineJob } from '../jobs'

const DAY = 24 * 3600_000

export default () => {
  const check = ({ type, data }: { type: string, data: Record<string, unknown> }) => {
    if (type !== FORMS)
      return
    const errors = definitionErrors(data as unknown as FormDefinition)
    if (errors.length)
      throw apiError(422, `Invalid form: ${errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, { errors })
  }
  const hooks = useServerHooks() as unknown as { hook: (name: string, fn: (context: never) => unknown) => void }
  hooks.hook('atelier:beforeCreate', check)
  hooks.hook('atelier:beforeUpdate', check)

  defineJob('atelier:forms:prune', async () => {
    if (!(await useAtelierSchema()).collections[FORMS])
      return
    const submissions = await useAtelierSubmissions()
    for (const site of allSites()) {
      const entries = await useAtelierEntries(site)
      let cursor: string | undefined
      do {
        const page = await entries.list(FORMS, { stage: 'draft', limit: 100, cursor })
        for (const form of page.items) {
          const days = Number(form.data.retentionDays ?? 90)
          if (days > 0)
            await submissions.deleteBefore(form.id, new Date(Date.now() - days * DAY))
        }
        cursor = page.next ?? undefined
      } while (cursor)
    }
  }, { every: DAY })
}
