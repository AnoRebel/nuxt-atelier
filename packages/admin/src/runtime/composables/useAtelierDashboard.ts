// The admin home's data (GET /api/_atelier/dashboard): the user's drafts, upcoming schedules and, for
// administrators, recent activity, failed jobs (with retry) and pending migrations.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { atelierFetch } from './useAtelierAdmin'

export interface Dashboard {
  drafts: { type: string, id: string, version: number, publishedVersion: number | null, updatedAt: string, data: Record<string, unknown> }[]
  scheduled: { type: string, id: string, singleton: boolean, action: 'publish' | 'unpublish', version?: number, runAt: string }[]
  activity?: { id: string, at: string, action: string, actorId: string | null, target?: { type: string, id: string } | null }[]
  failedJobs?: { id: string, name: string, lastError: string | null, attempts: number, runAt: string }[]
  pendingMigrations?: number
}

export function useAtelierDashboard() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['atelier', 'dashboard'], queryFn: () => atelierFetch<Dashboard>('/dashboard') })
  return {
    dashboard: computed(() => query.data.value),
    loading: query.isPending,
    /** Queues a failed job again. */
    retry: useMutation({
      mutationFn: (id: string) => atelierFetch(`/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
      onSuccess: () => client.invalidateQueries({ queryKey: ['atelier', 'dashboard'] }),
    }),
  }
}
