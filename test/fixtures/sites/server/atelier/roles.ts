import { defineRoles } from '#atelier/server'

export default defineRoles({
  editor: { content: { '*': { actions: ['create', 'read', 'update', 'delete', 'publish'] } }, capabilities: ['media', 'redirects', 'forms', 'settings'] },
})
