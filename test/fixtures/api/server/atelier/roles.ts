import { defineRoles } from '#atelier/server'

export default defineRoles({
  // edits articles but can't publish, changes only their own, never the slug, never sees the notes
  writer: {
    content: {
      articles: { actions: ['create', 'read', 'update', 'delete', 'comment'], ownOnly: ['update', 'delete'], readOnly: ['slug'], hidden: ['internalNotes'] },
      authors: { actions: ['read'], hidden: ['email'] },
      settings: { actions: ['read', 'update'] },
    },
  },
  // reads only their own articles, and nothing else
  intern: {
    content: { articles: { actions: ['read', 'create'], ownOnly: ['read'] } },
  },
})
