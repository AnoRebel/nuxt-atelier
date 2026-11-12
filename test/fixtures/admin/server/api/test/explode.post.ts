import { useAtelierJobs } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: queues the failing job with one attempt and runs the queue, so it ends up failed
export default defineEventHandler(async () => {
  const jobs = await useAtelierJobs()
  await jobs.enqueue('test:explode', {}, { maxAttempts: 1 })
  return jobs.run()
})
