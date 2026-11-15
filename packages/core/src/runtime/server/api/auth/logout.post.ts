// Signing out:
//   POST  /api/_atelier/auth/logout   ends this session on the server and clears its cookie
import { defineEventHandler } from 'nuxt/server'
import { audit, useAtelierAuth } from '../../index'

export default defineEventHandler(async (event) => {
  const auth = await useAtelierAuth()
  const user = await auth.getUser(event)
  await auth.signOut(event)
  if (user)
    await audit(event, { action: 'auth.sign-out', actorId: user.id, target: { type: 'user', id: user.id } })
  return { ok: true }
})
