import { defineEventHandler } from 'nuxt/server'
import { useAtelierAuth } from '../../index'

export default defineEventHandler(async (event) => {
  await (await useAtelierAuth()).signOut(event)
  return { ok: true }
})
