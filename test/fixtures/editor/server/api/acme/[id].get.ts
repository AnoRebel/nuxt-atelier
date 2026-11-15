import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { acme } from '../../utils/acme'

// The app's own read of an acme page, for its page at /acme/<id>: `{ id, data }`, which the editor's
// unsaved state replaces in a preview
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const state = await acme.loadEditState({ kind: 'collection', name: 'acme-pages', id })
  return { id, data: state.data }
})
