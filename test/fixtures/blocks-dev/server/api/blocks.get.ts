import { useAtelierSchema } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: the block schemas the server validates with
export default defineEventHandler(async () => (await useAtelierSchema()).blocks)
