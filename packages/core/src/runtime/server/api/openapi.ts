// The content API's OpenAPI 3.1 description, for administrators
import { defineEventHandler } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { apiError } from '../errors'
import { requireUser, useAtelierSchema } from '../index'
import { openApiDocument } from '../openapi'

export default defineEventHandler(async (event) => {
  if ((await requireUser(event)).role !== ADMIN_ROLE)
    throw apiError(403, 'Only administrators can read the API description')
  return openApiDocument(await useAtelierSchema())
})
