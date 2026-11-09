import { useAtelierJobs } from '#atelier/server'
import { defineEventHandler, readBody } from 'nuxt/server'

// Test probe: POST { notes: string[], ms } enqueues a test:note job per note; GET lists the notes of jobs that ran
export default defineEventHandler(async (event) => {
  if (event.req.method === 'GET')
    return (globalThis as { __atelierJobNotes?: string[] }).__atelierJobNotes ?? []
  const { notes, ms } = await readBody<{ notes: string[], ms?: number }>(event)
  const jobs = await useAtelierJobs()
  return Promise.all(notes.map(note => jobs.enqueue('test:note', { note, ms })))
})
