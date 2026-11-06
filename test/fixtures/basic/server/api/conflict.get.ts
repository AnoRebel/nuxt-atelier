import { ConflictError, toHttpError } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: a save that lost the race
export default defineEventHandler(() => {
  throw toHttpError(new ConflictError(3))
})
