import { defineEventHandler } from 'nuxt/server'
import { apiError } from '../errors'

// Unmatched CMS API paths answer 404 as JSON, instead of falling through to the page renderer
export default defineEventHandler(() => {
  throw apiError(404, 'Not found')
})
