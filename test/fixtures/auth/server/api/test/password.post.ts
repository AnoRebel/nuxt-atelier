import { assertMigrated, useAtelierAuth } from '#atelier/server'
import { defineEventHandler, readBody } from 'nuxt/server'

// Test probe: a password reset
export default defineEventHandler(async (event) => {
  await assertMigrated() // the tables exist: the server applies migrations as it starts
  const { id, password } = await readBody<{ id: string, password: string }>(event)
  return (await useAtelierAuth()).users.update(id, { password })
})
