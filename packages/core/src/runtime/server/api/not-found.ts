import { createError, defineEventHandler } from 'nuxt/server'

// Unmatched CMS API paths answer 404 as JSON, instead of falling through to the page renderer
export default defineEventHandler(() => {
  throw createError({ status: 404, message: 'Not found' })
})
