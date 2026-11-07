import * as v from 'valibot'
import { defineEventHandler, readValidatedBody } from 'nuxt/server'
import { assertMigrated, useAtelierAuth } from '../../index'

const Credentials = v.object({ email: v.pipe(v.string(), v.maxLength(255)), password: v.pipe(v.string(), v.maxLength(1024)) })

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const credentials = await readValidatedBody(event, Credentials)
  return (await useAtelierAuth()).signIn(event, credentials)
})
