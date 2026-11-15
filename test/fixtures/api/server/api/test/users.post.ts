import { assertMigrated, useAtelierAuth } from '#atelier/server'
import { defineEventHandler, readBody } from 'nuxt/server'

// Test probe: creates a user (first-run setup comes later)
export default defineEventHandler(async (event) => {
  await assertMigrated() // the tables exist: the server applies migrations as it starts
  return (await useAtelierAuth()).users.create(await readBody(event))
})
