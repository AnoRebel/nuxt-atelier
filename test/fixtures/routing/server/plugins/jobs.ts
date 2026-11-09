import { defineJob } from '#atelier/server'

// Test probe: a job that notes it ran (after `ms`), read at /api/test/jobs
const notes: string[] = ((globalThis as { __atelierJobNotes?: string[] }).__atelierJobNotes ??= [])

export default () => {
  defineJob<{ note: string, ms?: number }>('test:note', async ({ note, ms = 0 }) => {
    await new Promise(resolve => setTimeout(resolve, ms))
    notes.push(note)
  })
}
