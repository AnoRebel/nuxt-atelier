//   GET  /api/_atelier/auth/providers   { providers }: sign-in options besides email and password
import { defineEventHandler } from 'nuxt/server'
import { useAtelierAuth } from '../../index'

/** Sign-in options besides email and password (the auth adapter's OAuth providers), for the sign-in screen. */
export default defineEventHandler(async () => ({ providers: (await useAtelierAuth()).oauthProviders?.() ?? [] }))
