import { defineEventHandler } from 'nuxt/server'
import { apiError } from '../errors'

// Unmatched CMS API paths answer 404 as JSON, instead of falling through to the page renderer
//   ANY  /api/_atelier/**   404, as JSON, for any path no other endpoint serves
export default defineEventHandler(() => {
  throw apiError(404, 'Not found')
})
