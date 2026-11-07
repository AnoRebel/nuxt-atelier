import { defineRoles } from '#atelier/server'

// A role kept in code: read-only in the admin
export default defineRoles({
  reviewer: { label: 'Reviewer', content: { '*': { actions: ['read'] } } },
})
