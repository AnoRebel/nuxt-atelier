import { defineEventHandler } from 'nuxt/server'
import { sent } from '../../plugins/ai'

// Test probe: what the fake provider was sent (DELETE empties it)
export default defineEventHandler((event) => {
  if (event.req.method === 'DELETE')
    sent.length = 0
  return sent.map(r => ({ system: r.system, prompt: r.prompt, images: r.images?.length ?? 0 }))
})
