import { useAtelierSchema } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: the block types the app has, the plugin's included
export default defineEventHandler(async () => Object.keys((await useAtelierSchema()).blocks ?? {}))
