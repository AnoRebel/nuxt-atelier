import { defineRoles } from '#atelier/server'

export default defineRoles({
  // writes and changes only their own posts, with AI assist
  writer: { capabilities: ['ai', 'media'], content: { posts: { actions: ['create', 'read', 'update', 'delete'], ownOnly: ['update', 'delete'] }, secrets: { actions: ['read'] } } },
  // no AI
  reader: { content: { posts: { actions: ['read'] } } },
})
