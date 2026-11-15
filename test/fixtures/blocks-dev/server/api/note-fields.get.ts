import { useAtelierSchema } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: the fields the server knows notes by
export default defineEventHandler(async () => Object.keys((await useAtelierSchema()).collections.notes!.fields))
