import { apiError, useAtelierEntries } from '#atelier/server'
import { useServerHooks } from 'nuxt/server'

// Test probe: lifecycle hooks refusing a title, and failing after publishing one
export default () => {
  const hooks = useServerHooks()
  hooks.hook('atelier:beforeCreate', ({ type, data }) => {
    if (type === 'posts' && data.title === 'Forbidden')
      throw apiError(422, 'A post can\'t be called "Forbidden"', { errors: [{ path: 'title', message: 'not allowed' }] })
  })
  hooks.hook('atelier:afterPublish', async ({ type, id, site }) => {
    if (type === 'posts' && (await (await useAtelierEntries(site)).get(type, id))?.data.title === 'Explode')
      throw new Error('the after-publish hook exploded')
  })
}
