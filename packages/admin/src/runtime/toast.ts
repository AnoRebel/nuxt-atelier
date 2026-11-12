// Toasts: `useAdminToast().add({ title, description, color })`, shown by the kit's Toaster.
import { reactive } from 'vue'

export interface ToastInput {
  title: string
  description?: string
  color?: 'success' | 'error' | 'warning' | 'info'
  /** Milliseconds before it hides; 0 keeps it until dismissed. */
  duration?: number
}
export interface ToastItem extends ToastInput { id: number }

export const toasts = reactive<ToastItem[]>([])
let next = 1

export function useAdminToast() {
  return {
    add(input: ToastInput): number {
      const id = next++
      toasts.push({ id, ...input })
      if (toasts.length > 5)
        toasts.splice(0, toasts.length - 5)
      return id
    },
    remove(id: number) {
      const i = toasts.findIndex(t => t.id === id)
      if (i >= 0)
        toasts.splice(i, 1)
    },
  }
}
