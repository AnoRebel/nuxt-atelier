//   GET  /api/_atelier/auth/me   { user }: the signed-in user, or null
import { defineEventHandler } from 'nuxt/server'
import { useAtelierAuth } from '../../index'

/** The signed-in user, or null. */
export default defineEventHandler(async event => ({ user: await (await useAtelierAuth()).getUser(event) }))
